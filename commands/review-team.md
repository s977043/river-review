---
description: 'Run review-team skill: parallel multi-role review with consensusLevel and Tech Lead report'
argument-hint: '[pr-number | path...] [role1,role2,...]'
allowed-tools: Read, Bash(git ls-files:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git fetch:*), Bash(git symbolic-ref:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh repo view:*), Bash(npm run river:*), Bash(mktemp -d:*), Bash(git worktree add --detach:*), Bash(git worktree remove:*)
---

スキル定義: `skills/agent-skills/review-team/SKILL.md`

## Context

- Status: `git status`
- Recent commits: `git log --oneline -10`

## 対象の解決

引数: `$ARGUMENTS`

引数の各トークンを次の順で分類し、最初に当たったものに決める。

1. `auto`、または SKILL.md のロール名（カンマ区切り可）: ロール指定（Step 1）
2. 数字だけ: PR 番号 `N`。同名のファイルがあっても PR 番号とする（ファイルを対象にするときは `./123` と書く）
3. 作業ツリー配下に存在するファイルまたはディレクトリ: 対象パス
4. どれにも当たらない: 「`<トークン>` はロール名でも PR 番号でも存在するパスでもありません」と出力して終了する（パスの typo で別の対象を黙ってレビューしないため）

対象パスがある場合は、差分ではなくそのファイルの全文を対象にする（実装前の設計書・仕様・計画のレビュー用）。PR 番号と併用された場合は、対象を決められない旨を出力して終了する。この経路では以降の差分の解決を行わず、次を適用する。

- 対象ファイルは `git ls-files -z --cached --others --exclude-standard -- ':(literal)<パス>'` で得る（未追跡の新しい設計書も含み、`.gitignore` 対象は除く。ディレクトリは配下を再帰）。次を除く: バイナリ、symlink（追跡中は `git ls-files -s` のモード `120000`）、AGENTS.md Safety 節の読込禁止（`.env*`・`secrets/`・`*.pem`・`*.key`）と `*.p12`・`*.pfx`・`id_rsa*`・`.npmrc`・`credentials*`・`*.tfvars`。残りが 0 件か、すべて空なら「対象が空です（`.gitignore` 対象・除外対象・作業ツリー外のパスは読みません）」と出力して終了する。20 件を超える場合は一覧を出力し、ファイルを指定して絞るよう伝えて終了する
- ロール指定が無い場合の `auto` は、ファイル種別に加えて `stage: plan` signal を与えた扱いで選ぶ（SKILL.md「Stage / risk signal による選択」）。各ロールは担当領域を文書の記述に当てはめ、記述と実装・実在ファイルの食い違いも指摘する。対象が文書だけのときは、レポートの冒頭に「設計の妥当性は `river-review-architecture`、文書品質は `river-review-docs` が専門です」と書いてから続行する
- 秘密らしき値（トークン・鍵・パスワード）はレポートに引用せず、伏せ字にする
- `river` CLI は差分を前提にするため使わず、スキル駆動でレビューする
- 全文が対象なので、finding の `scope` はすべて `in-diff` とし、レポートの冒頭に「ファイル全文が対象のため scope の区別はありません」と書く。Step 3 の用語にある「本 PR の追加行」は、この経路では対象ファイルの全文と読み替える

対象パスが無い場合、対象の差分は次の順で決める。

1. 引数に PR 番号 `N` がある場合: `gh pr diff N` を diff とし、`gh pr view N --json headRefOid,files` を対象コミットと変更統計とする。ローカルの作業ツリーやブランチの diff は使わない。
2. 引数に PR 番号が無く、現ブランチに open の PR がある場合（`gh pr view --json number,state --jq 'select(.state=="OPEN") | .number'` が番号を出力する場合）: その PR を対象にし、1 と同じコマンドで取得する。`gh pr view` は同名ブランチのマージ済み・クローズ済み PR にも一致するため、open 以外は使わない。未コミットの変更（`git diff` / `git diff --cached`）があれば、PR の diff に加えてレビューする。
3. 引数に PR 番号が無く、現ブランチに open の PR が無い場合（上のコマンドが何も出力しないか失敗する場合）: `git diff <base>...HEAD` と未コミットの変更（`git diff` / `git diff --cached`）を合わせて diff とする。`<base>` は `origin/<デフォルトブランチ>` とし、デフォルトブランチ名は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で得る。`gh repo view` が失敗した場合（未認証など）は `git symbolic-ref --short refs/remotes/origin/HEAD` の出力から `origin/` を除いた名前を使う。それも失敗した場合は、対象を決められない旨を出力して終了する。ローカルのブランチは遅れていることがあるため、先に `git fetch origin <デフォルトブランチ>` を実行する。

どの経路でも diff が空の場合だけ、「差分がありません。設計書などのファイルを全文でレビューするには `/review-team <パス>` を指定してください」と伝えて終了する。

出力の 1 行目に、使った対象を次のいずれかで書く。

