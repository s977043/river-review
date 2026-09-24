/**
 * Gate-side incompleteness inputs, both opt-in and both OFF by default
 * (#2320 staging, #2337 review coverage).
 *
 * WHY THIS FILE EXISTS, and what it is allowed to assume.
 *
 * `gate.decision` is a published surface: `src/lib/gate-exit.mjs` maps it to
 * the `--gate` exit codes `0 / 1 / 3`, and those codes are declared Stable in
 * `pages/reference/stable-interfaces.md` — changing what they mean needs a
 * major bump. Both features here therefore had to be additive AND default-off,
 * and "default-off" is a claim about OUTPUT, not about intent. So the first
 * describe block measures the default output rather than reading the code:
 * every gate derived without the new inputs must be byte-identical to the
 * pre-change one, including `inputs` and `inputsHash`.
 *
 * The second block pins the reason the coverage fact is an INDEPENDENT gate
 * input instead of a `loopSignal` downgrade. A downgrade is not a uniform
 * fail-safe: CONVERGED → NO_SIGNAL lands an `auto-approve` run on rule 9
 * (NO_GO/UNDETERMINED, exit 1) but a `human-review-recommended` run on rule 8
 * (GO_WITH_OBSERVATION, exit 0) — the same incomplete review either blocks or
 * passes depending on the verdict. The test measures BOTH routes for BOTH
 * verdicts so the asymmetry is recorded, not just asserted about.
 *
 * The last block is the mutation battery. Each case names a specific edit to
 * the production code that these tests must not survive.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';

import {
  ALLOWLIST_RELATIVE_PATH,
  runDeterministicGates,
} from '../src/lib/deterministic-command-orchestrator.mjs';
import {
  coverageIncompleteForGate,
  deriveGateDecision,
  isCoverageGateEnabled,
} from '../src/lib/gate-decision.mjs';
import { deriveSingleReviewerLlmCoverage } from '../src/lib/review-coverage.mjs';
import { runReviewPlan } from '../src/lib/review-plan.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';

/** A run that reaches the GO-family rules: everything upstream is clean. */
const cleanRun = (overrides = {}) => ({
  loopSignal: 'CONVERGED',
  decision: 'auto-approve',
  riskAction: 'comment_only',
  blockingFindings: 0,
  reviewExecuted: true,
  artifactStatus: 'ok',
  ...overrides,
});

const coverage = (status) => ({ schemaVersion: '1', status });

describe('#2320/#2337 — the default gate output is unchanged', () => {
  test('omitting coverageIncomplete reproduces the pre-change gate exactly', () => {
    const before = deriveGateDecision(cleanRun());
    assert.equal(before.decision, 'GO');
    assert.equal(before.reasonCode, 'CONVERGED_CLEAN');
    // The recorded hash of this exact input set, pinned as a literal so a
    // canonicalization change cannot be hidden by recomputing both sides.
    assert.equal(before.inputsHash, '6a8782d067d92821');
    // The new input must not even appear in the echoed inputs when it is false:
    // an always-present `coverageIncomplete: false` would change `gate.inputs`
    // for every existing consumer and every recorded conformance fixture.
    assert.equal('coverageIncomplete' in before.inputs, false);
  });

  test('passing coverageIncomplete: false is byte-identical to omitting it', () => {
    const omitted = deriveGateDecision(cleanRun());
    const explicitFalse = deriveGateDecision(cleanRun({ coverageIncomplete: false }));
    assert.deepEqual(explicitFalse, omitted);
    assert.equal(JSON.stringify(explicitFalse), JSON.stringify(omitted));
  });

  test('an incomplete coverage object with the opt-in OFF still yields GO', () => {
    // The fact is present; only the host opt-in is missing. This is the case
    // that would regress if a wiring site stopped consulting the predicate.
    const incomplete = coverageIncompleteForGate(coverage('partial'), {});
    assert.equal(incomplete, false);
    const gate = deriveGateDecision(cleanRun({ coverageIncomplete: incomplete }));
    assert.deepEqual(gate, deriveGateDecision(cleanRun()));
  });

  test('single-reviewer LLM failure preserves default GO but becomes COVERAGE_INCOMPLETE when opted in (#2410)', () => {
    // Pin the new observation to the already-published default-off Gate contract.
    const failedCoverage = deriveSingleReviewerLlmCoverage({
      debug: { llmUsed: false, llmError: 'response envelope parse failed' },
      subjects: ['src/app.js'],
    });

    assert.equal(failedCoverage.status, 'not_executed');

    const defaultIncomplete = coverageIncompleteForGate(failedCoverage, {});
    const defaultGate = deriveGateDecision(cleanRun({ coverageIncomplete: defaultIncomplete }));
    assert.equal(defaultGate.decision, 'GO');
    assert.equal(defaultGate.reasonCode, 'CONVERGED_CLEAN');

    const optedIn = coverageIncompleteForGate(failedCoverage, {
      RIVER_GATE_COVERAGE: '1',
    });
    const guardedGate = deriveGateDecision(cleanRun({ coverageIncomplete: optedIn }));
    assert.equal(guardedGate.decision, 'NO_GO');
    assert.equal(guardedGate.reasonCode, 'COVERAGE_INCOMPLETE');
  });

  test('the opt-in is strict: only the exact string "1" turns it on', () => {
    for (const value of ['true', '0', ' 1', '', 'yes', undefined]) {
      assert.equal(isCoverageGateEnabled({ RIVER_GATE_COVERAGE: value }), false, `${value}`);
    }
    assert.equal(isCoverageGateEnabled({ RIVER_GATE_COVERAGE: '1' }), true);
    assert.equal(isCoverageGateEnabled(undefined), false);
  });

  test('absent or malformed coverage is never read as incomplete', () => {
    const on = { RIVER_GATE_COVERAGE: '1' };
    // "no observation" and "observed a gap" are different facts; only the
    // second one may block a merge.
    for (const value of [null, undefined, {}, { status: 'complete' }, { status: 'weird' }]) {
      assert.equal(coverageIncompleteForGate(value, on), false, JSON.stringify(value));
    }
    assert.equal(coverageIncompleteForGate(coverage('partial'), on), true);
    assert.equal(coverageIncompleteForGate(coverage('not_executed'), on), true);
  });
});

