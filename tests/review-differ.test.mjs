import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffReviews,
  diffRunHistory,
  formatRegressionSummary,
  RESOLVED_BASIS,
} from '../src/lib/review-differ.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';

function makeFinding(overrides = {}) {
  return {
    id: 'rr-1',
    ruleId: 'null-safety',
    file: 'src/foo.mjs',
    lineStart: 10,
    lineEnd: 10,
    title: 'Possible null dereference in foo',
    message:
      'Finding: null-check Evidence: obj.foo called without guard here Impact: crash Fix: guard Severity: major Confidence: high',
    severity: 'major',
    confidence: 'high',
    status: 'open',
    evidence: ['obj.foo called without guard'],
    ...overrides,
  };
}

describe('diffReviews', () => {
  it('all-new when previous is empty', () => {
    const curr = [
      makeFinding(),
      makeFinding({
        ruleId: 'sql-injection',
        file: 'src/bar.mjs',
        message:
          'Finding: sql Evidence: query concat Impact: injection Fix: parameterize Severity: critical Confidence: high',
      }),
    ];
    const diff = diffReviews([], curr);
    assert.equal(diff.new.length, 2);
    assert.equal(diff.resolved.length, 0);
    assert.equal(diff.persisting.length, 0);
    assert.equal(diff.summary.newCount, 2);
  });

  it('all-resolved when current is empty', () => {
    const prev = [makeFinding()];
    const diff = diffReviews(prev, []);
    assert.equal(diff.resolved.length, 1);
    assert.equal(diff.new.length, 0);
    assert.equal(diff.summary.resolvedCount, 1);
  });

  it('persisting when same finding appears in both', () => {
    const f = makeFinding();
    const diff = diffReviews([f], [f]);
    assert.equal(diff.persisting.length, 1);
    assert.equal(diff.new.length, 0);
    assert.equal(diff.resolved.length, 0);
  });

  it('line number change does not create new finding', () => {
    const prev = makeFinding({ lineStart: 10, lineEnd: 10 });
    const curr = makeFinding({ lineStart: 25, lineEnd: 25 });
    const diff = diffReviews([prev], [curr]);
    assert.equal(diff.persisting.length, 1, 'should be persisting, not new');
    assert.equal(diff.new.length, 0);
  });

  it('score_changed when confidence changes', () => {
    const prev = makeFinding({ confidence: 'low' });
    const curr = makeFinding({ confidence: 'high' });
    const diff = diffReviews([prev], [curr]);
    // Score difference between low(0.4) and high(0.9) > threshold 0.05
    assert.equal(diff.scoreChanged.length, 1);
    assert.equal(diff.scoreChanged[0].changeStatus, 'score_changed');
    assert.ok(diff.scoreChanged[0].scoreDelta > 0, 'positive delta when confidence improves');
  });

  it('regression score = new - resolved', () => {
    const prev = [makeFinding()];
    const curr = [
      makeFinding({
        ruleId: 'sql-injection',
        file: 'src/bar.mjs',
        message:
          'Finding: sql Evidence: query concat here Impact: injection Fix: param Severity: critical Confidence: high',
      }),
      makeFinding({
        ruleId: 'path-traversal',
        file: 'src/baz.mjs',
        message:
          'Finding: path Evidence: user path used directly Impact: traversal Fix: sanitize Severity: critical Confidence: high',
      }),
    ];
    const diff = diffReviews(prev, curr);
    assert.equal(diff.summary.regressionScore, 2 - 1);
  });

  it('handles null/undefined inputs gracefully', () => {
    const diff = diffReviews(null, null);
    assert.equal(diff.new.length, 0);
    assert.equal(diff.resolved.length, 0);
    assert.equal(diff.summary.totalPrevious, 0);
  });

  it('each compared finding has fingerprint', () => {
    const prev = [makeFinding()];
    const curr = [makeFinding()];
    const diff = diffReviews(prev, curr);
    for (const f of [...diff.new, ...diff.resolved, ...diff.persisting, ...diff.scoreChanged]) {
      assert.ok(typeof f.fingerprint === 'string' && f.fingerprint.length > 0);
    }
  });
});

