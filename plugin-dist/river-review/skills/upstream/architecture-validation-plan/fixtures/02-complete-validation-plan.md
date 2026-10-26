# Test Case: Complete Validation Plan (Should Not Trigger Finding)

This test case should NOT trigger findings as it has comprehensive validation plans.

## Input Diff

```diff
diff --git a/docs/architecture/cache-layer-design.md b/docs/architecture/cache-layer-design.md
index 1111111..2222222 100644
--- a/docs/architecture/cache-layer-design.md
+++ b/docs/architecture/cache-layer-design.md
@@ -0,0 +1,81 @@
+# キャッシュレイヤー設計書
+
+## 背景
+
+商品詳細APIのレイテンシ改善のため、Redis キャッシュレイヤーを導入する。
+
+## 決定事項
+
+Redis Cluster を導入し、商品詳細データをキャッシュする。
+
+## SLO/SLI
+
+| 指標 | 目標 | 計測方法 |
+|------|------|----------|
+| 可用性 | 99.9% (月次) | 成功リクエスト数 / 総リクエスト数 |
+| P99 レイテンシ | 50ms以下 | Datadog APM |
+| キャッシュヒット率 | 80%以上 | Redis INFO stats |
+
+ダッシュボード: https://datadog.example.com/dashboard/cache-health
+
+## 検証計画
+
+### PoC/スパイク (Week 1-2)
+
+- Redis Cluster のフェイルオーバー動作確認
+- キャッシュキー設計の妥当性検証
+- 成功基準: フェイルオーバー10秒以内、キャッシュミス時のフォールバック動作確認
+
+### 負荷試験 (Week 3)
+
+- ステージング環境で実施
+- 目標: 5000 RPS で P99 50ms 以下
+- ツール: k6
+- 担当: インフラチーム
+
+### 契約テスト
+
+- キャッシュ有無でAPIレスポンスが同一であることを確認
+- Pact によるコンシューマー駆動契約テスト
+
+## カナリアリリース計画
+
+1. 5% トラフィックでリリース（1日）
+   - 監視: エラー率 0.1%以下、レイテンシ劣化なし
+2. 25% に拡大（2日）
+3. 50% に拡大（2日）
+4. 100% 完全移行
+
+各段階の判断基準:
+- エラー率 0.5% 超過 → 即時ロールバック
+- P99 100ms 超過 → 調査後判断
+
+## ロールバック計画
+
+### 条件
+- エラー率 0.5% 超過
+- P99 200ms 超過が5分継続
+
+### 手順
+1. フィーチャーフラグ `cache_layer_enabled` を OFF
+2. 旧コードパスにフォールバック
+3. 所要時間: 1分以内（フラグ変更のみ）
+
+### DR計画
+- Redis Cluster 全断時: フィーチャーフラグで無効化、DBから直接取得
+- RTO: 5分、RPO: 0（キャッシュのためデータロスなし）
+
+## 監視・アラート
+
+| アラート | 条件 | 通知先 |
+|----------|------|--------|
+| キャッシュ可用性低下 | 可用性 < 99.5% (5分) | #alert-cache |
+| レイテンシ劣化 | P99 > 100ms (5分) | #alert-cache |
+| Redis メモリ逼迫 | 使用率 > 80% | #alert-infra |
+
+## リスクと緩和策
+
+| リスク | 緩和策 | 検証方法 |
+|--------|--------|----------|
+| キャッシュ雪崩 | TTLにジッターを追加 | 負荷試験で確認 |
+| ホットキー問題 | レプリカからの読み取り分散 | アクセスパターン分析 |
```

## Expected Behavior

The skill should NOT trigger findings as this design includes:

1. SLO/SLI definitions with measurable targets
2. PoC/spike validation plan
3. Load testing plan with specific targets
4. Contract testing plan
5. Canary release plan with rollback criteria
6. Rollback plan with conditions and procedures
7. DR plan
8. Monitoring and alerting plan
9. Risk mitigation with validation methods
