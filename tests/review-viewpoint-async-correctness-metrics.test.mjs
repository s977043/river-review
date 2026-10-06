// Pins the async-correctness activation measurement (#2252 Phase 7).
//
// The expectations come from tests/fixtures/review-viewpoints/async-correctness-corpus.mjs,
// whose labels are hand-written from the obligation question rather than
// derived from the producer. Mutations injected against THIS corpus before it
// was committed, and the metric each one moved:
//   1. renaming the emitted `async-call-floating` kind: overall recall drops
//   2. deleting the test-path exclusion in detectAsyncCorrectnessSignals:
//      overall precision drops below 100% (an03)
//   3. deleting the `await` / `void` prefix check: overall precision drops
//      below 100% (an01, an02, ab04, ab05)

import assert from 'node:assert/strict';
import test from 'node:test';

import { measureActivation } from '../scripts/measure-review-viewpoints.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { detectAsyncCorrectnessSignals } from '../src/lib/async-correctness-signals.mjs';
import { BANDS, corpus } from './fixtures/review-viewpoints/async-correctness-corpus.mjs';

const SKILL_ID = 'async-correctness';

// Rows the current producer is known not to reach. The callee's `async`
// declaration is not in the diff text (imported, or outside a --unified=0
// hunk), and v1 does not guess asyncness from names.
const KNOWN_MISSES = [
  'ap02-skill-fixture-imported-callees',
  'ab01-condition-unawaited--u0',
  'ab03-return-in-try-unawaited--u0',
];

const KNOWN_BAND_DISAGREEMENTS = ['ab01-condition-unawaited', 'ab03-return-in-try-unawaited'];

test('async-correctness corpus covers both diff shapes, every band, and every source', () => {
  const shapes = new Set(corpus.map((fixture) => fixture.shape));
  assert.ok(shapes.has('minimal'));
  assert.ok(shapes.has('mixed'));
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
  assert.deepEqual(
    corpus.filter((fixture) => fixture.knownMiss).map((fixture) => fixture.id),
    ['ap02-skill-fixture-imported-callees']
  );
});

test('async-correctness activation has no false activations on the labeled corpus', async () => {
  const { overall, perFixture, perBand } = await measureActivation({ skillId: SKILL_ID });

  assert.equal(overall.fp, 0, 'a viewpoint activated on a diff labeled as not needing it');
  assert.equal(overall.precision, 1);
  for (const band of BANDS) {
    assert.equal(perBand[band].fp, 0, `false activation in band ${band}`);
  }

  const unexpectedMisses = perFixture
    .filter((row) => !row.match && !KNOWN_MISSES.includes(row.id))
    .map((row) => row.id);
  assert.deepEqual(unexpectedMisses, [], 'new activation recall gap');

  const fixedMisses = KNOWN_MISSES.filter((id) =>
    perFixture.some((row) => row.id === id && row.match)
  );
  assert.deepEqual(fixedMisses, [], 'a known miss now activates; drop it from KNOWN_MISSES');

  // 41 fixtures x 4 viewpoints = 164 labeled pairs; 21 of them are positive.
  assert.equal(overall.tp + overall.fp + overall.fn + overall.tn, 164);
  assert.equal(overall.tp, 17);
  assert.equal(overall.fn, 4);
});

test('async-correctness band disagreements are confined to the recorded scenarios', async () => {
  const { bandAgreement, ccColumnOrderAgreement } = await measureActivation({
    skillId: SKILL_ID,
  });

  assert.deepEqual(
    bandAgreement.filter((row) => !row.agrees).map((row) => row.bandOf),
    KNOWN_BAND_DISAGREEMENTS
  );
  assert.deepEqual(
    ccColumnOrderAgreement.filter((row) => !row.agrees).map((row) => row.scenario),
    []
  );
  const nonEmpty = ccColumnOrderAgreement.filter((row) => row.byDirection.firstParent !== '');
  assert.equal(nonEmpty.length, 3);
});

test('async-correctness signals anchor only on lines the parse layer counts as added', () => {
  // The producer reads hunk bodies through classifyHunkBodyLine, the same
  // classifier parseUnifiedDiff uses for addedLines. Cross-check against the
  // parse layer's output rather than against the producer itself.
  let checked = 0;
  for (const fixture of corpus) {
    const diff = parseUnifiedDiff(fixture.diff);
    const addedByFile = new Map(diff.files.map((file) => [file.path, new Set(file.addedLines)]));
    for (const signal of detectAsyncCorrectnessSignals({ diff })) {
      assert.ok(
        addedByFile.get(signal.file)?.has(signal.line),
        `${fixture.id}: ${signal.kind} anchored on ${signal.file}:${signal.line}, not an added line`
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});
