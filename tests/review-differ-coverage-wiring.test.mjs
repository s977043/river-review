// #2325 wiring tests.
//
// `review-differ.test.mjs` pins what `diffReviews` does when it IS given the
// current run's coverage. That is one layer inside the change: the value of
// this work depends on the CLI call sites actually passing it. Deleting the
// `currentCoverage` argument from `runs.mjs` and from `run.mjs` left every
// test green, so these tests exercise the call sites themselves — the `runs
// diff` handler end-to-end over real run records on disk, and the `run
// --baseline` helper with a run result that carries `reviewCoverage`.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runRunsCommand } from '../src/cli/commands/runs.mjs';
import { formatBaselineRegression } from '../src/cli/commands/run.mjs';
import { diffReviews, formatRegressionSummary } from '../src/lib/review-differ.mjs';
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

describe('runs diff passes the current run coverage through (#2325)', () => {
  let tmpDir;
  let storeDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-2325-'));
    storeDir = path.join(tmpDir, '.river', 'runs');
    await fs.mkdir(storeDir, { recursive: true });
    const write = (runId, timestamp, findings, reviewCoverage) =>
      fs.writeFile(
        path.join(storeDir, `${runId}.json`),
        JSON.stringify({ runId, timestamp, phase: 'upstream', findings, reviewCoverage }),
        'utf8'
      );
    // run-a reported the finding; run-b reports nothing, but one of its two
    // required review units timed out.
    await write('run-a', '2024-01-01T00:00:00Z', [makeFinding()], COMPLETE_COVERAGE);
    await write('run-b', '2024-01-02T00:00:00Z', [], PARTIAL_COVERAGE);
    await write('run-c', '2024-01-03T00:00:00Z', [], PARTIAL_COVERAGE);
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

  it('2-run json path reports the current run coverage', async () => {
    const out = await captureStdout(async () => {
      const code = await runRunsCommand({ ...parsed(['run-a', 'run-b'], 'json') }, tmpDir);
      assert.equal(code, 0);
    });
    const diff = JSON.parse(out);
    assert.equal(diff.summary.resolvedCount, 1);
    assert.equal(diff.summary.currentCoverageStatus, 'partial');
    assert.equal(diff.summary.absenceMayBeUnexecuted, true);
    assert.equal(diff.resolved[0].coverageStatus, 'partial');
    assert.equal(diff.resolved[0].basis, 'absent_from_current_run');
  });

  it('2-run text path warns that the run was partial', async () => {
    const out = await captureStdout(async () => {
      await runRunsCommand({ ...parsed(['run-a', 'run-b'], 'text') }, tmpDir);
    });
    assert.ok(out.includes('Current run coverage is `partial`'));
  });

  it('2-run html path degrades the resolved chip', async () => {
    const out = await captureStdout(async () => {
      await runRunsCommand({ ...parsed(['run-a', 'run-b'], 'html') }, tmpDir);
    });
    assert.ok(out.includes('coverage: partial'));
    assert.ok(out.includes('resolved 1*'));
    assert.doesNotMatch(out, /background:#2e7d32"[^>]*>resolved 1/);
  });

  it('3-run path (diffRunHistory) reports the latest run coverage', async () => {
    const out = await captureStdout(async () => {
      const code = await runRunsCommand({ ...parsed(['run-a', 'run-b', 'run-c'], 'json') }, tmpDir);
      assert.equal(code, 0);
    });
    const diff = JSON.parse(out);
    assert.equal(diff.summary.currentCoverageStatus, 'partial');
  });
});

describe('run --baseline passes the current run coverage through (#2325)', () => {
  it('warns when the completed run had partial coverage', () => {
    const md = formatBaselineRegression(
      { findings: [], reviewCoverage: PARTIAL_COVERAGE },
      { findings: [makeFinding()] },
      diffReviews,
      formatRegressionSummary
    );
    assert.ok(md.includes('Resolved findings'));
    assert.ok(md.includes('Current run coverage is `partial`'));
  });

  it('stays quiet when the completed run had complete coverage', () => {
    const md = formatBaselineRegression(
      { findings: [], reviewCoverage: COMPLETE_COVERAGE },
      [makeFinding()],
      diffReviews,
      formatRegressionSummary
    );
    assert.ok(md.includes('Absence is not by itself evidence of a fix.'));
    assert.ok(!md.includes('Current run coverage is'));
  });

  it('falls back to unknown when the result carries no coverage', () => {
    const md = formatBaselineRegression(
      { findings: [] },
      { findings: [makeFinding()] },
      diffReviews,
      formatRegressionSummary
    );
    assert.ok(md.includes('Current run coverage is `unknown`'));
  });
});
