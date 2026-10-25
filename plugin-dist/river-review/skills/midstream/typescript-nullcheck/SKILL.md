---
id: 'typescript-nullcheck'
name: TypeScript Null Safety Guardrails
description: Enforce null/undefined safety for changed TypeScript code and suggest safer patterns.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx}'
  - 'app/**/*.{ts,tsx}'
  - 'lib/**/*.{ts,tsx}'
  - 'packages/**/*.{ts,tsx}'
tags: [typescript, type-safety, midstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: TypeScriptコードの差分からnull/undefinedの安全性をレビューし、実行時エラーシナリオを逆照射する。

## Rule / ルール

- 非同期・外部入力・オプショナル値には null/undefined ガードを設ける。
- 非 null アサーション（`!`）や型アサーション（`as Foo`）に頼らず安全な分岐/early return を使う。
- ユニオン型は網羅的にハンドリングし、`never` 到達をチェックする。

## Heuristics / 判定の手がかり

- `foo!` や `as Type` で未定義かもしれない値を強制している。
- API レスポンス/環境変数/クエリパラメータをノーチェックで使用。
- `switch`/`if` でユニオン型の全ケースをカバーしていない（defaultで握りつぶし）。
- Promise 戻りを `await` せずに使い、`undefined` アクセスの可能性がある。

## Good / Bad Examples

- Good: `if (!value) return err('missing value');` のように early return でガード。
- Bad: `value!.length` のような非 null アサーション。
- Good: `switch (state.kind)` で各 kind を列挙し、`default: assertNever(state)` を置く。

## Actions / 改善案

- 外部入力やオプショナル値に対して null/undefined チェックを追加し、早期 return/throw で制御を明確化する。
- 非 null アサーションを排除し、undefined を許容する型定義やパーサーを導入する。
- ユニオン型を網羅する switch/if を書き、`assertNever` などで漏れを検知する。

## Non-goals / 扱わないこと

- 全コードベースの型定義や API 契約の再設計。
- `strict` モードの導入可否判断。
- ライブラリ側の型定義バグの修正。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にTypeScriptファイル（`*.ts` または `*.tsx`）が含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: typescript-nullcheck — TypeScriptファイルの差分がない`

## False-positive guards / 抑制条件

- null/undefined が型で排除され、追加ガードが不要な箇所。
- `asserts`/バリデータで入力が保証されていると明示されている。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
