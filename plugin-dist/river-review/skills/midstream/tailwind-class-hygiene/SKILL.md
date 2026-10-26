---
id: 'tailwind-class-hygiene'
name: 'Tailwind CSS Class Hygiene Review'
description: 'Checks Tailwind utility class hygiene at the syntax level: arbitrary-value overuse that bypasses the theme scale, conflicting/duplicate utilities on one element, and hardcoded arbitrary colors that should use design tokens.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.{tsx,jsx,html,vue,svelte,astro}'
tags: [tailwind, css, frontend, midstream, community]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Tailwind の utility class 構文（arbitrary value / クラス競合）をチェックリスト型で検査し、診断材料が無ければゲートで止める。

## Goal / 目的

- スケール/トークンを迂回する任意値（`w-[437px]` `mt-[13px]` `text-[#1a2b3c]` 等）の濫用を検出し、テーマのスペーシング/カラースケールへの寄せを促す。
- 同一要素に併存する競合・重複ユーティリティ（`px-2 px-4`、`flex block`、`mt-2 mt-4` 等、互いに打ち消すクラス）を検出する。
- デザイントークン（`bg-white` / theme color）で表現すべき色の任意カラー直書き（`bg-[#fff]` 等）を検出する。

## Non-goals / 扱わないこと

- デザイントークン体系全般の是非（命名・粒度・採用方針）は `design-token-enforcement` のスコープ。本スキルは Tailwind の utility class 構文レベルの衛生に限定する。
- Tailwind か素の CSS かといった採用技術の選定。
- レスポンシブ/状態 variant（`md:` `hover:` 等）の設計妥当性。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `className` / `class` への Tailwind utility の追加・変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: tailwind-class-hygiene — className/class への Tailwind utility 変更なし`

## False-positive guards / 抑制条件

- 設計上スケール外が必要な正当ケース（例: 1px ボーダー `border-[0.5px]`、外部デザイン由来の固定値で `theme.extend` 済み等）で、コメントによる正当化または theme 拡張が確認できる場合は指摘しない。
- 動的クラス（テンプレートリテラル内で実行時計算される値、例: `w-[${width}px]`）は別スコープとして扱い、静的な任意値と同列に断定しない（慎重に、必要なら質問に留める）。
- theme に存在しない CSS（grid template など）を表現する arbitrary value が公式に推奨される稀なケースは、断定せず質問に留める。
- 同一クラスに見えても variant prefix が異なる場合（`px-2 md:px-4` 等）は競合ではないため指摘しない。

## Rule / ルール

- 任意値（`[...]`）でスケール/トークンに対応物がある値（スペーシング・サイズ・カラー）を直書きしている場合は、theme のスケール/トークンへ寄せる修正を提案する。
- 同一要素の同一プロパティに作用する複数ユーティリティが併存（`px-2 px-4`、`mt-2 mt-4`、`flex block` 等）し、後勝ちで前者が無効化される場合は重複/競合として指摘する。
- 任意カラー直書き（`bg-[#fff]` `text-[#000]` 等）でデザイントークン（`bg-white` / theme color）に対応物がある場合はトークン利用を提案する。
- "nit" を濫発しない。明確に theme で代替できるものに絞り、判断が割れるものは質問に留める。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、どのクラスが問題か（任意値 / 競合 / 任意カラー）を 1 行で添える。
- theme 対応物の有無が diff だけで確証できない場合は断定せず「可能性」として書く。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どのクラス衛生に反しているか（任意値濫用 / 競合 / 任意カラー、1文）
- Impact: スケール逸脱で一貫性低下 / 後勝ちで意図しない値 / トークン迂回で一括変更不能 等
- Fix: theme スケール（`w-` 系）/ 競合解消（片方削除）/ トークン（`bg-white` 等）への最小修正案

## Sources / 出典

- Tailwind CSS — Theme: <https://tailwindcss.com/docs/theme>
- Tailwind CSS — Using arbitrary values: <https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values>
