const fs = require('fs');

/**
 * #2323: the canonical PR-comment marker.
 *
 * `pages/reference/stable-interfaces.md` (ja / en) declares
 * `<!-- river-review -->` as the PR comment contract, and `src/cli/render.mjs`
 * already emits it at the top of the body this runner receives. This file used
 * to prepend a second, differently spelled marker (`<!-- river-reviewer -->`),
 * so every comment carried both and any consumer reading the documented marker
 * matched the renderer's copy rather than the one the dedup search used.
 *
 * Writes now use the canonical marker only. Reads still accept the legacy
 * spelling so a comment posted by an earlier release keeps being updated in
 * place instead of being duplicated.
 */
const COMMENT_MARKER = '<!-- river-review -->';
const LEGACY_COMMENT_MARKER = '<!-- river-reviewer -->';
const MAX_COMMENT_LENGTH = 65000;

/**
 * #2330: does this comment belong to River Review?
 *
 * The test is on the PREFIX, not on containment. Every body this action
 * writes starts with `COMMENT_MARKER` (the `startsWith` guard below is what
 * guarantees it), so a marker found anywhere else in a body belongs to
 * somebody quoting us — a docs discussion, a support thread pasting the
 * action's output — and must not become the target of an in-place overwrite.
 * `includes` made every such comment a candidate.
 *
 * The legacy prefix is still accepted because a comment posted by v1.118.1 or
 * earlier starts with that spelling; dropping it here would duplicate the
 * comment instead of updating it.
 *
 * REMOVAL CONDITION for the legacy prefix (deliberately not a date — a date
 * says nothing about the set of comments that still need it): drop the
 * `LEGACY_COMMENT_MARKER` term once no open pull request carries a River
 * Review comment written before v1.119.0. That condition is reachable on its
 * own, because the acceptance is self-terminating: a comment matched by the
 * legacy prefix is rewritten with `body`, which starts with the canonical
 * marker alone, so every run shrinks the population and nothing adds to it
 * (measured across the legacy-only / both-markers / canonical-only shapes in
 * PR #2326 — each was an in-place update of the same comment id). A
 * maintainer checks it per open PR with:
 *
 *   gh api --paginate 'repos/:owner/:repo/issues/<N>/comments?per_page=100' \
 *     --jq '.[] | select(.body | startswith("<!-- river-reviewer -->")) | .id'
 *
 * No output for every open PR means the term can go, together with the
 * `startsWith(LEGACY_COMMENT_MARKER)` branch here and the migration sentence
 * in `pages/reference/stable-interfaces.md` (ja / en).
 *
 * @param {unknown} body comment body as returned by the API
 * @returns {boolean}
 */
function isRiverReviewComment(body) {
  return (
    typeof body === 'string' &&
    (body.startsWith(COMMENT_MARKER) || body.startsWith(LEGACY_COMMENT_MARKER))
  );
}

module.exports = async function postComment({ github, context, core }) {
  const outputPath = process.env.RIVER_REVIEWER_COMMENT_PATH;
  if (!outputPath || !fs.existsSync(outputPath)) {
    core.setFailed('River Reviewer output file not found; cannot post comment.');
    return;
  }

  let body = fs.readFileSync(outputPath, 'utf8').trim();
  if (!body.startsWith(COMMENT_MARKER)) {
    body = `${COMMENT_MARKER}\n${body}`;
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    body = `${body.slice(0, MAX_COMMENT_LENGTH)}\n\n…(truncated)`;
  }

  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    core.setFailed('pull_request payload was not found; cannot post comment.');
    return;
  }

  const { owner, repo } = context.repo;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => isRiverReviewComment(c.body));
  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated existing River Reviewer comment (${existing.id}).`);
    return;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  core.info('Created new River Reviewer comment.');
};

module.exports.isRiverReviewComment = isRiverReviewComment;
module.exports.COMMENT_MARKER = COMMENT_MARKER;
module.exports.LEGACY_COMMENT_MARKER = LEGACY_COMMENT_MARKER;
