// Shared CLI render / output helpers.
//
// Extracted verbatim from src/cli.mjs as part of the CLI dispatch refactor
// (split main() into per-subcommand handlers). These helpers are shared by the
// `doctor` and default `run` handlers and by cli.mjs itself, so they live in a
// standalone module to avoid a circular import between cli.mjs and the command
// handlers. Behavior, messages, and exit codes are unchanged; only the enclosing
// module and the relative import depth differ from the original inline code.
import { readFileSync } from 'node:fs';
import {
  normalizeSeverity,
  RESERVED_FINDING_LABELS,
  SEVERITY_RANK,
  severityToPriority,
  stripSelfReportedScope,
} from '../lib/finding-factory.mjs';
import { resolveVerdict, scoreReview } from '../lib/scoring/engine.mjs';
import { AXES, AXIS_LABELS_JA } from '../lib/scoring/rubric.mjs';
import { deriveRunGate } from '../lib/run-gate.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const MAX_PROMPT_PREVIEW_LENGTH = 800;
const MAX_RAW_LLM_OUTPUT_PREVIEW_LENGTH = 1500;
export const MAX_DIFF_PREVIEW_LINES = 200;
const COMMENT_MARKER = '<!-- river-review -->';

/**
 * #1713: severity vocabulary for the human-facing markdown digest.
 *
 * The label set and their ordering are NOT redefined here — they are derived
 * from `SEVERITY_RANK` (the severity SSoT in finding-factory), so this module
 * cannot drift into a second ordering. Only the emoji are local.
 *
 * The same emoji mapping also exists in
 * `runners/github-action/post-inline-comments.cjs`, which is a standalone
 * `actions/github-script` runner: it is CommonJS, is not bundled by
 * `npm run build:action`, and cannot import ESM from `src/`. Sharing one
 * constant across that boundary is a separate change (see #1713 follow-ups).
 */
const SEVERITY_EMOJI = { critical: '🔴', major: '🟠', minor: '🟡', info: 'ℹ️' };
const SEVERITY_ORDER = Object.keys(SEVERITY_RANK).sort(
  (a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a]
);
/**
 * Progressive-disclosure boundary: `major` and above (= P1 / P2 via
 * `severityToPriority`) stay expanded; `minor` / `info` are folded into a
 * `<details>` block. Nothing is dropped or truncated — folding is not hiding.
 */
const EXPAND_FROM_RANK = SEVERITY_RANK.major;

export function printHintLines(lines = []) {
  const hints = lines.filter(Boolean);
  if (!hints.length) return;
  console.error('\nHints:');
  hints.forEach((line) => console.error(`- ${line}`));
}

function formatPlan(plan) {
  // Defensive defaults: a plan may arrive without selected/skipped (e.g. an
  // empty `{}` from `--explain` when no plan was computed). Never throw.
  const selected = (plan?.selected ?? []).map((skill) => skill.metadata?.id ?? skill.id);
  const skipped = (plan?.skipped ?? []).map((item) => ({
    id: item.skill?.metadata?.id ?? item.skill?.id,
    reasons: item.reasons ?? [],
  }));
  const reasonCounts = skipped.reduce((acc, item) => {
    (item.reasons || []).forEach((reason) => {
      acc.set(reason, (acc.get(reason) ?? 0) + 1);
    });
    return acc;
  }, new Map());
  return { selected, skipped, reasonCounts };
}

export function printPlan(plan) {
  const summary = formatPlan(plan);
  if (summary.selected.length) {
    console.log(`Selected skills (${summary.selected.length}): ${summary.selected.join(', ')}`);
  } else {
    console.log('Selected skills (0): none matched this diff');
  }
  if (summary.skipped.length) {
    console.log('Skipped skills:');
    summary.skipped.forEach((item) => {
      console.log(`- ${item.id}: ${item.reasons.join('; ')}`);
    });
    if (summary.reasonCounts.size) {
      console.log('Skip reasons summary:');
      for (const [reason, count] of summary.reasonCounts.entries()) {
        console.log(`- ${reason}: ${count}`);
      }
    }
  }
}

export function printComments(comments) {
  if (!comments.length) {
    console.log('No review comments generated.');
    return;
  }
  console.log('Review comments:');
  comments.forEach((comment) => {
    console.log(`- ${comment.file}:${comment.line}: ${comment.message}`);
  });
}

function formatMessageForMarkdown(message) {
  // #1666: import the label set instead of re-listing it here. The local copy
  // had drifted — `Suggestion`, `Scope`, and the traceability refs were never
  // broken onto their own bullet, so they ran into the preceding field.
  const labels = RESERVED_FINDING_LABELS;
  let result = message;
  for (const label of labels) {
    result = result.replace(new RegExp(`\\s*${label}:`, 'g'), `\n  - **${label}:**`);
  }
  return result;
}

function groupCommentsBySkill(entries) {
  return (entries ?? []).reduce((groups, entry) => {
    const key = entry.comment.skillId || '';
    (groups[key] = groups[key] || []).push(entry);
    return groups;
  }, {});
}

/**
 * Markdown インジェクション対策: 特殊文字をエスケープ
 */
function sanitizeForMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&')
    .replace(/\n/g, ' ');
}

/**
 * #1644: markdown marks `pre-existing` only, unlike JSON / YAML / HTML which
 * emit whichever value the finding carries.
 *
 * The asymmetry is deliberate. `in-diff` is both the default and the fail-safe
 * for a missing or unknown value (DEFAULT_FINDING_SCOPE in
 * src/lib/finding-factory.mjs), so every engine-produced finding carries a
 * scope and marking both values would put a badge on every line of the PR
 * comment while distinguishing nothing. The consumer need this issue describes
 * is the opposite one: spotting the findings that should NOT drive changes in
 * this PR. Marking only the non-default value serves that with no added noise.
 * The structured surfaces keep both values because a machine reader cannot tell
 * "absent because in-diff" from "absent because the producer predates the
 * field".
 */
