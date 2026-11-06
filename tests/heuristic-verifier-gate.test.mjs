import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { generateReview } from '../src/lib/review-engine.mjs';
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

describe('verifier stage keeps checking everything that is not a detector batch', () => {
  const finding = (severity, path = 'src/app.js') =>
    `src/app.js:1: Finding: real issue Evidence: the change at ${path} breaks auth ` +
    `Impact: bad Fix: Replace the call with the audited helper Severity: ${severity} ` +
    'Confidence: high';
  const reply = (content) => async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  const rejectedRequest = async () => ({
    ok: false,
    status: 400,
    text: async () => 'denied',
    headers: { get: () => null },
  });
  const mkDiff = (added) => {
    const diffText = `diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-a\n+${added}\n`;
    return { diffText, files: parseUnifiedDiff(diffText).files };
  };
  const plan = (severity, extra = []) => ({
    selected: [{ metadata: { id: 'first', name: 'first', severity } }, ...extra],
    skipped: [],
  });
  const PLAIN = 'export const v = 1;';

  async function review(t, { fetchImpl, added = PLAIN, reviewPlan }) {
    const env = isolatedEnv({});
    const savedEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    const originalFetch = global.fetch;
    t.after(() => {
      global.fetch = originalFetch;
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = fetchImpl;
    return generateReview({
      diff: mkDiff(added),
      plan: reviewPlan,
      phase: 'midstream',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    });
  }
  const summarize = (result) => result.findings.map((f) => `${f.ruleId}:${f.severity}`);

  it('TC-04 an LLM blocker above the first skill severity is still rejected', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      reviewPlan: plan('minor'),
    });
    assert.deepEqual(result.findings, []);
    assert.equal(result.debug.verifierStats.rejected, 1);
    assert.deepEqual(result.debug.verifierRejected[0].reasons, [
      'Severity exceeds skill severity without justification',
    ]);
  });

  it('TC-04 control: an LLM blocker under a critical first skill passes', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      reviewPlan: plan('critical'),
    });
    assert.deepEqual(
      result.findings.map((f) => f.severity),
      ['critical']
    );
  });

  it('TC-04 an LLM finding citing a file outside the diff is still rejected', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker', 'src/ghost.js')),
      reviewPlan: plan('critical'),
    });
    assert.deepEqual(result.debug.verifierRejected[0].reasons, [
      'Evidence references file not found in diff',
    ]);
    assert.ok(!result.findings.some((f) => f.severity === 'critical'));
  });

  // The empty result relies on the first-skill comparison rejecting the fallback's
  // major. This pin is not a spec of that defect: it fixes that this change does
  // not relax it, and it moves with the PR that fixes the comparison or fallback.
  it('TC-05 the fallback under a minor first skill stays rejected', async (t) => {
    const result = await review(t, { fetchImpl: rejectedRequest, reviewPlan: plan('minor') });
    assert.deepEqual(result.findings, []);
  });

  it('TC-05 the fallback under a major first skill stays major', async (t) => {
    const result = await review(t, { fetchImpl: rejectedRequest, reviewPlan: plan('major') });
    assert.deepEqual(summarize(result), ['first:major']);
  });

  it('TC-08 a degraded batch keeps the detector finding', async (t) => {
    const result = await review(t, {
      fetchImpl: reply(finding('blocker')),
      added: '<<<<<<< HEAD',
      reviewPlan: plan('minor', [
        { metadata: { id: 'logging-observability', name: 'l', severity: 'minor' } },
      ]),
    });
    assert.deepEqual(summarize(result), ['logging-observability:critical']);
    assert.equal(result.debug.verifierAllRejected, true);
  });
});
