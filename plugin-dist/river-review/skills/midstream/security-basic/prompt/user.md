# Baseline Security Checks - User Prompt

Review the provided code diff and identify security vulnerabilities based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Code diff showing changes
- File context (file paths and surrounding code if available)

## Task

1. Analyze the diff for common security risks:
   - SQL/Command Injection vulnerabilities
   - Cross-Site Scripting (XSS) vulnerabilities
   - Hardcoded secrets or credentials
   - Missing input validation
   - Authentication/authorization issues
   - Error handling that leaks information

2. For each finding:
   - Verify it's relevant to the actual diff (not speculative)
   - Check against false-positive guards
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each security finding, provide:

```text
**Finding:** [Brief description of the security issue]
**Evidence:** [Specific code snippet or line reference from diff]
**Impact:** [What could happen if exploited]
**Fix:** [Concrete suggestion to address the issue]
**Severity:** [critical/major/minor]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** reproduce secret values in the Evidence field - use `[REDACTED]` or mask them
- **DO NOT** flag test files or fixtures unless genuinely concerning
- **DO NOT** make speculative findings about code outside the diff
- **DO** lower Confidence when context is insufficient
- **DO** suggest specific fixes with code examples when possible

### Example Output

```text
**Finding:** SQL injection vulnerability in user lookup query
**Evidence:** Line 42: `db.query(\`SELECT * FROM users WHERE id = ${userId}\`)`
**Impact:** Attacker could execute arbitrary SQL commands by manipulating userId parameter
**Fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
**Severity:** major
**Confidence:** high
```

## 評価指標（Evaluation）

- ✅ 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- ❌ 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
