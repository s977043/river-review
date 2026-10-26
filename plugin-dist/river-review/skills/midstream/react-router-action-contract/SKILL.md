---
id: 'react-router-action-contract'
name: 'React Router Action Contract Review'
description: 'Checks React Router v7 action conventions: validation errors returned as data with 4xx status (not thrown), redirect on success, and 3-branch ErrorBoundary handling.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'src/routes/**/*.{ts,tsx,js,jsx}'
tags: [react-router, remix, actions, validation, frontend, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: action のエラー契約と ErrorBoundary 分岐をチェックリスト型で検査する

## Goal / 目的

- バリデーション失敗が ErrorBoundary へ throw され、フォームのインラインエラー表示と自動 revalidation の制御が壊れるのを防ぐ。
- action 成功時の `redirect()` 欠落による再送信問題、エラー返却時のステータス不備（2xx のまま）を検出する。

## Non-goals / 扱わないこと

- loader / data loading の規約（`react-router-loader-boundary` のスコープ）。
- Form と fetcher のどちらを使うべきかの UX 判断（要件依存のため一律指摘しない。質問に留める）。
- バリデーションライブラリの選定。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に action / clientAction の追加・変更、または ErrorBoundary の変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: react-router-action-contract — action / ErrorBoundary の変更なし`

## False-positive guards / 抑制条件

- `throw data("Not Found", { status: 404 })` 等、リソース不在・認可エラーの **意図的な throw は公式に許可された規約**であり指摘しない（バリデーション失敗の throw と区別する）。
- React Router 管理外の外部 API へ直接 POST する設計が要件上正当な場合は指摘しない。
- 成功時に同一ページへ結果を表示する設計（redirect しない）が意図的な場合は質問に留める。

## Rule / ルール

- 期待されるバリデーション失敗は `return data({ errors }, { status: 400 })` で返す（throw しない。2xx のままだと不要な revalidation が走る点も確認）。
- 成功時は `redirect()` で再送信問題を防ぐ。
- ErrorBoundary は `isRouteErrorResponse(error)` / `error instanceof Error` / その他 の 3 分岐で処理し、`error.message` への直接アクセスを避ける。
- 独立して失敗してよい UI 単位にはルート単位の ErrorBoundary を検討する（root のみでも最低限は満たすため、強制はしない）。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（form-validation / error-boundary）を 1 行で添える。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どの契約に反しているか（1文）
- Impact: インラインエラー不能 / 再送信 / 不要 revalidation 等
- Fix: `data({errors}, {status: 400})` / `redirect()` / 3 分岐の最小修正案

## Sources / 出典

- React Router — Form Validation: <https://reactrouter.com/how-to/form-validation>
- React Router — Error Boundaries: <https://reactrouter.com/how-to/error-boundary>
- React Router — Actions: <https://reactrouter.com/start/framework/actions>
