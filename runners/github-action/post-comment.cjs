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

module.exports.COMMENT_MARKER = COMMENT_MARKER;
module.exports.LEGACY_COMMENT_MARKER = LEGACY_COMMENT_MARKER;
