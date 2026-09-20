const fs = require('fs');

/**
 * #1929: the SSoT for the self-reported `Scope:` label grammar, imported —
 * not re-derived.
 *
 * This file is a standalone CommonJS `actions/github-script` runner, but
 * `require()` of an ESM module is stable from Node 22.12 and this step runs on
 * `actions/github-script@v8` (node24), so the ESM SSoT in `src/lib/` can be
 * called directly instead of mirroring its regex here. `../..` is the same
 * repo-root hop the action already depends on in production (`action.yml`
 * sets `RIVER_REPO_ROOT: ${{ github.action_path }}/../..`, and the release
 * tarball carries `src/lib/`).
 *
 * The load works without `node_modules` because `finding-factory.mjs` reaches
 * only `node:crypto` and `./scoring/breakdown.mjs`. That property is not
 * self-evident from here, so it is pinned by
 * `tests/action-esm-require-canary.test.mjs` — an npm dependency or a
 * top-level `await` anywhere in that graph would break this require on the
 * user's runner while CI (which has `node_modules`) stayed green.
 *
 * RUNTIME PRECONDITION: the step that loads this file must stay on
 * `actions/github-script@v8` or newer. The action's runtime is set by that
 * version — v7 declares `using: node20` and v8 declares `using: node24` — and
 * `require(ESM)` is only available from Node 22.12. **Downgrading the `uses:`
 * pin in `action.yml` breaks this line on the user's runner while CI stays
 * green.** The same canary above asserts the version, so a downgrade fails
 * there first; if it did, this paragraph is why. Reverting the pin means
 * reverting this require to a CommonJS implementation as well.
 */
const { stripSelfReportedScope } = require('../../src/lib/finding-factory.mjs');

/**
 * #2323: the canonical PR-comment marker, shared with post-comment.cjs.
 *
 * `pages/reference/stable-interfaces.md` (ja / en) declares
 * `<!-- river-review -->` as the PR comment contract. The legacy spelling is
 * still accepted when searching for an existing summary comment, so a comment
 * written by an earlier release is updated in place rather than duplicated.
 */
const COMMENT_MARKER = '<!-- river-review -->';
const LEGACY_COMMENT_MARKER = '<!-- river-reviewer -->';
const SEVERITY_EMOJI = { critical: '🔴', major: '🟠', minor: '🟡', info: 'ℹ️' };
const MAX_INLINE_BODY = 65000;
// GitHub rejects an issue comment body over 65536 characters. The summary is a
// single comment, so the pre-existing block below has to fit inside the same
// budget as everything else the summary already carries.
const MAX_SUMMARY_BODY = 65000;
// Appended by the hard-truncation fallback when the cut lands inside the
// pre-existing `<details>` block, so the notice that follows stays outside it.
const CLOSE_DETAILS = '\n\n</details>';

/**
 * #1644: the scope value that this surface treats as "not this PR's work".
 *
 * Only the exact string is demoted. Absent, null, and any out-of-vocabulary
 * value keep the in-diff treatment, which is the fail-safe direction: the
 * schema declares `in-diff` as the default reading (DEFAULT_FINDING_SCOPE in
 * src/lib/finding-factory.mjs), and an artifact produced before the field
 * existed carries no scope at all. Demoting on anything other than an explicit
 * `pre-existing` would hide findings that were never classified.
 */
const PRE_EXISTING_SCOPE = 'pre-existing';

/** @returns {boolean} true only for an explicit `pre-existing` self-report. */
function isPreExisting(issue) {
  return issue?.scope === PRE_EXISTING_SCOPE;
}

/**
 * Prevent free-form finding text from closing the `<details>` block it is
 * rendered inside. Mirrors `neutralizeDetailsMarkup` in src/cli/render.mjs;
 * this file is a standalone CommonJS `actions/github-script` runner and cannot
 * import ESM from `src/`.
 */
function neutralizeDetailsMarkup(text) {
  return String(text ?? '').replace(/<(\/?)(details|summary)\b/gi, '&lt;$1$2');
}

