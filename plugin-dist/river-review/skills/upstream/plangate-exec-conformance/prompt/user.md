# PlanGate Exec Conformance Guard - User Prompt

Check whether the implementation `diff` conforms to the PlanGate `plan` / `todo` / `test-cases` artifacts.

## Input

You will receive a single markdown document containing the `diff` and the relevant planning artifacts (each in its own fenced block).

```text
{{diff}}
```

## Task

1. Evaluate the Pre-execution Gate. If `diff` is empty or required artifacts do not resolve, output the `NO_REVIEW` line and stop.
2. Apply False-positive guards before emitting a finding (explicit out-of-scope / completed todo / generated diff / 記録のみ test-cases).
3. Check the four rules (方針整合 / todo 網羅 / テスト整合 / 変更の局在性).
4. Emit a summary line `(summary):1: 方針整合 N / todo 網羅 N / テスト整合 N / 質問 N`, followed by findings with Evidence (`diff: <file>:<line>` + `plan|todo|test-cases: <見出しまたは行>`) and Fix.
5. Use `[q]` questions for ambiguous cases. If no conformance gaps remain, output `NO_ISSUES`.
