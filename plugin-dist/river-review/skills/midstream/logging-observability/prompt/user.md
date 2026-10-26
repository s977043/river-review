# Logging and Observability Guard - User Prompt

Review the provided code diff and identify logging and observability issues based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Code diff showing changes
- File context (file paths and surrounding code if available)

## Task

1. Analyze the diff for observability issues:
   - Silent exception handling (empty catch blocks, swallowed errors)
   - Missing logging context (no requestId, no input summary)
   - Missing observability points (retry, fallback, cache without metrics)
   - Contextless log messages

2. For each finding:
   - Verify it is relevant to the actual diff (not speculative)
   - Check against false-positive guards
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each observability finding, provide:

```text
**Finding:** [Brief description of the observability issue]
**Evidence:** [Specific code snippet or line reference from diff]
**Impact:** [What debugging problem this could cause]
**Fix:** [Concrete suggestion to address the issue]
**Severity:** [minor/major]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** flag test files unless genuinely concerning
- **DO NOT** make speculative findings about code outside the diff
- **DO NOT** recommend adding PII to logs
- **DO** lower Confidence when context is insufficient
- **DO** suggest specific fixes with code examples when possible
- **DO** accept intentional exception ignoring if commented with reason

### Example Output

```text
**Finding:** Silent exception handling - error is swallowed without logging
**Evidence:** Line 25: `catch (error) { return null; }`
**Impact:** Failures will be invisible, making debugging production issues impossible
**Fix:** Add logging with context: `catch (error) { logger.error('Operation failed', { requestId, error }); throw error; }`
**Severity:** minor
**Confidence:** high
```

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
