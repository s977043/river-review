---
id: 'plangate-tdd-evidence'
name: PlanGate TDD Evidence Review
description: TDD を主張する実装の RED/GREEN/REFACTOR VERIFY 証跡（tdd-ledger）の妥当性を検査し、フェーズ順序・exitCode・test-cases との対応の欠落や偽装を検知する
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/*'
tags:
  - plangate
  - tdd
  - evidence
  - verification
  - upstream
severity: major
inputContext:
  - diff
  - repoConfig
outputKind:
  - findings
  - summary
  - questions
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: `tdd-ledger` のフェーズ別証跡を基準として妥当性を突き合わせる照合型レビューであり、必須 artifact（tdd-ledger）が揃わない場合は実行を止めるゲート（Inversion）も要する。

## Goal / 目的

- TDD を主張する実装について、`tdd-ledger` に記録された RED/GREEN/REFACTOR VERIFY フェーズの証跡が**妥当**かを検査する。
- 「TDD したと主張するが RED 証跡が無い」「RED が偶然 pass している」「証跡が test-cases に対応しない」といった**証跡の欠落・偽装**を検知する。

## Non-goals / 扱わないこと

- テストコードの書き方・命名・カバレッジ品質（`code-*` 系 test scaffold skill の領域）。
- plan / todo / test-cases と差分の整合（姉妹 skill `plangate-exec-conformance` の領域）。
- 既存レビュー文書の W チェック（`plangate-verification-audit` の領域）。
- すべての PR に TDD を要求すること（TDD が宣言・要求された変更のみが対象）。

## Pre-execution Gate / 実行前ゲート

このスキルは、以下の条件の**いずれか 1 つでも満たされない場合**に `NO_REVIEW` を返す（すべて満たされたときのみレビューを実行する）。

- [ ] artifact として `tdd-ledger` が解決できている
- [ ] `tdd-ledger` に 1 つ以上の `phases[]` エントリが含まれている
- [ ] inputContext に `diff` が含まれ、レビュー対象の差分が空でない

ゲート不成立時の出力: `NO_REVIEW: plangate-tdd-evidence — tdd-ledger artifact または差分が揃っていない`

**Gate と抑制条件の違い:**

- Gate = 実行するかどうかの判定（`tdd-ledger` が欠損していれば一切レビューしない）。
- 抑制条件 = 実行した上で黙るかどうかの判定。

## False-positive guards / 抑制条件

- TDD が要求されない変更（ドキュメント・設定・生成物のみの差分で、ledger も TDD フェーズを記録していない）は指摘しない。
- `refactor_verify` は **refactor が行われた場合のみ必須**。リファクタを伴わない差分での欠如は指摘しない。
- ledger が「TDD 対象外」と明記したフェーズ・タスクは対象外とする。
- 証跡の妥当性が ledger だけでは判断できない場合は、断定せず `[q]` で確認する（推測で「偽装」と断定しない）。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

`tdd-ledger.json` の `phases[]` を読み、各フェーズの妥当性を次のルールで検査する。

1. RED の存在と妥当性
   - high-risk / TDD 宣言のある変更に `tdd_red` フェーズが存在するか確認する。
   - `tdd_red` は `exitCode != 0`（テストが先に失敗した）であること。`exitCode == 0` は「RED が偶然 pass」= 偽の RED として指摘する。
   - `conclusion` が、期待された失敗（対象機能の未実装）を説明しているか確認する。無関係なランタイムエラー・import 失敗での失敗は無効な RED として指摘する。
2. GREEN の存在と対応
   - `tdd_green` フェーズが存在し `exitCode == 0` であること。
   - `tdd_green` の対象が `tdd_red` と同じ挙動（同じ `testCaseRefs` / コマンド）を指しているか確認する。RED と無関係な GREEN は指摘する。
3. REFACTOR VERIFY
   - 差分に整理・リファクタが含まれる場合、`refactor_verify`（`exitCode == 0`）が存在するか確認する。
4. verification（TDD 以外の最終検証）
   - `verification` フェーズが記録されている場合は `exitCode == 0` であることを確認する。`exitCode != 0` は最終検証の失敗として指摘する。
   - `verification` は RED/GREEN を**置き換えない**。verification のみが存在し `tdd_red` / `tdd_green` を欠く場合は `missing-tdd-red` / `missing-tdd-green` の対象とする。
5. test-cases との対応
   - `phases[].testCaseRefs` が `test-cases` artifact のケース ID に対応づくか確認する。対応づかない証跡は `tdd-evidence-not-linked-to-test-case` として指摘する。
   - `test-cases` の受入挙動に対し、テストが mock のみを検証してビジネス境界を見ていないと読み取れる場合は指摘する。
6. 不確実性の扱い
   - ledger の記述が曖昧でフェーズ妥当性が判断できない場合は、断定せず `[q]` として質問形式で返す。

## Finding 分類（taxonomy）

各指摘には、追跡しやすさのため次の **finding-id** を `[id=...]` として付与してよい（任意。出力形式は `<file>:<line>: <message>` を維持する）。

| finding-id                                | 意味                                                   | 既定 severity |
| ----------------------------------------- | ------------------------------------------------------ | ------------- |
| `missing-tdd-red`                         | TDD が要求されるが RED 証跡が無い                      | warning       |
| `invalid-tdd-red`                         | RED が pass している、または無関係な理由で失敗している | warning       |
| `missing-tdd-green`                       | 実装後に GREEN 証跡が無い                              | warning       |
| `missing-refactor-verify`                 | リファクタが行われたが refactor 後の検証が無い         | nit / warning |
| `tdd-evidence-not-linked-to-test-case`    | 証跡を計画した test case に対応づけられない            | warning       |
| `test-does-not-cover-acceptance-criteria` | テストはあるが約束した受入挙動を検証しない             | warning       |

各 finding の既定 severity は warning だが、**TDD が必須要件として宣言された変更で `tdd_red` と `tdd_green` の両証跡が完全に欠落する場合は blocker にエスカレーションする**（下記 Output の severity ガイド参照）。

## Evidence / 根拠の取り方

- 指摘は `tdd-ledger` の該当 `phases[]` エントリ（`phase` / `exitCode` / `command`）と、対応する `test-cases` のケース ID をペアで示す。
- ledger に記録されていない事項を「証跡が無い」と断定する前に、ledger 全体を確認する（記録漏れと真の欠如を区別する）。
- diff に登場しないコードへの推測に基づく指摘は禁止（`review-core` ルール遵守）。

## Output / 出力

- すべて日本語。コメントは River Review の `<file>:<line>: <message>` 形式。ledger を指す場合は `tdd-ledger.json:<1 始まりのフェーズ番号>`（例: 2 番目のフェーズなら `tdd-ledger.json:2`）を疑似ロケーションとして用いる。`<line>` は**必ず整数**にする（パーサが行番号を整数として解釈するため、フェーズ名などの文字列を入れない）。
- severity は内部語彙 `blocker|warning|nit` を使用し、スキーマ側 `critical|major|minor|info` への変換は `review-core` ルールに委ねる。分類ガイド:
  - `blocker`: TDD が必須要件として宣言された変更で RED/GREEN 証跡が完全に欠落。
  - `warning`: 偽の RED（pass）、GREEN 欠落、test-case 未対応、受入挙動の未検証。
  - `nit`: refactor_verify の軽微な欠如など。
  - severity 省略: 参考情報や補足の質問。
- サマリ行: `(summary):1: RED <件数> / GREEN <件数> / refactor <件数> / test対応 <件数> / 質問 <件数>`
- 個別 finding の推奨構造:
  - Finding: どのフェーズ証跡がどう不当か（1 文）。任意で先頭に `[id=<finding-id>]` を付ける。
  - Evidence: `tdd-ledger: <phase>(exitCode=...)` と `test-cases: <ケース ID>`。
  - Fix: 最小の是正案（RED の再取得 / GREEN 追加 / test-case 対応づけなど）。
- 質問は `(questions):1: [q] <確認したいこと>` 形式で 1 件 1 行。

## 評価指標（Evaluation）

- 合格: 指摘が ledger のフェーズ証跡と test-cases のペアで根拠づけられ、severity がフェーズ妥当性（RED/GREEN/refactor/対応）に明確に紐づく。
- 不合格: ledger に無い事項への断定、差分に存在しないコードへの指摘、テストコード品質への越境、TDD 非対象変更への難癖。

## 人間に返す条件（Human Handoff）

- ledger の記述が曖昧で、フェーズ妥当性の解釈が複数成り立つ場合。
- TDD を要求すべき変更だったかどうか（high-risk 判定）が方針判断を要する場合。
- 証跡の偽装が疑われるが、ledger だけでは断定できない場合。

## 関連ドキュメント

- [Artifact Input Contract](../../../pages/reference/artifact-input-contract.md) — `tdd-ledger` の契約
- [Review Policy](../../../pages/reference/review-policy.md) — レビュー標準ポリシー
- 姉妹 skill: `plangate-exec-conformance`（plan/todo/test-cases と差分の整合）
- 姉妹 skill: `plangate-verification-audit`（既存レビュー文書の W チェック）
- 出典: Issue #1223（Superpowers 由来の TDD Evidence Review）

### `tdd-ledger` の生成元（producer）について

`tdd-ledger` artifact は River Review が**読み取る** consumer 入力であり、River Review 自身は生成しない（`findings-pool` と同じ consumer-first パターン）。生成は PlanGate などの上流ワークフロー（例: PlanGate の `evidence-ledger`）が exec 中に担う想定である。

したがって **PlanGate 等の producer を併用しない River Review 単体の adopter では、`tdd-ledger` が供給されないため本スキルは常に `NO_REVIEW` を返す**（Pre-execution Gate 不成立）。これは設計上の意図であり欠陥ではない。producer を実装・接続する際は、書き出す `tdd-ledger.json` の形式を本スキルの Gate（`phases[]` ≥ 1）および `pages/reference/artifact-input-contract.md` の `tdd-ledger` 節と必ず突き合わせること。
