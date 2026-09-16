# #2267 Phase 4 — Security Coverage Critic

## Status

Phase 4 integration design and skill-profile slice for #2267.

This phase reuses `unknown-coverage-review` as the Security Audit Coverage Critic.
It does not create a new generic critic engine, new finding lifecycle, new result schema, or Gate behavior.

## Decision

The existing `unknown-coverage-review` already owns the relevant question:

> Is there sufficient evidence that the intended risk surface was actually investigated?

That is the same responsibility needed after Phase 3 produces `SecurityAuditCoverage`.
A second generic Coverage Critic would duplicate evidence-sufficiency semantics and create another place for residual-risk policy to drift.

Phase 4 therefore adds a **Security Audit profile** to the existing skill.

```text
SecurityAuditCoverage
  -> deterministic schema validation
  -> validateSecurityAuditCoverageSemantics()
  -> unknown-coverage-review / Security Audit profile
  -> coverage observations / questions / actions
  -> audit report
```

The profile is report-only.
Gate integration remains Phase 12.

## Why Phase 3 validation is not enough

Phase 3 intentionally validates facts that can be derived mechanically:

- state-specific shape requirements;
- taxonomy version provenance;
- known attack-class identifiers;
- unique unit ids;
- unique `subsystem × trustBoundary × attackClassId` keys;
- derived counters and `openUnitIds` consistency.

Those checks cannot determine whether source evidence is semantically responsive to the investigation hypothesis.
They also cannot detect a semantic unit that was never written into the ledger unless an independent expected scope exists.

The Phase 4 profile handles these judgment-heavy gaps without reimplementing Phase 3 validation.

## Alternate invocation profile

The normal `unknown-coverage-review` flow is diff-oriented and requires a diff after finding verification.
A repository/subsystem security audit is not necessarily a diff review.

The Security Audit profile is therefore an explicit alternate invocation mode owned by the caller:

- caller is `river-review-security-audit`;
- a `SecurityAuditCoverage` object is present;
- schema validation passed;
- semantic validation passed against the Phase 2 registry;
- audit mode and frozen scope are known.

No new `inputContext` enum is introduced in Phase 4.
Automatic runner wiring is also deferred.
The profile is a skill-level contract that can be exercised by explicit audit orchestration today and wired into runtime later without changing its semantics.

## Responsibility boundary

### Phase 3 deterministic validation remains authoritative for

- invalid coverage state or state-specific fields;
- taxonomy mismatch;
- unknown attack-class id;
- duplicate unit id;
- duplicate semantic unit;
- summary/counter drift.

The profile must not emit a second LLM opinion for these facts.
If deterministic validation fails, repair the ledger before running the profile.

### Phase 4 profile owns

- whether recorded evidence is relevant to the unit's semantic hypothesis;
- whether `planned` / `blocked` / `deferred` units remain visible in residual-risk reporting;
- whether `out_of_scope` rationale is credible against the frozen scope;
- whether an explicitly planned semantic unit disappeared from the ledger;
- whether reporting incorrectly turns coverage statistics into a safety/completeness claim.

### Other owners remain unchanged

- vulnerability discovery: existing security skills/reviewers;
- finding truth/adversarial validation: #1978;
- Review execution completeness: #2212 `ReviewCoverage`;
- materiality/disposition: #1857 Semantic Precision;
- final decision: deterministic Gate;
- target-controlled execution: later sandbox phase.

## State handling

### `planned`

The unit remains open.
The profile surfaces missing investigation evidence and the next source-only action.
It does not infer vulnerability severity.

### `blocked`

The blocker and safe validation plan remain visible.
`unsafe_execution_required` must not cause the audit to execute target-controlled code.

Blocked coverage is residual uncertainty, not automatically a vulnerability or Gate failure.

### `deferred`

The unit remains visible with a traceable follow-up.
Budget/manual deferral must not disappear from the final audit summary.

### `out_of_scope`

The exclusion remains visible and should be checked against the frozen audit scope.
It is neither covered work nor proof that the surface is safe.

### `covered`

