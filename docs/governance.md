# ガバナンス (Governance)

本ドキュメントは River Review の運用・意思決定の方針をまとめたものです。

## メンテナ

現時点のメンテナ（最終的な意思決定者）は以下です。

- @s977043

## 意思決定

- 小さな変更は PR ベースで進め、レビューで合意する
- 影響が大きい変更（破壊的変更、大規模リファクタ、方針変更）は Issue で事前に合意してから着手する
- 現時点ではメンテナが 1 名のため、メンテナの判断をもって合意とする（将来メンテナが増えた場合は本方針を更新する）

## メンテナの追加・交代

- 新しいメンテナは、継続的な貢献（複数回の PR、Issue トリアージ支援など）と、運用方針への理解を前提に検討する
- メンテナの追加・交代は Issue で提案し、理由とスコープを明記してください
- 長期間（目安: 数か月）メンテナ活動がない場合の扱いは、状況に応じて公開の議論で調整する

## PR レビューとマージ

- 原則: CI がすべて成功していること
- 外部コントリビューターからの PR は、メンテナによるレビュー（少なくとも 1 回の承認）後にマージする
- メンテナによる変更でも、可能な限りセルフレビューを行い、レビュー観点を PR 本文に記載する

### マージ前チェックリスト

CLAUDE.md "AI Misoperation Guards" の運用ガードのうち、PR マージ判断に直結するものを本セクションに集約します。CLAUDE.md は要旨のみを残し、詳細手順はここを正とします。このチェックリストは repo-dev コマンド `/merge-check <PR 番号>`（`.claude/commands/merge-check.md`）で実行できます。

#### 1. CI green の確認

`gh pr merge` の前に `gh pr checks` を実行し、必須チェックがすべて `pass` バケットに入っていることを確認します。`fail` / `pending` / `cancel` が残るマージは不可です。

```bash
gh pr checks <N> --json name,bucket,startedAt --jq 'group_by(.name) | map(if any(.[]; .bucket == "pending") then (map(select(.bucket == "pending")) | first) else max_by(.startedAt) end) | .[] | select(.bucket != "skipping")'
```

- `SKIPPED` チェックは `bucket == "skipping"` で除外できる。
- `group_by(.name)` 以降は同名 check のうち `pending` があればそれを、無ければ `startedAt` が最新の run を残す。queued の run は `startedAt` がゼロ時刻（`0001-01-01T00:00:00Z`）で並ぶため、`max_by` だけでは古い `cancel` / `pass` を最新と誤って採り、`pending` を隠す。`gh pr checks` は同じ head の全 run を並べるため、concurrency で `cancel` された古い run と再実行の `pass` が同名で並ぶ。最新だけを見ないと `cancel` を `fail` と誤読する。`scripts/wait-pr-ready.sh` が使う check-runs API は既定 `filter=latest` で同じ絞り込みを行っている。
- 必須チェック (`Lint`, `Unit tests` など) が pre-existing 失敗の場合も、本 PR を直接マージしてはいけない。`main` 向けの fix PR を先に出して main を green に戻し、その後本 PR をリベースしてマージする。

#### 1.1 Branch protection の概要

main ブランチには GitHub branch protection rule により以下の Required status check が設定されています（#483 で導入）。これらが `pass` でない限りマージできません。

- `Lint`
- `Unit tests (22.x)`
- `Skill schema validation`
- `Meta consistency`
- `Action dist freshness`
- `Integration (CLI)`
- `Blocked label guard`

> **この一覧の正は下記「現在の設定の確認」コマンドの出力です。** ドキュメント側は実設定に追随する必要があり、CI のテストマトリクス leg を追加・削除・改名した際は CLAUDE.md「CI matrix leg ↔ branch-protection required-check sync」ガードに従って branch protection を先に更新し、本一覧も同じ PR で揃えてください。実際に `Unit tests (20.x)` の記載が実設定から外れたまま残っていたことがあります。