function formatScopeMarkerMarkdown(scope) {
  return scope === 'pre-existing' ? ' _(pre-existing)_' : '';
}

/**
 * #1915 A: the resolved `scope` is the only scope this line may state.
 *
 * `comment.scope` is the verifier's verdict and the mark above is drawn from
 * it, while `comment.message` still carries the reviewer's self-reported
 * `Scope:` label — which the verifier is allowed to overrule. Rendering both
 * put `_(pre-existing)_` and `**Scope:** in-diff` inside one bullet. The
 * resolved value wins, so the self-report is dropped from the body; when the
 * finding carries no resolved scope the self-report is the only scope
 * information available and is left in place.
 */
function bodyForMarkdown(comment) {
  return comment.scope ? stripSelfReportedScope(comment.message) : comment.message;
}

function formatCommentLine(entry) {
  const comment = entry.comment ?? entry;
  return `- \`${neutralizeDetailsMarkup(comment.file)}:${comment.line}\`${formatScopeMarkerMarkdown(
    comment.scope
  )}${neutralizeDetailsMarkup(formatMessageForMarkdown(bodyForMarkdown(comment)))}`;
}

/**
 * #1713: render finding entries, grouped by skill.
 *
 * Entries are `{ comment, severity }` (F1: severity comes from the single
 * rendered set, never re-derived here). Ordering is severity-first so the
 * section body matches its own heading — the group with the highest severity
 * comes first, and inside a group the highest severity comes first. `skillId`
 * is the tie-break so the output stays deterministic (F4).
 *
 * @param {Array<{comment: object, severity: string}>} entries
 * @returns {string}
 */
function formatCommentsMarkdown(entries) {
  if (!entries?.length) return '_No findings._';

  const bySeverityDesc = (a, b) =>
    (SEVERITY_RANK[b.severity] ?? EXPAND_FROM_RANK) -
    (SEVERITY_RANK[a.severity] ?? EXPAND_FROM_RANK);

  // スキル単位でグループ化
  const bySkill = groupCommentsBySkill(entries);
  const groups = Object.entries(bySkill);

  // スキルIDがないグループのみの場合は従来形式
  if (groups.length === 1 && groups[0][0] === '') {
    return [...entries].sort(bySeverityDesc).map(formatCommentLine).join('\n');
  }

  const maxRank = (items) =>
    items.reduce(
      (rank, item) => Math.max(rank, SEVERITY_RANK[item.severity] ?? EXPAND_FROM_RANK),
      -1
    );

  // severity 降順 → skillId 昇順で出力順序を安定化
  groups.sort((a, b) => maxRank(b[1]) - maxRank(a[1]) || a[0].localeCompare(b[0]));

  // スキル単位でセクション化
  return groups
    .map(([skillId, items]) => {
      // skillId をサニタイズして Markdown インジェクションを防止
      const safeSkillId = sanitizeForMarkdown(skillId);
      const header = skillId ? `#### 🔍 ${safeSkillId}` : '#### その他';
      const body = [...items].sort(bySeverityDesc).map(formatCommentLine).join('\n');
      return `${header}\n${body}`;
    })
    .join('\n\n');
}

/**
 * #1713 (F2): neutralize `<details>` / `<summary>` markup in free-form text so
 * it cannot restructure the report.
 *
 * BOTH directions matter. A closing tag lets folded text escape the block it
 * sits in; an OPENING tag is worse — every following section sinks one level
 * deeper and the document ends with an unclosed block, so the rest of the
 * report silently disappears behind a collapsed triangle. Applied at the text
 * boundaries (finding message, file path, top3 pointer) rather than only at the
 * `<details>` wrapper, because the expanded 要対応 section and the Tech Lead
 * digest never pass through that wrapper.
 *
 * Only `<` is escaped, so the text is preserved in full — nothing is deleted or
 * truncated. A code span may show it as the literal `&lt;details>` rather than
 * decoding the entity; finding bodies must not carry raw HTML in the first
 * place (review-policy §2.5).
 *
 * @param {string} text
 * @returns {string}
 */
function neutralizeDetailsMarkup(text) {
  return String(text ?? '').replace(/<(\/?)(details|summary)\b/gi, '&lt;$1$2');
}

/**
 * #1713: wrap a body in a collapsible `<details>` block.
 *
 * The blank line after `</summary>` is load-bearing: GitHub only renders the
 * markdown inside a details block when it is separated from the summary by an
 * empty line. `summary` must always carry a count so the reader can decide
 * whether to expand without expanding.
 *
 * @param {string} summary summary label, including a count
 * @param {string} body full markdown body (never truncated)
 * @returns {string}
 */
function wrapInDetails(summary, body) {
  // Defense in depth: the free-form text inside `body` was already neutralized
  // at its own boundary (formatCommentLine / the top3 pointer), so this pass is
  // a no-op for it and only covers repo-controlled strings such as skill ids.
  return `<details>\n<summary>${summary}</summary>\n\n${neutralizeDetailsMarkup(body)}\n\n</details>\n`;
}

/**
 * #1713: `**🔴 1 / 🟠 3**`-style breakdown, highest severity first. Severities
 * with a zero count are omitted so a clean run does not print four zeroes.
 *
 * @param {Record<string, number>} countsBySeverity
 * @returns {string}
 */