describe('#2337 — an independent input fails safe uniformly, a signal downgrade does not', () => {
  test('the signal route is verdict-dependent (the reason this is not a downgrade)', () => {
    const viaSignalAuto = deriveGateDecision(
      cleanRun({ loopSignal: 'NO_SIGNAL', decision: 'auto-approve' })
    );
    const viaSignalHuman = deriveGateDecision(
      cleanRun({ loopSignal: 'NO_SIGNAL', decision: 'human-review-recommended' })
    );
    assert.equal(viaSignalAuto.decision, 'NO_GO');
    assert.equal(viaSignalAuto.reasonCode, 'UNDETERMINED');
    // The asymmetry, pinned: the SAME incomplete review passes here.
    assert.equal(viaSignalHuman.decision, 'GO_WITH_OBSERVATION');
    assert.equal(viaSignalHuman.reasonCode, 'MINOR_FINDINGS_OBSERVE');
    assert.notEqual(viaSignalAuto.decision, viaSignalHuman.decision);
  });

  test('the independent input blocks both verdicts with the same reason code', () => {
    for (const decision of ['auto-approve', 'human-review-recommended']) {
      const gate = deriveGateDecision(cleanRun({ decision, coverageIncomplete: true }));
      assert.equal(gate.decision, 'NO_GO', decision);
      assert.equal(gate.reasonCode, 'COVERAGE_INCOMPLETE', decision);
      assert.equal(gate.tier, 'field', decision);
    }
  });

  test('it also blocks the NO_SIGNAL route, so the two layers cannot disagree', () => {
    const gate = deriveGateDecision(
      cleanRun({
        loopSignal: 'NO_SIGNAL',
        decision: 'human-review-recommended',
        coverageIncomplete: true,
      })
    );
    assert.equal(gate.decision, 'NO_GO');
    assert.equal(gate.reasonCode, 'COVERAGE_INCOMPLETE');
  });

  test('rule order: the cliffs and strictBlock keep precedence over 6c', () => {
    // ESCALATE is more conservative than NO_GO, and a CONFIRMED violation must
    // not be traded for the weaker "we did not look at everything".
    const escalate = deriveGateDecision(
      cleanRun({ coverageIncomplete: true, changedFiles: ['.river/rules.md'] })
    );
    assert.equal(escalate.reasonCode, 'GATE_CONFIG_CHANGED');
    const approval = deriveGateDecision(
      cleanRun({ coverageIncomplete: true, humanApprovalRequired: true })
    );
    assert.equal(approval.reasonCode, 'HUMAN_APPROVAL_REQUIRED');
    const strict = deriveGateDecision(cleanRun({ coverageIncomplete: true, strictBlock: true }));
    assert.equal(strict.reasonCode, 'STRICT_BLOCK');
    const unrunnable = deriveGateDecision(
      cleanRun({ coverageIncomplete: true, deterministicUnrunnable: true })
    );
    assert.equal(unrunnable.reasonCode, 'DETERMINISTIC_UNRUNNABLE');
    // ...and the two rules that name a MORE specific absence still win.
    const notExecuted = deriveGateDecision(
      cleanRun({ coverageIncomplete: true, reviewExecuted: false })
    );
    assert.equal(notExecuted.reasonCode, 'NOT_EXECUTED');
    const skipped = deriveGateDecision(
      cleanRun({ coverageIncomplete: true, artifactStatus: 'skipped-by-label' })
    );
    assert.equal(skipped.reasonCode, 'SKIPPED_BY_POLICY');
  });

  test('rule order: 6c precedes rule 7, and that costs BLOCKING_FINDINGS detail', () => {
    // The block above pins everything ABOVE 6c. This pins the side BELOW it —
    // without it, a mutant that moves 6c past rule 7 survives (measured), and
    // the placement that makes the fail-safe uniform would be unprotected.
    const both = deriveGateDecision(
      cleanRun({ loopSignal: 'REVISE_REQUIRED', blockingFindings: 2, coverageIncomplete: true })
    );
    assert.equal(both.decision, 'NO_GO');
    assert.equal(both.reasonCode, 'COVERAGE_INCOMPLETE');
    // The detail that is deliberately given up: the same run without the
    // coverage fact names the more actionable cause. Recorded so the trade-off
    // is visible rather than discovered later.
    const findingsOnly = deriveGateDecision(
      cleanRun({ loopSignal: 'REVISE_REQUIRED', blockingFindings: 2 })
    );
    assert.equal(findingsOnly.reasonCode, 'BLOCKING_FINDINGS');
    // What must NOT change: merge authority is NO_GO on both paths.
    assert.equal(findingsOnly.decision, both.decision);
  });

  test('a host replaying gate.inputs reproduces the decision and the hash', () => {
    const gate = deriveGateDecision(cleanRun({ coverageIncomplete: true }));
    assert.equal(gate.inputs.coverageIncomplete, true);
    const replayed = deriveGateDecision({ ...gate.inputs, changedFiles: [] });
    assert.equal(replayed.decision, gate.decision);
    assert.equal(replayed.reasonCode, gate.reasonCode);
    assert.equal(replayed.inputsHash, gate.inputsHash);
    // A true value must produce a DISTINCT hash, or the S3 "same inputs,
    // different decision" regression check would go blind to this input.
    assert.notEqual(gate.inputsHash, deriveGateDecision(cleanRun()).inputsHash);
  });
});

