# 開発ランブック（ローカル）

## 前提

- Node.js—リポジトリ直下の [`.nvmrc`](../../.nvmrc) で指定されたバージョンを使用する。`nvm use` または同等のバージョン管理ツールで揃える。
- npm
- ShellCheck—`npm run lint` がシェルスクリプトを検査する。Ubuntu / WSL では `sudo apt install shellcheck` で導入できる。

## 初期セットアップ

```bash
nvm install  # .nvmrc の指定版を導入（初回のみ）
nvm use
node --version
npm ci
```

### シェルの Node.js が指定版に切り替わらない場合

[ローカル実行スクリプト](../../scripts/local-npm.sh)を使うと、指定版の Node.js で npm を実行できる。リポジトリ直下で次を実行する。

```bash
bash scripts/local-npm.sh exec -- node --version
bash scripts/local-npm.sh run dev
```

スクリプトは `.nvmrc` を読み、現在の Node.js が一致しなければ nvm で切り替える。指定版は事前にインストールしておく。別のバージョン管理ツールを使う場合は、そのツールで指定版を有効にしてから実行する。切り替えは子プロセス内で行い、シェル全体の既定値は変更しない。

### CI との対応

[共通セットアップ](../../.github/actions/setup-node-deps/action.yml)は、`actions/setup-node` と npm キャッシュを使い、`npm ci` を実行する。共通処理の Node.js 指定は既定で `22.x`。一部のジョブは `.nvmrc` を直接参照するため、すべての CI ジョブが同じパッチ版になるわけではない。

CI ワークフローの一覧、branch protection の必須チェックがどのジョブに対応するか、新しいワークフローを追加する手順は [.github/workflows/README.md](../../.github/workflows/README.md) にまとまっている。

## 日常の検証コマンド

```bash
npm run lint
npm test
npm run agents:validate
npm run skills:validate
npm run agent-skills:validate
```

Node.js の切り替えをコマンドごとに確実に行う場合は、次を使う。

```bash
bash scripts/local-npm.sh run lint
bash scripts/local-npm.sh test
```

### 特定のテストだけ実行する

```bash
npm test -- tests/fix-dashes.test.mjs
# シェルの Node.js が指定版と異なる場合
bash scripts/local-npm.sh test -- tests/fix-dashes.test.mjs
```

対象を絞った確認の後も、PR 前には全体の lint とテストを実行する。

### テスト構成

`npm test` は `node --experimental-test-isolation=none --test` で `tests/**/*.test.mjs` を実行する。isolation フラグは #1415 の `Unable to deserialize cloned data` flake（node:test の子プロセス IPC バグ）を避けるため npm script 側に置いており、`npm test` を経由する呼び出しはすべてこの保護を受ける。レイアウトは:

