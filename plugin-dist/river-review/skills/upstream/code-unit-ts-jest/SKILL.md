---
id: 'code-unit-ts-jest'
name: Unit Test Scaffold (TypeScript)
description: Generate TypeScript unit test skeletons (Jest/Vitest) from specifications.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'specs/**/*.md'
tags: [review-support, unit-test, tdd, typescript, jest, vitest]
severity: major
inputContext: [fullFile]
outputKind: [tests]
modelHint: high-accuracy
---

## Pattern declaration

Primary pattern: Generator
Secondary patterns: Inversion
Why: 仕様書からTypeScriptユニットテストの足場を生成するジェネレーターであり、仕様の抜けをテスト観点から逆照射する。

## Role

あなたは熟練したTypeScript開発者です。
仕様書の内容を満たすための「単体テストのスケルトンコード（足場）」を作成してください。実装は行わず、テスト構造のみを作成します。

## Non-goals / 扱わないこと

- 実装ロジックや最適化方針は記述しない。
- E2E/統合テストの網羅は対象外で、Jest/Vitest 向けのユニットテスト足場に限定する。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に仕様書（`docs/**/*.md` または `specs/**/*.md`）が含まれている
- [ ] 仕様書にTypeScriptアプリケーションに関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: code-unit-ts-jest — 対象となるTypeScript仕様が差分に含まれていない`

## False-positive guards / 抑制条件

- 仕様に明記されていない要件を推測で追加しない。
- 対象外とされた領域（例: 外部サービス接続の実装詳細）への指摘は行わない。

## Output Format

TypeScript (Jest/Vitest) のコードブロック。
`describe` で機能をグルーピングし、`it` または `test` で各ケースを定義します。
各 `it` ブロックの中には、検証すべき内容をコメントで `// TODO: ...` として記述してください。

## Example

```typescript
describe('UserRegistration', () => {
  describe('validation', () => {
    it('should throw error when email is invalid', async () => {
      // TODO: Arrange invalid email input
      // TODO: Act call registration
      // TODO: Assert ValidationError
    });
  });
});
```

## Constraints

- 実装の詳細（DOM操作など）には立ち入らず、インターフェースの入出力と振る舞いに注目してください。
- エッジケース（空入力、最大長、不正文字）のテストケースを必ず含めてください。