- `対象: ファイル全文（<パスの一覧>）`
- `対象: PR #N（gh pr diff N / head <headRefOid>）`
- `対象: 現ブランチの PR #N（gh pr diff N / head <headRefOid>）`（未コミットの変更を含めた場合は `+ 未コミットの変更` を付ける）
- `対象: ローカル diff（git diff <base>...HEAD + 未コミットの変更）`

## Task

`review-team` スキルの手順に従い、上で決めた対象（差分またはファイル全文）をレビュー・チームで検査する。

### Step 1: ロールを決定する

引数でロールが指定された場合はそれを使う。なければ `auto`（差分から自動選択。ファイル全文が対象のときは上記「対象の解決」の選び方に従う）。

### Step 2: レビューを実行する

ファイル全文が対象のときは、以下の CLI 手順を使わずスキル駆動でレビューする。

River Review は npm 未公開のため `npx river-review` は使えない。**エージェントがこのスキルの手順を直接実行する**（CLI 不要）。上記 Step 1 で決めたロールを並列に走らせ、Union-Find で finding を統合し、consensusLevel と teamLeadReport を生成する。

リポジトリ内で作業していて `river` CLI をアクセラレータとして使える場合のみ、次を利用してよい（任意）。`--base origin/<デフォルトブランチ>` を渡す。コスト確認が必要なら先に `--dry-run`。

経路 3 では現在の checkout をそのまま対象にする。

```bash
# auto モード（推奨）
npm run river -- run . --base origin/<デフォルトブランチ> --reviewers auto --output json

# ロール明示指定
npm run river -- run . --base origin/<デフォルトブランチ> --reviewers <role1,role2,...> --output json
```

経路 1 と 2（PR が対象）では、`river run` がローカル checkout をレビューするため、PR の head を一時 worktree に取り出してから渡す。名前付きの ref やブランチは作らない（`skills/agent-skills/river-review/SKILL.md` の「PR を対象にするときの git 操作」に従う）。

1. `git fetch origin pull/<N>/head` を実行する。`origin` が fork を指すなどで失敗したら、PR の base リポジトリを指す remote（例: `upstream`）で同じ fetch を試す。
2. `mktemp -d` で一時ディレクトリ `<tmp>` を作り、`git worktree add --detach <tmp>/pr FETCH_HEAD` を実行する。
3. `npm run river -- run <tmp>/pr --base origin/<デフォルトブランチ> --reviewers <auto またはロール> --output json` を実行する。手順 1 で `origin` 以外の remote から取得した場合は、`--base` もその remote のデフォルトブランチ（例: `upstream/<デフォルトブランチ>`）にする。
4. 結果に関わらず、必ず `git worktree remove <tmp>/pr` で片付ける。worktree 作成後に途中の手順が失敗した場合も実行する。remove が失敗したら、残ったパスと `git worktree remove <tmp>/pr` をレポートに書く。

経路 2 で未コミットの変更を含めた場合、一時 worktree には未コミットの変更が入らない。その分はスキル駆動でレビューする。

CLI が存在しない、fetch や worktree の作成に失敗した、または CLI が失敗した場合は、取得した diff をスキル駆動でレビューして継続する。

### Step 3: 結果を報告する

用語（`skills/agent-skills/review-team/SKILL.md` の「Output Interpretation / 結果の読み方」が出典）:

- `scope`: 指摘が本 PR の追加行に由来するかを示す finding のメタデータ。値は `in-diff` / `pre-existing` の 2 つ
- `in-diff`: 本 PR が追加行で持ち込んだ問題。既定値であり fail-safe でもあるため、値が無い finding もこの扱いになる
- `pre-existing`: 変更ファイル内だが追加行の外にある既存コードへの指摘。文脈参考として扱い、本 PR のスコープを超えた修正を招かないようにする
- `consensusLevel`: 同じ finding を挙げたロール数のバケット。`consensus`（3 以上）/ `multi`（2）/ `single`（1 以下）
- 並び順のキーは `consensusLevel` → `severity` → `scope` である。`consensusLevel` が `severity` に優先し、`severity` は同値のときだけ次のキーへ進む

JSON 出力（`teamLeadReport` / `issues`）をもとに以下の形式で報告する。

```markdown
## レビュー・チーム 結果

### 実行ロール

<reviewerRole の一覧>

### 優先確認の指摘（top3）

<consensusLevel → severity → scope 順の上位3件。multi は ★★、consensus は ★★★ を付ける。scope は上位2キーが同値のときだけ in-diff を先に置く。pre-existing の finding には file:line の直後に `_(pre-existing)_` を付ける>

### 全指摘（severity 降順）

<critical → major → minor → info の順。scope が pre-existing の finding には file:line の直後に `_(pre-existing)_` を付ける。in-diff（本 PR の追加行由来）は既定値なので印を付けず、pre-existing（変更ファイル内だが追加行の外）だけを示す>

### 見落とし可能性

<blindSpots の label。空なら「なし（全ロールを実行済み）」>

### コンセンサス集計

consensus: N件 / multi: N件 / single: N件
```
