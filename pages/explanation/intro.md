---
id: intro
title: River Review へようこそ
---

River Review (RR) は、**チームのレビュー判断を skill として明示化・バージョン管理し、SDLC の各ゲートで実行する OSS フレームワーク**です。

中核思想は **Review Judgment as Code** です。現在の River Review は、チームの判断基準を所有・実行・改善する **Review Judgment Platform / team-owned audit layer** として位置付けています。

このページは、はじめての方向けの短い導入です。課題認識・コアモデル・責任境界・目指さないものを含むコンセプトの全体像は [コンセプト](./concept.md) にまとめています。

River Review は、PR の差分だけを見るツールではありません。AI 支援開発で発生する **要件・設計・計画・差分・レポート** をレビュー対象として扱い、作業に入る前から完了後まで、チームの判断基準を一貫して適用します。

基盤となる考え方は変わりません。チームの暗黙知を versioned / repo-owned な **Skill（Skill Registry）** へ落とし込み、共有資産として再利用します。River Review はこの基盤を、次の 3 つの主軸として提供します。

- **capability pack**: AI エージェントのレビュー能力を強化するスキル / エージェント定義のまとまり。通常は LLM キー不要で、ヘッドレスな GitHub Action / `river run` のときだけ LLM キーが要る。
- **レビュースキル（Skill Registry）**: チームの判断基準を versioned / repo-owned な Skill として共有資産化する基盤。
- **review team**: レビュー専用エージェント（`agents/river-review.md`）と、観点別レビュアーを並列実行する review team。generate → review → revise の反復では verdict 付き critic として review ステージを担う。

## River Review がレビューするもの

| 対象     | 目的                                                     | 例                                     |
| -------- | -------------------------------------------------------- | -------------------------------------- |
| 要件     | 目的・成功条件・スコープの曖昧さを減らす                 | Issue、PBI、ユーザー要求、受け入れ条件 |
| 設計     | 既存設計との整合性、責務分離、過剰実装を確認する         | ADR、設計メモ、アーキテクチャ方針      |
| 計画     | 作業分割、リスク、検証方針が実装前に揃っているか確認する | Plan、Work Packet、テスト方針          |
| 差分     | 実装が要件・設計・計画と整合しているか確認する           | PR Diff、変更ファイル、テスト差分      |
| レポート | 判断根拠、検証結果、未解決事項が残っているか確認する     | Final Report、レビュー結果、Evidence   |

このため、River Review は **実行前レビュー** と **実行後レビュー** の両方に使えます。実装前には要件・設計・計画を確認し、実装後には差分・テスト・レポートを確認します。

## コアモデル

- **Skills define judgment** — skill は「どんなレビュー判断を行うか」を YAML frontmatter + Markdown で記述する。`schemas/skill.schema.json` で検証され、requirements / design / plan / diff / tests / report / security / a11y / migration / dependency などの基準を載せる。
- **Gates execute judgment** — SDLC の各ゲートで、対象アーティファクトに応じた skill を実行する。PR 完成後だけでなく、要件整理・設計・実装計画・検証・完了報告のいずれでも動かせる。
- **Riverbed remembers judgment** — レビュー結果や決定は operating memory として残り、suppression や過去判断の再利用を通じて将来のレビューを一貫させる（[Riverbed Memory](./riverbed-memory.md)）。

## Review Coverage

River Review は、**「findings が 0 件だった」と「必要なレビューが完了した」を別の概念として扱います**。

Experimental な Review Coverage Contract は、review unit ごとの完了状態を machine-readable に記録します。`completed` / `failed` / `timed_out` などを保持し、レビュー実行の完遂性を `complete` / `partial` / `not_executed` として観測できます。

現段階では observe-only です。Review Coverage 自体は Gate / decision を変更せず、レビュー実行の完全性を確認するための観測情報として扱います。

このドキュメントでは以下をカバーします。

- **Explanation**: River Review の設計思想と 3 層モデルの詳細
- **Tutorials**: skill 作成など手を動かす手順
- **How-to**: GitHub Actions 連携やトレーシングなどの実践ガイド
- **Reference**: スキーマや設定のリファレンス

次に読むページは目的によって分かれます。コンセプトの全体像は [コンセプト](./concept.md)、機能・利用方法・実行モデルは [River Review とは](./what-is-river-review.md) を参照してください。レビュー対象の整理は [レビュー対象と使いどころ](./review-scope.md) にまとめています。人間監督を崖・丘・原っぱの 3 階層で配分する考え方は [Human Judgment Focus](./human-judgment-focus.md) が扱います。コンセプトの内部 SSoT は repo root の [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md) です。
