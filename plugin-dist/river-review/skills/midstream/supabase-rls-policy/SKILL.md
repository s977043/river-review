---
id: 'supabase-rls-policy'
name: 'Supabase RLS Policy Review'
description: 'Detects tables created without ROW LEVEL SECURITY enabled, over-permissive policies (USING (true) / WITH CHECK (true) without owner conditions), and service_role key exposure in client code.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.sql'
  - '**/migrations/**/*.sql'
  - '**/supabase/**/*.{ts,js,sql}'
tags: [supabase, security, baas, rls, authorization, midstream, community]
severity: critical
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Supabase RLS の未有効化・過剰 policy・service_role 露出をチェックリスト型で検査する

## Goal / 目的

- `ENABLE ROW LEVEL SECURITY` 無しで public スキーマにテーブルを公開する RLS 未有効化を検出する。
- `USING (true)` / `WITH CHECK (true)` で全行アクセスを許可し所有者条件（`auth.uid() = user_id`）を欠く過剰 policy を検出する。
- `service_role` key（anon key と区別）がフロントエンドコードにハードコードされる露出を検出する。

## Non-goals / 扱わないこと

- インデックス・クエリ性能設計。
- migration の冪等性・ロールバック設計。
- policy の粒度（テーブル分割方針）の良し悪し（要件依存のため一律指摘しない）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `CREATE TABLE` / `CREATE POLICY` / RLS 設定を含む SQL、または `supabase/**` のクライアントコード変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: supabase-rls-policy — RLS / policy / key の変更なし`

## False-positive guards / 抑制条件

- 公開参照テーブル（マスタデータ等）で `USING (true)` の **SELECT policy** が要件上正当であり、その旨のコメントが明記されている場合は指摘しない（INSERT / UPDATE / DELETE の `true` は別途指摘する）。
- **anon key のクライアント使用は公式仕様**で正当。`service_role` key と混同して誤検出しない。
- emulator / seed / test 用の SQL（ローカル専用）は別スコープのため指摘しない。

## Rule / ルール

- public スキーマのテーブル作成は `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` を必須とする（RLS 無効のまま公開しない）。
- `USING (true)` / `WITH CHECK (true)` の全許可 policy は所有者条件（`auth.uid() = user_id` 等）に置き換える。
- `service_role` key がフロントエンド／クライアントバンドルに含まれていないか確認する（サーバー専用に隔離する）。anon key の使用は許容する。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（row-level-security / api-keys）を 1 行で添える。
- RLS 有効化が同一 migration の別行にある可能性がある場合は断定せず慎重に扱う。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: RLS 未有効 / 過剰 policy / service_role 露出のどれか（1文）
- Impact: 全行アクセス / なりすまし / 鍵漏洩
- Fix: `ENABLE ROW LEVEL SECURITY` / 所有者条件付き policy / key のサーバー隔離の最小案

## Sources / 出典

- Supabase — Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase — API Keys: <https://supabase.com/docs/guides/api/api-keys>