- `tests/*.test.mjs`—ユニットテスト本体（フラット配置）
- `tests/core/`—コアロジック単位のユニットテスト
- `tests/integration/`—`local-runner` などの統合テスト
- `tests/helpers/`—`createTempMemory` / `createTempDir` など複数テストで共有するヘルパー (#506 で導入)
- `tests/fixtures/`—eval / レビュー / Riverbed Memory のフィクスチャ

CI ではカバレッジを `NODE_V8_COVERAGE=coverage npm test` で取得し、Codecov へ OIDC (`id-token: write`) でアップロードする ([CI ワークフロー](../../.github/workflows/test.yml)の `test` ジョブ、表示名は `Unit tests`)。Codecov を呼び出すジョブには `permissions.id-token: write` が必須で、無いと OIDC トークン取得に失敗する (#546 で修正済み)。

## よくある詰まりどころ

- `npm run check:links` が失敗する場合:
  - `lychee` が未インストールの可能性。
  - ローカルでは `npm run check:links:local` で内部リンクのみ検証可能。
- Lint エラーが日本語文書で出る場合:
  - `npm run lint:text` の出力に従って文言を修正。

### 検証とファイル監視の対象

[`.markdownlintignore`](../../.markdownlintignore)は、生成物、別 worktree、Codex の実行時ファイルを Markdown lint から除外する。通常の設定ファイルやスキルは検査対象に残る。VS Code の監視対象は [`.vscode/settings.json`](../../.vscode/settings.json)で別に設定する。

`npm run check:dashes` は、`docs/`、所定のチェックリスト、ルートの `README.md` と `AGENTS.md` を検査する。表記違反または読み取りエラーがあれば失敗する。`npm run fix:dashes` で修正した後は、差分を確認してから再検証する。

## 並行タスク（Git Worktree）

異なるコンテキストのタスクは物理的に分離して実行する。

```bash
# 作成
git worktree add -b <new-branch-name> ../<project>-worktrees/<feature-name> main
cd ../<project>-worktrees/<feature-name>
nvm use
npm ci

# 作業・検証後にクリーンアップ（PRマージ確認後）
git worktree remove ../<project>-worktrees/<feature-name>
git branch -d <branch-name>
git worktree prune
```

委託ワーカー用の `.claude/worktrees/<slug>` は `scripts/worker-bootstrap.sh <branch>` で作ります。PR マージ後の後始末（remove / branch -D / fetch --prune / ff-only）は `scripts/worker-cleanup.sh <branch>` にまとめています。

## Windows（WSL）での注意事項

- `\\wsl.localhost\Ubuntu\...`のようなUNCパス経由では`husky`や`prettier`がCMD.EXEで実行されエラーになることがある
- Git操作やnpmスクリプトはWSLターミナル内（`/home/<user>/...`）で実行する
- Node.js の実行元が不明な場合は `command -v node` と `node --version` を確認する
- フックが失敗した場合は、WSL 内で指定版の Node.js を有効にし、lint とテストを通してからコミットを再実行する

## PR 前チェック

```bash
npm run lint
npm test
```

変更範囲に応じて、次も実行:

```bash
npm run agents:validate
npm run skills:validate
```

`runners/github-action/src/**` を変更した場合、または CI の "Action dist freshness" が失敗した場合は、再生成が必要です。`.nvmrc` の Node バージョンに揃えてから `npm run build:action` で `runners/github-action/dist/` を再生成する。詳細は `docs/development/dist-check-rebuild-guide.md` を参照。

PR マージ前のチェックリスト（CI green / レビュアーコメント disposition / preflight など）は `docs/governance.md` § "PR レビューとマージ" にまとまっている。

## Codex 連携の検証

Codex CLI から River Review の skill とフロー定義を参照できるかを確認する。

```bash
npm run codex:verify
npm run codex:verify -- --live
```

通常モードはプラグイン manifest / 同期状態 / skill 定義と、Codex adapter・cross-runtime の関連テストをローカルで検査する。`--live` は Codex CLI を読み取り専用 sandbox で起動し、manifest と plan-review flow を読ませる。認証済み Codex が必要で、180 秒を超える場合はタイムアウトする。実行時の標準入力は閉じる。

### 2026-09-22 の実測

- Codex CLI `0.155.0-alpha.9.2`。River Review の skill はこの Codex セッションの利用可能 skill 一覧にあり、キャッシュ上の配布版は `1.120.0`。
- `npm run codex:verify` の契約テストは190件成功。リポジトリ全体でも `npm run lint` 成功、`npm test` は5,258件成功。
- ローカルチェックアウトの marketplace 登録は成功。続く `codex plugin add river-review@river-review-marketplace` は45秒でタイムアウトしたため、この操作での新規インストール完了は確認できていない。
- `codex exec` の live smoke は Codex 起動中の marketplace 更新が30秒でタイムアウトし、レビュー出力を得られなかった。従って確認できたのは契約・skill 配布とローカル参照までであり、Codex 上の end-to-end review 成功とは扱わない。

プラグインのインストール処理が止まる場合、まずCodex起動ログの `unsupported source`、marketplace clone timeout、または認証エラーを区別する。インストール済みであることと、対象リポジトリで skill が使われたことも別々に確認する。