// --- #2320: incomplete staging → deterministicUnrunnable (opt-in) -----------

async function makeTrustedTree() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-staging-trusted-'));
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  await fs.writeFile(
    allowlistPath,
    ['version: 1', 'commands:', '  - command: /usr/bin/tool-ok', '    selfContained: true'].join(
      '\n'
    ),
    'utf8'
  );
  return dir;
}

/**
 * Run one allowlisted gate whose checker always passes, against a source dir
 * that does NOT contain the file the caller asked to stage. That is exactly the
 * #2311 shape: the checker sees an empty sandbox and exits 0.
 */
async function runWithMissingSubject(processEnv) {
  const trustedTree = await makeTrustedTree();
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-staging-src-'));
  try {
    return await runDeterministicGates({
      trustedTree,
      selected: [
        {
          id: 'ok-check',
          metadata: { deterministicGate: { command: '/usr/bin/tool-ok', args: [] } },
        },
      ],
      reviewSourceDir: sourceDir,
      changedFiles: ['never-staged.txt'],
      processEnv,
      execImpl: async () => ({ status: 'pass', reasonCode: 'OK' }),
    });
  } finally {
    await fs.rm(trustedTree, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
}

describe('#2320 — incomplete staging is unrunnable, behind an opt-in', () => {
  test('default (opt-in absent): a passing checker over an empty sandbox still aggregates clean', async () => {
    const result = await runWithMissingSubject({ PATH: '/usr/bin' });
    assert.equal(
      result.results[0].staging.complete,
      false,
      'the fixture must actually fail staging'
    );
    assert.equal(result.deterministicUnrunnable, false);
    assert.equal(result.strictBlock, false);
  });

  test('opt-in ON: the same run reports deterministicUnrunnable', async () => {
    const result = await runWithMissingSubject({
      PATH: '/usr/bin',
      RIVER_GATE_STAGING_UNRUNNABLE: '1',
    });
    assert.equal(result.results[0].staging.complete, false);
    assert.equal(result.deterministicUnrunnable, true);
    // Never strictBlock: nothing was proven wrong, the check never saw its subject.
    assert.equal(result.strictBlock, false);
  });

  test('opt-in ON but staging complete: aggregation is untouched', async () => {
    const trustedTree = await makeTrustedTree();
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-staging-src-'));
    await fs.writeFile(path.join(sourceDir, 'changed.txt'), 'x', 'utf8');
    try {
      const result = await runDeterministicGates({
        trustedTree,
        selected: [
          {
            id: 'ok-check',
            metadata: { deterministicGate: { command: '/usr/bin/tool-ok', args: [] } },
          },
        ],
        reviewSourceDir: sourceDir,
        changedFiles: ['changed.txt'],
        processEnv: { PATH: '/usr/bin', RIVER_GATE_STAGING_UNRUNNABLE: '1' },
        execImpl: async () => ({ status: 'pass', reasonCode: 'OK' }),
      });
      assert.equal(result.results[0].staging.complete, true);
      assert.equal(result.deterministicUnrunnable, false);
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test('the staging opt-in is strict: near-miss values do not turn it on', async () => {
    for (const value of ['true', '0', ' 1', '']) {
      const result = await runWithMissingSubject({
        PATH: '/usr/bin',
        RIVER_GATE_STAGING_UNRUNNABLE: value,
      });
      assert.equal(result.deterministicUnrunnable, false, `"${value}" must not enable the gate`);
    }
  });

  test('the two features compose: staging → ESCALATE outranks coverage → NO_GO', async () => {
    const result = await runWithMissingSubject({
      PATH: '/usr/bin',
      RIVER_GATE_STAGING_UNRUNNABLE: '1',
    });
    const gate = deriveGateDecision(
      cleanRun({
        deterministicUnrunnable: result.deterministicUnrunnable,
        coverageIncomplete: true,
      })
    );
    assert.equal(gate.decision, 'ESCALATE');
    assert.equal(gate.reasonCode, 'DETERMINISTIC_UNRUNNABLE');
  });
});

// --- wiring -----------------------------------------------------------------
//
// The blocks above exercise deriveGateDecision directly. That is one layer
// INSIDE the code that has to pass the coverage object to it, so on its own it
// would stay green with the wiring deleted (a mutation that removed the
// `coverageIncompleteForGate(...)` call from run-gate survived exactly that
// way). These two tests drive the real consumers instead.

/**
 * Restore process.env around a case that has to flip the opt-in. Async-aware on
 * purpose: the exec path reads process.env AFTER an await, so a sync `finally`
 * would unset the variable before the code under test ever looked at it (this
 * bit — the test failed with the opt-in silently off).
 */
async function withEnv(key, value, fn) {
  const had = Object.hasOwn(process.env, key);
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[key] = previous;
    else delete process.env[key];
  }
}

const RUN_RESULT = (reviewCoverage) => ({
  status: 'ok',
  dryRun: false,
  findings: [],
  changedFiles: ['src/foo.ts'],
  reviewerResults: null,
  reviewCoverage,
});

describe('#2337 — the wiring passes coverage to the gate, on both gate paths', () => {
  test('deriveRunGate (river run --gate) reads result.reviewCoverage', async () => {
    const off = deriveRunGate(RUN_RESULT(coverage('partial')));
    assert.equal(off.gate.decision, 'GO', 'opt-in off must not change river run');
    assert.equal('coverageIncomplete' in off.gate.inputs, false);

    const on = await withEnv('RIVER_GATE_COVERAGE', '1', () =>
      deriveRunGate(RUN_RESULT(coverage('partial')))
    );
    assert.equal(on.gate.decision, 'NO_GO');
    assert.equal(on.gate.reasonCode, 'COVERAGE_INCOMPLETE');

    const complete = await withEnv('RIVER_GATE_COVERAGE', '1', () =>
      deriveRunGate(RUN_RESULT(coverage('complete')))
    );
    assert.equal(complete.gate.decision, 'GO');
  });

  test('runReviewPlan(executeReview) forwards the engine coverage into artifact.gate', async () => {
    const sampleDiff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 1111111..2222222 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,2 +1,3 @@',
      ' export function foo() {',
      '+  return 1;',
      ' }',
      '',
    ].join('\n');
    const exec = (reviewCoverage) =>
      runReviewPlan({
        planOnly: true,
        executeReview: true,
        now: () => '2026-01-01T00:00:00.000Z',
        loadConfigImpl: async () => ({}),
        resolveAllArtifactsImpl: () => ({
          diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' },
        }),
        readFileImpl: async () => sampleDiff,
        buildExecutionPlanImpl: async () => ({
          selected: [{ metadata: { id: 'rr-test-skill', name: 'Test', phase: 'midstream' } }],
          skipped: [],
        }),
        loadRiskMapImpl: async () => null,
        humanApprovalAdjudicator: null,
        generateReviewImpl: async () => ({
          findings: [],
          reviewCoverage,
          debug: { llmUsed: false, heuristicsUsed: false },
        }),
      });

    const off = await exec(coverage('partial'));
    assert.equal(
      'coverageIncomplete' in off.gate.inputs,
      false,
      'default output must be unchanged'
    );

    const on = await withEnv('RIVER_GATE_COVERAGE', '1', () => exec(coverage('partial')));
    assert.equal(on.gate.inputs.coverageIncomplete, true);
    assert.equal(on.gate.reasonCode, 'COVERAGE_INCOMPLETE');
    assert.equal(on.gate.decision, 'NO_GO');
  });
});
