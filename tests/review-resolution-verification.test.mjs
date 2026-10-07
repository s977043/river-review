import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  ReviewResolutionVerificationError,
  assessReviewResolutionFreshness,
  proposeReviewResolutionVerificationUpdate,
} from '../src/lib/review-resolution-verification.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function revision(reviewRunId, manifestHash, artifactHash) {
  return {
    reviewRunId,
    executionManifestId: `RR-EXM-${manifestHash.repeat(12).slice(0, 12)}`,
    artifactRefs: [{ name: 'diff', sha256: artifactHash }],
  };
}

const SOURCE = revision('run-source', 'a', HASH_A);
const TARGET = revision('run-target', 'b', HASH_B);
const NEWER = revision('run-newer', 'c', HASH_C);

function finding(id = 'rr-1', overrides = {}) {
  return {
    id,
    title: 'Example finding',
    file: 'src/example.mjs',
    lineStart: 10,
    fingerprint: `fp-${id}`,
    fingerprintV2: `fp2-${id}`,
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    findingRef: {
      findingId: 'rr-1',
      fingerprint: 'fp-rr-1',
      fingerprintAlgo: 'v1',
      sources: [{ findingId: 'source-rr-1', reviewerId: 'bug-hunter' }],
    },
    systemJudgment: {
      disposition: 'unknown',
      source: 'unavailable',
    },
    authorResponse: {
      state: 'will_fix',
      rationale: 'Fix submitted.',
    },
    resolution: {
      state: 'action_submitted',
      target: null,
      decisionRefs: [],
    },
    verification: {
      state: 'pending',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
    ...overrides,
  };
}

function document(items = [item()]) {
  return {
    schemaVersion: '1',
    kind: 'review-resolution',
    resolutionId: 'RR-RES-pr-42',
    source: SOURCE,
    items,
  };
}

function observation(overrides = {}) {
  return {
    mode: 'targeted',
    outcome: 'not_reproduced',
    targetRevision: TARGET,
    coverageStatus: 'complete',
    verifier: 'finding-critic',
    evidenceRefs: [{ ref: 'critic:rr-1@run-target', sha256: HASH_B }],
    ...overrides,
  };
}

const FINDING_TARGET = {
  findingId: 'rr-1',
  fingerprint: 'fp-rr-1',
  fingerprintAlgo: 'v1',
};

describe('assessReviewResolutionFreshness', () => {
  test('reports unbound, fresh, stale, and unknown without mutating the sidecar', () => {
    const doc = document([
      item(),
      item({
        findingRef: {
          findingId: 'rr-2',
          fingerprint: 'fp-rr-2',
          fingerprintAlgo: 'v1',
          sources: [{ findingId: 'source-rr-2', reviewerId: 'test-gap' }],
        },
        resolution: { state: 'action_submitted', target: TARGET, decisionRefs: [] },
      }),
      item({
        findingRef: {
          findingId: 'rr-3',
          fingerprint: 'fp-rr-3',
          fingerprintAlgo: 'v1',
          sources: [{ findingId: 'source-rr-3', reviewerId: 'security-scanner' }],
        },
        resolution: { state: 'action_submitted', target: SOURCE, decisionRefs: [] },
      }),
    ]);
    const before = JSON.stringify(doc);

    assert.deepEqual(assessReviewResolutionFreshness(doc, TARGET), [
      { itemIndex: 0, status: 'unbound' },
      { itemIndex: 1, status: 'fresh' },
      { itemIndex: 2, status: 'stale' },
    ]);
    assert.deepEqual(assessReviewResolutionFreshness(doc, null), [
      { itemIndex: 0, status: 'unbound' },
      { itemIndex: 1, status: 'unknown' },
      { itemIndex: 2, status: 'unknown' },
    ]);
    assert.equal(JSON.stringify(doc), before);
  });
});

describe('proposeReviewResolutionVerificationUpdate', () => {
  test('targeted not_reproduced with explicit evidence becomes verified_resolved', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: document(),
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: observation(),
    });

    assert.equal(proposal.items[0].verification.state, 'verified_resolved');
    assert.deepEqual(proposal.items[0].resolution.target, TARGET);
    assert.equal(proposal.items[0].resolution.state, 'action_submitted');
    assert.equal(proposal.items[0].authorResponse.state, 'will_fix');
  });

  test('targeted reproduced with explicit evidence becomes persists', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: document(),
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: observation({ outcome: 'reproduced' }),
    });

    assert.equal(proposal.items[0].verification.state, 'persists');
  });

  test('full-run absence with complete coverage stops at not_reproduced', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: document(),
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: observation({
        mode: 'full_run',
        verifier: null,
        evidenceRefs: [],
      }),
    });

    assert.equal(proposal.items[0].verification.state, 'not_reproduced');
    assert.notEqual(proposal.items[0].verification.state, 'verified_resolved');
  });

  test('incomplete or unknown coverage always fails safe to inconclusive', () => {
    for (const coverageStatus of ['partial', 'not_executed', 'unknown']) {
      const proposal = proposeReviewResolutionVerificationUpdate({
        findings: [finding()],
        reviewResolution: document(),
        findingTarget: FINDING_TARGET,
        currentRevision: TARGET,
        observation: observation({ coverageStatus }),
      });
      assert.equal(proposal.items[0].verification.state, 'inconclusive');
    }
  });

  test('targeted verification without explicit evidence is inconclusive', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: document(),
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: observation({ evidenceRefs: [] }),
    });

    assert.equal(proposal.items[0].verification.state, 'inconclusive');
  });

  test('rejects an observation for a stale revision', () => {
    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: document(),
          findingTarget: FINDING_TARGET,
          currentRevision: NEWER,
          observation: observation({ targetRevision: TARGET }),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError && error.code === 'stale_observation'
    );
  });

  test('rejects success-like re-verification against the source revision', () => {
    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: document(),
          findingTarget: FINDING_TARGET,
          currentRevision: SOURCE,
          observation: observation({ targetRevision: SOURCE }),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'same_source_revision'
    );
  });

  test('rejects a sidecar already bound to a different target revision', () => {
    const doc = document([
      item({
        resolution: {
          state: 'action_submitted',
          target: TARGET,
          decisionRefs: [],
        },
      }),
    ]);

    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: doc,
          findingTarget: FINDING_TARGET,
          currentRevision: NEWER,
          observation: observation({ targetRevision: NEWER }),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'stale_resolution_target'
    );
  });

  test('rejects mismatched target identity instead of verifying the wrong finding', () => {
    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: document(),
          findingTarget: {
            findingId: 'rr-1',
            fingerprint: 'different-fingerprint',
            fingerprintAlgo: 'v1',
          },
          currentRevision: TARGET,
          observation: observation(),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'finding_identity_mismatch'
    );
  });

  test('does not mutate source sidecar or caller-owned observation', () => {
    const doc = document();
    const obs = observation();
    const before = JSON.stringify({ doc, obs });

    proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: doc,
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: obs,
    });

    assert.equal(JSON.stringify({ doc, obs }), before);
  });
});
