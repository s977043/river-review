---
id: 'firebase-security-rules'
name: 'Firebase Security Rules Review'
description: 'Detects over-permissive Firestore/Storage rules (allow read, write: if true / auth-only without ownership), missing auth checks on writes, and admin SDK private key exposure to client bundles.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.rules'
  - '**/firestore.rules'
  - '**/storage.rules'
  - '**/firebase*.{ts,js}'
tags: [firebase, security, baas, authorization, midstream, community]
severity: critical
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Firebase Security Rules の過剰許可と認可漏れ、機密 config 露出をチェックリスト型で検査する

## Goal / 目的

- `allow read, write: if true;` や `request.auth != null` だけの所有者チェック欠如ルールを検出し、他人のドキュメント書き換えを防ぐ。
- `allow write` に `request.auth` 条件が無い認証チェック欠如を検出する。
- admin SDK の秘密鍵（service account の `private_key`）がソースに混入しクライアントバンドルへ露出するのを検出する。

## Non-goals / 扱わないこと

- Firestore のクエリ効率やインデックス設計。
- Cloud Functions のロジック妥当性。
- ルールの粒度（コレクション分割方針）の良し悪し（要件依存のため一律指摘しない）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に Security Rules（`*.rules` / firestore.rules / storage.rules）の追加・変更、または `firebase*.{ts,js}` の config 変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: firebase-security-rules — Security Rules / config の変更なし`

## False-positive guards / 抑制条件

- 公開コレクション（公開ブログ記事等）で `allow read` の公開が要件上正当であり、その旨のコメントが明記されている場合は read の公開を指摘しない（`write` の公開は別途指摘する）。
- Firebase の **API key（`apiKey`）はクライアント公開が公式仕様**であり秘密情報ではない。これを「秘密露出」と誤検出しない（admin SDK の `private_key` とは明確に区別する）。
- emulator / test 用のルールファイル（`*.test.rules` 等）は別スコープのため指摘しない。

## Rule / ルール

- `allow read, write: if true;` のような無条件許可は禁止。所有者・認可条件を必須とする。
- `request.auth != null` のみで write を許可しているものは所有者チェック（`request.auth.uid == resource.data.ownerId` 等）を追加する。
- `allow write` に `request.auth` 条件が無いものは認証チェックを追加する。
- service account の `private_key` / admin SDK 初期化用秘密鍵がクライアント側コードに含まれていないか確認する（サーバー専用に隔離する）。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（rules/basics / rules-and-auth）を 1 行で添える。
- 所有者条件が diff 外の関数定義にある可能性がある場合は断定せず慎重に扱う。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: 過剰許可 / 認可欠如 / 秘密露出のどれか（1文）
- Impact: 他人のデータ書き換え / 不正アクセス / 鍵漏洩
- Fix: 所有者条件追加 / `request.auth` 条件追加 / 秘密鍵のサーバー隔離の最小案

## Sources / 出典

- Firebase — Security Rules basics: <https://firebase.google.com/docs/rules/basics>
- Firebase — Rules and authentication: <https://firebase.google.com/docs/rules/rules-and-auth>
