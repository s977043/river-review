# Self-Review Checklist

Moved from `AGENTS.md` to keep the always-loaded agent instructions short.

Apply before handoff. Derived from retrospectives where defects shipped and were caught only by multi-perspective review (see `docs/development/retrospectives/2026-05-21-25.md`).

## Codify-then-validate (when adding a rule or convention)

Before merging a new rule (Stop conditions, severity policy, naming convention, etc.), answer:

1. What 3 concrete scenarios would make this rule fail or be misapplied?
2. What is the reopen / exception condition? (e.g. for a Stop rule: how does it lift?)
3. What is the soft-violation gray zone? (e.g. "status report during Stop"—is it allowed?)

If any answer is "I don't know," defer the rule until the gap is filled. Codify-without-validate produced a same-session defect in #898 → #902.

## Code-gen review (when writing a workflow / script / automation)

Before merging GitHub Actions workflows, shell scripts, or any CI automation, verify:

1. Concurrency: can two simultaneous invocations race on shared state (refs, locks, deploys)? Add a `concurrency:` group if yes.
2. Default coupling: do hard-coded defaults (branch names, package names, paths) silently break when an upstream config changes? Prefer auto-detection or fail-loud over silent fallback.
3. Failure mode: what happens on partial failure (network error mid-PATCH, exit code 0 but nothing changed)? Is the error surfaced or swallowed?

These were the convergent gaps in `.github/workflows/release-please-kick.yml` and `scripts/release-please-kick.sh` at first delivery, fixed in #902.
