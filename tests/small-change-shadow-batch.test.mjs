import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assessSmallChangeBatch } from '../scripts/experiments/small-change-shadow-batch.mjs';

const SHA = 'a'.repeat(40);
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/small-change-merged-pr-metadata.json', import.meta.url), 'utf8')
);

function completeObservation() {
  return {
    subject: { headSha: SHA },
    change: { changedLines: 24, changedFiles: ['pages/guide.md'] },
    route: {
      headSha: SHA,
      selectedMode: 'light',
      policyApplied: true,
      riskAction: 'comment_only',
    },
    review: {
      headSha: SHA,
      state: 'completed',
      coverage: 'complete',
      majorOrCriticalCount: 0,
    },
    checks: { headSha: SHA, state: 'passed' },
    scope: {
      headSha: SHA,
      classifiedChangedFiles: ['pages/guide.md'],
      classificationComplete: true,
      sharedLibraryTouched: false,
      sensitiveAreaTouched: false,
      services: [{ name: 'docs', priorMergedPrs: 10 }],
    },
    policy: { maxServicesInclusive: 1, excludedPathPrefixes: [] },
  };
}

function batch(cases) {
  return {
    kind: 'small-change-shadow-batch/v1',
    repository: 's977043/river-review',
    cases,
  };
}

test('ten actual merged PR metadata observations never invent eligibility evidence', () => {
  const result = assessSmallChangeBatch(FIXTURE);
  assert.equal(result.total, 10);
  assert.deepEqual(result.counts, { candidate: 0, excluded: 2, unknown: 8 });
  assert.equal(result.candidateShare, null);
  assert.deepEqual(
    result.results.filter((entry) => entry.status === 'excluded').map((entry) => entry.pr),
    [2710, 2709]
  );
  assert.ok(
    result.results.every(
      (entry) =>
        entry.status !== 'candidate' &&
        entry.reasonCodes.includes('missing-or-stale-route') &&
        entry.reasonCodes.includes('risk-policy-not-verified')
    )
  );
  assert.equal(result.authorizesApproval, false);
  assert.equal(result.evidenceTrust, 'unverified-input');
});

test('a complete synthetic self-report remains an unverified shadow candidate', () => {
  const result = assessSmallChangeBatch(
    batch([{ pr: 1, observation: completeObservation() }])
  );
  assert.deepEqual(result.counts, { candidate: 1, excluded: 0, unknown: 0 });
  assert.equal(result.candidateShare, 1);
  assert.equal(result.authorizesApproval, false);
  assert.equal(result.evidenceTrust, 'unverified-input');
});

test('a single incomplete case makes candidate share unknown, not a diluted rate', () => {
  const result = assessSmallChangeBatch(
    batch([
      { pr: 1, observation: completeObservation() },
      { pr: 2, observation: { subject: { headSha: SHA } } },
    ])
  );
  assert.deepEqual(result.counts, { candidate: 1, excluded: 0, unknown: 1 });
  assert.equal(result.candidateShare, null);
  assert.equal(result.results[1].status, 'unknown');
});

test('unknown cases may not be dropped from the reported denominator', () => {
  const result = assessSmallChangeBatch(
    batch([
      { pr: 1, observation: completeObservation() },
      {
        pr: 2,
        observation: {
          ...completeObservation(),
          review: { ...completeObservation().review, state: 'skipped' },
        },
      },
    ])
  );
  assert.equal(result.total, 2);
  assert.equal(result.candidateShare, null);
});

test('repeated or invalid PR identities reject the batch', () => {
  assert.throws(
    () => assessSmallChangeBatch(batch([{ pr: 1, observation: {} }, { pr: 1, observation: {} }])),
    /invalid-or-duplicate-case/
  );
  assert.throws(() => assessSmallChangeBatch(batch([{ pr: 0, observation: {} }])), /invalid/);
  assert.throws(() => assessSmallChangeBatch(batch([{ pr: 1 }])), /invalid/);
});

test('empty, oversized and malformed batches reject rather than report false zeroes', () => {
  assert.throws(() => assessSmallChangeBatch(batch([])), /invalid-batch-contract/);
  assert.throws(
    () =>
      assessSmallChangeBatch(
        batch(Array.from({ length: 31 }, (_, index) => ({ pr: index + 1, observation: {} })))
      ),
    /invalid-batch-contract/
  );
  assert.throws(
    () => assessSmallChangeBatch({ ...batch([{ pr: 1, observation: {} }]), repository: '../unsafe' }),
    /invalid-batch-contract/
  );
  assert.throws(
    () => assessSmallChangeBatch({ ...batch([{ pr: 1, observation: {} }]), kind: 'unknown' }),
    /invalid-batch-contract/
  );
});
