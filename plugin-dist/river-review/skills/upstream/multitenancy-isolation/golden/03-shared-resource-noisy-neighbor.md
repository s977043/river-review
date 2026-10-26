# Expected Output: Shared Resource Without Per-Tenant Limits

## Findings

**Finding:** Global rate limit without per-tenant isolation
**Evidence:** "Global rate limit: 10,000 requests per minute across all tenants"
**Impact:** A single tenant could exhaust the entire rate limit, causing denial of service for other tenants (noisy neighbor problem)
**Fix:** Implement per-tenant rate limits in addition to global limits, e.g., "1,000 requests per minute per tenant, 10,000 global"
**Severity:** major
**Confidence:** high

**Finding:** Shared connection pools without per-tenant quotas
**Evidence:** "Database connection pool: 100 connections shared across all tenants"
**Impact:** One tenant's heavy database usage could exhaust connections, blocking other tenants
**Fix:** Add per-tenant connection limits or implement connection pooling per tenant tier
**Severity:** major
**Confidence:** medium

**Finding:** Job queue without per-tenant fairness
**Evidence:** "Job queue processes all tenant jobs in FIFO order. No per-tenant prioritization or limits."
**Impact:** A tenant with many jobs could monopolize the queue, starving other tenants
**Fix:** Implement fair queuing (round-robin per tenant) or per-tenant job quotas
**Severity:** major
**Confidence:** medium

**Finding:** Message queue without tenant identifier
**Evidence:** Message format only contains `payload` without tenant identification
**Impact:** Cannot route, filter, or prioritize messages by tenant; cannot implement per-tenant dead letter handling
**Fix:** Add tenant_id to message format: `{"tenant_id": "...", "payload": {...}}`
**Severity:** major
**Confidence:** high
