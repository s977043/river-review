# 🌊 River Review Feature

## Summary

- What new capability is being added, and why does it matter?
- Primary phase focus: Upstream / Midstream / Downstream

## Flow Consistency

- [ ] Upstream: design/requirements updated and linked
- [ ] Midstream: implementation honors the agreed flow
- [ ] Downstream: tests/QA and roll-out checks are defined
- [ ] Schema Validation passed? (`schemas/skill.schema.json`)
- [ ] Skill file structure validated? (`skills/*` follows schema and naming)

## Reviewer Decision Brief

Keep answers short and link the canonical Issue / Plan / ADR or test evidence instead of copying it. For a low-risk change, `N/A` with a reason is acceptable; unknowns must remain explicit.

1. **Hard-to-reverse decisions:** Does this change affect a data model, public interface, dependency, or production behavior that would be difficult to undo? What is the rollback or mitigation path? (`N/A` + reason if none.)
2. **Assumptions and failure paths:** Which invariants or assumptions must hold, where can the change fail, and what negative/boundary tests or observations support them? Mark missing evidence as `unknown`, not `pass`.
3. **Reviewer's first challenge:** Which specific changed area or design choice should the reviewer question first, and why? Link a file, decision, or evidence location; use `N/A` + reason if no material concern is identified.

This brief only helps focus the review. It does not prove independent verification, completed tests, or human approval, and it does not replace existing merge gates.

## Changes

- Feature highlights
- Skills or runner areas touched
- Data/schema updates that reviewers should be aware of

## Validation & Evidence

Commands/logs that prove the feature is river-safe.

```bash
# e.g.
npm run agents:validate
npm test
```

## Related Issues

- Closes #
- Related #

## Rollout Notes

- Migration/backfill considerations
- Monitoring or follow-up tasks
