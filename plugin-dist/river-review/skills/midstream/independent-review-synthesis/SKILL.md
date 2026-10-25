---
id: 'independent-review-synthesis'
name: Independent Review Synthesis
description: 複数の AI / 人間レビュー結果 (review-self / review-external / findings-pool) を統合し、実在性・重大度・対応優先度・merge 可否を検証する。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*'
tags:
  - community
  - review
  - synthesis
  - multi-agent
  - validation
  - hallucination-guard
  - midstream
severity: major
inputContext:
  - diff
  - fullFile
  - reviewSelf
  - reviewExternal
  - findingsPool
outputKind:
  - findings
  - summary
  - actions
modelHint: high-accuracy
---

## Goal / 目的

複数 reviewer の指摘をそのまま採用せず、差分・周辺コード・テスト・既存レビュー結果に照らして検証し、merge 判断に資する形に統合する。

入力チャネル (artifact contract 参照: [`pages/reference/artifact-input-contract.md`](../../../pages/reference/artifact-input-contract.md)):

- `diff` — 当該 PR の差分
- `review-self` — 実装者のセルフレビュー (Markdown)
- `review-external` — 外部レビュー結果 (AI / 人間、Markdown)
- `findings-pool` — 複数 Review Artifact から集約した findings 履歴 (JSON)
- `fullFile` (任意) — 該当ファイルの完全な内容

既定 CI レビューでは自動発火しない（`/challenge` 等の明示呼び出し向け）。

