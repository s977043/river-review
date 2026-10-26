---
id: 'nextjs-app-router-boundary'
name: Next.js App Router Client/Server Boundary
description: App Router の Server Component でクライアント専用APIを使っていないか確認する。
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'components/**/*.{ts,tsx,js,jsx}'
tags: [community, nextjs, midstream, react]
severity: major
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Goal / 目的

- App Router の Server Component でクライアント専用APIを誤って使うミスを減らす。

## Non-goals / 扱わないこと

- 画面設計やUI/UXの是非。
- App Router 以外のフレームワーク構成。
- 非同期データ取得の最適化全般（別スキルの対象）。

## False-positive guards / 抑制条件

- ファイル先頭に `use client` が明示されている場合は指摘しない。
- コメントで意図的な回避策が明記されている場合は慎重に扱う。

## Rule / ルール

- Server Component で `useState` / `useEffect` / `useLayoutEffect` を使わない。
- Server Component で `window` / `document` / `localStorage` / `sessionStorage` を参照しない。

## Evidence / 根拠の取り方

- 差分内にクライアント専用APIが直接登場していることを示す。
- `use client` の有無を併記し、境界違反である根拠を示す。

## Heuristics / 判定の手がかり

- `use client` のないファイルで React Hooks や DOM API を使っている。
- `window` 依存の処理が Server Component に残っている。

## Actions / 改善案

- `use client` が必要な場合は、対象コンポーネントを分割してクライアント側へ移す。
- DOM API が必要な処理をクライアント専用の子コンポーネントに閉じ込める。

## Output / 出力

- `Finding:` / `Evidence:` / `Impact:` / `Fix:` を含む短いメッセージにする。

## 評価指標（Evaluation）

- 合格基準: 境界違反が差分に紐づき、根拠と最小修正が説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 設計意図が不明で解釈が分かれる場合は質問として返す。
- 大規模なコンポーネント分割が必要な場合は人間レビューへ返す。
