# Dist Check Rebuild Guide

`runners/github-action/dist/` は `npm run build:action` により ncc で事前 bundle される。`test.yml` の `Action dist freshness` ジョブはこの dist が最新の src と一致することを検証する。

## 問題

このリポジトリでは、ncc bundle 出力が Node major version によって異なることが経験的に観測されている。ローカルと CI で Node major が異なると、同一 src からでも異なる bundle が生成され、`Action dist freshness` の false positive fail を引き起こす。

過去の rebuild コミット:

- `fc1c019 chore(action): rebuild dist after main updates`
- `#491 chore(action): rebuild github-action dist`

契機となった最近のセッション:

- `#528` 準備中にローカル Node 25 で rebuild したところ CI Node 22 と出力が食い違い、Node 22 で再度 rebuild し直した

## Node version の SSoT

リポジトリルートの `.nvmrc` が唯一の真実。現時点では `22.22.2` が pin されている。workflow 側の `node-version: 22.x` はこれを緩く参照しているだけ。

```bash
cat .nvmrc
# → 22.22.2
```

## 自動再ビルド（Auto Rebuild Action Dist）

`.github/workflows/auto-rebuild-action-dist.yml` が PR 上で dist の再ビルドを自動化します。bundled sources（`runners/github-action/src/**`、`src/**`、`package-lock.json`）が変更された PR において、workflow は `.nvmrc` の Node により `npm run build:action` を実行します。byte 差分が出た場合のみ `chore(action): rebuild github-action dist` コミットを PR branch に push します。差分が出なければ何も push しません。

対象となる条件は以下のとおりです。

- 同一リポジトリ内ブランチからの PR（fork PR は push 不可のため対象外。従来どおり `Action dist freshness` job が staleness を検出する）
- `release-please--` で始まる branch は対象外（自動コミットが release PR を汚染しないようにするため）

トークンおよび no-recursion 制約の扱いは、`release-please-kick.yml` と同様です。`GITHUB_TOKEN` による push は GitHub の no-recursion 制約により `pull_request` workflow を再発火させません。そのため `RELEASE_KICK_PAT`（contents:write）があればそれを優先し、新しい head SHA で CI が再実行されます。`RELEASE_KICK_PAT` が未設定の場合、fallback push は warning を表示します。その際は empty commit などにより手動で CI を発火させてください。

以下の場合は次節の手動手順を fallback として使います。

- fork からの PR
- release-please branch 上での staleness
- workflow 自体が失敗した場合

## ローカル rebuild 手順（手動 fallback）

### 1. Node を `.nvmrc` に合わせる

```bash
# nvm
nvm use              # .nvmrc を自動参照

# volta (.nvmrc を読む場合は自動、そうでなければ明示)
volta pin node@"$(cat .nvmrc)"

# asdf
asdf install nodejs "$(cat .nvmrc)"
asdf local nodejs "$(cat .nvmrc)"
```

nvm/volta/asdf いずれも使っていない場合、`node -v` で version を確認し、homebrew / fnm / 手動インストールで `.nvmrc` のバージョンに合わせる。

### 2. 依存を解決して rebuild

```bash
git merge origin/main   # conflict 解消などで merge を挟む場合はここで実行
npm ci                  # merge の後に必ず実行（先に実行すると旧依存で bundle される）
npm run build:action
```

merge を挟む場合、`package-lock.json` が更新されることがあります（main 側が lock を変えていた場合）。更新されたのに `node_modules` が merge 前のままだと、旧依存で bundle され、差分が出ないまま stale な dist が残ります。そのため **merge の後に `npm ci` をやり直してから** rebuild してください。

### 3. 差分を確認して commit

```bash
git diff --stat runners/github-action/dist/
git add runners/github-action/dist/
git commit -m "chore(action): rebuild github-action dist"
```

## 作業ディレクトリ名の焼き込み（worktree での rebuild）

ncc は relocate した asset を「ビルドルートの親」からの相対パスで解決します。その結果、bundle 内の asset 参照 `__webpack_require__.ab + "<ディレクトリ名>/"` と、生成される `dist/<ディレクトリ名>/` の両方に、ビルド時の作業ディレクトリ名が焼き込まれます。

CI の checkout 先はリポジトリ名と同じ `river-review` です。agent worktree は `.claude/worktrees/agent-<id>/` に作られるため、そこで rebuild すると同一 src からでも CI と異なるバイト列になります（#1894 で実際に発生）。

### 検出

