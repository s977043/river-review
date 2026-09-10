# Review criteria (RA-1 positive fixture: derived severity map)

Positive fixture for RA-1 (#2058). This file carries the internal → output
severity mapping, but every row agrees with `normalizeSeverity` in
`src/lib/finding-factory.mjs` and every token appears verbatim in that SSoT, so
the ADR-009 D3-3 exclusion applies and no violation is reported.

This is the shape of `.claude/rules/review-core.md`.

## Severity vocabulary mapping

| internal | output   |
| -------- | -------- |
| blocker  | critical |
| warning  | major    |
| nit      | minor    |
