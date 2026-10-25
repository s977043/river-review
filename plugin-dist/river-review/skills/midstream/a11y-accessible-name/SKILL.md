---
id: 'a11y-accessible-name'
name: a11y Accessible Name Basics
description: 画像・ボタン・フォーム要素に適切なアクセシブルネームがあるか確認する。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,html}'
  - 'app/**/*.{ts,tsx,js,jsx,html}'
  - 'components/**/*.{ts,tsx,js,jsx,html}'
tags: [community, accessibility, ui, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- 主要UI要素のラベル欠落による操作不能や誤解を防ぐ。

## Non-goals / 扱わないこと

- コントラスト比やキーボード操作などの包括的なa11y評価。
- 画面全体の情報設計の良し悪し。
- 動的UIのARIA設計（別スキルの対象）。

## False-positive guards / 抑制条件

- `aria-hidden="true"` が明示されている装飾要素は指摘しない。
- `aria-label` / `aria-labelledby` が既に付与されている場合は指摘しない。

## Rule / ルール

- `img` タグには `alt` 属性を必須にする（装飾的な画像は `alt=""` を推奨）。
- `button` / `a` / `input` には可視テキストまたは ARIA ラベルを持たせる。

## Evidence / 根拠の取り方

- 対象要素のタグと属性の有無を差分から示す。
- `alt` / `aria-label` / `aria-labelledby` の欠落を根拠として示す。

## Heuristics / 判定の手がかり

- `img` に `alt` が存在しない。
- `button` / `a` がアイコンのみで、ラベル属性もない。
- `input` に `label` が関連付けられていない（`htmlFor` / `id` が不一致）。

## Actions / 改善案

- `alt` で意味を短く表現する。
- `aria-label` を追加し、読み上げ名を明示する。
- `label` と `input` を `id` / `htmlFor` で関連付ける。

## Output / 出力

- `Finding:` / `Evidence:` / `Impact:` / `Fix:` を含む短いメッセージにする。

## 評価指標（Evaluation）

- 合格基準: ラベル欠落が差分に紐づき、根拠と改善案が説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- UIの意図が不明で解釈が分かれる場合は質問として返す。
- 画面設計そのものの議論が必要な場合は人間レビューへ返す。
