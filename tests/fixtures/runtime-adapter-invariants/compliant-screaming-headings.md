# Acronym headings (RA-1 positive fixture)

Positive fixture pinning the absence of false positives (#2050 review, major 3).
Every section below has a SCREAMING heading and a `条件:` line, yet none of them
defines a gate verdict. `detectReviewJudgmentDefinitions` must return `[]`.

## CLAUDE.md の運用

このコマンドは repo の運用手順です。

条件: 事前に npm install を済ませること。

## AGENTS.md を更新する

条件: Edit Scope を読んでから編集する。

## JSON の扱い

条件: schema に沿っていることを確認する。

## HTTP リクエスト

条件: timeout を設定する。

## CLAUDE_PLUGIN_ROOT の扱い

条件: hooks.json の展開結果を確認する。

## JSON — 設定ファイルの形式

An acronym in subject position, followed by a separator. Only the allowlist
keeps this out of the gate rule; the shape rule alone would flag it.

条件: schema に沿っていることを確認する。

## TODO

条件: 着手前に棚卸しする。

## HTTP

条件: timeout を設定する。

## ESCALATE 判定の運用

A real gate verdict, but not in subject position: the heading talks _about_
`ESCALATE` rather than defining it. Only the subject-position constraint keeps
this out of the rule.

条件: 迷ったら人間へ渡す。

## MERGE_OK と BLOCKED の使い分け

Verdicts of a repository work procedure. Out of scope by decision (#2050,
decision 1): they judge a work procedure, not a review.

条件: `docs/governance.md` のチェックリストを最後まで実行する。

## 用語集

| 語  | 意味  |
| --- | ----- |
| nit | minor |
