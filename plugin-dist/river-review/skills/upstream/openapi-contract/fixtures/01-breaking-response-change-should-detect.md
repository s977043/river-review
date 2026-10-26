# Fixture 01 — Breaking response change with no versioning and an inconsistent error model (Happy Path)

## Description

An OpenAPI spec changes an existing operation. Three Checklist items of this
skill fail deterministically from the spec text alone:

1. **互換性** — `GET /orders/{id}` drops the existing `customerName` field and
   narrows `total` from `string` to `integer`. Both are breaking for current
   clients, and neither a version bump nor a migration note accompanies them.
2. **エラー契約** — the new `409` response uses `{ error, detail }` while the
   `400` response already declared in the same file uses `{ code, message }`.
   The two error shapes are inconsistent within one spec.
3. **認証/認可** — the newly added `POST /orders/{id}/refund` operation declares
   no `security`, although the file declares a `securitySchemes` entry and every
   other operation references it.

The Pre-execution Gate is satisfied: the path matches `**/openapi/**/*.yaml` and
the diff changes an API specification file.

## Input Diff

```diff
diff --git a/docs/openapi/orders.yaml b/docs/openapi/orders.yaml
--- a/docs/openapi/orders.yaml
+++ b/docs/openapi/orders.yaml
@@ -1,7 +1,7 @@
 openapi: 3.0.3
 info:
   title: Orders API
-  version: 1.4.0
+  version: 1.4.1
 components:
   securitySchemes:
     bearerAuth: { type: http, scheme: bearer }
@@ -20,22 +20,34 @@ paths:
   /orders/{id}:
     get:
       security: [{ bearerAuth: [] }]
       responses:
         '200':
           content:
             application/json:
               schema:
                 type: object
-                required: [id, customerName, total]
+                required: [id, total]
                 properties:
                   id: { type: string }
-                  customerName: { type: string }
-                  total: { type: string }
+                  total: { type: integer }
         '400':
           content:
             application/json:
               schema:
                 type: object
                 properties:
                   code: { type: string }
                   message: { type: string }
+  /orders/{id}/refund:
+    post:
+      responses:
+        '202':
+          description: Refund accepted
+        '409':
+          content:
+            application/json:
+              schema:
+                type: object
+                properties:
+                  error: { type: string }
+                  detail: { type: string }
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), per the Output section — it names
  the changed endpoints and the compatibility impact.
- A finding on the removal of `customerName` and the `string` → `integer`
  narrowing of `total`: both are breaking changes shipped under a patch version
  bump with no deprecation or migration plan. Severity critical.
- A finding on the `409` response body: `{ error, detail }` contradicts the
  `{ code, message }` shape declared for `400` in the same file, so the error
  contract is not consistent. Severity major, with a paste-ready line unifying
  the error envelope.
- A finding on `POST /orders/{id}/refund`: the operation omits `security` even
  though `securitySchemes.bearerAuth` exists and sibling operations reference it,
  so the authorization boundary is unspecified. Severity major.
- At most 8 findings total, per the Rule.
- No findings about YAML indentation style or the ordering of path entries.

<!-- expected:
findings:
  - severity: critical
    reason: 既存クライアントが依存する customerName の削除と total の string → integer 縮小が、バージョニングも移行方針もなく patch バンプで入っている
    anchor: docs/openapi/orders.yaml:28
  - severity: major
    reason: 409 のエラー構造 { error, detail } が同一ファイルの 400 で宣言済みの { code, message } と不統一
    anchor: docs/openapi/orders.yaml:47
  - severity: major
    reason: 追加された POST /orders/{id}/refund に security が無く、securitySchemes と各 operation の整合が取れていない
    anchor: docs/openapi/orders.yaml:41
-->
