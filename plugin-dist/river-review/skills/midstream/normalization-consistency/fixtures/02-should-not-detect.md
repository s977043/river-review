# Test Case: Consistent Date Formatting (Should NOT Detect)

## Description

New code uses the same date formatting approach as existing patterns.

## Input Diff

```diff
diff --git a/src/components/InvoiceList.tsx b/src/components/InvoiceList.tsx
index abc1234..def5678 100644
--- a/src/components/InvoiceList.tsx
+++ b/src/components/InvoiceList.tsx
@@ -1,0 +1,5 @@ import { format } from 'date-fns';
+
+export function InvoiceRow({ invoice }: Props) {
+  const displayDate = format(invoice.issuedAt, 'yyyy/MM/dd');
+  return <td>{displayDate}</td>;
+}
```

## Expected Behavior

The skill should NOT flag this — the new code follows the established `date-fns` + `yyyy/MM/dd` pattern used elsewhere.
