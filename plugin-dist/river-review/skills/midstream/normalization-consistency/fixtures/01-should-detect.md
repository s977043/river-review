# Test Case: Inconsistent Date Formatting (Should Detect)

## Description

New code introduces a different date formatting approach from existing codebase patterns.

## Input Diff

```diff
diff --git a/src/components/OrderList.tsx b/src/components/OrderList.tsx
index abc1234..def5678 100644
--- a/src/components/OrderList.tsx
+++ b/src/components/OrderList.tsx
@@ -1,5 +1,6 @@ import { format } from 'date-fns';
+import dayjs from 'dayjs';

 export function OrderRow({ order }: Props) {
-  const displayDate = format(order.createdAt, 'yyyy/MM/dd');
+  const displayDate = dayjs(order.createdAt).format('MM-DD-YYYY');
   return <td>{displayDate}</td>;
 }
```

## Expected Behavior

The skill should:

1. Detect that the new code uses `dayjs` and a different date format (`MM-DD-YYYY`) while existing code uses `date-fns` with `yyyy/MM/dd`
2. Flag the inconsistency in both the library used and the format string
3. Severity: major
4. Suggest aligning with the existing pattern
