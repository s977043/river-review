---
id: 'nextjs-server-action-security'
name: 'Next.js Server Action Security Review'
description: "Checks Next.js Server Actions ('use server') for missing authentication/authorization before mutations, missing input validation, and untrusted client-supplied IDs — treating each action as a public HTTP endpoint."
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.{ts,tsx}'
  - '**/actions.{ts,tsx}'
  - '**/*.action.{ts,tsx}'
tags: [nextjs, security, server-actions, authorization, midstream, community]
severity: critical
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Server Action を「誰でも呼べる公開エンドポイント」と仮定し、認証・認可・入力検証の欠落をチェックリスト型で検査する。

## Goal / 目的

- `'use server'` で公開される Server Action は **認証なしに誰でも呼べる公開 HTTP エンドポイント**である、という前提に立つ。
- mutation（DB の更新・削除・課金など）前に、セッション/認証と認可（リソース所有者確認）が検証されていない欠落を検出する。
- `formData` や引数を検証せず DB へ直接渡す入力バリデーション欠如、クライアントから渡る ID をなりすまし可能なまま信頼する誤りを検出する。

## Non-goals / 扱わないこと

- client/server 境界判定（`use client` 誤用）は `nextjs-app-router-boundary` の領域。本スキルでは扱わない。
- read-only の Server Action（mutation を伴わないもの）への認可指摘。
- 認証ライブラリ・バリデーションライブラリの選定や設計全般。
- CSRF / レート制限などインフラ層の防御（フレームワーク・基盤の責務）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `'use server'` 関数 / Server Action（actions.ts など）の追加・変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: nextjs-server-action-security — Server Action の変更なし`

## False-positive guards / 抑制条件

- 認証チェックを共通ヘルパー（`requireUser()` / `requireAuth()` 等）に委譲しており、差分内にその呼び出しが見える場合は指摘しない。
- 公開フォーム（問い合わせ・ニュースレター登録など、認証不要が要件上正当なもの）で、その旨がコメントで明記されている mutation は、認可指摘を質問に留める。
- read-only の Server Action（mutation なし）は認可指摘の対象外。
- 入力検証を共通ヘルパーやスキーマ（zod 等）へ委譲し、差分内でその呼び出しが見える場合は指摘しない。

## Rule / ルール

- mutation を行う Server Action は、処理前に認証（例: `auth()` / `getServerSession()` / `requireUser()` 等）でセッションを確認する。
- mutation 対象がユーザー固有リソースなら、認可（リソース所有者がセッションユーザーと一致するか）を確認する。
- `formData` / 引数は zod 等で検証してから利用する。型は信頼できない（Server Action の引数はクライアント由来）。
- `formData.get('userId')` のようにクライアントから渡る ID を所有者として信頼しない。所有者はセッションから導出する。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、mutation 呼び出しと認証/認可/検証の欠落箇所を併記する。
- 抑制条件に該当しないこと（差分内にヘルパー呼び出しが見えないこと）を根拠として示す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どの防御が欠落しているか（1文）
- Impact: 不正な mutation / なりすまし / 不正入力の DB 反映 等
- Fix: 認証チェック / 所有者確認 / zod 検証の最小修正案

## Sources / 出典

- Next.js — Server Actions and Mutations (Authentication and Authorization): <https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#authentication-and-authorization>
- Next.js — How to Think About Security in Next.js: <https://nextjs.org/blog/security-nextjs-server-components-actions>
