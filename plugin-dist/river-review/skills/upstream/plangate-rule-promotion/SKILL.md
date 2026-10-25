---
id: 'plangate-rule-promotion'
name: PlanGate ルール昇格判定
description: 運用で発見されたレビューパターン (findings / retrospective) を分析し、新 skill への昇格候補 / 既存 skill 更新候補 / 人間判断が必要な項目に分類する
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/review-self.md'
  - '**/review-external.md'
  - '**/retrospective.md'
  - '**/decision-log.md'
tags: [plangate, rule-promotion, governance, skill-registry, upstream]
severity: info
inputContext: [fullFile, repoConfig]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 運用上蓄積された review findings / retrospective を観察し、再発頻度・severity・自動化可能性の観点で skill 昇格候補を抽出する分類型レビューであり、同時に「候補が既存 skill と重複する場合は昇格しない」という停止条件（Inversion）を持つ。

## Goal / 目的

- 運用で繰り返し検出されたレビューパターン（recurring findings / retrospective lesson / guardrail）を集約し、新 skill への昇格候補・既存 skill 更新候補・人間判断を要する項目に分類する。
- `docs/development/improvement-flow.md` の 8 ステップのうち「classify（Step 2）」を自動化し、PdM/運用者が Step 3 以降（ドラフト作成・PR 化）に集中できるようにする。
- 昇格閾値を明示することで「単発の失敗に対する過剰形式化」を抑制し、skill registry の肥大化を防ぐ。

## Non-goals / 扱わないこと

- 実際の skill SKILL.md をドラフトする責務（Step 3 のドラフト作成は人間または別 skill の責務）。
- 昇格候補のビジネス優先度付け（effort ヒントは出すが、意思決定は PdM の責務）。
- 単一 finding の severity 再評価（各 skill の severity 付与ロジックに委ねる）。
- retrospective に書かれた個々の incident の根本原因分析（`improvement-flow.md` Step 1 の責務）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 入力として `review-self` / `review-external` / `findings-pool` artifact（`pages/reference/artifact-input-contract.md` 参照） のいずれか1つ以上が解決できている、または `retrospective` / `decision-log` のいずれかが解決できている
- [ ] inputContext に `fullFile` が含まれ、対象アーティファクトの本文が読み取れる

ゲート不成立時の出力: `NO_REVIEW: plangate-rule-promotion — 昇格判定に必要な findings プールまたは retrospective 入力が不足`

**Gate と抑制条件の違い:**

- Gate = 昇格判定の母集団（findings プールまたは human-attested retrospective）が無ければ判定自体が成立しないので実行しない。
- 抑制条件 = 実行した上で、個別候補の指摘を却下する（例: 既存 skill が既にカバー済み）。

## False-positive guards / 抑制条件

- 既存 `skills/*/SKILL.md` の `name` / `description` / `tags` にカバー済みと判定される候補は昇格提案しない（`skill-gap: <既存 skill id>` として却下理由付きで `[q]` 出力する）。
- 単発（1 件のみ）の finding で retrospective / decision-log のいずれにも言及がない候補は昇格しない（`improvement-flow.md` アンチパターン「1 回しか起きていない incident」を踏襲）。
- "ビジネス判断" / "事業価値判断" / "個別顧客合意" といった広範な業務判断を要するパターンは自動化困難として却下する（`[q]` 出力）。
- `retrospective.md` 内で "WONTFIX" / "不採用" / "見送り" と明記された項目は候補から除外する。

抑制時の出力: 該当候補を `(proposal):` ではなく `[q]` として却下理由付きで 1 件 1 行出力する。

## Rule / ルール

母集団から候補を抽出し、以下の**すべて**を満たすものだけを昇格候補（`(proposal):`）として出力する。満たさない場合は `[q]` で理由を返す。

### 1. Frequency / 再発頻度

- 同一 root-cause パターンが `findings[]` に **3 件以上** 観測されている、または `retrospective.md` / `decision-log.md` に明示的に 1 件以上記載されている。
- 「同一 root-cause」は finding の message / rule-id / 対象ファイルパスの類似性で判定する（完全一致ではなく語彙近似で良い）。

