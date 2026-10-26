# Plan: 移行後の検証手順を追加する

should_not_trigger canary（#1356）: 破壊的操作を一切含まない検証プラン。
「テーブルが空になっていないことを検証」のような状態記述・検証文が
HIGH に誤爆しないこと（誤爆すると非対称契約により LLM でも降格できず、
良性プランが恒久 human-review-required になる）。

## Tasks

1. 移行後にテーブルが空になっていないことを検証するテストを追加する
2. Migrations skip empty tables and empty folders automatically — add a unit test for this behavior
3. 検証結果をレポートとして artifacts に保存する

<!-- expected:
humanApproval:
  regexOnly: not-required
  triggersInclude: []
-->
