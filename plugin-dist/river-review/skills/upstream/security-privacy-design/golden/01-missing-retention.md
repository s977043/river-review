# Expected Output: Missing Retention Policy

## Summary

(summary):1: ユーザープロファイルサービス設計において、データ保持ポリシー、削除リクエスト対応、バックアップPII考慮、データレジデンシ、監査ログ保持期間が欠如しています。

## Findings

- `docs/design/user-profile-service.md:10-16`: [severity=major] データ保持ポリシーが定義されていません。PII（メールアドレス、氏名、電話番号、住所）を保存する設計ですが、保持期間の定義がありません。Fix: `## データ保持ポリシー\n- アクティブユーザー: 無期限\n- 非アクティブユーザー: 最終ログインから2年で自動削除\n- ログデータ: 90日\n- バックアップ: 30日ローテーション`

- `docs/design/user-profile-service.md:10-16`: [severity=major] 削除リクエスト対応（GDPR「忘れられる権利」）が記載されていません。ユーザーがデータ削除を要求した場合の処理フローが必要です。Fix: `## 削除リクエスト対応\n- 受付: ユーザー設定画面 / サポート窓口\n- 対象: 本番DB (users, user_activity_logs)、バックアップ、ログ\n- SLA: 14日以内\n- 通知: 削除完了メール\n- 例外: 法的保持義務（税務関連等）`

- `docs/design/user-profile-service.md:47-50`: [severity=warning] バックアップにおけるPII残存が考慮されていません。日次バックアップの設計がありますが、PII削除時のバックアップ対応が記載されていません。Fix: `## バックアップPII対応\n- バックアップ保持期間: 30日\n- PII削除時: バックアップに削除マーカー付与\n- リストア時: 削除済みPIIの復活を防ぐチェック\n- ローテーション: 30日後に自然削除`

- `docs/design/user-profile-service.md:18-21`: [severity=warning] データレジデンシが明示されていません。AWS上でデータを保存する設計ですが、保存リージョンの記載がありません。Fix: `## データレジデンシ\n- 保存リージョン: ap-northeast-1 (東京)\n- 越境転送: なし（日本国内のみ）\n- 規制対応: 個人情報保護法準拠`

- `docs/design/user-profile-service.md:37-45`: [severity=warning] 監査ログ（user_activity_logs）の保持期間が定義されていません。ログイン履歴、操作履歴を記録する設計ですが、保持期間とアクセス制御が不明確です。Fix: `## 監査ログ設計\n- 対象: ログイン、データアクセス、設定変更\n- 保持期間: 1年 (コンプライアンス要件)\n- アクセス制御: セキュリティチームのみ\n- 改ざん防止: Write-once storage`
