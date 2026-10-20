# 🌊 River Review Bugfix

## Summary

- What was broken and how was it detected?
- Primary phase focus: Upstream / Midstream / Downstream

## Flow Consistency

- [ ] Upstream: requirements/design clarified to prevent recurrence
- [ ] Midstream: implementation fixes root cause without side effects
- [ ] Downstream: regression tests/QA steps added or updated
- [ ] Schema Validation passed? (`schemas/skill.schema.json`)
- [ ] Skill file structure validated? (`skills/*` follows schema and naming)

## Root Cause & Fix

- Root cause in one or two sentences
- Fix approach and why it's safe

## Reviewer Decision Brief

Keep answers short and link to the Issue / Plan / ADR or evidence where available. A small, easily reversible fix may use `N/A` with a reason. Do not present missing evidence as a passed check.

1. **Hard-to-reverse decisions:** Does the fix change a data contract, migration, dependency, or production behavior that is hard to undo? Explain rollback or mitigation, or `N/A` + reason.
2. **Assumptions and failure paths:** What root-cause assumptions, invariants, or boundary cases might make this fix incomplete? Link the regression/negative tests, or explicitly write `unknown` where evidence is missing.
3. **Reviewer's first challenge:** Which line, behavior, or unverified edge case is most important for the reviewer to challenge? Link the relevant diff or evidence, or `N/A` + reason.

This is review context only: neither AI-authored text nor a green template check is proof of independent verification or permission to merge.

## Repro & Validation

- Steps to reproduce (before)
- Proof of fix (after) with commands/logs

```bash
# e.g.
npm run agents:validate
npm test -- <scope>
```

## Related Issues

- Closes #
- Related #

## Rollout Notes

- Risk level and mitigation
- Monitoring or follow-up tasks
