---
id: 'availability-architecture'
name: 'Availability & Resilience Architecture'
description: 'Ensure architecture docs capture availability targets, failover strategy, capacity headroom, and resilience trade-offs for critical services.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/architecture/**/*'
  - 'docs/adr/**/*'
  - 'docs/**/*design*.md'
  - 'docs/**/*availability*.md'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
  - '**/*.adr'
tags: [availability, resilience, sre, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 可用性・復旧設計の抜け漏れをチェックリスト型で評価し、運用リスクを事前に可視化する

## Goal / 目的

- 変更対象の設計ドキュメントから可用性目標・冗長性・復旧手順・容量バッファが漏れていないかをチェックし、運用で詰まらない状態にする。

## Non-goals / 扱わないこと

- 個別インフラ製品（クラウドプロバイダ等）の設定レビュー。
- 実装コードやライブラリのパフォーマンス最適化。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計ドキュメント（アーキテクチャ/ADR/設計書）の変更がある
- [ ] 差分に可用性・冗長性・復旧・容量に関わる記述の追加または変更がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: availability-architecture — 可用性設計に関わる変更が検出されない`

## False-positive guards / 抑制条件

- ドキュメントが PoC/実験系で、本番可用性を担保する責務が無いと明記されている場合は強度を下げる。

## Rule / ルール

- 要点を 1 行要約（可用性目標/フェイルオーバー/容量の要点）。
- 指摘は最大 8 件。SLO・復旧手順・容量余裕・劣化モードを優先。
- 可能なら「運用手順テンプレ」を付ける。

## Checklist / 観点チェックリスト

- 可用性目標と測定
  - 重要パスの SLI/SLO（p99, error rate 等）が定義されているか。
  - 計測方法・除外条件・観測範囲があるか。
- フェイルオーバーと復旧
  - 障害時の切り替え手順（自動/手動）と判定メトリクスがあるか。
  - リカバリタイム（RTO）・リカバリポイント（RPO）の目標があるか。
- 容量と冗長
  - トラフィック/データ量のピーク前提とスケール戦略があるか。
  - データセンタ/リージョン冗長の扱いや、段階的スケール案があるか。
- 劣化モードと観測性
  - 劣化時の挙動（バックプレッシャー、Graceful degradation）が説明されているか。
  - 異常時に見るべきメトリクス/ダッシュボード/アラートが列挙されているか。

## Output / 出力フォーマット

日本語で `<file>:<line>: <message>` 形式。

- `(summary):1: <可用性/復旧/容量の要点>` を先頭に。
- 指摘には `[severity=critical|major|minor|info]` を含め、可能なら追記案を一行付加。

追記テンプレ例:

- `SLO: service=<>, metric=p99 latency, target=<>, measurement=<dash>`
- `Failover: trigger=<>, action=<>, verification=<logs>`
- `Capacity: peak=<>, headroom=<>, scaling=<policy>`

## 評価指標（Evaluation）

- 合格: 実運用の可用性要件・手順が差分に紐づく形で指摘され、追記案がある。
- 不合格: 実装/ツール選定の主張、差分無関係な一般論。

## 人間に返す条件（Human Handoff）

- リスク/目標がビジネス/規制判断に跨る場合は人間レビューへ。
