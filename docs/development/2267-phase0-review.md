# #2267 Phase 0 Review—Security Audit Harness Integration

## Scope

Reviewed changes:

- `docs/adr/010-security-audit-harness-integration.md`
- `docs/development/2267-phase0-gap-analysis.md`

Base: `main` at `bc84de6f76ae00d8d37895d083f797c91f606b40`.

This review evaluates only the Phase 0 boundary documents.
No runtime security-audit implementation exists in this slice.

## Overall Verdict

**GO for PR1.**

No blocking issue remains after the fixes described below.

The direction is acceptable because Phase 0 adds no runtime behavior.
It also blocks the highest-risk integration mistakes.
Those mistakes include duplicate orchestration, coverage semantic collision, premature status growth, unsandboxed execution, and early Gate coupling.

## Review 1—Architecture / Responsibility Boundaries

### Checks

- Confirm #2267 does not create a second review framework.
- Confirm it does not duplicate #1978 candidate verification.
- Confirm it does not overload #2212 Review Coverage.
- Confirm #1857 Semantic Precision remains a downstream concern.
- Confirm #1574 capability evolution stays separate from target audit state.

### Result

**PASS.**

The ADR assigns existing concerns to their current owners:

- candidate generation -> reviewer orchestrator
- deterministic checks -> verifier
- adversarial finding validation -> #1978 / finding critic
- execution coverage -> #2212
- materiality/disposition -> #1857
- reviewer provenance -> #1760
- capability evolution -> #1574

New work is limited to integration gaps.
The main gaps are semantic security coverage, an explicit full-audit entry point, independence provenance, final-record verification, and target-audit carry-forward.

### Architecture risk retained for follow-up

`SecurityAuditCoverage` is currently a concept rather than an approved schema.
PR3 must prove the minimum contract before introducing a generalized schema.

## Review 2—Contract / Schema Compatibility

### Checks

- Confirm this PR does not modify existing schemas.
- Confirm it does not add an enum that collides with existing finding axes or #1978 state.
- Confirm it does not change the meaning of Review Coverage.
- Confirm Cloudflare terminology is not copied as canonical River Review vocabulary.

### Result

**PASS after clarification.**

The documents make Phase 0 schema-neutral.

The proposed `established / unresolved / refuted` terms are only candidate vocabulary.
They are not approved as a schema field in ADR-010.

This matters because several axes already exist:

- severity
- confidence
- lifecycle status
- diff scope
- synthesis validated status
- #1978 final validation state
- semantic disposition
- ask relevance

Adding another enum before a concrete integration point would be premature.

## Review 3—Security / Execution Safety

### Checks

- Confirm this change cannot execute target-controlled code.
- Confirm it does not permit live endpoint probing.
- Confirm missing dynamic reproduction does not refute a candidate by itself.
- Confirm the design defines a safe fallback.

### Result

**PASS.**

The ADR fixes `source-only` as the initial execution policy.
A later OS-enforced sandbox contract is required before target-controlled execution.
This restriction covers build, test, browser, emulator, and fuzz execution.

The fail-safe direction is correct:

```text
safe execution unavailable
  -> do not execute
  -> retain unresolved hypothesis / validation plan
```

The alternative would be unsafe execution with ambient credentials or network access.
Silent rejection of the candidate is also not acceptable.

### Security follow-up

The future sandbox adapter requires an independent review before code execution is enabled.
It should remain separate from the source-only audit work.

## Review 4—Product / Developer Experience / Cost

### Checks

- Confirm full audit does not become the normal PR-review default.
- Confirm ordinary review latency does not change in this PR.
- Confirm expensive independent verification is risk-tiered.
- Confirm the feature can remain disabled if it provides insufficient value.

### Result

**PASS.**

PR1 is documentation-only and cannot change normal review latency.

The design preserves this boundary:

```text
river-review-security
= normal diff review

river-review-security-audit
= future explicit repository/subsystem audit
```

Final-record verification is proposed as `quick / standard / deep`.
This lets cost scale with risk instead of forcing the deepest flow on every review.

Gate integration remains delayed until paired evaluation.

## Review 5—Evaluation / False-Positive Control

### Checks

- Confirm reviewer agreement is not treated as correctness.
- Confirm candidate truth is separate from materiality.
- Confirm Cloudflare results are not treated as a transferable performance guarantee.
- Confirm Gate integration depends on River Review-specific evaluation.

### Result

**PASS.**

The design keeps `Consensus != Correctness`.
It reuses evidence-grounded validation and requires local paired evaluation before Gate integration.

The required ordering is:

```text
Truth
  -> adversarial / evidence verification

Materiality
  -> Semantic Precision

Caller action
  -> Gate
```

This avoids asking one semantic judge to decide truth, severity, and merge policy at the same time.

## Quality Fix Applied During Review

### Markdown lint: bare external URLs

The first draft used bare external URLs in `References`.
The repository enables markdownlint defaults and keeps `MD034` enabled.
The URLs were converted to Markdown links before PR creation.

No behavior or contract change was required.

## Static Consistency Checks

Verified against current `main`:

- `src/lib/reviewer-orchestrator.mjs` exists and defines the current reviewer roles
- `src/lib/verifier.mjs` remains the deterministic verifier owner
- `src/lib/finding-critic.mjs` describes itself as a deterministic #1978 skeleton and is not CLI-wired
- `src/lib/review-coverage.mjs` owns Review Coverage derivation
- `docs/development/review-coverage-contract.md` separates execution coverage from finding quality and reviewer independence
- `schemas/review-artifact.schema.json` defines `status`, `scope`, `sourceKind`, `agreement`, `consensusLevel`, and `validatedStatus`
- `river-review-security`, `adversarial-review`, `unknown-coverage-review`, and `independent-review-synthesis` exist

## Non-blocking Follow-ups

1. PR2 must keep the new audit entry skill source-only and explicit.
2. PR3 must derive semantic coverage from concrete producer and consumer needs.
3. #1978 runtime integration remains a prerequisite for claiming independent candidate verification is active.
4. Reviewer identity metadata should stay additive and minimal until #1760 settles broader identity concerns.
5. Final record verification must be measured for incremental precision versus cost.
6. Sandbox execution and Gate integration should remain separate late-stage changes.

## Final Decision

**Approved for PR creation.**

Phase 0 constrains future implementation before runtime behavior is added.
The next slice may proceed only within ADR-010's boundaries.
