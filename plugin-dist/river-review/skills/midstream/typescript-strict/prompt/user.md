# TypeScript Strictness Guard - User Prompt

Review the provided code diff and identify TypeScript type safety issues based on the rules and heuristics in the system prompt.

## Input

You will receive a code diff showing TypeScript changes.

## Task

1. Analyze the diff for TypeScript strictness violations:
   - Use of `any` type on new variables or function parameters
   - Unsafe type assertions (`as any`, `as unknown as` in non-test code)
   - Missing type definitions for external data
   - Unsafe non-null assertions (`!`) on potentially undefined values

2. For each finding:
   - Verify it's relevant to the actual diff (not speculative)
   - Check against false-positive guards (test mocks, experimental code with comments)
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each type safety finding, provide:

```text
**Finding:** [Brief description of the type safety issue]
**Evidence:** [Specific code snippet or line reference from diff]
**Impact:** [What type errors could be missed at compile time]
**Fix:** [Concrete suggestion with stricter alternative]
**Severity:** [critical/major/minor]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** flag `as unknown as` in test mock setup (established Jest/Vitest pattern)
- **DO NOT** flag `any` with explicit TODO/experimental comment
- **DO NOT** make speculative findings about code outside the diff
- **DO** suggest `unknown` + type guards as alternatives to `any`

## 評価指標（Evaluation）

- ✅ 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- ❌ 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
