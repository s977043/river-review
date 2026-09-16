# Security Audit Profile

This profile adapts `unknown-coverage-review` for #2267 repository/subsystem security audits.
It reuses the existing evidence-sufficiency responsibility instead of creating another generic Coverage Critic.

The profile is **observe/report-only** during #2267 Phase 4.
It does not change `gate.decision`, finding lifecycle, or Semantic Precision state.

## Activation

Use this profile only when all of the following are true:

1. the caller is performing an explicit `river-review-security-audit` repository/subsystem audit;
2. a `SecurityAuditCoverage` ledger exists;
3. the ledger passed `schemas/security-audit-coverage.schema.json` validation;
4. `validateSecurityAuditCoverageSemantics()` has been run against the Phase 2 attack-class registry.

This is an alternate invocation path to the normal diff-oriented `unknown-coverage-review` pre-execution gate.
A source diff is **not required** for this profile because repository/subsystem audits are not limited to changed lines.

Phase 4 does not add a new `inputContext` enum or automatic runner wiring.
The caller owns profile selection and supplies the already-validated coverage artifact.

If deterministic schema or semantic validation reports an issue, stop this profile and return an action to repair the ledger first.
Do not reinterpret structural/taxonomy errors as LLM coverage judgments.

## Inputs

Required:

- validated `SecurityAuditCoverage` ledger;
- Phase 2 `SecurityAttackClassRegistry` used for that ledger;
- explicit audit mode and frozen audit scope from `river-review-security-audit`.

Optional but important:

- explicit expected semantic scope from reconnaissance/planning, such as a planned set of `subsystem × trustBoundary × attackClassId` units.

The expected scope is intentionally not a new Phase 4 schema.
It may be supplied by the audit plan/reconnaissance record until a later phase proves that a stable machine contract is needed.

## What this profile evaluates

Deterministic Phase 3 validation owns shape and ledger consistency.
This profile evaluates evidence sufficiency and unexplained semantic gaps that require judgment.

### `planned`

Treat the unit as visibly open.
Report what evidence is still missing and the next source-only investigation action.
Do not infer vulnerability severity from the fact that the unit is planned.

### `blocked`

Surface the blocker, `reasonCode`, explanation, and safe `validationPlan` as residual risk.

For `unsafe_execution_required`, preserve the source-only boundary.
Never run target-controlled code merely to close the unit.

A blocked unit is not automatically a vulnerability and is not automatically a Gate failure in Phase 4.

### `deferred`

Keep the unit visible as deferred residual risk.
Require the existing validation plan to name a traceable follow-up target or concrete future validation step.
A budget/manual defer must not silently disappear from the audit summary.

### `out_of_scope`

Keep the exclusion visible.
Assess whether the explanation is consistent with the frozen audit scope and reconnaissance evidence.

`scope_excluded` and `not_applicable` are not coverage achievements and do not prove safety.
Do not reclassify them as `covered`.

### `covered`

Do not challenge the state merely because `relatedFindingIds` is empty.
A covered unit may legitimately have zero findings.

Instead, ask whether the recorded `reviewedPaths` and `evidenceRefs` are semantically relevant to the unit's:

```text
subsystem × trustBoundary × attackClassId
```

The schema proves evidence exists; this profile judges whether that evidence is actually responsive to the investigation hypothesis.

Do not re-verify candidate finding truth here.
Finding verification belongs to #1978 and existing verifier paths.

## Missing-unit detection requires an expected scope

A self-consistent ledger cannot prove that an entire semantic unit was never planned.
Therefore:

- when explicit expected scope exists, compare expected semantic keys with ledger semantic keys and surface unexplained omissions;
- when expected scope does not exist, state that the coverage universe is **not independently checkable**;
- do not manufacture missing units from the attack-class registry alone;
- do not require the full Cartesian product of subsystem × trust boundary × attack class;
- do not interpret an empty `openUnitIds` as proof that no semantic surface was omitted.

This limitation is mandatory to avoid circular coverage claims where the ledger defines its own completeness.

## No safety inference

The following facts are never sufficient to emit `safe`, `secure`, `no vulnerabilities`, `complete`, or equivalent language:

- zero candidate or established findings;
- empty `relatedFindingIds`;
- all recorded units being `covered` or `out_of_scope`;
- `coveredUnits === applicableUnits`;
- empty `openUnitIds`;
- successful reviewer execution;
- agreement between reviewers.

Coverage describes investigation evidence, not absence of vulnerabilities.

## Phase 4 output boundary

Use existing `unknown-coverage-review` output concepts; do not add a new result schema.
Prefer the report's `Unverified / Residual Risk` section plus `questions` / `actions` for coverage-specific observations.

For every reported coverage concern, identify when available:

- coverage `unitId`;
- semantic key (`subsystem`, `trustBoundary`, `attackClassId`);
- current state;
- evidence inspected;
- `evidence_missing` or scope mismatch;
- safe `resolution` / validation plan.

Do **not** create a vulnerability finding solely because a coverage unit is open.
Do **not** assign vulnerability severity from coverage state alone.

### Gate override for this profile

The generic `unknown-coverage-review` workflow documents a verdict-to-Gate mapping for normal review synthesis.
That mapping does **not** apply to the Security Audit profile in Phase 4.

For this profile:

```text
coverage critic observation
  -> report / question / action
  -X-> gate.decision
```

In particular:

- `planned` does not imply `ESCALATE`;
- `blocked` does not imply `NO_GO`;
- `deferred` does not imply `ESCALATE`;
- an unexplained scope omission does not directly mutate Gate state.

Gate integration is reserved for #2267 Phase 12 after paired evaluation and dogfood.

## False-positive guards

- The normal rule that a finding anchor must be in the diff is replaced by source-evidence traceability for this profile; repository/subsystem audits may inspect unchanged files.
- Do not duplicate deterministic Phase 3 diagnostics (taxonomy mismatch, unknown class, duplicate unit, summary drift).
- Do not duplicate vulnerability findings produced by security skills or #1978 validation.
- If evidence relevance cannot be established from available source evidence, emit a question rather than asserting insufficiency as fact.
- Treat explicit risk acceptance separately from unexamined uncertainty.
- Do not infer expected semantic units when reconnaissance/planning did not enumerate them.

## References

- `schemas/security-audit-coverage.schema.json`
- `src/lib/security-audit-coverage.mjs`
- `docs/development/2267-phase3-security-audit-coverage.md`
- `docs/adr/010-security-audit-harness-integration.md`
- `skills/agent-skills/river-review-security-audit/SKILL.md`
