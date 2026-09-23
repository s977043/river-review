// Paired replay (#1574 P2) — immutable Experiment Manifest + paired diffing.
//
// Covers the properties the design contract makes load-bearing:
//   - immutable Experiment Manifest: same conditions -> same id, tamper detected (契約3)
//   - profile-specific acceptance that is EVALUATED but never APPLIED (契約6)
//   - candidate id reuse instead of a second derivation (契約4)
//   - trust stays untrusted, exactly as P1 fixed it (契約1)
// plus the properties P2 itself promises: determinism, degenerate-input
// behaviour, and read-only execution.

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACCEPTANCE_COMPARATORS,
  MANIFEST_ID_PREFIX,
  PairedReplayError,
  buildExperimentManifest,
  buildPairedReplay,
  deriveCaseKey,
  evaluateAcceptance,
  evidenceTrustLevel,
  formatPairedReplayMarkdown,
  pairFindings,
  verifyExperimentManifest,
} from '../src/lib/paired-replay.mjs';
import { computeCandidateId } from '../src/lib/shadow-aggregate.mjs';
import { buildProposedCandidate } from '../src/lib/promotion-candidates.mjs';
import { compileSchemaFile } from './helpers/schema-validator.mjs';
import { runCliInProcess } from './helpers/cli.mjs';

const NOW = new Date('2026-07-25T00:00:00.000Z');
const LATER = new Date('2026-08-01T12:00:00.000Z');
const FP_A = 'a1b2c3d4e5f60718';
const FP_B = '00112233445566aa';
const FP_C = 'ffeeddccbbaa9988';
const FP_D = '0123456789abcdef';

const validateReplay = compileSchemaFile('paired-replay.schema.json', {
  ajvOptions: { allErrors: true },
});

function finding(
  fingerprint,
  { severity = 'major', file = 'src/a.mjs', ruleId = 'secret-scanner' } = {}
) {
  return { fingerprint, severity, file, ruleId, title: `finding ${fingerprint}` };
}

function runRecord({
  runId,
  caseId = 'case-1',
  timestamp = '2026-07-20T00:00:00.000Z',
  findings = [],
}) {
  return {
    runId,
    timestamp,
    reviewedTarget: '/repo',
    mergeBase: 'base-sha',
    caseId,
    phase: 'midstream',
    findings,
  };
}

/**
 * Baseline reports A(critical) + B(major); the candidate keeps A, downgrades
 * nothing, drops B and adds C. One held-out case is declared.
 */
