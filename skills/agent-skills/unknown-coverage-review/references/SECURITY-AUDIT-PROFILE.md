# Security Audit Profile — Unknown Coverage Review

This profile reuses `unknown-coverage-review` as an evidence-sufficiency critic for explicit repository/subsystem security audits.
It does **not** create a new generic critic, finding verifier, coverage validator, or Gate policy.

## Entry Condition

Select `profile: security-audit` only when all of the following are true:

- the caller is executing an explicit `river-review-security-audit` focused or full-audit flow;
- a shape-valid `SecurityAuditCoverage` ledger is available;
- reconnaissance evidence identifies the audited subsystem, trust boundaries, and the basis for attack-class applicability;
- the caller asks for the post-coverage synthesis step before the audit summary.

The generic profile keeps the existing diff-oriented Pre-execution Gate unchanged.
The security-audit profile does **not** require a current diff because repository/subsystem audits can exist without one.
Do not select this profile from keyword routing or a normal PR security review.

## Required Context

Use only evidence already produced by the audit flow:

- reconnaissance notes and source map;
- the Phase 2 `SecurityAttackClassRegistry` taxonomy;
- a shape-valid Phase 3 `SecurityAuditCoverage` ledger;
- source-backed reviewed paths and evidence references;
- candidate findings and unresolved hypotheses when present;
- the draft audit summary when checking safety-overclaim language.

Do not fetch or execute target-controlled code to satisfy this profile.
The source-only policy remains in force.

## Responsibility Boundary

The deterministic Phase 3 contract remains authoritative for structure and cross-record invariants.
Do **not** duplicate checks already owned by `schemas/security-audit-coverage.schema.json` or `validateSecurityAuditCoverageSemantics()`:

- allowed coverage states;
- taxonomy version mismatch;
- unknown attack-class IDs;
- duplicate unit IDs;
- duplicate `subsystem × trustBoundary × attackClassId` units;
- summary-counter drift;
- `openUnitIds` drift;
- state-specific required fields enforced by JSON Schema.

This profile evaluates only semantic evidence sufficiency after those checks pass.
It also does not re-implement #1978 finding verification, #1857 Semantic Precision, or deterministic Gate policy.

## Critic Checks

### 1. Missing applicable semantic surface

Compare reconnaissance evidence with the ledger and ask whether an obviously relevant
`subsystem × trustBoundary × attackClassId` surface is absent.

Guardrails:

- never require every attack class mechanically;
- infer applicability only from concrete reconnaissance evidence;
- a possible but unsubstantiated surface is a question, not a finding;
- do not create a defect finding merely because a ledger unit is missing.

A useful Unknown states the missing surface, the reconnaissance evidence that makes it relevant,
and what ledger/evidence update would resolve the uncertainty.

### 2. Unsupported `covered` semantic claim

A schema-valid `covered` unit can still overstate what the evidence establishes.
Evaluate whether `reviewedPaths` and `evidenceRefs` actually support the subsystem, trust boundary,
and attack class named by the unit.

Examples of insufficient semantic evidence:

- one leaf file is cited while the claim covers an entire subsystem boundary;
- evidence shows file inspection but not the stated trust-boundary path;
- evidence is only a finding ID without source support for the coverage claim;
- evidence covers a different attack class than the unit claims.

Do not downgrade a valid unit only because it has zero findings.
Finding count is separate from semantic coverage.

### 3. Hidden exclusion / defer / block risk

Review `out_of_scope`, `deferred`, and `blocked` units for semantic consistency with reconnaissance.

Raise a residual Unknown when evidence suggests the state may be hiding uninvestigated material surface, for example:

- broad or repeated `out_of_scope` exclusions contradict identified trust boundaries;
- `not_applicable` reasoning conflicts with source/reconnaissance evidence;
- `deferred` is used as a synonym for “not investigated” without a meaningful next validation step;
- `blocked` has a formally valid validation plan but the plan does not resolve the stated blocker.

Do not object to a concrete, evidence-backed exclusion merely because it reduces applicable coverage.

### 4. Safety-overclaim detection

Inspect the audit summary/report for unsupported translations from telemetry to security truth.
Flag residual risk if prose implies any of the following:

- zero findings means safe or secure;
- empty `openUnitIds` means secure;
- all units marked `covered` means vulnerability-free;
- `full-audit` means complete security coverage;
- reviewer agreement or coverage counters prove finding correctness.

Neutral statements such as “no findings were established in the inspected source surfaces” are allowed
when they do not become a safety guarantee.

## Output Contract

This profile remains report-only.
It returns existing Unknown Coverage vocabulary only:

- findings for source-backed evidence-sufficiency gaps that can be anchored to available evidence;
- questions when the evidence is insufficient to establish a gap;
- actions/resolution describing the minimum evidence needed to resolve the Unknown.

Reuse `category`, `severity`, `blocking`, `evidence_missing`, and `resolution` where the existing
Unknown Coverage output contract supports them. Do not create a `security-audit` verdict enum.

**Do not feed this profile directly into Gate behavior in Phase 4.**
The generic profile keeps its existing verdict mapping; this security-audit profile contributes
residual-risk review material to the audit summary only.

## False-positive Guards

- A ledger unit is not weak merely because it has no finding.
- A class is not missing merely because it exists in the taxonomy.
- A legitimate `out_of_scope` or `not_applicable` decision with concrete reconnaissance evidence is not a finding.
- A blocked source-only unit is not a failure when runtime evidence is genuinely required and the validation plan is concrete.
- Do not repeat a concrete security defect already produced by a security skill; report only the evidence-sufficiency gap.
- Do not turn speculative attack paths into findings. Ask a question when applicability cannot be established.

## Evaluation Fixtures

`security-audit-profile-fixtures.json` pins the minimum Phase 4 behavior contract:

1. missing applicable surface is detected;
2. schema-valid but semantically weak `covered` evidence is detected;
3. legitimate evidence-backed `out_of_scope` does not produce a false positive;
4. suspicious mass exclusion/defer produces residual risk;
5. zero findings plus a safety claim is detected;
6. zero findings plus neutral language is not flagged;
7. generic diff profile remains unchanged;
8. Gate behavior remains unchanged.

These fixtures define expected critic behavior, not deterministic security truth.

## References

- `skills/agent-skills/unknown-coverage-review/SKILL.md`
- `skills/agent-skills/unknown-coverage-review/references/DELEGATION.md`
- `skills/agent-skills/river-review-security-audit/SKILL.md`
- `skills/agent-skills/river-review-security-audit/references/attack-classes.json`
- `schemas/security-audit-coverage.schema.json`
- `src/lib/security-audit-coverage.mjs`
- Issue #2267 Phase 4 / Issue #2278