describe('diffRunHistory', () => {
  function makeRecord(runId, timestamp, findings) {
    return { runId, timestamp, findings };
  }

  it('3 runs: resolved then re-appeared → oscillated 1 finding', () => {
    const f = makeFinding();
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = makeRecord('run-2', '2024-01-02T00:00:00Z', []); // resolved
    const run3 = makeRecord('run-3', '2024-01-03T00:00:00Z', [f]); // re-appeared
    const result = diffRunHistory([run1, run2, run3]);
    assert.equal(result.oscillated.length, 1, 'should detect 1 oscillating finding');
    assert.equal(result.oscillated[0].changeStatus, 'oscillated');
    assert.equal(result.summary.oscillatedCount, 1);
    // timeline should have 3 entries
    assert.equal(result.oscillated[0].timeline.length, 3);
    assert.deepEqual(
      result.oscillated[0].timeline.map((t) => t.present),
      [true, false, true]
    );
  });

  it('3 runs: monotonic improvement (new→resolved, never re-appears) → oscillated 0', () => {
    const f = makeFinding();
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = makeRecord('run-2', '2024-01-02T00:00:00Z', [f]);
    const run3 = makeRecord('run-3', '2024-01-03T00:00:00Z', []); // resolved in run3
    const result = diffRunHistory([run1, run2, run3]);
    assert.equal(result.oscillated.length, 0);
    assert.equal(result.summary.oscillatedCount, 0);
  });

  it('2 runs only → oscillated always empty', () => {
    const f = makeFinding();
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = makeRecord('run-2', '2024-01-02T00:00:00Z', []);
    const result = diffRunHistory([run1, run2]);
    assert.equal(result.oscillated.length, 0);
    assert.equal(result.summary.oscillatedCount, 0);
  });

  it('timestamp out-of-order input still detects oscillation correctly', () => {
    const f = makeFinding();
    // Provide in reverse order: run3, run1, run2 — should sort and detect
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = makeRecord('run-2', '2024-01-02T00:00:00Z', []); // resolved
    const run3 = makeRecord('run-3', '2024-01-03T00:00:00Z', [f]); // re-appeared
    const result = diffRunHistory([run3, run1, run2]); // shuffled
    assert.equal(result.oscillated.length, 1, 'should detect oscillation despite unordered input');
    assert.deepEqual(
      result.oscillated[0].timeline.map((t) => t.runId),
      ['run-1', 'run-2', 'run-3']
    );
  });

  it('missing timestamp: oscillation result is deterministic', () => {
    const f = makeFinding();
    // run-a has no timestamp, run-b and run-c have valid timestamps
    const runA = makeRecord('run-a', undefined, [f]); // NaN timestamp → sorted last
    const runB = makeRecord('run-b', '2024-01-01T00:00:00Z', []); // resolved
    const runC = makeRecord('run-c', '2024-01-02T00:00:00Z', [f]); // re-appeared
    // Call twice to confirm same result (no oscillation based on random order)
    const result1 = diffRunHistory([runA, runB, runC]);
    const result2 = diffRunHistory([runC, runA, runB]);
    assert.equal(result1.oscillated.length, result2.oscillated.length, 'deterministic');
    // run-a sorted last (NaN→end), order is run-b, run-c, run-a
    // timeline for f: [false(b), true(c), true(a)] → no oscillation (no absent after first present-to-absent)
    // actually: present=false(b), present=true(c), present=true(a) — no oscillation
    assert.equal(result1.oscillated.length, 0);
  });

  it('same timestamp: tie-break by runId ensures stable order', () => {
    const f = makeFinding();
    const sameTs = '2024-01-01T00:00:00Z';
    const runA = makeRecord('run-a', sameTs, [f]); // present
    const runB = makeRecord('run-b', sameTs, []); // absent
    const runC = makeRecord('run-c', sameTs, [f]); // present
    // runId lexicographic: run-a < run-b < run-c
    // timeline: [true, false, true] → oscillation detected
    const result = diffRunHistory([runC, runA, runB]); // shuffled
    assert.equal(result.oscillated.length, 1, 'same-timestamp tie-break by runId');
    assert.deepEqual(
      result.oscillated[0].timeline.map((t) => t.runId),
      ['run-a', 'run-b', 'run-c']
    );
  });

  it('all missing timestamps: tie-break by runId keeps determinism', () => {
    const f = makeFinding();
    // undefined and 'not-a-date' both produce NaN; null is also handled (see dedicated null test)
    const runA = makeRecord('run-a', undefined, [f]);
    const runB = makeRecord('run-b', 'bad-date', []);
    const runC = makeRecord('run-c', 'not-a-date', [f]);
    // All NaN → sorted by runId: run-a, run-b, run-c
    const result1 = diffRunHistory([runA, runB, runC]);
    const result2 = diffRunHistory([runC, runB, runA]);
    assert.equal(
      result1.oscillated.length,
      result2.oscillated.length,
      'deterministic with all NaN'
    );
    assert.equal(result1.oscillated.length, 1, 'oscillation still detected via runId order');
    assert.deepEqual(
      result1.oscillated[0].timeline.map((t) => t.runId),
      ['run-a', 'run-b', 'run-c']
    );
  });

  it('null timestamp treated as NaN (not epoch 0), sorted after valid timestamps', () => {
    const f = makeFinding();
    // null timestamp must NOT be treated as epoch 0 (1970-01-01); it should go to the end
    const runA = makeRecord('run-a', '2024-01-01T00:00:00Z', [f]); // earliest valid
    const runB = makeRecord('run-b', '2024-01-02T00:00:00Z', []); // resolved
    const runC = makeRecord('run-c', null, [f]); // null → NaN → sorted last
    // sorted order should be: run-a, run-b, run-c
    // timeline: [true(a), false(b), true(c)] → oscillation
    const result1 = diffRunHistory([runA, runB, runC]);
    const result2 = diffRunHistory([runC, runB, runA]);
    assert.equal(result1.oscillated.length, 1, 'null timestamp goes last, oscillation detected');
    assert.equal(
      result1.oscillated.length,
      result2.oscillated.length,
      'deterministic regardless of input order'
    );
    assert.deepEqual(
      result1.oscillated[0].timeline.map((t) => t.runId),
      ['run-a', 'run-b', 'run-c']
    );
  });

  it('last adjacent diff fields are still present', () => {
    const f = makeFinding();
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = makeRecord('run-2', '2024-01-02T00:00:00Z', []);
    const run3 = makeRecord('run-3', '2024-01-03T00:00:00Z', [f]);
    const result = diffRunHistory([run1, run2, run3]);
    // last diff is run2→run3 where finding re-appeared (new)
    assert.ok(Array.isArray(result.new));
    assert.ok(Array.isArray(result.resolved));
    assert.ok(typeof result.summary.newCount === 'number');
  });
});