function formatSeverityBreakdown(countsBySeverity) {
  return SEVERITY_ORDER.filter((severity) => (countsBySeverity[severity] ?? 0) > 0)
    .map((severity) => `${SEVERITY_EMOJI[severity]} ${countsBySeverity[severity]}`)
    .join(' / ');
}

function countEntriesBySeverity(entries) {
  const counts = {};
  for (const entry of entries ?? []) {
    counts[entry.severity] = (counts[entry.severity] ?? 0) + 1;
  }
  return counts;
}

/**
 * #1713: comments carry no severity of their own — the structured findings do.
 * `review-engine.mjs` builds `findings` from `comments` 1:1 and then re-sorts
 * the findings, so the two lists cannot be zipped by index; the join has to be
 * by content. Suppression filters both lists together (local-runner.mjs), so a
 * rendered comment normally has a matching finding.
 */
function commentSeverityKey({ ruleId, file, line, message }) {
  return [ruleId || 'unknown', file ?? '', line ?? '', message ?? ''].join('\u0000');
}

function buildCommentSeverityIndex(findings) {
  const index = new Map();
  for (const finding of findings ?? []) {
    const key = commentSeverityKey({
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.lineStart,
      message: finding.message,
    });
    if (!index.has(key)) index.set(key, finding.severity);
  }
  return index;
}

function severityOfComment(comment, index) {
  const key = commentSeverityKey({
    ruleId: comment.skillId,
    file: comment.file,
    line: comment.line ?? null,
    message: comment.message,
  });
  // Two fail-safes, both toward `major` (= expanded):
  //   - an unmatched comment has no finding to read a severity from
  //   - a severity outside the four-word vocabulary would otherwise fall out of
  //     the breakdown entirely and print an empty `· （計 N 件）·` (F7)
  // normalizeSeverity is the SSoT for both the vocabulary and that direction.
  return normalizeSeverity(index.get(key) ?? 'major');
}

/**
 * #1713 (F1): build THE set every human-facing section is derived from.
 *
 * The headline counts, the ✅ safety statement, the priority summary and the
 * section headings must all describe the findings the reader can actually see
 * below them. `result.comments` is what gets rendered; `result.findings` is a
 * different set on the `--reviewers` path (mergeFindings de-duplicates the
 * findings while `allComments` is concatenated as-is) and after suppression
 * (which drops a comment only on a fingerprint match). Deriving the headline
 * from one and the sections from the other produced "✅ no findings" printed
 * directly above a 要対応 section holding a blocker, so both now come from here.
 *
 * The verdict and the score are deliberately NOT derived from this set — they
 * stay canonical (deriveRunGate / scoreReview over `findings`), because a
 * display concern must never move a gate.
 *
 * @param {object} result runLocalReview result
 */
function buildRenderedFindingSet(result) {
  const index = buildCommentSeverityIndex(result.findings);
  const entries = (result.comments ?? []).map((comment) => ({
    comment,
    severity: severityOfComment(comment, index),
  }));
  const expanded = entries.filter((e) => SEVERITY_RANK[e.severity] >= EXPAND_FROM_RANK);
  const collapsed = entries.filter((e) => SEVERITY_RANK[e.severity] < EXPAND_FROM_RANK);
  return {
    entries,
    expanded,
    collapsed,
    total: entries.length,
    counts: countEntriesBySeverity(entries),
    expandedCounts: countEntriesBySeverity(expanded),
    collapsedCounts: countEntriesBySeverity(collapsed),
  };
}

/**
 * #1713 Slice 1: split findings at the `major` boundary. `critical` / `major`
 * render expanded under 要対応; `minor` / `info` are folded into a `<details>`
 * block that keeps their full text.
 *
 * @param {ReturnType<typeof buildRenderedFindingSet>} rendered
 * @returns {string[]}
 */
function formatFindingsSectionsMarkdown(rendered) {
  const sections = [];
  if (rendered.expanded.length) {
    sections.push(
      `### 要対応 (${rendered.expanded.length} 件: ${formatSeverityBreakdown(rendered.expandedCounts)})\n\n${formatCommentsMarkdown(rendered.expanded)}\n`
    );
  }
  if (rendered.collapsed.length) {
    sections.push(
      wrapInDetails(
        `軽微・参考の指摘 (${rendered.collapsed.length} 件: ${formatSeverityBreakdown(rendered.collapsedCounts)})`,
        formatCommentsMarkdown(rendered.collapsed)
      )
    );
  }
  return sections;
}

/**
 * #1713 Slice 1: the selected / skipped skill listing, folded into the
 * execution `<details>` block instead of being printed at full height.
 */
function formatPlanBodyMarkdown(summary) {
  const selected = summary.selected.length
    ? summary.selected.map((id) => `- \`${id}\``).join('\n')
    : '- _none_';
  const lines = [`**選択されたスキル (${summary.selected.length})**`, '', selected];
  if (summary.skipped.length) {
    lines.push(
      '',
      `**スキップされたスキル (${summary.skipped.length})**`,
      '',
      summary.skipped.map((item) => `- \`${item.id}\`: ${item.reasons.join('; ')}`).join('\n')
    );
  }
  return lines.join('\n');
}

/**
 * #1713 Slice 1: LLM / planner / impact-tag / skill-selection execution log,
 * collapsed behind one summary line. This is the review *log*, not the review
 * *result*, so it must not sit above the verdict.
 */
function formatExecutionDetailsMarkdown(result) {
  const summary = formatPlan(result.plan);
  const body = `${formatDebugSummaryMarkdown(result)}\n\n${formatPlanBodyMarkdown(summary)}`;
  return wrapInDetails(
    `レビュー実行の内訳（選択 ${summary.selected.length} / スキップ ${summary.skipped.length}）`,
    body
  );
}