### 2. Severity / 深刻度

- 候補の母集団 finding のうち、少なくとも 1 件が severity `major` 以上（external vocab の `major` / `critical`、または内部語彙の `warning` / `blocker`）であること。
- `minor` / `info` のみで構成されるパターンは昇格しない（skill 化のコストに見合わない）。

### 3. Automatability / 自動化可能性

- 決定的な artifact チェック（例: "frontmatter に X フィールドが存在するか"）、または制約された LLM 判定（例: "diff 内の関数名と plan の作業項目が対応するか"）として表現できること。
- 「広範な業務判断」「個別ケースごとの事業合意」を要するルールは自動化不可として却下する。

### 4. Non-overlap / 既存 skill との非重複

- 既存の `skills/*/SKILL.md` の `name` / `description` / `tags` を走査し、候補パターンがカバー済みでないことを確認する。
- 既存 skill に対する **更新提案**（新しい rule 項目の追加等）として成立する場合は、新規 skill ではなく「既存 skill 更新候補」として出力する。

### 5. Proposal 構造化

上記 4 条件を満たした候補は、以下の要素を持つ 1 行として出力する:

- 提案 `skill id`（kebab-case, 未採番）
- 対象 `category`（`upstream` / `midstream` / `downstream`）
- 1 行 `description`
- 根拠 evidence（どの findings / retrospective 段落が候補を誘発したか）
- 概算 severity と `applyTo` glob 提案
- effort ヒント（S / M / L） — PdM 向け参考値で enforcement はしない

## Evidence / 根拠の取り方

- 各 `(proposal):` は根拠となる具体的 finding の参照（`<file>:<line>` または `rule-id`）を最低 1 件、retrospective 言及がある場合は該当段落見出しを併記する。
- 「既存 skill と重複」を却下理由とする場合は、対象 skill id を名指しする（抽象的な "既存にありそう" は禁止）。
- 推測に基づく昇格は禁止。母集団に存在しない root-cause を発明しない（`review-core` ルール遵守）。

## Output / 出力

すべて日本語。`<file>:<line>: <message>` 形式。

- 先頭に要約 1 行: `(summary):1: 昇格候補 <N> 件 / 却下 <N> 件 / 質問 <N> 件`
- 個別候補は最大 8 件:
  - 形式: `(proposal):<n>: [severity=info] <proposed-id>: <description>. Evidence — findings: <refs>, skill-gap: <existing skill or "none">. Fix: 新規 skill or 既存 skill 更新の proposal として issue 化 (推奨 category=<x>, applyTo=<glob>, effort=<S|M|L>)`
  - `severity` は原則 `info`（advisory）。安全性・データ欠損リスク等を含むパターンに限り `major` に引き上げて良い。`critical` は使用しない（昇格判定自体は blocker ではない）。
- 却下は `[q]` 形式で 1 件 1 行: `(questions):<n>: [q] <却下対象>: <却下理由 — 例: business-judgment-only / overlap=<existing skill> / frequency=1 のみ>`

例:

- `(summary):1: 昇格候補 2 件 / 却下 3 件 / 質問 1 件`
- `(proposal):1: [severity=info] rr-upstream-pr-body-required-sections-001: PR body に "背景" "テスト計画" セクションが欠落していないか検査する. Evidence — findings: review-external.md:42, review-external.md:88, retrospective.md#PR-review-pain, skill-gap: none. Fix: 新規 skill の proposal として issue 化 (推奨 category=upstream, applyTo="**/PULL_REQUEST_TEMPLATE.md", effort=S)`
- `(questions):1: [q] "Blocker のみマージ条件にする" ルールの自動化: business-judgment-only — PdM 判断を要するため skill 化は見送り`

## Severity の割り当て方針

- 外部語彙（`critical` / `major` / `minor` / `info`）を使用。昇格提案はあくまで advisory であり、`info` を基本とする。
- 安全性・データ欠損・セキュリティに直結するパターン、かつ再発が継続している場合に限り `major` に引き上げる。
- `critical` は使用禁止（ルール昇格の提案自体が実装 blocker になることはない）。
- 不明値は `major` に fallback（`review-core` ルール準拠）。

