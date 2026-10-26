# Test Case: Primitive Obsession in Domain Signatures (Happy Path)

## Description

This test verifies that the skill detects domain concepts left as bare primitives — adjacent `string` parameters that can be transposed silently, and state modeled as a string instead of a discriminated union.

## Input Diff

```diff
diff --git a/src/billing/transfer.ts b/src/billing/transfer.ts
index 1234567..89abcde 100644
--- a/src/billing/transfer.ts
+++ b/src/billing/transfer.ts
@@ -1,0 +1,10 @@
+export function transferFunds(fromAccountId: string, toAccountId: string, amount: number) {
+  // ...
+}
+
+export interface Payment {
+  id: string;
+  status: string; // 'pending' | 'authorized' | 'captured' | 'failed'
+  retryable: boolean;
+  failedReason: string;
+}
```

## Expected Behavior

The skill should:

1. Flag the adjacent `fromAccountId: string, toAccountId: string` parameters as transposable and suggest a branded type (e.g. `AccountId`)
2. Flag `status: string` (with the comment enumerating values) and suggest a discriminated union so that `failedReason` only exists in the `failed` state
3. Tie each finding to the diff with file/line evidence
