# Review criteria (RA-1 negative fixture: severity map)

Negative fixture for RA-1: this file re-declares the internal → output severity
mapping, which ADR-009 D3-2 forbids a runtime adapter file from carrying. It
names no SSoT, so the D3-3 exclusion cannot apply.

## Severity vocabulary mapping

| internal | output   |
| -------- | -------- |
| blocker  | critical |
| warning  | major    |
| nit      | minor    |

Unknown values fall back to `major`.