function spec(overrides = {}) {
  return {
    hypothesis: 'guard fixture を足すと false positive が減る',
    baseline: {
      commitSha: 'base-commit',
      skillRegistryCommit: 'registry-1',
      provider: 'anthropic',
      model: 'test-model',
      temperature: 0,
      runs: [
        runRecord({
          runId: 'base-run-1',
          caseId: 'case-1',
          findings: [finding(FP_A, { severity: 'critical' }), finding(FP_B)],
        }),
        runRecord({
          runId: 'base-run-2',
          caseId: 'case-2',
          findings: [finding(FP_C, { severity: 'minor' })],
        }),
      ],
    },
    candidate: {
      commitSha: 'cand-commit',
      skillRegistryCommit: 'registry-2',
      provider: 'anthropic',
      model: 'test-model',
      temperature: 0,
      runs: [
        runRecord({
          runId: 'cand-run-1',
          caseId: 'case-1',
          findings: [finding(FP_A, { severity: 'critical' }), finding(FP_D)],
        }),
        runRecord({
          runId: 'cand-run-2',
          caseId: 'case-2',
          findings: [finding(FP_C, { severity: 'minor' })],
        }),
      ],
    },
    dataset: { heldOutCaseKeys: ['case-2'] },
    trials: { trialId: 'trial-1', trialCount: 1 },
    acceptance: {
      profiles: [
        {
          profile: 'standard',
          minSampleSize: 2,
          criteria: [{ metric: 'removedFindingCount', comparator: 'lte', threshold: 1 }],
        },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 契約3: immutable Experiment Manifest
// ---------------------------------------------------------------------------

describe('paired-replay 契約3: immutable Experiment Manifest', () => {
  test('the manifest pins every condition the contract enumerates', () => {
    const { manifest } = buildExperimentManifest(spec(), { now: NOW });
    assert.match(manifest.manifestId, /^RR-EXP-[0-9a-f]{12}$/);
    assert.ok(manifest.manifestId.startsWith(MANIFEST_ID_PREFIX));
    assert.equal(manifest.baseline.commitSha, 'base-commit');
    assert.equal(manifest.candidate.commitSha, 'cand-commit');
    assert.equal(manifest.baseline.skillRegistryCommit, 'registry-1');
    assert.equal(manifest.candidate.model, 'test-model');
    assert.equal(manifest.candidate.temperature, 0);
    assert.match(manifest.dataset.datasetHash, /^[0-9a-f]{64}$/);
    assert.match(manifest.dataset.heldOutHash, /^[0-9a-f]{64}$/);
    assert.equal(manifest.evaluator.evaluatorVersion, 'river-paired-replay-evaluator/1');
    assert.equal(manifest.trials.trialId, 'trial-1');
    assert.equal(manifest.trials.trialCount, 1);
    assert.deepEqual(manifest.activation, { expectedSignal: null, declaredEvidence: [] });
    assert.deepEqual(manifest.environment, {});
    assert.equal(manifest.metrics.denominator, 'paired-finding');
    assert.ok(manifest.terminalReasonVocabulary.includes('budget_exhausted'));
    assert.deepEqual(manifest.writeEffects, []);
  });

  test('the same conditions produce the same manifestId regardless of creation time', () => {
    const a = buildExperimentManifest(spec(), { now: NOW }).manifest;
    const b = buildExperimentManifest(spec(), { now: LATER }).manifest;
    assert.equal(a.experimentKey, b.experimentKey);
    assert.equal(a.manifestId, b.manifestId);
    // ...but the tamper digest covers createdAt, so the two records differ.
    assert.notEqual(a.manifestHash, b.manifestHash);
    assert.equal(verifyExperimentManifest(a).verified, true);
    assert.equal(verifyExperimentManifest(b).verified, true);
  });

  test('input order does not change the manifest', () => {
    const shuffled = spec();
    shuffled.baseline.runs.reverse();
    shuffled.candidate.runs.reverse();
    shuffled.baseline.runs[0].findings.reverse();
    assert.equal(
      buildExperimentManifest(shuffled, { now: NOW }).manifest.experimentKey,
      buildExperimentManifest(spec(), { now: NOW }).manifest.experimentKey
    );
  });

  test('editing any manifest field is detected', () => {
    const base = buildExperimentManifest(spec(), { now: NOW }).manifest;
    const tampered = [
      { ...base, baseline: { ...base.baseline, commitSha: 'other-commit' } },
      { ...base, createdAt: '2020-01-01T00:00:00.000Z' },
      {
        ...base,
        acceptance: {
          profiles: [{ ...base.acceptance.profiles[0], minSampleSize: 0 }],
        },
      },
      { ...base, dataset: { ...base.dataset, heldOutCaseKeys: [] } },
    ];
    for (const manifest of tampered) {
      const verification = verifyExperimentManifest(manifest);
      assert.equal(verification.verified, false, JSON.stringify(manifest.createdAt));
      assert.ok(verification.mismatches.length > 0);
    }
  });

  test('a rewritten run record changes the datasetHash and therefore the manifest id', () => {
    const edited = spec();
    edited.baseline.runs[0].findings[0].severity = 'minor';
    const a = buildExperimentManifest(spec(), { now: NOW }).manifest;
    const b = buildExperimentManifest(edited, { now: NOW }).manifest;
    assert.notEqual(a.dataset.datasetHash, b.dataset.datasetHash);
    assert.notEqual(a.manifestId, b.manifestId);
  });

  test('a held-out key that matches no case is rejected instead of silently emptying the set', () => {
    assert.throws(
      () =>
        buildExperimentManifest(spec({ dataset: { heldOutCaseKeys: ['case-9'] } }), { now: NOW }),
      PairedReplayError
    );
  });

  test('a held-out key present on only ONE side is rejected (vacuous pass guard)', () => {
    // Regression guard: validating against the UNION let a one-sided key pass,
    // and the held-out scope then had zero paired cases — every metric read 0
    // and the mandatory criteria looked satisfied on an empty set.
    const oneSided = spec({ dataset: { heldOutCaseKeys: ['case-2'] } });
    oneSided.candidate.runs = [oneSided.candidate.runs[0]]; // drops case-2 from the candidate
    assert.throws(
      () => buildExperimentManifest(oneSided, { now: NOW }),
      /exist on only one side, so they can never be paired/
    );
  });

  test('a side without runs, or without a commit SHA, is rejected', () => {
    const noRuns = spec();
    noRuns.candidate.runs = [];
    assert.throws(() => buildExperimentManifest(noRuns, { now: NOW }), PairedReplayError);
    const noCommit = spec();
    delete noCommit.baseline.commitSha;
    assert.throws(() => buildExperimentManifest(noCommit, { now: NOW }), PairedReplayError);
  });
});

// ---------------------------------------------------------------------------
// 契約4: the candidate id is reused, not re-derived
// ---------------------------------------------------------------------------

describe('paired-replay 契約4: content-addressed candidate id', () => {
  const evidence = [
    { skillId: 'secret-scanner', feedbackType: 'false_positive', findingFingerprint: FP_A, pr: 1 },
    { skillId: 'secret-scanner', feedbackType: 'false_positive', findingFingerprint: FP_B, pr: 2 },
  ];

  test('the manifest carries the id the shared derivation mints', () => {
    const expected = computeCandidateId({
      clusterKey: 'secret-scanner::false_positive',
      evidence,
    });
    const { manifest } = buildExperimentManifest(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: evidence,
        },
      }),
      { now: NOW }
    );
    assert.equal(manifest.improvementCandidate.candidateId, expected.candidateId);
    assert.equal(manifest.improvementCandidate.contentHash, expected.contentHash);
    assert.match(manifest.improvementCandidate.candidateId, /^RR-PC-[0-9a-f]{12}$/);
  });

  test('evidence order does not change the candidate id', () => {
    const forward = buildExperimentManifest(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: evidence,
        },
      }),
      { now: NOW }
    ).manifest;
    const reversed = buildExperimentManifest(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: [...evidence].reverse(),
        },
      }),
      { now: NOW }
    ).manifest;
    assert.equal(
      forward.improvementCandidate.candidateId,
      reversed.improvementCandidate.candidateId
    );
  });

  test('an unknown candidate policyVersion is a usage error, not a stack trace', () => {
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({
            improvementCandidate: {
              clusterKey: 'secret-scanner::false_positive',
              policyVersion: '99',
              sourceFeedbackRefs: evidence,
            },
          }),
          { now: NOW }
        ),
      (err) =>
        err instanceof PairedReplayError && /improvementCandidate.policyVersion/.test(err.message)
    );
  });

  test('a malformed evidence row surfaces as a PairedReplayError', () => {
    for (const refs of [[null], ['not-an-object'], [{ feedbackType: 'x', timestamp: 42 }]]) {
      assert.throws(
        () =>
          buildExperimentManifest(
            spec({
              improvementCandidate: {
                clusterKey: 'secret-scanner::false_positive',
                sourceFeedbackRefs: refs,
              },
            }),
            { now: NOW }
          ),
        PairedReplayError
      );
    }
  });

  test('replay と propose は同じ evidence から同じ candidateId を採番する', () => {
    // Cross-path guard, not a self-consistency check: comparing the manifest
    // only against computeCandidateId would have kept passing while propose
    // minted a different id from the same input.
    const proposed = buildProposedCandidate({
      entries: evidence,
      clusterKey: 'secret-scanner::false_positive',
      now: NOW,
    });
    const { manifest } = buildExperimentManifest(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: evidence,
        },
      }),
      { now: NOW }
    );
    assert.equal(manifest.improvementCandidate.candidateId, proposed.candidateId);
    assert.equal(manifest.improvementCandidate.contentHash, proposed.contentHash);
  });

  test('clusterKey の空白は propose と同じ位置で正規化される', () => {
    // Regression guard: replay trimmed the WHOLE string while propose trims
    // each `::` component, so "secret-scanner ::false_positive" produced two
    // different ids for one candidate.
    const spaced = 'secret-scanner ::false_positive';
    const proposed = buildProposedCandidate({ entries: evidence, clusterKey: spaced, now: NOW });
    const { manifest } = buildExperimentManifest(
      spec({ improvementCandidate: { clusterKey: spaced, sourceFeedbackRefs: evidence } }),
      { now: NOW }
    );
    assert.equal(manifest.improvementCandidate.clusterKey, 'secret-scanner::false_positive');
    assert.equal(manifest.improvementCandidate.candidateId, proposed.candidateId);
  });

  test('`::` を持たない clusterKey は propose と同様に拒否される', () => {
    // Previously accepted here, minting an experiment id for a candidate
    // `river promote propose` is structurally unable to create.
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({
            improvementCandidate: { clusterKey: 'not-a-cluster-key', sourceFeedbackRefs: evidence },
          }),
          { now: NOW }
        ),
      (err) =>
        err instanceof PairedReplayError &&
        /improvementCandidate.clusterKey must be/.test(err.message)
    );
    assert.throws(
      () =>
        buildProposedCandidate({ entries: evidence, clusterKey: 'not-a-cluster-key', now: NOW }),
      /must be "<skillId>::<feedbackType>"/
    );
  });

  test('NFD の非 ASCII clusterKey は propose も replay も受け付けない', () => {
    // NFC normalization is shared, but a non-ASCII skillId fails the feedback
    // entry contract on BOTH paths — so an experiment cannot mint an id for a
    // cluster propose could never persist.
    const nfdKey = `${'ガ-skill'.normalize('NFD')}::false_positive`;
    const nfdEvidence = evidence.map((e) => ({ ...e, skillId: 'ガ-skill' }));
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({ improvementCandidate: { clusterKey: nfdKey, sourceFeedbackRefs: nfdEvidence } }),
          { now: NOW }
        ),
      PairedReplayError
    );
    assert.throws(
      () => buildProposedCandidate({ entries: nfdEvidence, clusterKey: nfdKey, now: NOW }),
      /skillId must contain only/
    );
  });

  test('propose が拒否する evidence 行は replay でも拒否される', () => {
    const badFingerprint = evidence.map((e) => ({ ...e, findingFingerprint: 'not-hex' }));
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({
            improvementCandidate: {
              clusterKey: 'secret-scanner::false_positive',
              sourceFeedbackRefs: badFingerprint,
            },
          }),
          { now: NOW }
        ),
      /findingFingerprint must be 16 lowercase hex chars/
    );
    // cluster 外の行も同様（propose の --input 検証と同じ規律）。
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({
            improvementCandidate: {
              clusterKey: 'secret-scanner::false_positive',
              sourceFeedbackRefs: [evidence[0], { ...evidence[1], skillId: 'other-skill' }],
            },
          }),
          { now: NOW }
        ),
      /is outside improvementCandidate.clusterKey/
    );
  });

  test('a claimed candidate id its evidence does not produce is rejected', () => {
    assert.throws(
      () =>
        buildExperimentManifest(
          spec({
            improvementCandidate: {
              candidateId: 'RR-PC-000000000000',
              clusterKey: 'secret-scanner::false_positive',
              sourceFeedbackRefs: evidence,
            },
          }),
          { now: NOW }
        ),
      /does not match the id derived from its evidence/
    );
  });

  test('paired replay emits a read-only promotion handoff for the same candidate id', () => {
    const result = buildPairedReplay(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: evidence,
        },
      }),
      { now: NOW }
    );
    const handoff = result.promotionHandoff;
    assert.ok(handoff);
    assert.equal(handoff.candidateId, result.manifest.improvementCandidate.candidateId);
    assert.equal(handoff.manifestId, result.manifest.manifestId);
    assert.equal(handoff.experimentKey, result.manifest.experimentKey);
    assert.equal(handoff.manifestHash, result.manifest.manifestHash);
    assert.equal(handoff.manifestVerified, true);
    assert.equal(handoff.experimentKeyMatchesInputs, true);
    assert.equal(handoff.activationVerified, result.activationCheck.verified);
    assert.equal(handoff.acceptanceEvaluable, result.acceptance.evaluable);
    assert.equal(handoff.evaluatedOn, result.acceptance.evaluatedOn);
    assert.equal(handoff.criticalRegressionCount, result.acceptance.contract6.criticalRegressionCount);
    assert.equal(
      handoff.overallCriticalRegressionCount,
      result.acceptance.contract6.overallCriticalRegressionCount
    );
    assert.equal(handoff.independentVerifierVerified, false);
    assert.equal(handoff.requiresHumanJudgment, true);
    assert.deepEqual(handoff.writeEffects, []);
    // A profile may meet its finding criteria while still missing its declared
    // sample-size floor. The handoff reports both facts; it never collapses them
    // into a "pass" or promotion decision.
    assert.deepEqual(handoff.profiles, [
      {
        profile: 'standard',
        allRequiredSatisfied: true,
        sampleSizeSatisfied: false,
        failedMetrics: [],
      },
    ]);
    assert.equal(result.acceptance.decision, null);
    assert.deepEqual(result.writeEffects, []);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('an unevaluable replay never turns zero-looking metrics into a handoff pass', () => {
    const noPair = spec({
      dataset: { heldOutCaseKeys: [] },
      improvementCandidate: {
        clusterKey: 'secret-scanner::false_positive',
        sourceFeedbackRefs: evidence,
      },
    });
    noPair.baseline.runs = [
      runRecord({ runId: 'base-only', caseId: 'baseline-case', findings: [] }),
    ];
    noPair.candidate.runs = [
      runRecord({ runId: 'candidate-only', caseId: 'candidate-case', findings: [] }),
    ];
    const result = buildPairedReplay(noPair, { now: NOW });
    assert.equal(result.acceptance.evaluable, false);
    assert.equal(result.promotionHandoff.acceptanceEvaluable, false);
    assert.equal(result.promotionHandoff.evaluatedOn, 'overall');
    assert.equal(result.promotionHandoff.criticalRegressionCount, null);
    assert.equal(result.promotionHandoff.overallCriticalRegressionCount, 0);
    assert.equal(result.promotionHandoff.profiles[0].allRequiredSatisfied, false);
    assert.equal(result.promotionHandoff.profiles[0].sampleSizeSatisfied, null);
    assert.equal(result.promotionHandoff.requiresHumanJudgment, true);
    assert.deepEqual(result.promotionHandoff.writeEffects, []);
  });

  test('a clean held-out scope cannot hide an overall critical regression in the handoff', () => {
    const withRegression = spec({
      improvementCandidate: {
        clusterKey: 'secret-scanner::false_positive',
        sourceFeedbackRefs: evidence,
      },
    });
    // case-2 is held out and remains unchanged. Remove the critical FP_A only
    // from case-1 so the evaluated held-out scope is clean while overall is not.
    withRegression.candidate.runs[0].findings = [finding(FP_D)];
    const result = buildPairedReplay(withRegression, { now: NOW });
    assert.equal(result.promotionHandoff.evaluatedOn, 'heldOut');
    assert.equal(result.promotionHandoff.criticalRegressionCount, 0);
    assert.equal(result.promotionHandoff.overallCriticalRegressionCount, 1);
    assert.equal(result.acceptance.contract6.overallCriticalRegressionCount, 1);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('a supplied stale manifest is made explicit in the handoff integrity flags', () => {
    const current = spec({
      improvementCandidate: {
        clusterKey: 'secret-scanner::false_positive',
        sourceFeedbackRefs: evidence,
      },
    });
    const stale = buildExperimentManifest(spec({ hypothesis: '別実験' }), { now: NOW }).manifest;
    const result = buildPairedReplay(current, { now: NOW, manifest: stale });
    assert.equal(result.manifestVerification.verified, true);
    assert.equal(result.manifestVerification.experimentKeyMatchesInputs, false);
    assert.equal(result.promotionHandoff.manifestVerified, true);
    assert.equal(result.promotionHandoff.experimentKeyMatchesInputs, false);
    assert.equal(result.promotionHandoff.candidateId, buildExperimentManifest(current, { now: NOW }).manifest.improvementCandidate.candidateId);
  });
});

