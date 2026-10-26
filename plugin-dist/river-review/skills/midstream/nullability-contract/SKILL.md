---
id: 'nullability-contract'
name: Nullability Contract Review
description: Detect null/undefined/empty handling gaps where callers or consumers may receive unexpected nullish values.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx}'
  - 'app/**/*.{ts,tsx}'
  - 'lib/**/*.{ts,tsx}'
  - 'packages/**/*.{ts,tsx}'
tags: [nullability, contract, type-safety, defensive-programming, midstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: null/undefined/emptyの処理漏れはランタイムエラーの主要因。差分内の関数・API境界でnullability契約が明示・遵守されているかをレビューする。

## Rule / ルール

- 関数の戻り値がnull/undefinedを返す可能性がある場合、型シグネチャに明示する（`T | null`、`T | undefined`、`T | null | undefined`）。
- 呼び出し元でnull/undefinedチェックを省略しないこと。
- 配列・オブジェクトの空ケース（空配列`[]`、空オブジェクト`{}`）もnullと同様に考慮する。
- Optional chainingのみでは不十分な場合（次の処理でnullが伝播する場合）は明示的なearly returnを使用する。

## Heuristics / 判定の手がかり

- 戻り値型に`null`/`undefined`を含む関数の呼び出しで、nullチェックなしにプロパティアクセスや関数呼び出しが行われている。
- `Array.find()` / `Array.at()` など`undefined`を返しうる配列メソッドの結果を直接使用している。
- `Map.get()` の結果をノーチェックで使用している。
- オブジェクトのプロパティアクセスが深くネストされており、中間のnull可能性がケアされていない。
- `as string` / `!` などで型システムをバイパスしてnull可能性を握りつぶしている。
- `parseInt` / `parseFloat` / `Number()` / 暗黙の数値・文字列変換の結果を`NaN`チェックなしに使用しており、変換失敗が下流へ伝播する（型変換によるデータ損失）。

## Good / Bad Examples

- Good: `const item = map.get(key); if (!item) return null; return item.value;`
- Bad: `return map.get(key)!.value;`
- Good: `const found = items.find(x => x.id === id); if (!found) throw new Error(\`Item ${id} not found\`);`
- Bad: `return items.find(x => x.id === id).name;`
- Good: `function getUser(id: string): User | null { ... }` と戻り値型で明示。
- Bad: `function getUser(id: string): User { ... }` でnullを返す可能性を隠蔽。

## Actions / 改善案

- null/undefinedを返しうる箇所の型シグネチャを修正し、呼び出し元でのチェックを徹底する。
- `Array.find()` / `Map.get()` などの結果はunwrapするか早期returnする。
- 非 null アサーション（`!`）を除去し、型ガードまたはearly returnで代替する。
- nullableな値を扱うユーティリティ（`Optional<T>` パターン等）の導入を検討する。

## Non-goals / 扱わないこと

- TypeScriptの`strict`モード設定変更提案（別スキルのスコープ）。
- null許容を意図的に使用しているライブラリAPI（外部依存）の型定義修正。
- コードベース全体の型定義一貫性の監査（差分外のコードは対象外）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にTypeScriptファイル（`*.ts` または `*.tsx`）が含まれている
- [ ] 差分にnull/undefined/emptyを返しうる処理またはそれらを受け取る処理が含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: nullability-contract — null/undefined処理のTypeScript差分がない`

## False-positive guards / 抑制条件

- `asserts`関数やバリデーション後のnon-null保証が差分から確認できる場合は指摘しない。
- Optional chainingが適切に使われ、nullが下流に伝播しない（最終的にデフォルト値やエラーで処理される）場合。
- テストコードでのモックやspyオブジェクトへの型アサーション（`as unknown as T`）は対象外。
- **fail-fast が設計意図の内部不変条件へ、防衛的フォールバックを提案しない**（#1480）。設定・登録・スキーマの欠落など「モジュール内部の不変条件」（起きたら即クラッシュさせたい前提）に対し `?? {}` / `?? []` などのフォールバックを足すと、根絶したはずの silent drift を再導入する。この境界は**値の出所**で判断する。
  - 内部不変条件（config / registry / 内部で構築した Map・オブジェクト）の欠落 = fail-fast が意図。防衛は提案しない。
  - 外部 IO・環境境界（`argv` / `fs` / network / 外部 API レスポンス）から入る値 = 防衛必須。例外を握りつぶさずに適切に処理し、null をハンドリングする。ここへの防衛欠落はむしろ指摘する（例: `#1475` は `fs.realpathSync` を try/catch なしで呼び ENOENT でクラッシュした実バグ。`#1480` の内部 registry への `?? {}` は FP）。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分の具体的なコードに紐づき、null/undefinedが到達しうる経路が説明されている。
- 不合格基準: 型システムで保証されているケースへの誤指摘、テストモックへの誤指摘、差分外コードへの指摘。

## 人間に返す条件（Human Handoff）

- null可能性が仕様上意図的かどうかが差分から判断できない場合は質問として返す。
- 型定義の変更が広範囲に影響する場合は人間レビューへ返す。
