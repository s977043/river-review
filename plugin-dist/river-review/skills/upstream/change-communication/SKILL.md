---
id: 'change-communication'
name: 'Architecture Change Communication'
description: 'Ensure architecture updates document affected stakeholders, notification plan, and deprecation/retirement signals to keep knowledge aligned.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/architecture/**/*'
  - 'docs/adr/**/*'
  - 'docs/**/*design*.md'
  - 'docs/**/*architecture*.md'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
  - '**/*.adr'
tags: [architecture, communication, governance, upstream]
severity: major
inputContext: [diff, adr]
outputKind: [summary, findings, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設計変更の影響範囲・通知計画・非推奨措置をチェックリスト型で評価し、コミュニケーション漏れを防ぐ

## Goal / 目的

- 設計変更の差分から、影響範囲・通知経路・非推奨措置を共有するコミュニケーション計画が抜け落ちていないかをチェックする。

## Non-goals / 扱わないこと

- 内部通知ツール（Slack/Teams）のテンプレ作成や運用作業そのもの。
- 個別チームの予定調整（ただし通知対象に入るべきステークホルダーは指摘する）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計ドキュメント（アーキテクチャ/ADR/設計書）の変更がある
- [ ] 差分にアーキテクチャ変更・API変更・非推奨化など影響範囲を伴う記述の追加または変更がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: change-communication — コミュニケーション計画が必要な設計変更が検出されない`

## False-positive guards / 抑制条件

- すでに別 ADR/通知チャネルで整備されており、差分がその参照のみであれば重複指摘を避ける。

## Rule / ルール

- 先頭に要約を 1 行出す（影響範囲・通知・非推奨/移行の要点）。
- 指摘は最大 8 件。ステークホルダー漏れ、通知対象不明、移行/非推奨の曖昧さを優先。
- 可能なら「通知文/説明テンプレ」を添える（貼れる短文）。

## Checklist / 観点チェックリスト

- 影響範囲
  - 変更が影響するサービス/チーム/ドメインを列挙しているか。
  - オーナー/責任者（Team/Role）が明記されているか。
- 通知計画
  - 変更を知らせるチャネル（release notes, mailing list, status page 等）が決まっているか。
  - スケジュール（いつ通知し、いつ施行するか）があるか。
  - 非推奨・移行
  - 旧バージョン/機能の非推奨状況と移行締切があるか。
  - 互換性の切り分け（どのクライアント/サービスが動かなくなるか）が説明されているか。
- 継続的整合
  - ドキュメント/ADR/図の更新が必要な箇所が TODO/追跡対象としてリストされているか。
  - コミュニケーションの経路（誰が更新するか）を明示しているか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力。

- 先頭に要約行: `(summary):1: <影響範囲/通知/非推奨の要点>`
- 指摘（最大8件）:
  - `[severity=critical|major|minor|info]` を含める。
  - 可能なら「通知テンプレ」等を追加。

例:

- `docs/architecture/change.md:42: [severity=major] 公開API影響が未通知。Fix: 12月14日 15:00に release-notes へ通知予定と明記。`

## 評価指標（Evaluation）

- 合格: 影響範囲・通知計画・移行方針に抜けがないかを差分に紐づく形で指摘し、アクションに結びつく遷移案がある。
- 不合格: 一般論やオペレーションの詳細、差分と無関係なステークホルダー批判。

## 人間に返す条件（Human Handoff）

- 組織的なポリシー変更や交渉が必要な場合は人間レビューへ。
