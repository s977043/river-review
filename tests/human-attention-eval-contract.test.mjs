import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(
  here,
  'fixtures',
  'human-attention',
  'decision-surface-eval-cases.json'
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const repoRoot = path.join(here, '..');

describe('#2378 Human Attention evaluation contract', () => {
  it('keeps the v1 fixture set explicit and uniquely addressable', () => {
    assert.strictEqual(manifest.schemaVersion, '1');
    assert.strictEqual(manifest.evaluationId, 'rr-human-attention-decision-surface-v1');
    assert.strictEqual(manifest.comparison?.paired, true);
    assert.strictEqual(manifest.comparison?.sameUnderlyingReviewState, true);
    assert.strictEqual(manifest.comparison?.presentationOnly, true);
    assert.strictEqual(manifest.vocabularyBoundary?.humanReviewRequired, 'canonical-v1-signal');
    assert.strictEqual(
      manifest.vocabularyBoundary?.humanDecisionRequired,
      'not-applicable-in-v1'
    );

    assert.strictEqual(manifest.cases.length, 10);

    const ids = manifest.cases.map((item) => item.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.deepStrictEqual(ids, [
      'HA-01-clean',
      'HA-02-critical-major',
      'HA-03-minor-info-only',
      'HA-04-human-review-required',
      'HA-05-partial-coverage',
      'HA-06-not-executed',
      'HA-07-timeout-failure',
      'HA-08-team-lead-blind-spot',
      'HA-09-mixed-risk-and-coverage',
      'HA-10-legacy-no-coverage',
    ]);
  });

  it('requires every case to carry signals and an independent material reference', () => {
    for (const item of manifest.cases) {
      assert.ok(item.description, `${item.id}: description is required`);
      assert.ok(
        item.signals && typeof item.signals === 'object',
        `${item.id}: signals are required`
      );
      assert.ok(
        item.materialReference && typeof item.materialReference === 'object',
        `${item.id}: materialReference is required`
      );
      assert.ok(
        Object.keys(item.materialReference).length > 0,
        `${item.id}: materialReference must not be empty`
      );
    }
  });

  it('freezes fixture, material reference, and rubric before an evaluation run', () => {
    assert.strictEqual(manifest.freezePolicy?.fixtureSet, 'freeze-before-run');
    assert.strictEqual(manifest.freezePolicy?.materialReferenceSet, 'freeze-before-run');
    assert.strictEqual(manifest.freezePolicy?.rubric, 'freeze-before-run');
    assert.strictEqual(manifest.freezePolicy?.baselineCommit, 'freeze-at-run-start');
    assert.strictEqual(manifest.freezePolicy?.candidateCommit, 'freeze-at-run-start');
    assert.strictEqual(manifest.freezePolicy?.fixtureAdapter, 'freeze-at-run-start');
  });

  it('keeps one machine-readable fixture SSoT', () => {
    const obsoletePaths = [
      'docs/eval/human-attention-fixtures.yaml',
      'tests/fixtures/2378-decision-surface/cases.json',
      'tests/fixtures/2378-decision-surface/scorecard-template.yaml',
    ];

    for (const obsoletePath of obsoletePaths) {
      assert.strictEqual(
        existsSync(path.join(repoRoot, obsoletePath)),
        false,
        `obsolete Human Attention eval asset must stay removed: ${obsoletePath}`
      );
    }
  });

  it('keeps the legacy case fail-safe instead of inventing missing state', () => {
    const legacy = manifest.cases.find((item) => item.id === 'HA-10-legacy-no-coverage');
    assert.ok(legacy);
    assert.strictEqual(legacy.signals.coverageStatus, null);
    assert.strictEqual(legacy.materialReference.mustNotInventCoverageState, true);
    assert.strictEqual(legacy.materialReference.mustNotInventResolutionState, true);
    assert.strictEqual(legacy.materialReference.mustRemainBackwardCompatible, true);
  });
});