`strict: true` で PR が最新 main にリベース済みであることが求められ、`enforce_admins: true` のためメンテナも bypass できません。`allow_force_pushes: false` / `allow_deletions: false` により main への force push / 削除も不可です。

現在の設定の確認:

```bash
gh api 'repos/:owner/:repo/branches/main/protection' --jq \
  '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled}'
```

リリース等で一時的に無効化が必要な場合は、`gh api -X PUT .../protection` でルールを編集してから実行し、終了後に再有効化します。設定の技術詳細は Issue #483 を参照。

#### 2. レビュアーコメントの確認

CI green はレビュアーのコメント（`Copilot`, `sentry[bot]` などの AI レビュアー、および人間レビュアー）を覆いません。マージ前には次節「レビュアーコメントの扱い」の手順で **line comments と issue comments の両方**を列挙し、disposition を確定させてください。片方だけを列挙した結果で「指摘なし」と判定してはいけません。

列挙の漏れは `npm run check:comment-disposition -- <N>`（`scripts/check-comment-disposition.mjs`）で機械的に消せます。両エンドポイントを paginate して `user.type` が `User` のコメントだけを全件出力し、1 件でもあれば exit 1 を返します。判定するのは「確認すべきコメントが存在するか」までで、各件を dispose 済みかどうかは本節の手順で人間が確定させてください。

> **経緯**: 2026-08-04、PR #1746 で `pulls/<N>/comments` だけを列挙して 0 件だったため「disposition 対象なし」と判断してマージし、`issues/<N>/comments` にあった敵対的レビューの指摘 3 件と `blocked` ラベルを見落としました。結果として v1.72.0 で後方互換の回帰をリリースしています（[経緯コメント](https://github.com/s977043/river-review/pull/1746#issuecomment-5175260789)）。本項と次項 2.1 はこの再発防止です。

#### 2.1 マージ阻止ラベルの確認

コメントの列挙とあわせて、PR に付いているラベルも必ず確認してください。

```bash
gh pr view <N> --json labels --jq '[.labels[].name]'
```

- `blocked` など、マージ阻止を意図したラベルが 1 つでも付いている場合はマージ中止である。
- 単独メンテナ体制では、レビュアーと PR オーサーが同一アカウントになる。GitHub では自分の PR に formal review（Request changes）を投げられないため、ラベルと通常コメントが唯一のマージ阻止手段である。ラベルは飾りではなく、Request changes の代替表明として扱ってください。
- 阻止ラベルを外すのは指摘した側である。マージする側が対応完了を自己判断して外してはいけない。

#### 3. multi-PR 作業の preflight

対象は、複数 PR の連続マージ、main CI 失敗の修正 PR、`.github/workflows/*.yml` の `node-version` / action pin / `permissions` を変える PR などです。これら書き込み系の handoff タスクへ着手する前に `/preflight <keyword or PR numbers>` を実行します。対象タスクが既にマージ済み/obsolete/並行作業中ではないことを確認します。