// ---------------------------------------------------------------------------
// Paired diff
// ---------------------------------------------------------------------------

describe('paired-replay: paired finding diff', () => {
  test('classifies unchanged / changed / removed / added', () => {
    const diff = pairFindings(
      [finding(FP_A, { severity: 'critical' }), finding(FP_B), finding(FP_C)],
      [finding(FP_A, { severity: 'critical' }), finding(FP_B, { severity: 'minor' }), finding(FP_D)]
    );
    const byFingerprint = Object.fromEntries(diff.pairs.map((p) => [p.fingerprint, p.status]));
    assert.equal(byFingerprint[FP_A], 'unchanged');
    assert.equal(byFingerprint[FP_B], 'changed');
    assert.equal(byFingerprint[FP_C], 'removed');
    assert.equal(byFingerprint[FP_D], 'added');
    assert.deepEqual(diff.counts.unchanged, 1);
    assert.deepEqual(diff.counts.changed, 1);
    assert.deepEqual(diff.counts.removed, 1);
    assert.deepEqual(diff.counts.added, 1);
  });

  test('is order independent', () => {
    const baseline = [finding(FP_A, { severity: 'critical' }), finding(FP_B), finding(FP_C)];
    const candidate = [finding(FP_B, { severity: 'minor' }), finding(FP_D)];
    assert.deepEqual(
      pairFindings(baseline, candidate),
      pairFindings([...baseline].reverse(), [...candidate].reverse())
    );
  });

  test('a lost or downgraded critical baseline finding is a regression', () => {
    const lost = pairFindings([finding(FP_A, { severity: 'critical' })], []);
    assert.deepEqual(lost.criticalRegressions, [FP_A]);
    const downgraded = pairFindings(
      [finding(FP_A, { severity: 'critical' })],
      [finding(FP_A, { severity: 'minor' })]
    );
    assert.deepEqual(downgraded.criticalRegressions, [FP_A]);
    assert.deepEqual(downgraded.criticalAdditions, []);
  });

  test('a new or upgraded critical finding is counted separately from a regression', () => {
    const added = pairFindings([], [finding(FP_A, { severity: 'critical' })]);
    assert.deepEqual(added.criticalAdditions, [FP_A]);
    assert.deepEqual(added.criticalRegressions, []);
    const upgraded = pairFindings(
      [finding(FP_B, { severity: 'minor' })],
      [finding(FP_B, { severity: 'critical' })]
    );
    assert.deepEqual(upgraded.criticalAdditions, [FP_B]);
  });

  test('findings without a fingerprint are reported as unpairable, never matched', () => {
    const diff = pairFindings(
      [{ severity: 'major', file: 'src/a.mjs' }],
      [{ severity: 'major', file: 'src/a.mjs' }]
    );
    assert.deepEqual(diff.pairs, []);
    assert.equal(diff.counts.unpairableBaseline, 1);
    assert.equal(diff.counts.unpairableCandidate, 1);
  });

  test('an unknown severity is read as major (fail-safe), not as the lowest rank', () => {
    const diff = pairFindings(
      [finding(FP_A, { severity: 'catastrophic' })],
      [finding(FP_A, { severity: 'major' })]
    );
    assert.equal(diff.pairs[0].status, 'unchanged');
    assert.equal(diff.pairs[0].baseline.severity, 'major');
  });

  test('duplicate fingerprints on one side collapse and are counted', () => {
    const diff = pairFindings([finding(FP_A), finding(FP_A)], [finding(FP_A)]);
    assert.equal(diff.counts.unchanged, 1);
    assert.equal(diff.counts.duplicatesRemovedBaseline, 1);
    assert.equal(diff.counts.severityConflictsBaseline, 0);
  });

  test('a duplicate fingerprint collapses to the HIGHEST severity, not to the first row', () => {
    // Regression guard: the winner was decided by canonical-JSON order, i.e. by
    // the file name, so a `minor` duplicate could hide a `critical` regression.
    const diff = pairFindings(
      [
        finding(FP_A, { severity: 'minor', file: 'aaa.mjs' }),
        finding(FP_A, { severity: 'critical', file: 'zzz.mjs' }),
      ],
      []
    );
    assert.equal(diff.pairs[0].baseline.severity, 'critical');
    assert.deepEqual(diff.criticalRegressions, [FP_A]);
    assert.equal(diff.counts.severityConflictsBaseline, 1);
  });
});

// ---------------------------------------------------------------------------
// Case pairing + determinism of the whole artifact
// ---------------------------------------------------------------------------

