# #2267 Phase 0—Cloudflare Security Audit Harness Gap Analysis

## Status

Phase 0 implementation note for #2267.

Baseline: `main` at `bc84de6f76ae00d8d37895d083f797c91f606b40` (2026-09-16).

This phase is intentionally documentation-only. It changes no review behavior, Gate policy, schema, Skill routing, or target execution policy.

## 1. Why this is not a greenfield feature

Cloudflare's public `security-audit-skill` describes six phases:

1. reconnaissance
2. coverage-led hunting
3. candidate validation
4. structured output
5. independent record verification
6. reporting

River Review already implements important pieces of that pipeline. The correct integration strategy is therefore to identify the missing contracts and connect the existing ones instead of importing a second security-audit framework.

## 2. External pattern -> current River Review mapping

- Reconnaissance: repo context, Skill routing, and security skills already exist. Full-audit-specific trust-boundary reconnaissance is not first-class.
- Isolated hunters: Reviewer roles and `reviewer-orchestrator.mjs` already provide fan-out. Reuse them instead of adding a second orchestration engine.
- Attack classes: `river-review-security`, `security-basic`, `trust-boundaries-authz`, and adversarial War Game cover part of the space. Add only missing domain skills after evidence shows a gap.
- Candidate validation by a fresh verifier: #1978 and `finding-critic.mjs` already define the deterministic state machine. Runtime integration and explicit independence remain incomplete.
- Structured findings: Review Artifact and output schemas already exist. Do not copy the Cloudflare schema wholesale.
- Independent final record verification: there is no equivalent mandatory post-validation stage. This is a new risk-tiered capability candidate.
- Coverage ledger: #2212 Review Coverage exists, but it is execution coverage rather than trust-boundary/attack-class coverage.
- Coverage critic: `unknown-coverage-review` is the first reuse candidate. Avoid a new generic Critic unless its semantics prove insufficient.
- Confirmed / needs validation / rejected: River Review already has `validatedStatus`, #1978 final status, disposition, and lifecycle status. The overlap is partial, so vocabulary collision risk is real.
- Repeat runs improve coverage: #1574 concerns capability evolution and saved runs already exist, but target-repository audit coverage reuse is a separate gap.
- Sandboxed local evidence: River Review has no security-audit sandbox contract. The integration must remain source-only until an adapter can enforce safety constraints.
- Target-neutral report: Review Artifact and Markdown outputs already exist. An experimental audit artifact may still be useful, but a machine-readable record must remain the SSoT.

## 3. Existing contracts that MUST remain authoritative

### 3.1 Review Team / candidate generation

`src/lib/reviewer-orchestrator.mjs` already owns parallel reviewer-role execution. Current roles include `bug-hunter`, `security-scanner`, `test-gap`, `dependency-reviewer`, `frontend-reviewer`, and `ci-cd-reviewer`.

The new audit flow must reuse this orchestration or a compatible thin adapter. It must not create a parallel orchestration framework with its own timeout, result merge, provider, or role contract.

### 3.2 Deterministic verification

`src/lib/verifier.mjs` already validates finding evidence and related structural properties before later review stages.

Security-audit integration should preserve the ordering principle:

```text
cheap deterministic checks
  before
expensive semantic / adversarial checks
```

### 3.3 Evidence-grounded adversarial validation (#1978)

`src/lib/finding-critic.mjs` already contains a deterministic skeleton for the Evidence-Grounded Adversarial Review protocol.

Current protocol concepts include:

- Critic verdicts: `AGREE`, `DISAGREE_EVIDENCE`, `DISAGREE_CONCERN`
- Reviewer actions: `KEEP`, `REVISE`, `WITHDRAW`
- fail-safe handling for timeout / parse failure / contradictory dismissal
- `askRelevance` as a separate axis from existing `scope`
- final statuses such as `confirmed`, `dismissed-by-evidence`, `needs-human-judgment`, and fail-safe states

The Cloudflare pattern strengthens the argument for independent verification, but it does not justify another state machine.

### 3.4 Review Coverage (#2212)

`src/lib/review-coverage.mjs` currently defines execution coverage.

Its contract deliberately separates review execution coverage from:

- Skill routing coverage
- Context coverage
- finding quality
- reviewer independence

The current unit is `reviewer role × diff chunk`.

Therefore a security semantic coverage ledger cannot be added as additional meanings of `ReviewCoverage.status` or `ReviewUnit.status`.

### 3.5 Semantic Precision (#1857 / ADR-007)

Semantic Precision answers whether an already-established finding should be treated as blocking, advisory, or suppressed.

It must remain downstream from truth/evidence validation.

Correct ordering:

```text
candidate truth
  -> evidence validation
  -> materiality / disposition
  -> Gate
```

### 3.6 Reviewer Identity (#1760)

Issue #1760 explores reviewer provenance and stronger actor identity. #2267 only needs enough provenance to enforce logical independence between the candidate finder and verifier.

The minimum useful contract is an execution/run identity, not cryptographic signing.

### 3.7 Review Evolution Cycle (#1574)

Issue #1574 improves River Review itself from multiple historical runs.

The #2267 repeat-run concern is different:

```text
#1574
= improve reviewer capability

#2267 repeat-run
= improve audit coverage of one target repository without trusting stale evidence
```

These loops may exchange artifacts later but must not share lifecycle semantics.

## 4. Vocabulary collision analysis

### 4.1 Existing finding axes

The Review Artifact schema already defines:

- `severity`: `info / minor / major / critical`
- `confidence`: `high / medium / low`
- `status`: lifecycle values `open / suppressed / verified`
- `scope`: change-origin values `in-diff / pre-existing`
- `sourceKind`: provenance values `ai-review / human-review / self-review`
- `agreement`: reviewers that independently raised the finding; it is not majority-vote evidence
- `consensusLevel`: display-only metadata derived from agreement
- `validatedStatus`: synthesis result values `confirmed / dismissed-hallucination / dismissed-duplicate / needs-human-judgment`

Issue #1978 also uses `validation.finalStatus` and `askRelevance` internally.

### 4.2 Why Cloudflare's three verdicts cannot be copied directly

Cloudflare's conceptual states are useful:

```text
confirmed
needs_validation
rejected
```

But direct import would create ambiguity:

- `confirmed` already exists in `validatedStatus`
- `needs_validation` overlaps `needs-human-judgment` but is not identical
- `rejected` can mean hallucination, evidence refutation, duplicate, out-of-ask, or reviewer withdrawal

These are not one axis today.

Phase 0 decision: **no schema change**.

A future implementation may introduce an explicitly epistemic axis only if the implementation cannot map safely to existing fields. Candidate wording such as `established / unresolved / refuted` is intentionally different from the existing lifecycle and synthesis terms, but it is not approved until a concrete producer/consumer requires it.

## 5. Coverage contract split

### 5.1 Existing Review Coverage

Example semantic:

```text
reviewer:security-scanner/chunk:2
status: completed
```

Question answered:

> Did the planned reviewer execution happen?

### 5.2 Proposed Security Audit Coverage

Example semantic:

```text
subsystem: auth
boundary: tenant-user -> tenant-resource
attackClass: authorization
status: covered
```

Question answered:

> Did the audit investigate this security hypothesis surface with traceable evidence?

### 5.3 Invariants

- a completed reviewer unit does not imply a semantic security unit is covered
- a semantic unit with zero findings may still be covered if required investigation evidence exists
- zero findings alone never marks a semantic unit covered
- semantic audit coverage does not change existing `ReviewCoverage.status`
- semantic coverage remains observe-only until a later Gate decision

## 6. Security audit entry-point boundary

The current `river-review-security` skill is diff-oriented and routes to focused security checks.

A future full-audit entry point should be separate rather than expanding the current default into a repository-wide harness.

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

Useful additive provenance, if available:

```text
reviewer id
provider
model
prompt/skill version
run id
```

Not required by Phase 0:

- cryptographic signing
- public-key identity
- different model provider for every validation

Logical independence is necessary; provider/model diversity is an evaluation variable, not an automatic correctness guarantee.

## 8. Final record verification gap

Issue #1978 verifies the candidate claim, but the final structured record can still accumulate errors in:

- line/path correction
- impact wording
- severity
- conditions
- remediation
- scope / ask relevance

A distinct final-record check therefore has value for higher-risk audit profiles.

Proposed cost tiers:

- `quick`: one fresh verifier performs candidate validation and also checks the final record.
- `standard`: an independent candidate verifier runs first; a separate verifier checks critical/major established findings.
- `deep`: an independent candidate verifier runs first; a separate verifier checks every established finding.

This is a future implementation decision, not a Phase 0 behavior change.

## 9. Execution safety gap

Cloudflare's design treats target-controlled execution as untrusted and requires OS-enforced isolation.

River Review currently has no security-audit-specific sandbox contract satisfying those requirements.

Therefore Phase 1 must be source-only.

Explicitly prohibited until a later sandbox adapter exists:

- package install / dependency fetch
- repository build scripts
- test commands controlled by the target repository
- browser/emulator launch with target code
- fuzzing target code
- external endpoints / production identities
- shared infrastructure probes

If execution is necessary to resolve a hypothesis but unavailable safely, the correct result is unresolved + validation plan, not unsafe execution.

## 10. Repeat-run gap

Cloudflare's repeated-run model uses prior coverage/findings to target gaps while avoiding the assumption that previous work proves current safety.

River Review lacks a dedicated target-audit carry-forward contract.

Required future invariants:

- changed relevant source invalidates prior evidence
- prior `unresolved` does not suppress current investigation
- prior rejected claims suppress only the unchanged refuted claim, not the semantic unit
- prior quick/scoped audit never implies uncovered scope is safe
- no prior compatible run must be explicitly reportable

## 11. What should NOT be implemented

The following would be architectural regressions:

1. a second reviewer orchestration engine just for security audit
2. a Cloudflare-specific finding schema parallel to Review Artifact
3. overloading `ReviewCoverage` with semantic audit meanings
4. adding `confirmed / needs_validation / rejected` directly to existing enums without migration analysis
5. making repository-wide audit the default PR behavior
6. using reviewer agreement as correctness
7. target execution without OS-enforced sandbox controls
8. letting a repository-wide pre-existing finding automatically block an unrelated PR
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

Pass when paired evaluation shows useful improvement in at least the precision / missed-critical / human-reversal dimensions without an unacceptable false-block increase.

### Gate C—Cost / UX

Pass when normal PR review cost and latency are unaffected and explicit security-audit profiles have measurable budgets.

### Gate D—Gate integration

Only after A-C pass. Gate integration starts opt-in/shadow and must fail safe on incomplete coverage or failed verification.

## 14. Phase 0 conclusion

Proceed, but only as an incremental integration.

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

This makes #2267 an integration epic, not a new framework project.

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
