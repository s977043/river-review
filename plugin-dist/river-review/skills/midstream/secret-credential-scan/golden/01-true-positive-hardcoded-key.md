# Expected Output: Hardcoded API Key / Credential

## Summary

(secret-scan):1: [要約] 最も重大な機密混入は `src/services/payment.ts` への Stripe ライブ秘密鍵のハードコード（即時ローテーションと履歴除去が必要）。

## Findings

- `src/services/payment.ts:5`: [severity=major] [機密混入1] Stripe ライブ秘密鍵のハードコード
  - 種別: API キー
  - 混入: `STRIPE_SECRET_KEY = 'sk-live-****'`（接頭辞 `sk-live-`・本物の鍵長）が追加(`src/services/payment.ts:5`)
  - 影響: 決済 API の全権限奪取・不正課金のリスク
  - Fix: `process.env.STRIPE_SECRET_KEY` 参照に戻し値を Secrets へ移動、コミット履歴から除去して鍵をローテーション、CI に secret-scan(gitleaks 等) を導入

- `src/services/payment.ts:7`: [severity=major] [機密混入2] GitHub Personal Access Token / AWS アクセスキー
  - 種別: トークン / credential
  - 混入: `GITHUB_TOKEN = 'ghp_****'`（接頭辞 `ghp_`）および `AWS_ACCESS_KEY_ID = 'AKIA****'`（接頭辞 `AKIA`）が追加(`src/services/payment.ts:7-8`)
  - 影響: リポジトリ / クラウドリソースへの権限奪取
  - Fix: 環境変数・Secrets へ移動、トークン/キーを失効・再発行、履歴から除去、CI に secret-scan(gitleaks 等) を導入

- `config/runtime.env:2`: [severity=major] [機密混入3] .env 実値（DB パスワード・OpenAI API キー）
  - 種別: .env 実値 / credential
  - 混入: `DATABASE_URL=postgres://app:****@db.internal:5432/prod` と `OPENAI_API_KEY=sk-proj-****`（接頭辞 `sk-proj-`）が新規 `config/runtime.env` に追加(`config/runtime.env:1-2`)
  - 影響: 本番 DB 認証情報・LLM API キーの漏洩
  - Fix: `config/runtime.env` をコミット対象から外し（`.gitignore` 追加）Secrets へ移動、DB パスワードと API キーをローテーション、CI に secret-scan(gitleaks 等) を導入
