// #2331 wiring tests.
//
// `loop-signal.test.mjs` pins what `deriveLoopSignalFromRunsDiff` returns when
// it is handed a record directly. That is one layer inside the change: the
// value of this work depends on the `runs diff` handler feeding it a record
// that still carries `reviewCoverage`, and on the HTML dashboard rendering the
// qualified signal rather than the raw one. #2325 found that exact gap on the
// neighbouring `currentCoverage` argument — deleting the call-site argument
// left every test green — so these tests drive the CLI handler end-to-end over
// real run records on disk.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runRunsCommand } from '../src/cli/commands/runs.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';

const PARTIAL_COVERAGE = deriveReviewCoverage([
  { id: 'u-security', status: 'timed_out' },
  { id: 'u-testing', status: 'completed' },
]);
const COMPLETE_COVERAGE = deriveReviewCoverage([
  { id: 'u-security', status: 'completed' },
  { id: 'u-testing', status: 'completed' },
]);

function makeFinding() {
  return {
    id: 'rr-1',
    ruleId: 'null-safety',
    file: 'src/foo.mjs',
    lineStart: 10,
    lineEnd: 10,
    title: 'Possible null dereference in foo',
    message: 'Finding: null-check Evidence: obj.foo called without guard Severity: major',
    severity: 'major',
    confidence: 'high',
    status: 'open',
  };
}

/** Capture console.log output of an async block. */
async function captureStdout(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('runs diff qualifies suggestedLoopSignal by run coverage (#2331)', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-2331-'));
    const storeDir = path.join(tmpDir, '.river', 'runs');
    await fs.mkdir(storeDir, { recursive: true });
    const write = (runId, timestamp, findings, reviewCoverage) =>
      fs.writeFile(
        path.join(storeDir, `${runId}.json`),
        JSON.stringify({
          runId,
          timestamp,
          phase: 'upstream',
          // Every clean run below carries the auto-approve decision, so the
          // unqualified derivation would return CONVERGED for all of them.
          decision: 'auto-approve',
          findings,
          reviewCoverage,
        }),
        'utf8'
      );
    await write('run-a', '2024-01-01T00:00:00Z', [makeFinding()], COMPLETE_COVERAGE);
    // run-b: clean, but one of two required review units timed out.
    await write('run-b', '2024-01-02T00:00:00Z', [], PARTIAL_COVERAGE);
    // run-c: clean and complete.
    await write('run-c', '2024-01-03T00:00:00Z', [], COMPLETE_COVERAGE);
    // run-d: clean, no coverage observation at all (pre-#2212 record shape).
    await write('run-d', '2024-01-04T00:00:00Z', [], undefined);
    // run-e: clean but partial, and the newest record of all — the 3-run path
    // sorts by timestamp, so this is the run whose coverage must qualify.
    await write('run-e', '2024-01-05T00:00:00Z', [], PARTIAL_COVERAGE);
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const parsed = (ids, output) => ({
    runsSubcommand: 'diff',
    runsId1: ids[0],
    runsId2: ids[1],
    runsIds: ids,
    output,
    storeDir: undefined,
  });

  const signalOf = async (ids) => {
    const out = await captureStdout(async () => {
      const code = await runRunsCommand({ ...parsed(ids, 'json') }, tmpDir);
      assert.equal(code, 0);
    });
    return JSON.parse(out).suggestedLoopSignal;
  };

  it('2-run json path demotes CONVERGED to NO_SIGNAL on partial coverage', async () => {
    assert.equal(await signalOf(['run-a', 'run-b']), 'NO_SIGNAL');
  });

  it('2-run json path keeps CONVERGED on complete coverage', async () => {
    assert.equal(await signalOf(['run-a', 'run-c']), 'CONVERGED');
  });

  it('2-run json path keeps CONVERGED when the record carries no coverage', async () => {
    assert.equal(await signalOf(['run-a', 'run-d']), 'CONVERGED');
  });

  it('3-run path qualifies by the latest run coverage', async () => {
    // run-e (partial) is the latest of the three by timestamp → demoted.
    assert.equal(await signalOf(['run-a', 'run-c', 'run-e']), 'NO_SIGNAL');
    // run-c (complete) is the latest → kept.
    assert.equal(await signalOf(['run-a', 'run-b', 'run-c']), 'CONVERGED');
  });

  it('html dashboard no longer shows a green CONVERGED banner over an orange partial chip', async () => {
    const out = await captureStdout(async () => {
      await runRunsCommand({ ...parsed(['run-a', 'run-b'], 'html') }, tmpDir);
    });
    assert.ok(out.includes('coverage: partial'), 'partial coverage chip still rendered');
    assert.ok(out.includes('suggestedLoopSignal: NO_SIGNAL'));
    assert.ok(!out.includes('suggestedLoopSignal: CONVERGED'));
    // The green banner background belongs to CONVERGED only.
    assert.ok(!out.includes('background:#e8f5e9'));
  });

  it('html dashboard keeps the green CONVERGED banner when coverage is complete', async () => {
    const out = await captureStdout(async () => {
      await runRunsCommand({ ...parsed(['run-a', 'run-c'], 'html') }, tmpDir);
    });
    assert.ok(out.includes('suggestedLoopSignal: CONVERGED'));
    assert.ok(out.includes('background:#e8f5e9'));
  });
});
