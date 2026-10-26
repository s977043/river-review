# Fixture 01 — New handler with a new failure path and no test diff (Happy Path)

## Description

The diff changes `src/**` and adds behaviour that affects the execution path
(a new endpoint with a validation branch and an error return), satisfying all three
Pre-execution Gate conditions. No `*.test.*` / `*.spec.*` file appears in the diff,
so the False-positive guard does not apply and the Heuristics bullets 「変更ファイル
に対する `*.test.*` が無い」and「例外パスが追加されたのに失敗系テストが無い」both
fire.

Note: this skill needs the repo-wide `tests` context and is registered in
`GRANDFATHERED_UNSUPPLIED_CONTEXT`, so this fixture describes the behaviour under a
configuration that supplies `tests` — the same assumption the SKILL.md header states.

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
```

Test tree evidence: no `src/api/create-invoice.test.ts` and no matching
`*.spec.*` exists anywhere in the repository.

## Expected Behavior

- One finding anchored at `src/api/create-invoice.ts:3` with
  `Finding` / `Evidence` / `Impact` / `Fix` / `Severity` / `Confidence`, per the
  Output section.
- `Fix` lists at most three test viewpoints — the Non-goals cap proposals at three:
  201 正常系、`amount <= 0` の 400、`saveInvoice` 失敗時の扱い.
- No comparison of test frameworks and no exhaustive case enumeration — both are
  Non-goals.

<!-- expected:
findings:
  - severity: major
    reason: 新規エンドポイントと 400 の失敗分岐が追加されたのに対応するテストが差分にも repo にも存在しない
    anchor: src/api/create-invoice.ts:3
-->