/**
 * #1644: mark `pre-existing` only, never `in-diff`.
 *
 * Same asymmetry as `formatScopeMarkerMarkdown` in src/cli/render.mjs —
 * `in-diff` is the default and the fail-safe, so marking it would badge every
 * line of the PR comment while distinguishing nothing.
 */
function formatScopeMarker(scope) {
  return scope === PRE_EXISTING_SCOPE ? ' _(pre-existing)_' : '';
}

/**
 * #1929: the message body as this surface should show it.
 *
 * Same rule as `bodyForMarkdown` (src/cli/render.mjs) and the HTML formatter:
 * once a finding carries a resolved `scope`, the verifier's verdict outranks
 * the reviewer's self-reported `Scope:` label, and the summary already draws
 * the resolved value (`formatScopeMarker`, the pre-existing `<details>`
 * heading). Rendering both would put two opposite scopes on one finding.
 *
 * The `issue.scope ?` guard is deliberate and matches the two ESM surfaces: on
 * a legacy artifact that predates the `scope` field the self-report is the
 * only scope information there is, so stripping it would delete information
 * rather than de-duplicate it. The Action summary is a display surface, not
 * the audit copy — the raw JSON is echoed to the job log (`action.yml`'s
 * `cat "${json_out}"`) and exported as the `json_path` output — so it follows
 * the markdown/HTML rule rather than the YAML formatter's keep-verbatim rule.
 *
 * @param {object} issue
 * @returns {string} body text, or an empty string when there is none
 */
function bodyMessage(issue) {
  if (!issue?.message) return '';
  return issue.scope ? stripSelfReportedScope(issue.message) : issue.message;
}

/** `file:line` rendered as inline code, or an empty string when unlocated. */
function formatLocation(issue) {
  if (!issue.file) return '';
  return issue.line ? ` \`${issue.file}:${issue.line}\`` : ` \`${issue.file}\``;
}

/**
 * Format a finding body for an inline review comment or for the summary.
 *
 * @param {object} issue
 * @param {object} [options]
 * @param {string} [options.suggestionFence] fence info string for the fix
 *   block. `suggestion` renders GitHub's applicable suggestion widget, which
 *   only works on a review comment; the summary passes an empty string so the
 *   same text renders as a plain code block instead of a dead widget.
 * @param {boolean} [options.includeLocation] append `file:line` to the heading.
 *   Inline comments are already anchored to a line, so only the summary needs
 *   it.
 */
function formatFindingBody(
  issue,
  { suggestionFence = 'suggestion', includeLocation = false } = {}
) {
  const emoji = SEVERITY_EMOJI[issue.severity] || '🔵';
  const consensusBadge =
    issue.consensusLevel === 'consensus' ? ' ★★★' : issue.consensusLevel === 'multi' ? ' ★★' : '';
  const location = includeLocation ? formatLocation(issue) : '';
  const lines = [`${emoji} **[${issue.severity}]**${consensusBadge} ${issue.title}${location}`];

  const message = bodyMessage(issue);
  if (message && message !== issue.title) {
    lines.push('', message);
  }

  if (Array.isArray(issue.evidence) && issue.evidence.length > 0) {
    lines.push('', `**Evidence:** ${issue.evidence.join('; ')}`);
  }

  if (issue.suggestion) {
    lines.push('', '**Suggested fix:**', '```' + suggestionFence, issue.suggestion, '```');
  }

  return lines.join('\n');
}

/** Body of an inline review comment. Unchanged for `in-diff` findings. */
function formatInlineBody(issue) {
  return formatFindingBody(issue);
}

/**
 * #1644: the collapsed block that carries every `pre-existing` finding.
 *
 * These findings are deliberately not posted inline (see the partition in
 * `postInlineComments`), so this block is their only surface — it therefore
 * renders the FULL body (message, evidence, suggested fix), not a pointer
 * line. `compact` is the size-pressure fallback only.
 *
 * @param {object[]} issues
 * @param {boolean} compact one line per finding instead of the full body
 * @returns {string[]} lines to append to the summary (empty when there are none)
 */
