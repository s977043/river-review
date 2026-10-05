# Review Evolution Cycle P3 foundation—Signed replay verification（#2510）

> Status: Experimental implementation
> Parent: #1574 Review Evolution Cycle
> Depends on: P2 paired replay
> Runtime authority: observation only

## 1. Purpose

P2 paired replay intentionally leaves trust closed:

- `independentVerifierVerified=false`
- `trustedEvidenceCount=0`
- `canaryEligible=false`

A saved run or replay spec can claim `evidence_source: CI`, `trusted_by`, or `verifier.independent=true`. However, those fields live under the reviewed repository's write boundary. They are useful provenance claims, not authenticity proof.

P3 foundation adds a separate verification step:

```text
paired replay
  + independent verifier attestation
  + out-of-band trusted Ed25519 public key
  -> signed replay verification
  -> Human review material
```

P2 remains unchanged and untrusted. The new artifact records that a separate trusted key signed an attestation bound to the exact replay.

## 2. CLI

```bash
river evolve verify-replay \
  --replay paired-replay.json \
  --attestation verifier-attestation.json \
  --trusted-key verifier-public.pem \
  --output json
```

The command is read-only.

It does not:

- create or modify Riverbed entries
- approve or reject a promotion candidate
- start a canary
- merge or release
- read a private key
- sign an attestation

## 3. Trust root

The trusted public key is supplied out-of-band with `--trusted-key`.

Here, `trusted` is relative to this invocation: the caller explicitly selected that public key as the trust root. This phase does not prove organizational ownership of the key, key lifecycle policy, or verifier-job isolation.

The key is not accepted from:

- the paired replay
- the experiment spec
- the attestation payload itself
- a reviewed repository field such as `trusted_by`

This is the key boundary. A candidate may edit repository files. It cannot make an arbitrary signing key trusted by adding it to the candidate artifact.

The verification artifact records:

```text
keyId = sha256(SPKI DER public key)
```

Only Ed25519 is accepted in this phase.

## 4. Attestation contract

The external verifier signs the canonical JSON representation of `payload`.

Conceptual shape:

```json
{
  "schemaVersion": 1,
  "kind": "paired-replay-verifier-attestation",
  "payload": {
    "scope": "paired-replay-verification",
    "replaySha256": "<sha256>",
    "manifestId": "RR-EXP-...",
    "experimentKey": "<sha256>",
    "manifestHash": "<sha256>",
    "candidateId": null,
    "candidateContentHash": null,
    "verifierId": "ci-independent",
    "issuedAt": "2026-10-05T00:00:00.000Z"
  },
  "signature": {
    "algorithm": "ed25519",
    "keyId": "sha256:<public-key-fingerprint>",
    "value": "<canonical-base64-signature>"
  }
}
```

The candidate fields are non-null when the replay carries an `improvementCandidate`.

## 5. Binding checks

Verification fails closed unless all bindings agree.

### Replay integrity

- artifact is a read-only `paired-replay`
- `writeEffects=[]`
- Experiment Manifest digest verification succeeds
- replay reports `manifestVerification.verified=true`
- replay reports `experimentKeyMatchesInputs=true`

### Independent verifier claim

- manifest declares `verifier.independent=true`
- manifest has a non-empty `verifierId`
- attested `verifierId` equals that manifest verifier ID

The P2 claim alone is still not trusted. It only becomes part of verified evidence after the detached signature succeeds under the caller-supplied trust root.

### Exact replay binding

The signed payload binds:

- SHA-256 of the entire replay artifact
- manifest ID
- experiment key
- manifest hash
- candidate ID
- candidate content hash
- verifier ID

A signature from another replay, experiment, candidate, or verifier cannot be reused.

### Trusted key

- supplied key must parse as Ed25519
- `signature.keyId` must equal the supplied key fingerprint
- signature must verify over canonical payload JSON

## 6. Output contract

The output is validated by:

```text
schemas/replay-verification.schema.json
```

Successful verification can set:

```text
independentVerifierVerified = true
trustedEvidenceCount = 1
trustLevel = trusted
```

This means only that the signed attestation was authenticated and bound to the exact P2 replay under the supplied trust root.

It does not mean the candidate is correct.

## 7. Canary readiness

The artifact also projects whether existing replay evidence is ready for a Human to consider a limited canary.

`human-review-ready` requires:

- activation verified
- acceptance evaluable
- evaluated critical regressions = 0
- overall critical regressions = 0
- no pairing warnings
- every declared profile satisfies required criteria
- declared minimum sample size is satisfied

Otherwise the status is `not-ready` with explicit blocker codes.

Regardless of status:

```text
automaticCanary = false
autoCanary = false
autoPromotion = false
decision = null
requiresHumanApproval = true
writeEffects = []
```

This is readiness evidence, not permission.

## 8. Threat model

### Protected

- forged `trusted_by` / `evidence_source` inside repository artifacts
- reuse of an attestation for another replay
- reuse for another manifest or candidate
- substitution of another trusted key
- malformed / unknown signature format
- post-signature replay editing

### Not solved here

- public-key distribution
- public-key rotation / revocation
- proving organizational ownership of a public key
- GitHub OIDC / Sigstore identity
- verifier job isolation itself
- freshness / expiry policy for attestations
- automatic canary policy

Those require a separate trust-policy layer. This slice intentionally verifies only what its cryptographic inputs can prove.

### Relationship to reviewer execution provenance

#2481 records reviewer execution provenance as `executionId` / `sourceExecutionIds[]`. That evidence answers whether separate logical executions were observed.

This P3 artifact answers a different question: whether a caller-trusted key authenticated an attestation that is bound to the exact replay and verifier ID.

Neither signal alone proves verifier runtime isolation. A future stronger independence claim must combine explicit trust policy with execution-isolation evidence rather than infer isolation from IDs or signatures.

## 9. Relationship to P2 and #1568

```text
P2 paired replay
  -> signed independent verification      # this phase
  -> Human review
  -> #1568 approval lifecycle
  -> future limited canary
  -> post-adoption effectiveness
```

Pre-adoption signed verification remains experiment evidence. It must not be copied into post-adoption `effectivenessHistory[]`.

## 10. Private-key boundary

River Review does not provide an attestation-signing command in this phase.

The private key belongs to the independent verifier environment and must stay outside the candidate's write authority. Signing may be implemented later by CI/OIDC/Sigstore or another external verifier. That later signing mechanism is not a prerequisite for keeping this verification boundary sound.

## 11. Completion boundary

This slice satisfies only the **signed replay verification foundation** for P3.

It proves:

- a caller-selected Ed25519 trust root authenticated the attestation
- the attestation binds to the exact paired replay, manifest, candidate, and verifier ID
- the verified evidence remains read-only and Human-owned

It does **not** by itself prove:

- verifier runtime / job isolation
- key ownership, rotation, revocation, or organizational identity
- that enough calibration evidence exists to resume every #1574 P3/P4 activity
- that a canary may start automatically

Therefore, a successful `verify-replay` result may satisfy the cryptographic-attestation prerequisite for an independent verifier, but it does not automatically clear the full #1574 Strategic Hold. Remaining resume conditions must be reviewed independently.

## 12. References

- #1574 Review Evolution Cycle
- #2510 P3 foundation
- `docs/development/1574-p2-paired-replay.md`
- `docs/development/1574-model-harness-evolution-screening.md`
