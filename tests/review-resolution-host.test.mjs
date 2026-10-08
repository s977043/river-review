import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  REVIEW_RESOLUTION_HOST_MARKER,
  ReviewResolutionHostError,
  proposeAuthorResponseUpdate,
  renderReviewResolutionHostComment,
} from '../src/lib/review-resolution-host.mjs';
import {
  organizeReviewResolution,
  renderReviewResolutionMarkdown,
} from '../src/lib/review-resolution-organizer.mjs';
import { ReviewResolutionError } from '../src/lib/review-resolution.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function revision(reviewRunId = 'run-source', manifest = 'RR-EXM-aaaaaaaaaaaa', hash = HASH_A) {
  return {
    reviewRunId,
    executionManifestId: manifest,
    artifactRefs: [{ name: 'diff', sha256: hash }],
  };
}

function finding(id, overrides = {}) {
  return {
    id,
    title: `Finding ${id}`,
    file: `src/${id}.mjs`,
    lineStart: 10,
    fingerprint: `fp-${id}`,
    fingerprintV2: `fp2-${id}`,
    severity: 'major',
    ...overrides,
  };
}

function item({
  findingId = 'rr-1',
  fingerprint = 'fp-rr-1',
  fingerprintAlgo = 'v1',
  authorState = 'none',
  resolutionState = 'open',
  decisionRefs = [],
  verificationState = 'not_requested',
  target = null,
  verifier = null,
  evidenceRefs = [],
} = {}) {
  return {
    findingRef: {
      findingId,
      fingerprint,
      fingerprintAlgo,
      sources: [{ findingId: `source-${findingId}`, reviewerId: 'bug-hunter' }],
    },
    systemJudgment: {
      disposition: 'unknown',
      source: 'unavailable',
    },
    authorResponse: { state: authorState, rationale: null },
    resolution: { state: resolutionState, target, decisionRefs },
    verification: {
      state: verificationState,
      verifier,
      coverageStatus: verificationState === 'verified_resolved' ? 'complete' : 'unknown',
      evidenceRefs,
    },
  };
}

function document(items = [item()]) {
  return {
    schemaVersion: '1',
    kind: 'review-resolution',
    resolutionId: 'RR-RES-pr-42',
    source: revision(),
    items,
  };
}

describe('renderReviewResolutionHostComment', () => {
  test('adds one stable marker before the deterministic organizer Markdown', () => {
    const projection = organizeReviewResolution({
      findings: [finding('rr-1')],
      reviewResolution: document(),
    });
    const rendered = renderReviewResolutionHostComment(projection);

    assert.equal(rendered.split(REVIEW_RESOLUTION_HOST_MARKER).length - 1, 1);
    assert.equal(
      rendered,
      `${REVIEW_RESOLUTION_HOST_MARKER}\n${renderReviewResolutionMarkdown(projection)}`
    );
  });
});

