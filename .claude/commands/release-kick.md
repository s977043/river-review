---
description: release-please のリリース PR を BLOCKED 解除 → CI green 確認 → マージ → リリース公開検証まで一貫実行する（v1.44.0〜v1.53.0 の11リリースで実証済みの型）
argument-hint: '<release PR number>'
allowed-tools: Bash(gh api user:*), Bash(gh auth switch:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh pr merge:*), Bash(gh pr edit:*), Bash(gh issue view:*), Bash(gh api:*), Bash(gh run list:*), Bash(gh release view:*), Bash(git ls-remote:*), Bash(git fetch:*), Bash(git diff:*), Bash(scripts/release-please-kick.sh:*), Bash(bash scripts/release-please-kick.sh:*)
---

release PR #$ARGUMENTS を、BLOCKED 解除からマージ・リリース公開の検証まで一貫して実行する。

release-please が生成するリリース PR の head は `GITHUB_TOKEN` push であるため、通常は `mergeStateStatus: BLOCKED`（"N of N required checks are expected"）になる（CLAUDE.md「`N of N required checks are expected` = bot/GITHUB_TOKEN push」ガード参照）。この BLOCKED の原因・`RELEASE_KICK_PAT` のセットアップ・`workflow_dispatch` 版が deprecated である理由は `docs/runbook/bot-pushed-head-kick.md` が SSoT。kick の正規手順は `scripts/release-please-kick.sh` であり、workflow 版は使えない。本コマンドはそれを前提に、実際にマージして公開を確認するまでの実行手順を1コマンド化したもの。矛盾があれば runbook を正とし、本コマンドを修正する。

## 手順

### Step 0. 手順書の鮮度確認

```bash
git fetch origin
git diff --quiet HEAD origin/main -- .claude/commands/release-kick.md docs/runbook/bot-pushed-head-kick.md || echo "手順書が古い: origin/main 版を読み直すこと"
```

ローカル main が origin より遅れていると、改訂前の手順書を読んだまま実走することになる。上のメッセージが出たら `git pull` で追いついてから、本コマンドと runbook を読み直す。差分がなければ何も出力されない。

v1.67.1 の実走では、ローカルが 24 コミット遅れていた。その結果、#1702 による改訂前の版を読み込んだまま実走している。#1702 のマージ時刻はキックの 16 分前だった。

### Step 1. gh アカウント確認

```bash
gh api user --jq .login | grep -q s977043 || gh auth switch -u s977043
```

PreToolUse hook (`gh-account-guard.sh`) が defense-in-depth で効くが、セッション開始時の確認は省略しない。
`s977043` は本リポジトリのメンテナアカウント（CLAUDE.md「Verify gh active account before write ops」ガードと同一の値で、そちらが SSoT）。フォーク運用時は自分のアカウントに読み替える。

### Step 2. PR 状態の確認と BEHIND 判定

```bash
gh pr view $ARGUMENTS --json state,mergeStateStatus,headRefOid
releaseBranch=$(gh pr view $ARGUMENTS --json headRefName --jq .headRefName)
gh api "repos/:owner/:repo/compare/main...$releaseBranch" --jq '{status, ahead_by, behind_by}'
```

`mergeStateStatus: BLOCKED` は release-please PR の通常挙動。`CLEAN` なら Step 3〜5 をスキップして Step 6 へ進む。

BLOCKED の場合は `behind_by` の値で次に打つ手が変わる。`mergeable_state` は単一の値しか返さず BEHIND と BLOCKED の複合状態を見分けられないため、compare の `behind_by` で判定する。

| `behind_by` | 状態             | 次に進む Step           | 空コミット kick       |
| ----------- | ---------------- | ----------------------- | --------------------- |
| `> 0`       | BEHIND + BLOCKED | Step 3（update-branch） | CI が実発火すれば不要 |
| `0`         | 純 BLOCKED       | Step 4（kick）          | 必要                  |

分岐の根拠と実証ケースは `docs/runbook/bot-pushed-head-kick.md`（SSoT）を参照。

### Step 3. BEHIND の場合: update-branch を先に実行

`behind_by > 0` のときだけ実行する。

```bash
gh api "repos/:owner/:repo/pulls/$ARGUMENTS/update-branch" -X PUT
```

