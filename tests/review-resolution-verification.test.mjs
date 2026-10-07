import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  ReviewResolutionVerificationError,
  assessReviewResolutionFreshness,
  proposeReviewResolutionTargetBinding,
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

function item({
  findingId = 'rr-1',
  fingerprint = 'fp-rr-1',
  authorState = 'will_fix',
  resolutionState = 'open',
  target = null,
  verificationState = 'not_requested',
  verifier = null,
  coverageStatus = 'unknown',
  evidenceRefs = [],
} = {}) {
  return {
    findingRef: {
      findingId,
      fingerprint,
      fingerprintAlgo: 'v1',
      sources: [{ findingId: `source-${findingId}`, reviewerId: 'bug-hunter' }],
    },
    systemJudgment: {
      disposition: 'unknown',
      source: 'unavailable',
    },
    authorResponse: {
      state: authorState,
      rationale: authorState === 'will_fix' ? 'Fix planned.' : null,
    },
    resolution: {
      state: resolutionState,
      target,
      decisionRefs: [],
    },
    verification: {
      state: verificationState,
      verifier,
      coverageStatus,
      evidenceRefs,
    },
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

function boundDocument(target = TARGET) {
  return document([
    item({
      resolutionState: 'action_submitted',
      target,
      verificationState: 'pending',
    }),
  ]);
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
        findingId: 'rr-2',
        fingerprint: 'fp-rr-2',
        resolutionState: 'action_submitted',
        target: TARGET,
        verificationState: 'pending',
      }),
      item({
        findingId: 'rr-3',
        fingerprint: 'fp-rr-3',
        resolutionState: 'action_submitted',
        target: NEWER,
        verificationState: 'pending',
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

describe('proposeReviewResolutionTargetBinding', () => {
  test('explicitly binds a submitted revision and resets verification to pending', () => {
    const source = document();
    const proposal = proposeReviewResolutionTargetBinding({
      findings: [finding()],
      reviewResolution: source,
      findingTarget: FINDING_TARGET,
      targetRevision: TARGET,
    });

    assert.equal(proposal.items[0].resolution.state, 'action_submitted');
    assert.deepEqual(proposal.items[0].resolution.target, TARGET);
    assert.deepEqual(proposal.items[0].verification, {
      state: 'pending',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    });
    assert.equal(source.items[0].resolution.state, 'open');
    assert.equal(source.items[0].resolution.target, null);
  });

  test('rebinding a newer revision invalidates older verification evidence', () => {
    const verified = document([
      item({
        resolutionState: 'action_submitted',
        target: TARGET,
        verificationState: 'verified_resolved',
        verifier: 'finding-critic',
        coverageStatus: 'complete',
        evidenceRefs: [{ ref: 'critic:rr-1@run-target', sha256: HASH_B }],
      }),
    ]);

    const proposal = proposeReviewResolutionTargetBinding({
      findings: [finding()],
      reviewResolution: verified,
      findingTarget: FINDING_TARGET,
      targetRevision: NEWER,
    });

    assert.deepEqual(proposal.items[0].resolution.target, NEWER);
    assert.equal(proposal.items[0].verification.state, 'pending');
    assert.equal(proposal.items[0].verification.verifier, null);
    assert.deepEqual(proposal.items[0].verification.evidenceRefs, []);
  });

  test('same target binding is idempotent after action submission', () => {
    const bound = boundDocument();
    const proposal = proposeReviewResolutionTargetBinding({
      findings: [finding()],
      reviewResolution: bound,
      findingTarget: FINDING_TARGET,
      targetRevision: TARGET,
    });

    assert.deepEqual(proposal, bound);
    assert.notEqual(proposal, bound);
  });

  test('requires will_fix before binding a fix revision', () => {
    assert.throws(
      () =>
        proposeReviewResolutionTargetBinding({
          findings: [finding()],
          reviewResolution: document([item({ authorState: 'disputes' })]),
          findingTarget: FINDING_TARGET,
          targetRevision: TARGET,
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'author_response_not_will_fix'
    );
  });

  test('does not bind the source revision as a submitted fix', () => {
    assert.throws(
      () =>
        proposeReviewResolutionTargetBinding({
          findings: [finding()],
          reviewResolution: document(),
          findingTarget: FINDING_TARGET,
          targetRevision: SOURCE,
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'same_source_revision'
    );
  });
});

describe('proposeReviewResolutionVerificationUpdate', () => {
  test('targeted not_reproduced with explicit evidence becomes verified_resolved', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: boundDocument(),
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
      reviewResolution: boundDocument(),
      findingTarget: FINDING_TARGET,
      currentRevision: TARGET,
      observation: observation({ outcome: 'reproduced' }),
    });

    assert.equal(proposal.items[0].verification.state, 'persists');
  });

  test('full-run absence with complete coverage stops at not_reproduced', () => {
    const proposal = proposeReviewResolutionVerificationUpdate({
      findings: [finding()],
      reviewResolution: boundDocument(),
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
        reviewResolution: boundDocument(),
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
      reviewResolution: boundDocument(),
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
          reviewResolution: boundDocument(NEWER),
          findingTarget: FINDING_TARGET,
          currentRevision: NEWER,
          observation: observation({ targetRevision: TARGET }),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError && error.code === 'stale_observation'
    );
  });

  test('rejects re-verification against the source revision', () => {
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

  test('requires explicit target binding before verification', () => {
    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: document(),
          findingTarget: FINDING_TARGET,
          currentRevision: TARGET,
          observation: observation(),
        }),
      (error) =>
        error instanceof ReviewResolutionVerificationError &&
        error.code === 'unbound_resolution_target'
    );
  });

  test('rejects a sidecar bound to a different target revision', () => {
    assert.throws(
      () =>
        proposeReviewResolutionVerificationUpdate({
          findings: [finding()],
          reviewResolution: boundDocument(TARGET),
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
          reviewResolution: boundDocument(),
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
    const doc = boundDocument();
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
