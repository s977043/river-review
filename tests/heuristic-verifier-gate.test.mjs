import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

const ROLES = 'bug-hunter,security-scanner';
const API_KEY = { OPENAI_API_KEY: 'test-key' };
const OFFLINE = { RIVER_OFFLINE: '1' };

const CONFLICT = `<<<<<<< HEAD
export const value = 1;
=======
export const value = 2;
>>>>>>> b
`;
const BIDI_JS = 'export const value = "a‮b";\n';
const BIDI_PY = 'value = "a‮b"\n';
const NBSP = 'export const value = 2;\n';
const EVAL = 'export const value = eval(input);\n';
const AWS_KEY = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
const KEY_JS = `export const key = "${AWS_KEY}";\n`;
const KEY_PY = `key = "${AWS_KEY}"\n`;

const ESCALATE = {
  decision: 'human-review-required',
  gate: 'ESCALATE',
  reasonCode: 'DECISION_ESCALATED',
  exit: 3,
};
const BLOCKING = {
  decision: 'human-review-recommended',
  gate: 'NO_GO',
  reasonCode: 'BLOCKING_FINDINGS',
  exit: 1,
};
const CLEAN = { decision: 'auto-approve', gate: 'GO', reasonCode: 'CONVERGED_CLEAN', exit: 0 };

const LLM_ENV_KEYS = [
  'RIVER_OPENAI_API_KEY',
  'RIVER_OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'RIVER_OFFLINE',
  'RIVER_GATE_REQUIRE_LLM',
  'RIVER_GATE_COVERAGE',
  'RIVER_AUTO_SAVE',
  'RIVER_PHASE',
  'RIVER_PLANNER_MODE',
  'RIVER_DEPENDENCY_STUBS',
  'RIVER_AVAILABLE_CONTEXTS',
  'RIVER_AVAILABLE_DEPENDENCIES',
  'RIVER_PR_LABELS',
  'RIVER_PR_BODY',
  'GITHUB_EVENT_PATH',
];
const isolatedEnv = (env) => ({
  ...Object.fromEntries(LLM_ENV_KEYS.map((key) => [key, undefined])),
  RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
  ...env,
});

async function runGate(t, { file, source, env = {}, args = [] }, reviewers) {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-heuristic-gate-',
    initialFiles: { [file]: 'export const value = 1;\n' },
    changedFiles: { [file]: source },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const argv = ['run', '.', '--gate', '--output', 'json', ...args];
  if (reviewers) argv.push('--reviewers', ROLES);
  const { code, stdout } = await runCliInProcess(argv, { cwd: dir, env: isolatedEnv(env) });
  return { exit: code, output: JSON.parse(stdout) };
}

function assertGate({ exit, output }, expected) {
  assert.equal(output.gate.decision, expected.gate);
  assert.equal(output.gate.reasonCode, expected.reasonCode);
  assert.equal(exit, expected.exit);
  assert.equal(output.decision, expected.decision);
  if (expected.issues) {
    assert.deepEqual(
      output.issues.map((issue) => issue.severity),
      expected.issues
    );
  }
  if (expected.inputsHash) assert.equal(output.gate.inputsHash, expected.inputsHash);
}

const CASES = [
  [
    'TC-01 conflict in .js',
    { file: 'src/app.js', source: CONFLICT },
    { ...ESCALATE, issues: ['critical', 'critical'] },
  ],
  [
    'TC-01 conflict in .ts',
    { file: 'src/app.ts', source: CONFLICT },
    { ...ESCALATE, issues: ['critical', 'critical'] },
  ],
  ['TC-02 bidi in .js', { file: 'src/app.js', source: BIDI_JS }, ESCALATE],
  ['TC-02 bidi in .ts', { file: 'src/app.ts', source: BIDI_JS }, ESCALATE],
  ['TC-02 bidi in .py', { file: 'app/main.py', source: BIDI_PY }, ESCALATE],
  ['TC-02 NBSP in .js', { file: 'src/app.js', source: NBSP }, BLOCKING],
  ['TC-02 NBSP in .ts', { file: 'src/app.ts', source: NBSP }, BLOCKING],
  [
    'TC-03 eval under src/api',
    { file: 'src/api/a.ts', source: EVAL },
    { ...BLOCKING, issues: ['major'] },
  ],
  [
    'TC-06 RIVER_OFFLINE, conflict',
    { file: 'src/app.js', source: CONFLICT, env: OFFLINE },
    ESCALATE,
  ],
  ['TC-06 RIVER_OFFLINE, NBSP', { file: 'src/app.js', source: NBSP, env: OFFLINE }, BLOCKING],
  [
    'TC-06 --offline with a key, conflict',
    { file: 'src/app.js', source: CONFLICT, env: API_KEY, args: ['--offline'] },
    ESCALATE,
  ],
  [
    'TC-06 --offline with a key, NBSP',
    { file: 'src/app.js', source: NBSP, env: API_KEY, args: ['--offline'] },
    BLOCKING,
  ],
  [
    'TC-09 no detection stays clean',
    { file: 'src/app.js', source: 'export const value = 2;\n' },
    { ...CLEAN, issues: [], inputsHash: '6a8782d067d92821' },
  ],
  [
    'TC-11 AWS-shaped key in src/api .ts',
    { file: 'src/api/a.ts', source: KEY_JS },
    { ...ESCALATE, issues: ['critical'] },
  ],
  [
    'TC-11 AWS-shaped key in src/api .js',
    { file: 'src/api/a.js', source: KEY_JS },
    { ...ESCALATE, issues: ['critical'] },
  ],
  [
    'TC-E01 dry-run + critical escalates',
    { file: 'src/app.js', source: CONFLICT, args: ['--dry-run'] },
    ESCALATE,
  ],
  [
    'TC-E01 dry-run + major stays NOT_EXECUTED',
    { file: 'src/app.js', source: NBSP, args: ['--dry-run'] },
    { ...BLOCKING, reasonCode: 'NOT_EXECUTED' },
  ],
  // Routing gaps, not verifier behavior: nothing is detected here. These pins
  // state the limit of this fix and change with the routing issue.
  ['TC-E02 key in src/app.js is not detected', { file: 'src/app.js', source: KEY_JS }, CLEAN],
  ['TC-E02 key in app/main.py is not detected', { file: 'app/main.py', source: KEY_PY }, CLEAN],
  [
    'TC-E02 conflict in app/main.py is not detected',
    { file: 'app/main.py', source: CONFLICT },
    CLEAN,
  ],
];

for (const [pathName, reviewers] of [
  ['single reviewer', false],
  ['--reviewers', true],
]) {
  describe(`heuristic findings reach the gate through the CLI, ${pathName}`, () => {
    for (const [name, input, expected] of CASES) {
      it(name, async (t) => {
        assertGate(await runGate(t, input, reviewers), expected);
      });
    }
  });
}
