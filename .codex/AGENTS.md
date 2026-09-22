# Project Codex Instructions

> **Single source:** 共通ルールは [AGENTS.md](../AGENTS.md)。本ファイルは Codex 向けの最小差分です。

## 起動

プロジェクトを信頼済みにして起動します。認証とプラグイン設定を引き継ぐため、`CODEX_HOME` は変更しません。共通規則はルートの `AGENTS.md` を参照します。

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
codex -C "$REPO_ROOT"
```

`package.json` のショートカットを使う場合:

```bash
npm run codex:local -- "your prompt"
npm run codex:exec -- "review this branch"
```

## Kickoff Snippet

```text
あなたは river-review の実装エージェントです。着手前に AGENTS.md を読み、完了条件と制約を確認して短い計画を示してください。
- 変更はタスク単位のブランチで行い、`main` へ直接 push しない。
- `src/` と `docs/` は要確認パスなので、必要なら編集前に明示許可を取る。
- PR 前に `npm run lint` と `npm test` を実行し、追加で必要な検証があれば実行する。
- `.env*`、`secrets/`、鍵ファイルなどの秘密情報は扱わない。
```

## Review Snippet

```text
このブランチをセルフレビューしてください。AGENTS.md と .codex/AGENTS.md に従い、重大な見落とし・未検証・SSOT不整合を優先して指摘してください。
- まず変更ファイルごとのリスクを整理する。
- `main` 直 push 禁止、要確認パス、秘密情報禁止に反していないか確認する。
- 必須検証コマンドの不足があれば明記する。
```

## Codex-Specific Notes

- 設定: `.codex/config.toml`（承認ポリシー / サンドボックス）
- 環境変数は最小限のみ forward する（PATH, HOME, USER, SHELL, LANG, LC_ALL）
- 承認ポリシーは`on-request`（`sandbox_mode=workspace-write` と併用で CLI の `--full-auto` 相当。sandbox_modeで安全性を担保）。`--model`、`--profile`、`--search`、`--add-dir`は実行時に上書きする
- web search や sandbox bypass は repo 既定値にしない

## Quick Reference

- 共通ルール: `AGENTS.md` (SSOT)
- スキル検索: `skills/` (英日両対応)
- 必須検証: `npm run lint`、`npm test`
- 追加検証:
  - `skills/**/*.md`: `npm run skills:validate`
  - `skills/agent-skills/**/*.md`: `npm run agent-skills:validate`
  - `.github/agents/` or `.claude/agents/`: `npm run agents:validate`
  - `pages/**/*.md`: `npm run check:links:local`
- 安全規則: `main` 直 push 禁止、秘密情報禁止、破壊的コマンド禁止
