// #2869: with `gate: true`, a NO_GO / ESCALATE run exits non-zero from the
// River Review step. The post steps must still run and say why the job fails,
// while the River Review step keeps its exit code.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ACTION_DIR = new URL('../runners/github-action/', import.meta.url);
const postComment = require(fileURLToPath(new URL('post-comment.cjs', ACTION_DIR)));
const postInline = require(fileURLToPath(new URL('post-inline-comments.cjs', ACTION_DIR)));
const actionYml = readFileSync(new URL('action.yml', ACTION_DIR), 'utf8');

function fakeGithub(posted) {
  return {
    paginate: async () => posted.existing ?? [],
    rest: {
      issues: {
        async createComment({ body }) {
          posted.created = body;
        },
        async updateComment({ body }) {
          posted.updated = body;
        },
      },
      pulls: {
        async createReview() {},
        async createReviewComment() {},
      },
    },
  };
}

const context = {
  payload: { pull_request: { number: 7, head: { sha: 'abc' } } },
  repo: { owner: 'o', repo: 'r' },
};

async function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function runComment(
  exitCode,
  { gate = 'true', body = '<!-- river-review -->\n## River Review\n\nbody', existing } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'river-gate-comment-'));
  const path = join(dir, 'out.md');
  writeFileSync(path, body, 'utf8');
  const posted = { created: null, updated: null, existing };
  await withEnv(
    {
      RIVER_REVIEWER_COMMENT_PATH: path,
      RIVER_REVIEWER_EXIT_CODE: exitCode,
      RIVER_REVIEWER_GATE: gate,
    },
    () => postComment({ github: fakeGithub(posted), context, core: { info() {}, setFailed() {} } })
  );
  return existing ? posted : posted.created;
}

async function runInline(exitCode) {
  const dir = mkdtempSync(join(tmpdir(), 'river-gate-inline-'));
  const path = join(dir, 'out.json');
  writeFileSync(path, JSON.stringify({ issues: [], summary: {} }), 'utf8');
  const posted = { created: null };
  await withEnv(
    {
      RIVER_REVIEWER_JSON_PATH: path,
      RIVER_REVIEWER_EXIT_CODE: exitCode,
      RIVER_REVIEWER_GATE: 'true',
    },
    () =>
      postInline({
        github: fakeGithub(posted),
        context,
        core: { info() {}, warning() {}, setFailed() {} },
      })
  );
  return posted.created;
}

const NOTE_1 =
  '> [!WARNING]\n> River Review exited 1 under `gate: true`, so this job fails. See the `Gate:` line in the job log.';
const NOTE_3 =
  '> [!WARNING]\n> River Review exited 3 under `gate: true`, so this job fails. See the `Gate:` line in the job log.';

describe('#2869 post-comment exit note', () => {
  it('U1: no note when the exit code is unset', async () => {
    assert.equal(await runComment(undefined), '<!-- river-review -->\n## River Review\n\nbody');
  });

  it('U2: no note when the exit code is 0', async () => {
    assert.equal(await runComment('0'), '<!-- river-review -->\n## River Review\n\nbody');
  });

  it('U3: note right after the marker for exit 1', async () => {
    assert.equal(
      await runComment('1'),
      `<!-- river-review -->\n${NOTE_1}\n\n## River Review\n\nbody`
    );
  });

  it('U4: note for exit 3', async () => {
    assert.equal(
      await runComment('3'),
      `<!-- river-review -->\n${NOTE_3}\n\n## River Review\n\nbody`
    );
  });

  it('U5: inline summary carries the same note, and none on exit 0', async () => {
    const failed = await runInline('1');
    assert.ok(failed.startsWith(`<!-- river-review -->\n${NOTE_1}\n\n## River Reviewer`), failed);
    const passed = await runInline('0');
    assert.ok(!passed.includes('[!WARNING]'), passed);
  });

  it('U6: no gate note when gate is false, even on a non-zero exit', async () => {
    assert.equal(
      await runComment('1', { gate: 'false' }),
      '<!-- river-review -->\n## River Review\n\nbody'
    );
  });

  it('U7: an empty output file never overwrites the existing review comment', async () => {
    const posted = await runComment('1', {
      body: '',
      existing: [{ id: 9, body: '<!-- river-review -->\nprevious review' }],
    });
    assert.equal(posted.updated, null, 'existing comment must stay');
    assert.equal(posted.created, null);
  });
});

function step(name) {
  const start = actionYml.indexOf(`    - name: ${name}\n`);
  assert.notEqual(start, -1, `step ${name} not found`);
  const next = actionYml.indexOf('\n    - name: ', start + 1);
  const end = next === -1 ? actionYml.indexOf('\nbranding:', start) : next;
  return actionYml.slice(start, end);
}

describe('#2869 action.yml post-step conditions', () => {
  it('S1: Post PR comment runs after a failed River step but not on cancel or early exit', () => {
    const s = step('Post PR comment');
    assert.match(s, /if: \$\{\{ !cancelled\(\) && steps\.river\.outputs\.comment_path != '' && /);
    assert.match(s, /RIVER_REVIEWER_EXIT_CODE: \$\{\{ steps\.river\.outputs\.exit_code \}\}/);
  });

  it('S1: Post inline review comments runs after a failed River step but not on cancel or early exit', () => {
    const s = step('Post inline review comments');
    assert.match(s, /if: \$\{\{ !cancelled\(\) && steps\.river\.outputs\.json_path != '' && /);
    assert.match(s, /RIVER_REVIEWER_EXIT_CODE: \$\{\{ steps\.river\.outputs\.exit_code \}\}/);
  });

  it('S2: the River step still exits with the captured code and publishes it as a step output', () => {
    const s = step('Run River Review');
    assert.match(s, /echo "exit_code=\$\{rc\}" >> "\$\{GITHUB_OUTPUT\}"/);
    assert.match(s, /\n\s+exit "\$\{rc\}"\n/);
  });

  it('S3: output paths are published only when the CLI wrote something', () => {
    const s = step('Run River Review');
    assert.match(s, /if \[ -s "\$\{json_out\}" \]; then\n\s+echo "json_path=\$\{json_out\}"/);
    assert.match(s, /if \[ -s "\$\{out\}" \]; then\n\s+echo "comment_path=\$\{out\}"/);
  });

  it('S4: both post steps receive the gate input', () => {
    for (const name of ['Post PR comment', 'Post inline review comments']) {
      assert.match(step(name), /RIVER_REVIEWER_GATE: \$\{\{ inputs\.gate \}\}/, name);
    }
  });

  it('exit_code stays a step-internal output, not a public action output', () => {
    const outputs = actionYml.slice(actionYml.indexOf('\noutputs:'), actionYml.indexOf('\nruns:'));
    assert.ok(!outputs.includes('exit_code'), outputs);
  });
});
