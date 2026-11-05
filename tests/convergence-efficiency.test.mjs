/**
 * Tests for scripts/evaluate-convergence-efficiency.mjs (Epic #1171 item4).
 *
 * Deterministic, fixture-based. Asserts the four metrics
 * (turnCount / blockingFindingsRemaining / oscillationCount / estimatedCostUsd)
 * and the baseline-vs-treatment comparison. No LLM, no network.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateConvergence,
  compareCase,
  evaluateCasesFile,
} from '../scripts/evaluate-convergence-efficiency.mjs';

describe('evaluateConvergence', () => {
  test('empty run sequence → zeroed, not converged', () => {
    const m = evaluateConvergence([]);
    assert.deepEqual(m, {
      turnCount: 0,
      blockingFindingsRemaining: 0,
      oscillationCount: 0,
      estimatedCostUsd: 0,
      converged: false,
    });
  });

  test('counts blocking findings (critical + major) in the final run only', () => {
    const runs = [
      { runId: 'r1', timestamp: '2026-06-17T00:00:01.000Z', findings: [{ severity: 'critical' }] },
      {
        runId: 'r2',
        timestamp: '2026-06-17T00:00:02.000Z',
        findings: [{ severity: 'major' }, { severity: 'minor' }, { severity: 'info' }],
      },
    ];
    const m = evaluateConvergence(runs);
    assert.equal(m.turnCount, 2);
    assert.equal(m.blockingFindingsRemaining, 1); // only the final run's major
    assert.equal(m.converged, false);
  });

  test('converged when final run has no blocking findings', () => {
    const runs = [
      { runId: 'r1', timestamp: '2026-06-17T00:00:01.000Z', findings: [{ severity: 'major' }] },
      { runId: 'r2', timestamp: '2026-06-17T00:00:02.000Z', findings: [{ severity: 'minor' }] },
    ];
    const m = evaluateConvergence(runs);
    assert.equal(m.blockingFindingsRemaining, 0);
    assert.equal(m.converged, true);
  });

  test('does not claim convergence when the latest review is incomplete', () => {
    for (const coverageStatus of ['partial', 'not_executed']) {
      const runs = [
        {
          runId: 'r1',
          timestamp: '2026-06-17T00:00:01.000Z',
          findings: [{ severity: 'major' }],
          reviewCoverage: { status: 'complete' },
        },
        {
          runId: 'r2',
          timestamp: '2026-06-17T00:00:02.000Z',
          findings: [],
          reviewCoverage: { status: coverageStatus },
        },
      ];
      const report = evaluateConvergence(runs);
      assert.equal(report.blockingFindingsRemaining, 0);
      assert.equal(report.converged, false, coverageStatus);
    }
  });

  test('LLM-not-executed prevents convergence even if coverage appears complete', () => {
    const report = evaluateConvergence([
      {
        runId: 'r1',
        timestamp: '2026-06-17T00:00:01.000Z',
        findings: [],
        reviewCoverage: { status: 'complete' },
        llmNotExecuted: true,
      },
    ]);
    assert.equal(report.converged, false);
  });

  test('uses only the latest coverage and preserves legacy records without coverage', () => {
    const early = {
      runId: 'r1',
      timestamp: '2026-06-17T00:00:01.000Z',
      findings: [{ severity: 'major' }],
      reviewCoverage: { status: 'not_executed' },
    };
    const latest = {
      runId: 'r2',
      timestamp: '2026-06-17T00:00:02.000Z',
      findings: [],
      reviewCoverage: { status: 'complete' },
    };
    assert.equal(evaluateConvergence([latest, early]).converged, true);
    assert.equal(
      evaluateConvergence([{ runId: 'legacy', findings: [], timestamp: latest.timestamp }])
        .converged,
      true
    );
  });

  test('sums estimated_cost_usd across runs (rounded)', () => {
    const runs = [
      {
        runId: 'r1',
        timestamp: '2026-06-17T00:00:01.000Z',
        findings: [],
        usage: { estimated_cost_usd: 0.1 },
      },
      {
        runId: 'r2',
        timestamp: '2026-06-17T00:00:02.000Z',
        findings: [],
        usage: { estimated_cost_usd: 0.05 },
      },
    ];
    assert.equal(evaluateConvergence(runs).estimatedCostUsd, 0.15);
  });

  test('detects oscillation across 3+ runs (present → absent → present)', () => {
    const f = {
      ruleId: 'rr-mid-perf-n1',
      file: 'src/list.mjs',
      message: 'N+1 query',
      severity: 'major',
    };
    const runs = [
      { runId: 'r1', timestamp: '2026-06-17T00:00:01.000Z', findings: [f] },
      { runId: 'r2', timestamp: '2026-06-17T00:00:02.000Z', findings: [] },
      { runId: 'r3', timestamp: '2026-06-17T00:00:03.000Z', findings: [f] },
    ];
    assert.equal(evaluateConvergence(runs).oscillationCount, 1);
  });

  test('is order-independent: unsorted input yields the same final-run metrics', () => {
    const early = {
      runId: 'r1',
      timestamp: '2026-06-17T00:00:01.000Z',
      findings: [{ severity: 'critical' }],
    };
    const late = { runId: 'r2', timestamp: '2026-06-17T00:00:02.000Z', findings: [] };
    const sorted = evaluateConvergence([early, late]);
    const shuffled = evaluateConvergence([late, early]);
    assert.deepEqual(shuffled, sorted);
    assert.equal(shuffled.converged, true); // final run (late) has no blocking findings
  });

  test('no oscillation with fewer than 3 runs', () => {
    const f = {
      ruleId: 'rr-mid-perf-n1',
      file: 'src/list.mjs',
      message: 'N+1 query',
      severity: 'major',
    };
    const runs = [
      { runId: 'r1', timestamp: '2026-06-17T00:00:01.000Z', findings: [f] },
      { runId: 'r2', timestamp: '2026-06-17T00:00:02.000Z', findings: [f] },
    ];
    assert.equal(evaluateConvergence(runs).oscillationCount, 0);
  });
});

describe('compareCase / evaluateCasesFile (fixtures)', () => {
  test('auth-endpoint-refactor: RR converges in fewer turns, baseline does not converge', () => {
    const results = evaluateCasesFile();
    const auth = results.find((r) => r.name === 'auth-endpoint-refactor');
    assert.ok(auth, 'case present');
    assert.equal(auth.baseline.converged, false);
    assert.equal(auth.treatment.converged, true);
    assert.equal(auth.delta.turnsSaved, 1); // 3 baseline turns - 2 treatment turns
    assert.ok(auth.delta.costDeltaUsd < 0, 'RR variant costs less in total');
  });

  test('oscillating-fix-loop: baseline oscillates, treatment converges without oscillation', () => {
    const results = evaluateCasesFile();
    const osc = results.find((r) => r.name === 'oscillating-fix-loop');
    assert.ok(osc, 'case present');
    assert.equal(osc.baseline.oscillationCount, 1);
    assert.equal(osc.treatment.oscillationCount, 0);
    assert.equal(osc.treatment.converged, true);
  });

  test('compareCase returns baseline/treatment/delta shape', () => {
    const r = compareCase({
      name: 'unit',
      baseline: [
        { runId: 'a', timestamp: '2026-06-17T00:00:01.000Z', findings: [{ severity: 'critical' }] },
      ],
      treatment: [{ runId: 'b', timestamp: '2026-06-17T00:00:01.000Z', findings: [] }],
    });
    assert.equal(r.delta.turnsSaved, 0);
    assert.equal(r.baseline.converged, false);
    assert.equal(r.treatment.converged, true);
  });
});
