# ADR-010: Security Audit Harness Integration—Discovery / Verification / Judgment の分離

## Status

Accepted for Phase 0 of #2267.
This ADR fixes the integration boundary only.
It does not enable a full repository security audit or change Gate behavior.
It also does not execute target-controlled code or add a new workflow engine.

## Context

Cloudflare's `security-audit-skill` structures security review as a harness rather than a single prompt:

```text
Reconnaissance
  -> Coverage-led hunting
  -> Candidate validation
  -> Structured output
  -> Independent record verification
  -> Reporting
```

River Review already contains overlapping capabilities:

- parallel reviewer orchestration in `src/lib/reviewer-orchestrator.mjs`
- deterministic finding verification in `src/lib/verifier.mjs`
- evidence-grounded adversarial finding validation in `src/lib/finding-critic.mjs` (#1978)
- independent review synthesis / W-check
- Review Coverage in `src/lib/review-coverage.mjs` (#2212)
- security routing in `skills/agent-skills/river-review-security/`
- adversarial artifact review in `skills/agent-skills/adversarial-review/`
- unknown coverage review
- Semantic Precision Pass design (#1857 / ADR-007)
- Reviewer Identity exploration (#1760)
- Review Evolution Cycle (#1574)

Reimplementing the Cloudflare harness as a separate framework would duplicate these surfaces.
It would also create incompatible vocabularies.
The missing value is a contract that connects existing surfaces while keeping responsibilities distinct.

## Decision

### D1—Integrate the pattern, not the implementation

River Review will not vendor or fork the Cloudflare skill as its security-audit source of truth.

The integration may adopt the following patterns:

- reconnaissance before hunting
- trust-boundary-oriented coverage
- fresh verifier separation
- adversarial refutation of candidate findings
- explicit unresolved state
- independent verification of final records
- cumulative coverage across repeated runs
- source-only fallback when safe execution is unavailable

Cloudflare-specific prompts, file layouts, and verdict field names are not imported as canonical River Review contracts.

### D2—Keep normal PR security review and full security audit separate

`river-review-security` remains the normal diff-oriented security review entry point.

A future `river-review-security-audit` entry point is reserved for explicit repository or subsystem audit requests.

A full audit MUST NOT become the default path for ordinary PR review.
Its reconnaissance and broader coverage have materially higher cost and latency.
Independent verification also adds cost.

### D3—ReviewCoverage and SecurityAuditCoverage are different contracts

Existing `ReviewCoverage` answers:

> Whether the review work planned by River Review actually executed.

Its current unit is `reviewer role × diff chunk`.
The derived state is `complete | partial | not_executed`.

A future `SecurityAuditCoverage` answers:

> Which trust boundary × subsystem × attack class combinations were investigated or left incomplete.

The two contracts MUST NOT be merged into one semantic axis.

```text
ReviewCoverage
= execution completeness

SecurityAuditCoverage
= semantic security investigation breadth
```

`0 findings` proves neither contract is complete.

### D4—Separate Discovery, Verification, Judgment, and Gate

The pipeline is fixed conceptually as:

```text
Reviewer / Hunter
  -> Candidate Finding
  -> Deterministic Verification
  -> Independent Adversarial Verification
  -> Evidence State
  -> Semantic Precision
  -> Gate / caller decision
```

Responsibilities:

- Reviewer / Hunter: discover candidate problems
- Deterministic Verifier: reject mechanically invalid evidence/contracts
- Independent Verifier / Critic: attempt to refute the candidate from evidence
- Semantic Precision Pass: decide materiality / disposition of an established issue
- Gate: derive the caller-facing decision

Truth and blocking policy MUST NOT be decided as one undifferentiated LLM judgment.

### D5—Reuse #1978 for candidate adversarial verification

`src/lib/finding-critic.mjs` and #1978 remain the source of truth for the Reviewer↔Critic finding validation protocol.

The Cloudflare integration MUST NOT create a second adversarial validation state machine.

A later integration may strengthen #1978 with an independence invariant such as:

```text
finderRunId != verifierRunId
```

It may also add provenance compatible with #1760.
Cryptographic signing is not required by #2267.

### D6—Do not create a new status vocabulary before proving a gap

Existing finding axes already include:

- `severity`: info / minor / major / critical
- `confidence`: high / medium / low
- lifecycle `status`: open / suppressed / verified
- `scope`: in-diff / pre-existing
- `validatedStatus`: confirmed / dismissed-hallucination / dismissed-duplicate / needs-human-judgment
- `validation.finalStatus` in the #1978 implementation
- Semantic Precision `disposition` in ADR-007
- `askRelevance` in the #1978 implementation

Cloudflare's conceptual `confirmed / needs_validation / rejected` states are useful.
#2267 MUST first map them to existing axes.

If an additional epistemic axis remains necessary, it needs distinct semantics and a distinct name.
A candidate vocabulary is:

```text
established
unresolved
refuted
```

This ADR does not approve a schema field with those values yet.

### D7—Source-only is the safe default

Phase 1 of the security-audit integration is source-only.

The audit MUST NOT run target-controlled builds or tests without a later sandbox contract.
The same restriction applies to browsers, emulators, fuzzers, package scripts, and fixtures.

A future execution adapter must provide these controls:

- no external network for target-controlled processes
- sanitized allowlisted environment
- read-only target/toolchain
- scratch-only writes
- bounded CPU and memory use
- bounded process count and disk use
- bounded wall-clock use
- no production/shared endpoints or identities

If these controls cannot be enforced, the related hypothesis remains unresolved.
The system must not execute unsafely.

### D8—Gate integration is the final, opt-in phase

Security-audit findings do not change current Gate behavior during observation and evaluation phases.

Before Gate integration, River Review must compare at least:

1. current baseline
2. baseline with semantic security coverage
3. baseline with semantic security coverage and adversarial candidate validation
4. baseline with semantic security coverage plus adversarial validation and final record verification

Primary evaluation signals include established-finding precision and false positives.
They also include missed critical or high-impact issues and human reversal.
False block rate, latency, and token or cost overhead are also required signals.

A repository-wide pre-existing finding MUST NOT automatically block an unrelated current PR.
`scope` and `askRelevance` remain relevant boundaries.
Relation to the current change remains relevant as well.

## Responsibility Matrix

- Reviewer fan-out / candidate generation: `src/lib/reviewer-orchestrator.mjs`
- Deterministic evidence checks: `src/lib/verifier.mjs`
- Candidate adversarial verification: #1978 / `src/lib/finding-critic.mjs`
- Review execution coverage: #2212 / `src/lib/review-coverage.mjs`
- Security semantic coverage: #2267 follow-up; not yet implemented
- Existing review synthesis / W-check: `independent-review-synthesis`
- Materiality / disposition: #1857 / ADR-007
- Reviewer identity / provenance: #1760
- Reviewer capability evolution: #1574
- Final caller decision: existing deterministic Gate

## Consequences

### Positive

- avoids a second review framework
- keeps existing Review Coverage semantics stable
- reuses already-tested #1978 logic
- preserves Plugin-first and provider-agnostic architecture
- allows security-audit features to be introduced incrementally and observed before gating
- makes unsafe target execution explicitly out of scope until sandboxing is available

### Negative / Cost

- security audit requires coordination across several existing contracts instead of one monolithic module
- a separate semantic coverage artifact may be required
- independence provenance may require additive metadata before #1760 is fully implemented
- final record verification adds model invocations and latency for high-risk profiles

## Rejected Alternatives

### A. Vendor Cloudflare `security-audit-skill` as River Review's audit engine

Rejected because it duplicates several existing River Review components.
Those components include the Skill Registry, finding model, verifier, W-check, and reviewer orchestration.
Vendoring would also create an upstream synchronization burden.

### B. Extend `ReviewCoverage` to include trust-boundary / attack-class states

Rejected because execution completion and semantic investigation breadth answer different questions.
Mixing them would make `complete` ambiguous.

### C. Add `confirmed / needs_validation / rejected` directly to `validatedStatus`

Rejected for Phase 0 because `validatedStatus` is already a synthesis-specific axis.
It overlaps only partially with #1978 final states.
A vocabulary merge requires a separate schema decision backed by usage evidence.

### D. Run local reproduction immediately without sandboxing

Rejected because target-controlled code is untrusted in the audit context.
Source-only incompleteness is preferable to unsafe execution.

## Follow-up

Implementation follows #2267's staged plan.
The next slice is the explicit source-only `river-review-security-audit` entry skill.
A separate semantic security coverage contract follows that work.

## References

- #2267
- #1978
- #2212
- #1760
- #1857
- #1574
- `docs/development/2267-phase0-gap-analysis.md`
- [Cloudflare security-audit-skill](https://github.com/cloudflare/security-audit-skill)
- [Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness/)
