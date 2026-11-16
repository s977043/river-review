// #2701: synthetic contract rehearsal, not a real incident benchmark or bug oracle.
// The preflight and paired replay may both succeed without validating bug truth.
import assert from 'node:assert/strict';
import test from 'node:test';

import { assessIncidentReviewSmoke } from '../scripts/experiments/incident-review-smoke-preflight.mjs';
import { buildPairedReplay } from '../src/lib/paired-replay.mjs';

const NOW = new Date('2026-11-01T00:00:00.000Z');
const CRITICAL_FINGERPRINT = 'a1b2c3d4e5f60718';

function metadata() {
  const bug = {
    caseId: 'synthetic-bug',
    label: 'bug',
    partition: 'development',
    usedForTuning: true,
    source: {
      reviewedTarget: 'synthetic/repo@bug',
      reviewedCommit: 'a'.repeat(40),
      mergeBase: 'b'.repeat(40),
      reviewedAt: '2026-10-01T00:00:00Z',
      diffScopeRef: 'synthetic/scope-bug',
      reviewVisibility: 'reviewable',
      evidenceDigest: 'd'.repeat(64),
      bugIntroducingCommit: 'c'.repeat(40),
      fixEvidenceRef: 'synthetic/fix',
      fixObservedAt: '2026-10-02T00:00:00Z',
    },
    oracle: {
      claimedStatus: 'independently_checked',
      adjudicatorRef: 'synthetic/adjudicator',
      evidenceRef: 'synthetic/oracle-bug',
      adjudicatedAt: '2026-10-03T00:00:00Z',
      causeRef: 'synthetic/cause',
      locationRef: 'synthetic/location',
    },
    isolation: {
      labelsWithheld: true,
      laterFixWithheld: true,
      privateReportsWithheld: true,
    },
  };
  const clean = structuredClone(bug);
  clean.caseId = 'synthetic-clean';
  clean.label = 'clean';
  clean.partition = 'held_out';
  clean.usedForTuning = false;
  clean.source.reviewedTarget = 'synthetic/repo@clean';
  clean.source.reviewedCommit = 'f'.repeat(40);
  clean.source.diffScopeRef = 'synthetic/scope-clean';
  clean.source.evidenceDigest = 'e'.repeat(64);
  delete clean.source.bugIntroducingCommit;
  delete clean.source.fixEvidenceRef;
  delete clean.source.fixObservedAt;
  delete clean.oracle.causeRef;
  delete clean.oracle.locationRef;
  clean.oracle.evidenceRef = 'synthetic/oracle-clean';
  clean.oracle.cleanScopeRef = 'synthetic/absence-scope';
  clean.oracle.alternativeAssessment = 'checked_valid';
  return {
    kind: 'incident-review-smoke/v1',
    heldOutFrozenAt: '2026-09-30T00:00:00Z',
    cases: [bug, clean],
  };
}

function replaySpec(input) {
  const runs = input.cases.map((entry, index) => ({
    runId: `baseline-${index}`,
    caseId: entry.caseId,
    reviewedTarget: entry.source.reviewedTarget,
    mergeBase: entry.source.mergeBase,
    timestamp: entry.source.reviewedAt,
    phase: 'midstream',
    findings:
      entry.label === 'bug'
        ? [
            {
              fingerprint: CRITICAL_FINGERPRINT,
              severity: 'critical',
              file: 'src/synthetic.mjs',
              ruleId: 'synthetic-rule',
              title: 'synthetic alleged bug',
            },
          ]
        : [],
  }));
  const candidateRuns = structuredClone(runs);
  candidateRuns.forEach((run, index) => {
    run.runId = `candidate-${index}`;
  });
  return {
    hypothesis: 'synthetic verifier disposition-only experiment',
    baseline: {
      commitSha: 'same-reviewer-revision',
      configId: 'baseline',
      provider: 'synthetic',
      model: 'synthetic-model',
      temperature: 0,
      runs,
    },
    candidate: {
      commitSha: 'same-reviewer-revision',
      configId: 'verifier-shadow',
      provider: 'synthetic',
      model: 'synthetic-model',
      temperature: 0,
      runs: candidateRuns,
    },
    dataset: {
      heldOutCaseKeys: input.cases
        .filter((entry) => entry.partition === 'held_out')
        .map((entry) => entry.caseId),
    },
    trials: { trialId: 'synthetic-1', trialCount: 1 },
    verifier: {
      independent: true,
      verifierId: 'synthetic-reported-verifier',
      runBy: 'synthetic',
    },
    acceptance: {
      profiles: [
        {
          profile: 'synthetic',
          minSampleSize: 1,
          criteria: [{ metric: 'removedFindingCount', comparator: 'lte', threshold: 0 }],
        },
      ],
    },
  };
}