function formatPreExistingSection(issues, compact) {
  if (issues.length === 0) return [];

  const label = `🔍 ${issues.length} pre-existing finding${issues.length === 1 ? '' : 's'} — outside this diff's added lines`;
  const body = [];
  for (const issue of issues) {
    if (compact) {
      const emoji = SEVERITY_EMOJI[issue.severity] || '🔵';
      body.push(`- ${emoji} **${issue.title}**${formatLocation(issue)}`);
    } else {
      body.push(formatFindingBody(issue, { suggestionFence: '', includeLocation: true }), '');
    }
  }

  return [
    '',
    '<details>',
    `<summary>${label}</summary>`,
    '',
    neutralizeDetailsMarkup(body.join('\n').trimEnd()),
    '',
    '</details>',
  ];
}

/**
 * Format a markdown summary from JSON findings for the top-level PR comment.
 * @param {object} data - original full JSON output (used for summary.issueCountBySeverity)
 * @param {number} inlinePostedCount - number of findings successfully posted as inline comments
 * @param {object[]} remainingIssues - in-diff issues to list in the summary (unlocated + inline-failed)
 * @param {object[]} preExistingIssues - `pre-existing` issues, folded into a `<details>` block
 * @param {boolean} [compactPreExisting] - render the folded block as pointer lines (size fallback)
 */
