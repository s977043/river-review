---
id: 'dr-multiregion'
name: 'Disaster Recovery & Multi-Region Readiness'
description: 'Ensure architecture docs define RPO/RTO, failover paths, data consistency, and DR drillability.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*dr*.md'
  - 'docs/**/*disaster*.md'
  - 'docs/**/*business-continuity*.md'
  - 'docs/**/*multi-region*.md'
  - 'docs/**/*resilien*.md'
  - 'pages/**/*dr*.md'
  - 'pages/**/*disaster*.md'
  - 'pages/**/*business-continuity*.md'
  - 'pages/**/*multi-region*.md'
  - 'pages/**/*resilien*.md'
  - '**/*.adr'
tags: [reliability, dr, resiliency, multiregion, upstream]
severity: major
inputContext: [diff, adr]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: DR/マルチリージョン設計の差分からRPO/RTO・フェイルオーバー・データ整合性の抜けをレビューし、逆の障害シナリオから設計を検証する。

## Goal / 目的

- アーキ/ADR の差分から、RPO/RTO、フェイルオーバー経路、データ整合性、DR 演習計画の抜けを早期に潰す。

## Non-goals / 扱わないこと

- 具体的なインフラ構築手順や IaC コードレビュー。
- アプリ/DB 製品の選定やベンチマーク比較の議論。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にDR・災害復旧・事業継続・マルチリージョン・レジリエンスに関するドキュメントが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: dr-multiregion — DR/マルチリージョン関連のドキュメント差分がない`

## False-positive guards / 抑制条件

- PoC/単一リージョン前提と明記されている場合は、過剰な DR 目標を要求しない。

## Rule / ルール

- 先頭に要約を 1 行出す（対象/目標 RPO-RTO/切替方式の要点）。
- 指摘は最大 8 件。RPO/RTO 未定義、フェイルオーバー手順欠如、データ整合/リプレイ/バックフィル不明を優先。
- 可能なら「切替/ロールバック手順」の追記案を付ける。

## Checklist / 観点チェックリスト

- 目標とスコープ
  - 対象システム/データごとの RPO / RTO / 復旧順序が定義されているか。
  - DR タイプ（active-active / warm standby / cold）と前提が明記されているか。
- レプリケーションとデータ整合
  - 同期/非同期の選択理由と遅延・データ損失許容範囲が書かれているか。
  - スプリットブレイン防止、競合解決、再同期/バックフィル手順があるか。
- トラフィック切替と依存関係
  - 切替方式（DNS/GLB/feature flag）と検知条件・TTL・ヘルスチェックが定義されているか。
  - 外部依存（DB/Queue/外部 API）が単一リージョンの SPOF になっていないか、代替経路があるか。
- 手順と演習
  - フェイルオーバー/フェイルバック手順、役割分担、ロールバック条件が記載されているか。
  - DR 演習の頻度/成功条件/ログ（どこに記録するか）が定義されているか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約行: `(summary):1: <RPO/RTO・切替方式・データ整合の要点>`
- 指摘は最大 8 件:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら「切替/ロールバック手順の追記案」を 1 行付ける。

例:

- `docs/adr/dr-plan.md:42: [severity=major] RPO/RTO が未定義。Fix: 支払い系は RPO=5m/RTO=30m、在庫系は RPO=15m/RTO=60m と明記し、復旧順序を追記。`

## 評価指標（Evaluation）

- 合格: 差分に紐づく DR/マルチリージョンの目標・切替・データ整合の不足を優先度付きで指摘し、追記案がある。
- 不合格: 差分と無関係な一般論、ツール押し付け、過剰な指摘数。

## 人間に返す条件（Human Handoff）

- 目標 RPO/RTO がビジネス/法令/BCP 方針と衝突する場合や、組織判断が必要な場合は人間レビューへ。
