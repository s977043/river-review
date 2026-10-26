# Fixture 01 — Breaking contract change with no version or migration plan (Happy Path)

## Description

An OpenAPI contract change does three breaking things at once and documents none
of them:

1. A field is **removed** from a response schema (`legacyId`).
2. A **required** request field is added (`tenantId`), which rejects every
   existing client request.
3. The error model changes shape (`error` → `errors[]`).

The version stays `1.0.0`, and there is no deprecation window, migration order,
or rollback condition. This fails the 互換性とバージョン, 非推奨と移行, and 契約の整合
Checklist groups. The Pre-execution Gate is satisfied: the path matches
`**/*openapi*.{yml,yaml,json}` and fields/types change.

## Input Diff

```diff
diff --git a/openapi/orders-openapi.yaml b/openapi/orders-openapi.yaml
--- a/openapi/orders-openapi.yaml
+++ b/openapi/orders-openapi.yaml
@@ -1,7 +1,7 @@
 openapi: 3.0.3
 info:
   title: Orders API
-  version: 1.0.0
+  version: 1.0.0
 paths:
   /orders:
     post:
@@ -12,19 +12,20 @@ components:
     OrderCreate:
       type: object
       required:
         - items
+        - tenantId
       properties:
         items:
           type: array
+        tenantId:
+          type: string
     Order:
       type: object
       properties:
         id:
           type: string
-        legacyId:
-          type: string
     Error:
       type: object
       properties:
-        error:
-          type: string
+        errors:
+          type: array
```

## Expected Behavior

- A summary line first (`(summary):1: ...`).
- A finding on the added `required: tenantId` (`openapi/orders-openapi.yaml:15`):
  a newly required request field is breaking for every existing client. Severity
  critical. Action: make it optional/nullable, or publish v2 and keep v1 serving.
- A finding on the removed `legacyId` (`:26`): field removal is breaking and no
  deprecation window is declared. Severity major.
- A finding on the error model change (`:31`): `error` → `errors` breaks client
  error handling and is not covered by any compatibility note. Severity major.
- A finding that `info.version` is unchanged at `1.0.0` despite breaking changes,
  with a migration-guide snippet as the action. Severity major.
- No findings about YAML indentation or the order of the `properties` keys.

<!-- expected:
findings:
  - severity: critical
    reason: 必須リクエストフィールド tenantId の追加は既存クライアントの全リクエストを破壊するが、移行方針の記載がない
    anchor: openapi/orders-openapi.yaml:15
  - severity: major
    reason: レスポンスフィールド legacyId の削除は破壊的変更だが非推奨期間・移行締切が未記載
    anchor: openapi/orders-openapi.yaml:26
  - severity: major
    reason: エラーモデルが error(string) から errors(array) へ変わり、エラーハンドリングの互換性が壊れる
    anchor: openapi/orders-openapi.yaml:31
  - severity: major
    reason: 破壊的変更があるのに info.version が 1.0.0 のままで、バージョンスキームとクライアント影響が説明されていない
    anchor: openapi/orders-openapi.yaml:4
-->
