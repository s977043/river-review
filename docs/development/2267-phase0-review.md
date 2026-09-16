# #2267 Phase 0 Review — Security Audit Harness Integration

## Scope

Reviewed changes:

- `docs/adr/010-security-audit-harness-integration.md`
- `docs/development/2267-phase0-gap-analysis.md`

Base: `main` at `bc84de6f76ae00d8d37895d083f797c91f606b40`.

This review intentionally evaluates the Phase 0 boundary documents only. No runtime security-audit implementation exists in this slice.

## Overall Verdict

**GO for PR1.**

No blocking issue was found after the fixes described below.

The proposed direction is acceptable because it adds no runtime behavior and explicitly prevents the highest-risk integration mistakes: duplicate orchestration, coverage semantic collision, premature status vocabulary growth, unsandboxed target execution, and early Gate coupling.

## Review 1 — Architecture / Responsibility Boundaries

### Checks

- Does #2267 create a second review framework?
- Does it duplicate #1978 candidate verification?
- Does it overload #2212 Review Coverage?
- Does it preserve #1857 Semantic Precision as a downstream concern?
- Is #1574 capability evolution kept separate from target audit state?

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

The new work is limited to integration gaps, primarily semantic security coverage, explicit full-audit entry, independence provenance, final-record verification, and target-audit carry-forward.

### Architecture risk retained for follow-up

`SecurityAuditCoverage` is currently a concept, not an approved schema. PR3 must prove the minimum contract instead of starting from a large generalized schema.

## Review 2 — Contract / Schema Compatibility

### Checks

- Does this PR modify existing schemas?
- Does it add an enum that collides with `validatedStatus`, `status`, `scope`, `disposition`, or #1978 state?
- Does it change the meaning of Review Coverage?
- Is Cloudflare terminology copied as canonical River Review vocabulary?

### Result

**PASS after clarification.**

The documents explicitly make Phase 0 schema-neutral.

The proposed `established / unresolved / refuted` vocabulary is described only as a candidate if a real producer/consumer gap remains. It is not approved as a schema field in ADR-010.

This is important because existing fields already cover several different axes:

- severity
- confidence
- lifecycle status
- diff scope
- synthesis validated status
- #1978 final validation state
- semantic disposition
- ask relevance

Adding another enum before a concrete integration point would be premature.

## Review 3 — Security / Execution Safety

### Checks

- Can this change cause target-controlled code to execute?
- Does it permit live endpoint probing?
- Does it treat inability to reproduce dynamically as evidence that a candidate is false?
- Does it establish a safe fallback?

### Result

**PASS.**

The ADR fixes `source-only` as the initial execution policy and requires a later OS-enforced sandbox contract before target-controlled build/test/browser/fuzz execution.

The fail-safe direction is correct:

```text
safe execution unavailable
  -> do not execute
  -> retain unresolved hypothesis / validation plan
```

rather than executing with ambient credentials/network or silently rejecting the candidate.

### Security follow-up

The future sandbox adapter must be reviewed independently before any code-execution capability is enabled. It should remain a separate issue/PR from source-only audit functionality.

## Review 4 — Product / Developer Experience / Cost

### Checks

- Does full audit become the normal PR-review default?
- Will ordinary review latency change in this PR?
- Is expensive independent verification risk-tiered?
- Is there an explicit path to stop if the feature provides insufficient value?

### Result

**PASS.**

PR1 is documentation-only and cannot change normal review latency.

The design preserves:

```text
river-review-security
= normal diff review

river-review-security-audit
= future explicit repository/subsystem audit
```

Final-record verification is proposed as `quick / standard / deep`, allowing cost to scale with risk instead of forcing the deepest flow on all reviews.

Gate integration is intentionally delayed until paired evaluation.

## Review 5 — Evaluation / False-Positive Control

### Checks

- Is reviewer agreement used as correctness?
- Is candidate truth separated from materiality?
- Is the Cloudflare result treated as a transferable performance guarantee?
- Is Gate integration conditioned on River Review-specific evaluation?

### Result

**PASS.**

The design keeps `Consensus != Correctness`, reuses evidence-grounded validation, and requires local paired evaluation before Gate integration.

The required ordering is sound:

```text
Is it true?
  -> adversarial / evidence verification

Is it material?
  -> Semantic Precision

What should the caller do?
  -> Gate
```

This prevents a single semantic judge from simultaneously deciding truth, severity, and merge policy.

## Quality Fix Applied During Review

### Markdown lint: bare external URLs

The first draft used bare external URLs in `References`. The repository enables markdownlint defaults and does not disable `MD034`, so those URLs were converted to Markdown links before PR creation.

No behavior or contract change was required.

## Static Consistency Checks

Verified against current `main`:

- `src/lib/reviewer-orchestrator.mjs` exists and defines the current reviewer roles
- `src/lib/verifier.mjs` remains the deterministic verifier owner
- `src/lib/finding-critic.mjs` explicitly describes itself as a deterministic #1978 skeleton and is not CLI-wired
- `src/lib/review-coverage.mjs` owns Review Coverage derivation
- `docs/development/review-coverage-contract.md` explicitly separates execution coverage from finding quality and reviewer independence
- `schemas/review-artifact.schema.json` already defines `status`, `scope`, `sourceKind`, `agreement`, `consensusLevel`, and `validatedStatus`
- `river-review-security`, `adversarial-review`, `unknown-coverage-review`, and `independent-review-synthesis` exist

## Non-blocking Follow-ups

1. PR2 must keep the new audit entry skill source-only and explicit.
2. PR3 must design semantic coverage from concrete producer/consumer needs, not from a generic coverage ontology.
3. #1978 runtime integration remains a prerequisite for claiming independent candidate verification is active.
4. Reviewer identity metadata should stay additive and minimal until #1760 settles broader identity/signing concerns.
5. Final record verification must be measured for incremental precision versus cost.
6. Sandbox execution and Gate integration should remain separate late-stage changes.

## Final Decision

**Approved for PR creation.**

Phase 0 correctly constrains future implementation before adding runtime behavior. The next slice may proceed only within ADR-010's boundaries.