function formatDebugSummaryMarkdown(result) {
  const debug = result.reviewDebug ?? {};
  const llmStatus = debug.llmUsed
    ? `used (\`${debug.llmModel}\`)`
    : debug.llmSkipped || debug.llmError
      ? `skipped (${debug.llmSkipped || debug.llmError})`
      : 'not used';

  const plan = result.plan ?? {};
  const plannerStatus = formatPlannerStatus(plan, { markdown: true });
  const impactTags = Array.isArray(plan?.impactTags) ? plan.impactTags : [];
  const impactSummary = impactTags.length ? impactTags.map((t) => `\`${t}\``).join(', ') : '`none`';

  return [
    `- LLM: ${llmStatus}`,
    `- Planner: ${plannerStatus}`,
    `- Impact tags: ${impactSummary}`,
    `- 変更ファイル数: ${result.changedFiles.length}`,
    `- トークン見積もり: ${result.tokenEstimate}`,
  ].join('\n');
}

export function formatPlannerStatus(plan, { markdown = false } = {}) {
  const wrap = (value) => (markdown ? `\`${value}\`` : value);
  const requested = Boolean(plan?.plannerRequested);
  const mode = plan?.plannerMode || 'off';
  if (!requested || mode === 'off') return wrap('off');
  if (plan?.plannerSkipped) return `${wrap(mode)} skipped (${plan.plannerSkipped})`;
  if (plan?.plannerFallback) {
    const reason = plan?.plannerError || '';
    return reason ? `${wrap(mode)} fallback (${reason})` : `${wrap(mode)} fallback`;
  }
  return plan?.plannerUsed ? `${wrap(mode)} used` : `${wrap(mode)} not used`;
}

function logPreview(title, text, maxLength, log, { leadingNewline = false } = {}) {
  if (!text) return;
  const preview = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  const prefix = leadingNewline ? '\n' : '';
  log(`${prefix}${title}:`);
  log(preview);
}

