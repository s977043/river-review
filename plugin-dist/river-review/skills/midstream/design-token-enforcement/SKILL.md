---
id: 'design-token-enforcement'
name: Design Token Enforcement
description: デザイントークンを使わずに直書きされた色・余白・フォントサイズ・角丸・シャドウを検出する。Figma Variables / Tailwind config / CSS custom properties のルールに違反する実装を指摘する。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,css,scss}'
  - 'app/**/*.{ts,tsx,js,jsx,css,scss}'
  - 'components/**/*.{ts,tsx,js,jsx,css,scss}'
tags: [community, design-system, tokens, ui, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- フロントエンド差分においてデザイントークンを使わず生の値をハードコードしている箇所を検出する。
- Figma Variables / Tailwind config / CSS custom properties などトークンシステムが存在するプロジェクトで、規約違反の実装を早期に指摘する。
- 「直し方」まで提示し、修正コストを最小化する。

## Non-goals / 扱わないこと

- デザイントークンシステム自体の設計・命名規則の議論。
- Figma ファイルと実装の完全な同期チェック（別の CI/CD 統合が担う領域）。
- トークンの意味論的な正しさ（例: セマンティックトークン vs プリミティブトークン）の判定。
- テストファイル・Storybook ファイルの厳密なチェック（警告のみ）。

## False-positive guards / 抑制条件

- Tailwind ユーティリティクラス (`bg-blue-500`, `p-4`, `text-sm`, `rounded-lg` など) はトークンシステムの一部であるため指摘しない。
- CSS カスタムプロパティの参照 (`var(--color-primary)`, `var(--spacing-md)`) は違反ではない。
- Tailwind の `theme()` 関数 / トークン参照関数 (`tokens.spacing.md`, `theme('colors.primary')`) は違反ではない。
- テンプレートリテラル内に変数を含むインラインスタイル (``style={{ color: `${brandColor}` }}``) は動的計算の可能性があるため "uncertain" として示す（finding ではない）。
- テストファイル (`*.test.tsx`, `*.spec.tsx`, `*.stories.tsx`) は lenient モードで扱い、明確な問題のみ指摘する。
- `0` / `100%` / `transparent` / `inherit` / `currentColor` などの CSS 予約値はトークン違反としない。

## Rules / ルール

### 1. 色のハードコード

- className / style prop / CSS / SCSS に `#XXXXXX`, `#XXX`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)` を生で書いている場合は違反。
- 例: `style={{ color: '#3B82F6' }}`, `background-color: rgb(59, 130, 246)`

### 2. Tailwind 任意値による余白のハードコード

- Tailwind の arbitrary values (`p-[16px]`, `gap-[8px]`, `mt-[24px]`, `mx-[1.5rem]` など) は、Tailwind config / デザイントークンに対応するスケール値がある場合に違反。
- `p-4` / `gap-2` などの標準クラスへの置き換えを提案する。

### 3. フォントサイズのハードコード

- `style={{ fontSize: '14px' }}`, `font-size: 14px`, `fontSize: 14` など style prop / CSS 内でフォントサイズを生値で記述している場合は違反。

### 4. 角丸のハードコード

- `style={{ borderRadius: '8px' }}`, `border-radius: 8px`, `rounded-[8px]` などを生値で記述している場合は違反。

### 5. ボックスシャドウのハードコード

- `style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}`, `box-shadow: 0 4px 6px -1px ...` などを生値で記述している場合は違反。

## Evidence / 根拠の取り方

- 差分のコードを引用し、どの行・どの値がトークン違反かを明示する。
- 可能であれば対応するトークン名 / Tailwind クラス / CSS カスタムプロパティの候補を 1 つ提示する。
- プロジェクトに `tailwind.config.*` や `tokens.ts` などが見える場合はそれを参照する旨を示す。

## Output / 出力

- `Finding:` 何が違反か（具体的な値の種類）
- `Evidence:` `ファイル名:行 — コードスニペット`
- `TokenSuggestion:` 置き換え候補のトークン / クラス / CSS カスタムプロパティ
- `Severity:` `minor` 固定
- `Confidence:` 事実確認 = `high` / 文脈が必要 = `medium` / 動的計算の可能性あり = `low`

違反が無ければ `No findings` と記入し、適用した抑制条件を記載する。

## 評価指標（Evaluation）

- 合格基準: 差分内の生値を直接引用し、対応トークン候補が具体的に示されている。
- 不合格基準: Tailwind ユーティリティクラスを違反と誤報する / 差分外コードを指摘する / 一般論のみで根拠なし。

## 人間に返す条件（Human Handoff）

- プロジェクト固有のトークン命名規則が不明で候補を断定できない場合は "候補が特定できません — デザインシステムドキュメントを確認してください" と添える。
- デザイントークンシステム自体が存在しないプロジェクトと判断できる場合は全指摘を `Confidence: low` に下げ、導入提案として示す。
