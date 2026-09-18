// Pins the Phase 8 activation measurement (#2252) so the numbers recorded in
// docs/development/2252-review-viewpoint-phase8-measurement.md cannot drift
// unnoticed.
//
// The expectations come from tests/fixtures/review-viewpoints/corpus.mjs, whose
// labels are hand-written from the obligation question rather than derived from
// the matcher. Both failure directions were exercised by mutation before this
// test was committed: renaming the emitted `dto-field-removed` kind dropped
// overall recall 88.2% -> 29.4%, and deleting the test-path exclusion in
// detectApiCompatibilitySignals dropped overall precision 100% -> 88.2%.

import assert from 'node:assert/strict';
import test from 'node:test';

import { measureActivation } from '../scripts/measure-review-viewpoints.mjs';
import { corpus } from './fixtures/review-viewpoints/corpus.mjs';

const KNOWN_MISSES = ['p09-request-dto-required-field-added'];

test('hand-labeled corpus covers both minimal and mixed diff shapes', () => {
  const shapes = new Set(corpus.map((fixture) => fixture.shape));
  assert.ok(shapes.has('minimal'));
  assert.ok(shapes.has('mixed'));
  assert.deepEqual(
    corpus.filter((fixture) => fixture.knownMiss).map((fixture) => fixture.id),
    KNOWN_MISSES
  );
});

test('review viewpoint activation has no false activations on the labeled corpus', async () => {
  const { overall, perFixture } = await measureActivation();

  assert.equal(overall.fp, 0, 'a viewpoint activated on a diff labeled as not needing it');
  assert.equal(overall.precision, 1);

  const unexpectedMisses = perFixture
    .filter((row) => !row.match && !KNOWN_MISSES.includes(row.id))
    .map((row) => row.id);
  assert.deepEqual(unexpectedMisses, [], 'new activation recall gap');

  // 15 fixtures x 3 viewpoints = 45 labeled pairs; 17 of them are positive.
  assert.equal(overall.tp + overall.fp + overall.fn + overall.tn, 45);
  assert.equal(overall.tp, 15);
  assert.equal(overall.fn, 2);
});
