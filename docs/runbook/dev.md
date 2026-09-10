# 開発ランブック（ローカル）

## 前提

- Node.js—リポジトリ直下の `.nvmrc` でピン留めされたバージョン (現状 `22.22.2`) を使用する。`nvm use` または同等の version manager で揃える。CI も同じ `.nvmrc` を SSoT として参照する。
- npm

## 初期セットアップ

```bash
nvm use      # .nvmrc を読み込む (任意の version manager 可)
npm ci
```

CI ではこれらの手順を `.github/actions/setup-node-deps` (composite action) に集約しており、`actions/setup-node@v6` + `npm ci --prefer-offline` を一括で実行する。

CI ワークフローの一覧、branch protection の必須チェックがどのジョブに対応するか、新しいワークフローを追加する手順は [.github/workflows/README.md](../../.github/workflows/README.md) にまとまっている。

## 日常の検証コマンド

```bash
npm run lint
npm test
npm run agents:validate
npm run skills:validate
npm run agent-skills:validate
```

### テスト構成

`npm test` は `node --experimental-test-isolation=none --test` で `tests/**/*.test.mjs` を実行する。isolation フラグは #1415 の `Unable to deserialize cloned data` flake（node:test の子プロセス IPC バグ）を避けるため npm script 側に置いており、`npm test` を経由する呼び出しはすべてこの保護を受ける。レイアウトは:

- `tests/*.test.mjs`—ユニットテスト本体（フラット配置）
- `tests/core/`—コアロジック単位のユニットテスト
- `tests/integration/`—`local-runner` などの統合テスト
- `tests/helpers/`—`createTempMemory` / `createTempDir` など複数テストで共有するヘルパー (#506 で導入)
- `tests/fixtures/`—eval / レビュー / Riverbed Memory のフィクスチャ

CI ではカバレッジを `NODE_V8_COVERAGE=coverage npm test` で取得し、Codecov へ OIDC (`id-token: write`) でアップロードする (`.github/workflows/test.yml` `unit-tests` ジョブ)。Codecov を呼び出すジョブには `permissions.id-token: write` が必須で、無いと OIDC トークン取得に失敗する (#546 で修正済み)。

## よくある詰まりどころ

- `npm run check:links` が失敗する場合:
  - `lychee` が未インストールの可能性。
  - ローカルでは `npm run check:links:local` で内部リンクのみ検証可能。
- Lint エラーが日本語文書で出る場合:
  - `npm run lint:text` の出力に従って文言を修正。

## 並行タスク（Git Worktree）

異なるコンテキストのタスクは物理的に分離して実行する。

```bash
# 作成
git worktree add -b <new-branch-name> ../<project>-worktrees/<feature-name> main
cd ../<project>-worktrees/<feature-name>
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
- やむをえない場合は`git commit --no-verify`を使用し、CIでの検証に委ねる

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
