import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  EvaluationError,
  assertDistinctCommits,
  assertEnvironmentCompatible,
  classifyChangedPaths,
  deterministicScore,
  parseArgs,
  removeWorktree,
} from '../scripts/evaluate-human-attention.mjs';
import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';
import { adaptHumanAttentionCase } from './fixtures/human-attention/decision-surface-eval-adapter.mjs';

const manifest = JSON.parse(
  readFileSync('tests/fixtures/human-attention/decision-surface-eval-cases.json', 'utf8')
);

describe('#2382 Human Attention paired runner contract', () => {
  it('requires distinct baseline and candidate refs plus an output path', () => {
    assert.deepStrictEqual(
      parseArgs([
        '--baseline',
        'abc',
        '--candidate',
        'def',
        '--output',
        'artifacts/evals/human-attention/test',
      ]),
      {
        baseline: 'abc',
        candidate: 'def',
        output: 'artifacts/evals/human-attention/test',
        fixtures: 'tests/fixtures/human-attention/decision-surface-eval-cases.json',
        measurementMode: 'unavailable',
      }
    );

    assert.throws(
      () => assertDistinctCommits('same', 'same'),
      (error) => error instanceof EvaluationError && error.code === 'USAGE'
    );
  });

  it('fails closed on unknown arguments and unsupported measurement modes', () => {
    assert.throws(() => parseArgs(['--wat']), /unknown argument/);
    assert.throws(
      () =>
        parseArgs([
          '--baseline',
          'abc',
          '--candidate',
          'def',
          '--output',
          'out',
          '--measurement-mode',
          'zero',
        ]),
      /measurement-mode/
    );
  });

  it('rejects only paired-condition lockfile or Node requirement drift', () => {
    const frozen = { packageLockSha256: 'lock-a', nodeRequirement: '22.x' };

    assert.doesNotThrow(() => assertEnvironmentCompatible(frozen, frozen));
    assert.throws(
      () =>
        assertEnvironmentCompatible(frozen, {
          packageLockSha256: 'lock-b',
          nodeRequirement: '22.x',
        }),
      (error) => error instanceof EvaluationError && error.code === 'INCONCLUSIVE_ENVIRONMENT'
    );
    assert.throws(
      () =>
        assertEnvironmentCompatible(frozen, {
          packageLockSha256: 'lock-a',
          nodeRequirement: '24.x',
        }),
      /Node engine requirement differs/
    );
  });

  it('allows only the frozen presentation delta paths', () => {
    const scope = classifyChangedPaths([
      'src/cli/render.mjs',
      'tests/render-markdown-digest.test.mjs',
      'docs/adr/012-human-attention-architecture.md',
      'runners/github-action/dist/index.mjs',
      'runners/github-action/dist/index.mjs.map',
      'docs/development/unrelated-eval-oracle.md',
      'tests/fixtures/human-attention/decision-surface-eval-adapter.mjs',
      'src/lib/run-gate.mjs',
    ]);

    assert.deepStrictEqual(scope.unrelated, [
      'docs/development/unrelated-eval-oracle.md',
      'tests/fixtures/human-attention/decision-surface-eval-adapter.mjs',
      'src/lib/run-gate.mjs',
    ]);
    assert.deepStrictEqual(scope.allowed, [
      'src/cli/render.mjs',
      'tests/render-markdown-digest.test.mjs',
      'docs/adr/012-human-attention-architecture.md',
      'runners/github-action/dist/index.mjs',
      'runners/github-action/dist/index.mjs.map',
    ]);
  });

  it('adapts canonical signals without inventing unsupported semantics', () => {
    const result = adaptHumanAttentionCase({
      id: 'HA-test',
      signals: {
        findings: [{ id: 'RR-TEST-1', severity: 'major' }],
        humanReviewRequired: true,
        humanReviewFileCount: 1,
        coverageStatus: 'partial',
        incompleteUnitCount: 1,
        failedUnitCount: 0,
        timedOutUnitCount: 1,
        blindSpotCount: 1,
      },
      materialReference: {},
    });

    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(result.plan.riskAssessment.aggregateAction, 'require_human_review');
    assert.strictEqual(result.reviewCoverage.status, 'partial');
    assert.strictEqual(result.reviewCoverage.units[0].status, 'timed_out');
    assert.strictEqual(result.teamLeadReport.blindSpots.length, 1);

    assert.throws(
      () =>
        adaptHumanAttentionCase({
          id: 'HA-unknown',
          signals: { findings: [], speculativeDecision: true },
        }),
      /unsupported Human Attention signal/
    );
  });

  it('materializes all canonical fixtures into schema-valid machine-readable output', () => {
    const validate = getOutputSchemaValidator();
    assert.ok(validate, 'output schema validator must load');

    for (const caseDefinition of manifest.cases) {
      const result = adaptHumanAttentionCase(caseDefinition);
      const artifact = formatJsonOutput(result, 'midstream');
      assert.equal(
        validate(artifact),
        true,
        `${caseDefinition.id}: ${JSON.stringify(validate.errors, null, 2)}`
      );
    }
  });

  it('fails closed when the frozen material reference adds an unsupported key', () => {
    const caseDefinition = {
      id: 'HA-unsupported-material',
      signals: { findings: [] },
      materialReference: { futureSafetyInvariant: true },
    };
    const markdown = '<!-- river-review -->\n**判定: approve**';

    assert.throws(
      () => deterministicScore(caseDefinition, markdown, markdown),
      (error) => error instanceof EvaluationError && error.code === 'UNSUPPORTED_MATERIAL_REFERENCE'
    );
  });

  it('detects an invented action count when severity must not be upgraded', () => {
    const caseDefinition = {
      id: 'HA-no-upgrade',
      signals: {
        findings: [{ id: 'RR-MINOR-1', severity: 'minor' }],
      },
      materialReference: {
        requiredActionCount: 0,
        mustNotUpgradeSeverity: true,
        allFindingIds: ['RR-MINOR-1'],
      },
    };
    const baseline =
      '<!-- river-review -->\n**判定: approve** · 🟡 1（計 1 件）\nRR-MINOR-1\n- **Evidence:** x';
    const candidate =
      '<!-- river-review -->\n**判定: approve** · 🟡 1（計 1 件）\n- 要対応: **1 件**\nRR-MINOR-1\n- **Evidence:** x';

    const score = deterministicScore(caseDefinition, baseline, candidate);
    assert.deepStrictEqual(score.materialFailures, ['severity-upgraded-to-action-required']);
    assert.strictEqual(score.safetyRegression, true);
  });

  it('surfaces worktree cleanup failure instead of silently succeeding', () => {
    const missing = path.join(os.tmpdir(), `river-review-ha-not-a-worktree-${process.pid}`);
    const failure = removeWorktree(process.cwd(), missing);

    assert.ok(failure, 'missing worktree removal must be observable');
    assert.strictEqual(failure.targetPath, missing);
    assert.notStrictEqual(failure.status, 0);
    assert.ok(failure.error.length > 0);
  });

  it('never turns deterministic checks into a Human Attention improvement claim', () => {
    const caseDefinition = {
      id: 'HA-test',
      signals: { findings: [{ id: 'RR-TEST-1', severity: 'major' }] },
      materialReference: { allFindingIds: ['RR-TEST-1'] },
    };
    const baseline =
      '<!-- river-review -->\n**判定: request-changes**\nRR-TEST-1\n- **Evidence:** x';
    const candidate =
      '<!-- river-review -->\n**判定: request-changes**\nRR-TEST-1\n- **Evidence:** x';

    const score = deterministicScore(caseDefinition, baseline, candidate);
    assert.strictEqual(score.safetyRegression, false);
    assert.strictEqual(score.humanAttentionImprovementClaimed, false);
  });

  it('fails when both arms miss material reference data instead of treating baseline as oracle', () => {
    const caseDefinition = {
      id: 'HA-both-miss',
      signals: { coverageStatus: 'partial', findings: [] },
      materialReference: {
        coverageWarningRequired: true,
        coverageStatus: 'partial',
      },
    };
    const markdown = '<!-- river-review -->\n**判定: approve**';

    const score = deterministicScore(caseDefinition, markdown, markdown);
    assert.strictEqual(score.visibilityRegression.length, 0);
    assert.deepStrictEqual(score.materialFailures, ['coverage:partial']);
    assert.strictEqual(score.safetyRegression, true);
  });

  it('detects candidate-only visibility loss and verdict changes as safety regressions', () => {
    const caseDefinition = {
      id: 'HA-regression',
      signals: { findings: [{ id: 'RR-TEST-1', severity: 'major' }] },
      materialReference: { allFindingIds: ['RR-TEST-1'] },
    };
    const baseline =
      '<!-- river-review -->\n**判定: request-changes**\nRR-TEST-1\n- **Evidence:** x';
    const candidate = '<!-- river-review -->\n**判定: approve**';

    const score = deterministicScore(caseDefinition, baseline, candidate);
    assert.strictEqual(score.safetyRegression, true);
    assert.deepStrictEqual(score.visibilityRegression, ['finding:RR-TEST-1']);
    assert.ok(score.structuralFailures.some((item) => item.startsWith('verdict changed:')));
  });
});
