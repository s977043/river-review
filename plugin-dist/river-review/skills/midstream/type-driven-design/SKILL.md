---
id: 'type-driven-design'
name: Type-Driven Design Guard
description: Detect primitive obsession and missing domain/brand types; check that state is modeled via discriminated unions.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx}'
  - 'app/**/*.{ts,tsx}'
  - 'lib/**/*.{ts,tsx}'
  - 'packages/**/*.{ts,tsx}'
tags:
  - typescript
  - type-driven-design
  - domain-modeling
  - midstream
severity: major
inputContext:
  - diff
  - fullFile
outputKind:
  - findings
  - actions
modelHint: balanced
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: プリミティブ型の濫用やドメイン型の欠如をチェックリスト型で評価するが、TypeScript以外の変更では実行不要

## Goal / 目的

- 型を「仕様書」として扱い、ドメイン概念をプリミティブ型のまま放置しないようにする。
- 不正な状態を型レベルで表現不可能にする（"make illegal states unrepresentable"）。

## Non-goals / 扱わないこと

- `any` の排除や型アサーションの削減（`typescript-strict` のスコープ）。
- null/undefined のガードや非 null アサーションの排除（`typescript-nullcheck` のスコープ）。
- 既存の関数シグネチャ（差分に含まれていない）のリファクタ提案。
- `tsconfig.json` の設定変更。
- スタイル/命名規則のレビュー（nit は出さない）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にTypeScriptファイル（`.ts`, `.tsx`）の変更が含まれている
- [ ] 差分がテストファイル（`*.spec.ts`, `*.test.ts`, `__tests__/**`）のみではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: type-driven-design — Type-Driven Design評価の対象となるTypeScriptコード変更が検出されない`

## False-positive guards / 抑制条件

- ブランド型がリポジトリに既に存在し、差分コードがそれを正しく使用している場合（`code_search` で確認）。
- `string` の引数が 1 つしかなく、他のプリミティブとの混入可能性がない場合。
- 外部 API レスポンスやライブラリ型を直接扱う境界コードで、ブランド型の適用範囲が明確でない場合（注記として返す）。
- 小さなユーティリティ関数で、ドメインの文脈を持たない場合。

## Rule / ルール

- ドメイン概念を表す `string` / `number` にはブランド型 (`UserId`, `OrderId`, `Price` 等) を使う。
- 複数の状態を `boolean` フラグや `status: string` で表現するのではなく、判別可能なユニオン型（Discriminated Union）でモデリングする。
- 新規の public 関数/メソッドのシグネチャに `string` / `number` が連続して並ぶ場合、引数が混入可能か確認する。
- リテラルユニオンが複数箇所でインライン定義されている場合、型エイリアスへの切り出しを促す。

## Evidence / 根拠の取り方

- 指摘は差分に紐づける（`<file>:<line>` で追える内容）。
- ブランド型が既にコードベースに存在するかを `code_search` で確認し、根拠を示す。
- 推測を断定しない（不確実なら "可能性" として書く）。

## Output / 出力

`<file>:<line>: <message>` 形式。コメントは日本語で返す。

- Finding: 何が問題か（1文）
- Impact: 何が困るか（短く）
- Fix: 次の一手（最小の修正案）

例:

- `src/order.ts:15: userId と orderId が同じ string 型。引数の順序を間違えてもコンパイルエラーにならない。Fix: ブランド型 UserId / OrderId を導入`

## Heuristics / 判定の手がかり

- `(userId: string, orderId: string)` のように同じプリミティブ型が複数の引数に並ぶ。
- `status: 'pending' | 'active' | 'deleted'` のようなリテラルユニオンが型エイリアスに切り出されていない。
- `isLoading: boolean; isError: boolean; isSuccess: boolean` のように boolean フラグが複数並び、排他性が型で表現されていない。
- `type State = { loading: true } | { error: Error } | { data: Data }` のような判別可能なユニオンが使えるのに使われていない。
- ブランド型が既にコードベースに存在するのに、差分では素の `string` / `number` を使っている。

## Good / Bad Examples

### ブランド型（Branded Types）

Bad:

```ts
function getOrder(userId: string, orderId: string): Order;
// userId と orderId が型レベルで区別されず、引数の順序ミスがコンパイルエラーにならない
```

Good:

```ts
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };
function getOrder(userId: UserId, orderId: OrderId): Order;
// getOrder(orderId, userId) は型エラーになる
```

### 判別可能なユニオン（Discriminated Unions）

Bad:

```ts
type RequestState = {
  isLoading: boolean;
  isError: boolean;
  data?: Data;
  error?: Error;
};
// isLoading: true かつ data が存在する無効な状態が許可される
```

Good:

```ts
type RequestState =
  { kind: 'loading' } | { kind: 'error'; error: Error } | { kind: 'success'; data: Data };
// 無効な状態が型で表現不可能
```

### リテラルユニオンの切り出し

Bad: `status: 'pending' | 'processing' | 'shipped' | 'delivered'` がインラインで重複定義。

Good: `type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered'` と型エイリアスに切り出す。

## Actions / 改善案

- `string` / `number` の引数が並ぶ場合、ブランド型パターン (`type UserId = string & { readonly __brand: 'UserId' }`) の導入を提案する。
- boolean フラグ群を判別可能なユニオン型に置き換え、無効状態を型レベルで排除する。
- リテラルユニオンが複数箇所で繰り返されている場合、型エイリアスへの切り出しを促す。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、「なぜこの型が混入可能か」の根拠と、ブランド型または判別可能ユニオンへの具体的な改善案がある。
- 不合格基準: 差分と無関係な既存コードへの指摘、根拠のない断定、抑制条件の無視、`any` や null 問題との混同。

## 人間に返す条件（Human Handoff）

- ブランド型の導入がプロジェクト全体の型定義戦略に影響する場合（大規模な型リファクタが必要）は人間レビューへ返す。
- 外部パッケージとの型互換性の問題でブランド型が適用困難な場合は、選択肢を提示して判断を仰ぐ。
