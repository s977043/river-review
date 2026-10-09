# Reviewer Identity / signed review evidence — Phase 0 feasibility (#1760)

Status: **design only / conditional GO for further evaluation**  
Baseline: `main` at `b0e6728ebf1f787d807a9fb9bed2dc01c19836bf` (2026-10-09).  
Scope: Reviewer Identity, Review Record and signature trust boundaries. No runtime/schema/Gate change in this slice.

## Decision

**Do not add a general signed-review event log or a new trust vocabulary yet.**

Use existing execution provenance and the out-of-band signature verifier as separate
owners. The next implementation step, if authorized, should first demonstrate an
actual consumer and a trusted signing boundary that candidate code cannot edit.

Keep these statements distinct:

```text
logical execution ID != reviewer actor identity
signature verified under supplied key != organizational identity
signed review record != evidence truth or review correctness
independent task != isolated verifier job
verified review evidence != merge / release permission
```

## Current ownership and gap map

| Surface | Current owner / source | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Reviewer task execution | `src/lib/reviewer-orchestrator.mjs`; `reviewCoverage.units[].executionId` | Opaque logical execution identity before task start | Actor, provider, context isolation, or signed identity |
| Finding lineage | `findings[].sourceExecutionIds[]`; Review Artifact and JSON schemas | Which task IDs contributed to a merged finding | Votes, independent correctness, or signer identity |
| Critic independence observation | `src/lib/reviewer-independence.mjs`; Finding Critic debug path | `independent / same-execution / unknown` for distinct logical run IDs | Actor/model/provider separation or verifier-job isolation |
| Saved-run provenance | `src/lib/result-store.mjs` | Self-reported source and local run metadata | Authenticated source, trusted signer or tamper-proof log |
| Execution Manifest | `src/lib/execution-manifest.mjs` | Content integrity and replayability checks | Who created a record or whether a reviewer was independent |
| Signed paired replay | `src/lib/replay-verification.mjs`, `schemas/replay-verification.schema.json` | Ed25519 attestation bound to one exact replay under a caller-supplied external public key | General PR review signatures, organizational key ownership, verifier-job isolation, or automatic promotion |
| Review Resolution | `schemas/review-resolution.schema.json`; ADR-011 | Author/Human response and resolution evidence separate from immutable findings | Signed approval, signer identity, or merge authority |
| Final authority | ADR-013 / Host-Human boundary | Host/Human controls irreversible actions | Authority cannot be transferred to a signature check or Gate projection |

The `#2481` / PR `#2501` producer gap and `#2543` / PR `#2571`
Critic provenance gap were closed before this design note. Do not regenerate
these fields or add a second independence evaluator.

## Threat model

**Protected assets:** evidence content, target revision, rulebook reference,
verdict provenance, actor claims, review ordering and human override reason.

**Attacker capabilities:** a candidate or AI agent can modify files and
self-reported artifacts inside the reviewed workspace; can replay older evidence;
can claim `evidence_source=CI`, `trusted_by`, or a reviewer display name;
and may be able to edit workflow configuration inside its branch.

**Required trusted boundary:** a verifier or signing service outside the
candidate write authority. Its public-key trust root must be selected by the
Host/operator outside the submitted review artifact and branch. Key ownership,
issuance, revocation, rotation, expiry and signer-job isolation are separate
policy requirements; the current replay verifier does not supply those proofs.

**Specific failures to test before any runtime integration:**

1. Self-signed review with a public key supplied by the reviewed artifact.
2. Signed record transplanted to a different revision, finding or rulebook.
3. Duplicate/replayed signed event presented as a second independent review.
4. Signing key valid but signer is not an authorized reviewer for that target.
5. Signature failure, unknown key, expired/revoked key or unknown trust policy.
6. Mutable human override changing the verdict without an append-only trail.
7. Provenance says two logical executions while both share the same actor/job.
8. Sensitive source, tokens, prompts or personal data leaking into the payload.

A failed or unavailable verification must be visible as **unverified / unknown**,
never upgraded to `PASS` or to trusted evidence by fallback.

## Candidate approaches

