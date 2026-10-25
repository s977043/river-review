# Fixture 02 — The mitigation is visible in the same diff (False-Positive Guard)

## Description

The Pre-execution Gate holds — the diff touches `src/api/routes/` and is not a
test/doc-only change — so the skill runs and analyses the attack surface. The same
diff, however, adds the ownership check and the rate limit that would close the
scenarios an attacker persona could build here. This is the False-positive guard
"すでにセキュリティレビュー済みの箇所で、緩和策が差分内に確認できる場合は抑制".

## Input Diff

```diff
diff --git a/src/api/routes/invoices.mjs b/src/api/routes/invoices.mjs
--- a/src/api/routes/invoices.mjs
+++ b/src/api/routes/invoices.mjs
@@ -1,11 +1,15 @@
 import { Router } from 'express';
 import { requireAuth } from '../middleware/require-auth.mjs';
+import { rateLimit } from '../middleware/rate-limit.mjs';
 import { findInvoice } from '../../db/invoices.mjs';

 export const router = Router();

-router.get('/api/invoices/:id', requireAuth, async (req, res) => {
+router.get('/api/invoices/:id', requireAuth, rateLimit({ perMinute: 60 }), async (req, res) => {
   const invoice = await findInvoice(req.params.id);
   if (!invoice) return res.status(404).json({ error: 'not_found' });
+  if (invoice.tenantId !== req.user.tenantId) {
+    return res.status(403).json({ error: 'forbidden' });
+  }
   return res.json(invoice);
 });
```

## Expected Behavior

- `findings: []`.
- The 認証済み悪意ユーザー persona's IDOR path is closed by the explicit
  `tenantId` comparison, and the 自動化ボット persona's enumeration path is closed
  by the added rate limit — both mitigations are in the diff, so the guard applies.
- Reporting "still might be insecure" without a concrete gap would be
  「根拠のない不安」, listed under the 不合格基準.
- Any residual concern that depends on facts absent from the diff (how invoice
  ids are generated, what the rate limiter keys on) must be raised as a Human
  Handoff question, not asserted in either direction: the guard only recognises
  mitigations 差分内に確認できる, and the same evidence rule forbids inventing a
  mitigating premise the diff does not show.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、IDOR に対する tenantId 検証と列挙攻撃に対する rate limit の緩和策がいずれも同じ差分内に確認できるため、False-positive guard「緩和策が差分内に確認できる場合は抑制」に該当する
-->
