# Secret / Credential Scan - User Prompt

Scan the implementation `diff` for secrets / credentials newly added on added lines.

## Input

You will receive a single markdown document containing the `diff` (in a fenced block).

```text
{{diff}}
```

## Task

1. Evaluate the Pre-execution Gate. If no secret candidate exists on added lines, or `diff` is empty, output the `NO_REVIEW` line and stop.
2. Apply False-positive guards before emitting a finding (placeholders / example values / env-var references / context-only lines / lockfile integrity & SRI digests / hashes & UUIDs).
3. Extract secret candidates from **added** lines, judge whether each is a realistic real value, and report at `<file>:<line>` with 種別 / 混入 (value masked) / 影響 / Fix.
4. Emit a summary line `(secret-scan):1: [要約] ...`, then up to 5 findings, highest-impact first. Always recommend a CI secret scanner (gitleaks 等) in Fix.
5. If candidates exist but all are placeholders / examples / env references (no real secret), output `NO_ISSUES`. Never re-print the secret value.
