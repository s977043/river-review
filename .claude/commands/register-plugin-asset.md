---
description: 新しい配布 command / agent / agent-skill を plugin manifest に登録し、検証シーケンスまで実行する
argument-hint: '[command|agent|skill] <name>'
allowed-tools: Bash(npm run plugin:validate:*), Bash(npm run plugin:sync), Bash(npm run plugin:sync:*), Bash(npm run agent-skills:validate:*), Bash(npm run check:doc-enum:*), Bash(npm run meta:validate:*), Bash(ls:*), Bash(git status:*), Bash(git diff:*), Read, Edit
---

新しい配布アセット（command / agent / agent-skill）を plugin manifest に登録し、検証まで通す。手順の SSoT は `docs/development/plugin-asset-registration-checklist.md` にあり、本コマンドはその実行手順の具体化のみを担う。$ARGUMENTS で種別と名前を受け取る（省略時は `git status` の差分から種別を推定する）。

## Step 0. 配布面か非配布面かを判定

```bash
git status --short
```

- 追加ファイルが `commands/*.md`・`agents/*.md`・`skills/agent-skills/**` のいずれかを確認する
- `.claude/commands/*.md` はリポ開発専用で**配布されない**。この場合 manifest 登録は不要と報告して終了する（`skills/{upstream,midstream,downstream}/` も plugin `skills` の対象外＝別系統）
- 判定基準の詳細は checklist の「配布面と非配布面の区別」表を正とする

## Step 1. 種別ごとの manifest 登録

### command（`commands/<name>.md`）

`.claude-plugin/plugin.json` の `commands[]` に `"./commands/<name>.md"` を追加する。`.codex-plugin/plugin.json` に commands フィールドはないため対応不要。`commands/` 直下にはコマンド本体以外（README 等）を置かない（公式 validator が全 `*.md` をコマンドとして走査するため）。

- CLAUDE.md「Custom Commands」表と `docs/development/distributed-commands.md` に説明を追記する（`npm run check:doc-enum` が両表と `commands/*.md` の一致を機械検証するため、条件付きではなく必須）

### agent（`agents/<name>.md`）

`.claude-plugin/plugin.json` の `agents` を確認する。現在は単一文字列（`"./agents/river-review.md"`）のため、2つ目を足すときは**配列化**する:

```jsonc
"agents": ["./agents/river-review.md", "./agents/<name>.md"]
```

- 単一文字列のまま新 agent を足すと解決されない。plugin-manifest スキーマ（`$schema`）が配列を許容することを Read で確認する

### agent-skill（`skills/agent-skills/<name>/SKILL.md`）

両 manifest の `skills` は**ディレクトリ参照**（`"./skills/agent-skills/"`）のため、manifest 編集は不要。ディレクトリ配置だけで自動包含される。

- ディレクトリ名が kebab-case で frontmatter `metadata.name` と一致することを Read で確認する

## Step 2. フィールドを追加・変更した場合の追加対応

manifest に新しい「フィールド」を足した／値を変えた場合（ファイル追加だけでなく）:

- 外部 bundle（awesome-codex-plugins fork の `plugin.json`）にも同じ変更を反映する。外部 bundle と repo の差分は `npm run plugin:sync` の対象外で、黙ってずれる。反映は同 PR で行う
- `package.json` SSoT の同期フィールド（keywords / homepage / author / license）は手編集せず、`npm run plugin:sync` で反映する

## Step 3. 検証シーケンス

```bash
npm run plugin:validate
npm run plugin:sync:check
npm run agent-skills:validate   # agent-skill を触った場合のみ
npm run check:doc-enum
npm run meta:validate
```

- 全て pass を確認する。fail は該当項目を修正してから再実行する
- `plugin:validate` が「参照パス不在」で落ちる＝登録漏れ or パス誤り。`plugin:sync:check` の drift＝同期フィールドの手編集を疑う
- `check:doc-enum` が落ちる＝`docs/development/distributed-commands.md` か CLAUDE.md「Custom Commands」表への追記漏れ（`meta:validate` からも実行されるため CI で必ず止まる）

## 判定

### A. REGISTERED

条件: Step 1 の manifest 登録が完了し、Step 3 の検証が全て pass。

対応: 追加したアセット種別・manifest の差分（`git diff .claude-plugin/ .codex-plugin/`）・検証結果を添えて報告する。

### B. INCOMPLETE

条件: 登録漏れ or 検証 fail が残る。

対応: 未達を種別付きで全件列挙し、それぞれの解消アクション（manifest 追記 / 配列化 / frontmatter 修正 / bundle mirror）を提示する。解消後に本コマンドを再実行する。

## 禁止事項

- `.claude/commands/` などの非配布アセットを manifest に登録してはならない
- `commands[]` への追記を忘れたまま REGISTERED と判定してはならない（`plugin:validate` は逆ドリフトを検知しないため、本チェックリストで担保する）
- 同期フィールド（keywords / homepage / author / license）を manifest 側で手編集してはならない（`plugin:sync` を使う）
- 本コマンドの手順と `docs/development/plugin-asset-registration-checklist.md` が食い違う場合、checklist を正としてこちらを修正する

## なぜこのコマンドが必要か

plugin manifest はアセット種別ごとに参照方式が異なる（commands=明示列挙 / agents=単一文字列 / skills=ディレクトリ参照）。`plugin:validate` は「参照先の実在」しか見ないため、**ファイルを足したのに manifest へ登録し忘れる逆ドリフト**を機械検知できない。`/merge-check` `/preflight` と同様、登録手順を 1 コマンドの決定論チェックリストに落とすことで、配布アセット追加のたびに登録と検証を確実に通す。
