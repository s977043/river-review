import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { buildHeuristicComments } from '../src/lib/heuristic-review.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2870: explicit tokens and merge conflicts run regardless of which skills
// applyTo selected for the file type or phase.
const AWS_KEY = 'AKIA1234567890ABCDEF';
const CONFLICT = '<<<<<<< HEAD\nvalue = 1\n=======\nvalue = 2\n>>>>>>> b\n';

const isolatedEnv = {
  RIVER_OPENAI_API_KEY: undefined,
  RIVER_OPENAI_BASE_URL: undefined,
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  GOOGLE_API_KEY: undefined,
  RIVER_OFFLINE: undefined,
  RIVER_GATE_REQUIRE_LLM: undefined,
  RIVER_GATE_COVERAGE: undefined,
  RIVER_AUTO_SAVE: undefined,
  RIVER_PHASE: undefined,
  RIVER_PLANNER_MODE: undefined,
  RIVER_PR_LABELS: undefined,
  RIVER_PR_BODY: undefined,
  GITHUB_EVENT_PATH: undefined,
  RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
};

async function runGate(t, file, source, args = []) {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-always-routing-',
    initialFiles: { [file]: 'seed\n' },
    changedFiles: { [file]: source },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);
  const { code, stdout } = await runCliInProcess(
    ['run', '.', '--gate', '--output', 'json', ...args],
    { cwd: dir, env: isolatedEnv }
  );
  return { exit: code, output: JSON.parse(stdout) };
}

function assertBlocked({ exit, output }, kind) {
  // A critical heuristic finding escalates, as TC-09 in
  // gate-llm-not-executed-baseline pins for the merge-conflict case.
  assert.equal(output.gate.decision, 'ESCALATE');
  assert.equal(exit, 3);
  assert.ok(
    output.issues.some((issue) => issue.severity === 'critical'),
    `expected a critical ${kind} issue, got ${JSON.stringify(output.issues)}`
  );
}

describe('always-routed detectors through the CLI (#2870)', () => {
  const tokenFiles = [
    ['P1', 'app.js', `const k = '${AWS_KEY}';\n`],
    ['P2', 'main.py', `k = "${AWS_KEY}"\n`],
    ['P3', 'config.json', `{ "k": "${AWS_KEY}" }\n`],
    ['P4', '.env.example', `AWS_ACCESS_KEY_ID=${AWS_KEY}\n`],
    ['P5', 'x.yml', `k: ${AWS_KEY}\n`],
    ['P6', 'src/api/x.ts', `export const k = '${AWS_KEY}';\n`],
  ];
  for (const [id, file, source] of tokenFiles) {
    it(`${id} explicit AWS key in ${file} blocks the gate`, async (t) => {
      assertBlocked(await runGate(t, file, source), 'hardcoded-secret');
    });
  }

  for (const [id, file] of [
    ['P7', 'main.py'],
    ['P8', 'data.json'],
    ['P9', 'x.go'],
  ]) {
    it(`${id} merge conflict in ${file} blocks the gate`, async (t) => {
      assertBlocked(await runGate(t, file, CONFLICT), 'merge-conflict');
    });
  }

  it('P10 upstream phase still detects an explicit token', async (t) => {
    assertBlocked(
      await runGate(t, 'main.py', `k = "${AWS_KEY}"\n`, ['--phase', 'upstream']),
      'hardcoded-secret'
    );
  });
});

function detect(path, lines, { header = '@@ -1,1 +1,3 @@' } = {}) {
  const diffText = `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
${header}
${lines.join('\n')}
`;
  return buildHeuristicComments({ diff: parseUnifiedDiff(diffText), plan: { selected: [] } });
}

describe('always-routed detectors stay quiet on negatives (#2870)', () => {
  it('N1 process.env reference is not a token', () => {
    assert.deepEqual(detect('app.js', ['+const k = process.env.AKIA1234567890ABCDEF;']), []);
  });

  it('N2 tests and fixtures are skipped', () => {
    assert.deepEqual(detect('tests/x.test.js', [`+const k = '${AWS_KEY}';`]), []);
    assert.deepEqual(detect('src/fixtures/x.js', [`+const k = '${AWS_KEY}';`]), []);
  });

  it('N3 a line of only ======= is not a conflict', () => {
    assert.deepEqual(detect('main.py', ['+=======']), []);
  });

  it('N4 an indented marker is not a conflict', () => {
    assert.deepEqual(detect('main.py', ['+    <<<<<<< HEAD', '+    >>>>>>> b']), []);
  });

  it('N5 deleted and context lines are ignored', () => {
    assert.deepEqual(
      detect('main.py', ['-<<<<<<< HEAD', `-k = "${AWS_KEY}"`, ` >>>>>>> b`, '+ok = 1'], {
        header: '@@ -1,3 +1,2 @@',
      }),
      []
    );
  });

  it('N6 sk- with 15 characters or fewer is not a token', () => {
    assert.deepEqual(detect('app.js', ["+const k = 'sk-123456789012345';"]), []);
  });

  it('D2 conflict markers in .md/.mdx/.patch/.diff are excluded', () => {
    for (const path of ['README.md', 'page.mdx', 'fix.patch', 'fix.diff']) {
      assert.deepEqual(detect(path, ['+<<<<<<< HEAD', '+>>>>>>> b']), [], path);
    }
  });

  it('D4 the finding keeps the owning skill id', () => {
    const [secret] = detect('main.py', [`+k = "${AWS_KEY}"`]);
    const [conflict] = detect('main.py', ['+<<<<<<< HEAD']);
    assert.equal(secret.skillId, 'security-basic');
    assert.equal(conflict.skillId, 'logging-observability');
  });

  it('ASIA temporary keys and ghp_ tokens are detected without the skill', () => {
    const comments = detect('main.py', [
      '+a = "ASIA1234567890ABCDEF"',
      '+b = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"',
    ]);
    assert.equal(comments.length, 2);
  });

  it('a token on a suspicious-name line is reported once when security-basic is selected', () => {
    const diffText = `diff --git a/src/k.ts b/src/k.ts
--- a/src/k.ts
+++ b/src/k.ts
@@ -1,1 +1,2 @@
+export const API_TOKEN = '${AWS_KEY}';
`;
    const comments = buildHeuristicComments({
      diff: parseUnifiedDiff(diffText),
      plan: { selected: [{ metadata: { id: 'security-basic' } }] },
    });
    assert.equal(comments.length, 1);
  });
});

describe('always routing keeps the presentation contract (#2870)', () => {
  it('R1 registry order is kept and the output is capped at 8', () => {
    const lines = [];
    for (let i = 0; i < 4; i += 1) lines.push(`+k${i} = "AKIA${String(i).repeat(16)}"`);
    for (let i = 0; i < 4; i += 1) lines.push('+<<<<<<< HEAD');
    for (let i = 0; i < 4; i += 1) lines.push('+debugger;');
    const comments = buildHeuristicComments({
      diff: parseUnifiedDiff(`diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1,1 +1,12 @@
${lines.join('\n')}
`),
      plan: { selected: [{ metadata: { id: 'logging-observability' } }] },
    });
    assert.deepEqual(
      comments.map((c) => c.kind),
      [
        ...Array(3).fill('hardcoded-secret'),
        ...Array(3).fill('debugger-leftover'),
        ...Array(2).fill('merge-conflict'),
      ]
    );
  });
});
