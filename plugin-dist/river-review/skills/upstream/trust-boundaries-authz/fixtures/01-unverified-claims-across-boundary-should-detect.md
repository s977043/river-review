# Fixture 01 — Internal services trust unverified headers across the boundary (Happy Path)

## Description

A security design document introduces a service-to-service call that carries
identity in plain headers. Four Checklist items of this skill fail
deterministically from the text alone:

1. **Trust boundary** — 外部→Gateway→内部サービスのどこが信頼境界かが書かれておらず、
   境界を跨いだ先で「何を信頼できない」かも明示されていない。「内部だから信頼する」
   とだけ書かれている。
2. **Authn/Authz の責務** — 認可を Gateway に集約するのか各サービスで判定するのかが
   決まっておらず、Gateway/BFF/各サービスの責務分担が無い。
3. **Identity/Claims の伝播** — `X-User-Id` / `X-Tenant-Id` を素のヘッダで伝播し、
   署名も改ざん防止も無く、受け側での再検証方針も無い。
4. **監査と特権操作** — 他テナントのデータ閲覧という特権操作を追加しているのに、
   監査対象の明示も、誰がいつ何をしたかの記録要件も無い。

The Pre-execution Gate is satisfied: the path matches `docs/**/*security*.md`,
the change is about authn/authz and trust boundaries, and it is not a typo or
link-only edit.

## Input Diff

```diff
diff --git a/docs/security/internal-api-security.md b/docs/security/internal-api-security.md
--- a/docs/security/internal-api-security.md
+++ b/docs/security/internal-api-security.md
@@ -12,2 +12,11 @@
 Gateway が外部リクエストを受ける。

+## 内部サービス間の呼び出し
+
+Gateway は認証後、`X-User-Id` と `X-Tenant-Id` をヘッダに詰めて内部サービスへ渡す。
+内部サービスはこれをそのまま信頼する。内部ネットワークなので検証は不要とする。
+
+サポート業務のため、サポートサービスは `X-Tenant-Id` を任意の値に差し替えて
+他テナントのデータを参照できる。
+
+認可をどこで見るかは実装時に決める。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the new boundary, the
  principals, and the privileges involved.
- A finding that identity claims cross the boundary as unsigned plain headers
  with no verification on the receiving side, so anything that can reach an
  internal service can assert any user or tenant. Combined with the support
  service being allowed to substitute `X-Tenant-Id`, this is a cross-tenant
  access path. Severity critical (the Rule limits `critical` to「権限漏れ/越境の
  温床」, which this is), with a paste-ready
  `境界: 外部→Gateway→ServiceA の trust boundary と、token 検証責務を明記` 追記案.
- A finding that the tenant-override capability is a privileged operation with no
  audit requirement: who overrode which tenant, when, and for which case is not
  recorded. Severity critical.
- A finding that the authn/authz responsibility split is explicitly deferred
  to implementation time, so neither central enforcement at the Gateway nor
  per-service checks is guaranteed and the gap is invisible in review. Severity
  major.
- A finding that no permission matrix (role × action × resource) exists for the
  representative use cases, and the multi-tenant boundary has no stated
  cross-tenant prevention premise. Severity major, with the
  `権限マトリクス: role={Admin,User}, action={read,write,delete}, resource={X} を表に追記`
  template.
- At most 8 findings total, per the Rule.
- No finding prescribing a specific IdP product or cloud configuration, and no
  implementation-level vulnerability review — the Non-goals exclude both.

<!-- expected:
findings:
  - severity: critical
    reason: 署名も改ざん防止も無い素のヘッダで identity claims を境界越しに伝播し受け側で再検証しないうえ、サポートサービスが X-Tenant-Id を任意に差し替えられるためテナント越境の温床になる
    anchor: docs/security/internal-api-security.md:16
  - severity: critical
    reason: 他テナントデータ参照という特権操作を追加しながら監査対象の明示も「誰がいつ何をしたか」の記録要件も無い
    anchor: docs/security/internal-api-security.md:19
  - severity: major
    reason: 認可の判定箇所（Gateway 集約か各サービス分散か）と Gateway/BFF/各サービスの責務分担が実装時送りになっており、設計として保証されていない
    anchor: docs/security/internal-api-security.md:22
  - severity: major
    reason: 代表ユースケースの権限マトリクス（役割×操作×リソース）が無く、マルチテナントの越境防止の前提も書かれていない
    anchor: docs/security/internal-api-security.md:14
-->