| Option | Advantages | Constraints | Recommendation |
| --- | --- | --- | --- |
| A. Local append-only event file, unsigned | Low cost; reconstructs order if the host appends it | Candidate may edit file; append-only is not tamper evidence | Useful as local history only; never trusted |
| B. External Ed25519 signatures | Existing `verify-replay` precedent; exact payload binding | Requires host-managed external key policy and signer-job isolation | Preferred future proof of authenticity when a real consumer exists |
| C. External event reference (including Nostr) | May provide independent publication and discovery | New infrastructure, identity and privacy obligations; reference alone is not attestation | Not needed in Phase 0 |
| D. Hybrid: signed final decision/override only | Lower cost and exposure than signing every intermediate finding | Must preserve unsigned lineage and explicit coverage | Conditional candidate after a verified Host use case |

**Phase 0 preference:** no new signing dependency. If proof of reviewer
authenticity becomes a requirement, evaluate B and D against the actual Host
deployment and its trust policy.

## Proposed ownership, not an implemented schema

Do not reuse `sourceExecutionIds[]` as a `reviewerId` or `signerId`.
A future optional Review Record would need independently sourced bindings:

```json
{
  "recordKind": "review-attestation-proposal",
  "targetRevision": "<commit-or-content-hash>",
  "reviewArtifactDigest": "<canonical-content-digest>",
  "rulebookDigest": "<canonical-content-digest>",
  "reviewerIdClaim": "<host-resolved-id>",
  "executionIds": ["<logical-task-id>"],
  "verdictReference": "<existing-verdict-id>",
  "issuedAt": "<ISO-8601>",
  "previousEventDigest": null,
  "signature": null
}
```

This is an **illustrative, noncanonical sketch**. No files are emitted, the
shape is not accepted as input by River Review, and it grants no authority.

A real schema must be preceded by answers to:
- Which Host is the consumer and writer of immutable records?
- Who binds `reviewerId` to an authenticated identity?
- Which canonical bytes are signed, and how are revision/rulebook/target
  bindings checked?
- Which out-of-band trust store and revocation policy is authoritative?
- Are review, resolution, override and supersede separate append-only events?
- What is the retention and data-minimization policy?
- What happens when one of these answers is `unknown`?

## Recommended sequence and entry gates

### Phase A: Contract and consumer evidence

- Identify one concrete Host review/approval workflow that needs signed
  provenance; capture an example where existing artifacts are insufficient.
- Assign separately: record producer, signer, trusted-key selector, verifier,
  append-only storage and Human approval owner.
- Compare integration against the current paired-replay signature verifier.
  Reuse cryptographic primitives/validation where appropriate, but not its
  replay-specific schema or trust conclusion.

**Gate:** no runtime implementation without a concrete consumer and trusted
writer/key boundary.

### Phase B: Read-only verifier prototype (only after Phase A)

- Check canonical payload, exact target revision, rulebook and artifact digest.
- Use an externally supplied allowlisted trust root.
- Emit explicit `verified / unverified / unavailable` as a separate
  experimental observation, not `decision`, Gate, or approval.
- Keep private keys outside River Review and the candidate workspace.
- Test all eight threat scenarios above, plus unknown/older artifacts.

**Gate:** hostile-fixture tests, backward compatibility and independent
security review must pass. A valid signature alone does not pass this gate.

### Phase C: Optional Host event integration (separate decision)

- Host owns append-only event storage, identity mapping and override workflow.
- Signed final review/override events may reference canonical existing
  artifacts without rewriting them.
- Shadow observation and paired comparison precede enforcement.
- No auto-merge/release, no default-on trust promotion, no major schema change.

**Gate:** explicit Human/Host approval and evidence that the new consumer
actually benefits without false independence or false trust claims.

## Review checklist for the next PR

- [ ] One exact consumer and one grounded failure fixture are named.
- [ ] No duplicative Evidence State, Gate, or independence vocabulary.
- [ ] Candidate-controlled file cannot mint its own trust root.
- [ ] Exact revision/record/rulebook binding prevents substitution.
- [ ] Signer authorization is separate from cryptographic validity.
- [ ] Revocation, freshness and unknown policy have explicit behavior.
- [ ] Signature/trust never affect severity, agreement or verdict by default.
- [ ] Human overrides are not overwritten or silently promoted.
- [ ] Privacy/data-minimization and secret exclusion are reviewed.
- [ ] Paired/evidence review and existing CI are green.

## Phase 0 review decision

**GO:** document the existing owner boundaries and defer cryptographic
integration until an authentic Host workflow and trust policy are supplied.

**NO-GO:** create general signed-review fields, automatically claim independent
review from execution IDs or signatures, or wire signature success into
Gate/merge/release decisions now.

This is a partial milestone for #1760, not completion of its full ADR,
Review Record/Event schema, key lifecycle, or signed audit acceptance criteria.
