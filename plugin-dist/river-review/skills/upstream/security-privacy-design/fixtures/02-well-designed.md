# Test Case: Well-Designed Security/Privacy (Should Not Trigger Finding)

This test case should NOT trigger findings as it has comprehensive security/privacy considerations.

## Input Diff

````diff
diff --git a/docs/design/customer-data-platform.md b/docs/design/customer-data-platform.md
index 1111111..2222222 100644
--- a/docs/design/customer-data-platform.md
+++ b/docs/design/customer-data-platform.md
@@ -0,0 +1,113 @@
+# 顧客データプラットフォーム設計書
+
+## 背景
+
+顧客データを統合管理するプラットフォームを構築し、マーケティング施策の最適化を支援する。
+
+## 決定事項
+
+顧客データプラットフォーム (CDP) を構築し、以下の情報を管理する：
+
+- 顧客基本情報: メールアドレス、氏名、属性
+- 行動データ: サイト訪問、購買履歴
+- セグメント情報: 計算された顧客セグメント
+
+## データ保持ポリシー
+
+| データ種別 | 保持期間 | 削除トリガー |
+|-----------|----------|-------------|
+| 顧客基本情報 | 契約終了から2年 | 契約終了 + 2年経過時に自動削除 |
+| 行動データ | 収集から1年 | 1年経過時に自動削除 |
+| セグメント情報 | 計算から90日 | 90日経過時に再計算または削除 |
+| ログデータ | 90日 | 90日経過時に自動削除 |
+
+データ分類:
+- PII: メールアドレス、氏名 → 暗号化保存
+- 機密: 購買履歴 → アクセス制限
+- 一般: セグメント情報 → 標準保護
+
+## 削除リクエスト対応
+
+### 対応フロー
+
+1. ユーザーが設定画面またはサポート窓口から削除リクエスト
+2. リクエスト受付確認メール送信
+3. 14日以内に以下から削除:
+   - 本番データベース
+   - バックアップ（削除マーカー付与）
+   - ログ（匿名化処理）
+4. 削除完了通知メール送信
+
+### 例外ケース
+
+- 法的保持義務: 税務関連データは7年保持
+- 不正利用調査: 調査完了まで保持
+
+## バックアップとPII
+
+### バックアップポリシー
+
+- 日次フルバックアップ: 30日保持
+- 時間別増分バックアップ: 7日保持
+
+### PII削除対応
+
+- 削除リクエスト時: バックアップに削除マーカー付与
+- リストア時: 削除マーカーを参照し、削除済みPIIを復元しない
+- バックアップ自体の削除: 30日後のローテーションで自然削除
+
+## データレジデンシ
+
+### 保存リージョン
+
+| データ種別 | 対象ユーザー | リージョン |
+|-----------|-------------|-----------|
+| 全データ | 日本ユーザー | ap-northeast-1 (東京) |
+| 全データ | EUユーザー | eu-west-1 (アイルランド) |
+| 全データ | 米国ユーザー | us-east-1 (バージニア) |
+
+### 越境転送
+
+- 原則禁止: ユーザーデータはユーザーの所在地リージョンに保存
+- 例外: 分析処理は匿名化後に ap-northeast-1 で実施
+- 法的根拠: EU → 日本は十分性認定、その他はSCC
+
+### 規制対応
+
+- GDPR: EU居住者のデータはEUリージョンに保存
+- CCPA: カリフォルニア居住者の権利行使対応
+- 個人情報保護法: 日本居住者のデータは国内保存
+
+## 監査ログ設計
+
+### 対象イベント
+
+| イベント | 記録内容 |
+|---------|---------|
+| ログイン | user_id, timestamp, ip_address, user_agent, result |
+| データアクセス | user_id, target_data, access_type, timestamp |
+| 設定変更 | user_id, setting_name, old_value, new_value, timestamp |
+| 削除リクエスト | request_id, user_id, timestamp, status |
+
+### ログ保持
+
+- 監査ログ: 1年保持 (SOC2要件)
+- アクセスログ: 90日保持
+
+### アクセス制御
+
+- 監査ログへのアクセス: セキュリティチームのみ
+- 改ざん防止: Write-once storage
+
+## 暗号化
+
+- 保存時: AES-256 (AWS KMS)
+- 転送時: TLS 1.3
+- PIIフィールド: アプリケーションレベル暗号化
+
+## アクセス制御
+
+- 認証: OAuth 2.0 + OIDC
+- 認可: RBAC (Admin, Analyst, Viewer)
+- API: JWT トークン、有効期限1時間
+```
````

## Expected Behavior

The skill should NOT trigger findings as this design includes:

1. Data retention policy with specific periods and triggers
2. Deletion request handling flow with SLA and scope
3. Backup PII consideration with deletion markers
4. Data residency with regional storage and cross-border policies
5. Audit log design with events, retention, and access control
6. Encryption requirements
7. Access control design
