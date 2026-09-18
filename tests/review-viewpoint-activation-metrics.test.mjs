// Pins the Phase 8 activation measurement (#2252) so the numbers recorded in
// docs/development/2252-review-viewpoint-phase8-measurement.md cannot drift
// unnoticed.
//
// The expectations come from tests/fixtures/review-viewpoints/corpus.mjs, whose
// labels are hand-written from the obligation question rather than derived from
// the matcher. Three mutations were injected against THIS corpus before the
// Phase 8b expansion was committed, and each moved a different metric:
//   1. renaming the emitted `dto-field-removed` kind: overall recall drops
//   2. deleting the test-path exclusion in detectApiCompatibilitySignals:
//      overall precision drops below 100%
//   3. forcing `declarationScoped: true` unconditionally: the default band is
//      unchanged while the u0 band drops to 0.0% and the Phase 8a handwritten
//      rows alone stay at 88.2%. Mutation 3 is the evidence that the band rows
//      added here are load-bearing.
// The measured figures are recorded in the Phase 8b section of the doc above.

import assert from 'node:assert/strict';
import test from 'node:test';

import { measureActivation } from '../scripts/measure-review-viewpoints.mjs';
import { BANDS, corpus } from './fixtures/review-viewpoints/corpus.mjs';

// Every row the current implementation is known not to reach. Each one is a
// recall gap in the catalog or the detector, not a weakened label.
const KNOWN_MISSES = [
  'p09-request-dto-required-field-added',
  // combined diff (`@@@`), first-parent order: the parse layer resolves the
  // file, the hunk body and addedLines, but detectApiCompatibilitySignals reads
  // hunk.lines assuming a 1-character prefix column. When the change marker
  // lands in column 2 the line reads as context. The `--cc-reverse` rows are
  // the SAME merge from the other side, where the marker lands in column 1 and
  // the same obligations do activate.
  'b01-response-dto-field-removed--cc',
  'b02-requiredness-tightened--cc',
  'b03-optional-field-added--cc',
  'b04-contract-named-outside-api-path--cc',
  // --unified=0: the declaration-based fallback is hunk-scoped, so a contract
  // outside an api/dto/contract path is invisible once the `interface ...`
  // line is no longer carried as context.
  'b04-contract-named-outside-api-path--u0',
  // real commits: `ReviewOptions` / `SkillSelectionResult` are contract-shaped
  // but neither the path nor the declaration name matches the detector's
  // conservative v1 allow-lists.
  'rc01-node-api-review-options-optional-field-default',
  'rc02-node-api-review-options-optional-field-u0',
  'rc03-skill-selection-result-optional-field-default',
  'rc04-skill-selection-result-optional-field-u0',
];

// Scenarios whose activated set is NOT identical across the three bands.
const KNOWN_BAND_DISAGREEMENTS = [
  'b01-response-dto-field-removed',
  'b02-requiredness-tightened',
  'b03-optional-field-added',
  'b04-contract-named-outside-api-path',
];

test('hand-labeled corpus covers both minimal and mixed diff shapes', () => {
  const shapes = new Set(corpus.map((fixture) => fixture.shape));
  assert.ok(shapes.has('minimal'));
  assert.ok(shapes.has('mixed'));
  assert.deepEqual(
    corpus.filter((fixture) => fixture.knownMiss).map((fixture) => fixture.id),
    ['p09-request-dto-required-field-added']
  );
});

test('corpus covers every input band and every corpus source', () => {
  for (const band of BANDS) {
    assert.ok(
      corpus.some((fixture) => fixture.band === band),
      `no fixture for band ${band}`
    );
  }
  for (const source of ['handwritten', 'generated-git', 'repo-commit']) {
    assert.ok(
      corpus.some((fixture) => fixture.source === source),
      `no fixture from source ${source}`
    );
  }
  // Every band row must express a scenario that exists in all three bands, so
  // a disagreement is always attributable to the band and not to the content.
  const byScenario = new Map();
  for (const fixture of corpus.filter((row) => row.bandOf)) {
    byScenario.set(fixture.bandOf, (byScenario.get(fixture.bandOf) ?? 0) + 1);
  }
  assert.ok(byScenario.size > 0);
  for (const [bandOf, count] of byScenario) {
    assert.equal(count, BANDS.length, `${bandOf} is not expressed in all bands`);
  }
});

test('review viewpoint activation has no false activations on the labeled corpus', async () => {
  const { overall, perFixture } = await measureActivation();

  assert.equal(overall.fp, 0, 'a viewpoint activated on a diff labeled as not needing it');
  assert.equal(overall.precision, 1);

  const unexpectedMisses = perFixture
    .filter((row) => !row.match && !KNOWN_MISSES.includes(row.id))
    .map((row) => row.id);
  assert.deepEqual(unexpectedMisses, [], 'new activation recall gap');

  const fixedMisses = KNOWN_MISSES.filter((id) =>
    perFixture.some((row) => row.id === id && row.match)
  );
  assert.deepEqual(fixedMisses, [], 'a known miss now activates; drop it from KNOWN_MISSES');

  // 46 fixtures x 3 viewpoints = 138 labeled pairs; 49 of them are positive.
  assert.equal(overall.tp + overall.fp + overall.fn + overall.tn, 138);
  assert.equal(overall.tp, 34);
  assert.equal(overall.fn, 15);
});

test('band disagreements are confined to the recorded scenarios', async () => {
  const { bandAgreement, perBand } = await measureActivation();

  assert.deepEqual(
    bandAgreement.filter((row) => !row.agrees).map((row) => row.bandOf),
    KNOWN_BAND_DISAGREEMENTS
  );

  // No band may produce a false activation. This is the check the combined
  // diff band exists for: #2308 made `@@@` hunk bodies visible to the matcher,
  // and the risk of that change is activation on diffs that should not raise
  // an obligation.
  for (const band of BANDS) {
    assert.equal(perBand[band].fp, 0, `false activation in band ${band}`);
  }
  assert.ok(perBand.default.recall > perBand.u0.recall);
  assert.ok(perBand.default.recall > perBand.cc.recall);
});

test('combined-diff activation depends on parent order (recorded, not endorsed)', async () => {
  const { ccColumnOrderAgreement } = await measureActivation();

  // Every positive scenario disagrees between the two directions of the same
  // merge, and every negative one agrees. Pinning both halves means a fix to
  // the prefix-column handling fails this test and has to update it.
  assert.deepEqual(
    ccColumnOrderAgreement.filter((row) => !row.agrees).map((row) => row.scenario),
    KNOWN_BAND_DISAGREEMENTS
  );
  for (const row of ccColumnOrderAgreement.filter((entry) => entry.agrees)) {
    assert.equal(row.byDirection.firstParent, '');
    assert.equal(row.byDirection.reverse, '');
  }
});
