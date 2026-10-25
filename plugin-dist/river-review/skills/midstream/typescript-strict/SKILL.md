---
id: 'typescript-strict'
name: TypeScript Strictness Guard
description: Enforce TypeScript strictness by reducing any/unsafe assertions and ensuring null handling.
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
Why: TypeScriptコードの差分からany/型アサーションの乱用をレビューし、型安全性の低下シナリオを逆照射する。

## Rule / ルール

- `any` の使用や無制限の型アサーションを最小化する
- null/undefined を明示的に扱い、ガード節を追加する
- 型の流れが不明な箇所には型エイリアス/インターフェースを付ける

## Heuristics

- `any`, `as unknown as`, `as any` などが新たに追加されている
- 非 null アサーション `!` が多用されている
- 関数戻り値や外部入力が `any` や `object` で受け取られている

## Good / Bad Examples

- Good: `type User = { id: string; name: string };`
- Bad: `const user: any = getUser();`
- Good: `if (!value) return;` で null をガード
- Bad: `value!.doSomething()` で非 null アサーション連発

## Actions / 改善案

- `unknown` で受けて型ガード関数を追加する
- null チェックをガード節で追加し、早期 return を使う
- 型アサーションの代わりに型定義や Zod 等でスキーマを導入する

## Non-goals / 扱わないこと

- プロジェクト全体の strict 設定を変更する提案。
- 既存ライブラリの型定義の不備を修正する。
- 型以外のスタイル/命名のレビュー。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にTypeScriptファイル（`*.ts` または `*.tsx`）が含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: typescript-strict — TypeScriptファイルの差分がない`

## False-positive guards / 抑制条件

- `any` が一時的な実験コードで、明示的なコメントがある。
- 型定義が別ファイルにあり、変更範囲では判定できない。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
