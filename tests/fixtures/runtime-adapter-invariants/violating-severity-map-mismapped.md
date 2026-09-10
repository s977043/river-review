# Review criteria (RA-1 negative fixture: mis-mapped severity map)

Negative fixture for RA-1 (#2058). Every one of the six tokens
(`blocker` `warning` `nit` `critical` `major` `minor`) is present, and the SSoT
is named, but the correspondence is wrong: `blocker` is demoted to `major` and
`warning` to `minor`. This is the drift a whole-word vocabulary check cannot
see.

Severity SSoT: `src/lib/finding-factory.mjs`

## Severity vocabulary mapping

| internal | output   |
| -------- | -------- |
| blocker  | major    |
| warning  | minor    |
| nit      | critical |
