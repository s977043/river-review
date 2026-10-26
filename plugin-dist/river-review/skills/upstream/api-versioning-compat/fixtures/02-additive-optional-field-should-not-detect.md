# Fixture 02 — Additive optional field, contract stays compatible (False-Positive Guard)

## Description

The diff changes an OpenAPI contract, so the Pre-execution Gate is satisfied and
this fixture cannot be dismissed as out of scope. The change is nevertheless
backward compatible by construction: one optional, nullable response field is
added, nothing is removed or made required, the error model is untouched, and
the minor version is bumped. The 契約の整合 checklist item ("追加されたフィールドが
後方互換（nullable/optional）になるよう設計されているか") is satisfied, so there is
nothing to report.

## Input Diff

```diff
diff --git a/openapi/orders-openapi.yaml b/openapi/orders-openapi.yaml
--- a/openapi/orders-openapi.yaml
+++ b/openapi/orders-openapi.yaml
@@ -1,7 +1,7 @@
 openapi: 3.0.3
 info:
   title: Orders API
-  version: 1.3.0
+  version: 1.4.0
 components:
   schemas:
     Order:
@@ -10,3 +10,7 @@ components:
       properties:
         id:
           type: string
+        deliveryNote:
+          type: string
+          nullable: true
+          description: Optional free-text note. Absent for orders created before 1.4.0.
```

## Expected Behavior

- `findings: []`.
- Adding an optional, nullable response field is additive: existing clients that
  ignore unknown fields are unaffected, and no request-side requirement changed.
- The minor version bump (`1.3.0` → `1.4.0`) already communicates the additive
  change, so demanding a new major version or a deprecation window here would be
  a false positive.
- The skill must not ask for a migration guide, because nothing needs migrating.

<!-- expected:
findings: []
reason: optional かつ nullable なレスポンスフィールドの追加のみで削除・必須化・エラーモデル変更がなく、minor バージョンも追随しているため後方互換
-->
