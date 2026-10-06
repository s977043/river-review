---
id: 'async-correctness'
name: 'Async Correctness 非同期処理の正しさ検証'
version: 0.2.0
description: 'await 漏れ・floating promise・並行競合など、非同期処理の correctness バグを検出する。並列化の効率提案（SIMPLIFY Efficiency）や配線断点（e2e-wiring）ではなく、「await を忘れて結果・順序・エラー伝播が壊れる」実装バグに限定する'
category: midstream
phase: [midstream]
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
tags: [async, await, promise, race-condition, correctness, midstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 非同期 correctness はチェックリスト型評価が主だが、async/await/Promise を含まない差分では実行を止めるゲートが必要

## Goal / 目的

- 差分に含まれる非同期処理の correctness バグ（await 漏れ・floating promise・並行競合）が本番で「たまにしか再現しない不具合」になるのを防ぐ。
- 「動いているように見えるが順序・エラー伝播が壊れている」実装を、差分の段階で検出する。

## Non-goals / 扱わないこと

- 宣言した処理の経路が末端まで配線されているかの確認（`e2e-wiring` の役割。本スキルは配線済みの非同期コードの**実行の正しさ**を見る）。
- 逐次 await の並列化提案（SIMPLIFY 観点 Efficiency の役割。本スキルは「速くできる」ではなく「壊れている」だけを指摘する）。
- テストコード内の un-awaited assertion（`vitest-mock-isolation` の役割）。
- null / undefined の伝播（`typescript-nullcheck` / `nullability-contract` の役割）。
- 設計判断そのものの論理検証（`logic-torturing` の役割）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分の追加・変更行に `async` / `await` / `.then` / `.catch` / `.finally` / `Promise` のいずれかが出現する
- [ ] inputContext に diff が含まれている

ゲート不成立時の出力: `NO_REVIEW: async-correctness — 非同期処理を含む変更が検出されない`

## False-positive guards / 抑制条件

- 意図的な fire-and-forget（`void asyncFn()` 明示、またはコメント・命名で意図が明確なもの）は指摘しない。ただしエラーハンドリングが皆無なら questions として確認する。
- `@typescript-eslint/no-floating-promises` が有効なリポジトリでは、当該ルールが決定論で検出する単純な floating promise の severity を minor に落とす。順序・競合の問題はこの限りでない。
- フレームワークが await を要求しない規約（イベントハンドラ・ライフサイクルフック等）に従う呼び出しは指摘しない。
- 共有状態への並行アクセスは、差分内のコードだけで競合が確定する場合のみ findings とする。差分外の呼び出し文脈に依存する場合は questions に落とす。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

- **await 漏れ**: Promise を返す呼び出しの結果を await / then せずに値として使用していないか（`if (asyncCheck())` は常に truthy、`const x = asyncGet()` の x は Promise）。
- **floating promise**: 結果もエラーも処理されない Promise が放置されていないか（unhandled rejection でプロセス・リクエストが不安定になる）。
- **エラー伝播の断絶**: `try` ブロック内で await せずに Promise を return し、catch が効かない構造になっていないか。
- **並行競合**: 同一リソースへの check-then-act（TOCTOU）、`Promise.all` 内での同一状態への書き込み、ループ内の共有変数への非同期書き込みがないか。
- **待たれないコレクション反復**: `forEach` に async コールバックを渡して完了を待たずに後続処理へ進んでいないか（`for...of` + await または `Promise.all(map(...))` が必要な文脈か確認）。
- **非同期コールバックの誤用**: `filter` に async コールバックを渡していないか（Promise は常に truthy のため全件が残り、フィルタリングが機能しない）。`reduce` で Promise のハンドリングが壊れていないか。
- 指摘は最大 5 件。データ破壊・順序依存バグに直結するものを優先する。

## Evidence / 根拠の取り方

- 指摘は差分内の該当行（`<file>:<line>`）に紐づける。
- 呼び出し先が Promise を返すことを、型シグネチャまたは code_search で確認してから指摘する（推測で「非同期のはず」と断定しない）。
- 「壊れる」と「壊れる可能性がある」を区別し、後者は入力条件・タイミング条件を明示する。

## Output / 出力（短文版の推奨）

River Review のコメントは`<file>:<line>: <message>`形式です。コメントは日本語で返す。

- Finding: 何が問題か（1文）
- Impact: 何が困るか（短く）
- Fix: 次の一手（最小の修正案）

例:

- `src/sync.ts:31: saveAll() の戻り値 Promise を await せず次の read が走る。書き込み前の古い値を読む競合。Fix: await saveAll() に変更`

## Heuristics / 判定の手がかり

- `async` 関数内で戻り値が使われない Promise 呼び出し（`.then` / `await` / `void` / 変数代入のいずれもない）
- `if` / `while` / `switch` / 三項演算子 / `!` の条件位置にある async 関数呼び出し
- `try { return asyncFn(); } catch` の形（await なし return）
- `forEach(async ...)` / `filter(async ...)` パターン
- ループ・`Promise.all` 内での同一変数・同一キーへの書き込み

## Good / Bad Examples

### Good

```text
src/jobs/cleanup.ts:18: if (isLocked(id)) は Promise を条件評価しており常に truthy。ロック確認が機能せず二重実行される。Fix: if (await isLocked(id))
```

### Bad

```text
src/jobs/cleanup.ts:18: 非同期処理に注意してください
```

（どの行の何が壊れるかの特定なし、Impact / Fix なし）

## 評価指標（Evaluation）

- 合格基準: 指摘が差分内の非同期コードに紐づき、呼び出し先が Promise を返す根拠と、壊れる条件・修正案が示されている。
- 不合格基準: 同期関数への誤指摘、意図的 fire-and-forget への指摘、効率（並列化）の提案の混入。

## 人間に返す条件（Human Handoff）

- 競合の成立が実行環境の並行度・呼び出し頻度に依存し、コードだけでは判定できない場合。
- キュー・ロック等の外部機構で直列化されている可能性がある場合（設計意図の確認が必要）。

## Execution Steps / 実行ステップ

1. **Gate**: 差分に async / await / Promise の追加・変更があるか確認。なければ`NO_REVIEW`を返す
2. **Analyze**: Rule の5パターンで差分を走査し、呼び出し先の Promise 性を code_search で確認。False-positive guards を適用
3. **Output**: 確定バグを findings、タイミング・文脈依存を questions として出力
