# Fixture 02 — Authorization terms delegated to an unchanged permission spec (False-Positive Guard)

## Description

The diff changes a document under `docs/**/*security*.md`, the change concerns
authn/authz and trust boundaries, and it is more than a typo or link edit, so all
three Pre-execution Gate conditions are satisfied. The skill stays silent because
every Checklist item it would raise is already settled in an existing permission
specification that this diff points to and does not change — the skill's guard
「参照先（セキュリティ設計書/権限仕様）ですでに明確で、差分が参照更新のみの場合は
重複指摘しない」— and the one operational detail the diff adds is fully specified.

Repository context (not part of the diff):

```text
docs/security/permission-spec.md (existing, unchanged) defines: the trust
boundary (external → Gateway is untrusted; Gateway → internal is trusted only
for mTLS peers), that the Gateway performs authn and each service re-verifies
authz, claims propagation as a signed short-lived internal JWT (userId,
tenantId, roles, scopes) that every service re-validates against the issuer's
JWKS, the audit requirements for privileged operations (actor, target tenant,
case id, timestamp, retained 1 year), and the permission matrix
(role × action × resource) including the tenant-isolation rule.
```

## Input Diff

```diff
diff --git a/docs/security/internal-api-security.md b/docs/security/internal-api-security.md
--- a/docs/security/internal-api-security.md
+++ b/docs/security/internal-api-security.md
@@ -12,2 +12,13 @@
 Gateway が外部リクエストを受ける。

+## 内部サービス間の呼び出し
+
+信頼境界の定義、authn/authz の責務分担、claims の伝播形式と再検証、特権操作の監査
+要件、権限マトリクスとテナント分離規則は [権限仕様](./permission-spec.md) が正であり、
+本変更では変更しない。
+
+## 内部トークンの有効期限
+
+権限仕様が定める内部 JWT の有効期限を 5 分とし、受け側は 30 秒のクロックスキューまで
+許容する。期限切れは 401 で拒否し、呼び出し元がリトライ前に再発行する（延長・再利用は
+しない）。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The trust boundary, the authn/authz responsibility split, the signed-claims
  propagation format with issuer-side re-validation, the audit requirements for
  privileged operations, and the permission matrix with tenant isolation are all
  delegated to the linked permission spec, which this diff leaves unchanged.
  Re-raising them would be a duplicate finding.
- The one thing this diff decides — the internal token lifetime — is specified
  completely: the validity window, the clock-skew tolerance, the rejection
  status, and the rule that expired tokens are re-issued rather than extended or
  reused. It narrows the trust window rather than widening it, so it opens no new
  privilege path.
- No `critical` is emitted: the Rule reserves `critical` for「権限漏れ/越境の温床」,
  and nothing here creates one.

<!-- expected:
findings: []
reason: 信頼境界・authn/authz の責務分担・claims 伝播と再検証・特権操作の監査要件・権限マトリクスは不変の権限仕様で管理され参照が明確（重複指摘の抑制条件に該当）、追加された内部トークン有効期限も許容スキュー・拒否時挙動・再発行方針まで明記され新たな越境経路を作らない
-->
