# Test Case: Test Mock with Type Assertion (False Positive Guard)

## Description

This test verifies that the skill does NOT flag `as unknown as` used in test files for creating mocks, which is an established TypeScript testing pattern.

## Input Diff

```diff
diff --git a/tests/user-service.test.ts b/tests/user-service.test.ts
index 1234567..89abcdef 100644
--- a/tests/user-service.test.ts
+++ b/tests/user-service.test.ts
@@ -8,6 +8,10 @@ describe('UserService', () => {
   let mockRepo: UserRepository;

   beforeEach(() => {
+    mockRepo = {
+      findById: jest.fn().mockResolvedValue({ id: '1', name: 'Alice' }),
+      save: jest.fn(),
+    } as unknown as UserRepository;
   });

   it('should return user by id', async () => {
```

## Expected Behavior

The skill should:

1. Recognize this is a test file (path contains `/tests/`)
2. NOT flag `as unknown as UserRepository` in a mock setup as a type safety violation
3. Either return no findings or explicitly acknowledge the mock context
4. NOT produce false positive warnings about `any` or type assertions in test mocks
