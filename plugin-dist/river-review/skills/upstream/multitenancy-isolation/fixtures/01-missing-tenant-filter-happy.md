# Test Case: Missing Tenant Filter (Happy Path)

This test case should trigger a finding for missing tenant isolation in database queries.

## Input Diff

````diff
diff --git a/docs/design/order-service.md b/docs/design/order-service.md
index 1111111..2222222 100644
--- a/docs/design/order-service.md
+++ b/docs/design/order-service.md
@@ -10,0 +11,25 @@
+## Order Service Design
+
+### Overview
+
+This service handles order management for our multi-tenant SaaS platform.
+Each tenant (organization) can manage their own orders.
+
+### Database Schema
+
+- `orders` table with columns: id, user_id, product_id, amount, created_at
+
+### API Endpoints
+
+#### GET /orders/:orderId
+
+Retrieves an order by its ID.
+
+```sql
+SELECT * FROM orders WHERE id = :orderId
+```
+
+### Caching Strategy
+
+Cache key format: `order:{orderId}`
+TTL: 5 minutes
````

## Expected Behavior

The skill should detect:

1. Missing tenant_id in the database query - allows cross-tenant data access
2. Missing tenant prefix in cache key - could cause data leakage between tenants
