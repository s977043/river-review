// Signed independent verification for #1574 P3 foundation.
//
// P2 paired replay deliberately keeps every provenance claim untrusted. This
// module adds a separate, read-only verification artifact. Trust comes only
// from an out-of-band public key supplied by the caller; the candidate branch
// cannot mint a trusted key by editing the replay or its experiment spec.
//
// River Review never reads a private key here and never signs. An independent
// verifier signs the canonical attestation payload outside this process.
import { createPublicKey, verify as verifySignature } from 'node:crypto';

import { canonicalJson } from './promotion-candidates.mjs';
import { sha256Hex } from './shadow-aggregate.mjs';
import { verifyExperimentManifest } from './paired-replay.mjs';

export const REPLAY_VERIFICATION_SCHEMA_VERSION = 1;
export const REPLAY_ATTESTATION_KIND = 'paired-replay-verifier-attestation';
export const REPLAY_VERIFICATION_KIND = 'paired-replay-verification';
export const REPLAY_ATTESTATION_SCOPE = 'paired-replay-verification';

export class ReplayVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReplayVerificationError';
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReplayVerificationError(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReplayVerificationError(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireNullableString(value, label) {
  if (value === null) return null;
  return requireString(value, label);
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ReplayVerificationError(
      `${label} must contain exactly: ${expected.join(', ')}.`
    );
  }
}

function parseCanonicalBase64(value, label) {
  const raw = requireString(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw)) {
    throw new ReplayVerificationError(`${label} must be canonical base64.`);
  }
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== raw) {
    throw new ReplayVerificationError(`${label} must be canonical base64.`);
  }
  return decoded;
}

function replayCandidateBinding(replay) {
  const candidate = replay?.manifest?.improvementCandidate ?? null;
  return {
    candidateId: candidate?.candidateId ?? null,
    candidateContentHash: candidate?.contentHash ?? null,
  };
}

export function computeReplaySha256(replay) {
  requireObject(replay, 'replay');
  return sha256Hex(canonicalJson(replay));
}

export function computeTrustedKeyId(publicKeyPem) {
  const pem = requireString(publicKeyPem, 'trusted public key');
  let key;
  try {
    key = createPublicKey(pem);
  } catch (error) {
    throw new ReplayVerificationError(`trusted public key is invalid: ${error.message}`);
  }

  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ReplayVerificationError(
      `trusted public key must be Ed25519 (got ${key.asymmetricKeyType ?? 'unknown'}).`
    );
  }

  const der = key.export({ type: 'spki', format: 'der' });
  return {
    key,
    keyId: `sha256:${sha256Hex(der)}`,
  };
}

function normalizeAttestation(attestation) {
  const root = requireObject(attestation, 'attestation');
  requireExactKeys(root, ['schemaVersion', 'kind', 'payload', 'signature'], 'attestation');

  if (root.schemaVersion !== 1) {
    throw new ReplayVerificationError('attestation.schemaVersion must be 1.');
  }
  if (root.kind !== REPLAY_ATTESTATION_KIND) {
    throw new ReplayVerificationError(
      `attestation.kind must be "${REPLAY_ATTESTATION_KIND}".`
    );
  }

  const payload = requireObject(root.payload, 'attestation.payload');
  requireExactKeys(
    payload,
    [
      'scope',
      'replaySha256',
      'manifestId',
      'experimentKey',
      'manifestHash',
      'candidateId',
      'candidateContentHash',
      'verifierId',
      'issuedAt',
    ],
    'attestation.payload'
  );

  const normalizedPayload = {
    scope: requireString(payload.scope, 'attestation.payload.scope'),
    replaySha256: requireString(payload.replaySha256, 'attestation.payload.replaySha256'),
    manifestId: requireString(payload.manifestId, 'attestation.payload.manifestId'),
    experimentKey: requireString(payload.experimentKey, 'attestation.payload.experimentKey'),
    manifestHash: requireString(payload.manifestHash, 'attestation.payload.manifestHash'),
    candidateId: requireNullableString(payload.candidateId, 'attestation.payload.candidateId'),
    candidateContentHash: requireNullableString(
      payload.candidateContentHash,
      'attestation.payload.candidateContentHash'
    ),
    verifierId: requireString(payload.verifierId, 'attestation.payload.verifierId'),
    issuedAt: requireString(payload.issuedAt, 'attestation.payload.issuedAt'),
  };

  if (normalizedPayload.scope !== REPLAY_ATTESTATION_SCOPE) {
    throw new ReplayVerificationError(
      `attestation.payload.scope must be "${REPLAY_ATTESTATION_SCOPE}".`
    );
  }
  if (!Number.isFinite(Date.parse(normalizedPayload.issuedAt))) {
    throw new ReplayVerificationError('attestation.payload.issuedAt must be an ISO-8601 timestamp.');
  }

  const signature = requireObject(root.signature, 'attestation.signature');
  requireExactKeys(signature, ['algorithm', 'keyId', 'value'], 'attestation.signature');
  if (signature.algorithm !== 'ed25519') {
    throw new ReplayVerificationError('attestation.signature.algorithm must be "ed25519".');
  }

  return {
    schemaVersion: 1,
    kind: REPLAY_ATTESTATION_KIND,
    payload: normalizedPayload,
    signature: {
      algorithm: 'ed25519',
      keyId: requireString(signature.keyId, 'attestation.signature.keyId'),
      value: requireString(signature.value, 'attestation.signature.value'),
    },
  };
}

