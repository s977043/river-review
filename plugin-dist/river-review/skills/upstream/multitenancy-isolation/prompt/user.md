# Multitenancy Isolation Guard - User Prompt

Review the provided design document or code diff and identify multitenancy isolation issues based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Design document or code diff showing changes
- Architecture context (system descriptions, diagrams, or related documentation if available)

## Task

1. Identify if the change involves multitenancy (look for signal words: tenant, organization, workspace, etc.)

2. If multitenancy is involved, analyze for isolation issues:
   - Data isolation: tenant_id in queries, cache keys, queue messages, storage paths
   - Authorization: tenant boundary checks, token-to-resource validation
   - Resource isolation: per-tenant rate limits, resource quotas
   - Failure isolation: per-tenant circuit breakers, graceful degradation

3. For each finding:
   - Verify it is relevant to the actual diff/design (not speculative)
   - Check against false-positive guards
   - Assess confidence level

4. Provide actionable feedback with evidence

## Output Format

For each isolation finding, provide:

```text
**Finding:** [Brief description of the isolation issue]
**Evidence:** [Specific design text, code snippet, or line reference]
**Impact:** [What tenant isolation risk this creates]
**Fix:** [Concrete suggestion to address the issue]
**Severity:** [major/critical]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** flag single-tenant systems or explicitly non-multitenant code
- **DO NOT** make speculative findings about code/design outside the diff
- **DO** lower Confidence when context is insufficient
- **DO** suggest specific fixes with design recommendations or code examples
- **DO** accept isolation handled at a different layer if explicitly documented

### Example Output

```text
**Finding:** Missing tenant isolation in database query
**Evidence:** Design doc states "Query orders by order_id" without tenant_id filter
**Impact:** Tenant A could potentially access Tenant B's order data if order_id is guessed or enumerated
**Fix:** Add tenant_id to query: "Query orders by tenant_id AND order_id", or implement Row Level Security (RLS)
**Severity:** critical
**Confidence:** high
```

```text
**Finding:** Shared cache without tenant key prefix
**Evidence:** Cache key format: `user:{userId}` (line 45)
**Impact:** If user IDs collide across tenants, cached data could leak between tenants
**Fix:** Use tenant-prefixed cache key: `tenant:{tenantId}:user:{userId}`
**Severity:** major
**Confidence:** medium
```

## 評価指標（Evaluation）

- 合格基準: 指摘がテナント分離に関連し、根拠と次アクションが説明されている
- 不合格基準: マルチテナントでないシステムへの指摘、根拠のない断定、抑制条件の無視
