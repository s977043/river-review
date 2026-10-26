# Expected Output: Missing Tenant Filter

## Findings

**Finding:** Missing tenant isolation in database query
**Evidence:** SQL query `SELECT * FROM orders WHERE id = :orderId` does not include tenant_id filter
**Impact:** Tenant A could access Tenant B's order data if order_id is guessed or enumerated (IDOR vulnerability)
**Fix:** Add tenant_id to query: `SELECT * FROM orders WHERE tenant_id = :tenantId AND id = :orderId`, or implement Row Level Security (RLS)
**Severity:** critical
**Confidence:** high

**Finding:** Shared cache without tenant key prefix
**Evidence:** Cache key format: `order:{orderId}` does not include tenant identifier
**Impact:** If order IDs collide or are reused across tenants, cached data could leak between tenants
**Fix:** Use tenant-prefixed cache key: `tenant:{tenantId}:order:{orderId}`
**Severity:** major
**Confidence:** high
