---
id: 'qa-evidence-consistency'
name: QA Evidence Consistency Review
description: 利用者が実行した QA の証拠を読み、AC ごとの記録の不足・矛盾・残余リスクの書き漏れを指摘する。verified や COMPLETE の判定は行わない。
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - '**/*'
tags:
  - qa-evidence
  - downstream
severity: minor
inputContext:
  - qaEvidence
outputKind:
  - findings
  - questions
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: QA 証拠（`schemas/qa-evidence.schema.json`）を読み、記録の不足と矛盾を指摘する。QA 証拠が入力に無い場合は実行しない。

## Goal / 目的

- QA 証拠の 6 欄（Target / Execution / Environment / Verification / Artifacts / Gaps）を読み、AC ごとの記録の不足を指摘する。
- 欄どうしの矛盾（AC の `status` と試行の結果、`basis` と assertion の記録、`notRunReason` と Gaps の記述など）を指摘する。
- 証拠の Gaps に書かれていない残余リスク（`explore` だけの AC、retry 後にだけ PASS した AC、期待値の出所が示されていない AC）を、利用者が確認すべき点として挙げる。

## Non-goals / 扱わないこと

- AC を verified に数えるか、完了の state を `COMPLETE` にするかの判定。誤った合格の防止は決定論の検証モジュールと completion-judge の責務であり、本 skill の出力はその判定に使わない（ADR-017 D3・D4）。
- QA・テスト・runner の実行、retry、自動修復（ADR-017 D1）。
- 差分のコード品質の指摘（他の skill が担当する）。
- 証拠の中で自己申告された run ID・実行者・`required` を、独立性や AC の母集団の根拠として扱うこと（ADR-017 D5）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下が満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `qaEvidence` が含まれている
- [ ] QA 証拠の本体が入力として実際に渡されている（context の宣言だけで本体が無い場合は評価しない）

ゲート不成立時の出力: `NO_REVIEW: qa-evidence-consistency — QA 証拠が利用できないため評価対象なし`

## Guidance

- 所見は差分の行ではなく AC にアンカーし、対象を `QA-EVIDENCE:<AC id>` とする。証拠全体に関わる所見は `QA-EVIDENCE:0` とする。
- `PASS` / `FAIL` の AC に試行の記録が無い、`SKIP` / `NOT_RUN` の AC に `notRunReason` が無い、といった欠落を指摘する。
- AC の `status` が最後の試行の結果と食い違う、サブケースの最も悪い結果と食い違う、といった矛盾を指摘する。
- `basis: explore` の AC や、期待値の出所が `reproduced` / `derived` の AC を、要件を満たした根拠のように説明している記述を指摘する。
- 初回失敗のあと retry で PASS した AC が Gaps に書かれていなければ、flaky の可能性として質問に回す。
- 利用者が報告した `FAIL` は、利用者が報告した不成立として扱い、PASS へ読み替えない。
- 「verified」「合格」「COMPLETE」といった判定の語を出力に書かない。所見は記録の不足・矛盾・確認すべき点として書く。

## False-positive guards / 抑制条件

- schema の構造の誤り（必須欄の欠落、enum の値の誤り）の検出は `schemas/qa-evidence.schema.json` と決定論の検証の責務なので、重ねて指摘しない。
- `out-of-scope` や `requires-human-judgment` の理由が記録された `NOT_RUN` を、実行漏れとして指摘しない。
- ログなどの成果物の中身を読めない場合は、その内容を推測して矛盾と断定せず、質問に回す。

## Output / 出力例

```yaml
findings:
  - severity: minor
    file: QA-EVIDENCE:AC-2
    issue: AC-2 の status は PASS だが、最後の試行の結果は FAIL と記録されている
    suggestion: 最後の試行の結果と AC の status のどちらが正しいかを確認し、証拠を作り直す
questions:
  - 'QA-EVIDENCE:AC-4 は 1 回目が FAIL、2 回目が PASS だが Gaps に記載が無い。flaky として扱うか'
```
