# Test Case: New Component Uses Shared Formatting Utilities (False Positive Guard)

## Description

This test verifies that the skill does NOT flag a new component that correctly uses the project's shared formatting utilities for dates, amounts, and status labels.

## Input Diff

```diff
diff --git a/src/components/PaymentSummary.tsx b/src/components/PaymentSummary.tsx
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/src/components/PaymentSummary.tsx
@@ -0,0 +1,21 @@
+import React from 'react';
+import { formatDate } from '../utils/date';
+import { formatCurrency } from '../utils/currency';
+import { PAYMENT_STATUS_LABELS } from '../constants/paymentStatus';
+
+interface PaymentSummaryProps {
+  date: Date;
+  amount: number;
+  status: 'pending' | 'completed' | 'failed';
+  currency: string;
+}
+
+export function PaymentSummary({ date, amount, status, currency }: PaymentSummaryProps) {
+  return (
+    <div className="payment-summary">
+      <span className="date">{formatDate(date)}</span>
+      <span className="amount">{formatCurrency(amount, currency)}</span>
+      <span className="status">{PAYMENT_STATUS_LABELS[status]}</span>
+    </div>
+  );
+}
```

## Expected Behavior

The skill should:

1. Recognize that `formatDate`, `formatCurrency`, and `PAYMENT_STATUS_LABELS` are all imported from shared utilities/constants
2. NOT flag any normalization inconsistency — the component follows the established patterns
3. Either return no findings or explicitly confirm the component is consistent with existing normalization conventions
4. NOT produce false positive warnings about formatting approaches
