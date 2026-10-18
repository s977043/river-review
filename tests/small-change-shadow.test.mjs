import assert from 'node:assert/strict';
import test from 'node:test';

import { assessSmallChangeShadow } from '../scripts/experiments/small-change-shadow.mjs';

const HEAD = 'a'.repeat(40);

function validObservation() {
  return {
    subject: { headSha: HEAD },
    change: { changedLines: 42, changedFiles: ['src/service/api.mjs'] },
    route: {
      headSha: HEAD,
      policyApplied: true,
      selectedMode: 'standard',
      riskAction: 'comment_only',
    },
    review: {
      headSha: HEAD,
      state: 'completed',
      coverage: 'complete',
      majorOrCriticalCount: 0,
    },
    checks: { headSha: HEAD, state: 'passed' },
    scope: {
      headSha: HEAD,
      classifiedChangedFiles: ['src/service/api.mjs'],
      classificationComplete: true,
      sharedLibraryTouched: false,
      sensitiveAreaTouched: false,
      services: [{ name: 'api', priorMergedPrs: 10 }],
    },
    policy: {
      maxServicesInclusive: 1,
      excludedPathPrefixes: ['src/payments'],
    },
  };
}

function mutate(mutator) {
  const input = validObservation();
  mutator(input);
  return assessSmallChangeShadow(input);
}

function hasReason(result, status, reason) {
  assert.equal(result.status, status);
  assert.ok(result.reasonCodes.includes(reason), JSON.stringify(result));
  assert.equal(result.authorizesApproval, false);
  assert.equal(result.evidenceTrust, 'unverified-input');
}

test('complete self-reported observations are only a shadow candidate, not approval', () => {
  const result = assessSmallChangeShadow(validObservation());
  assert.deepEqual(result, {
    kind: 'small-change-shadow/v1',
    status: 'candidate',
    reasonCodes: [],
    authorizesApproval: false,
    evidenceTrust: 'unverified-input',
  });
});

test('changed lines must be strictly less than 1000', () => {
  const below = mutate((input) => { input.change.changedLines = 999; });
  assert.equal(below.status, 'candidate');
  hasReason(mutate((input) => { input.change.changedLines = 1000; }), 'excluded', 'change-too-large');
});

test('missing and malformed change size never become a candidate', () => {
  hasReason(mutate((input) => { delete input.change.changedLines; }), 'unknown', 'missing-change-size');
  hasReason(mutate((input) => { input.change.changedLines = -1; }), 'unknown', 'missing-change-size');
});

test('evidence is bound to the exact PR head SHA', () => {
  for (const field of ['route', 'review', 'checks', 'scope']) {
    hasReason(mutate((input) => { input[field].headSha = 'b'.repeat(40); }),
      'unknown', `missing-or-stale-${field}`);
  }
  hasReason(mutate((input) => { input.subject.headSha = 'not-a-sha'; }),
    'unknown', 'invalid-subject-sha');
});

test('risk-map missing or escalated is never a candidate', () => {
  hasReason(mutate((input) => { input.route.policyApplied = false; }),
    'unknown', 'risk-policy-not-verified');
  hasReason(mutate((input) => { input.route.selectedMode = 'human-required'; }),
    'excluded', 'review-route-escalated');
  hasReason(mutate((input) => { input.route.riskAction = 'escalate'; }),
    'excluded', 'risk-action-escalated');
});

test('AI findings and incomplete review coverage are independently handled', () => {
  hasReason(mutate((input) => { input.review.coverage = 'partial'; }),
    'unknown', 'review-incomplete');
  hasReason(mutate((input) => { input.review.state = 'failed'; }),
    'unknown', 'review-incomplete');
  hasReason(mutate((input) => { delete input.review.majorOrCriticalCount; }),
    'unknown', 'findings-not-verified');
  hasReason(mutate((input) => { input.review.majorOrCriticalCount = 1; }),
    'excluded', 'major-or-critical-findings');
});

