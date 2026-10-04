import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { FEEDBACK_TYPES } from '../src/lib/feedback.mjs';
import {
  AUTHOR_RESPONSE_STATES,
  RESOLUTION_STATES,
  ReviewResolutionError,
  buildReviewResolution,
  validateReviewResolutionSemantics,
} from '../src/lib/review-resolution.mjs';
import { compileSchemaFile } from './helpers/schema-validator.mjs';

const validateSchema = compileSchemaFile('review-resolution.schema.json', {
  ajvOptions: { allErrors: true },
});
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function revision(reviewRunId = 'run-source', manifest = 'RR-EXM-aaaaaaaaaaaa', hash = HASH_A) {
  return {
    reviewRunId,
    executionManifestId: manifest,
    artifactRefs: [{ name: 'diff', sha256: hash }],
  };
}

function item(overrides = {}) {
  return {
    findingRef: {
      findingId: 'rr-17',
      fingerprint: 'fp:rr-17',
      fingerprintAlgo: 'v2',
      sources: [{ findingId: 'reviewer-a:17', reviewerId: 'reviewer-a' }],
    },
    systemJudgment: {
      disposition: 'blocking',
      source: 'semantic-precision',
    },
    authorResponse: { state: 'none', rationale: null },
    resolution: { state: 'open', target: null },
    verification: {
      state: 'not_requested',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
    ...overrides,
  };
}

function document(overrides = {}) {
  return {
    schemaVersion: '1',
    kind: 'review-resolution',
    resolutionId: 'RR-RES-pr-42',
    source: revision(),
    items: [item()],
    ...overrides,
  };
}

describe('review-resolution.schema.json', () => {
  test('accepts the minimal sidecar without changing Review Artifact', () => {
    const doc = document();
    assert.equal(validateSchema(doc), true, JSON.stringify(validateSchema.errors));
  });

  test('rejects unknown fields and feedback vocabulary in author state', () => {
    assert.equal(validateSchema({ ...document(), gate: { decision: 'GO' } }), false);
    const bad = document({
      items: [item({ authorResponse: { state: 'accepted', rationale: null } })],
    });
    assert.equal(validateSchema(bad), false);
  });

  test('retains provenance from multiple reviewers on one resolution item', () => {
    const doc = document({
      items: [
        item({
          findingRef: {
            findingId: 'rr-17',
            fingerprint: 'fp:rr-17',
            fingerprintAlgo: 'v2',
            sources: [
              { findingId: 'reviewer-a:17', reviewerId: 'reviewer-a' },
              { findingId: 'reviewer-b:4', reviewerId: 'reviewer-b' },
            ],
          },
        }),
      ],
    });
    assert.equal(validateSchema(doc), true, JSON.stringify(validateSchema.errors));
  });
});

describe('Review Resolution semantic invariants', () => {
  test('author/resolution states never overlap canonical feedback taxonomy', () => {
    const feedback = new Set(FEEDBACK_TYPES);
    for (const state of [...AUTHOR_RESPONSE_STATES, ...RESOLUTION_STATES]) {
      assert.equal(feedback.has(state), false, `${state} must not collide with feedback taxonomy`);
    }
  });

  test('author says fixed/action submitted is not verified_resolved', () => {
    const target = revision('run-target', 'RR-EXM-bbbbbbbbbbbb', HASH_B);
    const doc = buildReviewResolution({
      resolutionId: 'RR-RES-pr-42',
      source: revision(),
      items: [
        item({
          authorResponse: { state: 'will_fix', rationale: 'validation moved to API boundary' },
          resolution: { state: 'action_submitted', target },
          verification: {
            state: 'pending',
            verifier: null,
            coverageStatus: 'unknown',
            evidenceRefs: [],
          },
        }),
      ],
    });
    assert.equal(doc.items[0].verification.state, 'pending');
  });

  test('verified_resolved requires explicit target, verifier, and evidence', () => {
    const invalid = document({
      items: [
        item({
          verification: {
            state: 'verified_resolved',
            verifier: null,
            coverageStatus: 'complete',
            evidenceRefs: [],
          },
        }),
      ],
    });
    const result = validateReviewResolutionSemantics(invalid);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /requires target revision, verifier, and evidenceRefs/);
  });

  test('explicit targeted verification can produce verified_resolved', () => {
    const target = revision('run-target', 'RR-EXM-bbbbbbbbbbbb', HASH_B);
    const doc = buildReviewResolution({
      resolutionId: 'RR-RES-pr-42',
      source: revision(),
      items: [
        item({
          authorResponse: { state: 'will_fix', rationale: 'fixed' },
          resolution: { state: 'action_submitted', target },
          verification: {
            state: 'verified_resolved',
            verifier: 'finding-critic',
            coverageStatus: 'complete',
            evidenceRefs: [{ ref: 'critic:rr-17@run-target', sha256: HASH_B }],
          },
        }),
      ],
    });
    assert.equal(doc.items[0].verification.state, 'verified_resolved');
  });

  test('finding absence is only not_reproduced and requires complete coverage', () => {
    const target = revision('run-target', 'RR-EXM-bbbbbbbbbbbb', HASH_B);
    const complete = buildReviewResolution({
      resolutionId: 'RR-RES-pr-42',
      source: revision(),
      items: [
        item({
          resolution: { state: 'action_submitted', target },
          verification: {
            state: 'not_reproduced',
            verifier: null,
            coverageStatus: 'complete',
            evidenceRefs: [],
          },
        }),
      ],
    });
    assert.equal(complete.items[0].verification.state, 'not_reproduced');

    assert.throws(
      () =>
        buildReviewResolution({
          resolutionId: 'RR-RES-pr-42',
          source: revision(),
          items: [
            item({
              resolution: { state: 'action_submitted', target },
              verification: {
                state: 'not_reproduced',
                verifier: null,
                coverageStatus: 'partial',
                evidenceRefs: [],
              },
            }),
          ],
        }),
      ReviewResolutionError
    );
  });

  test('partial/not-executed coverage fails safe to inconclusive or pending', () => {
    const target = revision('run-target', 'RR-EXM-bbbbbbbbbbbb', HASH_B);
    for (const coverageStatus of ['partial', 'not_executed']) {
      const doc = buildReviewResolution({
        resolutionId: `RR-RES-${coverageStatus}`,
        source: revision(),
        items: [
          item({
            resolution: { state: 'action_submitted', target },
            verification: {
              state: 'inconclusive',
              verifier: 'review-coverage',
              coverageStatus,
              evidenceRefs: [],
            },
          }),
        ],
      });
      assert.equal(doc.items[0].verification.state, 'inconclusive');
    }
  });

  test('verified_resolved cannot point back to the unchanged source revision', () => {
    assert.throws(
      () =>
        buildReviewResolution({
          resolutionId: 'RR-RES-same-revision',
          source: revision(),
          items: [
            item({
              resolution: { state: 'action_submitted', target: revision() },
              verification: {
                state: 'verified_resolved',
                verifier: 'finding-critic',
                coverageStatus: 'complete',
                evidenceRefs: [{ ref: 'critic:rr-17', sha256: HASH_A }],
              },
            }),
          ],
        }),
      ReviewResolutionError
    );
  });

  test('builder does not mutate caller-owned source/items', () => {
    const source = revision();
    const items = [item()];
    const built = buildReviewResolution({ resolutionId: 'RR-RES-clone', source, items });
    built.source.artifactRefs[0].name = 'changed';
    built.items[0].authorResponse.state = 'escalates';
    assert.equal(source.artifactRefs[0].name, 'diff');
    assert.equal(items[0].authorResponse.state, 'none');
  });

  test('duplicate fingerprint items are rejected before organizer work exists', () => {
    const duplicate = document({ items: [item(), item()] });
    const result = validateReviewResolutionSemantics(duplicate);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /duplicates finding fingerprint/);
  });
});
