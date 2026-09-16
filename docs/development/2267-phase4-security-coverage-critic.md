# #2267 Phase 4 - Security Audit Coverage Critic

## Status

Phase 4 foundation for #2267, tracked by #2278.

This slice extends the existing `unknown-coverage-review` evidence-sufficiency skill with an explicit `security-audit` profile.
It does not add a new generic critic, a new verdict schema, target-controlled execution, or deterministic Gate behavior.

## Why reuse `unknown-coverage-review`

Phase 3 introduced a deterministic `SecurityAuditCoverage` ledger.
The next question is not another shape validator. It is whether a shape-valid ledger and audit report have enough evidence to justify their semantic investigation claims.

The existing `unknown-coverage-review` already owns this class of question:

```text
defect detection
= delegated to domain skills

evidence sufficiency
= unknown-coverage-review
```

Creating another generic coverage critic would duplicate that responsibility.
Phase 4 therefore reuses the existing skill and adds only the context-specific profile needed by repository or subsystem security audits.

## Profile boundary

### Generic profile

The existing behavior remains unchanged.
It runs after finding verification in a diff or PR flow.
It also requires a current diff that touches executable code, migration, schema, public API, or configuration.

Phase 4 does not weaken that entry condition.

### Security-audit profile

The new profile runs only from an explicit `river-review-security-audit` focused or full-audit flow.
It requires:

- frozen audit scope
- reconnaissance evidence
- a Phase 3 `SecurityAuditCoverage` ledger
- evidence that deterministic Phase 3 validation has run

A current diff is not required because repository and subsystem audits may not be associated with a current change.
This exception is local to the security-audit profile and must not affect generic routing.

## Responsibility boundary

### Phase 3 deterministic validator

The schema and `validateSecurityAuditCoverageSemantics()` remain the SSoT for:

- coverage shape and closed state vocabulary
- taxonomy version drift
- unknown attack-class IDs
- duplicate unit IDs
- duplicate semantic units
- derived counters
- `openUnitIds`
- state-specific required fields

Phase 4 must not reimplement these checks.

### Phase 4 critic

The security-audit profile evaluates semantic evidence sufficiency after deterministic validation.
It checks four areas.

#### 1. Missing applicable surface

Reconnaissance evidence may show an applicable subsystem, trust boundary, or attack class that is absent from the ledger.
The critic may report that gap only when applicability is grounded in repository evidence.
It must not require every attack class mechanically.

#### 2. Unsupported `covered` claim

A shape-valid `covered` unit has paths and evidence, but those records may still fail to support the scope being claimed.
The critic looks for claim-to-evidence mismatch rather than file count.

#### 3. Hidden exclusion, block, or defer risk

The critic checks whether `out_of_scope`, `blocked`, or `deferred` states accurately describe a real boundary or instead hide material audit work.
A concrete, evidence-backed exclusion is valid and must not produce a finding merely because it is excluded.

#### 4. Safety overclaim

The critic checks the report for unsupported inference such as:

```text
zero findings -> safe
empty openUnitIds -> secure
all listed units covered -> vulnerability-free
full-audit -> complete security coverage
```

Neutral source-only statements remain valid.

## Flow

```text
Explicit Security Audit
  -> scope freeze
  -> reconnaissance
  -> attack-class planning
  -> existing security skills
  -> candidates / unresolved hypotheses
  -> existing finding verification when available
  -> SecurityAuditCoverage
  -> deterministic Phase 3 validation
  -> unknown-coverage-review (security-audit profile)
  -> audit report
```

Phase 4 output is report-only.
The deterministic Gate does not consume it automatically.

## False-positive guards

The profile must preserve these guards:

- do not duplicate a Phase 3 deterministic validation error
- do not duplicate a security defect already owned by another skill
- do not infer attack-class applicability without reconnaissance evidence
- do not treat every `out_of_scope` unit as suspicious
- do not equate small evidence volume with insufficient evidence
- do not flag zero findings unless the report makes an unsupported safety inference
- do not invent source locations when the residual risk is report-level
- if the critic itself lacks evidence, ask a question rather than assert a finding

## Contract tests

`tests/security-audit-coverage-critic-profile.test.mjs` pins the integration boundary as text-level contract tests.
They intentionally do not claim to measure model quality.

The tests protect:

- explicit generic and security-audit profiles
- unchanged generic diff requirement
- diff-less execution only for explicit security-audit context
- deterministic validator ownership
- the four Phase 4 checks
- attack-class applicability guards
- zero-findings positive and negative cases
- audit flow wiring
- no deterministic Gate behavior change
- source-only behavior

Actual critic efficacy still requires dogfood and paired evaluation.

## Evaluation

Phase 4 does not optimize for finding count.

Useful signals are:

- missing applicable surface detection
- unsupported coverage-claim detection
- hidden exclusion/defer detection
- safety-overclaim detection
- false-positive rate
- duplicate output rate against existing security skills and Phase 3 validation
- added token and latency cost per explicit audit
- generic PR review regression

## Multi-perspective review checklist

### Architecture

- one evidence-sufficiency SSoT
- no new generic critic implementation
- generic and security-audit entry conditions remain separate

### Contract

- no new public schema or verdict vocabulary
- Phase 3 validator responsibility is not duplicated

### Security

- source-only remains the default
- critic output cannot become a safety guarantee
- runtime-only evidence stays unresolved or blocked

### Compatibility

- normal PR routing and generic unknown coverage behavior do not change
- deterministic Gate behavior does not change

### Evaluation

- positive and false-positive cases are both pinned
- contract tests are not presented as proof of LLM detection quality

## No-go conditions

Do not merge Phase 4 if any of these become necessary:

- relaxing the generic diff requirement
- duplicating the Phase 3 validator
- treating the attack registry as a mandatory checklist
- introducing a new Gate path
- claiming critic `pass` means safe
- requiring unsandboxed target execution

## Exit criteria

Phase 4 is ready when:

- generic behavior remains unchanged
- explicit security-audit profile is documented and wired
- deterministic validation is not duplicated
- the four evidence-sufficiency checks are defined
- false-positive guards are explicit
- contract regression tests pass
- generated skill artifacts are fresh
- repository CI passes
- multi-perspective review has no blocking findings

## Next phase

Phase 5 connects the existing #1978 finding verification path and reviewer identity/provenance.
This makes finder and verifier independence inspectable without creating a second finding state machine.