function formatRiskSummaryMarkdown(plan) {
  const risk = plan?.riskAssessment;
  if (!risk) return '';
  const badge =
    risk.aggregateAction === 'require_human_review'
      ? '🔴 require_human_review'
      : risk.aggregateAction === 'escalate'
        ? '🟡 escalate'
        : '🟢 comment_only';
  const lines = ['### リスク評価\n', '**判定**: ' + badge + '\n'];
  if (risk.humanReviewFiles?.length) {
    lines.push('**人間レビュー必須**:');
    for (const f of risk.humanReviewFiles) lines.push('- ' + sanitizeForMarkdown(f));
    lines.push('');
  }
  if (risk.escalatedFiles?.length) {
    lines.push('**エスカレーション対象**:');
    for (const f of risk.escalatedFiles) lines.push('- ' + sanitizeForMarkdown(f));
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * #1067: true when no LLM key is configured (LLM review skipped) AND there are
 * no static findings — i.e. the run would otherwise post a value-less boilerplate
 * PR comment (skipped-skills list / impact tags / token estimate). Used to emit a
 * single concise note instead.
 */
export function isLlmlessEmptyReview(result) {
  const debug = result?.reviewDebug ?? {};
  const llmKeyMissing = typeof debug.llmSkipped === 'string' && /not set/i.test(debug.llmSkipped);
  const noFindings = (result?.comments?.length ?? 0) === 0;
  return llmKeyMissing && noFindings;
}

export function printMarkdownReport(result, phase) {
  if (isLlmlessEmptyReview(result)) {
    console.log(
      `${COMMENT_MARKER}
## River Review

- フェーズ: \`${phase}\`
- LLM レビュー未設定（\`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\` / \`GOOGLE_API_KEY\` のいずれも未設定）のため静的チェックのみ実行し、**指摘はありません**。いずれか 1 つを設定すると LLM レビューが有効になり、リポジトリ固有の規約・差分スコープ等の観点でレビューします。`
    );
    return;
  }
  // #1713 Slice 1: the JSON artifact is built exactly once. It carries the
  // canonical decision AND emits the schema-validation warning on stderr, so a
  // second call would both recompute and duplicate that warning.
  const artifact = formatJsonOutput(result, phase);
  const score = scoreReview(artifact.issues ?? []);
  // formatJsonOutput already resolved the canonical verdict; reuse it so the
  // Markdown headline and score section cannot drift from JSON/YAML/HTML
  // (#1170 F3).
  score.verdict = resolveVerdict(artifact.decision, score.verdict);

  // #1713 F1: one rendered set feeds the headline, the ✅ line, the priority
  // summary and the section headings — they can no longer contradict each other.
  const rendered = buildRenderedFindingSet(result);
  const findingSections = formatFindingsSectionsMarkdown(rendered);

  const header = `${COMMENT_MARKER}
## River Review

${formatHeadlineMarkdown(rendered, phase, score)}
`;
  const noBlockerNote = formatNoBlockerNoteMarkdown(rendered);
  const riskSection = formatRiskSummaryMarkdown(result.plan);
  const humanReviewSection = formatHumanReviewFilesMarkdown(result);
  const teamLeadSection = formatTeamLeadReportMarkdown(result.teamLeadReport);
  const prioritySummary = formatPrioritySummaryMarkdown(rendered, result.classified);
  const scoreSection = formatScoreSectionMarkdown(score);
  const executionSection = formatExecutionDetailsMarkdown(result);
  console.log(
    [
      header,
      noBlockerNote,
      riskSection,
      humanReviewSection,
      teamLeadSection,
      ...findingSections,
      prioritySummary,
      scoreSection,
      executionSection,
    ]
      .filter(Boolean)
      .join('\n')
  );
}

/**
 * #1713 Slice 1: the one-line human-facing headline pinned to the top of the
 * report — verdict, severity breakdown, score, phase. Every value it prints is
 * already computed elsewhere (deriveRunGate via formatJsonOutput, scoreReview,
 * the rendered set); this only lays them out. It never changes a verdict.
 *
 * F1: the counts come from the RENDERED set, so they always describe the
 * sections printed below. F5: the suppressed count is deliberately absent —
 * suppressed findings are not part of what is displayed, and "抑制 N 件" next
 * to the visible counts read as "N of these are hidden". Its count and reason
 * breakdown live in the 優先度サマリー block instead.
 *
 * @param {ReturnType<typeof buildRenderedFindingSet>} rendered
 * @param {string} phase
 * @param {{ overall: number, verdict: string }} score resolved score
 * @returns {string}
 */
export function formatHeadlineMarkdown(rendered, phase, score) {
  const findingsPart =
    rendered.total === 0
      ? '指摘 0 件'
      : `${formatSeverityBreakdown(rendered.counts)}（計 ${rendered.total} 件）`;

  return [
    `**判定: ${score.verdict}**`,
    findingsPart,
    `スコア ${score.overall}/100`,
    `フェーズ \`${phase}\``,
  ].join(' · ');
}

/**
 * #1713 Slice 1: the "nothing blocks the merge" line. Returned only when the
 * 要対応 section would otherwise be absent, so the reader never has to infer
 * "no section" from a missing heading.
 *
 * F1: the strong form ("no findings at all") requires BOTH halves of the
 * rendered set to be empty. Deriving it from `findings.length` let a run print
 * it directly above a 要対応 section holding a blocker.
 */
function formatNoBlockerNoteMarkdown(rendered) {
  if (rendered.expanded.length > 0) return null;
  if (rendered.collapsed.length === 0) return '✅ マージ前に対応が必要な指摘はありません。\n';
  return '✅ マージ前必須（P1 / P2）の指摘はありません。軽微・参考の指摘のみです。\n';
}

/**
 * #1713 Slice 1: files the risk map flagged as human-review-required. Split out
 * of 優先度サマリー so it stays visible when that section is folded — it is a
 * gate-relevant signal, not part of the count breakdown.
 *
 * F6: skipped when the リスク評価 section already listed the same paths under
 * 人間レビュー必須 — `riskAssessment.humanReviewFiles` is derived from the same
 * risk map, so printing both put the identical list on screen twice in a row.
 */
function formatHumanReviewFilesMarkdown(result) {
  if (result.plan?.riskAssessment?.humanReviewFiles?.length) return null;
  const humanReviewFiles = result.plan?.riskMap?.require_human_review ?? [];
  if (!humanReviewFiles.length) return null;
  return [
    '> **Human review required**',
    ...humanReviewFiles.map((f) => `> - ${sanitizeForMarkdown(f)}`),
    '',
  ].join('\n');
}

/**
 * #1713 Slice 2: render the deterministic Tech Lead digest in markdown.
 *
 * Ported from `formatSummaryFromJson` in
 * `runners/github-action/post-inline-comments.cjs`, whose rendering only ever
 * reached the inline-comment surface that the `inline_comments` input gates off
 * by default. `teamLeadReport` is null on a single-reviewer run (`--reviewers`
 * absent), in which case every section here is omitted and the output is
 * byte-identical to the Slice 1 output.
 *
 * Overlap rule with 要対応: `top3Findings` is a POINTER list — one line per
 * finding (severity emoji + consensus badge + title + location). The full text
 * (Finding / Evidence / Impact / Fix) is rendered exactly once, in 要対応 or in
 * the collapsed 軽微・参考 block, and is never repeated here.
 *
 * Display-only: it must not override severity, `decision`, or `gate`.
 */
function formatTeamLeadReportMarkdown(teamLeadReport) {
  if (!teamLeadReport) return null;
  const lines = [];

  const top3 = teamLeadReport.top3Findings ?? [];
  if (top3.length > 0) {
    lines.push(`### 優先確認の指摘 (${top3.length} 件)`, '');
    for (const finding of top3) {
      const emoji = SEVERITY_EMOJI[normalizeSeverity(finding.severity)] ?? '🔵';
      const badge = formatConsensusBadge(finding.consensusLevel);
      // F2: a code span is not a safe container — a backtick inside the path
      // closes it and the rest is parsed as markup, so the path is neutralized
      // like the finding bodies are.
      const location = finding.file
        ? ` (\`${neutralizeDetailsMarkup(finding.file)}${finding.lineStart ? `:${finding.lineStart}` : ''}\`)`
        : '';
      lines.push(`- ${emoji}${badge} **${sanitizeForMarkdown(finding.title)}**${location}`);
    }
    lines.push('');
  }

  const consensus = teamLeadReport.consensusSummary;
  if (consensus && consensus.total > 0) {
    lines.push(
      `_合意度: ★★★ 合意 ${consensus.consensus} / ★★ 複数 ${consensus.multi} / ★ 単独 ${consensus.single}（計 ${consensus.total} 件）_`,
      ''
    );
  }

  const blindSpots = teamLeadReport.blindSpots ?? [];
  if (blindSpots.length > 0) {
    const labels = blindSpots.map((b) => sanitizeForMarkdown(b.label)).join(', ');
    lines.push(`_未実行のレビュー観点 (${blindSpots.length}): ${labels}_`, '');
  }

  return lines.length ? lines.join('\n') : null;
}

function formatConsensusBadge(consensusLevel) {
  if (consensusLevel === 'consensus') return ' ★★★';
  if (consensusLevel === 'multi') return ' ★★';
  return '';
}

/**
 * #1713 Slice 1: the P1〜P4 count table, folded into a `<details>` block whose
 * summary already carries every count. The headline shows the same numbers in
 * severity vocabulary; this keeps the priority vocabulary available without
 * spending four visible lines on it.
 *
 * F1: the counts are derived from the same rendered set as the headline and the
 * section headings, in the priority vocabulary (`severityToPriority`).
 *
 * F5: the suppression count is reported ONCE — here, next to its per-reason
 * breakdown, and not in the headline. Suppressed findings are not displayed, so
 * their count does not belong beside the counts of what is.
 *
 * #1857 / ADR-007: `classified.overflow` (the overview-cap overflow) is
 * deliberately NOT reported here. The Markdown report does not apply the
 * overview cap at all: `buildRenderedFindingSet` builds its entries from
 * `result.comments` (`:350-355`), which review-engine keeps as the full emitted
 * set — `findings` and `classified` are both derived from it 1:1
 * (`src/lib/review-engine.mjs:701`). So every overflow finding is already
 * printed in full, with its body, in the sections above. A line claiming those
 * findings are hidden would send the reader looking for something that is on
 * screen. The overflow stays observable through the run record
 * (`overflowFindings` / `finalSummary.overflowCount`) and
 * `debug.overviewCapOverflow`, which is where ADR-007's `observe` condition 3
 * needs it. Truncating the display to the cap instead would be a behaviour
 * change, and is out of scope here.
 *
 * @param {ReturnType<typeof buildRenderedFindingSet>} rendered
 * @param {{suppressed?: object[]}|undefined} classified
 */
function formatPrioritySummaryMarkdown(rendered, classified) {
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const entry of rendered.entries) {
    counts[severityToPriority(entry.severity)]++;
  }

  const lines = [];

  if (counts.P1 > 0) {
    lines.push(`> **P1 (マージ前必須修正): ${counts.P1} 件**\n`);
  }

  lines.push(
    `- P1 (must fix before merge): ${counts.P1} 件`,
    `- P2 (should fix or waive): ${counts.P2} 件`,
    `- P3 (recommended improvement): ${counts.P3} 件`,
    `- P4 (informational): ${counts.P4} 件`
  );

  const suppressed = classified?.suppressed ?? [];
  if (suppressed.length > 0) {
    const reasonCounts = {};
    for (const f of suppressed) {
      reasonCounts[f.suppressReason] = (reasonCounts[f.suppressReason] ?? 0) + 1;
    }
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r, n]) => `${r}(${n})`)
      .join(', ');
    lines.push(`- 抑制済み: ${suppressed.length} 件 (主な理由: ${topReasons})`);
  }

  return wrapInDetails(
    `優先度サマリー (P1 ${counts.P1} / P2 ${counts.P2} / P3 ${counts.P3} / P4 ${counts.P4})`,
    lines.join('\n')
  );
}

