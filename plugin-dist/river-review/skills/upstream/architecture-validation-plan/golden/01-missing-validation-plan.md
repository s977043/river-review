# Expected Output: Missing Validation Plan

## Summary

(summary):1: 決済サービスリアーキテクチャ設計において、SLO/SLI定義、負荷試験計画、ロールバック計画、段階的ロールアウト計画が欠如しています。

## Findings

- `docs/architecture/payment-service-redesign.md:24-27`: [severity=minor] SLO/SLIの具体的な定義がありません。「高可用性」「3秒以内」「1000 TPS」の記載はありますが、計測方法と目標値が不明確です。Fix: `## SLO/SLI\n- 可用性: 99.99% (月次) / SLI: 成功決済数 / 総決済数\n- P99レイテンシ: 2000ms以下 / 計測: APMダッシュボード\n- スループット: 1000 TPS / 計測: メトリクス payment_transactions_per_second`

- `docs/architecture/payment-service-redesign.md:24-27`: [severity=minor] 1000 TPS要件に対する負荷試験計画がありません。Fix: `## 負荷試験計画\n- 環境: ステージング\n- 目標: 1200 TPS (20%マージン) で P99 2000ms以下\n- ツール: k6 / Locust\n- 時期: Phase 1完了後\n- 担当: インフラチーム`

- `docs/architecture/payment-service-redesign.md:35-39`: [severity=major] マイグレーション計画はありますが、ロールバック計画がありません。決済という重要機能において、移行失敗時の切り戻し手順は必須です。Fix: `## ロールバック計画\n- 条件: エラー率 0.1%超過 または レイテンシ 5秒超過\n- 手順: 1. 新サービスへのルーティング停止 2. 旧モノリスへフォールバック\n- 所要時間: 5分以内`

- `docs/architecture/payment-service-redesign.md:35-39`: [severity=minor] 段階的ロールアウト（カナリアリリース）計画がありません。Phase 2「並行稼働期間」の詳細が不明です。Fix: `## カナリアリリース計画\n- 5% -> 25% -> 50% -> 100%\n- 各段階の判断基準: エラー率 0.05%以下、レイテンシ劣化 10%以内\n- 各段階の滞留期間: 1週間`

- `docs/architecture/payment-service-redesign.md:29-33`: [severity=minor] 列挙されたリスクに対する検証・緩和計画がありません。Fix: `## リスク検証計画\n| リスク | 検証方法 | 成功基準 |\n|--------|----------|----------|\n| データ整合性 | 並行稼働時の突合チェック | 差異 0件 |\n| 接続安定性 | 障害注入テスト | 自動リトライで復旧 |\n| サービス間通信障害 | Chaos Engineering | サーキットブレーカー動作確認 |`

- `docs/architecture/payment-service-redesign.md:1-45`: [severity=minor] 監視・観測性の計画がありません。Fix: `## 監視計画\n- メトリクス: 決済成功率、レイテンシ、エラー率\n- ログ: 構造化ログ、トレースID付与\n- アラート: 決済失敗率 0.1%超過で即時通知\n- ダッシュボード: Grafana payment-service-health`