```bash
git grep -n '__webpack_require__.ab + "' -- runners/github-action/dist
find runners/github-action/dist -maxdepth 1 -type d
```

- 前者の出力に `river-review/` 以外のディレクトリ名が混じっていれば焼き込みである
- 後者に `runners/github-action/dist/river-review` 以外のディレクトリが出た場合も原因は同じである

### スクリプトが自動で行うこと

`build:action` の第 2 段である `scripts/normalize-dist.mjs` が、rebuild のたびに次を実行します。

- `package.json` の `name` を正規名とし、`__webpack_require__.ab` 直後の asset 参照だけを正規名へ書き換える
- `dist/<作業ディレクトリ名>/` を `dist/<正規名>/` へ移す（正規名のディレクトリが既にある場合は統合する）
- 作業ディレクトリ名が正規名と一致するときは何もしない（`river-review` という名前の checkout では no-op）

### 手で直す場合

上記と同じ 2 つの変換を適用します。`river-review` という文字列はパッケージ名・URL・vendored パスにも現れるので、一括置換は避けて `__webpack_require__.ab` 直後の該当箇所だけを書き換えてください。asset ディレクトリは `mv runners/github-action/dist/<作業ディレクトリ名> runners/github-action/dist/river-review` で移します。

## いつ rebuild が必要か

以下のいずれかを触った場合:

- `runners/github-action/src/**`
- `runners/github-action/src/index.mjs` から import される `src/**` のモジュール
- `package.json` / `package-lock.json` の ncc 依存 (`@vercel/ncc` 自体の bump、または bundle 対象に入る dependency の bump)

> CI の `Action dist freshness` job は、次のいずれかに当てはまる変更に対して **`npm run build:action` を実行して byte 差分を確認**する。再 build しても dist に diff が出ないなら、その変更は bundle に影響していないと判断され、ローカル commit なしでも pass する（false positive 回避）。逆に diff が出た場合は rebuild commit が必要。
>
> - 差分が `runners/github-action/dist/` を含む（手編集・ビルドし忘れ・`.nvmrc` と違う Node でのビルドを捕捉する）
> - 差分が `dist/` を含まず、src commit timestamp が dist より新しい（リビルド忘れを捕捉する）
>
> `dist/` を含む差分を必ず検証するのは、timestamp 比較だけでは同一コミットが src と `dist/` を同時に変更したときに `src_ts == dist_ts` が成立し、検証がすり抜けたため（#1749）。`dist/` に差分が無い変更の判定は従来と変わらない。docs のみの変更でも、main の tip が `package-lock.json` などを触った直後は src 側 commit のほうが dist より新しく、従来どおり rebuild 検証に回る（実例: #1752 の `Action dist freshness` は 50 秒かけてフル rebuild 経路を通った）。
>
> byte 比較は `git status --porcelain -- runners/github-action/dist/` で行う。ncc は lazy chunk を番号（`dist/<n>.index.mjs`）で命名するため、依存の変更でコミットに存在しない新規 chunk が生成される。この新規ファイルは untracked であり、`git diff` では検出できない。

## トラブルシューティング

| 症状                                                                            | 原因                                                                | 対応                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ローカルで `git diff --quiet runners/github-action/dist/` は通るのに CI で fail | ローカル Node が `.nvmrc` と違う                                    | `nvm use` で揃えて再 build                                                        |
| rebuild しても差分が残り続ける                                                  | `node_modules` が stale                                             | `npm ci` で依存再解決後に `npm run build:action`                                  |
| `index.mjs.map` のみの大量差分                                                  | sourcemap の決定論性問題                                            | Node を `.nvmrc` に揃えれば通常解消                                               |
| merge 後に rebuild したのに dist に差分が出ない（stale なのに clean に見える）  | `git merge` で依存が更新されたのに `node_modules` が merge 前のまま | `git merge origin/main` の**後**に `npm ci` を実行してから `npm run build:action` |
| dist に `river-review/` 以外のディレクトリ名が現れる                            | worktree など checkout 名が `river-review` でない場所で build した  | `npm run build:action` が自動で正規化する（詳細は本書の作業ディレクトリ名の節）   |

## 関連

- CLAUDE.md § AI Misoperation Guards—"Match CI Node version for dist rebuilds"
- `.nvmrc`—リポジトリ Node version の SSoT
- `.github/workflows/test.yml`—`dist-check` ジョブ定義
- `package.json`—`build:action` スクリプト（リポジトリ root。`runners/github-action/package.json` は存在しない）
