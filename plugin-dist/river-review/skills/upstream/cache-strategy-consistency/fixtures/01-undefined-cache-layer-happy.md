# Test Case: Undefined Cache Layer (Happy Path)

This test case should trigger a finding for undefined cache layer.

## Input Diff

```diff
diff --git a/docs/architecture/user-service.md b/docs/architecture/user-service.md
index 1111111..2222222 100644
--- a/docs/architecture/user-service.md
+++ b/docs/architecture/user-service.md
@@ -20,0 +21,14 @@
+## Performance Optimization
+
+### Caching Strategy
+
+To improve response times, we will implement caching for user profiles.
+
+The cache will store:
+- User basic information (name, email, avatar)
+- User preferences
+- Recent activity summary
+
+Cache will be invalidated when user data is updated.
+
+Expected performance improvement: 80% reduction in database queries.
```

## Expected Behavior

The skill should detect multiple issues:

1. Cache layer is undefined (Redis? CDN? In-memory?)
2. TTL is not specified
3. Invalidation strategy is vague ("when user data is updated" - how? event? TTL?)
4. Failure handling is not defined
