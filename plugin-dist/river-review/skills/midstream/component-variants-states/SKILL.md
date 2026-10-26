---
id: 'component-variants-states'
name: 'Component Variants / States Documentation コンポーネント状態の文書化'
description: '新規追加された UI コンポーネントに、variants（種類）とインタラクティブ状態（hover / focus / disabled / loading / error）が定義・文書化されているかを確認し、状態設計の欠落を検出する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{tsx,jsx}'
  - 'app/**/*.{tsx,jsx}'
  - 'components/**/*.{tsx,jsx}'
tags: [design-system, component, variants, states, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 新規コンポーネントの状態網羅はチェックリスト的に確認できるが、対象が「新規 UI コンポーネントの追加」かどうかの判定が必要。新規コンポーネント追加を含まない変更では実行を止めるゲートが必要。

## Goal / 目的

- **新規追加された** UI コンポーネントに、variants（種類・バリエーション）と**インタラクティブ状態**（hover / focus / disabled / loading / error）が定義・文書化されているかを確認する。
- 「コンポーネントは追加したが、disabled / loading / error の状態設計が欠落し、後から後付けで破綻する」パターンを検出する。

## Non-goals / 扱わないこと

- 既存コンポーネントの再利用可否（`design-system-component-reuse` の領域）。
- 実行時の loading / error 状態の配線そのもの（mutation 中の loading は `loading-state` の領域。本スキルはコンポーネント定義側の状態網羅を見る）。
- focus-visible のアクセシビリティ実装（`modern-web-a11y-interactive` の領域）。
- デザイントークン準拠（design-source / token-enforcement の領域）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分に**新規 UI コンポーネント**（再利用可能な表示要素を export する `.tsx` / `.jsx` の追加）が含まれている
- [ ] inputContext に diff が含まれ、`code_search`（grep）が利用可能である

ゲート不成立時の出力: `NO_REVIEW: component-variants-states — 新規 UI コンポーネントの追加が検出されない`

## False-positive guards / 抑制条件

- 状態を持たない純粋な表示コンポーネント（静的なテキスト・アイコン表示など、インタラクションが無い）は指摘しない。
- variants / states が**別ファイル**（Storybook の `*.stories.*`、型定義、ドキュメント）に定義されている場合は、`code_search` で確認してから指摘する。差分内に見えないだけで断定しない。
- 既存コンポーネントの軽微な変更（新規追加でないもの）は対象外とする。
- プロトタイプ・内部限定など、状態網羅が不要と差分内で明記されている場合は抑制する。

## Rule / ルール

### 検出ロジック

1. **新規コンポーネントの特定**: 差分から、新規に追加された再利用可能な UI コンポーネント（export される表示要素）を特定する。
2. **状態・variants の確認**: そのコンポーネントが受け付けるべき状態を判定し、定義・文書化を確認する。
   - インタラクティブ要素での disabled / loading / error 状態の扱い
   - variants（サイズ・種類・トーンなど）の定義
   - `code_search` で `*.stories.*` や型定義など別ファイルの記載も確認する
3. **報告**: 欠落している状態・variants を `<file>:<line>` で示し、定義の追加を提案する。

### 制約

- 検出は最大 5 件。実害の大きい状態欠落（disabled / error の欠落）を優先する。
- 各指摘に「対象コンポーネント」「欠落している状態 / variants」「あるべき定義」を必ず含める。
- 別ファイルでの定義有無を確認してから報告する（差分内に無いだけで断定しない）。

## Evidence / 根拠の取り方

- 対象コンポーネントと欠落箇所は `<file>:<line>` に紐づけ、推測で状態欠落を述べない。
- 別ファイル（stories / 型定義）を `code_search` で確認した結果を根拠として示す。

## Output / 出力フォーマット

すべて日本語。

```text
(component-variants-states):1: [要約] 最も重大な状態設計の欠落は〈1文〉

<file>:<line>: [状態欠落1] <タイトル>
  対象: <新規コンポーネント名>(<file>:<line>)
  欠落: <disabled / loading / error / variants のどれか>
  影響: <後付け対応での破綻 / UX の不整合>
  Fix: <欠落状態 / variants の定義・文書化（stories や型での明示）>
```

## 評価指標（Evaluation）

- 合格基準: 新規 UI コンポーネントを `<file>:<line>` で示し、欠落状態を別ファイル確認の上で具体的に説明している。
- 不合格基準: 既存コンポーネントへの指摘、状態を持たない表示要素への難癖、別ファイル定義の未確認による誤検出、loading 配線・a11y・トークンへの越境。

## 人間に返す条件（Human Handoff）

- どの状態・variants を必須とするかが、プロダクトのデザインシステム方針に依存する場合。
- 状態網羅の要否が、コンポーネントの用途（内部限定かどうか）の判断を要する場合。