外部実証: [「実装したAIにレビューさせない——Claude Codeの3パス独立レビューと機械判定」](https://zenn.dev/tukiyubi/articles/289ddb13e112b9)（ピヨ助, 2026-08-03）は、実装時の会話に設計理由や試行錯誤の経緯が残る点を指摘します。そのため実装した AI が同じ変更のレビューも担う場合、自分の実装を追認する方向へ寄りやすくなります。同記事では、仕様を渡されていないレビュアーがコメントの前提と実際の処理内容との食い違いに気づき、Android 実機でのみ発生する重大な欠陥を発見しました。同じ箇所は、仕様を持つレビュアーには「設計どおり」に見えていたと述べられています。この事例は、reviewer / sourceKind といった出典の独立性を保ったまま統合するという本スキルの前提を裏付ける一次データとして参照できます。

外部実証（続報）: [「ループエンジニアリング実践ガイド (3/3) AI レビューの限界と本番化の境界」](https://zenn.dev/motowo/articles/loop-engineering-practice-guide-3)（タカシ, 2026-08-26）は、役割を割り当てた 9 名の並列レビューについて報告します。1 名を除く全員が同じモデルファミリで、違いは役割の指示だけでした。著者は「学習コーパスを共有するモデルは誤りが相関し、多数決の前提が崩れます」と述べ、役割の多様性がモデル多様性の代わりにならなかったと結論しています。単体では正しいものの並列時に矛盾する箇所へ気づいたレビュアーは、9 名中 1 名のみでした。この観測は、多数決で finding の採否を決めないという本スキルの Non-goals と、reviewer の出典独立性を保つ前提を裏付ける一次データとして参照できます。

## Non-goals / 扱わないこと

- 新しいレビュー観点の追加 (security / a11y / performance などは個別 skill の責務)。
- 多数決で finding の採否を決めること。
- reviewer 固有のツール固定 (Claude / Codex / Cursor などの名前を skill body に直書きしない)。
- 推測ベースで critical / major に上げること (evidence 必須)。

## False-positive guards / 抑制条件

- 入力 artifact (review-self / review-external / findings-pool) がすべて空 → 出力は `actions: []` と "no reviewer inputs" 1 行で終了。silent skip にはしない。
- `findings-pool` が schema 不一致でパース不能 → loud-fail (例外を投げる)。silent skip にしない。
- 入力 reviewer が 1 つのみ → degraded mode で実行。出力に `agreement: []` を明記、summary に "single-reviewer mode" を含める。

## Rule / ルール

### 1. Collect — reviewer ごとに finding を収集

各 reviewer 出力から finding を抽出し、provenance (`reviewer`, `sourceKind`) を付与。

### 2. Deduplicate — 同一 issue の統合

dedup 判定基準:

- 同じ file path + 同じ行範囲 (±2 行) と
- `evidence` テキストの最初の 80 文字の編集距離 ≤ 10

両方満たす場合のみ dedup。それ以外は別 finding として扱う。

### 3. Agreement annotation — 多数決ではない

dedup されたグループに `agreement[]` (reviewer 名のリスト) を付与。**`severity` / `validatedStatus` の決定には直接使わない** (補助情報のみ)。

### 4. Verification — hallucination guard

各 finding について以下を確認:

- `evidence` で参照されている file path が実在する
- `evidence` のコードスニペットが当該ファイル / 当該 diff に grep で見つかる
- 該当しない場合は `validatedStatus: dismissed-hallucination` に分類

### 5. Severity — evidence-based

- `evidence` フィールドに「diff の該当行 + テスト/コード参照」が揃っている → 元 reviewer の severity を尊重
- `evidence` 不足 → severity の上限は `major` (critical 不可)
- `validatedStatus: dismissed-*` → 出力から除外せず、summary 内の "dismissed findings" に記録

### 6. Merge recommendation

最終的に以下のいずれかを emit:

- `merge-ready` — `confirmed` finding に critical / major なし
- `human-review` — critical / major が confirmed、または gray zone が残る
- `block` — `validatedStatus: confirmed` の critical が 1 件以上

## Evidence / 根拠の取り方

各 finding について以下を保持:

- `reviewer` — 出典 (例: `review-self`, `review-external#1`, `findings-pool#42`)
- `sourceKind` — `ai-review` | `human-review` | `self-review`
- `agreement[]` — dedup されたグループの reviewer 名一覧 (補助情報)
- `validatedStatus` — `confirmed` | `dismissed-hallucination` | `dismissed-duplicate` | `needs-human-judgment`
- `evidence` — file path + 行範囲 + コードスニペット (verification step で確認済)

## Output / 出力

セクション順:

1. **Critical Issues** (`validatedStatus: confirmed`, `severity: critical`)
2. **Major Issues** (`validatedStatus: confirmed`, `severity: major`)
3. **Minor Issues** (`validatedStatus: confirmed`, `severity: minor`)
4. **Dismissed Findings** (hallucination / duplicate、デバッグ用)
5. **Agent Agreement Summary** (どの reviewer がどの finding を上げたかの一覧、補助情報)
6. **Merge Recommendation** (`merge-ready` | `human-review` | `block` の 1 つ)

各 finding は `Finding:` / `Evidence:` / `Reviewers:` / `Severity:` / `ValidatedStatus:` / `Suggestion:` のブロック形式。

## 評価指標 (Evaluation)

- 合格基準: hallucination が verification step で検出される、agreement count を verdict に直結させない、入力欠落で silent skip にならない。
- 不合格基準: 多数決で finding を採用、evidence なしで critical / major、reviewer の名前を skill body に直書き、入力 1 件のとき synthesis を諦めて output を空にする。

## 人間に返す条件 (Human Handoff)

- `validatedStatus: needs-human-judgment` が 1 件以上ある
- reviewer 間で severity が大きく乖離 (critical vs minor 等)
- evidence の verification step が「実コードと一致するが文脈解釈が分かれる」ケース

## 参考

- Nolan Lawson 氏の Triple Agent skill (取り込み方針: provider-agnostic な synthesis pattern として再構成)
- [`pages/reference/artifact-input-contract.md`](../../../pages/reference/artifact-input-contract.md) — review-self / review-external / findings-pool 定義
- [`skills/agent-skills/river-review-code/SKILL.md`](../../agent-skills/river-review-code/SKILL.md) — multi-perspective review（旧 agent-code-review を統合。synthesis ではない、補完層として独立）
- Epic: [#911](https://github.com/s977043/river-review/issues/911) — Phase 1 着手 acceptance gate を満たした上で本 skill を追加