function formatSummaryFromJson(
  data,
  inlinePostedCount,
  remainingIssues,
  preExistingIssues = [],
  compactPreExisting = false
) {
  const summary = data.summary ?? {};
  const counts = summary.issueCountBySeverity ?? {};

  const lines = [COMMENT_MARKER, '## River Reviewer', ''];

  // #1915: the "nothing to report" decision is made from the findings this
  // function was HANDED, not from the artifact's self-declared counts.
  //
  // `counts` is read from the artifact's own `summary.issueCountBySeverity`,
  // NOT derived from `issues`, so the two can disagree — a zero count next to a
  // non-empty issue list, or a missing `summary` key entirely. #1644 widened the
  // guard once (adding `preExistingIssues.length === 0`), but a count-first
  // condition needs a new clause for every bucket that exists, and it silently
  // lost the next one: an in-diff finding with no `file` / `line` is withheld
  // from inline by design (`unlocatedIssues`) and was then cut off from the
  // summary by this return, so it reached no surface at all.
  //
  // Every issue lands in exactly one of three buckets — posted inline,
  // `remainingIssues` (unlocated + inline-failed), or `preExistingIssues` — so
  // their sum IS the artifact's issue list as this function sees it. Deciding
  // from that sum needs no further clause when a new bucket is introduced,
  // because a new bucket must be carved out of one of these three.
  const countedTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const inDiffOnHand = inlinePostedCount + remainingIssues.length;
  if (countedTotal === 0 && inDiffOnHand === 0 && preExistingIssues.length === 0) {
    lines.push('✅ No issues found.');
    return lines.join('\n');
  }

  // The headline count still prefers the artifact's own severity breakdown —
  // it is the only source that can describe findings this function never
  // received. It falls back to the entity count so a missing or all-zero
  // `summary` cannot headline a non-empty report with "0".
  const total = countedTotal > 0 ? countedTotal : inDiffOnHand;
  if (total === 0) {
    // Do not claim "No issues found" above a block that lists findings. What
    // is actually true in this state is narrower: nothing is reported on the
    // added lines, while pre-existing findings remain. The folded block's own
    // summary line carries their count.
    lines.push("✅ No findings on this diff's added lines.", '');
  } else {
    const countParts = [];
    if (counts.critical > 0) countParts.push(`🔴 ${counts.critical} critical`);
    if (counts.major > 0) countParts.push(`🟠 ${counts.major} major`);
    if (counts.minor > 0) countParts.push(`🟡 ${counts.minor} minor`);
    if (counts.info > 0) countParts.push(`ℹ️ ${counts.info} info`);
    // With an absent or all-zero `summary` there is no breakdown to show, and
    // an empty `countParts` would leave a dangling `— `.
    lines.push(
      countParts.length > 0
        ? `**${total} finding${total === 1 ? '' : 's'}** — ${countParts.join(', ')}`
        : `**${total} finding${total === 1 ? '' : 's'}**`
    );
    lines.push('');
  }

  if (inlinePostedCount > 0) {
    lines.push(
      `_Successfully posted ${inlinePostedCount} inline review comment${inlinePostedCount === 1 ? '' : 's'}._`
    );
    lines.push('');
  }

  if (remainingIssues.length > 0) {
    lines.push('### Findings not posted inline', '');
    for (const issue of remainingIssues) {
      const emoji = SEVERITY_EMOJI[issue.severity] || '🔵';
      lines.push(`- ${emoji} **${issue.title}**${issue.file ? ` (${issue.file})` : ''}`);
      const message = bodyMessage(issue);
      if (message && message !== issue.title) {
        lines.push(`  ${message}`);
      }
    }
  }

  // #1644: the pre-existing block sits below the in-diff list on purpose — the
  // reader should reach this PR's own findings first.
  lines.push(...formatPreExistingSection(preExistingIssues, compactPreExisting));

  if (summary.riskSummary?.aggregateAction) {
    lines.push('', `**Risk:** ${summary.riskSummary.aggregateAction}`);
  }

  const tlr = data.teamLeadReport;
  if (tlr) {
    if (tlr.top3Findings?.length > 0) {
      lines.push('', '### 優先確認の指摘');
      for (const f of tlr.top3Findings) {
        const sev = SEVERITY_EMOJI[f.severity] || '🔵';
        const cl =
          f.consensusLevel === 'consensus' ? ' ★★★' : f.consensusLevel === 'multi' ? ' ★★' : '';
        lines.push(
          `- ${sev}${cl} **${f.title}**${f.file ? ` (${f.file})` : ''}${formatScopeMarker(f.scope)}`
        );
      }
    }
    if (tlr.blindSpots?.length > 0) {
      const labels = tlr.blindSpots.map((b) => b.label).join(', ');
      lines.push('', `_未実行のレビュー観点: ${labels}_`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the summary body under GitHub's comment size limit.
 *
 * Full pre-existing bodies are preferred; only when the comment would be
 * rejected does it degrade to pointer lines, and only then to a hard truncation
 * that says so.
 */
function buildSummaryBody(data, inlinePostedCount, remainingIssues, preExistingIssues) {
  const full = formatSummaryFromJson(data, inlinePostedCount, remainingIssues, preExistingIssues);
  if (full.length <= MAX_SUMMARY_BODY) return full;

  const compact = formatSummaryFromJson(
    data,
    inlinePostedCount,
    remainingIssues,
    preExistingIssues,
    true
  );
  if (compact.length <= MAX_SUMMARY_BODY) return compact;

  // A raw slice can cut the body open inside the `<details>` block, which
  // swallows the truncation notice into the collapsed region — the reader would
  // have to expand a block to learn that it is incomplete. Reserve room for the
  // closing tag, then close and annotate.
  const notice = '\n\n_Summary truncated to fit GitHub’s comment size limit._';
  const budget = MAX_SUMMARY_BODY - notice.length - CLOSE_DETAILS.length;
  let cut = compact.slice(0, budget);

  // `slice` counts UTF-16 units, so a cut can land between the two halves of an
  // emoji and leave a lone surrogate. Only a trailing HIGH surrogate can be
  // orphaned this way: a low surrogate at the end implies its high partner sits
  // one unit earlier and was kept. Rounding back to the last newline instead
  // would look tidier but can discard nearly the whole comment when one finding
  // carries a title longer than the budget.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);

  // This formatter opens at most one `<details>` block (the pre-existing one),
  // so presence-without-close is the whole condition.
  const needsClose = cut.includes('<details>') && !cut.includes('</details>');
  const closing = needsClose ? CLOSE_DETAILS : '';
  return cut + closing + notice;
}

module.exports = async function postInlineComments({ github, context, core }) {
  const jsonPath = process.env.RIVER_REVIEWER_JSON_PATH;
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    core.setFailed('River Reviewer JSON output file not found; cannot post inline comments.');
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    core.setFailed(`Failed to parse River Reviewer JSON: ${err.message}`);
    return;
  }

  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    core.setFailed('pull_request payload not found; cannot post inline comments.');
    return;
  }

  const { owner, repo } = context.repo;
  const commitId = context.payload.pull_request.head.sha;
  const issues = data.issues ?? [];

  // #1644: `pre-existing` findings never become inline comments.
  //
  // An inline comment is the strongest call to action this action has — it
  // lands as a review comment on a line, with an applicable suggestion block.
  // Aiming that at code the PR did not introduce is exactly the over-response
  // the issue is about. They are not dropped: every one of them is rendered in
  // full inside the summary's collapsed block, so the information survives one
  // click away instead of demanding a change.
  const inDiffIssues = issues.filter((i) => !isPreExisting(i));
  const preExistingIssues = issues.filter(isPreExisting);

  // Separate findings with and without file+line info
  const locatedIssues = inDiffIssues.filter((i) => i.file && i.line);
  const unlocatedIssues = inDiffIssues.filter((i) => !i.file || !i.line);

  core.info(
    `Findings: ${issues.length} total, ${locatedIssues.length} with line info, ` +
      `${preExistingIssues.length} pre-existing (summary only)`
  );

  // Post inline review comments for located findings
  let inlinePosted = 0;
  let inlineFailed = 0;
  const inlineFailedIssues = [];

  // Filter out oversized comments up front
  const fittingIssues = [];
  for (const issue of locatedIssues) {
    const body = formatInlineBody(issue);
    if (body.length > MAX_INLINE_BODY) {
      core.warning(`Skipping inline comment for ${issue.file}:${issue.line} — body too long`);
      inlineFailedIssues.push(issue);
      inlineFailed++;
    } else {
      fittingIssues.push({ issue, body });
    }
  }

  // Attempt a single batched review (1 API call instead of N)
  let batchSucceeded = false;
  if (fittingIssues.length > 0) {
    try {
      await github.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        event: 'COMMENT',
        comments: fittingIssues.map(({ issue, body }) => ({
          path: issue.file,
          line: issue.line,
          side: 'RIGHT',
          body,
        })),
      });
      inlinePosted = fittingIssues.length;
      batchSucceeded = true;
      core.info(`Batch review posted ${inlinePosted} inline comment(s) in 1 API call.`);
    } catch (err) {
      // Batch failed (e.g. a line is outside the diff) — fall back to per-comment posting
      core.warning(`Batch review failed (${err.message}); falling back to per-comment posting.`);
    }
  }

  // Fallback: post comments individually so we can skip invalid lines
  if (!batchSucceeded) {
    for (const { issue, body } of fittingIssues) {
      try {
        await github.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          commit_id: commitId,
          path: issue.file,
          line: issue.line,
          side: 'RIGHT',
          body,
        });
        inlinePosted++;
      } catch (err) {
        core.warning(
          `Could not post inline comment for ${issue.file}:${issue.line}: ${err.message}`
        );
        inlineFailedIssues.push(issue);
        inlineFailed++;
      }
    }
  }

  core.info(
    `Inline comments: ${inlinePosted} posted, ${inlineFailed} failed (will appear in summary)`
  );

  // Build summary: findings without location + inline failures
  const remainingIssues = [...unlocatedIssues, ...inlineFailedIssues];
  const summaryBody = buildSummaryBody(data, inlinePosted, remainingIssues, preExistingIssues);

  // Post or update top-level summary comment
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c) =>
      typeof c.body === 'string' &&
      (c.body.includes(COMMENT_MARKER) || c.body.includes(LEGACY_COMMENT_MARKER))
  );

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: summaryBody,
    });
    core.info(`Updated existing River Reviewer summary comment (${existing.id}).`);
  } else {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: summaryBody,
    });
    core.info('Created new River Reviewer summary comment.');
  }
};

// Exposed for tests only; the action entry point is the default export above.
module.exports.MAX_SUMMARY_BODY = MAX_SUMMARY_BODY;

module.exports.COMMENT_MARKER = COMMENT_MARKER;
module.exports.LEGACY_COMMENT_MARKER = LEGACY_COMMENT_MARKER;
