# Type-Driven Design Guard - User Prompt

Review the provided code diff and identify type-driven design issues based on the rules and heuristics in the system prompt.

## Input

You will receive a code diff showing TypeScript changes.

## Task

1. Analyze the diff for domain-modeling weaknesses:
   - Domain concepts typed as bare `string` / `number` (primitive obsession)
   - Adjacent same-type primitive parameters that can be transposed
   - State modeled as `status: string` or boolean flag combinations instead of discriminated unions
   - Inline literal unions repeated across the diff

2. For each finding:
   - Verify it's grounded in the actual diff (not speculative)
   - Check against false-positive guards (external API boundary types, context-free utilities, existing branded types)
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each finding, provide:

```text
**Finding:** [Brief description of the modeling issue]
**Evidence:** [Specific code snippet or line reference from diff]
**Impact:** [Which illegal states or mix-ups the compiler cannot catch]
**Fix:** [Concrete branded type / discriminated union suggestion]
**Severity:** [critical/major/minor]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** demand branded types for external API response shapes (boundary code follows the upstream contract)
- **DO NOT** flag single-parameter utilities with no domain context
- **DO NOT** make speculative findings about code outside the diff
- **DO** show a concrete type definition in every Fix

## 評価指標（Evaluation）

- ✅ 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- ❌ 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
