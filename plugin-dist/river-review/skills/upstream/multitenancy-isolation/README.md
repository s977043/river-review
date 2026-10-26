# Multitenancy Isolation Guard

マルチテナント設計におけるテナント分離のレビューを行うスキルです。
スキル定義: `skills/upstream/multitenancy-isolation/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、設計ドキュメントやコード差分（diff）を分析し、マルチテナント環境における分離の問題を検出します：

- **データ分離**: テナント間でデータが混在・漏洩するリスク（DB、キャッシュ、キュー、ストレージ）
- **権限分離**: テナント境界を越えたアクセス（IDOR等）のリスク
- **リソース分離**: Noisy neighbor問題（1テナントが他テナントに影響）
- **障害分離**: 1テナントの障害が他テナントに波及するリスク

## シグナルワード

以下のキーワードが含まれる場合、マルチテナント設計として検出対象となります：

- tenant / テナント
- organization / 組織
- workspace / ワークスペース
- company / 会社
- tenantId / tenant_id
- 共有DB / 共有キャッシュ / 共有キュー

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
**/*.md
**/*.yaml
**/*.yml
**/*.json
docs/**/*
design/**/*
architecture/**/*
specs/**/*
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/upstream/multitenancy-isolation
npx promptfoo eval
```

## 出力例

```text
**Finding:** Missing tenant isolation in database query
**Evidence:** SQL query `SELECT * FROM orders WHERE id = :orderId` does not include tenant_id filter
**Impact:** Tenant A could access Tenant B's order data if order_id is guessed or enumerated (IDOR vulnerability)
**Fix:** Add tenant_id to query: `SELECT * FROM orders WHERE tenant_id = :tenantId AND id = :orderId`, or implement Row Level Security (RLS)
**Severity:** critical
**Confidence:** high
```

## テストケース

### Happy Path (fixtures/01-missing-tenant-filter-happy.md)

検出対象のコード例：

- tenant_idなしのDBクエリ
- テナントプレフィックスなしのキャッシュキー

### False Positive Test (fixtures/02-proper-tenant-isolation.md)

偽陽性を避けるケース：

- tenant_idフィルター付きのクエリ
- RLSが有効化されている
- テナントプレフィックス付きのキャッシュキー
- JWT検証が明示されている

### Resource Isolation (fixtures/03-shared-resource-noisy-neighbor.md)

検出対象：

- グローバルレート制限のみ
- 共有コネクションプール
- テナント公平性のないジョブキュー

## 設計判断

### なぜ upstream?

マルチテナント分離は設計段階で検討すべき問題。実装後の修正はコストが高く、データ漏洩のリスクがある。

### 重大度の設計判断

テナント分離の問題は潜在的なセキュリティリスクですが、即座に障害を引き起こすわけではないため、多くは `major` として報告します。ただし、データ分離の欠如など、直接的なデータ漏洩に繋がるものは `critical` として報告します。

### なぜ medium confidence?

設計ドキュメントのみでは実装の詳細が不明なため。コードレビュー時には confidence を上げることが可能。

## 改善履歴

- v0.1.0 (2025-12-30): 初版リリース

## 関連スキル

- `security-basic`: 一般的なセキュリティ問題の検出
- `logging-observability`: テナント単位のログ・メトリクス

## 参考資料

- [OWASP Multi-Tenancy Security](https://owasp.org/www-project-web-security-testing-guide/)
- [Azure Multi-tenant Architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [AWS SaaS Tenant Isolation](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html)
