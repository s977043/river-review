# Review criteria (RA-1 negative fixture: reversed severity map)

Negative fixture for RA-1 (#2058). The table below carries the same six tokens
as the SSoT, and names the SSoT, but two rows point the other way:
`blocker` is mapped to `minor` and `nit` to `critical`. Vocabulary presence
alone used to excuse this, so the reversal passed RA-1 silently.

Severity SSoT: `src/lib/finding-factory.mjs`

## Severity vocabulary mapping

| internal | output   |
| -------- | -------- |
| blocker  | minor    |
| warning  | major    |
| nit      | critical |