describe('formatRegressionSummary', () => {
  it('includes summary table', () => {
    const diff = diffReviews([], [makeFinding()]);
    const md = formatRegressionSummary(diff);
    assert.ok(md.includes('## Regression Review Summary'));
    assert.ok(md.includes('New findings'));
    assert.ok(md.includes('Resolved findings'));
  });

  it('lists new findings with severity', () => {
    const diff = diffReviews([], [makeFinding({ severity: 'critical' })]);
    const md = formatRegressionSummary(diff);
    assert.ok(md.includes('[critical]'));
  });

  it('lists resolved findings with strikethrough', () => {
    const diff = diffReviews([makeFinding()], []);
    const md = formatRegressionSummary(diff);
    assert.ok(md.includes('~~'));
  });
});

// #2325: `changeStatus: 'resolved'` measures absence, not resolution. These
// tests pin the qualifying data that lets a consumer tell a fix apart from a
// review unit that never completed. Before this change, a run where the
// reviewer timed out and a run where the finding was genuinely fixed produced
// byte-identical diffs.
describe('diffReviews absence qualification (#2325)', () => {
  const completeCoverage = deriveReviewCoverage([
    { id: 'u-a', status: 'completed' },
    { id: 'u-b', status: 'completed' },
  ]);
  const makeRecord = (runId, timestamp, findings) => ({ runId, timestamp, findings });
  const partialCoverage = deriveReviewCoverage([
    { id: 'u-a', status: 'timed_out' },
    { id: 'u-b', status: 'completed' },
  ]);

  it('labels every resolved entry with the basis of the judgement', () => {
    const diff = diffReviews([makeFinding()], [], { currentCoverage: completeCoverage });
    assert.equal(diff.resolved.length, 1);
    assert.equal(diff.resolved[0].changeStatus, 'resolved');
    assert.equal(diff.resolved[0].basis, RESOLVED_BASIS);
    assert.equal(diff.resolved[0].basis, 'absent_from_current_run');
    assert.equal(diff.summary.resolvedBasis, 'absent_from_current_run');
  });

  it('distinguishes a genuine fix from an incomplete run', () => {
    const fixed = diffReviews([makeFinding()], [], { currentCoverage: completeCoverage });
    const timedOut = diffReviews([makeFinding()], [], { currentCoverage: partialCoverage });

    // Both still report one absence: presence data is unchanged.
    assert.equal(fixed.summary.resolvedCount, 1);
    assert.equal(timedOut.summary.resolvedCount, 1);

    // The qualifier is what separates them.
    assert.equal(fixed.summary.currentCoverageStatus, 'complete');
    assert.equal(fixed.summary.absenceMayBeUnexecuted, false);
    assert.equal(fixed.resolved[0].coverageStatus, 'complete');

    assert.equal(timedOut.summary.currentCoverageStatus, 'partial');
    assert.equal(timedOut.summary.absenceMayBeUnexecuted, true);
    assert.equal(timedOut.resolved[0].coverageStatus, 'partial');
  });

  it('treats missing or malformed coverage as unknown, never as complete', () => {
    for (const coverage of [undefined, null, {}, { status: 'nonsense' }]) {
      const diff = diffReviews([makeFinding()], [], { currentCoverage: coverage });
      assert.equal(diff.summary.currentCoverageStatus, 'unknown');
      assert.equal(diff.summary.absenceMayBeUnexecuted, true);
      assert.equal(diff.resolved[0].coverageStatus, 'unknown');
    }
    // Callers that pass no options at all get the same fail-safe.
    const bare = diffReviews([makeFinding()], []);
    assert.equal(bare.summary.currentCoverageStatus, 'unknown');
    assert.equal(bare.summary.absenceMayBeUnexecuted, true);
  });

  it('diffRunHistory qualifies absences with the latest run coverage', () => {
    const f = makeFinding();
    const run1 = makeRecord('run-1', '2024-01-01T00:00:00Z', [f]);
    const run2 = {
      ...makeRecord('run-2', '2024-01-02T00:00:00Z', []),
      reviewCoverage: partialCoverage,
    };
    const result = diffRunHistory([run1, run2]);
    assert.equal(result.summary.resolvedCount, 1);
    assert.equal(result.summary.currentCoverageStatus, 'partial');
    assert.equal(result.resolved[0].coverageStatus, 'partial');
  });

  it('formatRegressionSummary states the basis and warns on incomplete coverage', () => {
    const complete = formatRegressionSummary(
      diffReviews([makeFinding()], [], { currentCoverage: completeCoverage })
    );
    assert.ok(complete.includes('Absence is not by itself evidence of a fix.'));
    assert.ok(!complete.includes('Current run coverage is'));

    const partial = formatRegressionSummary(
      diffReviews([makeFinding()], [], { currentCoverage: partialCoverage })
    );
    assert.ok(partial.includes('Absence is not by itself evidence of a fix.'));
    assert.ok(partial.includes('Current run coverage is `partial`'));
  });
});