describe('proposeAuthorResponseUpdate', () => {
  test('updates only authorResponse for the targeted finding', () => {
    const findings = [finding('rr-1')];
    const source = document();
    const beforeVerification = JSON.stringify(source.items[0].verification);
    const beforeResolution = JSON.stringify(source.items[0].resolution);

    const proposal = proposeAuthorResponseUpdate({
      findings,
      reviewResolution: source,
      target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
      response: { state: 'will_fix', rationale: 'I will fix this in the next revision.' },
    });

    assert.deepEqual(proposal.items[0].authorResponse, {
      state: 'will_fix',
      rationale: 'I will fix this in the next revision.',
    });
    assert.equal(JSON.stringify(proposal.items[0].verification), beforeVerification);
    assert.equal(JSON.stringify(proposal.items[0].resolution), beforeResolution);
    assert.equal(source.items[0].authorResponse.state, 'none');
  });

  test('uses fingerprint fallback when the run-local findingId changed', () => {
    const proposal = proposeAuthorResponseUpdate({
      findings: [finding('rr-1')],
      reviewResolution: document([
        item({
          findingId: 'old-run-id',
          fingerprint: 'fp2-rr-1',
          fingerprintAlgo: 'v2',
        }),
      ]),
      target: {
        findingId: 'older-target-id',
        fingerprint: 'fp2-rr-1',
        fingerprintAlgo: 'v2',
      },
      response: { state: 'disputes', rationale: 'The evidence does not reproduce.' },
    });

    assert.equal(proposal.items[0].authorResponse.state, 'disputes');
  });

  test('does not guess an unknown fingerprint algorithm', () => {
    assert.throws(
      () =>
        proposeAuthorResponseUpdate({
          findings: [finding('rr-1')],
          reviewResolution: document(),
          target: {
            findingId: 'missing-id',
            fingerprint: 'fp-rr-1',
            fingerprintAlgo: 'v9',
          },
          response: { state: 'will_fix', rationale: null },
        }),
      (error) => error instanceof ReviewResolutionHostError && error.code === 'orphan_target'
    );
  });

  test('fails safe on ambiguous finding identity', () => {
    const findings = [
      finding('duplicate', { fingerprint: 'fp-a' }),
      finding('duplicate', { fingerprint: 'fp-b' }),
    ];

    assert.throws(
      () =>
        proposeAuthorResponseUpdate({
          findings,
          reviewResolution: document(),
          target: {
            findingId: 'duplicate',
            fingerprint: 'fp-a',
            fingerprintAlgo: 'v1',
          },
          response: { state: 'will_fix', rationale: null },
        }),
      (error) => error instanceof ReviewResolutionHostError && error.code === 'ambiguous_target'
    );
  });

  test('fails safe when one finding has multiple Resolution items', () => {
    assert.throws(
      () =>
        proposeAuthorResponseUpdate({
          findings: [finding('rr-1')],
          reviewResolution: document([item(), item()]),
          target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
          response: { state: 'will_fix', rationale: null },
        }),
      (error) => error instanceof ReviewResolutionHostError && error.code === 'ambiguous_resolution'
    );
  });

  test('will_fix never promotes verification to verified_resolved', () => {
    const proposal = proposeAuthorResponseUpdate({
      findings: [finding('rr-1')],
      reviewResolution: document(),
      target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
      response: { state: 'will_fix', rationale: null },
    });

    assert.equal(proposal.items[0].authorResponse.state, 'will_fix');
    assert.equal(proposal.items[0].verification.state, 'not_requested');
  });

  test('keeps decision_agreed constrained by existing semantic validation', () => {
    const agreed = document([
      item({
        authorState: 'agrees_spec_decision',
        resolutionState: 'decision_agreed',
        decisionRefs: [{ kind: 'issue', ref: '#42' }],
      }),
    ]);

    const valid = proposeAuthorResponseUpdate({
      findings: [finding('rr-1')],
      reviewResolution: agreed,
      target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
      response: { state: 'agrees_spec_decision', rationale: 'Confirmed with the product owner.' },
    });
    assert.equal(valid.items[0].resolution.state, 'decision_agreed');

    assert.throws(
      () =>
        proposeAuthorResponseUpdate({
          findings: [finding('rr-1')],
          reviewResolution: agreed,
          target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
          response: { state: 'disputes', rationale: 'I no longer agree.' },
        }),
      ReviewResolutionError
    );
  });

  test('preserves an already verified finding instead of rewriting verification', () => {
    const targetRevision = revision('run-target', 'RR-EXM-bbbbbbbbbbbb', HASH_B);
    const verified = document([
      item({
        resolutionState: 'action_submitted',
        target: targetRevision,
        verificationState: 'verified_resolved',
        verifier: 'finding-critic',
        evidenceRefs: [{ ref: 'critic:rr-1@run-target', sha256: HASH_B }],
      }),
    ]);

    const proposal = proposeAuthorResponseUpdate({
      findings: [finding('rr-1')],
      reviewResolution: verified,
      target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
      response: { state: 'will_fix', rationale: 'Acknowledged.' },
    });

    assert.equal(proposal.items[0].verification.state, 'verified_resolved');
    assert.deepEqual(proposal.items[0].verification, verified.items[0].verification);
  });

  test('rejects an empty rationale and unknown author-response state', () => {
    for (const response of [
      { state: 'will_fix', rationale: '   ' },
      { state: 'accepted', rationale: null },
    ]) {
      assert.throws(
        () =>
          proposeAuthorResponseUpdate({
            findings: [finding('rr-1')],
            reviewResolution: document(),
            target: { findingId: 'rr-1', fingerprint: 'fp-rr-1', fingerprintAlgo: 'v1' },
            response,
          }),
        ReviewResolutionHostError
      );
    }
  });
});
