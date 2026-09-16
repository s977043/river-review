---
id: river-review-security-audit
name: river-review-security-audit
description: |
  Repository または subsystem を対象に、source-only で明示的なセキュリティ監査を行う entry skill。
  通常の PR セキュリティレビューとは分離し、reconnaissance、scope 固定、既存 security skill への委譲、
  evidence と unresolved hypothesis の記録を行う。target-controlled code は実行しない。
category: midstream
phase: [upstream, midstream]
severity: critical
applyTo:
  - '**/*'
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
tags: [security, audit, entry, routing, source-only]
version: 0.2.0
license: MIT
---

# Security Audit Entry

Inspired by Cloudflare's
[security-audit-skill](https://github.com/cloudflare/security-audit-skill),
but implemented as a River Review-native entry skill rather than a vendored audit engine.

This skill is the explicit entry point for repository or subsystem security audit work.
It does not replace `river-review-security`, the normal diff-oriented security review entry.

## When to Use

Use this skill only when the user explicitly asks for a security audit beyond an ordinary PR review.
Typical requests include repository-wide security audit, subsystem security audit, security assessment,
or a bounded source review of a security-sensitive surface.

Do not select this skill for a generic request such as "review this PR for security".
Route that request to `river-review-security`.

## Modes

Select exactly one mode before reviewing.

- `guidance`: use when the user wants methodology, planning, or an audit approach. Explain the method and constraints. Do not claim that audit work was executed.
- `focused`: use when the user names a bounded subsystem, path, component, or security surface. Freeze that scope and review only source evidence inside the boundary.
- `full-audit`: use only when the user explicitly requests repository-wide audit coverage. Perform repository reconnaissance and source review across the repository. Do not claim semantic coverage completeness until `SecurityAuditCoverage` exists.

If the request does not clearly justify `full-audit`, use `focused` or `guidance`.

## Non-negotiable Source-only Policy

Version 0.2.0 is source-only.

Allowed evidence collection:

- file reads
- repository code search
- static diff inspection
- repository metadata and dependency manifests
- configuration and documentation inspection
- static history inspection when it supports source provenance

Prohibited execution:

- package installation or dependency fetching
- target repository build scripts
- target repository test commands
- package lifecycle scripts
- dev servers or application startup
- browsers or emulators that execute target code
- fuzzing or dynamic probes
- requests to production, shared, or external endpoints
- use of ambient credentials to reproduce a finding

If runtime evidence is required but safe execution is unavailable, keep the hypothesis unresolved.
Record the blocker and the minimum validation plan instead of executing target-controlled code.

## Responsibilities

This skill performs entry-level audit coordination only.
It must reuse existing River Review capabilities instead of creating a second workflow engine.

```text
Explicit audit request
  -> mode selection
  -> scope freeze
  -> source reconnaissance
  -> existing security skills
  -> candidate findings
  -> existing verification path
  -> audit summary
```

The following responsibilities remain outside this skill:

- generic reviewer fan-out: existing reviewer orchestration
- ordinary PR security review: `river-review-security`
- deterministic finding verification: existing verifier
- adversarial candidate state machine: #1978 / `finding-critic.mjs`
- execution coverage: #2212 Review Coverage
- materiality and disposition: #1857 Semantic Precision
- final Gate decision: existing deterministic Gate
- semantic `SecurityAuditCoverage`: Phase 3 follow-up of #2267
- independent final-record verification: later #2267 phase
- sandboxed target execution: later dedicated phase

## Audit Flow

### 1. Select mode and freeze scope

State the selected mode and the audit boundary before collecting findings.
For `focused`, name the bounded path, subsystem, component, or trust boundary.
For `full-audit`, state that the scope is repository-wide and source-only.

Do not silently broaden a focused audit into a repository-wide audit.

### 2. Reconnaissance from source only

Build a compact source map before hunting for issues.
At minimum identify, when present:

- externally reachable entry points
- authentication and authorization boundaries
- tenant or account boundaries
- sensitive data stores and flows
- privileged operations
- external integrations
- dependency and deployment configuration surfaces
- browser or client trust boundaries
- AI or agent tool boundaries

Reconnaissance is an investigation plan, not proof of safety.

### 3. Plan applicable attack classes

Use `references/attack-classes.json` as the taxonomy SSoT for audit planning.
Select only classes supported by reconnaissance evidence; do not run all classes mechanically.
For every applicable class, preserve the registry evidence contract:

```text
principal
  -> input or action
  -> control or missing control
  -> trust boundary
  -> affected resource or principal
  -> concrete security outcome
```

An attack class is an investigation hypothesis, not a checklist completion badge.
A class with zero findings is not automatically covered, and a non-applicable class must be explained rather than silently omitted.
`SecurityAuditCoverage` will consume this taxonomy in a later phase; this skill does not emit semantic coverage status yet.

### 4. Reuse existing security skills

Use existing River Review skills when their domain applies.

- `security-basic`: application security patterns such as injection, unsafe sinks, secrets, validation, and common application risks.
- `security-privacy-design`: privacy and sensitive-data design such as retention, deletion, encryption, residency, and privacy rights.
- `trust-boundaries-authz`: trust boundaries and authorization responsibilities, claims propagation, and tenant boundaries.
- `river-review-security`: ordinary changed-code security review. Use only when the task is actually diff-oriented rather than an audit.
- `adversarial-review`: optional complementary attack-path exploration. It is not a finding verifier.

Do not duplicate the guidance of these skills inside this entry skill.

### 5. Treat findings as evidence-grounded candidates

Every reported candidate must identify concrete source evidence.
Require enough information to answer:

```text
principal
  -> input or action
  -> control or missing control
  -> trust boundary
  -> affected resource or principal
  -> concrete security outcome
```

A missing best practice is not automatically a vulnerability.
A candidate without a concrete boundary failure or security outcome remains an open question or unresolved hypothesis.

### 6. Preserve verification boundaries

This entry skill does not claim independent adversarial verification unless the existing #1978 path actually ran with an independent verifier.

If only source review ran, report the result as candidate-level evidence.
Do not relabel reviewer agreement as correctness.
Do not introduce a new validation enum in this skill.

### 7. Record unresolved hypotheses explicitly

For every unresolved hypothesis, provide:

- source evidence already inspected
- the exact missing fact or runtime condition
- why source evidence is insufficient
- the minimum safe validation step
- whether the blocker is caused by the source-only policy

Do not assign severity solely from an unresolved runtime assumption.

### 8. Report without claiming unsupported coverage

Until the dedicated `SecurityAuditCoverage` contract is implemented, use descriptive coverage notes only.
Never emit `security coverage complete` or an equivalent guarantee from this skill.

A `full-audit` run means repository-wide source investigation was attempted.
It does not mean all security attack classes were proven covered.

## Output Contract

Start with this header:

```text
Audit mode: guidance | focused | full-audit
Execution policy: source-only
Scope: <repository | subsystem | path | trust boundary>
Coverage claim: descriptive-only; SecurityAuditCoverage not yet active
```

Then emit these sections:

1. **Reconnaissance** — relevant entry points, trust boundaries, sensitive assets, and inspected source areas.
2. **Candidate findings** — evidence-grounded findings produced through existing River Review skill contracts.
3. **Unresolved hypotheses** — missing facts, blockers, and validation plans.
4. **Reviewed surfaces** — descriptive list of source surfaces inspected. This is not semantic coverage certification.
5. **Next validation actions** — only actions that preserve the source-only policy unless a later sandbox phase is explicitly available.

For findings, preserve the existing River Review finding shape where possible:

```text
<file>:<line>: <Finding>
  Evidence: <source-backed evidence>
  Impact: <concrete security outcome>
  Fix: <minimum next action>
  Severity: <existing River Review severity when established by evidence>
  Confidence: <confidence>
  Skill: <originating skill id>
```

## Fail-safe Rules

- No target-controlled execution when sandbox guarantees are absent.
- No live endpoint probing.
- No repository mutation as part of the audit itself.
- No `0 findings == safe` inference.
- No `full-audit == complete coverage` inference.
- No consensus-as-correctness inference.
- No automatic Gate behavior change.
- No new status vocabulary from this skill.

## Relationship to Normal Security Review

```text
river-review-security
= normal diff-oriented security review

river-review-security-audit
= explicit repository or subsystem source-only security audit
```

When both phrases appear, prefer this audit skill only if the user explicitly asks for an audit scope beyond the current diff.

## References

- `docs/adr/010-security-audit-harness-integration.md`
- `docs/development/2267-phase0-gap-analysis.md`
- `skills/agent-skills/river-review-security-audit/references/attack-classes.json`
- `skills/agent-skills/river-review-security/SKILL.md`
- `skills/agent-skills/adversarial-review/SKILL.md`
- `skills/midstream/security-basic/SKILL.md`
- `skills/upstream/security-privacy-design/SKILL.md`
- `skills/upstream/trust-boundaries-authz/SKILL.md`
- [Cloudflare security-audit-skill](https://github.com/cloudflare/security-audit-skill)
