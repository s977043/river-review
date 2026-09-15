import assert from 'node:assert/strict';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

import { observeReviewViewpoints } from '../src/lib/review-viewpoint-observer.mjs';
import { loadReviewViewpoints } from '../src/lib/review-viewpoints.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiCompatibilityViewpointsPath = path.join(
  repoRoot,
  'skills',
  'midstream',
  'api-compatibility',
  'references',
  'viewpoints.yaml'
);

async function loadApiCompatibilityViewpoints() {
  return loadReviewViewpoints(apiCompatibilityViewpointsPath, {
    expectedSkillId: 'api-compatibility',
  });
}

describe('observeReviewViewpoints', () => {
  test('returns no applicable viewpoints when there are no detector signals', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, []);

    assert.equal(observation.mode, 'observe');
    assert.equal(observation.skillId, 'api-compatibility');
    assert.deepEqual(observation.signals, []);
    assert.deepEqual(observation.applicableViewpoints, []);
    assert.deepEqual(observation.obligations, []);
    assert.deepEqual(observation.comparison, {
      detectorSignalCount: 0,
      mappedSignalCount: 0,
      unmappedSignalCount: 0,
      activatedViewpointCount: 0,
      obligationCount: 0,
      unmappedSignals: [],
    });
  });

  test('activates every viewpoint that declares a matching detector kind', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, [
      { kind: 'dto-field-removed', file: 'src/api/user.ts', line: 42 },
    ]);

    assert.deepEqual(
      observation.applicableViewpoints.map((viewpoint) => viewpoint.id),
      ['backward-compatibility', 'api-test-coverage']
    );
    assert.deepEqual(
      observation.obligations.map((obligation) => obligation.id),
      ['api-compatibility/backward-compatibility', 'api-compatibility/api-test-coverage']
    );
    assert.deepEqual(observation.comparison, {
      detectorSignalCount: 1,
      mappedSignalCount: 1,
      unmappedSignalCount: 0,
      activatedViewpointCount: 2,
      obligationCount: 2,
      unmappedSignals: [],
    });
  });

  test('deduplicates one viewpoint when multiple detector kinds activate it', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, [
      { kind: 'api-contract-changed', file: 'src/api/user.ts', line: 10 },
      { kind: 'dto-field-removed', file: 'src/api/user.ts', line: 42 },
    ]);

    const backwardCompatibility = observation.obligations.find(
      (obligation) => obligation.viewpointId === 'backward-compatibility'
    );

    assert.ok(backwardCompatibility);
    assert.deepEqual(backwardCompatibility.activation.matchedKinds, [
      'api-contract-changed',
      'dto-field-removed',
    ]);
    assert.equal(
      observation.obligations.filter(
        (obligation) => obligation.viewpointId === 'backward-compatibility'
      ).length,
      1
    );
  });

  test('deduplicates identical detector evidence but preserves distinct locations', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, [
      { kind: 'dto-field-removed', file: 'src/api/user.ts', line: 42 },
      { kind: 'dto-field-removed', file: 'src/api/user.ts', line: 42 },
      { kind: 'dto-field-removed', file: 'src/api/order.ts', line: 9 },
    ]);

    assert.deepEqual(observation.signals, [
      { kind: 'dto-field-removed', file: 'src/api/user.ts', line: 42 },
      { kind: 'dto-field-removed', file: 'src/api/order.ts', line: 9 },
    ]);

    const backwardCompatibility = observation.obligations.find(
      (obligation) => obligation.viewpointId === 'backward-compatibility'
    );
    assert.equal(backwardCompatibility.activation.matchedSignals.length, 2);
  });

  test('keeps unmatched detector kinds observable and records them in comparison', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, [
      { kind: 'unmapped-detector-kind', file: 'src/api/user.ts', line: 1 },
    ]);

    assert.deepEqual(observation.signals, [
      { kind: 'unmapped-detector-kind', file: 'src/api/user.ts', line: 1 },
    ]);
    assert.deepEqual(observation.applicableViewpoints, []);
    assert.deepEqual(observation.obligations, []);
    assert.deepEqual(observation.comparison, {
      detectorSignalCount: 1,
      mappedSignalCount: 0,
      unmappedSignalCount: 1,
      activatedViewpointCount: 0,
      obligationCount: 0,
      unmappedSignals: [
        { kind: 'unmapped-detector-kind', file: 'src/api/user.ts', line: 1 },
      ],
    });
  });

  test('creates obligations as questions and evidence requirements, not findings or policy', async () => {
    const document = await loadApiCompatibilityViewpoints();
    const observation = observeReviewViewpoints(document, [
      { kind: 'dto-optional-field-added', file: 'src/api/user.ts', line: 17 },
    ]);

    assert.equal(observation.obligations.length, 1);
    const obligation = observation.obligations[0];
    assert.equal(obligation.viewpointId, 'optional-field-consumer-handling');
    assert.match(obligation.question, /optional field/);
    assert.ok(obligation.requiredEvidence.length > 0);
    assert.equal('finding' in obligation, false);
    assert.equal('severity' in obligation, false);
    assert.equal('gate' in obligation, false);
    assert.equal('onUnknown' in obligation, false);
  });

  test('fails loudly when detector results violate the existing kind contract', async () => {
    const document = await loadApiCompatibilityViewpoints();

    assert.throws(
      () => observeReviewViewpoints(document, [{ file: 'src/api/user.ts', line: 1 }]),
      /requires a non-empty kind/
    );
    assert.throws(() => observeReviewViewpoints(document, 'not-an-array'), /must be an array/);
  });
});
