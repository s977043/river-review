---
id: 'hallucinated-reference'
name: 'Hallucinated Reference 幻覚的参照の実在確認'
description: '差分で新規に導入された import・メソッド呼び出し・ライブラリ API 参照が実在するかを code_search で検証し、AI 生成コード特有の幻覚的参照（存在しない関数・メソッド・モジュール・引数シグネチャ）を検出する'
version: 0.1.0
category: midstream
phase: [midstream]
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
tags: [hallucination, reference-existence, ai-generated-code, correctness, midstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 参照の実在確認はチェックリスト型評価が主だが、新規参照を含まない差分では実行を止めるゲートが必要

## Goal / 目的

- 差分で新規に導入された参照（import・関数呼び出し・メソッド・ライブラリ API）が実在することを確認し、AI 生成コードに混入する幻覚的参照が実行時エラーとして本番へ到達するのを防ぐ。
- 「実在するが名前が似た別物」への置き換わり（例: `format` と `formatDate` の取り違え）も対象とする。

## Non-goals / 扱わないこと

- レビュー指摘（finding）の evidence 実在確認（それは `independent-review-synthesis` の hallucination guard の役割）。
- リファクタで消えたシンボルへの残存参照の検出（それは `cross-file-leakage` の役割。本スキルは差分内で**新規に導入された**参照のみを見る）。
- 先行実装・既存パターンへの準拠判定（`existing-pattern-conformance` および SIMPLIFY 観点 Reuse の役割）。
- コードスタイル・命名の適切さの評価。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に新規の import / require / 関数呼び出し / メソッド呼び出しの追加が含まれている
- [ ] inputContext に diff が含まれている
- [ ] code_search（rg 等）が利用可能である

ゲート不成立時の出力: `NO_REVIEW: hallucinated-reference — 実在確認の対象となる新規参照が検出されない`

## False-positive guards / 抑制条件

- 同一 PR / 差分内で新規に定義されたシンボルへの参照は指摘しない（定義と利用が同時に追加されるのは正常）。
- tsc / eslint no-undef 等の決定論的チェックが CI で有効なリポジトリでは、ビルドが確実に検出する未解決参照の severity を minor に落とす。実在するが挙動・シグネチャが異なる「意味的幻覚」はこの限りでない。
- code_search で定義が見つからなくても、動的生成（メタプログラミング・codegen）や型定義なし外部パッケージの可能性を棄却できない場合は、findings ではなく questions として返す。
- 標準ライブラリ・依存に含まれる著名ライブラリの公知 API は指摘しない。バージョン差異により存在が疑わしい場合のみ questions とする。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

- 新規 import / require の解決先が、リポジトリ内のモジュールまたは `package.json` の依存に実在するか確認する。
- 新規のメソッド・関数呼び出しについて、レシーバのクラス・モジュール・型にその定義が存在するかを code_search で確認する。
- 依存ライブラリ API の呼び出しが、そのライブラリの公開 API として実在するか確認する。引数の数・名前がシグネチャと乖離している場合も指摘する。
- 「実在するが別物」のパターン（類似名 API・別ライブラリの同名 API・非推奨で削除済みの API）を優先度高く確認する。
- 指摘は最大 5 件。実行時エラーに直結するものを優先する。

## Evidence / 根拠の取り方

- 指摘は差分内の参照行（`<file>:<line>`）に紐づける。
- code_search の結果（定義が見つかった位置、または検索パターンと 0 件である事実）を根拠として明示する。
- 「存在しない」と「確認できなかった」を明確に区別する。後者は questions に落とす。

## Output / 出力（短文版の推奨）

River Review のコメントは`<file>:<line>: <message>`形式です。コメントは日本語で返す。

- Finding: 何が問題か（1文）
- Impact: 何が困るか（短く）
- Fix: 次の一手（最小の修正案）

例:

- `src/report.ts:24: utils/date に formatDateRange は未定義（rg で定義 0 件、export は formatDate のみ）。実行時に TypeError。Fix: formatDate を使うか formatDateRange を実装`

## Heuristics / 判定の手がかり

- 差分の `+` 行に現れる新規 import 指定子・メンバーアクセス・関数呼び出し
- リポジトリ内 code_search で定義がヒットしないシンボル
- `package.json` に存在しないパッケージからの import
- 呼び出し引数の個数・キーワードが既存定義のシグネチャと一致しない箇所

## Good / Bad Examples

### Good

```text
src/notify.ts:18: slack-sdk に postMessageAsync は存在しない（公開 API は chat.postMessage）。実行時に undefined 呼び出しで落ちる。Fix: client.chat.postMessage({...}) に置換
```

### Bad

```text
src/notify.ts:18: この関数は存在しない気がする
```

（code_search の根拠なし、Impact / Fix なし）

## 評価指標（Evaluation）

- 合格基準: 指摘が差分内の新規参照に紐づき、code_search の結果が根拠として示され、修正の次アクションがある。
- 不合格基準: 差分外の既存参照への指摘、検索せずに「存在しないはず」と断定する指摘、同一 PR 内で定義済みのシンボルへの指摘。

## 人間に返す条件（Human Handoff）

- 動的メタプログラミング・コード生成・リフレクションにより静的検索で実在を判定できない場合。
- 依存のバージョン更新が同一 PR に含まれ、API の存在がバージョンに依存する場合。

## Execution Steps / 実行ステップ

1. **Gate**: 差分に新規参照の追加があるか確認。なければ`NO_REVIEW`を返す
2. **Analyze**: 新規参照を列挙し、code_search で定義・依存の実在を確認。False-positive guards を適用
3. **Output**: 実在しない参照を findings、確認不能な参照を questions として出力
