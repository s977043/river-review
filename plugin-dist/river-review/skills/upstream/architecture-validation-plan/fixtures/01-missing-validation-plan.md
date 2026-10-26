# Test Case: Missing Validation Plan (Should Trigger Finding)

This test case should trigger findings for missing validation plans.

## Input Diff

```diff
diff --git a/docs/architecture/payment-service-redesign.md b/docs/architecture/payment-service-redesign.md
index 1111111..2222222 100644
--- a/docs/architecture/payment-service-redesign.md
+++ b/docs/architecture/payment-service-redesign.md
@@ -0,0 +1,45 @@
+# 決済サービス リアーキテクチャ設計書
+
+## 背景
+
+現行の決済サービスは単一のモノリスとして構築されており、
+トランザクション量の増加に伴いスケーラビリティの問題が顕在化している。
+
+## 決定事項
+
+決済処理をマイクロサービスとして分離し、以下の構成に変更する：
+
+1. Payment Gateway Service: 外部決済プロバイダーとの通信
+2. Transaction Service: トランザクション管理
+3. Notification Service: 決済完了通知
+
+## 技術スタック
+
+- Kubernetes (EKS)
+- PostgreSQL (RDS)
+- Redis (ElastiCache)
+- Kafka (MSK)
+
+## 非機能要件
+
+- 可用性: 高可用性が求められる
+- レイテンシ: 決済処理は3秒以内に完了
+- スループット: 1000 TPS をサポート
+
+## リスク
+
+1. マイグレーション中のデータ整合性
+2. 外部決済プロバイダーとの接続安定性
+3. サービス間通信の障害
+
+## マイグレーション計画
+
+Phase 1: 新サービスの構築（2ヶ月）
+Phase 2: 並行稼働期間（1ヶ月）
+Phase 3: 完全移行（2週間）
+
+## 次のステップ
+
+- 詳細設計の作成
+- インフラ構築
+- 開発チームのアサイン
```

## Expected Behavior

The skill should detect:

1. SLO/SLI definitions are missing (availability and latency mentioned but not measurable)
2. No load testing plan for 1000 TPS requirement
3. No canary/gradual rollout strategy for migration
4. No rollback plan if migration fails
5. No observability/monitoring plan
6. Listed risks have no validation/mitigation plans
