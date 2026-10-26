---
id: 'design-source-conformance'
name: 'Design Source-of-Truth Conformance デザイン定義準拠'
description: 'リポジトリに DESIGN.md やデザイントークン定義が存在する場合に、新規 UI 実装の色・余白・フォントサイズ・角丸・シャドウがその定義済みスケールに準拠しているかを照合する。定義が無ければ実行しない'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,css,scss}'
  - 'app/**/*.{ts,tsx,js,jsx,css,scss}'
  - 'components/**/*.{ts,tsx,js,jsx,css,scss}'
tags: [design-system, design-source, conformance, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 定義済みスケールとの照合は決定論で判定できる部分が大きいが、まず参照すべきデザイン定義（DESIGN.md / トークン）の所在を grep で特定する必要がある。定義が無ければ実行を止めるゲートが必要。

## Goal / 目的

- リポジトリに**デザイン定義のソース**（`DESIGN.md` / `design-tokens.*` / `tailwind.config.*` の theme / CSS custom properties など）が存在する場合に、新規 UI 実装の値が**その定義済みスケールに準拠**しているかを照合する。
- 「トークンは存在するのに、定義外のスケール（例: spacing が 4/8/12 と定義されているのに `10px`）を新規導入した」逸脱を検出する。

## Non-goals / 扱わないこと

- デザイン定義が**存在しない**リポジトリでの生値ハードコード検出（`design-token-enforcement` の領域。本スキルは定義との照合に限定する）。
- 既存コンポーネントの再利用可否（`design-system-component-reuse` の領域）。
- アクセシビリティやインタラクティブ状態（a11y / loading-state 系の領域）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] リポジトリにデザイン定義のソース（`DESIGN.md` / デザイントークン定義 / `tailwind.config.*` の theme など）が `code_search` で実在確認できる
- [ ] 差分に UI 実装の値（色・余白・フォントサイズ・角丸・シャドウ）の追加・変更が含まれている
- [ ] inputContext に diff が含まれ、`code_search`（grep）が利用可能である

ゲート不成立時の出力: `NO_REVIEW: design-source-conformance — 参照すべきデザイン定義または UI 値の変更が検出されない`

## False-positive guards / 抑制条件

- デザイン定義が grep で見つからない場合は指摘しない（生値検出は token-enforcement に委ねる）。
- 定義済みスケールに含まれる値は指摘しない（準拠している実装は対象外）。
- 定義からの逸脱が**差分内で根拠とともに明記**されている場合は抑制する（意図的な例外）。
- スケール外でも、定義が明示的に任意値を許容している領域は対象外とする。

## Rule / ルール

### 検出ロジック

1. **定義の特定**: `code_search` でデザイン定義のソースを特定し、色・余白・フォントサイズ・角丸・シャドウの**定義済みスケール**を読み取る。
2. **値の照合**: 差分の新規 UI 値が、定義済みスケールに含まれるか照合する。含まれない値（off-scale）を逸脱候補とする。
3. **報告**: 逸脱値と参照した定義箇所を両方 `<file>:<line>` で示し、最も近い定義済みスケール値への置き換えを提案する。

### 制約

- 検出は最大 5 件。スケール逸脱の影響が大きいもの（広く使われる色・余白）を優先する。
- 各指摘に「逸脱値」「参照した定義」「準拠候補」を必ず含める。
- 定義の読み取りは grep で再現可能にする（検索語を明示する）。

## Evidence / 根拠の取り方

- 逸脱値と参照定義は両方 `<file>:<line>` に紐づけ、推測でスケールを述べない。
- 「定義ではこのスケール / 新実装はこの値」を対比し、off-scale を具体的に示す。

## Output / 出力フォーマット

すべて日本語。

```text
(design-source-conformance):1: [要約] 最も重大なスケール逸脱は〈1文〉

<file>:<line>: [スケール逸脱1] <タイトル>
  定義: <参照したスケール>(検索語: `<grep pattern>`, <file>:<line>)
  新実装: <off-scale な値>(<file>:<line>)
  影響: <デザイン不整合 / トークン体系の形骸化>
  Fix: <最も近い定義済みスケール値への置き換え、または逸脱の根拠を明文化>
```

## 評価指標（Evaluation）

- 合格基準: デザイン定義が grep 再現可能な検索語 + `<file>:<line>` で示され、off-scale の逸脱が具体的に説明されている。
- 不合格基準: デザイン定義が無いリポジトリへの指摘、定義済みスケール内の値への難癖、生値検出への越境、根拠ある意図的逸脱への指摘。

## 人間に返す条件（Human Handoff）

- デザイン定義が複数あり、どれを正典とするかの合意が必要な場合。
- スケール拡張（新しい値を定義へ追加する）の是非が設計判断を要する場合。
