---
id: 'design-system-component-reuse'
name: Design System Component Reuse Guard
description: 既存デザインシステムコンポーネント（Button / Input / Modal / Card 等）を再実装していないかを検出する。Figma→コード実装時に既存コンポーネントを無視した実装を防ぐ。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx}'
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'components/**/*.{ts,tsx,js,jsx}'
tags: [community, design-system, component-reuse, ui, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- 差分が UI プリミティブ（Button / Input / Modal / Card / Badge / Tag / Avatar / Tabs / Dropdown / Tooltip 等）をゼロから再実装していないかを検出する。
- Figma → コード実装時に「既存のデザインシステムコンポーネントを無視してインラインスタイル付き素の HTML 要素を使う」パターンを防ぐ。
- 出力は再実装の疑いと既存コンポーネントのインポート提案を示す。

## Non-goals / 扱わないこと

- デザインシステムの実装品質・API 設計の評価。
- Tailwind / CSS Modules など特定のスタイル技術の是非の判断。
- フレームワーク選定や状態管理ライブラリの議論。
- デザインシステム自体の拡張提案（新コンポーネント追加の是非）。

## False-positive guards / 抑制条件

- 差分ファイルのパスが `src/components/ui/`、`src/components/base/`、`components/ui/`、`components/base/` 配下である場合 — これはデザインシステム本体の定義であり指摘しない。
- ファイル名がプリミティブ名そのものの場合（例: `Button.tsx`, `Input.tsx`, `Modal.tsx`）— 定義ファイル自体は指摘しない。
- `children` を受け取り内部で別のコンポーネントへ委譲するラッパーコンポーネント — 指摘しない。
- テストファイル（`*.test.tsx`, `*.spec.tsx`）および Storybook ストーリー（`*.stories.tsx`）— 指摘しない。
- 差分が既存ファイルへの小修正（props 追加 / バグ修正 / スタイル微調整）であり、新たなプリミティブ再実装を含まない場合 — 指摘しない。

## Rule / ルール

### 対象プリミティブと検出ヒューリスティック

差分が以下のパターンに該当し、かつ抑制条件に当てはまらない場合に指摘する:

| プリミティブ      | 検出シグナル                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Button            | `<button` + 3 つ以上の className トークン or `style=` + クリックハンドラ、かつ `Button` / `Btn` コンポーネントが存在しそうな文脈 |
| Input / TextField | `<input` + カスタムスタイリング（className または `style=`）、かつ `Input` / `TextField` コンポーネントが存在しそうな文脈        |
| Modal / Dialog    | `position: fixed` または `z-index` の手動管理 + オーバーレイ div でモーダル振る舞いを実装                                        |
| Card              | `box-shadow` / `border-radius` 付きの汎用 div で「カード」レイアウトを構成                                                       |
| Badge / Tag       | ピル形状スタイル（`rounded-full` / `border-radius: 9999px` 等）付きの `<span>` や `<div>`                                        |

### 判定の手がかり

- 新規コンポーネントファイルが追加され、ファイル名がアプリ機能名（例: `SubmitButton.tsx`, `UserBadge.tsx`）でありながら、内部で素の HTML 要素を直接スタイリングしている。
- className に 3 トークン以上のスタイルユーティリティ（Tailwind 等）または `style=` 属性を持つ素の HTML 要素がコンポーネントのルートになっている。
- 同リポジトリに同名のプリミティブコンポーネント（`Button`, `Input`, `Modal` 等）が存在するはずの構造（`components/ui/` や `lib/components/` の存在）が示唆されている。

## Evidence / 根拠の取り方

- 差分のコードスニペット（ファイルパス + 行番号）を引用する。
- 再実装の根拠となるスタイリングパターンまたはタグ名を明示する。
- 抑制条件（定義ファイル / ui ディレクトリ / ラッパー / テスト）に該当しないことを確認する。

## Confidence / 信頼度

- このスキルはリポジトリ全体のコンポーネント一覧を持たないため、既存コンポーネントの存在を確定できない。
- 原則として Confidence は `medium` とする。
- 抑制条件が明確に適用される場合（定義ファイル等）は `No findings` を返す。

## Output / 出力

- `Finding:` <コンポーネント種別> が再実装されており、既存コンポーネントの再利用機会あり
- `Evidence:` <ファイル:行 — コードスニペット>
- `Suggestion:` <ComponentName> を <likely path> からインポートして使用することを検討する
- `Severity:` major
- `Confidence:` medium

## 評価指標（Evaluation）

- 合格基準: 差分に直接根拠があり、プリミティブ種別が具体的に挙がっており、抑制条件が考慮されている。
- 不合格基準: 差分と無関係な一般論、デザインシステム選定への踏み込み、強制トーン、根拠のない全面リファクタ要求。

## 人間に返す条件（Human Handoff）

- リポジトリにデザインシステムが存在するかどうか判断できない場合は判断を人間に返す。
- 既存コンポーネントのパスが特定できない場合は候補パスを複数提示して人間に委ねる。
- デザインシステムの方針（独自実装を許容しているか）が `.river/rules.md` や README に記載されている場合はその方針を優先する。
