---
id: 'loading-state'
name: Loading State Transition Review
description: Detect missing loading/error/empty state handling that could trap users in spinners or disabled states.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx}'
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'lib/**/*.{ts,tsx,js,jsx}'
  - 'packages/**/*.{ts,tsx,js,jsx}'
tags:
  - ux
  - loading-state
  - error-handling
  - midstream
severity: major
inputContext:
  - diff
outputKind:
  - findings
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: ローディング状態の管理ミスはUXに直結するが、テストで気づきにくい

## Guidance

- Check if async data fetching (useQuery, useSWR, fetch, axios) handles all three states: loading, success, error.
- Flag missing `error` state when `loading` state is handled.
- Flag missing `loading` guard when mutation is triggered (e.g., submit button not disabled during pending).
- Check for missing early returns that could render UI before data is available (`if (!data) return null`).
- Flag `isLoading && <Spinner />` without a corresponding `isError && <ErrorMessage />`.

## Non-goals

- グローバルなローディングインジケーターの存在は前提として受け入れる（実装詳細は不問）。
- テストファイル内のモックデータや固定値は対象外。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にasync data fetchingまたはUIコンポーネントのレンダリングロジックが含まれている
- [ ] loading/error/data stateを扱うコードパターンが存在する（useQuery, useSWR, useState + fetch等）

ゲート不成立時の出力: `NO_REVIEW: loading-state — loading state関連のUI変更が検出されない`

## False-positive guards

- ライブラリがSuspenseやError Boundaryで上位でハンドリングしている場合は黙る。
- テスト専用のコンポーネントは対象外。
- 意図的に簡略化されたadmin-onlyビューは緩く扱う。
