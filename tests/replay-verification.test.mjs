import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test, { describe } from 'node:test';

import { buildPairedReplay } from '../src/lib/paired-replay.mjs';
import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import {
  ReplayVerificationError,
  buildReplayVerification,
  computeReplaySha256,
  computeTrustedKeyId,
  formatReplayVerificationMarkdown,
} from '../src/lib/replay-verification.mjs';
import { compileSchemaFile } from './helpers/schema-validator.mjs';

const NOW = new Date('2026-10-05T00:00:00.000Z');
const ISSUED_AT = '2026-10-05T00:00:00.000Z';
const FP = '0123456789abcdef';

const validateVerification = compileSchemaFile('replay-verification.schema.json', {
  ajvOptions: { allErrors: true },
});

function runRecord(runId, findings) {
  return {
    runId,
    timestamp: '2026-10-04T00:00:00.000Z',
    reviewedTarget: '/repo',
    mergeBase: 'base-sha',
    caseId: 'case-1',
    phase: 'midstream',
    findings,
  };
}

function replaySpec({ independent = true } = {}) {
  return {
    hypothesis: 'remove a recurring false positive',
    baseline: {
      commitSha: 'base-commit',
      skillRegistryCommit: 'registry-a',
      provider: 'openai',
      model: 'test-model',
      temperature: 0,
      runs: [
        runRecord('base-run', [
          {
            fingerprint: FP,
            severity: 'major',
            file: 'src/a.mjs',
            ruleId: 'test-rule',
            title: 'false positive',
          },
        ]),
      ],
    },
    candidate: {
      commitSha: 'candidate-commit',
      skillRegistryCommit: 'registry-b',
      provider: 'openai',
      model: 'test-model',
      temperature: 0,
      runs: [runRecord('candidate-run', [])],
    },
    dataset: { heldOutCaseKeys: [] },
    trials: { trialId: 'trial-1', trialCount: 1 },
    verifier: {
      independent,
      verifierId: 'ci-independent',
      runBy: 'separate-verifier-job',
    },
    metrics: { denominator: 'paired-case' },
    acceptance: {
      profiles: [
        {
          profile: 'standard',
          minSampleSize: 1,
          criteria: [{ metric: 'removedFindingCount', comparator: 'gte', threshold: 1 }],
        },
      ],
    },
  };
}

function buildReplay(options) {
  return buildPairedReplay(replaySpec(options), { now: NOW });
}

function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  return {
    ...pair,
    publicKeyPem,
    keyId: computeTrustedKeyId(publicKeyPem).keyId,
  };
}

function signedAttestation(replay, pair, overrides = {}) {
  const candidate = replay.manifest.improvementCandidate ?? null;
  const payload = {
    scope: 'paired-replay-verification',
    replaySha256: computeReplaySha256(replay),
    manifestId: replay.manifest.manifestId,
    experimentKey: replay.manifest.experimentKey,
    manifestHash: replay.manifest.manifestHash,
    candidateId: candidate?.candidateId ?? null,
    candidateContentHash: candidate?.contentHash ?? null,
    verifierId: replay.manifest.verifier.verifierId,
    issuedAt: ISSUED_AT,
    ...overrides,
  };
  return {
    schemaVersion: 1,
    kind: 'paired-replay-verifier-attestation',
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId: pair.keyId,
      value: sign(null, Buffer.from(canonicalJson(payload), 'utf8'), pair.privateKey).toString('base64'),
    },
  };
}

