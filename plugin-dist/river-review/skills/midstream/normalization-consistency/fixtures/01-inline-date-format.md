# Test Case: Inline Date Formatting Instead of Shared Utility (Should Detect)

## Description

This test verifies that the skill correctly identifies a new component that implements its own date formatting logic instead of using the project's shared `formatDate` utility.

## Input Diff

```diff
diff --git a/src/components/InvoiceDate.tsx b/src/components/InvoiceDate.tsx
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/src/components/InvoiceDate.tsx
@@ -0,0 +1,11 @@
+import React from 'react';
+
+interface InvoiceDateProps {
+  date: Date;
+}
+
+export function InvoiceDate({ date }: InvoiceDateProps) {
+  // Custom date formatting inline
+  const formatted = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
+  return <span className="invoice-date">{formatted}</span>;
+}
diff --git a/src/components/OrderDate.tsx b/src/components/OrderDate.tsx
index 1234567..2345678 100644
--- a/src/components/OrderDate.tsx
+++ b/src/components/OrderDate.tsx
@@ -1,9 +1,10 @@
 import React from 'react';
+import { formatDate } from '../utils/date';

 interface OrderDateProps {
   date: Date;
 }

 export function OrderDate({ date }: OrderDateProps) {
-  return <span>{date.toLocaleDateString('ja-JP')}</span>;
+  return <span className="order-date">{formatDate(date)}</span>;
 }
```

## Expected Behavior

The skill should:

1. Detect that `InvoiceDate.tsx` implements custom date formatting via `getFullYear()` / `getMonth()` / `getDate()` manipulation
2. Note that the existing `OrderDate.tsx` uses `formatDate` from a shared utility
3. Flag the inconsistency — inline formatting deviates from the established pattern
4. Suggest using the shared `formatDate` utility instead
5. Set severity to "major"
