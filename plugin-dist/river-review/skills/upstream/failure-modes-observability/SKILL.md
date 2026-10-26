---
id: 'failure-modes-observability'
name: Failure Modes & Observability in Design
description: Ensure designs specify failure modes, timeouts, error contracts, and observability for critical flows.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/api/**'
  - '**/routes/**'
  - 'docs/**/*'
  - 'pages/**/*'
tags: [reliability, observability, api, design, upstream]
severity: major
inputContext: [diff]
outputKind: [findings, actions, questions, summary]
modelHint: balanced
dependencies: [repo_metadata, tracing]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設計の差分から失敗モード・エラー契約・観測性の抜けをレビューし、障害シナリオを逆照射してクリティカルフローの堅牢性を検証する。

## Rule / ルール

- クリティカルフロー（認証、課金、データ保存など）の**失敗モード**（タイムアウト、リトライ、フォールバック、外部障害、権限不備）を明示する。
- エラー応答（ステータス、エラーコード、message/detail）の**契約**を一貫させ、クライアントが判断できる形にする。
- SLO/監視、ログ、メトリクス、トレースなどの**観測性**を設計に含める。

## Heuristics / 判定の手がかり

- 外部依存（DB/HTTP/Queue）の失敗時に「何が起きるか」が仕様に無い（例: リトライ方針、タイムアウト、冪等性）。
- 4xx/5xx の使い分け、エラー構造がエンドポイントごとに不揃い。
- Rate limit / backoff / circuit breaker の前提があるのに、設計/ADR で触れられていない。
- 障害時の切り分けに必要なログ（相関ID、requestId、重要な属性）やメトリクスの設計が無い。

## Questions / 確認質問（不明な場合は質問として出す）

- 代表的な失敗モード（タイムアウト、外部 5xx、バリデーション、権限、競合）はどれですか？
- 冪等性キーやリトライ可否の判断はどこで担保しますか？
- 監視対象（SLO、エラーバジェット、アラート条件）はありますか？

## Actions / 改善案

- タイムアウト値、リトライ回数、バックオフ、フォールバックを ADR/設計に追記する。
- エラー応答の共通スキーマ（code/message/detail/requestId など）を定義し、例を載せる。
- クリティカルフローに相関IDを付与し、ログ/トレースのキーを設計に含める。

## Non-goals / 扱わないこと

- 実際の監視基盤やアラート運用の構築。
- 既存プロダクション障害の原因究明。
- 実装詳細（ログライブラリ選定など）の決定。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にAPI定義・ルート定義・設計ドキュメントのいずれかが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: failure-modes-observability — 失敗モード/観測性に関連する設計差分がない`

## False-positive guards / 抑制条件

- 失敗モード/観測性が別 ADR で既に合意され、差分が参照更新のみ。
- 影響範囲がローカルな試験コードで、運用対象外と明記されている。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