test('metadata-only preflight plus identical finding projections cannot certify verifier activation', () => {
  const input = metadata();
  const checked = assessIncidentReviewSmoke(input);
  assert.equal(checked.metadataStatus, 'complete');
  assert.equal(checked.evidenceTrust, 'unverified-input');
  assert.equal(checked.authorizesApproval, false);
  assert.equal(checked.recall, null);

  const experiment = replaySpec(input);
  // A disposition-only change is not represented in the paired finding projection.
  experiment.candidate.runs[0].findings[0].verificationDisposition = 'inconclusive';
  const result = buildPairedReplay(experiment, { now: NOW });

  assert.equal(result.pairing.pairedCaseCount, 2);
  assert.equal(result.activationCheck.configurationDiffers, true);
  assert.equal(result.activationCheck.observedDifference, false);
  assert.equal(result.activationCheck.verified, false);
  assert.equal(result.metrics.overall.changedFindingCount, 0);
  assert.equal(result.acceptance.contract6.criticalRegressionZero, true);
  assert.equal(result.verification.independentVerifierVerified, false);
  assert.equal(result.verification.trustedEvidenceCount, 0);
  assert.equal(result.verification.canaryEligible, false);
  assert.equal(result.acceptance.decision, null);
  assert.equal(result.acceptance.autoPromotion, false);
  assert.deepEqual(result.writeEffects, []);
});

test('a lost alleged critical finding remains visible even when the held-out clean case is quiet', () => {
  const experiment = replaySpec(metadata());
  experiment.candidate.runs[0].findings = [];

  const result = buildPairedReplay(experiment, { now: NOW });
  assert.equal(result.metrics.overall.criticalRegressionCount, 1);
  assert.equal(result.acceptance.contract6.overallCriticalRegressionCount, 1);
  assert.equal(result.acceptance.evaluatedOn, 'heldOut');
  assert.equal(result.acceptance.contract6.criticalRegressionCount, 0);
  assert.equal(result.acceptance.decision, null);
  assert.equal(result.verification.canaryEligible, false);
  // The replay reports fingerprint loss; it cannot tell whether the allegation was true.
  assert.equal(result.verification.independentVerifierVerified, false);
});

test('operator-claimed held-out isolation is checked only by the preflight, not by replay', () => {
  const input = metadata();
  input.cases[1].usedForTuning = true;
  const preflight = assessIncidentReviewSmoke(input);
  assert.equal(preflight.metadataStatus, 'incomplete');
  assert.notDeepEqual(preflight.cases[1].reasonCodes, []);

  // Replay is a separate read-only comparison. It must not be cited as an
  // independent check that the operator's held-out partition was uncontaminated.
  const result = buildPairedReplay(replaySpec(input), { now: NOW });
  assert.equal(result.acceptance.evaluatedOn, 'heldOut');
  assert.equal(result.verification.independentVerifierVerified, false);
  assert.equal(result.verification.canaryEligible, false);
  assert.equal(result.acceptance.decision, null);
});
