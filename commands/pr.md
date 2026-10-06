---
description: 'Draft a review-ready PR description using our template (pairs with pr-description)'
argument-hint: '[pr-number]'
---

対象の差分を、以下のテンプレートで PR 本文にして。本文を確定する前に、末尾の「PR 説明と実態の突合チェック」を必ず実施する。

## 対象の解決

引数: `$ARGUMENTS`

対象の差分は次の順で決める。

1. 引数に PR 番号 `N` がある場合: `gh pr diff N` を diff とし、`gh pr view N --json headRefOid,files` を対象コミットと変更統計とする。ローカルの作業ツリーやブランチの diff は使わない。
2. 引数が無く、現ブランチに open の PR がある場合（`gh pr view --json number,state --jq 'select(.state=="OPEN") | .number'` が番号を出力する場合）: その PR を対象にし、1 と同じコマンドで取得する。`gh pr view` は同名ブランチのマージ済み・クローズ済み PR にも一致するため、open 以外は使わない。
3. 引数が無く、現ブランチに open の PR が無い場合（上のコマンドが何も出力しないか失敗する場合）: `git diff <base>...HEAD` を diff とし、`git diff --stat <base>...HEAD` を変更統計とする。`<base>` は `origin/<デフォルトブランチ>` とし、デフォルトブランチ名は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で得る。ローカルのブランチは遅れていることがあるため、先に `git fetch origin <デフォルトブランチ>` を実行する。

出力の 1 行目に、使った対象を次のいずれかで書く。

- `対象: PR #N（gh pr diff N / head <headRefOid>）`
- `対象: 現ブランチの PR #N（gh pr diff N / head <headRefOid>）`
- `対象: ローカル diff（git diff <base>...HEAD）`

## PR 作成者の確認

対象が PR の場合（上の 1 と 2）は、`gh pr view N --json author --jq .author.login` と `gh api user --jq .login` を比べる。

- 一致する場合: 下書きを提示し、本文の更新はユーザーの指示を受けてから行う。
- 一致しない場合（他者の PR）: `gh pr edit` など PR 本文を更新するコマンドは実行しない。本文は下書きとして返し、その旨を出力に明記する。

## 目的

（この変更で何を達成したいか）

## 変更点

（主な変更内容を箇条書きで）

## 動作確認

（どうテストしたか、確認コマンド）

## 影響範囲 / リスク

（破壊的変更、パフォーマンス、セキュリティ）

## ロールバック手順

（問題発生時の戻し方）

---

本文を確定する前に、以下の「PR 説明と実態の突合チェック」を実施する。

1. Closes/Fixes の突合 — `Closes #N` / `Fixes #N` を書く前に `gh issue view N` で Issue の完了条件（受入条件・チェックリスト）を取得し、diff が各条件を満たすか 1 件ずつ突合する。未達の条件がある場合は `Closes` を `Refs` に変更するか、PR 本文に残課題として明記する。
   - GitHub Issue の参照（`Closes` / `Fixes`）が無く、外部チケット（Notion / Jira 等）の URL や ID がある場合は、`Refs: <外部チケット>` として書く。受入条件は外部チケットまたは既存の PR 本文から取得できる範囲で取り、diff と 1 件ずつ突合する。取得できない場合は、本文に「受入条件: 未突合（取得できなかった理由）」と明記する。
2. ja/en 対訳の同時更新 — ja/en 対訳ファイル（`*.md` と `*.en.md`、`pages/` 配下の対）に触れた場合、両方が同一のコミットセットに含まれているか確認する。片側のみ更新する場合はその理由を本文に明記する。
3. 本文と実 diff の最終セルフチェック — 本文の記述（「〜は変更しない」等の変更対象外の宣言、件数・列挙）が実 diff と矛盾しないか、変更統計と照合して確認する。変更統計は対象が PR なら `gh pr view N --json files` の結果、ローカル diff なら `git diff --stat <base>...HEAD` を使う。
