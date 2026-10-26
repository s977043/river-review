# Fixture 02 — Additive optional field with the contract agreed elsewhere (False-Positive Guard)

## Description

The diff changes an OpenAPI file, so the path condition matches and the gate is
satisfied. But every Checklist item the skill would otherwise raise is already
answered: the change is purely additive and optional, the error model and
pagination contract are defined once in a shared component that this file
references, `security` is declared on the operation, and the compatibility rule
is stated in a linked, unchanged document. This is the skill's guard
「仕様の不足が差分外で既に合意済み（別ドキュメント参照）で、参照が明確な場合は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/openapi/_shared.yaml (existing, unchanged) defines Error
({ code, message, requestId }), the retryable flag, the rate-limit headers, and
the CursorPage envelope used by every list endpoint.

docs/api/compatibility.md (existing, unchanged) states the project rule:
optional additive fields are backward compatible and do not require a version
bump; removals and type narrowing do.
```

## Input Diff

```diff
diff --git a/docs/openapi/orders.yaml b/docs/openapi/orders.yaml
--- a/docs/openapi/orders.yaml
+++ b/docs/openapi/orders.yaml
@@ -20,15 +20,24 @@ paths:
   /orders/{id}:
     get:
       security: [{ bearerAuth: [] }]
+      # Compatibility rule: docs/api/compatibility.md — optional additive
+      # fields are backward compatible; no version bump required.
       responses:
         '200':
           content:
             application/json:
               schema:
                 type: object
                 required: [id, total]
                 properties:
                   id: { type: string }
                   total: { type: integer }
+                  giftMessage:
+                    type: string
+                    nullable: true
+                    maxLength: 200
+                    example: 'Happy birthday!'
+                    description: Optional buyer-supplied note. Absent for orders
+                      created before 2026-08; clients must tolerate omission.
         default:
           $ref: '../openapi/_shared.yaml#/components/responses/Error'
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The error model, retryable semantics, rate limiting, and pagination are not
  restated here — they are delegated to `_shared.yaml`, which the guard treats as
  clear. Re-raising them would be a duplicate finding.
- The new field is optional and `nullable`, with `maxLength`, a realistic
  `example`, and an explicit statement that clients must tolerate its absence, so
  the 型とバリデーション checklist passes.
- The compatibility question is answered by the referenced rule, so no versioning
  finding is warranted.
- `security` is declared on the operation, so the 認証/認可 checklist passes.

<!-- expected:
findings: []
reason: 追加は optional かつ nullable で制約と例が明示され、エラー契約とページネーションは _shared.yaml、互換性ルールは compatibility.md へ参照委譲済み（重複指摘の抑制条件に該当）
-->
