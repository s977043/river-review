import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { gateDecisionExitCode } from '../src/lib/gate-exit.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2812 案 B T1: measured behavior before the v2 default switch. Every expected
// value is a literal taken from a real run, so the switch PR can compare
// RIVER_GATE_REQUIRE_LLM=0 against these instead of recomputing them.
const CLEAN = {
  decision: 'auto-approve',
  gate: 'GO',
  reasonCode: 'CONVERGED_CLEAN',
  inputsHash: '6a8782d067d92821',
  exit: 0,
};
const DRY_RUN = {
  decision: 'auto-approve',
  gate: 'NO_GO',
  reasonCode: 'NOT_EXECUTED',
  inputsHash: '94802a08f0435872',
  exit: 1,
};
const OPT_IN_ESCALATE = {
  decision: 'auto-approve',
  gate: 'ESCALATE',
  reasonCode: 'LLM_NOT_EXECUTED',
  inputsHash: '1c2dba4f12075554',
  exit: 3,
};
const DRY_RUN_OPT_IN = { ...DRY_RUN, inputsHash: '863e993af47a8f24' };
const ALL_ROLES_FAILED = {
  decision: 'human-review-required',
  gate: 'ESCALATE',
  reasonCode: 'DECISION_ESCALATED',
  inputsHash: 'b9d0718ed6fd9ef2',
  exit: 3,
};

const BLOCKING = {
  decision: 'human-review-recommended',
  gate: 'NO_GO',
  reasonCode: 'BLOCKING_FINDINGS',
  inputsHash: '29a9280aad5eedac',
  exit: 1,
};

const ROLES = 'bug-hunter,security-scanner';
const KEY = { OPENAI_API_KEY: 'test-key' };
const OFFLINE = { ...KEY, RIVER_OFFLINE: '1' };
const OPT_IN = { RIVER_GATE_REQUIRE_LLM: '1' };
const OPT_OUT = { RIVER_GATE_REQUIRE_LLM: '0' };
const UNSUPPORTED_PROVIDER = { model: { provider: 'google' } };
const SILENT_CATCH = `export const value = 2;
export function test() {
  try {
    run();
  } catch(e) {
    return;
  }
}
`;
const MERGE_CONFLICT = `<<<<<<< HEAD
export const value = 1;
=======
export const value = 2;
>>>>>>> b
`;
const NBSP_SOURCE = 'export const value = 2;\n';

const isolatedEnv = (env) => ({
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
  RIVER_DEPENDENCY_STUBS: undefined,
  RIVER_AVAILABLE_CONTEXTS: undefined,
  RIVER_AVAILABLE_DEPENDENCIES: undefined,
  RIVER_PR_LABELS: undefined,
  GITHUB_EVENT_PATH: undefined,
  RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
  ...env,
});

const reply = (content) => async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});
const httpError = (status) => async () => ({
  ok: false,
  status,
  text: async () => 'denied',
  headers: { get: () => null },
});
const llmTimeout = async () => {
  throw new DOMException('timed out', 'TimeoutError');
};
const malformedBody = async () => ({
  ok: true,
  json: async () => {
    throw new SyntaxError('Unexpected token <');
  },
});
const noIssues = reply('NO_ISSUES');

async function runCli(
  t,
  { env = {}, args = [], config, file = 'src/app.js', source, fetchImpl = noIssues },
  reviewers
) {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-llm-baseline-',
    initialFiles: { [file]: 'export const value = 1;\n' },
    changedFiles: { [file]: source ?? 'export const value = 2;\n' },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);
  if (config) writeFileSync(join(dir, '.river-review.json'), JSON.stringify(config));

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = fetchImpl;

  const argv = ['run', '.', '--gate', '--save', '--output', 'json', ...args];
  if (reviewers) argv.push('--reviewers', ROLES);
  const { code, stdout } = await runCliInProcess(argv, { cwd: dir, env: isolatedEnv(env) });
  global.fetch = originalFetch;

  const runsDir = join(dir, '.river', 'runs');
  const [recordFile] = readdirSync(runsDir).filter((name) => name.endsWith('.json'));
  return {
    exit: code,
    output: JSON.parse(stdout),
    record: JSON.parse(readFileSync(join(runsDir, recordFile), 'utf8')),
  };
}

