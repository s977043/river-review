# Revert Runbook

マージ済み PR を取り消すときの手順です。
`scripts/revert-pr.sh` が手順の実体で、この文書は判断基準と実測値を持ちます。

## revert か fix-forward か

先に「どちらで直すか」を決めます。迷ったら次の表で判断してください。

| 状況                                              | 選ぶ手                       |
| ------------------------------------------------- | ---------------------------- |
| 原因 PR が特定でき、その差分を丸ごと消せば直る    | revert                       |
| 原因 PR の後に同じ箇所を触った PR がある          | fix-forward（revert は衝突） |
| 直し方が 1 行程度で明らか、かつ CI で確かめられる | fix-forward                  |
| 原因が不明、または複数 PR の組み合わせ            | 原因の切り分けを先に行う     |
| dist（`runners/github-action/dist/**`）を含む PR  | revert 可。ただし下記を参照  |

## リリースが関門である

このリポジトリでは、利用者に届くのはリリース（tag と `@v1` の移動）だけです。
main にマージされただけの変更は、まだ誰にも届いていません。

- 未リリースの不具合は、release-please のリリース PR をマージせずに止める
- そのうえで原因 PR を revert し、リリース PR が更新されるのを待つ
- 急いで tag を打ち直す必要はない

## リリース前とリリース後

| 時点       | 手順                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| リリース前 | リリース PR を保留し、原因を revert する。次のリリースに不具合は含まれない    |
| リリース後 | revert PR をマージし、release-please が作るパッチリリースで前進的に置き換える |

リリース後も tag は動かしません。
既存 tag の付け替えや削除は、すでに取得した利用者との整合を壊すためです。
`revert:` の commit は release-please の changelog で扱われ、次のパッチリリースに載ります。

## 手順

1. `gh api user --jq .login` が `s977043` であることを確かめる（スクリプトも `--execute` 時に確認する）
2. `scripts/revert-pr.sh <PR番号>` で dry-run を実行し、衝突の有無と dist 警告を読む
3. `scripts/revert-pr.sh <PR番号> --execute` で push と PR 作成を行う
4. PR 本文の「理由」を埋め、CI の green を確かめてからマージ前チェックリストに沿ってマージする

スクリプトは次の場合に止まります。

- PR が `MERGED` でない、または merge commit が `origin/main` に無い（exit 3）
- `revert/pr-<N>` がローカルか remote に既にある（exit 3）
- revert が `origin/main` と衝突する（exit 1）。何も作らずに止まるので、fix-forward を検討する

## dist に影響する revert

元の PR が `runners/github-action/dist/**`、`runners/github-action/src/**`、`src/**` を触っていると、スクリプトは警告を出します。
dist は `src/**` も束ねるため、revert 後の dist が再ビルド結果と一致しない場合があります。

- CI の dist チェック失敗時は、Node 22 で `npm run build:action` を実行して commit する
- bot が dist を push すると、必須チェックは走らずに止まる場合もある
- その場合は `scripts/pr-unstall.sh` と `docs/runbook/bot-pushed-head-kick.md` に従う

## 対象外

git で戻せるのはリポジトリの内容だけです。
次のものはこの手順では戻りません。

- エージェントの memory（`ai-second-brain` 配下）
- ローカルの `.claude/settings*.json` や gh の認証状態
- 公開済みの GitHub Release、Marketplace や plugin 配布先のキャッシュ

これらは各所の手順で個別に扱ってください。

## 実測（2026-10-11 ドリル）

docs のみの PR #2653 をマージし、本スクリプトで revert しました（revert PR #2654）。
時刻は UTC で、CI 待ちは `scripts/wait-pr-ready.sh`（20 秒間隔）で測っています。

| 区間                                              | 時刻                | 所要       |
| ------------------------------------------------- | ------------------- | ---------- |
| `revert-pr.sh 2653 --execute` 実行（PR 作成まで） | 05:45:06 → 05:45:22 | 16 秒      |
| revert PR の CI green まで                        | 05:45:22 → 05:49:27 | 4 分 5 秒  |
| 開始から CI green まで（合計）                    | 05:45:06 → 05:49:27 | 4 分 21 秒 |

手作業は 2 回でした。

- スクリプトの実行 1 回
- CI green 後の `gh pr merge --squash --match-head-commit <sha>` 1 回

目標（15 分以内・手作業 3 回未満）は満たしました。
dist に影響しない revert での値であり、dist 再ビルドや bot push の停止が絡むと延びます。
スクリプトは呼び出し元の checkout を切り替えず、作業ツリーも変更しません。
衝突判定は `git merge-tree` で行い、dry-run は worktree とブランチを作りません。
`--execute` は `mktemp -d` 配下の一時 worktree で revert し、終了時に必ずその worktree を削除します。
（ドリル時点の版は呼び出し元の checkout を切り替えていたため、この方式に改めました。）
