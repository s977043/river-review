---
id: 'pr-template-qa'
name: PRテンプレート品質チェック
description: PRテンプレートの必須項目（日本語記載、Diátaxis、検証コマンド、チェックリスト）が明確かを確認し、抜けや誤解を生む文言を指摘する
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '.github/pull_request_template.md'
  - '.github/PULL_REQUEST_TEMPLATE.md'
tags:
  - process
  - documentation
  - upstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - summary
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: PRテンプレートの差分から必須項目・検証コマンド・チェックリストの抜けをレビューし、レビューフロー破綻シナリオを逆照射する。

## Goal / 目的

- PR テンプレートが日本語記載・必須項目・検証コマンドを明確に示し、レビューフローでブレないようにする。

## Non-goals / 扱わないこと

- リポジトリ全体の運用ポリシーを決め直すこと。
- テンプレート外のドキュメント構成やCI設計を断定しない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にPRテンプレートファイル（`.github/pull_request_template.md` または `.github/PULL_REQUEST_TEMPLATE.md`）が含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: pr-template-qa — PRテンプレートファイルの差分がない`

## False-positive guards / 抑制条件

- 英語版テンプレートが意図的に存在する場合は「日本語前提」への置換を強制しない（方針が明示されていれば黙る）。

## Rule / ルール

- 日本語で記載すべき旨が明確かを確認する（概要・レビューコメント）。
- Diátaxis 区分（Tutorial/How-to/Reference/Explanation）の選択と配置が分かりやすいか。
- 検証コマンド欄があり、例示が具体的か（`npm test`/`npm run lint` 等）。
- チェックリストが現在の運用に合っているか（applyTo 過剰/不足がないか）。
- アラートや注記は GitHub Alert 形式 `> [!NOTE]` などで目立つか。

外部参照: [「AIの「できました」を検収する — PRを証跡提出に変えるテンプレート」](https://zenn.dev/urario/articles/pr-as-evidence)（yuta-urano, 2026-07-09）は、PR を「証跡（実行結果・未検証事項の明示）」として構成するテンプレート設計を提案する。検証コマンド欄・チェックリスト項目の妥当性を確認する本スキルの観点と一致する。

外部実証: [「できない→できる」では伝わらない——3,400件のPR分析から生まれたAI時代のテンプレート](https://zenn.dev/third_tech/articles/590216d145007f)（yagami, 2026-08-25）は、クローズ済み PR 3,410 件を分析した結果を報告しています。テンプレート使用 PR 2,040 件の内訳はセクション空欄 891 件（43.7%）、動作確認の未チェック 564 件（27.6%）、変更理由の未選択 686 件（33.6%）でした。著者はこの形骸化を書き手ではなくテンプレート構造の問題と位置づけ、WHY を最上部へ置く設計原則を示しています。チェックリストが現在の運用に合っているかを問う本スキルのルールを、実測値で裏づける一次データとして参照できます。

## Output / 出力

- 日本語、`<file>:<line>: <message>` 形式。最大 5 件。問題なしは `NO_ISSUES`。
- `<message>` には `Finding`/`Impact`/`Fix` を含め簡潔に書く（200 文字以内）。

## 評価指標（Evaluation）

- 合格: 差分に基づき、言語・検証・チェックリスト・注記の抜け/曖昧さを指摘し、修正案を短く提示している。
- 不合格: 一般論のみ、差分無関係、根拠・Fix がない。

## 人間に返す条件（Human Handoff）

- 運用方針が不明（日本語/英語併用方針など）で判断が割れる場合は質問として返す。