describe('paired-replay: case pairing and determinism', () => {
  test('runs pair by case key, not by array position', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.deepEqual(
      result.pairing.cases.map((c) => c.caseKey),
      ['case-1', 'case-2']
    );
    assert.deepEqual(result.pairing.cases[0].baselineRunIds, ['base-run-1']);
    assert.deepEqual(result.pairing.cases[0].candidateRunIds, ['cand-run-1']);
    assert.equal(result.terminalReason, 'success');
  });

  test('the whole artifact is byte-identical when the run order is shuffled', () => {
    const shuffled = spec();
    shuffled.baseline.runs.reverse();
    shuffled.candidate.runs.reverse();
    assert.equal(
      JSON.stringify(buildPairedReplay(shuffled, { now: NOW })),
      JSON.stringify(buildPairedReplay(spec(), { now: NOW }))
    );
  });

  test('reordering findings inside a record changes its digest but not the pairing', () => {
    const reordered = spec();
    reordered.baseline.runs[0].findings.reverse();
    const a = buildPairedReplay(spec(), { now: NOW });
    const b = buildPairedReplay(reordered, { now: NOW });
    // The evidence digest is a digest of the record AS STORED, so it moves.
    assert.notEqual(a.manifest.dataset.datasetHash, b.manifest.dataset.datasetHash);
    // The comparison itself is fingerprint-keyed and therefore unaffected.
    assert.deepEqual(
      a.pairing.cases.map((c) => c.findings),
      b.pairing.cases.map((c) => c.findings)
    );
    assert.deepEqual(a.metrics, b.metrics);
  });

  test('deriveCaseKey falls back to reviewedTarget@mergeBase and refuses to guess', () => {
    assert.equal(deriveCaseKey({ caseId: 'c' }), 'c');
    assert.equal(deriveCaseKey({ reviewedTarget: '/repo', mergeBase: 'abc' }), '/repo@abc');
    assert.equal(deriveCaseKey({ runId: 'r' }), null);
  });

  test('a case present on only one side is reported, never paired', () => {
    const lopsided = spec({ dataset: { heldOutCaseKeys: [] } });
    lopsided.candidate.runs = [lopsided.candidate.runs[0]];
    const result = buildPairedReplay(lopsided, { now: NOW });
    assert.deepEqual(result.pairing.unpairedCases.baselineOnly, ['case-2']);
    assert.deepEqual(result.pairing.unpairedCases.candidateOnly, []);
    assert.equal(result.metrics.overall.pairedCaseCount, 1);
  });

  test('a dropped candidate run is visible in the artifact AND in the Markdown', () => {
    // Regression guard: the case simply vanished from the report, so "no
    // regression over 1 of 3 cases" read as "no regression over the dataset".
    const lopsided = spec({ dataset: { heldOutCaseKeys: [] } });
    lopsided.candidate.runs = [lopsided.candidate.runs[0]];
    const result = buildPairedReplay(lopsided, { now: NOW });
    assert.equal(result.pairing.datasetCaseCount, 2);
    assert.equal(result.pairing.pairedCaseCount, 1);
    assert.equal(result.metrics.overall.unpairedCaseCount, 1);
    assert.equal(result.metrics.overall.datasetCaseCount, 2);
    assert.ok(result.pairing.warnings.some((w) => w.includes('対にできたのは 1 case')));

    const text = formatPairedReplayMarkdown(result);
    assert.match(text, /Dataset coverage/);
    assert.match(text, /paired 1 \/ dataset 2 case/);
    assert.match(text, /baseline only: `case-2`/);
    assert.match(text, /⚠️ dataset の 2 case のうち/);
  });

  test('unpairedCaseCount is declarable as an acceptance criterion', () => {
    const strict = spec({ dataset: { heldOutCaseKeys: [] } });
    strict.acceptance.profiles[0].criteria = [
      { metric: 'unpairedCaseCount', comparator: 'lte', threshold: 0 },
    ];
    strict.candidate.runs = [strict.candidate.runs[0]];
    const result = buildPairedReplay(strict, { now: NOW });
    const criterion = result.acceptance.evaluations[0].criteria.find(
      (c) => c.metric === 'unpairedCaseCount'
    );
    assert.equal(criterion.observed, 1);
    assert.equal(criterion.satisfied, false);
  });

  test('an unpairable dataset evaluates nothing instead of passing vacuously', () => {
    const unkeyed = spec({ dataset: { heldOutCaseKeys: [] } });
    unkeyed.baseline.runs = [{ runId: 'x', caseId: 'only-base', findings: [] }];
    unkeyed.candidate.runs = [{ runId: 'y', caseId: 'only-cand', findings: [] }];
    const result = buildPairedReplay(unkeyed, { now: NOW });
    assert.equal(result.acceptance.evaluable, false);
    assert.equal(result.acceptance.contract6.criticalRegressionCount, null);
    assert.equal(result.acceptance.contract6.criticalRegressionZero, null);
    const evaluation = result.acceptance.evaluations[0];
    assert.equal(
      evaluation.criteria.every((c) => c.satisfied === null),
      true
    );
    assert.equal(evaluation.allRequiredSatisfied, false);
    assert.equal(evaluation.sampleSizeSatisfied, null);
    assert.match(evaluation.criteria[0].note, /vacuous pass/);
  });

  test('runs without a derivable case key are counted, not paired', () => {
    const unkeyed = spec({ dataset: { heldOutCaseKeys: [] } });
    unkeyed.baseline.runs = [{ runId: 'x', findings: [finding(FP_A)] }];
    unkeyed.candidate.runs = [{ runId: 'y', findings: [finding(FP_A)] }];
    const result = buildPairedReplay(unkeyed, { now: NOW });
    assert.deepEqual(result.pairing.unkeyedRunCount, { baseline: 1, candidate: 1 });
    assert.equal(result.pairing.cases.length, 0);
    assert.equal(result.terminalReason, 'no_progress');
  });

  test('metrics are reported for the held-out subset as well as overall', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(result.metrics.overall.pairedCaseCount, 2);
    assert.equal(result.metrics.heldOut.pairedCaseCount, 1);
    // case-1: A unchanged, B removed, D added. case-2: C unchanged.
    assert.equal(result.metrics.overall.removedFindingCount, 1);
    assert.equal(result.metrics.overall.addedFindingCount, 1);
    assert.equal(result.metrics.overall.unchangedFindingCount, 2);
    assert.equal(result.metrics.heldOut.unchangedFindingCount, 1);
  });

  test('case 件数の呼び名は pairedCaseCount ひとつだけ', () => {
    // `caseCount` was always equal to `pairedCaseCount` but was not declarable
    // as a criterion, so two names for one number invited a profile to declare
    // the one the evaluator ignores.
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(Object.hasOwn(result.metrics.overall, 'caseCount'), false);
    assert.equal(Object.hasOwn(result.metrics.heldOut, 'caseCount'), false);
  });
});

// ---------------------------------------------------------------------------
// 契約6: acceptance is evaluated, never applied
// ---------------------------------------------------------------------------