/**
 * #1713 Slice 1: the per-axis score breakdown, folded into a `<details>` block.
 * The overall score and the verdict are already in the headline; the five axis
 * lines and the "reference value" caveat are the part a reader opens on demand.
 *
 * Takes the already-resolved score (printMarkdownReport builds the JSON
 * artifact once) instead of recomputing it.
 *
 * @param {{ overall: number, verdict: string, axes: Record<string, number> }} score
 * @returns {string}
 */
function formatScoreSectionMarkdown(score) {
  const lines = [];
  lines.push(`結果(スコア): **${score.overall}/100**`);
  lines.push(`判定: **${score.verdict}**`);
  lines.push('');
  lines.push('内訳:');
  for (const axis of AXES) {
    lines.push(`- ${AXIS_LABELS_JA[axis]}: ${score.axes[axis]}/100`);
  }
  lines.push('');
  lines.push(
    '> スコアは severity と axis から決定論的に算出された **参考値** (`derived: true`)。HITL レビューと併用してください。'
  );
  return wrapInDetails(`スコア内訳 (${score.overall}/100)`, lines.join('\n'));
}

/**
 * #1045 A3 (#1141): human-readable explanation of which skills / gates / config
 * tier were resolved for this run. A focused alias over the same deterministic
 * resolution the planner already computed — printed to stderr so it never
 * corrupts machine-readable stdout (json / yaml).
 */
export function printExplain(result, { log = console.error } = {}) {
  const summary = formatPlan(result?.plan ?? {});
  log('\nResolution (--explain):');

  // Config tier that won (CLI > repo-local > global > built-in default).
  const sourceLabel =
    result?.configSource === 'file'
      ? 'repository-local'
      : result?.configSource === 'global'
        ? 'user-global'
        : 'built-in default';
  log(`- Config: ${sourceLabel}${result?.configPath ? ` (${result.configPath})` : ''}`);

  // Skill / gate resolution.
  log(
    `- Planner: ${formatPlannerStatus(result?.plan ?? {})}` +
      (result?.manualReviewMode ? ` / review mode: ${result.manualReviewMode}` : '')
  );
  if (summary.selected.length) {
    log(`- Selected skills (${summary.selected.length}): ${summary.selected.join(', ')}`);
  } else {
    log('- Selected skills (0): none matched this diff');
  }
  if (summary.skipped.length) {
    log(`- Skipped skills (${summary.skipped.length}):`);
    summary.skipped.forEach((item) => {
      log(`  - ${item.id}: ${item.reasons.join('; ')}`);
    });
  }
}