The schema proves that reviewed paths and evidence references exist.
The profile checks whether that evidence is responsive to the specific subsystem, trust boundary, and attack class.

`relatedFindingIds: []` is valid.
Zero findings do not make the unit less covered, and they also do not make it safe.

## Expected-scope problem

A ledger cannot prove its own universe is complete.
Consider this self-consistent ledger:

```text
plannedUnits = 0
blockedUnits = 0
deferredUnits = 0
openUnitIds = []
```

That only proves no recorded unit is open.
It does not prove that reconnaissance planned every relevant semantic unit.

Missing-unit detection therefore requires an explicit expected scope from reconnaissance/planning.

When expected scope is available:

```text
expected semantic keys - recorded semantic keys
= unexplained coverage omissions
```

When expected scope is unavailable:

- do not fabricate the Cartesian product of subsystem × trust boundary × attack class;
- do not claim the ledger is complete;
- report that the coverage universe is not independently checkable.

Phase 4 does not add a new expected-scope schema. The audit plan/reconnaissance record is sufficient until real usage proves a stable machine contract is needed.

## Gate boundary

The generic `unknown-coverage-review` documentation maps normal-review synthesis verdicts to existing Gate vocabulary.
That mapping is intentionally overridden for this Security Audit profile.

```text
Security Audit coverage observation
  -> report / question / action
  -X-> gate.decision
```

Phase 4 must not translate:

- `planned` into `ESCALATE`;
- `blocked` into `NO_GO`;
- `deferred` into `ESCALATE`;
- scope omission directly into a Gate mutation.

ADR-010 D8 reserves Gate integration for the final opt-in phase after paired evaluation and dogfood.

## Safety language guard

The profile must reject conclusions such as `safe`, `secure`, `no vulnerabilities`, or `complete` when they are based only on:

- zero findings;
- empty `relatedFindingIds`;
- all recorded units being `covered`/`out_of_scope`;
- `coveredUnits === applicableUnits`;
- empty `openUnitIds`;
- reviewer execution success;
- reviewer agreement.

Coverage is evidence about investigation breadth, not proof of vulnerability absence.

## Implementation files

- `skills/agent-skills/unknown-coverage-review/SKILL.md`
- `skills/agent-skills/unknown-coverage-review/references/SECURITY-AUDIT-PROFILE.md`
- Security Audit profile fixtures under `skills/agent-skills/unknown-coverage-review/fixtures/`
- `skills/agent-skills/river-review-security-audit/SKILL.md`

No runtime library is added in Phase 4.
`src/lib/security-audit-coverage.mjs` remains the deterministic semantic validator.

## Exit criteria

Phase 4 is complete when:

- no new generic Coverage Critic is introduced;
- `unknown-coverage-review` has an explicit Security Audit invocation profile;
- the normal diff-oriented behavior remains unchanged by default;
- the security profile can reason over a validated ledger without requiring a diff;
- deterministic Phase 3 checks are not duplicated;
- open/deferred/blocked units remain visible but do not mutate Gate;
- `covered` with zero findings does not become either a gap or a safety claim;
- an explicit expected scope can reveal a missing ledger unit;
- absence of expected scope prevents a completeness claim without inventing missing units;
- skill/meta validation and CI pass.

## Evaluation fixtures

Phase 4 adds canaries for:

1. mixed open units (`planned`, `blocked`, `deferred`) with Gate mutation prohibited;
2. `covered` + zero findings + empty `openUnitIds`, proving `covered != safe`;
3. an explicitly planned semantic unit missing from an otherwise valid ledger;
4. no expected scope, proving the critic must report an uncheckable coverage universe rather than invent a complete matrix.

## Deferred

- automatic runner wiring / a new context token;
- a machine schema for expected reconnaissance scope;
- #1978 candidate verification integration (Phase 5);
- epistemic evidence-state schema decisions (Phase 6);
- independent final-record verification (later phase);
- Gate policy (Phase 12);
- target-controlled execution and sandboxing.

## Next phase

Phase 5 connects security-audit candidate findings to the existing #1978 adversarial verification path without introducing a second candidate-validation state machine.