describe('paired-replay 契約6: profile-specific acceptance', () => {
  test('critical regression 0 is injected into every declared profile', () => {
    const { manifest } = buildExperimentManifest(spec(), { now: NOW });
    const injected = manifest.acceptance.profiles[0].criteria.find(
      (c) => c.metric === 'criticalRegressionCount'
    );
    assert.deepEqual(injected, {
      metric: 'criticalRegressionCount',
      comparator: 'lte',
      threshold: 0,
      required: true,
      source: 'contract-6',
    });
  });

  test('契約6 の floor は宣言で緩められない: threshold は 0 にクランプされる', () => {
    // The contract is the SSoT: 「critical regression 0 は P2 の必須条件」.
    // A spec author declaring `threshold: 5` must not be able to opt out.
    const loosened = spec();
    loosened.acceptance.profiles[0].criteria.push({
      metric: 'criticalRegressionCount',
      comparator: 'lte',
      threshold: 5,
      required: false,
    });
    const { manifest } = buildExperimentManifest(loosened, { now: NOW });
    const criteria = manifest.acceptance.profiles[0].criteria.filter(
      (c) => c.metric === 'criticalRegressionCount'
    );
    assert.equal(criteria.length, 1);
    assert.deepEqual(criteria[0], {
      metric: 'criticalRegressionCount',
      comparator: 'lte',
      threshold: 0,
      required: true,
      source: 'contract-6',
    });
  });

  test('負の threshold 宣言も 0 でクランプされ、充足不能な必須基準にならない', () => {
    // Regression guard: `Math.min(acc, threshold)` from 0 let `threshold: -3`
    // become the floor, producing a required `criticalRegressionCount lte -3`
    // that no run can ever satisfy. Counts have no value below 0, so "stricter
    // than 0" does not exist.
    const negative = spec({ dataset: { heldOutCaseKeys: [] } });
    negative.acceptance.profiles[0].criteria.push({
      metric: 'criticalRegressionCount',
      comparator: 'lte',
      threshold: -3,
    });
    const result = buildPairedReplay(negative, { now: NOW });
    const criterion = result.manifest.acceptance.profiles[0].criteria.find(
      (c) => c.metric === 'criticalRegressionCount'
    );
    assert.equal(criterion.threshold, 0);
    assert.equal(criterion.required, true);
    assert.equal(criterion.source, 'contract-6');
    assert.equal(
      result.acceptance.evaluations[0].criteria.find((c) => c.metric === 'criticalRegressionCount')
        .satisfied,
      true
    );
  });

  test('契約6 の floor を緩めた宣言でも regression があれば充足しない', () => {
    const loosened = spec({ dataset: { heldOutCaseKeys: [] } });
    loosened.acceptance.profiles[0].criteria = [
      { metric: 'criticalRegressionCount', comparator: 'lte', threshold: 5, required: false },
    ];
    loosened.candidate.runs[0].findings = [finding(FP_D)]; // drops the critical FP_A
    const result = buildPairedReplay(loosened, { now: NOW });
    const evaluation = result.acceptance.evaluations[0];
    assert.equal(result.metrics.overall.criticalRegressionCount, 1);
    assert.equal(
      evaluation.criteria.find((c) => c.metric === 'criticalRegressionCount').satisfied,
      false
    );
    assert.equal(evaluation.allRequiredSatisfied, false);
  });

  test('acceptance is evaluated on the held-out set when one is declared', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(result.acceptance.evaluatedOn, 'heldOut');
    assert.equal(result.acceptance.evaluations[0].evaluatedOn, 'heldOut');
    assert.equal(result.acceptance.evaluations[0].sampleSize, 1);
  });

  test('meeting every criterion still yields no decision and no application', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    const evaluation = result.acceptance.evaluations[0];
    assert.equal(evaluation.allRequiredSatisfied, true);
    assert.equal(evaluation.criteriaFailed, 0);
    // The non-goal, asserted mechanically: no verdict, no side effect.
    assert.equal(result.acceptance.decision, null);
    assert.equal(result.acceptance.applied, false);
    assert.equal(result.acceptance.autoPromotion, false);
    assert.equal(result.acceptance.requiresHumanJudgment, true);
    assert.deepEqual(result.writeEffects, []);
    assert.equal(result.verification.canaryEligible, false);
    assert.equal(result.requiresHumanApproval, true);
  });

  test('failing a criterion also yields no decision — only a reported failure', () => {
    const strict = spec();
    strict.acceptance.profiles[0].criteria = [
      { metric: 'addedFindingCount', comparator: 'lte', threshold: -1 },
    ];
    strict.dataset = { heldOutCaseKeys: [] };
    const result = buildPairedReplay(strict, { now: NOW });
    const evaluation = result.acceptance.evaluations[0];
    assert.equal(evaluation.criteriaFailed, 1);
    assert.deepEqual(evaluation.failedMetrics, ['addedFindingCount']);
    assert.equal(evaluation.allRequiredSatisfied, false);
    assert.equal(result.acceptance.decision, null);
    assert.equal(result.acceptance.applied, false);
  });

  test('a critical regression is reported, and never turned into a gate', () => {
    const regressing = spec();
    regressing.candidate.runs[0].findings = [finding(FP_D)];
    regressing.dataset = { heldOutCaseKeys: [] };
    const result = buildPairedReplay(regressing, { now: NOW });
    assert.equal(result.acceptance.contract6.criticalRegressionCount, 1);
    assert.equal(result.acceptance.contract6.criticalRegressionZero, false);
    assert.equal(
      result.acceptance.evaluations[0].criteria.find((c) => c.metric === 'criticalRegressionCount')
        .satisfied,
      false
    );
    assert.equal(result.acceptance.decision, null);
  });

  test('a metric the replay cannot observe is unevaluable, not satisfied', () => {
    const evaluations = evaluateAcceptance({
      profiles: [
        {
          profile: 'strict',
          minSampleSize: null,
          criteria: [
            {
              metric: 'precision',
              comparator: 'gte',
              threshold: 0.9,
              required: true,
              source: 'declared',
            },
          ],
        },
      ],
      metrics: { sampleSize: 3, criticalRegressionCount: 0 },
      evaluatedOn: 'overall',
    });
    const criterion = evaluations[0].criteria[0];
    assert.equal(criterion.evaluable, false);
    assert.equal(criterion.satisfied, null);
    assert.match(criterion.note, /観測できない/);
    assert.equal(evaluations[0].criteriaUnevaluable, 1);
    assert.equal(evaluations[0].allRequiredSatisfied, false);
  });

  test('minSampleSize は denominator の単位で数える（paired-case）', () => {
    // Regression guard: `denominator` was a free-form label while sampleSize
    // always counted findings, so "at least 3 paired cases" passed on 1 case.
    const byCase = spec({ dataset: { heldOutCaseKeys: [] } });
    byCase.metrics = { denominator: 'paired-case' };
    byCase.acceptance.profiles[0].minSampleSize = 3;
    const result = buildPairedReplay(byCase, { now: NOW });
    assert.equal(result.metrics.overall.denominator, 'paired-case');
    assert.equal(result.metrics.overall.sampleSize, 2); // 2 paired cases, not 4 findings
    assert.equal(result.acceptance.evaluations[0].sampleSizeSatisfied, false);
  });

  test('paired-finding は finding 件数で数える', () => {
    const byFinding = spec({ dataset: { heldOutCaseKeys: [] } });
    byFinding.acceptance.profiles[0].minSampleSize = 3;
    const result = buildPairedReplay(byFinding, { now: NOW });
    assert.equal(result.metrics.overall.denominator, 'paired-finding');
    assert.equal(result.metrics.overall.sampleSize, 4);
    assert.equal(result.acceptance.evaluations[0].sampleSizeSatisfied, true);
  });

  test('an unknown denominator is rejected instead of silently counting findings', () => {
    assert.throws(
      () => buildExperimentManifest(spec({ metrics: { denominator: 'per-run' } }), { now: NOW }),
      /metrics.denominator "per-run" is unknown/
    );
  });

  test('an undeclared minSampleSize is reported as null, not as satisfied', () => {
    const noSample = spec();
    delete noSample.acceptance.profiles[0].minSampleSize;
    const result = buildPairedReplay(noSample, { now: NOW });
    assert.equal(result.acceptance.evaluations[0].minSampleSize, null);
    assert.equal(result.acceptance.evaluations[0].sampleSizeSatisfied, null);
  });

  test('no declared profile means no evaluation and an explicit note', () => {
    const result = buildPairedReplay(spec({ acceptance: undefined }), { now: NOW });
    assert.equal(result.acceptance.declaredProfileCount, 0);
    assert.deepEqual(result.acceptance.evaluations, []);
    assert.match(result.acceptance.note, /profile が宣言されていない/);
    // The contract-6 observation is still reported so the gap is visible.
    assert.equal(typeof result.acceptance.contract6.criticalRegressionCount, 'number');
    assert.equal(result.acceptance.decision, null);
  });

  test('an unknown comparator or duplicate profile is rejected', () => {
    const badComparator = spec();
    badComparator.acceptance.profiles[0].criteria = [
      { metric: 'addedFindingCount', comparator: 'approximately', threshold: 1 },
    ];
    assert.throws(() => buildExperimentManifest(badComparator, { now: NOW }), PairedReplayError);
    assert.ok(ACCEPTANCE_COMPARATORS.includes('lte'));

    const duplicate = spec();
    duplicate.acceptance.profiles.push({ profile: 'standard', criteria: [] });
    assert.throws(() => buildExperimentManifest(duplicate, { now: NOW }), /duplicate profile/);
  });
});

// ---------------------------------------------------------------------------
// Degenerate inputs
// ---------------------------------------------------------------------------

