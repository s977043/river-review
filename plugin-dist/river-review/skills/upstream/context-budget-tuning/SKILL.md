---
id: 'context-budget-tuning'
name: 'Context Budget Tuning'
description: '.river-review.{yaml,json} の context.budget / ranking / reviewMode 設定をモデル仕様とリポジトリ規模に合わせて調整するレビュー観点。'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '.river-review.yaml'
  - '.river-review.yml'
  - '.river-review.json'
inputContext:
  - diff
  - repoConfig
outputKind:
  - findings
  - actions
modelHint: balanced
tags:
  - configuration
  - context
  - process
  - upstream
severity: minor
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Tool Wrapper
Why: `.river-review` の context 設定変更時に、reviewMode プリセット選択 / token・char 上限 / ranking weights をモデル仕様と照合してレビューする educator スキル。

## Goal / 目的

- `.river-review.{yaml,json}` の `context.reviewMode` / `context.budget` / `context.ranking` 変更が **モデル仕様 (`model.modelName`) と整合しているか** をレビューで確認する。
- `reviewMode: tiny | medium | large` プリセットの **既定値 (1024 / 4000 / 16000 max tokens)** と explicit `budget` の優先関係を理解させる。
- ranking weights (`pathProximity` / `symbolUsage` / `siblingTest` / `commitRecency`) の **0.0〜1.0 範囲** とスキーマキー名を schema (`src/config/schema.mjs`) と照合する。

## Guidance

### reviewMode プリセット既定値 (`src/lib/context-presets.mjs`)

| reviewMode | maxTokens 既定 | 想定モデル                             |
| ---------- | -------------- | -------------------------------------- |
| `tiny`     | 1024           | コンテキスト窓の小さいモデル / 短い PR |
| `medium`   | 4000           | gpt-4o-mini / sonnet 級モデルの通常 PR |
| `large`    | 16000          | 大型モデルでの深掘りレビュー           |

- 明示的 `context.budget` がある場合は **常に preset より優先** する。
- `budget.maxTokens` の上限は schema で `64000`、`maxChars` は `200000` まで。

### モデル仕様との整合チェック

- `context.budget.maxTokens` は **使用する `model.modelName` の公式仕様（または運用上採用している実効 context window）** を超えないように設定する。プロバイダの仕様変更で値は変動するため、本スキルでは具体値を固定しない。
- 小型モデル（例: `gpt-4o-mini` 級）に `large` プリセット (16000 token) を当てると、モデルの実効 context window を超える分は切捨てられて redundant になり、コストのみ増える。**プリセットの maxTokens がモデル仕様の上限を上回らないか** を確認する。
- 逆に大型モデルに `tiny` プリセット (1024 token) を当てている場合は、context が不足してレビュー品質が落ちる可能性を指摘する。

### ranking weights のレビュー

- キーは schema 定義 (`pathProximity` / `symbolUsage` / `siblingTest` / `commitRecency`) と一致しなければならない。古い名称（`symbolOverlap` / `testAffinity`）は **#728 で廃止済み**。
- `contextRankingSchema.weights` は `.strict()` のため、未知キーを含む設定は **設定ロード時に Unknown key エラーで失敗** する（silently 無視されない）。古い名称が残っている設定は CI でも気付かれず動き続けることはなく、即座に明示的なエラーになる。
- 各 weight は `0.0`〜`1.0`。合計が 1 を超えても問題ないが、`scoreContextCandidate` が weighted average を取るため相対比のみが意味を持つ。

### perSectionCaps の整合

- `budget.perSectionCaps` (`fullFile` / `tests` / `usages` / `config`) は char 単位。各 cap と `budget.maxChars`、token budget の **min** が実効値。
- セクション別 cap を 0 に設定すると当該セクションが収集対象から外れる。意図的な省略でなければ警告。

## Non-goals / 扱わないこと

- ranking weights の最適値そのものの探索（プロジェクト固有）。
- `context.budget` を使わない運用判断（CI 環境差異など）。
- 個別 PR レビューで実際に消費されたトークン量の検証 (それは `reviewDebug.repoContextBudget` の観測責務)。

## Pre-execution Gate / 実行前ゲート

このスキルは以下のいずれかが満たされない限り `NO_REVIEW` を返す。

- [ ] 差分にリポジトリ直下の `.river-review.{yaml,yml,json}` の変更が含まれている（`src/config/loader.mjs` が探索する対象はこの 3 ファイルのみ）
- [ ] 変更が `context.budget` / `context.ranking` / `context.reviewMode` のいずれかに触れている

ゲート不成立時の出力: `NO_REVIEW: context-budget-tuning — context.* 設定の変更が検出されない`

## False-positive guards / 抑制条件

Pre-execution Gate を通過した後の **個別指摘の抑制条件** に絞る。

- ranking weights の値が schema 範囲内 (`0.0`〜`1.0`) で、合計が 1 でなくとも relative ratio として正しければ指摘しない (合計 1 制約は schema にない)。
- `reviewMode` を tiny にして budget を明示しないケースを「budget 不足」と誤認しない（preset がカバーしている）。

## Output / 出力例

```yaml
findings:
  - severity: minor
    file: .river-review.yaml
    line: 18
    issue: |
      `reviewMode: large` (preset maxTokens 16000) を小型モデル `model.modelName: gpt-4o-mini`
      と組み合わせています。`large` プリセットの 16000 token は当該モデルの公式仕様の
      effective context window を上回る可能性が高く、末尾 context が切捨てられて redundant になります
      (具体値は使用モデルの公式仕様で確認してください)。
    suggestion: |
      モデル仕様の上限内に収まる `reviewMode: medium` (preset maxTokens 4000) を起点に検討し、
      depth が必要な場合は `context.ranking.enabled: true` で近接度の高い候補を
      優先させ、weights を `pathProximity: 0.5, symbolUsage: 0.3` 等に調整してください。
  - severity: major
    file: .river-review.yaml
    line: 24
    issue: |
      `context.ranking.weights.symbolOverlap` を指定していますが、schema
      (`src/config/schema.mjs` `contextRankingSchema.weights`) は `.strict()` で、
      正規キー名は `symbolUsage` です (#728 でリネーム済み)。古い名称のままだと
      設定ロード時に **Unknown key エラーで失敗** します。
    suggestion: |
      `symbolOverlap` → `symbolUsage`、`testAffinity` → `siblingTest` にリネームしてください。
actions:
  - type: 'verify'
    description: 'PR 後の review で `reviewDebug.repoContextBudget.remaining` が 0 / 過大に余っていないかを観測する'
```
