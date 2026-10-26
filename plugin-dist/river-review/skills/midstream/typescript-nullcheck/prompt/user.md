# TypeScript Null Safety Guardrails - User Prompt

Review the provided code diff and identify null/undefined safety issues based on the rules and heuristics in the system prompt.

## Input

You will receive a code diff showing TypeScript changes.

## Task

1. Analyze the diff for null/undefined safety risks:
   - Non-null assertions (`!`) on values that could be null/undefined
   - Unsafe access to API response fields without null checks
   - Missing optional chaining or null guards for external inputs
   - Unhandled union type cases

2. For each finding:
   - Verify it's relevant to the actual diff (not speculative)
   - Check against false-positive guards (type guards, `asserts`, test context)
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each null safety finding, provide:

```text
**Finding:** [Brief description of the null safety issue]
**Evidence:** [Specific code snippet or line reference from diff]
**Impact:** [What runtime error could occur]
**Fix:** [Concrete suggestion with safer alternative]
**Severity:** [critical/major/minor]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** flag code where the type system already excludes null/undefined
- **DO NOT** flag `asserts`-based type guards as unsafe
- **DO NOT** make speculative findings about code outside the diff
- **DO** suggest optional chaining (`?.`) or early return guards as alternatives to `!`

## 評価指標（Evaluation）

- ✅ 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- ❌ 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