describe('paired-replay: degenerate inputs', () => {
  test('an empty baseline reports every candidate finding as added', () => {
    const empty = spec({ dataset: { heldOutCaseKeys: [] } });
    empty.baseline.runs = [runRecord({ runId: 'b', caseId: 'case-1', findings: [] })];
    empty.candidate.runs = [
      runRecord({ runId: 'c', caseId: 'case-1', findings: [finding(FP_A), finding(FP_B)] }),
    ];
    const result = buildPairedReplay(empty, { now: NOW });
    assert.equal(result.metrics.overall.addedFindingCount, 2);
    assert.equal(result.metrics.overall.removedFindingCount, 0);
    assert.equal(result.metrics.overall.sampleSize, 2);
  });

  test('an empty candidate reports every baseline finding as removed', () => {
    const empty = spec({ dataset: { heldOutCaseKeys: [] } });
    empty.baseline.runs = [
      runRecord({
        runId: 'b',
        caseId: 'case-1',
        findings: [finding(FP_A, { severity: 'critical' })],
      }),
    ];
    empty.candidate.runs = [runRecord({ runId: 'c', caseId: 'case-1', findings: [] })];
    const result = buildPairedReplay(empty, { now: NOW });
    assert.equal(result.metrics.overall.removedFindingCount, 1);
    assert.equal(result.metrics.overall.criticalRegressionCount, 1);
  });

  test('both sides empty is a valid, decision-free result', () => {
    const empty = spec({ dataset: { heldOutCaseKeys: [] } });
    empty.baseline.runs = [runRecord({ runId: 'b', caseId: 'case-1', findings: [] })];
    empty.candidate.runs = [runRecord({ runId: 'c', caseId: 'case-1', findings: [] })];
    const result = buildPairedReplay(empty, { now: NOW });
    assert.equal(result.metrics.overall.sampleSize, 0);
    assert.equal(result.terminalReason, 'success');
    assert.equal(result.acceptance.decision, null);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('an identical configuration is reported as not activated', () => {
    const same = spec({ dataset: { heldOutCaseKeys: [] } });
    same.candidate.commitSha = same.baseline.commitSha;
    same.candidate.skillRegistryCommit = same.baseline.skillRegistryCommit;
    same.candidate.runs = same.baseline.runs.map((r) => ({ ...r, runId: `${r.runId}-copy` }));
    const result = buildPairedReplay(same, { now: NOW });
    assert.equal(result.activationCheck.configurationDiffers, false);
    assert.equal(result.activationCheck.observedDifference, false);
    assert.equal(result.activationCheck.verified, false);
    // Both activation reasons are stated, alongside the provenance gaps this
    // fixture also has (#1719 W2 / W3: no gap may pass in silence).
    assert.ok(
      result.activationCheck.reasons.some((r) => r.includes('変更経路が存在しない')),
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.ok(
      result.activationCheck.reasons.some((r) => r.includes('paired diff に差分がなく')),
      JSON.stringify(result.activationCheck.reasons)
    );
  });

  test('a real difference in a differing configuration counts as activated', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(result.activationCheck.verified, true);
  });
});

// ---------------------------------------------------------------------------
// 契約1: trust stays where P1 left it
// ---------------------------------------------------------------------------

describe('paired-replay 契約1: evidence trust', () => {
  test('a forged CI provenance cannot mint trusted evidence', () => {
    const forged = spec();
    forged.candidate.runs[0].provenance = {
      evidenceSource: 'CI',
      trustedBy: 'github-actions',
    };
    const result = buildPairedReplay(forged, { now: NOW });
    assert.equal(result.verification.trustedEvidenceCount, 0);
    assert.equal(result.verification.untrustedEvidenceCount, 4);
    assert.equal(
      result.manifest.candidate.evidence.every((e) => e.trust_level === 'untrusted'),
      true
    );
    assert.equal(evidenceTrustLevel({ evidence_source: 'CI', trusted_by: 'ci' }), 'untrusted');
  });

  test('claiming an independent verifier does not make it verified', () => {
    const claimed = spec({ verifier: { independent: true, verifierId: 'ci', runBy: 'github' } });
    const result = buildPairedReplay(claimed, { now: NOW });
    assert.equal(result.manifest.verifier.independent, true);
    assert.equal(result.verification.independentVerifierClaimed, true);
    assert.equal(result.verification.independentVerifierVerified, false);
    assert.equal(result.verification.canaryEligible, false);
    assert.ok(result.verification.reasons.some((r) => r.includes('未決事項')));
  });
});

// ---------------------------------------------------------------------------
// 契約3 x 契約1: the evidence must agree with itself about the reviewed commit
// (#1719). NOT a check against side.commitSha — that is a configuration
// identifier baseline and candidate are expected to differ on, while
// source_commit_sha is the reviewed repository's HEAD.
// ---------------------------------------------------------------------------

/** Attach the #1715 / #1718 provenance block to a run record. */
function withProvenance(record, { sourceCommitSha = null, dirty = null } = {}) {
  return {
    ...record,
    ...(sourceCommitSha == null ? {} : { commitSha: sourceCommitSha }),
    provenance: {
      evidenceSource: 'local',
      sourceCommitSha,
      dirty,
      trustedBy: null,
      generatedByCandidate: false,
    },
  };
}

const SHA_A = '1111111111111111111111111111111111111111';
const SHA_B = '9999999999999999999999999999999999999999';

describe('paired-replay #1719: source_commit_sha internal consistency', () => {
  test('runs of one case reporting different commits refuse the experiment', () => {
    // The #1719 reproduction, re-expressed in the namespace that actually
    // carries the contradiction: two runs of case-1 that reviewed different
    // code are pooled into one case.
    const mixed = spec({ dataset: { heldOutCaseKeys: [] } });
    mixed.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [finding(FP_A)] }), {
        sourceCommitSha: SHA_A,
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [finding(FP_B)] }), {
        sourceCommitSha: SHA_B,
      }),
    ];
    assert.throws(
      () => buildPairedReplay(mixed, { now: NOW }),
      (err) =>
        err instanceof PairedReplayError &&
        /report several source_commit_sha values/.test(err.message) &&
        err.message.includes('baseline case "case-1"') &&
        // N3: the offending runs are named, so the dataset can be fixed.
        err.message.includes('run b1') &&
        err.message.includes('run b2')
    );
  });

  test('a side declaring a different commitSha than its evidence is NOT an error', () => {
    // `commitSha` is a configuration identifier (compared by
    // configurationDiffers alongside provider / model / temperature); the
    // evidence sha is the reviewed repository HEAD, identical on both sides for
    // the same case. Requiring equality would refuse every real dataset.
    const real = spec({ dataset: { heldOutCaseKeys: [] } });
    real.baseline.runs = real.baseline.runs.map((r) =>
      withProvenance(r, { sourceCommitSha: SHA_A, dirty: false })
    );
    real.candidate.runs = real.candidate.runs.map((r) =>
      withProvenance(r, { sourceCommitSha: SHA_A, dirty: false })
    );
    const result = buildPairedReplay(real, { now: NOW });
    assert.equal(result.manifest.baseline.commitSha, 'base-commit');
    assert.equal(result.manifest.candidate.commitSha, 'cand-commit');
    assert.equal(result.manifest.baseline.provenance.sourceCommitSha, SHA_A);
    assert.equal(result.manifest.candidate.provenance.sourceCommitSha, SHA_A);
    // The commit dimension of the activation check stays alive.
    assert.equal(result.activationCheck.configurationDiffers, true);
    assert.deepEqual(result.activationCheck.sourceCommitShaCoverage, {
      runCount: 4,
      knownRunCount: 4,
      unknownRunCount: 0,
    });
    assert.deepEqual(result.activationCheck.reasons, []);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('different cases of one side may report different commits', () => {
    // A real `.river/runs` dataset accumulates cases over time, so per-side
    // uniqueness would reject it. Per-case consistency is what the contract
    // needs, and the side-level derived sha becomes null.
    const perCase = spec({ dataset: { heldOutCaseKeys: [] } });
    perCase.baseline.runs = [
      withProvenance(perCase.baseline.runs[0], { sourceCommitSha: SHA_A }),
      withProvenance(perCase.baseline.runs[1], { sourceCommitSha: SHA_B }),
    ];
    const result = buildPairedReplay(perCase, { now: NOW });
    assert.equal(result.manifest.baseline.provenance.sourceCommitSha, null);
    assert.equal(result.manifest.baseline.provenance.sourceCommitShaUnknownRunCount, 0);
  });

  test('an abbreviated sha resolves to the full one it prefixes (W4 normalization)', () => {
    const abbreviated = spec({ dataset: { heldOutCaseKeys: [] } });
    abbreviated.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [finding(FP_A)] }), {
        sourceCommitSha: SHA_A.slice(0, 7).toUpperCase(),
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [finding(FP_B)] }), {
        sourceCommitSha: SHA_A,
      }),
    ];
    const result = buildPairedReplay(abbreviated, { now: NOW });
    // Longest (most specific) representation wins, lowercased.
    assert.equal(result.manifest.baseline.provenance.sourceCommitSha, SHA_A);

    // A 6-char prefix is below git's unambiguous floor and is NOT absorbed.
    const tooShort = spec({ dataset: { heldOutCaseKeys: [] } });
    tooShort.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [finding(FP_A)] }), {
        sourceCommitSha: SHA_A.slice(0, 6),
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [finding(FP_B)] }), {
        sourceCommitSha: SHA_A,
      }),
    ];
    assert.throws(
      () => buildPairedReplay(tooShort, { now: NOW }),
      /report several source_commit_sha values/
    );
  });

  test('both sides are reported in a single error (N2)', () => {
    const both = spec({ dataset: { heldOutCaseKeys: [] } });
    both.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_A,
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_B,
      }),
    ];
    both.candidate.runs = [
      withProvenance(runRecord({ runId: 'c1', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_A,
      }),
      withProvenance(runRecord({ runId: 'c2', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_B,
      }),
    ];
    let message = '';
    try {
      buildPairedReplay(both, { now: NOW });
    } catch (err) {
      message = err.message;
    }
    assert.ok(message.includes('baseline case "case-1"'), message);
    assert.ok(message.includes('candidate case "case-1"'), message);
  });

  test('runs without a case key are not subject to the check', () => {
    // No case identity means no "same input" claim to violate; they are already
    // excluded from pairing.
    const unkeyed = spec({ dataset: { heldOutCaseKeys: [] } });
    const strip = (r) => {
      const copy = { ...r };
      delete copy.caseId;
      delete copy.reviewedTarget;
      delete copy.mergeBase;
      return copy;
    };
    unkeyed.baseline.runs = [
      withProvenance(strip(unkeyed.baseline.runs[0]), { sourceCommitSha: SHA_A }),
      withProvenance(strip(unkeyed.baseline.runs[1]), { sourceCommitSha: SHA_B }),
    ];
    const result = buildPairedReplay(unkeyed, { now: NOW });
    assert.equal(result.manifest.baseline.unkeyedRunCount, 2);
  });

  test('a record without source_commit_sha is 未取得 and is surfaced, not silent', () => {
    // The default fixture predates #1715: no provenance block at all.
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(result.manifest.baseline.provenance.sourceCommitSha, null);
    assert.equal(result.manifest.baseline.provenance.sourceCommitShaUnknownRunCount, 2);
    assert.equal(result.manifest.baseline.provenance.dirtyUnknownRunCount, 2);
    assert.deepEqual(result.activationCheck.sourceCommitShaCoverage, {
      runCount: 4,
      knownRunCount: 0,
      unknownRunCount: 4,
    });
    // W2 / W3: neither gap may pass in silence.
    assert.ok(
      result.activationCheck.reasons.some((r) => r.includes('source_commit_sha を持たない run')),
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.ok(
      result.activationCheck.reasons.some((r) => r.includes('dirty フラグを持たない run')),
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.equal(result.activationCheck.verified, true);
  });

  test('a dirty run is recorded and warned about, and does not relax the check', () => {
    const dirty = spec();
    dirty.baseline.runs = dirty.baseline.runs.map((r) =>
      withProvenance(r, { sourceCommitSha: SHA_A, dirty: true })
    );
    dirty.candidate.runs = [
      withProvenance(dirty.candidate.runs[0], { sourceCommitSha: SHA_A, dirty: true }),
      withProvenance(dirty.candidate.runs[1], { sourceCommitSha: SHA_A, dirty: false }),
    ];
    const result = buildPairedReplay(dirty, { now: NOW });
    assert.equal(result.manifest.baseline.provenance.dirtyRunCount, 2);
    assert.equal(result.manifest.candidate.provenance.dirtyRunCount, 1);
    assert.equal(result.manifest.candidate.provenance.dirtyUnknownRunCount, 0);
    assert.ok(
      result.activationCheck.reasons.some((r) => r.includes('dirty な working tree')),
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.match(formatPairedReplayMarkdown(result), /dirty な working tree/);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));

    // dirty は判定を緩める理由にならない: 同一 case で commit が割れれば拒否する。
    const dirtyAndMixed = spec({ dataset: { heldOutCaseKeys: [] } });
    dirtyAndMixed.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_A,
        dirty: true,
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_B,
        dirty: true,
      }),
    ];
    assert.throws(
      () => buildPairedReplay(dirtyAndMixed, { now: NOW }),
      /report several source_commit_sha values/
    );
  });

  test('the provenance summary is pinned by the manifest and stays deterministic', () => {
    const build = () => {
      const s = spec();
      s.baseline.runs = s.baseline.runs.map((r) =>
        withProvenance(r, { sourceCommitSha: SHA_A, dirty: true })
      );
      return s;
    };
    const a = buildExperimentManifest(build(), { now: NOW }).manifest;
    const b = buildExperimentManifest(build(), { now: LATER }).manifest;
    // Same run records -> same experimentKey: the summary is derived from the
    // very records the dataset hash already covers, so it adds no new input.
    assert.equal(a.experimentKey, b.experimentKey);
    assert.equal(a.baseline.provenance.dirtyRunCount, 2);
    // Pinned as a condition: editing it out is a detectable tamper (契約3).
    const strippedBaseline = { ...a.baseline };
    delete strippedBaseline.provenance;
    assert.equal(verifyExperimentManifest({ ...a, baseline: strippedBaseline }).verified, false);
  });

  test('a manifest without the provenance block stays schema-valid (W1)', () => {
    // v1.68.0 and earlier pinned no provenance. The field is additive under the
    // same schemaVersion, so an artifact produced then must still validate.
    const result = buildPairedReplay(spec(), { now: NOW });
    delete result.manifest.baseline.provenance;
    delete result.manifest.candidate.provenance;
    delete result.activationCheck.sourceCommitShaCoverage;
    assert.equal(result.schemaVersion, 1);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('the CLI reports the inconsistency as a usage error instead of a report', async (t) => {
    const mixed = spec({ dataset: { heldOutCaseKeys: [] } });
    mixed.baseline.runs = [
      withProvenance(runRecord({ runId: 'b1', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_A,
      }),
      withProvenance(runRecord({ runId: 'b2', caseId: 'case-1', findings: [] }), {
        sourceCommitSha: SHA_B,
      }),
    ];
    const { specPath, cleanup } = seedSpec(mixed);
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--output', 'json']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /report several source_commit_sha values/);
    assert.equal(res.stdout, '');
  });

  test('an experimentKey mismatch names the provenance change as a cause (W1)', async (t) => {
    // A manifest built before `provenance` existed hashes a smaller condition
    // set, so it lands in the "different experiment" branch even though its own
    // digests verify. Simulated here with a manifest of another experiment: the
    // reader must be told that rebuilding is the fix, not only "wrong file".
    const withOther = spec();
    withOther.manifest = buildExperimentManifest(spec({ hypothesis: '別の仮説' }), {
      now: NOW,
    }).manifest;
    const { specPath, cleanup } = seedSpec(withOther);
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /different experiment/);
    assert.match(res.stderr, /v1\.68\.0 or earlier do not pin manifest\.<side>\.provenance/);
  });
});