function assertCliRun({ exit, output, record }, expected) {
  const { llmNotExecuted, coverage, inGateInputs = false, issues = [] } = expected;
  assert.equal(exit, expected.exit);
  assert.equal(output.decision, expected.decision);
  assert.equal(output.gate.decision, expected.gate);
  assert.equal(output.gate.reasonCode, expected.reasonCode);
  assert.equal(output.gate.inputsHash, expected.inputsHash);
  assert.equal('llmNotExecuted' in output.gate.inputs, inGateInputs);
  assert.equal(output.llmNotExecuted, llmNotExecuted);
  assert.equal(output.reviewCoverage?.status ?? null, coverage);
  assert.deepEqual(
    output.issues.map((issue) => issue.severity),
    issues
  );

  // CLI stdout and the persisted record must describe the same run.
  assert.equal(record.decision, expected.decision);
  assert.equal(record.gate.decision, expected.gate);
  assert.equal(record.gate.reasonCode, expected.reasonCode);
  assert.equal(record.gate.inputsHash, expected.inputsHash);
  assert.deepEqual(record.gate, output.gate);
  assert.equal(record.llmNotExecuted, llmNotExecuted ? true : undefined);
}

const SKIPPED = { llmNotExecuted: true, coverage: null };
const EXECUTED = { llmNotExecuted: false, coverage: 'complete' };
const FAILED = { llmNotExecuted: false, coverage: 'not_executed' };

const BOTH_PATHS = [
  ['TC-01 no key', {}, { ...CLEAN, ...SKIPPED }],
  ['TC-01 no key, =0', { env: OPT_OUT }, { ...CLEAN, ...SKIPPED }],
  ['TC-01 no key, =1', { env: OPT_IN }, { ...OPT_IN_ESCALATE, ...SKIPPED, inGateInputs: true }],
  ['TC-02 RIVER_OFFLINE', { env: OFFLINE }, { ...CLEAN, ...SKIPPED }],
  ['TC-02 RIVER_OFFLINE, =0', { env: { ...OFFLINE, ...OPT_OUT } }, { ...CLEAN, ...SKIPPED }],
  ['TC-02 --offline', { env: KEY, args: ['--offline'] }, { ...CLEAN, ...SKIPPED }],
  [
    'TC-02 RIVER_OFFLINE, =1',
    { env: { ...OFFLINE, ...OPT_IN } },
    { ...OPT_IN_ESCALATE, ...SKIPPED, inGateInputs: true },
  ],
  ['TC-03 dry-run', { args: ['--dry-run'] }, { ...DRY_RUN, ...SKIPPED }],
  ['TC-03 dry-run, =0', { args: ['--dry-run'], env: OPT_OUT }, { ...DRY_RUN, ...SKIPPED }],
  [
    'TC-03 dry-run, =1',
    { args: ['--dry-run'], env: OPT_IN },
    { ...DRY_RUN_OPT_IN, ...SKIPPED, inGateInputs: true },
  ],
  [
    'TC-04 unsupported provider',
    { env: KEY, config: UNSUPPORTED_PROVIDER },
    { ...CLEAN, ...SKIPPED },
  ],
  ['TC-08 valid NO_ISSUES', { env: KEY }, { ...CLEAN, ...EXECUTED }],
  ['TC-08 valid NO_ISSUES, =1', { env: { ...KEY, ...OPT_IN } }, { ...CLEAN, ...EXECUTED }],
  // The detector fires, but the verifier rejects the blocker ("Severity exceeds
  // skill severity without justification"), so the CLI reports a clean run.
  ['TC-09 no key, heuristic blocker', { source: MERGE_CONFLICT }, { ...CLEAN, ...SKIPPED }],
  [
    'TC-09 RIVER_OFFLINE, heuristic blocker',
    { env: OFFLINE, source: MERGE_CONFLICT },
    { ...CLEAN, ...SKIPPED },
  ],
  // The same NBSP finding survives the verifier in .ts and is rejected in .js.
  [
    'TC-09 no key, NBSP in .ts',
    { file: 'src/app.ts', source: NBSP_SOURCE },
    { ...BLOCKING, ...SKIPPED, issues: ['major'] },
  ],
  ['TC-09 no key, NBSP in .js', { source: NBSP_SOURCE }, { ...CLEAN, ...SKIPPED }],
  [
    'TC-10a no key, heuristic minor',
    { source: SILENT_CATCH },
    { ...CLEAN, ...SKIPPED, issues: ['minor'] },
  ],
];

const LLM_FAILURES = [
  ['TC-05 timeout', llmTimeout],
  ['TC-06 revoked key (401)', httpError(401)],
  ['TC-06 rejected request (400)', httpError(400)],
  ['TC-06 malformed transport body', malformedBody],
  ['TC-06 unparsable completion', reply('garbage not a review')],
];

for (const [pathName, reviewers] of [
  ['single reviewer', false],
  ['--reviewers', true],
]) {
  describe(`LLM-not-executed baseline through the CLI, ${pathName} (#2812)`, () => {
    for (const [name, input, expected] of BOTH_PATHS) {
      it(name, async (t) => {
        assertCliRun(await runCli(t, input, reviewers), expected);
      });
    }

    // Single reviewer: the failure is visible in coverage only, and the gate
    // stays GO. --reviewers: TC-07, every role rejected.
    for (const [name, fetchImpl] of LLM_FAILURES) {
      it(name, async (t) => {
        const run = await runCli(t, { env: KEY, fetchImpl }, reviewers);
        assertCliRun(run, { ...(reviewers ? ALL_ROLES_FAILED : CLEAN), ...FAILED });
      });
    }
  });
}

