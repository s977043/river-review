---
id: 'ai-agent-review-readiness'
name: 'AI Agent Review Readiness'
description: 'Checks whether AI-assisted work defines review criteria, accessible context, explicit review loop, human judgment boundary, and feedback capture before delegating to an agent.'
version: '0.1.0'
category: upstream
phase:
  - upstream
  - midstream
tags: [ai-agent, delegation, review-design, human-in-the-loop, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
applyTo:
  - 'docs/**/*'
  - '**/*plan*.md'
  - '**/*task*.md'
  - '**/*spec*.md'
  - '**/*agent*.md'
  - '**/*workflow*.md'
  - '**/*pbi*.md'
  - '**/*todo*.md'
  - '.github/ISSUE_TEMPLATE/**/*.md'
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Gate
Why: AI エージェント委譲の文脈があるドキュメントを対象に、委譲前の readiness を統合的にチェックする。Pre-execution Gate で適用対象を絞り込む。

## Goal / 目的

- AI エージェントに作業を委譲する前に、チームが「何を作るか」「どう判定するか」「どこに人間が介在するか」を明示しているかをチェックする。
- 委譲前の設計不足を早期に検出し、AI が推測で実装することを防ぐ。

## Non-goals / 扱わないこと

- 受入条件の Given-When-Then 形式チェック → `requirements-acceptance` の責務。
- 実装計画の危険操作・Stop-work トリガー → `plan-review-gate` の責務。
- plan.md / pbi-input.md 間の整合性 → `plangate-plan-integrity` の責務。
- PlanGate ファイル（plan.md / pbi-input.md）への依存は持たない。

## Pre-execution Gate / 実行前ゲート

以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] diff に AI エージェントへの作業委譲・タスク委任の文脈が含まれている
      （キーワードは大文字小文字を区別しない。例: "agent", "delegate", "AI にやらせる",
      "Cursor", "Claude Code", "Aider", "agentic", "ai-assisted", "LLM", "copilot",
      "GPT", "Gemini", "自動実行", "委任", "委譲" 等が **委譲・自動実行の意図** を伴って
      使われている。一般的な自動化（CI/CD 説明等）には適用しない）
- [ ] inputContext に diff が含まれている

ゲート不成立時の出力: `NO_REVIEW: ai-agent-review-readiness — AI 委譲の文脈が見当たらない`

## False-positive guards / 抑制条件

- AI ツールの紹介・説明文書（「AI を使うと便利」という一般論のみ）では起動しない。
- 変更ログ・リリースノート（CHANGELOG.md, RELEASES.md 等）では起動しない。
- 既に 5 つの readiness 条件（基準・コンテキスト・ループ・境界・フィードバック）がすべて明示されている文書では findings を出さない。

## Evidence / 根拠の取り方

- 推測ではなく、差分のテキストから直接引用して根拠にする。
- 欠落指摘（セクションが存在しない）は文書全体を確認してから行う。
- キーワード一致だけでなく、委譲意図の文脈を確認してから Gate を通過させる。

## Rule / ルール

### Check 1 — Review criteria before work / 作業前レビュー基準の定義

AI 委譲タスクの文書に以下が定義されていない場合に finding を出す:

- 成功基準（何ができれば完了か）
- 受入条件・非ゴール
- レビュー観点・期待する review perspective

### Check 2 — Required knowledge access / 必要なコンテキストへのアクセス

エージェントが参照すべき設計コンテキストへの参照が明示されていない場合:

- アーキテクチャ規約・ADR
- API コントラクト・スキーマ
- セキュリティ要件・運用制約

判定閾値: セクション名（例: "## 前提条件"）やドキュメント種別名による参照で足りる。
ファイルパスの完全指定は必須ではない。

### Check 3 — Explicit review loop / 明示的なレビューループ

実装ステップの後に自己レビュー・外部レビュー・修正のステップが明示されていない場合:

- 期待ループ: plan → execute → self-review → external review → revise

### Check 4 — Human judgment boundary / 人間判断境界の明示

以下の高リスク領域で AI 出力を final として扱う場合（人間承認ステップが明示されていない）:

- セキュリティ変更・認証・権限
- マイグレーション・破壊的操作
- 依存関係の追加・削除
- 本番操作・データ変換

### Check 5 — Feedback capture / フィードバック再利用の設計

AI エージェントによる作業完了後に、レビューで発見した問題・改善点・パターンが記録・再利用可能な形で残される設計が明示されていない場合:

- レビュー結果・発見した問題パターンの記録先（例: memory ファイル・ADR・振り返りノート）
- 同種の AI 委譲タスクで同じ問題が繰り返されないための仕組み

省略してよいケース: 初回の実験的委譲タスク、フィードバック記録先が別途存在し参照が明示されている場合。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <AI 委譲 readiness の全体評価>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める（原則: major 以上を優先）。
  - 各 finding に: 欠落している readiness 条件 / なぜ重要か / 推奨するアクション を記載する。

例:

- `(summary):1: AI 委譲タスクに成功基準・レビューループ・人間承認ステップが不足している。`
- `docs/task.md:12: [severity=major] 成功基準が未定義。Fix: "## Success criteria" セクションを追加し、完了の定義を明示してください。`
- `docs/task.md:18: [severity=major] self-review → external review ループが未定義。Fix: "## Review loop" セクションを追加し、実装後の確認フローを明示してください。`

## 評価指標（Evaluation）

- 合格基準: AI 委譲の文脈を確認したうえで、5 つの readiness 条件（基準・コンテキスト・ループ・境界・フィードバック）の欠落を優先度付きで指摘し、貼れる追記案が付いている。
- 不合格基準: AI 委譲文脈のない文書への適用、差分と無関係な一般論、根拠のない断定。

## 人間に返す条件（Human Handoff）

- 高リスク領域（セキュリティ・本番操作）の AI 委譲で人間承認ステップが未定義の場合、`[severity=critical]` として人間レビューへ返す。