// ---------------------------------------------------------------------------
// #1724: the two sides may have reviewed DIFFERENT code. #1719 checks each side
// against itself only, so the cross-side case passes every existing check.
// Recorded and surfaced, never refused: re-collecting one side later is a
// legitimate way to run an experiment.
// ---------------------------------------------------------------------------

/** Give every run of one side the same source_commit_sha. */
function withSideSha(specObj, side, sha) {
  specObj[side].runs = specObj[side].runs.map((r) => withProvenance(r, { sourceCommitSha: sha }));
  return specObj;
}

describe('paired-replay #1724: cross-side source_commit_sha', () => {
  test('different commits on the two sides are recorded and surfaced', () => {
    const s = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(s, 'baseline', SHA_A);
    withSideSha(s, 'candidate', SHA_B);
    const result = buildPairedReplay(s, { now: NOW });
    assert.deepEqual(result.activationCheck.crossSideSourceCommitSha, {
      baseline: SHA_A,
      candidate: SHA_B,
      comparable: true,
      differs: true,
    });
    assert.ok(
      result.activationCheck.reasons.some((r) =>
        r.includes('baseline と candidate の source_commit_sha が異なる')
      ),
      JSON.stringify(result.activationCheck.reasons)
    );
    // Fail-OPEN by decision: a later re-collect of one side is legitimate, so
    // the difference must not flip `verified` or refuse the experiment.
    assert.equal(result.activationCheck.verified, true);
    // Visible to a human reader, not only to a JSON consumer.
    assert.match(
      formatPairedReplayMarkdown(result),
      /baseline と candidate の source_commit_sha が異なる/
    );
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('the same commit on both sides is not a difference', () => {
    const s = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(s, 'baseline', SHA_A);
    withSideSha(s, 'candidate', SHA_A);
    const result = buildPairedReplay(s, { now: NOW });
    assert.deepEqual(result.activationCheck.crossSideSourceCommitSha, {
      baseline: SHA_A,
      candidate: SHA_A,
      comparable: true,
      differs: false,
    });
    assert.equal(
      result.activationCheck.reasons.some((r) => r.includes('source_commit_sha が異なる')),
      false,
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('one side without a derived sha is 未取得, not a difference', () => {
    // The candidate keeps the pre-#1715 records of the default fixture: no
    // provenance block at all, so nothing can be compared.
    const s = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(s, 'baseline', SHA_A);
    const result = buildPairedReplay(s, { now: NOW });
    assert.deepEqual(result.activationCheck.crossSideSourceCommitSha, {
      baseline: SHA_A,
      candidate: null,
      comparable: false,
      // null, NOT false: 未取得 is not agreement (same stance as :316).
      differs: null,
    });
    assert.equal(
      result.activationCheck.reasons.some((r) =>
        r.includes('baseline と candidate の source_commit_sha が異なる')
      ),
      false,
      JSON.stringify(result.activationCheck.reasons)
    );
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));

    // Mirrored: a side spanning several cases derives null too, and that is
    // also 未取得 rather than a difference.
    const spanning = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(spanning, 'candidate', SHA_B);
    spanning.baseline.runs = [
      withProvenance(spanning.baseline.runs[0], { sourceCommitSha: SHA_A }),
      withProvenance(spanning.baseline.runs[1], { sourceCommitSha: SHA_B }),
    ];
    const spanningResult = buildPairedReplay(spanning, { now: NOW });
    assert.equal(spanningResult.manifest.baseline.provenance.sourceCommitSha, null);
    assert.deepEqual(spanningResult.activationCheck.crossSideSourceCommitSha, {
      baseline: null,
      candidate: SHA_B,
      comparable: false,
      differs: null,
    });
  });

  test('an abbreviated sha is judged by the same rule as within a side', () => {
    // resolveObservedSha is reused rather than a second normalization: a 7-hex
    // prefix of the other side's sha is the same commit, and an uppercase
    // record is already lowercased by summarizeSideProvenance.
    const s = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(s, 'baseline', SHA_A.slice(0, 7).toUpperCase());
    withSideSha(s, 'candidate', SHA_A);
    const result = buildPairedReplay(s, { now: NOW });
    assert.deepEqual(result.activationCheck.crossSideSourceCommitSha, {
      baseline: SHA_A.slice(0, 7),
      candidate: SHA_A,
      comparable: true,
      differs: false,
    });
  });

  test('the manifest is untouched, so its id does not move (契約3)', () => {
    const s = spec({ dataset: { heldOutCaseKeys: [] } });
    withSideSha(s, 'baseline', SHA_A);
    withSideSha(s, 'candidate', SHA_B);
    const result = buildPairedReplay(s, { now: NOW });
    // The cross-side field is a REPORT field. Putting it in the manifest would
    // enter `conditions` and change experimentKey / manifestId for every
    // existing manifest.
    assert.equal('crossSideSourceCommitSha' in result.manifest, false);
    assert.equal(verifyExperimentManifest(result.manifest).verified, true);
    // Literal pin: the default fixture's id, measured on the pre-#1724 code.
    // Any future condition added to the manifest breaks this line on purpose.
    assert.equal(
      buildExperimentManifest(spec(), { now: NOW }).manifest.manifestId,
      'RR-EXP-d729968ecc35'
    );
  });

  test('a result without the cross-side field stays schema-valid', () => {
    // Additive under the same schemaVersion, like sourceCommitShaCoverage (W1).
    const result = buildPairedReplay(spec(), { now: NOW });
    delete result.activationCheck.crossSideSourceCommitSha;
    assert.equal(result.schemaVersion, 1);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });
});

// ---------------------------------------------------------------------------
// Artifact shape
// ---------------------------------------------------------------------------

describe('paired-replay: artifact', () => {
  test('validates against schemas/paired-replay.schema.json', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    assert.equal(result.promotionHandoff, null);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('schemaVersion 1 stays backward-compatible when promotionHandoff is absent', () => {
    const result = buildPairedReplay(spec(), { now: NOW });
    delete result.promotionHandoff;
    assert.equal(result.schemaVersion, 1);
    assert.equal(validateReplay(result), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('a supplied manifest describing another experiment is flagged', () => {
    const other = buildExperimentManifest(spec({ hypothesis: 'まったく別の仮説' }), {
      now: NOW,
    }).manifest;
    const result = buildPairedReplay(spec(), { now: NOW, manifest: other });
    assert.equal(result.manifestVerification.verified, true);
    assert.equal(result.manifestVerification.experimentKeyMatchesInputs, false);
  });

  test('the Markdown rendering states the read-only, decision-free contract', () => {
    const text = formatPairedReplayMarkdown(buildPairedReplay(spec(), { now: NOW }));
    assert.match(text, /Paired replay \(read-only\)/);
    assert.match(text, /decision は常に null/);
    assert.match(text, /Critical regressions \| 0/);
    assert.doesNotMatch(text, /Promotion handoff/);
  });

  test('the Markdown renders a candidate handoff as observation, not a verdict', () => {
    const evidence = [
      { skillId: 'secret-scanner', feedbackType: 'false_positive', findingFingerprint: FP_A, pr: 1 },
      { skillId: 'secret-scanner', feedbackType: 'false_positive', findingFingerprint: FP_B, pr: 2 },
    ];
    const result = buildPairedReplay(
      spec({
        improvementCandidate: {
          clusterKey: 'secret-scanner::false_positive',
          sourceFeedbackRefs: evidence,
        },
      }),
      { now: NOW }
    );
    const text = formatPairedReplayMarkdown(result);
    assert.match(text, /Promotion handoff \(read-only\)/);
    assert.match(text, new RegExp(result.promotionHandoff.candidateId));
    assert.match(text, /Human judgment required/);
    assert.doesNotMatch(text, /recommended decision|promotion decision: (approve|reject)/i);
  });

  test('the Markdown distinguishes satisfied / failed / unobservable criteria', () => {
    const mixed = spec({ dataset: { heldOutCaseKeys: [] } });
    mixed.acceptance.profiles[0].criteria = [
      { metric: 'addedFindingCount', comparator: 'lte', threshold: -1 }, // fails
      { metric: 'precision', comparator: 'gte', threshold: 0.9 }, // unobservable
    ];
    const text = formatPairedReplayMarkdown(buildPairedReplay(mixed, { now: NOW }));
    assert.match(text, /✔ criticalRegressionCount lte 0/);
    assert.match(text, /✘ addedFindingCount lte -1/);
    assert.match(text, /—\(観測不可\) precision gte 0\.9/);
    assert.match(text, /allRequiredSatisfied ✘/);
    assert.match(text, /契約6 の floor・宣言では緩められない/);
  });

  test('case key と profile 名は NFC 正規化して扱う', () => {
    // NFD "ガ" (か + combining dakuten) must resolve to the same case as NFC.
    const nfd = spec({ dataset: { heldOutCaseKeys: [] } });
    const nfcKey = 'ガ-case';
    const nfdKey = 'ガ-case'.normalize('NFD');
    nfd.baseline.runs = [runRecord({ runId: 'b', caseId: nfcKey, findings: [finding(FP_A)] })];
    nfd.candidate.runs = [runRecord({ runId: 'c', caseId: nfdKey, findings: [finding(FP_A)] })];
    const result = buildPairedReplay(nfd, { now: NOW });
    assert.equal(result.pairing.pairedCaseCount, 1);
    assert.deepEqual(result.pairing.unpairedCases.baselineOnly, []);
    assert.equal(result.pairing.cases[0].caseKey, nfcKey);
  });
});

// ---------------------------------------------------------------------------
// CLI: `river evolve replay` must not touch anything.
// ---------------------------------------------------------------------------

function snapshotTree(dir) {
  const snapshot = {};
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        snapshot[path.relative(dir, full) + '/'] = 'dir';
        walk(full);
      } else {
        snapshot[path.relative(dir, full)] = `${stats.mtimeMs}:${readFileSync(full, 'utf8')}`;
      }
    }
  };
  walk(dir);
  return snapshot;
}

function seedSpec(overrides) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rr-replay-'));
  mkdirSync(path.join(root, '.river'), { recursive: true });
  const specPath = path.join(root, 'experiment.json');
  writeFileSync(specPath, JSON.stringify(overrides ?? spec(), null, 2), 'utf8');
  return { root, specPath, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('river evolve replay (CLI)', () => {
  test('emits the paired replay as JSON and exits 0', async (t) => {
    const { specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--output', 'json']);
    assert.equal(res.code, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.mode, 'paired-replay');
    assert.equal(parsed.acceptance.decision, null);
    assert.equal(validateReplay(parsed), true, JSON.stringify(validateReplay.errors, null, 2));
  });

  test('the default text output is a human-readable report', async (t) => {
    const { specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /Paired replay \(read-only\)/);
  });

  test('is read-only: no file under the spec directory is created or modified', async (t) => {
    const { root, specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const before = snapshotTree(root);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--output', 'json']);
    assert.equal(res.code, 0, res.stderr);
    assert.deepEqual(snapshotTree(root), before);
  });

  test('a tampered stored manifest exits 1 instead of printing a report', async (t) => {
    const withManifest = spec();
    const { manifest } = buildExperimentManifest(withManifest, { now: NOW });
    withManifest.manifest = {
      ...manifest,
      baseline: { ...manifest.baseline, commitSha: 'forged' },
    };
    const { specPath, cleanup } = seedSpec(withManifest);
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--output', 'json']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Manifest verification failed/);
    assert.equal(res.stdout, '');
  });

  test('a manifest for a different experiment exits 1', async (t) => {
    const mismatched = spec();
    mismatched.manifest = buildExperimentManifest(spec({ hypothesis: '別の仮説' }), {
      now: NOW,
    }).manifest;
    const { specPath, cleanup } = seedSpec(mismatched);
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /different experiment/);
  });

  test('--expect-manifest pins the experiment identity', async (t) => {
    const { specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const { manifest } = buildExperimentManifest(spec(), { now: NOW });
    const ok = await runCliInProcess([
      'evolve',
      'replay',
      '--spec',
      specPath,
      '--expect-manifest',
      manifest.manifestId,
      '--output',
      'json',
    ]);
    assert.equal(ok.code, 0, ok.stderr);
    const bad = await runCliInProcess([
      'evolve',
      'replay',
      '--spec',
      specPath,
      '--expect-manifest',
      'RR-EXP-000000000000',
    ]);
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /--expect-manifest/);
  });

  test('an invalid spec exits 1 with the validation message', async (t) => {
    const invalid = spec();
    invalid.baseline.runs = [];
    const { specPath, cleanup } = seedSpec(invalid);
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /baseline.runs must be a non-empty array/);
  });

  test('replay without --spec exits 1', async () => {
    const res = await runCliInProcess(['evolve', 'replay']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /requires --spec/);
  });

  test('a positional argument is rejected instead of being silently ignored', async (t) => {
    const { root, specPath, cleanup } = seedSpec();
    t.after(cleanup);
    // `replay` has no positional: the path used to be swallowed as the (unused)
    // target and the command still exited 0.
    const res = await runCliInProcess(['evolve', 'replay', root, '--spec', specPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Unexpected argument/);
  });

  test('a spec file that is not a JSON object exits 1 with a usage error', async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'rr-replay-null-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const specPath = path.join(root, 'null.json');
    writeFileSync(specPath, 'null', 'utf8');
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /must contain a JSON object/);
    assert.doesNotMatch(res.stderr, /Cannot read properties/);
  });

  test('aggregate options are rejected for replay and vice versa', async (t) => {
    const { root, specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const withMin = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--min', '2']);
    assert.equal(withMin.code, 1);
    assert.match(withMin.stderr, /--min \/ --month are aggregate options/);

    const withSpec = await runCliInProcess(['evolve', 'aggregate', root, '--spec', specPath]);
    assert.equal(withSpec.code, 1);
    assert.match(withSpec.stderr, /only valid for `river evolve replay`/);
  });

  test('--output yaml is rejected rather than silently rendered as text', async (t) => {
    const { specPath, cleanup } = seedSpec();
    t.after(cleanup);
    const res = await runCliInProcess(['evolve', 'replay', '--spec', specPath, '--output', 'yaml']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Unsupported --output/);
  });
});
