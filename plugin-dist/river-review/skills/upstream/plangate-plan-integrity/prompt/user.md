# PlanGate 計画整合性チェック - User Prompt

Review the provided PlanGate planning artifacts and identify integrity gaps between `pbi-input`, `plan`, `todo`, and `test-cases`.

## Input

You will receive a single markdown document containing one or more planning artifacts (each in its own fenced block labelled with the artifact ID).

```text
{{diff}}
```

## Task

1. Evaluate the Pre-execution Gate. If required artifacts are missing, output the `NO_REVIEW` line and stop.
2. Cross-check the four rule areas (PBI↔plan / plan↔todo / 受け入れ条件↔test-cases / 未決事項の明示).
3. Apply False-positive guards before emitting a finding.
4. Emit a summary line followed by up to 8 findings in `<file>:<line>: [severity=...] <message>. Fix: ...` form.
5. If no integrity gaps remain, output `NO_ISSUES` after the summary.