describe('#2510 signed replay verification', () => {
  test('a trusted Ed25519 attestation verifies without changing P2', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair);

    const result = buildReplayVerification({
      replay,
      attestation,
      trustedPublicKeyPem: pair.publicKeyPem,
      now: NOW,
    });

    assert.equal(replay.verification.independentVerifierVerified, false);
    assert.equal(replay.verification.trustedEvidenceCount, 0);
    assert.equal(result.verifier.independentVerifierVerified, true);
    assert.equal(result.trust.trustLevel, 'trusted');
    assert.equal(result.trust.trustedEvidenceCount, 1);
    assert.equal(result.trust.signatureVerified, true);
    assert.equal(result.trust.replayBindingVerified, true);
    assert.equal(result.canaryReadiness.status, 'human-review-ready');
    assert.equal(result.canaryReadiness.automaticCanary, false);
    assert.equal(result.decision, null);
    assert.equal(result.autoPromotion, false);
    assert.equal(result.autoCanary, false);
    assert.deepEqual(result.writeEffects, []);
    assert.equal(
      validateVerification(result),
      true,
      JSON.stringify(validateVerification.errors, null, 2)
    );
  });

  test('the trusted key is out-of-band and a different key fails closed', () => {
    const replay = buildReplay();
    const signer = keyPair();
    const other = keyPair();
    const attestation = signedAttestation(replay, signer);

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: other.publicKeyPem,
        }),
      (error) =>
        error instanceof ReplayVerificationError &&
        /keyId does not match the supplied trusted key/.test(error.message)
    );
  });

  test('a replay edited after signing fails the replay binding', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair);
    replay.pairing.warnings.push('edited after signing');

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /attestation does not bind to this replay/
    );
  });

  test('a valid signature for another candidate cannot be reused', () => {
    const s = replaySpec();
    s.improvementCandidate = {
      clusterKey: 'test-skill::false_positive',
      sourceFeedbackRefs: [
        {
          skillId: 'test-skill',
          feedbackType: 'false_positive',
          findingFingerprint: FP,
          pr: 1,
        },
        {
          skillId: 'test-skill',
          feedbackType: 'false_positive',
          findingFingerprint: 'fedcba9876543210',
          pr: 2,
        },
      ],
    };
    const replay = buildPairedReplay(s, { now: NOW });
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair, {
      candidateId: 'RR-PC-000000000000',
      candidateContentHash: '0'.repeat(64),
    });
    attestation.signature.value = sign(
      null,
      Buffer.from(canonicalJson(attestation.payload), 'utf8'),
      pair.privateKey
    ).toString('base64');

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /candidateId/
    );
  });

  test('a valid signature for another verifier id cannot be reused', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair, { verifierId: 'different-verifier' });
    attestation.signature.value = sign(
      null,
      Buffer.from(canonicalJson(attestation.payload), 'utf8'),
      pair.privateKey
    ).toString('base64');

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /verifierId/
    );
  });

  test('a self-claimed non-independent verifier cannot become verified by signing', () => {
    const replay = buildReplay({ independent: false });
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair);

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /verifier\.independent must be true/
    );
  });

  test('issuedAt must be a full ISO-8601 date-time, not a date-only string', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair, { issuedAt: '2026-10-05' });
    attestation.signature.value = sign(
      null,
      Buffer.from(canonicalJson(attestation.payload), 'utf8'),
      pair.privateKey
    ).toString('base64');

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /ISO-8601 date-time/
    );
  });

  test('a malformed signature is a usage-level verification error', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair);
    attestation.signature.value = 'not-base64';

    assert.throws(
      () =>
        buildReplayVerification({
          replay,
          attestation,
          trustedPublicKeyPem: pair.publicKeyPem,
        }),
      /canonical base64/
    );
  });

  test('a cryptographically verified replay can still be not ready for canary review', () => {
    const replay = buildReplay();
    replay.activationCheck.verified = false;
    const pair = keyPair();
    const attestation = signedAttestation(replay, pair);

    const result = buildReplayVerification({
      replay,
      attestation,
      trustedPublicKeyPem: pair.publicKeyPem,
      now: NOW,
    });

    assert.equal(result.verifier.independentVerifierVerified, true);
    assert.equal(result.canaryReadiness.status, 'not-ready');
    assert.ok(result.canaryReadiness.blockers.includes('activation-not-verified'));
    assert.equal(result.autoCanary, false);
  });

  test('Markdown keeps verification separate from judgment and automatic canary', () => {
    const replay = buildReplay();
    const pair = keyPair();
    const result = buildReplayVerification({
      replay,
      attestation: signedAttestation(replay, pair),
      trustedPublicKeyPem: pair.publicKeyPem,
      now: NOW,
    });
    const text = formatReplayVerificationMarkdown(result);
    assert.match(text, /Signed replay verification \(read-only\)/);
    assert.match(text, /Independent verifier verified \| yes/);
    assert.match(text, /Automatic canary \| no/);
    assert.match(text, /Decision \| null/);
    assert.match(text, /Human approval remains required/);
  });
});
