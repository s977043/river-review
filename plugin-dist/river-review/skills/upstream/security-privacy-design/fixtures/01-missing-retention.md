# Test Case: Missing Retention Policy (Should Trigger Finding)

This test case should trigger findings for missing security/privacy considerations.

## Input Diff

````diff
diff --git a/docs/design/user-profile-service.md b/docs/design/user-profile-service.md
index 1111111..2222222 100644
--- a/docs/design/user-profile-service.md
+++ b/docs/design/user-profile-service.md
@@ -0,0 +1,58 @@
+# ユーザープロファイルサービス設計書
+
+## 背景
+
+ユーザー情報を一元管理するマイクロサービスを新規構築する。
+現在、複数のサービスで個別にユーザー情報を保持しており、整合性の問題が発生している。
+
+## 決定事項
+
+ユーザープロファイルサービスを新規構築し、以下の情報を管理する：
+
+- 基本情報: メールアドレス、氏名、電話番号、住所
+- 認証情報: パスワードハッシュ、MFA設定
+- 設定情報: 通知設定、言語設定、タイムゾーン
+- 履歴情報: ログイン履歴、操作履歴
+
+## 技術スタック
+
+- PostgreSQL (RDS)
+- Redis (ElastiCache) for session cache
+- AWS Lambda + API Gateway
+
+## データモデル
+
+```sql
+CREATE TABLE users (
+    id UUID PRIMARY KEY,
+    email VARCHAR(255) NOT NULL UNIQUE,
+    name VARCHAR(100),
+    phone VARCHAR(20),
+    address TEXT,
+    password_hash VARCHAR(255),
+    mfa_secret VARCHAR(100),
+    created_at TIMESTAMP,
+    updated_at TIMESTAMP
+);
+
+CREATE TABLE user_activity_logs (
+    id SERIAL PRIMARY KEY,
+    user_id UUID REFERENCES users(id),
+    action VARCHAR(50),
+    ip_address INET,
+    user_agent TEXT,
+    created_at TIMESTAMP
+);
+```
+
+## バックアップ
+
+- 日次バックアップを実施
+- Point-in-time recovery 有効化
+
+## 次のステップ
+
+- API設計
+- 認証フローの詳細設計
+- 他サービスとの連携設計
+```
````

## Expected Behavior

The skill should detect:

1. Data retention policy is missing (email, name, phone, address stored but no retention period)
2. No deletion request handling (GDPR right to erasure not addressed)
3. Backup PII consideration missing (daily backups but no PII deletion handling)
4. Data residency not specified (AWS region not mentioned)
5. Audit log retention not defined (user_activity_logs but no retention period)
