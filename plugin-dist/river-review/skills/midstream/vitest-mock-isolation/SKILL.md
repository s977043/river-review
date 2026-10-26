---
id: 'vitest-mock-isolation'
name: 'Vitest Mock Isolation Review'
description: 'Detects Vitest test-isolation hazards: unrestored vi.spyOn/vi.mock without afterEach cleanup or restoreMocks config, un-awaited resolves/rejects assertions, and shared mutable module state across tests.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.{test,spec}.{ts,tsx,js,jsx}'
  - '**/*.test.*'
tags: [vitest, testing, mocks, frontend, midstream, community]
severity: major
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Vitest 固有の mock lifecycle と async expect 契約をチェックリスト型で検査し、設定不明時はゲートで止める。

## Goal / 目的

- `vi.spyOn` / `vi.mock` の未復元によりテスト間でモック状態が漏れ、実行順序依存の flaky を生むのを防ぐ。
- `expect(...).resolves` / `.rejects` の await/return 漏れによる「常に pass する空 assertion」を検出する。
- モジュールスコープの可変状態がテスト間でリークするのを検出する。

## Non-goals / 扱わないこと

- テストの存在有無・カバレッジ・命名は downstream test スキルの領域であり、本スキルでは扱わない。
- どのアサーションライブラリを使うべきかの選定。
- テスト対象の実装ロジックの正しさ（本スキルは mock lifecycle と async expect 契約に限定）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `vi.mock` / `vi.spyOn` / `expect(...)` の追加・変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: vitest-mock-isolation — mock / spy / expect の変更なし`

## False-positive guards / 抑制条件

- vitest config（`vitest.config.ts` / `vite.config.ts`）で `test.restoreMocks: true` / `clearMocks: true` / `mockReset: true` が設定されている場合、`afterEach` の明示呼び出しが無くても指摘しない。diff だけで設定が見えない場合は断定せず質問に留める。
- `vi.fn()` をローカル変数で都度生成し再利用していないケースはリーク源でないため指摘しない。
- `setupFiles` で指定された setup ファイルが意図的にグローバルモックを共有する場合は、別スコープとして扱い指摘しない。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

- `vi.spyOn` / `vi.mock` を使う場合、`afterEach(() => vi.restoreAllMocks())`（spy 復元）または `vi.clearAllMocks()` の呼び出し、もしくは config の `restoreMocks: true` 等のいずれかを満たすことを確認する。いずれも無ければモック状態がテスト間で漏れる。
- `expect(promise).resolves` / `.rejects` は `await` または `return` する。`async` テスト内で await されない expect は検出する。
- モジュールスコープの可変変数を複数テストが書き換える場合、`beforeEach` 等でのリセットを確認する。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、Vitest 公式の該当規約（mock restore / async assertion）を 1 行で添える。
- config が diff 外にあり確認できない場合は断定せず「可能性」として質問に留める。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どの分離契約に反しているか（1文）
- Impact: テスト間状態リーク / 実行順序依存 flaky / 常に pass する空 assertion 等
- Fix: `afterEach(vi.restoreAllMocks)` / `restoreMocks: true` / `await expect(...).rejects` の最小修正案

## Sources / 出典

- Vitest — vi API（mock restore）: <https://vitest.dev/api/vi.html>
- Vitest — config restoreMocks: <https://vitest.dev/config/#restoremocks>
