import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { materializeHumanAttentionCase } from './fixtures/human-attention/decision-surface-eval-adapter.mjs';

const manifest = JSON.parse(
  readFileSync('tests/fixtures/human-attention/decision-surface-eval-cases.json', 'utf8')
);

describe('#2382 Human Attention fixture adapter', () => {
  it('materializes every canonical case without inventing unsupported state', () => {
    for (const evalCase of manifest.cases) {
      const result = materializeHumanAttentionCase(evalCase, {
        schemaVersion: manifest.schemaVersion,
      });

      assert.deepStrictEqual(
        result.findings.map((finding) => finding.id),
        evalCase.signals.findings.map((finding) => finding.id),
        `${evalCase.id}: finding identity must be preserved`
      );

      if (evalCase.signals.coverageStatus === null) {
        assert.strictEqual(
          Object.hasOwn(result, 'reviewCoverage'),
          false,
          `${evalCase.id}: absent coverage must stay absent`
        );
      } else {
        assert.strictEqual(result.reviewCoverage.status, evalCase.signals.coverageStatus);
      }

      if (evalCase.signals.coverageStatus === 'partial') {
        assert.strictEqual(
          result.reviewCoverage.incompleteRequiredUnitIds.length,
          evalCase.signals.incompleteUnitCount
        );
        assert.strictEqual(
          result.reviewCoverage.units.filter((unit) => unit.status === 'failed').length,
          evalCase.signals.failedUnitCount
        );
        assert.strictEqual(
          result.reviewCoverage.units.filter((unit) => unit.status === 'timed_out').length,
          evalCase.signals.timedOutUnitCount
        );
      }

      const humanReviewFiles = result.plan.riskAssessment?.humanReviewFiles ?? [];
      assert.strictEqual(
        humanReviewFiles.length,
        evalCase.signals.humanReviewFileCount ?? 0,
        `${evalCase.id}: human-review file count must be fixture-owned`
      );

      assert.strictEqual(
        result.teamLeadReport?.blindSpots?.length ?? 0,
        evalCase.signals.blindSpotCount ?? 0,
        `${evalCase.id}: blind-spot count must be fixture-owned`
      );
    }
  });

  it('fails closed on unknown signal keys', () => {
    const original = manifest.cases[0];
    const poisoned = {
      ...original,
      signals: { ...original.signals, humanDecisionRequired: true },
    };

    assert.throws(
      () => materializeHumanAttentionCase(poisoned, { schemaVersion: manifest.schemaVersion }),
      /unsupported key "humanDecisionRequired"/
    );
  });

  it('fails closed when partial coverage does not freeze every incomplete outcome', () => {
    const original = manifest.cases.find((item) => item.id === 'HA-05-partial-coverage');
    const ambiguous = {
      ...original,
      signals: {
        ...original.signals,
        incompleteUnitCount: 2,
        failedUnitCount: 1,
        timedOutUnitCount: 0,
      },
    };

    assert.throws(
      () => materializeHumanAttentionCase(ambiguous, { schemaVersion: manifest.schemaVersion }),
      /partial coverage must freeze failed\/timed_out outcomes/
    );
  });

  it('rejects unsupported manifest schema versions', () => {
    assert.throws(
      () => materializeHumanAttentionCase(manifest.cases[0], { schemaVersion: '2' }),
      /unsupported manifest schemaVersion/
    );
  });
});