describe('LLM-not-executed baseline, --reviewers only (#2812)', () => {
  it('TC-11 one role fails: GO with partial coverage', async (t) => {
    const fail = httpError(400);
    const fetchImpl = async (url, init) =>
      String(init?.body ?? '').includes('You are the Bug Hunter reviewer.') ? fail() : noIssues();
    const run = await runCli(t, { env: KEY, fetchImpl }, true);
    assertCliRun(run, { ...CLEAN, llmNotExecuted: false, coverage: 'partial' });
  });
});

describe('LLM-not-executed baseline at the derivation layer (#2812)', () => {
  const skippedResult = {
    status: 'ok',
    dryRun: false,
    changedFiles: ['src/a.js'],
    plan: {},
    config: {},
    llmNotExecuted: true,
  };
  const minor = { id: 'a', severity: 'minor', file: 'src/a.js' };
  const major = { id: 'a', severity: 'major', file: 'src/a.js' };
  const critical = { id: 'a', severity: 'critical', file: 'src/a.js' };
  const fulfilledRole = { reviewerResults: [{ role: 'bug-hunter', status: 'fulfilled' }] };

  function withRequireLlmUnset(t) {
    const saved = process.env.RIVER_GATE_REQUIRE_LLM;
    delete process.env.RIVER_GATE_REQUIRE_LLM;
    t.after(() => {
      if (saved === undefined) delete process.env.RIVER_GATE_REQUIRE_LLM;
      else process.env.RIVER_GATE_REQUIRE_LLM = saved;
    });
  }

  function assertDerived(result, expected) {
    const { decision, gate } = deriveRunGate(result);
    assert.equal(decision, expected.decision);
    assert.equal(gate.decision, expected.gate);
    assert.equal(gate.reasonCode, expected.reasonCode);
    assert.equal(gate.inputsHash, expected.inputsHash);
    assert.equal(gateDecisionExitCode(gate.decision), expected.exit);
  }

  // Derivation only for TC-10b and TC-09 critical: no no-key CLI input tried
  // (NBSP, bidi control, AWS-shaped key, merge conflict) produced these findings.
  // TC-09 major is also pinned through the CLI in BOTH_PATHS.
  for (const [pathName, extra] of [
    ['single reviewer', {}],
    ['--reviewers', fulfilledRole],
  ]) {
    it(`TC-10a no key + style minor stays GO, ${pathName}`, (t) => {
      withRequireLlmUnset(t);
      assertDerived(
        { ...skippedResult, ...extra, findings: [{ ...minor, category: 'style' }] },
        CLEAN
      );
    });

    it(`TC-10b no key + security minor observes, ${pathName}`, (t) => {
      withRequireLlmUnset(t);
      assertDerived(
        { ...skippedResult, ...extra, findings: [{ ...minor, category: 'security' }] },
        {
          decision: 'human-review-recommended',
          gate: 'GO_WITH_OBSERVATION',
          reasonCode: 'MINOR_FINDINGS_OBSERVE',
          inputsHash: '936ae9c9684cf3fe',
          exit: 0,
        }
      );
    });

    it(`TC-09 no key + major finding is NO_GO, ${pathName}`, (t) => {
      withRequireLlmUnset(t);
      assertDerived({ ...skippedResult, ...extra, findings: [major] }, BLOCKING);
    });

    it(`TC-09 no key + critical finding is ESCALATE, ${pathName}`, (t) => {
      withRequireLlmUnset(t);
      assertDerived(
        { ...skippedResult, ...extra, findings: [critical] },
        {
          decision: 'human-review-required',
          gate: 'ESCALATE',
          reasonCode: 'DECISION_ESCALATED',
          inputsHash: 'cbec11b188b0afe7',
          exit: 3,
        }
      );
    });
  }

  it('TC-12 optional unit failure leaves coverage complete and the gate GO', (t) => {
    withRequireLlmUnset(t);
    const reviewCoverage = deriveReviewCoverage([
      { id: 'required', status: 'completed', required: true },
      { id: 'optional', status: 'failed', required: false },
    ]);
    assert.equal(reviewCoverage.status, 'complete');
    assert.deepEqual(reviewCoverage.incompleteRequiredUnitIds, []);
    assertDerived({ ...skippedResult, llmNotExecuted: false, reviewCoverage, findings: [] }, CLEAN);
  });
});
