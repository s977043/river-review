---
id: 'review-automation-boundary'
name: Review Automation Boundary Guard
description: Detect review findings that belong in CI/lint/formatter rather than human review.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*'
tags:
  - review-process
  - automation
  - ci
  - meta-review
  - midstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - actions
  - metrics
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 自動化可能なレビュー指摘を検出しCI/lint委譲を提案するが、コード変更を含まない差分では実行不要

## Goal / 目的

- レビュー指摘の中から「自動化できるはずの指摘」を検出し、CI/lint/フォーマッタに委ねることで人間レビューの密度を高める。
- 「機械が判定できること」をレビューに持ち込まず、人間にしか判断できない設計・仕様・セキュリティ判断に集中させる。

外部実証: [「コードレビュー指摘300件を3ヶ月分類したら効いていたのは2種類だけだった」](https://zenn.dev/kenimo49/articles/code-review-300-comments-2-effective-categories)（井本 賢, 2026-07-04）は、実際に効果があった指摘は Bug/Spec 系のみだったと報告する。Style/Naming/Refactor/Arch 系は効果が低く自動化・前倒しに適するという結果は、本スキルの方針を裏付ける一次データとして参照できる。

外部実証（続報）: [「AIレビューのブロックを100PRで測ったら、70PRはno-verifyで通り抜けていた」](https://zenn.dev/kenimo49/articles/ai-review-block-100pr-70-noverify-3month)（井本 賢, 2026-07-23）は、100 PR の実測で pre-commit hook のブロックのうち 70% が `--no-verify` で回避されていたと報告します。強制ゲートの守備範囲を「壊れて動かないコード」（構文エラー・smoke test 失敗）へ絞り、lint / 型 / スタイルの判定を AI レビュー側へ移したところ、ブロック後の修正率は 30% から 83% へ改善しました。この前後比較も、本スキルの方針を裏付ける一次データとして参照できます。

## Non-goals / 扱わないこと

- 自動化できない判断（設計方針、セキュリティ上のトレードオフ、仕様の解釈）への言及。
- 実際のコード修正の提案（このスキルはツール設定の提案のみを行う）。
- プロジェクトのスタイルガイドや規約そのものの是非を評価すること。
- 既に CI に設定が存在するルールへの重複指摘。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にソースコード（テスト/フィクスチャのみでない）の変更が含まれている
- [ ] 差分がツール設定ファイル（`.eslintrc`, `.prettierrc`, `tsconfig.json`等）のみの変更ではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: review-automation-boundary — 自動化境界レビューの対象となるソースコード変更が検出されない`

## False-positive guards / 抑制条件

- 差分内に該当ツールの設定ファイル変更が含まれている場合、そのルールは追加中と判断し指摘しない。差分外のリポジトリ設定は確認できないため、断定ではなく「設定がなければ」という条件付きで提案する。
- マイグレーションや一時的な移行期であることが PR 説明から明確な場合は抑制する。

## Rule / ルール

- 差分に「フォーマッタで自動修正できるはずのパターン」（インデント、末尾スペース、クォートスタイル等）が含まれる場合、CI へのフォーマッタ追加を促す。
- 差分に「lint ルールで自動検出できるはずのパターン」（未使用変数、`console.log` の残留、コメントアウトコード等）が含まれる場合、対応する lint ルールの追加を促す。
- 差分に「命名規則の逸脱」が含まれる場合、命名規則チェッカー（ESLint の `naming-convention` ルール等）の追加を促す。
- import 順序の乱れ、ファイル末尾改行の欠如など、ツールで強制できる規約の逸脱を見つけた場合、人間レビューで指摘するのではなくツール設定を提案する。

## Evidence / 根拠の取り方

- 指摘は差分に紐づける（`<file>:<line>` で追える内容）。
- 自動化提案には具体的なツール名とルール名を添える。
- 推測を断定しない（不確実なら "可能性" として書く）。

## Output / 出力

`<file>:<line>: <message>` 形式。コメントは日本語で返す。

- Finding: 自動化できるパターンの検出（1文）
- Impact: 人間レビューの負荷（短く）
- Fix: 導入すべきツール/ルール名

自動化カテゴリごとに集約して出力する（同じパターンが複数箇所にある場合は件数を添える）。

例:

- `src/api.ts:23: console.log が 3 箇所残留。レビューでの指摘は属人的。Fix: ESLint no-console: error を追加し CI で強制`

## Heuristics / 判定の手がかり

### Level 1: フォーマッタで解決すべきパターン

- インデントの不一致、末尾スペース、クォートスタイルの混在
- `prettier` / `gofmt` / `black` 等のフォーマッタで自動修正可能なもの
- ファイル末尾の改行有無

### Level 2: Linter で解決すべきパターン

- `console.log` / `console.error` のまま残ったデバッグ出力（`no-console` ルール）
- コメントアウトされたコードブロック
- 未使用の変数・import（`no-unused-vars`, `@typescript-eslint/no-unused-vars`）
- マジックナンバー（`no-magic-numbers` ルール）
- ネストが深すぎる関数（`max-depth` ルール）

### Level 3: CI/型チェックで解決すべきパターン

注: このレベルでは`any`や`!`の**コード品質上の問題**を指摘しない（それは`typescript-strict` / `typescript-nullcheck`のスコープ）。ここでは「そのルールがCIで強制されていない」という**プロセスの不備**のみを指摘し、ツール設定の追加を提案する。

- `any` の使用（`@typescript-eslint/no-explicit-any` でゼロトレランスにできる）
- 非 null アサーション `!` の使用（`@typescript-eslint/no-non-null-assertion`）
- import 順序（`import/order`, `simple-import-sort` ルール）
- テストカバレッジの閾値（CI の coverage threshold で強制できる）

## Good / Bad Examples

### フォーマッタで対応すべき例

Bad（人間レビューで指摘）: 「インデントが 2 スペースではなく 4 スペースになっています」

Good（自動化）: `prettier --write .` を CI に組み込み、フォーマット差分は PR マージブロックにする。

### Linter で対応すべき例

Bad（人間レビューで指摘）: 「`console.log` が残っています」

Good（自動化）: ESLint の `no-console` ルールを `error` にし、CI で強制する。

### 型チェックで対応すべき例

Bad（人間レビューで指摘）: 「`any` を使っています」

Good（自動化）: `@typescript-eslint/no-explicit-any: error` と `tsconfig.json` の `strict: true` を CI で強制する。

## Actions / 改善案

- フォーマッタで解決できるパターン: `.prettierrc` / `.editorconfig` の導入と CI への `format:check` ステップ追加を提案する。
- lint ルールで解決できるパターン: 対応する ESLint / Ruff / golangci-lint ルール名と設定例を提示する。
- 型チェックで解決できるパターン: `tsconfig.json` の strict オプション名と対応する ESLint ルール名を提示する。
- 提案は「人間レビューのコメントをなくすためにツールを追加する」方向性で出力する。

## Metrics / 計測指標

- 自動化可能な指摘の数（このスキルが検出したパターン数）を`automation_debt`メトリクスとして出力する。
- 出力形式: `{ "automation_debt": <integer> }`をメトリクスブロックのトップレベルキーとして返す。値は検出パターン数の合計。
- 目標: 各PRでこのスキルの指摘が0件になるよう、チームがCI/lintを整備する。

## 評価指標（Evaluation）

- 合格基準: 「このパターンは X というツールで自動化できる」という具体的な根拠（ツール名、ルール名）が添えられている。
- 不合格基準: 人間レビューの指摘をそのまま繰り返す（「`console.log` を消してください」と言うだけで自動化の提案がない）、ツールが存在しない自動化の提案。

## 人間に返す条件（Human Handoff）

- ツール導入がプロジェクトの既存設定と競合する可能性がある場合。
- チームの規約策定そのものが未完了で、何を自動化すべきか合意が必要な場合は人間レビューへ返す。