- `gh pr list` は GraphQL キャッシュの影響で recently merged な PR を `open` と返すことがある。判定には `gh api repos/:owner/:repo/pulls/{N}` (REST) を併用してください。
- 過去の累計で 1 セッション中に 4 件の重複 PR (#485, #489, #492, #496) を生んだ実績がある。

#### 4. dist 再ビルド時の Node バージョン整合

`runners/github-action/src/**` を変更した場合、または `Action dist freshness` CI が失敗した場合は、再ビルドが必要です。`runners/github-action/dist/` を `.nvmrc` (リポジトリ全体の SSoT) でピンされた Node バージョンで再ビルドしてください。

- `npm run build:action` は Node メジャーが異なると CI 再現性のあるアウトプットになりません。
- 切り替え例: `nvm use` (`.nvmrc` を読む) または同等の version manager コマンド。
- トラブルシュートは `docs/development/dist-check-rebuild-guide.md` を参照。

#### 5. git 出力の検証

`git commit` / `git push` / `git switch` / `gh pr merge` の直後は、出力されたブランチ名・コミットハッシュ・status 行を読み、意図したターゲットに作用したことを確認してから次のコマンドへ進んでください。曖昧な場合は `git status -sb` または `git rev-parse --abbrev-ref HEAD` で再確認します。

#### 6. PR 本文の closing keyword 確認

squash merge では **PR 本文**の closing keyword（`closes` / `fixes` / `resolves` + issue 番号）が効き、マージと同時に該当 issue が close されます。コミット本文が `refs #N` であっても、PR 本文が `closes #N` なら閉じます。

```bash
gh api "repos/:owner/:repo/pulls/<N>" --jq .body | grep -i 'closes\|fixes\|resolves'
```

- grep はコードブロックや引用の中の言及も拾うため、ヒットしても実際に紐付いているとは限りません。GraphQL の `closingIssuesReferences` で、GitHub が close 対象として解決した issue を確定させてください。
- 該当する issue が「閉じてよいもの」かは、PR のスコープが issue 全体をカバーしている / Epic・追跡用 issue でない / 本文に未完了のチェックボックスや残作業の記述がない、の 3 点で判定する。
- 閉じてはいけない issue がある場合は、マージ前に `gh pr edit <N> --body` で `closes` を `refs` へ書き換える。
- 実行手順・判定基準・書き換えコマンドの詳細は `/merge-check` の Step 6（`.claude/commands/merge-check.md`）を参照してください。**リリース PR では必ず該当する。**

> **経緯**: 2026-08-12、Issue #1827 が release PR #1830 のマージで自動 close されました。閉じる判断は誰もしていません。コミット本文は `refs #1827` でしたが、release-please は release PR の本文を `closes [#1827]` としてレンダリングします。当時この確認手順は `/merge-check` にも `/release-kick` にも存在せず、セッションを跨がない carry-over 台帳にしかありませんでした（`docs/development/retrospectives/2026-08-12.md` の O5）。

### レビュアーコメントの扱い

CI の成否はレビュアーコメント（`Copilot` / `sentry[bot]` などの AI レビュアー、および人間レビュアー）をカバーしません。これらは CI を失敗させないため見落としやすい一方、実バグを指摘していることがあります。マージ前には本セクションの手順で必ず列挙・評価してください。

#### 列挙コマンド（2 種類とも必須）

GitHub の PR コメントは 2 つのエンドポイントに分かれて格納されます。**`pulls/<N>/comments` は line comments（差分の行に紐づくレビューコメント）しか返さず**、PR 本体に投稿された通常コメント（issue comment）は `issues/<N>/comments` からしか取得できません。どちらか一方だけでは列挙が不完全になるため、両方を実行してください。

1. line comments（差分の行に紐づくコメント）:

   ```bash
   gh api --paginate 'repos/:owner/:repo/pulls/<N>/comments?per_page=100' \
     --jq '.[] | {id, in_reply_to_id, user: .user.login, path, line, start_line, original_line, commit: .commit_id, body}'
   ```

2. issue comments（PR 本体へのコメント。敵対的レビュー結果やマージ可否の表明はここに来ます）:

   ```bash
   gh api --paginate 'repos/:owner/:repo/issues/<N>/comments?per_page=100' \
     --jq '.[] | {id, user: .user.login, created_at, body}'
   ```

- `--paginate` は両方で必須である。デフォルトの 1 ページ目は 30 件で打ち切られるため、コメント数が多い PR では見落とす。
- `per_page=100` は URL クエリに直接埋め込む。`-F per_page=100` を指定すると `gh api` の verb が POST に切り替わり HTTP 422 が返る。
- どちらの `--jq` にも `.user.login` を含めてください。issue comments には `gemini-code-assist[bot]` / `vercel[bot]` / `github-actions[bot]`（River Review 自身の結果通知や PlanGate Review を含む）の定型コメントが大量に混ざる。投稿者で bot の定型と人間レビュアーの指摘を切り分け、後者を disposition の対象とする。
- 複数行に紐づくコメントは `line` が終端行、`start_line` が開始行である。
- `line: null` は、後続コミットでアンカー行の消失によりコメントが outdated になっていることを示す。`commit` 値を `gh pr view <N> --json headRefOid` と突き合わせて判断してください。
- スレッド（reply 連鎖）は `in_reply_to_id` で再構成できる。issue comments には `in_reply_to_id` がなく、スレッド構造も持たない。

#### review summaries との違い

- Bot の行単位の個別指摘は `pulls/<N>/comments`（line comments）に入る。人間レビュアーが PR 全体に対して書くレビュー結果は `issues/<N>/comments` 側に入る。
- `gh pr view <N> --json reviews,reviewDecision` はレビュー単位のサマリのみで、bot の `body` は空になることが多く、`reviewDecision` が空であっても、個別の指摘は存在することもある。
- したがって review state 単体でマージ可否を判断してはいけない。`reviewDecision` はさらに、レビュアーと PR オーサーが同一アカウントの場合には常に空になる（GitHub が自分の PR への formal review を許可しないため）。この体制では 2.1 のラベル確認が review state の代役である。

#### 各コメントの dispose

列挙したコメントはそれぞれ以下のいずれかで処理し、残件がない状態にしてからマージしてください。

1. 追従コミットで対応する（推奨）。
2. Bot 自身が follow-up で resolved を宣言している（例: sentry の `*Resolved in <sha>`）。Copilot は self-resolve しないため、Copilot の指摘は a か c で対応する。
3. 同じスレッドに reply して理由を明記する。CLI では:

   ```bash
   gh api -X POST repos/:owner/:repo/pulls/<N>/comments/<comment_id>/replies \
     -f body='<reply text>'
   ```

   `-X POST` は必須である。デフォルト verb は GET で、これは既存 reply の _一覧取得_ になり、新規 reply 作成にならない。Web UI からの reply でも構わない。この replies エンドポイントは line comments 専用である。issue comment への回答は `gh pr comment <N> --body '<text>'` で PR 本体に投稿する。

#### 関連

- River Review 利用者（レビュー対象側）から見た対応フローは `skills/midstream/gh-address-comments/SKILL.md` を参照してください。本セクションはリポジトリメンテナ視点のマージ前チェックリストである。

## Breaking change の扱い

- 破壊的変更を含む場合は、PR 本文で明示し、必要に応じて Issue へのリンクを付けてください
- 互換性に影響する変更は `CHANGELOG.md` に記載し、リリースで周知する
- バージョニングは SemVer を基本とする（v0 系では変更の性質に応じて運用する）
- `pages/reference/stable-interfaces.md` の免責（破壊的変更として扱わない条件）を追加・拡張する PR は、免責が述べる挙動を変更前後で実測し、そのコマンドと出力を PR 本文に併記する。免責文の主張はレビューで検証されにくい。#2073 は「その面での動作は変わらず」と書いたが、実測では当該面の実行自体が usage error になっており、レビュー 2 本を通過して v1.99.2 として公開された（#2075）

## Issue トリアージ（ラベル方針）

- まずは Issue テンプレートに従って情報を揃えてください
- メンテナが以下の観点でラベル付け・優先度付けします
  - 優先度: `P0`（緊急）/ `P1`（高）/ `P2`（中）
  - フェーズ: `Phase 1` / `Phase 2` / `Phase 3`（または `Backlog`）—ロードマップ上の開発段階
- ラベル一覧: [Labels](https://github.com/s977043/river-review/labels)
- Issue テンプレート: [Issue templates](https://github.com/s977043/river-review/issues/new/choose)
