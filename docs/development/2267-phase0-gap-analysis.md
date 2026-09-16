# #2267 Phase 0—Cloudflare Security Audit Harness Gap Analysis

## Status

Phase 0 implementation note for #2267.

Baseline: `main` at `bc84de6f76ae00d8d37895d083f797c91f606b40` (2026-09-16).

This phase is intentionally documentation-only.
It changes no review behavior, Gate policy, schema, or Skill routing.
It also changes no target execution policy.

## 1. Why this is not a greenfield feature

Cloudflare's public `security-audit-skill` describes six phases:

1. reconnaissance
2. coverage-led hunting
3. candidate validation
4. structured output
5. independent record verification
6. reporting

River Review already implements important pieces of that pipeline.
The integration should connect missing contracts instead of importing a second security-audit framework.

## 2. External pattern -> current River Review mapping

- Reconnaissance: repo context and security Skill routing already exist. Full-audit trust-boundary reconnaissance is not first-class.
- Isolated hunters: Reviewer roles and `reviewer-orchestrator.mjs` already provide fan-out. Reuse them instead of adding another orchestration engine.
- Attack classes: `river-review-security`, `security-basic`, and `trust-boundaries-authz` cover part of the space. Adversarial War Game covers another part.
- Candidate validation by a fresh verifier: #1978 and `finding-critic.mjs` already define the deterministic state machine. Runtime integration remains incomplete.
- Structured findings: Review Artifact and output schemas already exist. Do not copy the Cloudflare schema wholesale.
- Independent final record verification: there is no equivalent mandatory post-validation stage. This is a new risk-tiered capability candidate.
- Coverage ledger: #2212 Review Coverage exists. It tracks execution coverage rather than trust-boundary or attack-class coverage.
- Coverage critic: `unknown-coverage-review` is the first reuse candidate. Avoid a new generic Critic unless its semantics prove insufficient.
- Confirmed / needs validation / rejected: River Review already has overlapping status axes. Direct import would create vocabulary collision.
- Repeat runs improve coverage: #1574 concerns capability evolution. Target-repository audit coverage reuse is a separate gap.
- Sandboxed local evidence: River Review has no security-audit sandbox contract. The integration must remain source-only until a safe adapter exists.
- Target-neutral report: Review Artifact and Markdown outputs already exist. A machine-readable record must remain the SSoT.

## 3. Existing contracts that MUST remain authoritative

### 3.1 Review Team / candidate generation

`src/lib/reviewer-orchestrator.mjs` owns parallel reviewer-role execution.
Current roles include `bug-hunter`, `security-scanner`, and `test-gap`.
They also include `dependency-reviewer`, `frontend-reviewer`, and `ci-cd-reviewer`.

The audit flow must reuse this orchestration or a compatible thin adapter.
It must not create another framework for timeout, result merge, provider, or role contracts.

### 3.2 Deterministic verification

`src/lib/verifier.mjs` already validates finding evidence and related structural properties before later review stages.

Security-audit integration should preserve this ordering principle:

```text
cheap deterministic checks
  before
expensive semantic / adversarial checks
```

### 3.3 Evidence-grounded adversarial validation (#1978)

`src/lib/finding-critic.mjs` contains a deterministic skeleton for the Evidence-Grounded Adversarial Review protocol.

Current protocol concepts include:

- Critic verdicts: `AGREE`, `DISAGREE_EVIDENCE`, `DISAGREE_CONCERN`
- Reviewer actions: `KEEP`, `REVISE`, `WITHDRAW`
- fail-safe handling for timeout / parse failure / contradictory dismissal
- `askRelevance` as a separate axis from existing `scope`
- final statuses such as `confirmed`, `dismissed-by-evidence`, and `needs-human-judgment`

The Cloudflare pattern strengthens the case for independent verification.
It does not justify another state machine.

### 3.4 Review Coverage (#2212)

`src/lib/review-coverage.mjs` currently defines execution coverage.

Its contract separates review execution coverage from:

- Skill routing coverage
- Context coverage
- finding quality
- reviewer independence

The current unit is `reviewer role × diff chunk`.

A security semantic coverage ledger therefore cannot extend the meaning of `ReviewCoverage.status` or `ReviewUnit.status`.

### 3.5 Semantic Precision (#1857 / ADR-007)

Semantic Precision decides how an already-established finding should be treated.
It may classify the finding as blocking, advisory, or suppressed.

It must remain downstream from truth and evidence validation.

Correct ordering:

```text
candidate truth
  -> evidence validation
  -> materiality / disposition
  -> Gate
```

