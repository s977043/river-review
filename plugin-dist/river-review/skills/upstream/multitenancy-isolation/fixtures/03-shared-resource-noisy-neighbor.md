# Test Case: Shared Resource Without Per-Tenant Limits

This test case should trigger a finding for noisy neighbor risk.

## Input Diff

````diff
diff --git a/docs/design/api-gateway.md b/docs/design/api-gateway.md
index 1111111..2222222 100644
--- a/docs/design/api-gateway.md
+++ b/docs/design/api-gateway.md
@@ -10,0 +11,30 @@
+## API Gateway Design
+
+### Overview
+
+Central API gateway for our multi-tenant SaaS platform.
+All tenant API requests are routed through this gateway.
+
+### Rate Limiting
+
+Global rate limit: 10,000 requests per minute across all tenants.
+
+### Connection Pool
+
+- Database connection pool: 100 connections shared across all tenants
+- Redis connection pool: 50 connections shared
+
+### Background Jobs
+
+Job queue processes all tenant jobs in FIFO order.
+No per-tenant prioritization or limits.
+
+### Message Queue
+
+Single SQS queue for all tenants.
+Message format:
+```json
+{
+  "payload": {...}
+}
+```
````

## Expected Behavior

The skill should detect:

1. Global rate limit without per-tenant limits - noisy neighbor risk
2. Shared connection pools without per-tenant quotas
3. Job queue without per-tenant fairness
4. Message queue without tenant identifier in message format