内部語彙との対応は、プロジェクト標準の Severity マッピング（blocker→critical, warning→major, nit→minor, info→info）に従う。詳細は `docs/review/output-format.md`（severity の SSoT）を参照。

## Heuristics / 判定の手がかり

- `review-self.md` / `review-external.md` の `findings[]` 配列内で、同じ `rule-id` / 類似 `message` が 3 件以上並ぶパターン。
- `retrospective.md` 内の「再発」「また」「繰り返し」「何度目か」などの表現が付随する段落。
- `decision-log.md` で「次回から〜」「今後は〜」と未来行動を約束している項目。
- 既存 `skills/` ディレクトリのサブカテゴリ（`upstream/` / `midstream/` / `downstream/`）と候補の作用フェーズの対応。
- `improvement-flow.md` の「成果物の分類」テーブル（CLAUDE.md guard / `.claude/commands/` / `docs/development/` / auto-memory）と、昇格候補が本当に skill で表現すべきか別の成果物の方が適切かの判定。

## 評価指標（Evaluation）

- 合格基準: 各 `(proposal):` が具体的 findings 参照を含み、4 つの昇格条件（frequency / severity / automatability / non-overlap）すべてへの言及があり、effort と applyTo が明示されている。
- 不合格基準: findings 参照のない抽象提案、既存 skill との重複検査を行っていない提案、`critical` severity の昇格提案、ビジネス判断型ルールの自動化提案。

## 人間に返す条件（Human Handoff）

- 候補パターンが「skill 昇格」ではなく `CLAUDE.md` の AI Misoperation Guard / `.claude/commands/*.md` / `docs/development/*.md` / auto-memory のどれで表現すべきか判断が必要な場合（`improvement-flow.md` Step 2 の分類判断）。
- 業務判断・事業価値判断を含み自動化不可と判定された候補（`[q]` として理由付きで返す）。
- 既存 skill 更新として成立するが、既存 skill の責務拡張か別 skill への分割かの判断が必要な場合。
- 母集団が極端に小さく（findings 総数 < 10）、frequency ベースの判定が統計的に脆弱な場合。

## Execution Steps / 実行ステップ

1. **Gate**: `review-self` / `review-external` / `findings-pool` / `retrospective` / `decision-log` のいずれかが解決できているか確認。不成立なら `NO_REVIEW`。
2. **Aggregate**: 母集団から root-cause パターンを抽出し、同類の findings をグルーピング（message / rule-id / パスの類似で集約）。
3. **Filter**: 各グループに対し、frequency（≥3 件 or retrospective 明記）、severity（少なくとも 1 件 ≥ major）、automatability、non-overlap の 4 条件を順に評価。1 条件でも落ちれば却下理由を記録。
4. **Scan existing skills**: `skills/*/SKILL.md` の frontmatter（`name` / `description` / `tags`）を走査し、候補との重複を判定。重複時は却下または「既存 skill 更新候補」に振り分け。
5. **Compose proposals**: 残った候補に対し、proposed id / category / description / evidence / severity / applyTo / effort を組み立てる。
6. **Output**: summary 行 + `(proposal):` 最大 8 件 + `(questions):` 却下理由の順で出力。Human Handoff 条件に該当する項目は `[q]` に回す。

## 関連ドキュメント

- `docs/development/improvement-flow.md` — 学びを成果物に codify する 8 ステップのフロー。本 skill は Step 2「成果物の分類」の分類判断（特に "skill にすべきか" の判断）を自動化する。
- `pages/reference/review-policy.md` — レビュー標準ポリシー（severity / 出力形式）。
- `docs/review/output-format.md` — severity マッピングの SSoT。
- `pages/reference/artifact-input-contract.md` — 入力アーティファクトの契約。
- 姉妹 skill: `plangate-verification-audit`（verify audit findings が本 skill の母集団に流入する想定）。
- 姉妹 skill: `plangate-plan-integrity` / `plangate-exec-conformance`（PlanGate スイートの既存 2 skill、本 skill は運用フィードバックループ側を担当）。
- 消費元: `river review exec`（定期実行）および `river review verify`（post-verify 振り返り）から呼び出される想定。
