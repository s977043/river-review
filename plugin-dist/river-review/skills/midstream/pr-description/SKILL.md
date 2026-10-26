---
id: 'pr-description'
name: PR Description Review
description: Review whether the PR description is review-ready and consistent with the diff (Why/What, impact, tests, linked issues).
version: 0.2.0
category: midstream
phase: midstream
applyTo:
  - '**/*'
tags:
  - pr-description
  - consistency
  - midstream
severity: minor
inputContext:
  - diff
  - prDescription
outputKind:
  - findings
  - actions
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: PR 本文の品質と差分整合をレビューする。PR 本文が無い場合は実行不要。

## Goal / 目的

- PR 本文が「レビュー可能な状態」かを確認する（Why/What、影響範囲、テスト方針、関連リンク）。
- 本文の説明と差分の不整合（説明にあるが差分に無い／差分にあるが説明に無い）を検出する。

## Non-goals / 扱わないこと

- コード品質・命名・型の指摘（他の midstream skill が担当）。
- 差分に存在しないコードへの推測。
- PR 本文の文体・体裁の好みの指摘。

## Pre-execution Gate / 実行前ゲート

このスキルは以下が満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `prDescription` が含まれている（PR 本文が利用可能）
- [ ] inputContext に `diff` が含まれている

ゲート不成立時の出力: `NO_REVIEW: pr-description — PR 本文が利用できないため評価対象なし`

## Guidance

- Why（変更理由）と What（変更内容）が PR 本文に明記されているか確認する。
- 本文の説明が差分と一致しているか確認する（記載と実装の乖離を指摘）。
- 影響範囲・破壊的変更の有無が書かれているか確認する。
- テスト方針 / 動作確認方法が書かれているか確認する。
- 関連 Issue / 仕様 / 設計へのリンクがあるか確認する。
- `Closes #N` / `Fixes #N` について、リンク先 Issue の完了条件（受入条件・チェックリスト）が入力から読み取れる場合のみ diff と突合する。未達の条件があれば `Refs` への変更または残課題の明記を提案する。完了条件が入力から読み取れない場合、この突合は reviewee 側（`/pr` command）の責務として指摘しない。
- ja/en 対訳ファイル（`*.md` と `*.en.md`、`pages/` 配下の対）の片側のみが diff に含まれ、本文にその理由が無い場合は指摘する。
- 本文の宣言（「〜は変更しない」等の変更対象外の宣言、件数・列挙）が実 diff と矛盾していないか確認する。
- PR 本文に関する指摘は対象を `PR-DESCRIPTION:0` として出力する。

## False-positive guards / 抑制条件

- 軽微な変更（タイポ修正等）で本文が簡潔な場合は過剰に要求しない。
- テンプレート未記入のセクションが明らかに不要な場合は黙る。

## Output / 出力例

```yaml
findings:
  - severity: minor
    file: PR-DESCRIPTION:0
    issue: PR 本文に変更理由(Why)が書かれておらず、レビュアーが意図を判断できない
    suggestion: 「なぜこの変更が必要か」を1〜2文で本文冒頭に追記する
```
