# Test Case: Well-Defined Cache Strategy (False Positive Test)

This test case should NOT trigger any findings.

## Input Diff

```diff
diff --git a/docs/architecture/product-service.md b/docs/architecture/product-service.md
index 1111111..2222222 100644
--- a/docs/architecture/product-service.md
+++ b/docs/architecture/product-service.md
@@ -30,0 +31,37 @@
+## Caching Architecture
+
+### Cache Layers
+
+| Layer | Technology | TTL | Purpose |
+|-------|------------|-----|---------|
+| CDN | CloudFront | 5 min | Static product images and descriptions |
+| Application | Redis Cluster | 2 min | Product catalog and pricing |
+| Database | PostgreSQL query cache | 30 sec | Frequently accessed queries |
+
+### Consistency Strategy
+
+We adopt a Cache-Aside pattern with event-driven invalidation:
+
+1. **Read path**: Check Redis first, fallback to DB on miss, populate cache
+2. **Write path**: Update DB, then publish invalidation event to Redis pub/sub
+3. **Eventual consistency**: Maximum staleness is 2 minutes (Redis TTL)
+
+### Invalidation Strategy
+
+- **Event-driven**: Product update events trigger immediate cache invalidation
+- **TTL fallback**: If event is lost, cache expires within 2 minutes
+- **Manual purge**: Admin dashboard provides emergency cache purge capability
+
+### Failure Handling
+
+| Failure Scenario | Behavior | SLA Impact |
+|------------------|----------|------------|
+| Redis unavailable | Fallback to DB direct query | Response time +200ms |
+| CDN origin failure | Serve stale content (stale-while-revalidate) | None for cached content |
+| DB connection pool exhausted | Return cached data if available, 503 otherwise | Degraded for uncached |
+
+### Monitoring
+
+- Cache hit rate alert: < 80% triggers investigation
+- Redis latency alert: p99 > 10ms triggers alert
+- Invalidation lag: Event to cache clear > 100ms triggers warning
```

## Expected Behavior

The skill should recognize this as a well-defined cache strategy:

- All cache layers are explicitly defined with technology choices
- TTLs are specified for each layer
- Consistency strategy (Cache-Aside with event-driven invalidation) is clearly documented
- Invalidation strategy covers multiple scenarios (event, TTL, manual)
- Failure handling is defined with SLA impacts
- Monitoring is included
