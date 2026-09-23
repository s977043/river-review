import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { runEvaluation } from '../scripts/evaluate-human-attention.mjs';

const BASELINE = '53e7a9e89139827709da90c2a37c928a582e0b0d';
const CANDIDATE = '3a03f90a2fa7827dc5b59108805687e4535efab6';

function hasCommit(revision) {
  return (
    spawnSync('git', ['cat-file', '-e', `${revision}^{commit}`], {
      stdio: 'ignore',
    }).status === 0
  );
}

describe('#2382 Human Attention paired runner E2E', () => {
  let output;

  before(() => {
    const repoRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).stdout.trim();
    output = path.join(
      repoRoot,
      'artifacts',
      'evals',
      'human-attention',
      `test-${process.pid}-e2e`
    );
  });

  after(async () => {
    await rm(output, { recursive: true, force: true });
  });

  it(
    'runs the real frozen baseline/candidate pair without deterministic safety regressions',
    { timeout: 60_000, skip: !hasCommit(BASELINE) || !hasCommit(CANDIDATE) },
    async () => {
      const summary = await runEvaluation({
        baseline: BASELINE,
        candidate: CANDIDATE,
        fixtures: 'tests/fixtures/human-attention/decision-surface-eval-cases.json',
        output,
      });

      assert.strictEqual(summary.totalCases, 10);
      assert.strictEqual(summary.safetyRegressionCount, 0);
      assert.strictEqual(summary.deterministicSafetyPassed, true);
      assert.strictEqual(summary.humanAttentionImprovement, 'not_evaluated');
      assert.strictEqual(summary.nextState, 'READY_FOR_HUMAN_SCORING');

      const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
      assert.strictEqual(manifest.baselineCommit, BASELINE);
      assert.strictEqual(manifest.candidateCommit, CANDIDATE);
      assert.strictEqual(manifest.measurementMode, 'unavailable');
      assert.strictEqual(manifest.executionStatus, 'completed');
      assert.match(manifest.completedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.strictEqual(
        manifest.adapterHelperPath,
        'tests/helpers/render-result-fixtures.mjs'
      );
      assert.match(manifest.adapterHelperSha256, /^[a-f0-9]{64}$/);
      assert.strictEqual(
        manifest.scorecardPath,
        'tests/fixtures/human-attention/decision-surface-scorecard-template.yaml'
      );
      assert.match(manifest.scorecardSha256, /^[a-f0-9]{64}$/);

      const candidate = await readFile(
        path.join(output, 'HA-05-partial-coverage', 'candidate.md'),
        'utf8'
      );
      const baseline = await readFile(
        path.join(output, 'HA-05-partial-coverage', 'baseline.md'),
        'utf8'
      );

      assert.match(candidate, /レビュー網羅性: \*\*partial\*\*/);
      assert.doesNotMatch(
        baseline,
        /レビュー網羅性: \*\*partial\*\*/,
        'baseline must remain the pre-Decision-Surface presentation'
      );
    }
  );
});
