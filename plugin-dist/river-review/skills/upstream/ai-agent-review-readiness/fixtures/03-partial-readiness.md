# Task: API Rate Limiting Implementation

Claude Code にレート制限ロジックの実装を委任する。

## Goal

認証済み API エンドポイントにリクエストレート制限を追加する。

## Success criteria

- `/api/v1/**` の全エンドポイントで毎分 100 リクエスト制限が適用される
- 制限超過時は HTTP 429 と `Retry-After` ヘッダーを返す
- 既存のテストが全てパスする

## Non-goals

- WebSocket 接続へのレート制限（別タスク #789）
- IP ベースのブロッキング（セキュリティチームが別途対応）

## Review perspectives

- Correctness: 制限カウントのリセットタイミング（秒境界 vs スライディングウィンドウ）
- Performance: Redis 呼び出しのレイテンシ影響

## Required context

アーキテクチャ規約（`docs/architecture/api-design.md`）および既存ミドルウェア実装（`src/middleware/`）を参照すること。
Redis クラスターの接続設定は `docs/ops/redis.md` を確認。

<!-- expected:
findings:
  - check: 3
    severity: major
    reason: self-review → external review ループが未定義
  - check: 4
    severity: critical
    reason: Redis 設定変更・本番操作に対する人間承認ステップが未定義
-->
