---
id: 'cross-file-leakage'
name: 'Cross-File Leakage リファクタ後の caller 側残骸検出'
description: 'モジュール/スキルの構造変更で当該ファイルは更新したが、caller 側が古い構造（旧参照・旧シグネチャ・旧採番）を参照したまま残るパターンを検出する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.{ts,tsx,js,jsx,mjs}'
  - '**/*.md'
  - '**/SKILL.md'
  - '**/*.{yaml,yml,json}'
tags:
  [
    adversarial,
    cross-file-leakage,
    claim-vs-actual,
    refactor,
    caller-drift,
    midstream,
    cognitive-bias,
  ]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 構造変更に対する caller 走査は grep による決定論的突合が主だが、構造変更を含まない変更では実行を止めるゲートが必要

## Goal / 目的

- スキル/モジュールを構造変更したとき、**当該ファイルは更新したが caller 側 N 箇所が古い構造を参照したまま** 残るパターンを検出する。
- 「変更元は直したが、参照元を直し忘れた」ドリフトを、変更の波及範囲を grep で追って可視化する。

## Non-goals / 扱わないこと

- 構造変更そのものの良し悪しの判断。
- 静的型エラーの検出（型システムが捕捉できる drift はコンパイラ/tsc の役割）。
- 当該ファイル内の整合性（それは `self-contradiction` の領域）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分に構造変更（記号の再採番、シンボル名変更、シグネチャ変更、セクション番号の振り直し、ファイル分割・移動）が含まれている
- [ ] inputContext に diff が含まれている

ゲート不成立時の出力: `NO_REVIEW: cross-file-leakage — 構造変更が検出されない`

## False-positive guards / 抑制条件

- 旧構造への参照を grep しても caller 側に残骸が見つからない場合は指摘しない。
- 残骸が意図的（旧 API の互換 shim、移行期間中の dual-reference）で差分内に明記がある場合は抑制。
- 参照が文字列として同一でも別シンボル/別スコープを指す場合は抑制。

## Rule / ルール

### 検出ロジック

1. **構造変更の特定**: 差分から「何がどう変わったか」を抽出する（旧シンボル→新シンボル、`§2.1`→新採番、`foo(a)`→`foo(a, b)`、ファイル A→分割後）。
2. **caller の列挙**: 旧構造の識別子（旧シンボル名・旧参照形式・旧パス）を repo 全体に grep し、参照している全箇所を列挙する。
3. **残骸の判定**: 列挙した参照のうち、今回の差分で更新されていないものを残骸として特定する。
4. **波及の報告**: 残骸を `<file>:<line>` と検索語で示し、更新漏れの caller を網羅的に挙げる。

### 制約

- 検出は最大 5 件（同一原因の残骸はまとめて1件とし、影響ファイルを列挙）。
- 各指摘には「構造変更」「旧構造の検索語」「未更新の caller 位置」を必ず含める。
- caller の列挙は grep で再現可能にし、「N 箇所」と件数を明示する。

## Evidence / 根拠の取り方

- 残骸は必ず `<file>:<line>` と grep 検索語を示し、推測で件数を述べない。
- 「構造がどう変わったか」を旧→新で具体的に示し、なぜ caller が壊れる/古いかを説明する。

## Output / 出力フォーマット

すべて日本語。

```text
(cross-file-leakage):1: [要約] 最も影響の大きい未更新 caller は〈1文〉

<file>:<line>: [caller 残骸1] <タイトル>
  構造変更: <旧構造> → <新構造>(変更元: <file>:<line>)
  検索語: `<grep pattern>`
  未更新の caller: <N>箇所 — <file:line>, <file:line>, ...
  影響: <古い参照が引き起こす不整合/破壊>
  Fix: <caller 側 N 箇所を新構造に更新する>

<file>:<line>: [caller 残骸2] ...
```

## Good / Bad Examples

### Good

```text
review-output/SKILL.md:1: [caller 残骸] §再採番後に caller 9ファイルが旧セクション番号を参照
  構造変更: review-output SKILL.md を §1-§6 構成に再採番(review-output/SKILL.md:1)
  検索語: `§(2\.1|4\.4|3-R)`
  未更新の caller: 9箇所 — a/SKILL.md:12, b/SKILL.md:30, scripts/build.py:88, ...
  影響: caller が存在しない旧セクション番号を指し、参照が解決不能
  Fix: caller 9ファイルの §2.1/§4.4/§3-R を新採番に更新
```

### Bad

```text
他のファイルも直す必要がありそう
```

（構造変更の特定なし、検索語なし、caller 位置・件数なし）

## 評価指標（Evaluation）

- 合格基準: 構造変更が旧→新で示され、未更新 caller が grep 再現可能な検索語 + `<file>:<line>` + 件数で網羅されている。
- 不合格基準: 構造変更の特定が曖昧、caller を grep で再現できない、件数が推測、残骸がないのに指摘している。

## 人間に返す条件（Human Handoff）

- 更新すべき caller が他リポジトリ・外部利用者に及び、後方互換の判断を要する場合。
- 構造変更を撤回するか caller を全更新するかが設計判断を要する場合。
