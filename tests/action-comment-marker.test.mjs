// #2323: the PR comment carries exactly one marker, and the idempotent-update
// search still finds a comment written under the legacy spelling.
//
// Target: `runners/github-action/post-comment.cjs` (the CommonJS
// actions/github-script runner; not bundled by `npm run build:action`).
//
// Expectations are hand-written literals rather than derived from the module's
// own constants for the body-assembly cases, so reverting the fix (prepending
// `<!-- river-reviewer -->` on top of the renderer marker) fails here instead
// of staying self-consistent.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const postComment = require(
  fileURLToPath(new URL('../runners/github-action/post-comment.cjs', import.meta.url))
);

/** The body `src/cli/render.mjs` produces: it already starts with the marker. */
const RENDERED_BODY = '<!-- river-review -->\n## River Review\n\nNo issues found.';

/**
 * Drive the runner against a fake Octokit.
 *
 * @param {object} [options]
 * @param {Array<{id:number, body:string}>} [options.comments] existing PR comments
 * @param {string} [options.body] contents of the comment file
 */
async function run({ comments = [], body = RENDERED_BODY } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'river-comment-marker-'));
  const outputPath = join(dir, 'output.md');
  writeFileSync(outputPath, body, 'utf8');

  const posted = { created: null, updated: null, updatedId: null, failures: [] };
  const github = {
    paginate: async () => comments,
    rest: {
      issues: {
        async createComment({ body: posted_body }) {
          posted.created = posted_body;
        },
        async updateComment({ comment_id, body: posted_body }) {
          posted.updatedId = comment_id;
          posted.updated = posted_body;
        },
      },
    },
  };
  const context = { payload: { pull_request: { number: 12 } }, repo: { owner: 'o', repo: 'r' } };
  const core = { info() {}, setFailed: (m) => posted.failures.push(m) };

  const previous = process.env.RIVER_REVIEWER_COMMENT_PATH;
  process.env.RIVER_REVIEWER_COMMENT_PATH = outputPath;
  try {
    await postComment({ github, context, core });
  } finally {
    if (previous === undefined) delete process.env.RIVER_REVIEWER_COMMENT_PATH;
    else process.env.RIVER_REVIEWER_COMMENT_PATH = previous;
  }
  return posted;
}

describe('#2323 PR comment marker', () => {
  it('posts the renderer body unchanged, with a single marker', async () => {
    const posted = await run();
    assert.equal(posted.created, RENDERED_BODY);
    assert.ok(!posted.created.includes('<!-- river-reviewer -->'));
    assert.equal(posted.created.match(/<!-- river-review(?:er)? -->/g).length, 1);
  });

  it('prepends the canonical marker when the body does not carry one', async () => {
    const posted = await run({ body: '## River Review\n\nbody without a marker' });
    assert.equal(posted.created, '<!-- river-review -->\n## River Review\n\nbody without a marker');
  });

  it('updates a comment posted under the legacy marker instead of duplicating', async () => {
    const legacyBody = '<!-- river-reviewer -->\n<!-- river-review -->\n## River Review\n\nold';
    const posted = await run({ comments: [{ id: 41, body: legacyBody }] });
    assert.equal(posted.created, null, 'must not create a second comment');
    assert.equal(posted.updatedId, 41);
    assert.equal(posted.updated, RENDERED_BODY);
  });

  it('updates a comment that carries only the legacy marker', async () => {
    const posted = await run({ comments: [{ id: 42, body: '<!-- river-reviewer -->\nold' }] });
    assert.equal(posted.created, null);
    assert.equal(posted.updatedId, 42);
  });

  it('updates a comment that carries only the canonical marker', async () => {
    const posted = await run({ comments: [{ id: 43, body: '<!-- river-review -->\nold' }] });
    assert.equal(posted.created, null);
    assert.equal(posted.updatedId, 43);
  });

  it('ignores unrelated comments', async () => {
    const posted = await run({ comments: [{ id: 44, body: 'looks good to me' }] });
    assert.equal(posted.updatedId, null);
    assert.equal(posted.created, RENDERED_BODY);
  });

  it('exports the canonical and legacy markers', () => {
    assert.equal(postComment.COMMENT_MARKER, '<!-- river-review -->');
    assert.equal(postComment.LEGACY_COMMENT_MARKER, '<!-- river-reviewer -->');
  });
});

// -----------------------------------------------------------------------------
// The inline runner posts its own summary comment and dedups it the same way.

const postInlineComments = require(
  fileURLToPath(new URL('../runners/github-action/post-inline-comments.cjs', import.meta.url))
);

async function runInline(comments) {
  const dir = mkdtempSync(join(tmpdir(), 'river-inline-marker-'));
  const jsonPath = join(dir, 'output.json');
  writeFileSync(
    jsonPath,
    JSON.stringify({ issues: [], summary: { issueCountBySeverity: {} } }),
    'utf8'
  );

  const posted = { created: null, updatedId: null, updated: null };
  const github = {
    paginate: async () => comments,
    rest: {
      pulls: { async createReview() {} },
      issues: {
        async createComment({ body }) {
          posted.created = body;
        },
        async updateComment({ comment_id, body }) {
          posted.updatedId = comment_id;
          posted.updated = body;
        },
      },
    },
  };
  const context = {
    payload: { pull_request: { number: 12, head: { sha: 'deadbeef' } } },
    repo: { owner: 'o', repo: 'r' },
  };
  const core = { info() {}, warning() {}, setFailed() {} };

  const previous = process.env.RIVER_REVIEWER_JSON_PATH;
  process.env.RIVER_REVIEWER_JSON_PATH = jsonPath;
  try {
    await postInlineComments({ github, context, core });
  } finally {
    if (previous === undefined) delete process.env.RIVER_REVIEWER_JSON_PATH;
    else process.env.RIVER_REVIEWER_JSON_PATH = previous;
  }
  return posted;
}

describe('#2323 inline runner summary marker', () => {
  it('emits the canonical marker only', async () => {
    const posted = await runInline([]);
    assert.ok(posted.created.startsWith('<!-- river-review -->'));
    assert.ok(!posted.created.includes('<!-- river-reviewer -->'));
  });

  it('updates a summary posted under the legacy marker', async () => {
    const posted = await runInline([
      { id: 55, body: '<!-- river-reviewer -->\n## River Reviewer' },
    ]);
    assert.equal(posted.created, null);
    assert.equal(posted.updatedId, 55);
  });
});
