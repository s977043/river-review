# Fixture 01 — Debug output and unused import left in source (Happy Path)

## Description

The diff changes application source under `src/` (not only tool configuration and
not only tests/fixtures), so all Pre-execution Gate conditions hold. The change
leaves `console.log` debug output and an unused import in the file — both are
Heuristics "Level 2: Linter で解決すべきパターン" items (`no-console`,
`@typescript-eslint/no-unused-vars`). Per the Rule section these must be reported
as automation proposals (add the lint rule and enforce it in CI), not as ordinary
human-review nits.

## Input Diff

```diff
diff --git a/src/checkout/apply-coupon.ts b/src/checkout/apply-coupon.ts
--- a/src/checkout/apply-coupon.ts
+++ b/src/checkout/apply-coupon.ts
@@ -1,9 +1,12 @@
 import { findCoupon } from './coupon-repository';
+import { formatCurrency } from '../format/currency';

 export async function applyCoupon(cartId: string, code: string) {
   const coupon = await findCoupon(code);
+  console.log('applyCoupon', cartId, code, coupon);
   if (!coupon) {
     return { ok: false as const, reason: 'not_found' as const };
   }
+  console.log('coupon resolved');
   return { ok: true as const, coupon };
 }
```

## Expected Behavior

- A finding on `src/checkout/apply-coupon.ts:6` for the residual `console.log`
  calls, aggregated as one category with the count (2 箇所), proposing the
  ESLint `no-console` rule enforced in CI.
- A finding on `src/checkout/apply-coupon.ts:2` for the unused
  `formatCurrency` import, proposing `@typescript-eslint/no-unused-vars`.
- Both findings name a concrete tool and rule, as the Evidence and Evaluation
  sections require; a bare "console.log を消してください" without an automation
  proposal is an 不合格 output.
- No comment on the business logic of the coupon lookup — that is outside this
  skill's Rule and Non-goals.

<!-- expected:
findings:
  - severity: minor
    reason: console.log のデバッグ出力が残存しており、ESLint no-console で機械的に強制できる（人間レビューの指摘対象にしない）
    anchor: src/checkout/apply-coupon.ts:6
  - severity: minor
    reason: 未使用 import が残存しており、@typescript-eslint/no-unused-vars で機械的に検出できる
    anchor: src/checkout/apply-coupon.ts:2
-->
