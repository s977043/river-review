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
2. クリーンな worktree で `scripts/revert-pr.sh <PR番号>` を実行し、dry-run の結果を読む
3. 問題がなければ `git switch main` と `git branch -D revert/pr-<PR番号>` で後片付けをする
4. `scripts/revert-pr.sh <PR番号> --execute` で push と PR 作成を行う
5. PR 本文の「理由」を埋め、CI の green を確かめてからマージ前チェックリストに沿ってマージする

スクリプトは次の場合に止まります。

- PR が `MERGED` でない、または merge commit が `origin/main` に無い（exit 3）
- `revert/pr-<N>` が既にある、または作業ツリーに未コミット変更がある（exit 3）
- revert が衝突した（exit 1）。revert は中断され、fix-forward を検討する

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

## 実測（2026-10-09 ドリル）

TBD
