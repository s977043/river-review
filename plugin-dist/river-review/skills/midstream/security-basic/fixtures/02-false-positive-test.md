# Test Case: False Positive Avoidance (Test File)

## Description

This test verifies that the skill does not flag test data as security vulnerabilities.

## Input Diff

```diff
diff --git a/tests/auth.test.ts b/tests/auth.test.ts
index 1234567..89abcdef 100644
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -5,7 +5,8 @@ describe('Authentication', () => {
   it('should authenticate user with valid credentials', async () => {
     const testUser = {
       email: 'test@example.com',
-      password: 'password123'
+      password: 'test-password-123',
+      apiKey: 'test-api-key-mock-value'
     };

     const response = await request(app)
```

## Expected Behavior

The skill should:

1. Recognize this is a test file (path contains `/tests/`)
2. NOT flag `password` or `apiKey` as hardcoded secrets
3. Either return no findings or explicitly note low confidence due to test context
4. NOT provide false positive warnings