/**
 * The per-finding fingerprints a caller needs in order to write a suppression
 * (#1797). Both algorithms are printed because `river suppression add` takes
 * one of them depending on `--fingerprint-algo`:
 *
 *   - `v1` (default): `finding.fingerprint` — no line, so the entry suppresses
 *     every same-kind finding in the same file, and survives line drift.
 *   - `v2`: `finding.fingerprintV2` — line-anchored, so only this occurrence is
 *     suppressed, and the entry stops matching once the line shifts.
 *
 * Without this block the v2 value had no way of reaching the operator at all:
 * `--fingerprint-algo v2` could only be fed a v1 hex, which produces an entry
 * that matches nothing. `pages/guides/repo-wide-review.md` has stated that
 * fingerprints are read off `--debug` since #687; until now they were not.
 *
 * Findings from artifacts produced before #1797 have no `fingerprintV2`; the
 * column reads `-` rather than being silently omitted.
 */
function printFindingFingerprints(result, log) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const withFingerprints = findings.filter((f) => f?.fingerprint);
  if (withFingerprints.length === 0) return;
  log('\nFinding fingerprints (for `river suppression add --fingerprint`):');
  for (const f of withFingerprints) {
    const line = f.lineStart ?? f.line;
    const where = `${f.file ?? '<unknown>'}${Number.isInteger(line) && line >= 1 ? `:${line}` : ''}`;
    log(`- v1 ${f.fingerprint} / v2 ${f.fingerprintV2 ?? '-'}  ${f.ruleId ?? 'unknown'}  ${where}`);
  }
  log('  (v2 は --fingerprint-algo v2 用。行に紐づくため、行がズレると抑制は外れる)');
}

