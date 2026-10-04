---
title: Starter Cookbook
---

# Starter Cookbook — start from existing review knowledge

You do not need to author custom Skills on day one. Start with bundled specialist review skills and existing repo-owned Skills, then **add only the judgment that real usage proves is missing**.

> Each Skill has its own `applyTo`, phase, and routing conditions. The Skills listed below do not all run on every change. Selecting only relevant lenses is part of River Review's noise-control strategy.

## Recipe 1: Security / Guardrails

Claude Code:

```text
/river-review:river-review-security
```

Representative existing Skills:

- `security-basic` — common security vulnerabilities
- `secret-credential-scan` — API keys, tokens, and credentials
- `trust-boundaries-authz` — authentication, authorization, and trust-boundary design
- `nextjs-server-action-security` — Next.js Server Action security boundaries
- `gha-workflow-security` — downstream GitHub Actions security

**Use when** a change touches auth, external input, secrets, CI/CD, or permissions.

## Recipe 2: Architecture / Maintainability

Claude Code:

```text
/river-review:river-review-architecture
```

Representative existing Skills:

- `architecture-boundaries` — layers, boundaries, and dependency direction
- `api-design` — API design
- `external-dependencies` — adoption of external dependencies
- `migration-rollout-rollback` — migration, rollout, and rollback
- `existing-pattern-conformance` — conformance with established repository patterns

**Use when** a change introduces dependencies, boundary changes, API changes, migrations, or large refactors.

## Recipe 3: Performance

Claude Code:

```text
/river-review:river-review-performance
```

Representative existing Skills:

- `modern-web-performance` — web frontend performance
- `laravel-eloquent-nplus1` — Laravel / Eloquent N+1
- `cache-strategy-consistency` — cache-strategy consistency
- `capacity-cost-design` — capacity and cost in design review

**Use when** a change touches database queries, rendering, cache, hot paths, or scale-sensitive code.

## Recipe 4: Testing / Reliability

Claude Code:

```text
/river-review:river-review-testing
```

Representative existing Skills:

- `coverage-gap` — missing critical-path and failure-path tests
- `test-assertion-effectiveness` — whether assertions verify meaningful behavior
- `flaky-test` — flaky test structure
- `logging-observability` — operational signals for failures
- `failure-modes-observability` — failure modes and observability at design time

**Use when** a change adds branches, error handling, retries / fallbacks, or modifies critical flows.

## Recipe 5: When in doubt, review the current diff

```text
/river-review:review-local
```

Start with the general local review, then add Security / Architecture / Performance / Testing specialist review skills based on what the change actually touches.

## Team-specific rules do not need to become Skills immediately

Start lightweight rules in `.river/rules.md`.

```markdown
# Project review rules

- Writes spanning multiple repositories / aggregates must declare a transaction boundary.
- A caught exception must be logged, rethrown, or carry an explicit reason for intentional suppression.
- New external dependencies must document why existing dependencies cannot satisfy the need.
```

Promote a rule to a custom Skill only when it recurs often enough that you want to test its **inputs, expected findings, and false-positive conditions**.

## When promoting a rule to a Skill

1. Create a minimal Skill with [Creating your first Skill](../tutorials/creating-your-first-skill.en.md).
2. Keep `applyTo` and phase narrow to avoid unnecessary execution.
3. Pin "must detect" and "must not report" behavior with fixture + golden output.
4. Compare changes through regression evals.
5. Use suppression and Run store data to tune false positives in real usage.

See [Representative Skills](./representative-skills.en.md) for real fixtures and expected outputs. Browse all available Skills in the [Skills Catalog](../reference/skills-catalog.md).

## Metrics to inspect after adoption

Measure whether review judgment improved, not merely whether the tool was installed.

- New / resolved / recurring findings: [Run store and regression comparison](./track-runs-and-regressions.en.md)
- Suppression trends: Run store / suppression analytics
- False positives: fixture / guard cases / per-skill eval
- Execution cost: [Cost estimation and optimization](./cost-estimation.en.md)
- Overall trends: [Dashboard](../dashboard.md)

Use those results to decide whether a Skill should be expanded, narrowed, or retired.
