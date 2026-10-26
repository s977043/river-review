# Altitude Generalization Guard - User Prompt

Review the provided code diff and identify per-caller special-cases (bandaids) added to shared
infrastructure, following the rules and guards in the system prompt.

## Input

You will receive:

- Code diff showing changes
- Surrounding context (existing branches in the same hunk, if available)

## Task

1. Apply the Pre-execution Gate. If it fails, output `NO_REVIEW: altitude-generalization — <理由>` and stop.
2. Analyze the diff for caller-specific special-cases on shared functions:
   - Branches keyed on a caller's identity (`options.caller === '<name>'`, caller-only flags, type checks that bypass the general path)
   - Whether two or more same-kind special-cases exist (in the diff or surrounding context)
3. For each finding:
   - Verify the flagged `file:line` is in the diff (not speculative)
   - Check against the False-positive guards (host opt-in public option, single-branch case)
   - Assess confidence

## Output Format

For each Altitude finding:

```text
**Finding:** [shared function + the per-caller special-case added]
**Evidence:** [file:line and the same-kind special-cases you counted]
**Impact:** [why growing the shared function per caller hurts maintainability]
**Fix:** [how to generalize — declarative caller-config map / strategy]
**Severity:** [info/minor/major]
**Confidence:** [high/medium/low]
```

If there is no qualifying finding, output `NO_ISSUES`.

### Important Notes

- **DO NOT** flag a branch keyed on a first-class public option any caller may set (host opt-in)
- **DO NOT** propose generalization from a single special-case with no same-kind siblings
- **DO NOT** flag correctness bugs or security issues (out of scope)
- **DO** name each same-kind special-case you counted as evidence
- **DO** lower Confidence when the "two or more" evidence is weak

## 評価指標（Evaluation）

- 合格基準: 指摘が差分の caller special-case に紐づき、同種2つ以上の根拠と一般化案が説明されている
- 不合格基準: 差分と無関係な指摘、単発分岐への一般化強要、host opt-in の誤検出