### 3.6 Reviewer Identity (#1760)

Issue #1760 explores reviewer provenance and stronger actor identity.
Issue #2267 needs only enough provenance to enforce logical independence between finder and verifier.

The minimum useful contract is an execution or run identity.
Cryptographic signing is not required here.

### 3.7 Review Evolution Cycle (#1574)

Issue #1574 improves River Review itself from multiple historical runs.

The #2267 repeat-run concern is different:

```text
#1574
= improve reviewer capability

#2267 repeat-run
= improve audit coverage of one target repository without trusting stale evidence
```

These loops may exchange artifacts later.
They must not share lifecycle semantics.

## 4. Vocabulary collision analysis

### 4.1 Existing finding axes

The Review Artifact schema already defines:

- `severity`: `info / minor / major / critical`
- `confidence`: `high / medium / low`
- `status`: lifecycle values `open / suppressed / verified`
- `scope`: change-origin values `in-diff / pre-existing`
- `sourceKind`: provenance values `ai-review / human-review / self-review`
- `agreement`: reviewers that independently raised the finding
- `consensusLevel`: display-only metadata derived from agreement
- `validatedStatus`: synthesis result values including `confirmed` and `needs-human-judgment`

Issue #1978 also uses `validation.finalStatus` and `askRelevance` internally.

### 4.2 Why Cloudflare's three verdicts cannot be copied directly

Cloudflare's conceptual states are useful:

```text
confirmed
needs_validation
rejected
```

Direct import would create ambiguity:

- `confirmed` already exists in `validatedStatus`
- `needs_validation` overlaps `needs-human-judgment` but is not identical
- `rejected` can represent evidence refutation or duplicate handling
- `rejected` can also represent out-of-ask or reviewer withdrawal

These are not one axis today.

Phase 0 decision: **no schema change**.

A future implementation may introduce an epistemic axis only if existing fields cannot model the producer and consumer needs.
Candidate terms include `established / unresolved / refuted`.
Those terms are not approved as a schema field in Phase 0.

## 5. Coverage contract split

### 5.1 Existing Review Coverage

Example semantic:

```text
reviewer:security-scanner/chunk:2
status: completed
```

Question answered:

> Whether the planned reviewer execution happened.

### 5.2 Proposed Security Audit Coverage

Example semantic:

```text
subsystem: auth
boundary: tenant-user -> tenant-resource
attackClass: authorization
status: covered
```

Question answered:

> Whether this security hypothesis surface was investigated with traceable evidence.

### 5.3 Invariants

- a completed reviewer unit does not imply a semantic security unit is covered
- a semantic unit with zero findings may still be covered when investigation evidence exists
- zero findings alone never marks a semantic unit covered
- semantic audit coverage does not change existing `ReviewCoverage.status`
- semantic coverage remains observe-only until a later Gate decision

## 6. Security audit entry-point boundary

The current `river-review-security` skill is diff-oriented and routes to focused security checks.

A future full-audit entry point should remain separate from the normal PR path.

Proposed responsibilities:

```text
river-review-security
= normal changed-code security review

river-review-security-audit
= explicit repository/subsystem audit with reconnaissance and semantic coverage
```

Initial modes:

- `guidance`: security methodology / focused answer only
- `focused`: explicit bounded subsystem/path review
- `full-audit`: reconnaissance + coverage-led review + validation artifacts

The full-audit mode must be explicit.

## 7. Candidate independence contract

Cloudflare's strongest reusable invariant is that the verifier is not the finder.

River Review should model independence as an execution property rather than prompt wording.

Minimum candidate invariant:

```text
finderRunId != verifierRunId
```

Useful additive provenance includes:

```text
reviewer id
provider
model
prompt/skill version
run id
```

Phase 0 does not require:

- cryptographic signing
- public-key identity
- different model providers for every validation

Logical independence is necessary.
Provider or model diversity remains an evaluation variable rather than a correctness guarantee.

## 8. Final record verification gap

Issue #1978 verifies the candidate claim.
The final structured record can still accumulate errors in later fields.

Those fields include:

- line/path correction
- impact wording
- severity
- conditions
- remediation
- scope / ask relevance

A distinct final-record check therefore has value for higher-risk audit profiles.

Proposed cost tiers:

- `quick`: one fresh verifier checks both the candidate and final record
- `standard`: one candidate verifier runs first; another verifier checks critical or major established findings
- `deep`: one candidate verifier runs first; another verifier checks every established finding

This is a future implementation decision rather than a Phase 0 behavior change.

## 9. Execution safety gap