test('pending/unknown CI is not passing CI', () => {
  hasReason(mutate((input) => { input.checks.state = 'pending'; }),
    'unknown', 'required-checks-not-passed');
  hasReason(mutate((input) => { input.checks.state = 'failed'; }),
    'excluded', 'required-checks-failed');
});

test('scope must cover the entire raw changed-file manifest', () => {
  hasReason(mutate((input) => { input.change.changedFiles.push('src/other.mjs'); }),
    'unknown', 'scope-manifest-mismatch');
  hasReason(mutate((input) => { input.scope.classificationComplete = false; }),
    'unknown', 'scope-classification-incomplete');
  hasReason(mutate((input) => { input.change.changedFiles.push('src/service/api.mjs'); }),
    'unknown', 'invalid-change-manifest');
});

test('sensitive areas and shared libraries are excluded', () => {
  hasReason(mutate((input) => { input.scope.sharedLibraryTouched = true; }),
    'excluded', 'shared-library-excluded');
  hasReason(mutate((input) => { input.scope.sensitiveAreaTouched = true; }),
    'excluded', 'sensitive-area-excluded');
  hasReason(mutate((input) => { delete input.scope.sensitiveAreaTouched; }),
    'unknown', 'unknown-sensitiveAreaTouched');
});

test('repository path exclusions use path boundaries', () => {
  const excluded = mutate((input) => {
    input.change.changedFiles = ['src/payments/money.mjs'];
    input.scope.classifiedChangedFiles = ['src/payments/money.mjs'];
  });
  hasReason(excluded, 'excluded', 'repo-policy-path-excluded');

  const notExcluded = mutate((input) => {
    input.change.changedFiles = ['src/payments2/money.mjs'];
    input.scope.classifiedChangedFiles = ['src/payments2/money.mjs'];
  });
  assert.equal(notExcluded.status, 'candidate');
});

test('policy and CI configuration changes are excluded even if self-classified as safe', () => {
  for (const path of ['.small_change', '.river/risk-map.yaml', '.github/workflows/ci.yml']) {
    hasReason(mutate((input) => {
      input.change.changedFiles = [path];
      input.scope.classifiedChangedFiles = [path];
    }), 'excluded', 'review-policy-files-changed');
  }
});

test('service counts and per-service author experience must meet configured policy', () => {
  hasReason(mutate((input) => { input.scope.services[0].priorMergedPrs = 9; }),
    'excluded', 'insufficient-service-experience');
  hasReason(mutate((input) => {
    input.scope.services.push({ name: 'gateway', priorMergedPrs: 15 });
  }), 'excluded', 'too-many-services');
  hasReason(mutate((input) => {
    input.scope.services[0].priorMergedPrs = undefined;
  }), 'unknown', 'unknown-service-experience');
});

test('duplicate and missing service histories fail closed', () => {
  hasReason(mutate((input) => { input.scope.services = []; }),
    'unknown', 'missing-affected-services');
  hasReason(mutate((input) => {
    input.scope.services.push({ name: 'api', priorMergedPrs: 10 });
    input.policy.maxServicesInclusive = 2;
  }), 'unknown', 'duplicate-affected-service');
});

test('explicit repo-owned policy is required; invalid policies are unknown', () => {
  hasReason(mutate((input) => { delete input.policy; }),
    'unknown', 'missing-repo-policy');
  hasReason(mutate((input) => { input.policy.maxServicesInclusive = 99; }),
    'unknown', 'missing-repo-policy');
  hasReason(mutate((input) => { input.policy.excludedPathPrefixes = ['/tmp']; }),
    'unknown', 'missing-repo-policy');
});

test('missing all evidence is unknown, never a green or authority signal', () => {
  const result = assessSmallChangeShadow({});
  assert.equal(result.status, 'unknown');
  assert.equal(result.authorizesApproval, false);
  assert.ok(result.reasonCodes.length > 3);
});