function replayBindingMismatches(replay, payload) {
  const binding = replayCandidateBinding(replay);
  const expected = {
    replaySha256: computeReplaySha256(replay),
    manifestId: replay.manifest.manifestId,
    experimentKey: replay.manifest.experimentKey,
    manifestHash: replay.manifest.manifestHash,
    candidateId: binding.candidateId,
    candidateContentHash: binding.candidateContentHash,
    verifierId: replay.manifest.verifier.verifierId,
  };
  const mismatches = [];
  for (const [field, value] of Object.entries(expected)) {
    if (payload[field] !== value) {
      mismatches.push(`${field}: attested ${payload[field] ?? '(null)'}, replay ${value ?? '(null)'}`);
    }
  }
  return { expected, mismatches };
}

function buildCanaryReadiness(replay) {
  const blockers = [];

  if (replay.activationCheck?.verified !== true) {
    blockers.push('activation-not-verified');
  }
  if (replay.acceptance?.evaluable !== true) {
    blockers.push('acceptance-not-evaluable');
  }
  if (replay.acceptance?.contract6?.criticalRegressionCount !== 0) {
    blockers.push('critical-regression-floor-not-satisfied');
  }
  if (replay.acceptance?.contract6?.overallCriticalRegressionCount !== 0) {
    blockers.push('overall-critical-regression-present');
  }
  if ((replay.pairing?.warnings ?? []).length > 0) {
    blockers.push('pairing-warnings-present');
  }

  for (const profile of replay.acceptance?.evaluations ?? []) {
    if (profile.allRequiredSatisfied !== true) {
      blockers.push(`profile-not-satisfied:${profile.profile}`);
    }
    if (profile.sampleSizeSatisfied !== true && profile.minSampleSize != null) {
      blockers.push(`profile-sample-size-not-satisfied:${profile.profile}`);
    }
  }

  return {
    status: blockers.length === 0 ? 'human-review-ready' : 'not-ready',
    blockers,
    automaticCanary: false,
    note:
      'Observation only. Human approval is still required before any limited canary; this artifact never starts one.',
  };
}

