---
id: 'logging-observability'
name: Logging and Observability Guard
description: Ensure code changes keep logs/metrics/traces useful for debugging failures and regressions.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'app/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'lib/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'packages/**/*.{ts,tsx,js,jsx,mjs,cjs}'
tags:
  - observability
  - logging
  - reliability
  - midstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - actions
modelHint: balanced
dependencies:
  - tracing
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: ログ・メトリクス・トレースの品質をチェックリスト型で評価するが、可観測性に無関係な変更では実行不要

## Guidance

- Flag swallowed exceptions or catch blocks without logging/propagation.
- Require structured logs/metrics/traces with request IDs and minimal PII on new error paths.
- Ensure retries/fallbacks/cache branches emit signals for hit/miss/attempt counts.
- Highlight noisy or contextless logs that hinder debugging.
- **既存マスク不変条件の迂回**: 新設の debug/log/artifact 出力・保持経路（例: パース失敗調査用に raw レスポンスを `debug.*` へ格納する、新しい診断ログを追加する）が、同種データの既存経路（パース済み・表示用データ）が通しているマスク処理（redact/mask 関数）を迂回していないか確認する。検出の問い: 「この diff が新設する出力・保持経路は、同種データの既存経路が通しているマスク処理を通っているか」。修正の定石は出力側（print/log 文）ではなく**格納段階**（値を変数やオブジェクトのプロパティへ代入する時点）で redact 関数を適用すること — これにより将来の全ての消費者（CI ログ、artifact export 等）が一律にマスク済みの値を受け取る。詳細は Origin を参照。

## Non-goals

- ログ基盤の選定や詳細設計の議論は避ける。
- 既存のログ出力に対する一般論的な「secret をログに出すな」指摘（マスク処理の迂回を伴わないもの）は対象外。プロジェクト固有の secret パターン検出は `security-basic` / secret 検出系スキルが担う。本項目は**新設の出力経路が既存のマスク不変条件を迂回しているか**という差分固有の観点に限定する。

## Origin / 由来

- `debug.rawLlmOutput` が #1529 で追加された際、パース失敗調査のために raw な LLM レスポンスを格納したが、`parseLineComments` がパースした表示用コメントには既に適用されていた `redactSecrets` を経由せず、raw レスポンスをそのまま格納していた。CI ログ出力（`printDebugInfo`）を経由して secret が露出する経路になっていた。gemini のセキュリティレビューコメントで発見され、テストでは検知されなかった。修正は出力側ではなく格納時点（`src/lib/review-engine.mjs` の代入行）で `redactSecrets` を適用する形（`debug.rawLlmOutput = redactSecrets(output)`）に是正された（fix commit `ca7eaa3b`）。
- 出典: `AGENT_LEARNINGS.md` 2026-07-12 エントリ3、PR #1529（gemini security-high レビューコメントと修正コミット）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にアプリケーションコード（`src/`, `lib/`, `*.js`, `*.mjs`, `*.ts`, `*.tsx`）の変更が含まれている
- [ ] 差分にエラーハンドリング、ログ出力、リトライ/フォールバック/キャッシュのいずれかに関連するコードが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: logging-observability — 可観測性に関連するアプリケーションコード変更が検出されない`

## False-positive guards

- テスト用の意図的な無視や既に文脈付きで再 throw している場合は指摘しない。
- 新設の debug/log/artifact 出力経路が、値の**格納段階**で既に redact/mask 関数（`redactSecrets` 等）を通した後の値を保持・出力している場合は指摘しない（例: `debug.rawX = redactSecrets(raw)` のように代入時点でマスク済み）。