Cloudflare treats target-controlled execution as untrusted and requires OS-enforced isolation.

River Review has no security-audit-specific sandbox contract with those guarantees.

Therefore Phase 1 must be source-only.

Explicitly prohibited until a later sandbox adapter exists:

- package install / dependency fetch
- repository build scripts
- test commands controlled by the target repository
- browser/emulator launch with target code
- fuzzing target code
- external endpoints / production identities
- shared infrastructure probes

If safe execution cannot resolve a hypothesis, the result remains unresolved.
The output should include a validation plan instead of unsafe execution.

## 10. Repeat-run gap

Cloudflare uses prior coverage and findings to target gaps in later runs.
It does not treat previous work as proof of current safety.

River Review lacks a dedicated target-audit carry-forward contract.

Required future invariants:

- changed relevant source invalidates prior evidence
- prior `unresolved` does not suppress current investigation
- prior rejected claims suppress only the unchanged refuted claim
- prior quick or scoped audit never implies uncovered scope is safe
- absence of a compatible prior run is explicitly reportable

## 11. What should NOT be implemented

The following would be architectural regressions:

1. a second reviewer orchestration engine just for security audit
2. a Cloudflare-specific finding schema parallel to Review Artifact
3. overloading `ReviewCoverage` with semantic audit meanings
4. adding Cloudflare verdicts directly to existing enums without migration analysis
5. making repository-wide audit the default PR behavior
6. using reviewer agreement as correctness
7. target execution without OS-enforced sandbox controls
8. letting a pre-existing repository finding automatically block an unrelated PR
9. merging target audit repeat-runs into #1574 capability evolution

## 12. Proposed implementation slices

### PR1—Phase 0 boundary documents

- ADR-010
- this gap analysis
- no behavior change

### PR2—Source-only audit entry skill

- explicit `river-review-security-audit`
- guidance/focused/full-audit modes
- no target execution

### PR3—Semantic security coverage contract

- experimental schema/artifact
- deterministic statuses/reasons
- observe-only

### PR4—Coverage critic integration

- evaluate reuse of `unknown-coverage-review`
- no duplicate generic critic

### PR5—#1978 runtime integration / independence

- finder/verifier provenance
- fail-safe incomplete handling

### PR6—Final record verification profiles

- quick/standard/deep behavior
- risk/cost evaluation

### PR7—Repeat-run / reporting

- compatible prior audit lookup
- stale-source revalidation rules
- structured audit outputs

### Later—Sandbox adapter / Gate

Only after evaluation.

## 13. Evaluation gates

### Gate A—Architecture

Pass when:

- no existing contract is reimplemented
- ReviewCoverage semantics are unchanged
- candidate validation uses #1978
- full audit is opt-in

### Gate B—Quality

Paired evaluation must show useful improvement in quality signals.
The signals include precision, missed critical issues, and human reversal.
The change must not introduce an unacceptable false-block increase.

### Gate C—Cost / UX

Normal PR review cost and latency must remain unchanged.
Explicit security-audit profiles must have measurable budgets.

### Gate D—Gate integration

Only after A-C pass.
Gate integration starts in opt-in or shadow mode.
Incomplete coverage or failed verification must fail safe.

## 14. Phase 0 conclusion

Proceed only as an incremental integration.

The largest gaps worth implementing are:

1. explicit source-only full-security-audit entry point
2. semantic security coverage separate from Review Coverage
3. machine-checkable finder/verifier independence
4. independent final-record verification for higher-risk profiles
5. target-audit repeat-run carry-forward with stale-evidence invalidation

The following already exist and must be reused:

- reviewer fan-out
- deterministic finding verification
- adversarial finding state machine (#1978)
- W-check / synthesis
- execution coverage (#2212)
- Semantic Precision (#1857)
- reviewer identity direction (#1760)
- capability evolution (#1574)

This makes #2267 an integration epic rather than a new framework project.

## References

- #2267
- #1978
- #2212
- #1760
- #1857
- #1574
- `docs/adr/010-security-audit-harness-integration.md`
- `src/lib/reviewer-orchestrator.mjs`
- `src/lib/verifier.mjs`
- `src/lib/finding-critic.mjs`
- `src/lib/review-coverage.mjs`
- `skills/agent-skills/river-review-security/SKILL.md`
- `skills/agent-skills/adversarial-review/SKILL.md`
- `skills/agent-skills/unknown-coverage-review/SKILL.md`
- `skills/midstream/independent-review-synthesis/SKILL.md`
- [Cloudflare security-audit-skill](https://github.com/cloudflare/security-audit-skill)
- [Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness/)
