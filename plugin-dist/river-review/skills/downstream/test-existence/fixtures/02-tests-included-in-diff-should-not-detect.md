# Fixture 02 — The diff already carries the tests (False-Positive Guard)

## Description

The Pre-execution Gate holds exactly as in fixture 01: the diff changes `src/**`
and the change affects the execution path. The skill therefore runs rather than
returning `NO_REVIEW`. The same diff adds `src/api/create-invoice.test.ts`, which
triggers the False-positive guard 「差分にテストファイル（`*.test.*` /
`*.spec.*`）が含まれている場合」, reinforced by the Non-goal 「テスト差分が
すでにある場合の追加要求（原則として黙る）」.

## Input Diff

```diff
diff --git a/src/api/create-invoice.ts b/src/api/create-invoice.ts
new file mode 100644
--- /dev/null
+++ b/src/api/create-invoice.ts
@@ -0,0 +1,10 @@
+import { saveInvoice } from '../db/invoices';
+
+export async function createInvoice(req: Request): Promise<Response> {
+  const body = await req.json();
+  if (!body.amount || body.amount <= 0) {
+    return Response.json({ error: 'invalid_amount' }, { status: 400 });
+  }
+  const invoice = await saveInvoice({ amount: body.amount, tenantId: req.tenantId });
+  return Response.json(invoice, { status: 201 });
+}
diff --git a/src/api/create-invoice.test.ts b/src/api/create-invoice.test.ts
new file mode 100644
--- /dev/null
+++ b/src/api/create-invoice.test.ts
@@ -0,0 +1,12 @@
+import { createInvoice } from './create-invoice';
+
+it('201 を返す', async () => {
+  const res = await createInvoice(reqWith({ amount: 100 }));
+  expect(res.status).toBe(201);
+});
+
+it('amount が 0 以下なら 400 を返す', async () => {
+  const res = await createInvoice(reqWith({ amount: 0 }));
+  expect(res.status).toBe(400);
+  expect(await res.json()).toEqual({ error: 'invalid_amount' });
+});
```

## Expected Behavior

- `findings: []`.
- Both the happy path and the new 400 branch have assertions, so no coverage
  viewpoint is missing for the changed code.
- Asking for more cases (currency rounding, concurrent writes, …) would be
  「網羅的なテストケース列挙」, a Non-goal, and would also ignore the suppression
  condition — 抑制条件の無視 is listed under 不合格基準.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、同じ差分にテストファイル（*.test.ts）が含まれており、False-positive guard「差分にテストファイルが含まれている場合」に該当する
-->
