# Cache Strategy Consistency Guard - User Prompt

Review the provided design document diff and identify cache strategy issues based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Design document diff showing changes
- Document context (file paths and surrounding content if available)

## Task

1. Analyze the diff for cache strategy issues:
   - Undefined cache layers (CDN/Redis/in-memory/DB query cache)
   - Missing or inconsistent consistency strategies
   - Undefined or inadequate invalidation strategies
   - Missing or mismatched TTL definitions
   - Undefined failure handling behavior

2. For each finding:
   - Verify it is relevant to the actual diff (not speculative)
   - Check against false-positive guards
   - Assess confidence level

3. Provide actionable feedback with evidence

## Output Format

For each cache strategy finding, provide:

```text
**Finding:** [Brief description of the cache strategy issue]
**Evidence:** [Specific document excerpt or section reference from diff]
**Impact:** [What problems this could cause - data inconsistency, outage impact, operational difficulty]
**Fix:** [Concrete suggestion to address the issue]
**Severity:** [minor/major]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** flag documents that explicitly state "no caching required"
- **DO NOT** make speculative findings about content outside the diff
- **DO NOT** require all details in early-stage design documents if marked as "TBD"
- **DO** lower Confidence when context is insufficient
- **DO** suggest specific documentation additions when possible
- **DO** accept references to existing cache strategies if clearly identified

### Example Output

```text
**Finding:** Cache layer undefined - unclear whether Redis, CDN, or in-memory cache
**Evidence:** Section 3.2: "We will cache user profiles for performance"
**Impact:** Implementation team may choose inconsistent caching layers, leading to operational complexity
**Fix:** Specify: "User profiles cached in Redis (TTL: 5min), no CDN caching due to personalization"
**Severity:** minor
**Confidence:** high
```

```text
**Finding:** TTL contradicts business requirement
**Evidence:** Section 4.1 states "prices must reflect within 1 minute" but Section 5.2 sets "Redis TTL: 10 minutes"
**Impact:** Customers may see stale prices for up to 10 minutes, violating the 1-minute SLA
**Fix:** Either reduce TTL to <1min or add event-driven invalidation on price updates
**Severity:** major
**Confidence:** high
```

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視
