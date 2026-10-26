# Test Case: Proper Tenant Isolation (False Positive Test)

This test case should NOT trigger any findings.

## Input Diff

````diff
diff --git a/docs/design/user-service.md b/docs/design/user-service.md
index 1111111..2222222 100644
--- a/docs/design/user-service.md
+++ b/docs/design/user-service.md
@@ -10,0 +11,35 @@
+## User Service Design
+
+### Overview
+
+This service handles user management for our multi-tenant platform.
+Each organization (tenant) manages their own users.
+
+### Tenant Isolation Strategy
+
+All data access includes tenant_id validation:
+- Database: Row Level Security (RLS) enabled
+- Cache: Tenant-prefixed keys
+- API: JWT contains tenant_id, validated on every request
+
+### Database Schema
+
+- `users` table with columns: id, tenant_id, email, name, created_at
+- RLS policy: `tenant_id = current_setting('app.tenant_id')`
+
+### API Endpoints
+
+#### GET /users/:userId
+
+Retrieves a user. Tenant boundary is enforced via RLS.
+
+```sql
+SELECT * FROM users WHERE tenant_id = :tenantId AND id = :userId
+```
+
+### Caching Strategy
+
+Cache key format: `tenant:{tenantId}:user:{userId}`
+TTL: 10 minutes
+
+Tenant ID is extracted from JWT and used as cache key prefix.
````

## Expected Behavior

The skill should recognize this as proper tenant isolation:

- Database query includes tenant_id filter
- RLS is mentioned as additional protection
- Cache key includes tenant prefix
- JWT validation is documented