update-branch が作るマージコミットは自アカウントのトークンで push されるため、bot トークンの no-recursion 制約を受けない。実ユーザー push として全ワークフローが発火するので、Step 4 の空コミット kick は飛ばして Step 5 へ進む。実発火すれば空コミット1本と CI 1周を節約できる。

Step 5 で `action_required` のまま止まっていた場合だけ Step 4 に戻る。`behind_by == 0` の状態で実行すると 422 が返るため、そのときは Step 4 が正。

### Step 4. release-please-kick の実行

`behind_by == 0`（純 BLOCKED）のとき、または Step 3 の update-branch 後も CI が発火しなかったときに実行する。

```bash
bash scripts/release-please-kick.sh
```

空コミットで新しい head を作り、`pull_request: synchronize` を実ユーザー相当のトークンで発火させる。ブランチ名を省略すると open な release PR を自動検出する。詳細・`RELEASE_KICK_PAT` 未設定時のエラー・`workflow_dispatch` 経由の代替は runbook 参照。

### Step 5. 新 head の CI 実発火確認

```bash
gh run list --limit 5 --json databaseId,status,conclusion,headBranch,workflowName
```

新 head の run が `action_required` のまま止まっていないか（＝実発火しているか）を確認する。`action_required` のままなら `RELEASE_KICK_PAT` 未設定などが疑われる。runbook のトラブルシュートへ。

### Step 6. CI green までポーリング

Monitor ツールは使わず、1つの Bash 呼び出し内で sleep しながらポーリングする。**ポーリング用の変数名に `status` を使わない**（zsh の読み取り専用変数と衝突し代入が失敗する）。

終了条件は「必須チェックが全件 `pass`」かつ「`fail` バケットが 0 件」の 2 つとする。`pending` の総数を終了条件にしてはならない（理由は下記）。

```bash
requiredTotal=$(gh api "repos/:owner/:repo/branches/main/protection/required_status_checks" --jq '.checks | length')
[ "$requiredTotal" -gt 0 ] 2>/dev/null || { echo "必須チェック数を取得できない。Step 1 の gh アカウント確認へ戻る"; exit 1; }
for i in $(seq 1 15); do
  requiredPass=$(gh pr checks $ARGUMENTS --required --json bucket --jq '[.[] | select(.bucket=="pass")] | length')
  failCount=$(gh pr checks $ARGUMENTS --json bucket --jq '[.[] | select(.bucket=="fail")] | length')
  echo "iteration $i: requiredPass=$requiredPass/$requiredTotal fail=$failCount"
  [ "$failCount" != "0" ] && break
  [ "$requiredPass" = "$requiredTotal" ] && break
  sleep 15
done
gh pr checks $ARGUMENTS --json name,bucket --jq '.[] | select(.bucket != "skipping")'
```

- 母数の `requiredTotal` は branch protection から取る。`gh pr checks --required` の件数を母数にすると、まだ報告されていない必須チェックが母数から抜け落ちるため、早期に green と誤判定する
- `requiredTotal` の数値ガードは省略しない。branch protection の参照には admin 権限が要るので、gh アカウントが無言で切り替わると 404 になり、`requiredTotal` にエラー JSON が入ってループが空回りする（本手順の検証中に実際に発生した）
- `pending` の総数は単調減少しない。キック直後はワークフローが順次キューされるので、いったん減ってから増える。v1.67.1 実走の推移は 7→5→4→**9**→8→6→3→2 であり、旧条件（`pending == 0`）は一度も成立せず 8 周の上限に達した
- `pending` の総数には必須外のコンテキストが多数含まれる。v1.67.1 実走時点の release PR には 24 コンテキストが付き、必須はうち 6 件のみだった（残りは Vercel / Link Check / CodeQL / PlanGate Review など）。必須外の完了はマージ条件ではない
- 早期 break しない場合、ループは最長で約 4 分半（15 周 × sleep 15 秒 + API 応答）を要する。Bash ツールの timeout に 360000（ミリ秒）以上を指定して実行し、既定の 120000 のまま走らせない
- 15 回で終了条件を満たさない場合はループを打ち切り、実出力を提示したうえで待機を継続するか判断を仰ぐ。v1.67.1 実走では run 作成 05:36:45Z から最終必須チェック完了 05:39:40Z まで約 3 分を要しており、旧設定の 8 回（約 2 分弱）では足りない
- `fail` バケットが出たらループを抜け、直ちに報告して原因調査へ切り替える（本コマンドはマージ前提の手順であり、CI 失敗の修正は別タスク）。必須外の `fail` でも一度ループを抜けて報告し、マージ可否は人間が判断する

