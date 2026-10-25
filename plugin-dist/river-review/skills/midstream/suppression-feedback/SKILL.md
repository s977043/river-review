---
id: 'suppression-feedback'
name: 'Suppression Feedback Workflow'
description: 'Riverbed Memory の suppression entry を活用するときの判断基準と CLI 操作を案内する。'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'app/**/*.{ts,tsx,js,jsx,mjs}'
  - 'lib/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'packages/**/*.{ts,tsx,js,jsx,mjs,cjs}'
inputContext:
  - diff
  - commitMessage
outputKind:
  - findings
  - actions
modelHint: balanced
tags:
  - suppression
  - process
  - midstream
  - riverbed-memory
severity: minor
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Tool Wrapper
Why: 検出された major / critical 指摘について、suppression 登録か追加修正かの判断を促し、CLI 操作を案内する educator スキル。

## Goal / 目的

- 検出された指摘が **(a) 真の修正対象 / (b) accepted_risk として記録すべき / (c) false positive として記録すべき / (d) 別 fingerprint との duplicate** のいずれかをレビュアー（人間または AI）が判断できるようにする。
- 重大度別の suppression ポリシー (`major` / `critical` は `accepted_risk` でないと auto-suppress されない HIGH_SEVERITY guard) を浸透させる。
- `river suppression add` CLI の正しい使い方と、Riverbed Memory への登録フローを案内する。

## Guidance

### feedbackType の使い分け

| feedbackType     | 想定状況                             | major / critical の挙動                                        |
| ---------------- | ------------------------------------ | -------------------------------------------------------------- |
| `accepted_risk`  | リスクを認識した上で残すと決めた指摘 | **HIGH_SEVERITY guard を通過する唯一の値**。auto-suppress 可。 |
| `false_positive` | 実装意図に対する誤検知               | guard でブロック。manual handle のみ。                         |
| `wont_fix`       | 修正しないと決めた既知問題           | guard でブロック。                                             |
| `not_relevant`   | この PR / ファイルの文脈外           | guard でブロック。                                             |
| `duplicate`      | 別 fingerprint への参照              | guard でブロック。`duplicateOfFingerprint` で参照先を示す。    |

### CLI 操作

```bash
river suppression add \
  --fingerprint <fp> \
  --feedback <accepted_risk | false_positive | wont_fix | not_relevant | duplicate> \
  --rationale "なぜ suppress するかを 1〜2 文で" \
  [--scope <pattern>] [--severity <level>] [--files <glob>] \
  [--expires <ISO date>] [--pr <num>]
```

- `--rationale` は必須かつ未来の自分への説明であるべき。"why this is OK" を残す。
- `--expires` を付けると一時的 suppression を作れる。ライブラリ移行待ちなど時限のあるケースで活用。
- `--pr` を付けると suppression と PR の対応が Riverbed Memory に残り、後続レビューで `duplicate` 判定が容易になる。

### レビュー時の判断フロー

1. fingerprint で既存 suppression を検索 → 既知なら `duplicate` で参照
2. 指摘内容を実装意図と照らす → 誤検知なら `false_positive` を提案
3. 修正コストを見積もる → "リスク認識して残す" 妥当性があれば `accepted_risk`
4. severity が `major` / `critical` のとき: `accepted_risk` 以外はガード越えで残るため、**suppression ではなく修正提案** を優先

## Non-goals / 扱わないこと

- 個別ルールの是非判断 (それは各レビュースキルの責務)
- suppression entry の自動生成 (CLI / Riverbed Memory への書き込みは人間が承認する)
- `memory.suppressionEnabled: false` での運用判断 (緊急時 bypass の可否はコードレビュー範囲外)

## Pre-execution Gate / 実行前ゲート

このスキルは以下のいずれかが満たされない限り `NO_REVIEW` を返す。

- [ ] 差分にアプリケーションコード (`src/`、`app/`、`lib/`、`packages/`) の変更が含まれている
- [ ] 差分がドキュメント / フィクスチャ / 自動生成物のみでない
- [ ] PR 本文・コミットメッセージに `accepted_risk` / `false_positive` / `wont_fix` / `suppress` / `Riverbed Memory` / `fingerprint` のいずれかが言及されている、または同 PR 内で他の midstream skill が `major` / `critical` 指摘を出している

ゲート不成立時の出力: `NO_REVIEW: suppression-feedback — suppression workflow に関連する変更や指摘が検出されない`

## False-positive guards / 抑制条件

- 既に同 fingerprint の suppression entry が active な場合、再度 suppression workflow を案内しない（重複案内を避ける）。
- severity `info` / `minor` のみで構成された PR では HIGH_SEVERITY guard の言及を控える（ノイズになる）。
- `accepted_risk` 推奨は **rationale が PR 内に明記されている** ときのみ提示し、根拠なしに `accepted_risk` で抑止することを促さない。

## Output / 出力例

```yaml
findings:
  - severity: minor
    file: src/api/users.ts
    line: 42
    issue: |
      try / catch の swallow が `logging-observability`
      で major 指摘として検出済み。修正・suppression のいずれを選ぶか判断が必要です。
    suggestion: |
      意図的な swallow であれば PR マージ後に
      `river suppression add --fingerprint <fp> --feedback accepted_risk
      --rationale "上流 logger で記録済みのため再 throw 不要"`
      を実行し Riverbed Memory に残してください。
      誤検知であれば `--feedback false_positive` を選びますが、
      major severity は HIGH_SEVERITY guard により後続 PR でも再表示されるため、
      ガード越えで残すことを許容するか確認してください。
actions:
  - type: 'discussion'
    description: 'suppression vs 修正の選択を PR 上で明示する'
```