export function printDebugInfo(result, { log = console.log } = {}) {
  const debug = result.reviewDebug ?? {};
  const rawTokens = result.rawTokenEstimate ?? result.tokenEstimate;
  const reduction = result.reduction ?? 0;
  const plannerStatus = formatPlannerStatus(result.plan ?? {});
  const impactTags = Array.isArray(result.plan?.impactTags) ? result.plan.impactTags : [];
  log(`\nDebug info:
- LLM: ${debug.llmUsed ? `used (\`${debug.llmModel}\`)` : debug.llmSkipped || debug.llmError || 'not used'}
- Planner: ${plannerStatus}
- Impact tags: ${impactTags.join(', ') || 'none'}
- Token estimate (raw -> optimized): ${rawTokens} -> ${result.tokenEstimate} (${reduction}% reduction)
- Prompt truncated: ${debug.promptTruncated ? 'yes' : 'no'}
- Changed files (${result.changedFiles.length}): ${result.changedFiles.join(', ')}
- Project rules: ${result.projectRules ? 'present' : 'none'}
- Available contexts: ${(result.availableContexts || []).join(', ') || 'none'}
- Available dependencies: ${
    result.availableDependencies
      ? result.availableDependencies.join(', ')
      : 'not specified (skip disabled)'
  }
`);
  if (debug.llmError) {
    log(`LLM error: ${debug.llmError}`);
    // T64: パース失敗時に生のLLM出力が見えず切り分けができなかったため、
    // debug.rawLlmOutput があれば truncate してログに出す。
    logPreview('Raw LLM output', debug.rawLlmOutput, MAX_RAW_LLM_OUTPUT_PREVIEW_LENGTH, log);
  }
  logPreview('Prompt preview', debug.promptPreview, MAX_PROMPT_PREVIEW_LENGTH, log);
  logPreview(
    'Project-specific review rules (preview)',
    result.projectRules,
    MAX_PROMPT_PREVIEW_LENGTH,
    log,
    { leadingNewline: true }
  );
  printFindingFingerprints(result, log);
  if (result.plan?.skipped?.length) {
    log('\nSkipped skills detail:');
    result.plan.skipped.forEach((item) => {
      const id = item.skill?.metadata?.id ?? item.skill?.id ?? '(unknown)';
      log(`- ${id}: ${item.reasons.join('; ')}`);
    });
  }
  log('\n--- diff preview ---');
  log(result.diffText.split('\n').slice(0, MAX_DIFF_PREVIEW_LINES).join('\n'));
}

/**
 * Lazily compiled validator for schemas/output.schema.json (draft 2020-12).
 * Compiled once on first use; null if the schema cannot be loaded so a
 * validation problem never breaks JSON output emission.
 */
let outputSchemaValidator;
// Exported (not just used internally by validateOutputArtifact) so a canary
// test can assert directly that schema loading succeeds — see #1599, where a
// dist-only regression silently disabled validation because the failure mode
// (falling back to null) is otherwise invisible from validateOutputArtifact's
// return value alone.
export function getOutputSchemaValidator() {
  if (outputSchemaValidator !== undefined) return outputSchemaValidator;
  try {
    // Pass the URL object straight to readFileSync instead of resolving it via
    // fileURLToPath: readFileSync natively supports file: URLs, and this also
    // sidesteps a dist-only regression (#1599) where ncc rewrites the `new
    // URL(...)` expression into a plain path string
    // (`__nccwpck_require__.ab + "output.schema.json"`) — fileURLToPath then
    // throws `TypeError [ERR_INVALID_URL]: Invalid URL` because that string is
    // not a valid file: URL, while readFileSync accepts the plain path as-is.
    const schemaPath = new URL('../../schemas/output.schema.json', import.meta.url);
    const reviewCoverageSchemaPath = new URL(
      '../../schemas/review-coverage.schema.json',
      import.meta.url
    );
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const reviewCoverageSchema = JSON.parse(readFileSync(reviewCoverageSchemaPath, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    // Keep review-coverage.schema.json as the single shape SSoT. output.schema
    // references it by $id instead of copying the Review Coverage contract.
    ajv.addSchema(reviewCoverageSchema);
    outputSchemaValidator = ajv.compile(schema);
  } catch (err) {
    console.error(`Warning: could not load output.schema.json for validation: ${err.message}`);
    outputSchemaValidator = null;
  }
  return outputSchemaValidator;
}

/**
 * Validate a formatted artifact against output.schema.json at runtime and
 * report violations to stderr (#1254). Reporting only — the artifact is still
 * returned so a non-conforming LLM payload surfaces loudly instead of failing
 * silently downstream.
 */
export function validateOutputArtifact(artifact) {
  const validate = getOutputSchemaValidator();
  if (!validate) return;
  if (!validate(artifact)) {
    console.error(
      `Warning: JSON output does not conform to schemas/output.schema.json:\n${JSON.stringify(
        validate.errors,
        null,
        2
      )}`
    );
  }
}

/**
 * Format review result as JSON conforming to schemas/output.schema.json.
 * Consumes the structured findings[] produced by the Finding Pipeline.
 * Additively includes a top-level `decision` field derived from scoreReview verdict.
 */
export function formatJsonOutput(result, phase) {
  const issueCountBySeverity = { info: 0, minor: 0, major: 0, critical: 0 };
  const issueCountByPhase = { upstream: 0, midstream: 0, downstream: 0 };

  const issues = (result.findings ?? []).map((f) => {
    issueCountBySeverity[f.severity]++;
    issueCountByPhase[phase] = (issueCountByPhase[phase] ?? 0) + 1;
    return {
      id: f.id,
      ruleId: f.ruleId,
      reviewer: f.reviewer,
      title: f.title,
      message: f.message,
      severity: f.severity,
      confidence: f.confidence,
      status: f.status,
      evidence: f.evidence,
      phase,
      file: f.file,
      ...(f.lineStart ? { line: f.lineStart } : {}),
      ...(f.lineEnd && f.lineEnd !== f.lineStart ? { lineEnd: f.lineEnd } : {}),
      ...(f.suggestion ? { suggestion: f.suggestion } : {}),
      ...(f.consensusLevel ? { consensusLevel: f.consensusLevel } : {}),
      // #1644 Phase 1: the JSON output is the artifact governed by
      // output.schema.json, so `scope` must reach it for the schema field to be
      // observable at all. This guard is the emission rule the yaml and html
      // formatters now mirror (#1644 残件7): key present only when the finding
      // carries a value.
      ...(f.scope ? { scope: f.scope } : {}),
      // #1666 (#1545 Phase 2): same reachability rule as `scope` — a schema
      // field that stops at the finding object is an unreachable spec. Guard on
      // Array.isArray + length (not truthiness) so neither an empty array nor a
      // non-array value reaches the JSON artifact, where the schema requires an
      // array. yaml/html surfaces stay unchanged (out of Phase 2).
      ...(Array.isArray(f.criterionRefs) && f.criterionRefs.length > 0
        ? { criterionRefs: f.criterionRefs }
        : {}),
      ...(Array.isArray(f.artifactRefs) && f.artifactRefs.length > 0
        ? { artifactRefs: f.artifactRefs }
        : {}),
      ...(f.reviewerRole ? { reviewerRole: f.reviewerRole } : {}),
    };
  });

  const priorityCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const f of result.findings ?? []) {
    const p = severityToPriority(f.severity);
    priorityCounts[p]++;
  }
  const prioritySummary = {
    counts: priorityCounts,
    requiresImmediateAttention: priorityCounts.P1 > 0,
  };

  const summary = { issueCountBySeverity, issueCountByPhase, prioritySummary };
  const riskAssessment = result.plan?.riskAssessment;
  if (riskAssessment) {
    summary.riskSummary = {
      aggregateAction: riskAssessment.aggregateAction,
      escalatedFiles: riskAssessment.escalatedFiles,
      humanReviewFiles: riskAssessment.humanReviewFiles,
    };
  }
  // Gate + decision derivation shared with the run-record audit trail
  // (#1350 S3): extracted to src/lib/run-gate.mjs so the persisted record
  // and the JSON output always carry the same gate.
  const { decision, gate } = deriveRunGate(result);

  // #1689 review B3: reviewer roles cut off by the per-role timeout were only
  // observable in-process (`reviewerResults` / `debug`), both of which this
  // formatter drops — so from the CLI a timed-out role was indistinguishable
  // from a role that found nothing. Emit the role names at the top level, and
  // only when non-empty so an untouched run keeps its exact previous shape.
  const timedOutRoles = (result.reviewerResults ?? [])
    .filter((r) => r?.timedOut === true)
    .map((r) => r.role);

  const artifact = {
    issues,
    summary,
    ...(decision !== undefined ? { decision } : {}),
    ...(gate ? { gate } : {}),
    ...(timedOutRoles.length > 0 ? { timedOutRoles } : {}),
    ...(result.reviewCoverage ? { reviewCoverage: result.reviewCoverage } : {}),
    ...(result.teamLeadReport ? { teamLeadReport: result.teamLeadReport } : {}),
  };
  validateOutputArtifact(artifact);
  return artifact;
}

export function countChangedLines(files) {
  let lines = 0;
  for (const file of files ?? []) {
    for (const hunk of file.hunks ?? []) {
      lines += (hunk.lines ?? []).filter((l) => l.startsWith('+') || l.startsWith('-')).length;
    }
  }
  return lines;
}
