# Fixture 02 — The lint rule is being added in the same diff (False-Positive Guard)

## Description

The Pre-execution Gate is satisfied: the diff contains a source change under
`src/` and is not a tool-configuration-only change. A `console.log` residue
**survives in the diff** (`src/checkout/apply-coupon.ts:9`, untouched by this
change), so the Heuristics "Level 2" pattern is present and the skill would
report it. But the same diff adds `no-console: error` to `.eslintrc.json`, which
is exactly the False-positive guard "差分内に該当ツールの設定ファイル変更が
含まれている場合、そのルールは追加中と判断し指摘しない". Proposing the rule
again would duplicate a change already in flight, which the Non-goals section
also excludes（既に CI に設定が存在するルールへの重複指摘）.

The residue is load-bearing: delete the `.eslintrc.json` hunk and this fixture's
expectation flips to a finding on `src/checkout/apply-coupon.ts:9`. The
suppression therefore rests on the guard alone, not on the absence of a target.

## Input Diff

```diff
diff --git a/.eslintrc.json b/.eslintrc.json
--- a/.eslintrc.json
+++ b/.eslintrc.json
@@ -3,5 +3,6 @@
   "extends": ["eslint:recommended"],
   "rules": {
+    "no-console": "error",
     "eqeqeq": "error"
   }
 }
diff --git a/src/checkout/apply-coupon.ts b/src/checkout/apply-coupon.ts
--- a/src/checkout/apply-coupon.ts
+++ b/src/checkout/apply-coupon.ts
@@ -3,8 +3,8 @@
 export async function applyCoupon(cartId: string, code: string) {
   const coupon = await findCoupon(code);
-  console.log('applyCoupon', cartId, code, coupon);
+  logger.debug({ cartId, code }, 'applyCoupon');
   if (!coupon) {
     return { ok: false as const, reason: 'not_found' as const };
   }
   console.log('coupon resolved');
   return { ok: true as const, coupon };
```

## Expected Behavior

- `findings: []`.
- The gate does hold (a real source change is present) **and** a Level 2 target
  remains at `src/checkout/apply-coupon.ts:9`, so the suppression must come from
  the False-positive guard — neither the gate nor an empty target set can
  account for it.
- The `automation_debt` metric is `0` for this diff, matching the Metrics
  section's goal state (チームが CI/lint を整備した結果、指摘が 0 件になる).

<!-- expected:
findings: []
reason: Pre-execution Gate は成立し console.log の残骸も src/checkout/apply-coupon.ts:9 に残るが、同じ差分で .eslintrc.json に no-console ルールが追加されているため、False-positive guard「該当ツールの設定ファイル変更が差分内にある場合は指摘しない」に該当する
-->
