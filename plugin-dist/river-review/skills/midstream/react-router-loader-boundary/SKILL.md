---
id: 'react-router-loader-boundary'
name: 'React Router Loader Boundary Review'
description: 'Detects route data fetched in useEffect instead of loaders, server/client API leaks across loader boundaries, and missing HydrateFallback in React Router v7 framework mode.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'src/routes/**/*.{ts,tsx,js,jsx}'
tags: [react-router, remix, data-loading, frontend, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: React Router framework mode の data loading 規約への適合をチェックリスト型で検査する

## Goal / 目的

- ルート遷移で確定するデータが `useEffect` + fetch でコンポーネント取得されること（二重フェッチ・レース・hydration mismatch の温床）を防ぐ。
- loader / clientLoader の境界違反（loader 内のクライアント専用 API、clientLoader 内のサーバー専用 API）を検出する。

## Non-goals / 扱わないこと

- action / mutation の規約（`react-router-action-contract` のスコープ）。
- data mode / declarative mode のコード（framework mode のルートモジュールのみ対象）。
- 一般的な React パフォーマンス（modern-web 系 skill のスコープ）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分が React Router framework mode のルートモジュール（loader / clientLoader / action の export、または routes 配下）に関係する
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: react-router-loader-boundary — framework mode ルートの変更なし`

## False-positive guards / 抑制条件

- `useEffect` + fetch が **ナビゲーションに紐づかない** データの場合は指摘しない（ポーリング、WebSocket、リアルタイム更新、サードパーティ SDK 初期化）。「URL / ルート遷移で確定するデータか」で判定する。
- 親ルートの loader で取得済みデータを子が利用する設計は正当。
- data mode / declarative mode のコードには適用しない（モード誤判定が最大の誤検出源）。

## Rule / ルール

- ルート遷移で確定する初期データは `loader`（SSR、サーバー専用 API はクライアントバンドルから自動除去される）に置く。
- ブラウザ専用データは `clientLoader` に置き、hydrate する場合は `HydrateFallback` を定義する（`clientLoader.hydrate = true as const` の `as const` 欠落も指摘）。
- `loader` 内でクライアント専用 API（window / localStorage 等）、`clientLoader` 内でサーバー専用 API（DB 直接アクセス等）を使っていないか確認する。
- loader の返却値はシリアライズ可能型に限る（class instance の返却を指摘）。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、該当する公式規約（reactrouter.com/start/framework/data-loading）を 1 行で添える。
- ナビゲーション紐づきの判断が割れる場合は断定せず `questions` で返す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どの境界規約に反しているか（1文）
- Impact: 二重フェッチ / hydration mismatch / バンドル漏えい等の影響
- Fix: loader / clientLoader への移動案（最小）

## Sources / 出典

- React Router — Data Loading: <https://reactrouter.com/start/framework/data-loading>
