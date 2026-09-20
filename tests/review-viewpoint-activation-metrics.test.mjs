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
//      unchanged while the u0 band drops and the Phase 8a handwritten rows
//      alone stay at 88.2%. Mutation 3 is the evidence that the band rows
//      added here are load-bearing.
//   4. (#2314) reverting the marker-column read to `line.startsWith('-')` /
//      `line.startsWith('+')`: the cc band drops from 100.0% to 50.0% and the
//      two directions of the same merge disagree again.
//   5. (#2314 review) trusting the declaration git prints in the hunk heading:
//      overall precision drops below 100% on the n07..n10 rows, in BOTH the
//      default and the u0 band. Those four rows are real git output and exist
//      only to hold that mutation down.
// The measured figures are recorded in the Phase 8b/8c sections of the doc
// above.

import assert from 'node:assert/strict';
import test from 'node:test';

import { measureActivation } from '../scripts/measure-review-viewpoints.mjs';
import { BANDS, corpus } from './fixtures/review-viewpoints/corpus.mjs';

// Every row the current implementation is known not to reach. Each one is a
// recall gap in the catalog or the detector, not a weakened label.
const KNOWN_MISSES = [
  'p09-request-dto-required-field-added',
  // --unified=0 with the contract declared outside an api/dto/contract path:
  // no context line carries the declaration, and the hunk heading that does
  // carry it is a funcname heuristic that cannot be trusted (see
  // hunkHasContractDeclaration). Closing this needs information the diff text
  // does not contain, so it stays a measured recall gap rather than a guess.
  'b04-contract-named-outside-api-path--u0',
  // real commits: `ReviewOptions` / `SkillSelectionResult` are contract-shaped
  // but neither the path nor the declaration name matches the detector's
  // conservative v1 allow-lists. Tracked separately from #2314, which fixed the
  // combined-diff column read and the u0 declaration scope.
  'rc01-node-api-review-options-optional-field-default',
  'rc02-node-api-review-options-optional-field-u0',
  'rc03-skill-selection-result-optional-field-default',
  'rc04-skill-selection-result-optional-field-u0',
];

// Scenarios whose activated set is NOT identical across the three bands.
// #2314 emptied this for the combined-diff scenarios. One entry remains: under
// `--unified=0` a contract declared outside an api/dto/contract path has no
// context line carrying the declaration, and the hunk heading that would carry
// it is not trustworthy evidence (see hunkHasContractDeclaration). Recorded as
// a measured gap, not endorsed.
const KNOWN_BAND_DISAGREEMENTS = ['b04-contract-named-outside-api-path'];

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

  // 50 fixtures x 3 viewpoints = 150 labeled pairs; 49 of them are positive.
  assert.equal(overall.tp + overall.fp + overall.fn + overall.tn, 150);
  assert.equal(overall.tp, 41);
  assert.equal(overall.fn, 8);
});

test('the stale-heading shapes stay negative in every band they appear in', async () => {
  const { perFixture } = await measureActivation();
  const staleHeadingRows = perFixture.filter((row) => /stale-heading/.test(row.id));

  // Real `git diff` output where git labels the hunk with an already-closed
  // contract declaration above the changed block. Reading that heading as
  // evidence activated all four (#2314 review).
  assert.equal(staleHeadingRows.length, 4);
  assert.deepEqual(new Set(staleHeadingRows.map((row) => row.band)), new Set(['default', 'u0']));
  for (const row of staleHeadingRows) {
    assert.deepEqual(row.expected, [], `${row.id} must be labeled negative`);
    assert.ok(row.match, `${row.id} false-activated`);
  }
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
  // #2314: the cc band no longer loses rows to the marker-column read. It now
  // reaches every positive it carries, so it is pinned at full recall rather
  // than as a band that trails `default`.
  assert.equal(perBand.cc.recall, 1);
});

test('combined-diff activation does not depend on parent order (#2314)', async () => {
  const { ccColumnOrderAgreement } = await measureActivation();

  // The corpus holds both directions of the same merge. Reading the marker
  // columns by `parentCount` makes the verdict identical whichever parent the
  // merge is read from; before #2314 every positive scenario here disagreed.
  assert.ok(ccColumnOrderAgreement.length > 0);
  assert.deepEqual(
    ccColumnOrderAgreement.filter((row) => !row.agrees).map((row) => row.scenario),
    []
  );
  // Agreement alone would also be satisfied by a detector that fires on
  // nothing, so pin that the positive scenarios agree on a NON-empty set.
  const nonEmpty = ccColumnOrderAgreement.filter((row) => row.byDirection.firstParent !== '');
  assert.equal(nonEmpty.length, 4);
  for (const row of nonEmpty) {
    assert.equal(row.byDirection.firstParent, row.byDirection.reverse);
  }
});