### Step 7. マージ

`mergeStateStatus: CLEAN` かつ Step 6 の CI が green になったら、**マージの前に `/merge-check` の Step 6「PR 本文の closing keyword 確認」を実施する**。

release-please は、コミット本文が `refs #N` であっても release PR の本文では `closes [#N](...)` としてレンダリングする。squash merge では PR 本文の closing keyword が効くため、リリース PR のマージは該当 issue を閉じる。**リリース PR ではこの確認が必ず該当する。**

```bash
gh api "repos/:owner/:repo/pulls/$ARGUMENTS" --jq .body | grep -i 'closes\|fixes\|resolves'
```

ヒットした場合の判定基準（スコープの全体カバー / Epic・追跡用 issue でないか / 未完了チェックボックスの有無）と、閉じてはいけない issue があった場合の `gh pr edit` による `closes` → `refs` 書き換え手順は `.claude/commands/merge-check.md` の Step 6 が SSoT である。

確認が済んだらマージする。

```bash
gh pr merge $ARGUMENTS --squash --delete-branch
```

ポーリング中に main が進んで再び BEHIND になった場合は、Step 3 の update-branch を実行してから Step 6 のポーリングをやり直す。

### Step 8. 検証

- Release Please workflow の run が success で終わっていることを `gh run list` で確認する
- tag が merge commit と一致することを確認する。`repos/:owner/:repo/git/ref/tags/<tag>` が単発 404 を返す場合は `git ls-remote --tags origin` でも照合する
- `gh release view <tag>` で release が published になっていることを確認する

### Step 9. Migration note の追記（公開契約を変えた PR がある release のみ）

release-please は CHANGELOG に commit subject しか載せないため、利用者が CI を直すのに必要な移行情報（外すべき flag、書き換えるべき呼び出し形、参照先）は Release body に手で足す。

1. `gh release view <tag> --json body --jq .body` で本文を取り、CHANGELOG の該当節に載った PR のうち **`pages/reference/stable-interfaces.md` の免責節を追加・拡張した PR、または `--base` の受理縮小のように exit code や受理範囲を変えた PR** を特定する。無ければ本 Step は不要
2. 元本文をローカルへ退避してから（`gh release view <tag> --json body --jq .body > <scratchpad>/release-<tag>-body.bak.md`）、v1.99.3 / v1.100.0 と同型の `> **Migration note (#issue / #PR)** — …` ブロックを末尾に追記する。内容は「何が変わったか / 従来の結果を得る書き方 / reference へのリンク」の 3 点
3. `gh release edit <tag> --notes "$(cat <退避ファイル>)<追記>"` で更新し、`gh release view <tag> --json body --jq .body | grep -c 'Migration note'` が 1 以上であることを確認する

2026-09-05 の v1.99.2 / v1.99.3 / v1.100.0 は 3 リリース連続で範囲レビュー（`/range-review`）が「移行情報が Release body に無い」を major として出し、都度後付けした。本 Step はその手順を release 時点へ前倒しするものである。

## 禁止事項

- `git push --force`
- `git reset --hard`
- `gh pr merge --admin`（`enforce_admins: true` の場合はそもそも BLOCKED を回避できない）
- release PR の内容（CHANGELOG / バージョン番号等）へのファイル編集。本コマンドは release-please が生成した内容をそのままマージする手順であり、内容修正が必要な場合は release-please の設定側を直す

## 参照

- `.claude/commands/merge-check.md` Step 6（SSoT: PR 本文の closing keyword 確認、閉じてよい issue かの判定基準、`closes` → `refs` の書き換え手順）
- `docs/runbook/bot-pushed-head-kick.md`（SSoT: BLOCKED の原因、BEHIND と純 BLOCKED の判定、`RELEASE_KICK_PAT` セットアップ、`workflow_dispatch` 版が deprecated である理由）
- CLAUDE.md「`N of N required checks are expected` = bot/GITHUB_TOKEN push」ガード