export function buildReplayVerification({
  replay,
  attestation,
  trustedPublicKeyPem,
  now = new Date(),
}) {
  requireObject(replay, 'replay');
  if (replay.mode !== 'paired-replay' || replay.readOnly !== true) {
    throw new ReplayVerificationError('replay must be a read-only paired-replay artifact.');
  }
  if (!Array.isArray(replay.writeEffects) || replay.writeEffects.length !== 0) {
    throw new ReplayVerificationError('replay.writeEffects must be empty.');
  }

  const manifestCheck = verifyExperimentManifest(requireObject(replay.manifest, 'replay.manifest'));
  if (!manifestCheck.verified) {
    throw new ReplayVerificationError(
      `replay manifest verification failed: ${manifestCheck.mismatches.join('; ')}`
    );
  }
  if (
    replay.manifestVerification?.verified !== true ||
    replay.manifestVerification?.experimentKeyMatchesInputs !== true
  ) {
    throw new ReplayVerificationError(
      'replay must report a verified manifest whose experimentKey matches its inputs.'
    );
  }

  const verifier = requireObject(replay.manifest.verifier, 'replay.manifest.verifier');
  if (verifier.independent !== true) {
    throw new ReplayVerificationError(
      'replay.manifest.verifier.independent must be true before independent verification.'
    );
  }
  requireString(verifier.verifierId, 'replay.manifest.verifier.verifierId');

  const normalizedAttestation = normalizeAttestation(attestation);
  const { key, keyId } = computeTrustedKeyId(trustedPublicKeyPem);

  if (normalizedAttestation.signature.keyId !== keyId) {
    throw new ReplayVerificationError(
      `attestation.signature.keyId does not match the supplied trusted key (expected ${keyId}).`
    );
  }

  const binding = replayBindingMismatches(replay, normalizedAttestation.payload);
  if (binding.mismatches.length > 0) {
    throw new ReplayVerificationError(
      `attestation does not bind to this replay: ${binding.mismatches.join('; ')}`
    );
  }

  const signatureBytes = parseCanonicalBase64(
    normalizedAttestation.signature.value,
    'attestation.signature.value'
  );
  const signatureVerified = verifySignature(
    null,
    Buffer.from(canonicalJson(normalizedAttestation.payload), 'utf8'),
    key,
    signatureBytes
  );
  if (!signatureVerified) {
    throw new ReplayVerificationError('attestation signature verification failed.');
  }

  const readiness = buildCanaryReadiness(replay);
  const candidate = replayCandidateBinding(replay);

  return {
    schemaVersion: REPLAY_VERIFICATION_SCHEMA_VERSION,
    kind: REPLAY_VERIFICATION_KIND,
    mode: 'signed-independent-verification',
    readOnly: true,
    verifiedAt: now.toISOString(),
    replay: {
      replaySha256: binding.expected.replaySha256,
      manifestId: replay.manifest.manifestId,
      experimentKey: replay.manifest.experimentKey,
      manifestHash: replay.manifest.manifestHash,
      candidateId: candidate.candidateId,
      candidateContentHash: candidate.candidateContentHash,
    },
    verifier: {
      verifierId: normalizedAttestation.payload.verifierId,
      issuedAt: normalizedAttestation.payload.issuedAt,
      algorithm: 'ed25519',
      keyId,
      independentClaimed: true,
      independentVerifierVerified: true,
    },
    trust: {
      trustLevel: 'trusted',
      trustedEvidenceCount: 1,
      signatureVerified: true,
      replayBindingVerified: true,
      manifestVerified: true,
      experimentKeyMatchesInputs: true,
      reasons: [],
    },
    canaryReadiness: readiness,
    decision: null,
    requiresHumanApproval: true,
    autoPromotion: false,
    autoCanary: false,
    autoActions: ['observe'],
    writeEffects: [],
  };
}

export function formatReplayVerificationMarkdown(result) {
  const ready = result.canaryReadiness.status === 'human-review-ready' ? 'yes' : 'no';
  const blockers =
    result.canaryReadiness.blockers.length > 0
      ? result.canaryReadiness.blockers.map((item) => `- ${item}`).join('\n')
      : '- none';

  return `# Signed replay verification (read-only)

| Field | Value |
| --- | --- |
| Manifest | ${result.replay.manifestId} |
| Replay SHA-256 | ${result.replay.replaySha256} |
| Verifier | ${result.verifier.verifierId} |
| Key | ${result.verifier.keyId} |
| Signature verified | yes |
| Independent verifier verified | yes |
| Trusted evidence count | ${result.trust.trustedEvidenceCount} |
| Human-review-ready for limited canary proposal | ${ready} |
| Automatic canary | no |
| Decision | null |

## Readiness blockers

${blockers}

Human approval remains required. This verification artifact never promotes a candidate, starts a canary, merges, or releases.
`;
}
