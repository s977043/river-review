# Fixture 01 — New route exposes another user's data (Happy Path)

## Description

The diff adds a route under `src/api/routes/`, matching `applyTo` and the first
Pre-execution Gate condition (セキュリティ関連コードの変更). It is not a
test/fixture/doc-only change, so the gate holds. The handler resolves the invoice
by the path parameter alone and never compares it with the authenticated
subject — the 認証済み悪意ユーザー persona can iterate `:id` and read other
tenants' invoices (horizontal privilege escalation / IDOR).

## Input Diff

```diff
diff --git a/src/api/routes/invoices.mjs b/src/api/routes/invoices.mjs
new file mode 100644
--- /dev/null
+++ b/src/api/routes/invoices.mjs
@@ -0,0 +1,11 @@
+import { Router } from 'express';
+import { requireAuth } from '../middleware/require-auth.mjs';
+import { findInvoice } from '../../db/invoices.mjs';
+
+export const router = Router();
+
+router.get('/api/invoices/:id', requireAuth, async (req, res) => {
+  const invoice = await findInvoice(req.params.id);
+  if (!invoice) return res.status(404).json({ error: 'not_found' });
+  return res.json(invoice);
+});
```

## Expected Behavior

- An attack scenario anchored at `src/api/routes/invoices.mjs:7` with all four
  required fields: ペルソナ（認証済み悪意ユーザー）、攻撃手順（自分の JWT で
  `:id` を他テナントの請求書 ID に差し替え → レスポンスに他社の請求内容）、
  影響（他テナントの請求データ漏洩）、防御ギャップ（`requireAuth` は認証のみで
  所有権を検証していない）、Fix（`invoice.tenantId === req.user.tenantId` を
  検証し不一致は 403）。
- The scenario maps to a known category (OWASP A01: Broken Access Control), as the
  Evidence section requires.
- No exploit code is produced — only the attack path, per the 制約.
- No generic SQLi/XSS checklist output: that belongs to `security-basic` per the
  Non-goals section.

<!-- expected:
findings:
  - severity: major
    reason: 認証のみで所有権検証が無く、:id 差し替えで他テナントの請求データを読める（IDOR / 水平権限昇格）
    anchor: src/api/routes/invoices.mjs:7
-->
