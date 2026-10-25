# Architecture Validation Plan Guard

設計/ADRの差分から「その設計が正しいとどう確かめるか（検証計画）」の抜けを検出するスキルです。
スキル定義: `skills/upstream/architecture-validation-plan/SKILL.md`（YAML frontmatter + Markdown）。

## 概要

このスキルは、設計ドキュメントやADRの差分を分析し、本番稼働後に設計が期待通り動作することを担保するための検証計画の欠如を検出します：

- **SLO/SLI の欠如**: サービスレベル目標・指標が定義されていない
- **負荷試験計画の欠如**: 性能要件に対する検証方法がない
- **カナリアリリース計画の欠如**: 段階的ロールアウト戦略がない
- **ロールバック計画の欠如**: 失敗時の切り戻し手順がない
- **DR計画の欠如**: 災害復旧計画がない
- **観測計画の欠如**: メトリクス、ログ、アラートの計画がない
- **契約テスト計画の欠如**: API/インターフェース契約のテスト計画がない
- **PoC/スパイク計画の欠如**: 技術的不確実性の検証計画がない

## 使用方法

### 対象ファイル

以下のパターンにマッチするファイルが対象：

```text
docs/**/*design*.md
docs/**/*architecture*.md
docs/adr/**/*
docs/architecture/**/*
pages/**/*design*.md
pages/**/*architecture*.md
**/*.adr
```

### 実行

```bash
# バリデーション
npm run skills:validate

# promptfoo での評価（設定完了後）
cd skills/upstream/architecture-validation-plan
npx promptfoo eval
```

## 出力例

```text
**Finding:** SLO/SLIの定義が欠如しています
**Evidence:** Line 24-27: 可用性とレイテンシ要件は記載されていますが、具体的なSLO目標と計測方法がありません
**Impact:** 本番リリース後、何をもって「正常」とするかの基準がなく、障害判断が曖昧になります
**Fix:** 追記テンプレート: `## SLO/SLI\n- 可用性: 99.9% (月次)\n- P99レイテンシ: 200ms以下\n- 計測: Datadogダッシュボード xxx-service-health`
**Severity:** minor
**Confidence:** high
```

## テストケース

### 検証計画欠如 (fixtures/01-missing-validation-plan.md)

検出対象の設計ドキュメント例：

- 非機能要件はあるがSLO/SLIがない
- マイグレーション計画はあるがロールバック計画がない
- リスクは列挙されているが検証・緩和計画がない
- 監視・観測性の計画がない

### 完全な検証計画 (fixtures/02-complete-validation-plan.md)

指摘を出さないケース：

- SLO/SLI が具体的に定義されている
- 負荷試験計画が担当・ツール・成功基準付きで記載
- カナリアリリース計画が段階的判断基準付きで記載
- ロールバック計画が条件・手順・所要時間付きで記載
- 監視・アラート計画が条件・通知先付きで記載

## 設計判断

### なぜ upstream?

設計フェーズで検証計画を検討することで、実装後の「こんなはずじゃなかった」を防ぐ。実装後（midstream）では修正コストが高く、リリース後（downstream）では手遅れになる。

### なぜ minor severity?

検証計画の欠如は直接的な障害を引き起こさないが、障害発生時の検知・対応を困難にするため、設計段階で対処すべき。ただし、小規模な変更では過剰な要求を避けるため minor とする。

### なぜ medium confidence?

設計ドキュメントは組織によって粒度が異なり、検証計画が別ドキュメントで管理されている可能性もあるため、差分のみからは確定的な判断が難しい場合がある。

## 改善履歴

- v0.1.0 (2025-12-30): 初版リリース

## 関連スキル

- `adr-decision-quality`: ADRの意思決定品質
- `architecture-risk-register`: リスク・前提・未決の管理
- `operability-slo`: 運用性・SLO設計
- `migration-rollout-rollback`: マイグレーション・ロールアウト計画

## 参考資料

- [Google SRE Book - Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [The Art of SLOs](https://sre.google/workbook/implementing-slos/)
- [Canary Releases - Martin Fowler](https://martinfowler.com/bliki/CanaryRelease.html)
