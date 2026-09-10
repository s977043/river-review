# Plugin アセット登録チェックリスト

新しい command / agent / agent-skill を追加したとき、plugin manifest（`.claude-plugin/plugin.json` / `.codex-plugin/plugin.json`）への登録と検証を漏れなく行うためのチェックリストです。`/register-plugin-asset` コマンドはこの手順を実行します。

## 背景

配布 plugin の manifest は、参照方式がアセット種別ごとに異なる。

- **commands**: `.claude-plugin/plugin.json` の `commands[]` に `./commands/<name>.md` を**明示列挙**する。追加しても列挙し忘れると、plugin インストール時にそのコマンドが解決されない（silent drop）。
- **agents**: `.claude-plugin/plugin.json` の `agents` は現在**単一文字列**（`./agents/river-review.md`）。2つ目の配布 agent を足すときは配列化が要る。
- **skills**: 両 manifest の `skills` は**ディレクトリ参照**（`./skills/agent-skills/`）。配下に新しい agent-skill を足せば自動包含されるが、frontmatter 検証は別途必要。

`npm run plugin:validate` は「manifest が参照するパスの実在」は検査しますが、逆（ファイルを足したのに manifest 未登録）は検査しません。この漏れを防ぐのが本チェックリストの主目的です。

## 配布面と非配布面の区別（最初に確認）

| 置き場所                                  | 配布                     | plugin manifest 登録                                                         |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `commands/*.md`（top-level）              | される                   | **必要**（`.claude-plugin` の `commands[]`）                                 |
| `agents/*.md`（top-level）                | される                   | **必要**（`.claude-plugin` の `agents`）                                     |
| `skills/agent-skills/<name>/`             | される                   | ディレクトリ参照で**自動**（frontmatter 検証は必要）                         |
| `.claude/commands/*.md`                   | されない（リポ開発専用） | 不要                                                                         |
| `skills/{upstream,midstream,downstream}/` | される（Skill Registry） | plugin `skills` の対象外（agent-skills のみ）。`skills/registry.yaml` の対象 |

`#996` により、配布 plugin の command/agent は top-level（`commands/` `agents/`）に置きます。リポ開発専用コマンド（`/merge-check` 等）は `.claude/commands/` に置き、manifest には登録しません。

## チェックリスト

### 新しい配布 command（`commands/<name>.md`）を追加した場合

- [ ] `.claude-plugin/plugin.json` の `commands[]` に `"./commands/<name>.md"` を追加した
- [ ] `commands/` 直下にコマンド本体以外のファイルを置いていない（公式 validator が全 `*.md` をコマンドとして走査するため、README 等はここに置かない）
- [ ] `.codex-plugin/plugin.json` には commands フィールドがない（対応不要）
- [ ] CLAUDE.md「Custom Commands」表と [`distributed-commands.md`](./distributed-commands.md) に説明を追記した
- [ ] `npm run plugin:validate` が pass する
- [ ] `npm run check:doc-enum` が pass する（上記 2 つの表と `commands/*.md` の一致を機械検証する。詳細は [doc-enumeration-checks.md](./doc-enumeration-checks.md)）

### 新しい配布 agent（`agents/<name>.md`）を追加した場合

- [ ] `.claude-plugin/plugin.json` の `agents` を配列化し `"./agents/<name>.md"` を追加した（単一文字列のままだと新 agent が解決されない）
- [ ] plugin-manifest スキーマ（`$schema`）が `agents` の配列形式を許容することを確認した
- [ ] `npm run plugin:validate` が pass する

### 新しい agent-skill（`skills/agent-skills/<name>/SKILL.md`）を追加した場合

- [ ] ディレクトリに `SKILL.md` が実在する（丸ごと無い / `skill.md` 等の誤名・大小文字違いの dir は `agent-skills:validate` / `plugin:validate` のどちらでも検出されず silent skip となり、スキルが無言で no-ship される）
- [ ] ディレクトリ名 `<name>` が kebab-case で、frontmatter `metadata.name` と一致する
- [ ] `npm run agent-skills:validate` が pass する（frontmatter 必須: `metadata.name` / `metadata.description`）
- [ ] `skills` はディレクトリ参照のため manifest 編集は不要（新規登録の manifest 差分は出ない）
- [ ] `npm run plugin:validate` が pass する

### manifest の「フィールド」を追加・変更した場合（ファイル追加だけでなく）

- [ ] 外部 bundle（awesome-codex-plugins fork の `plugin.json`）にも同じフィールドを反映した（CLAUDE.md「Plugin bundle mirror」）
- [ ] cross-manifest parity 対象フィールド（repository / skills / displayName / composerIcon / homepage↔websiteURL / author.name↔developerName）を両 manifest で一致させた
- [ ] `package.json` を SSoT とする同期フィールド（keywords / homepage / author / license）は手編集せず `npm run plugin:sync` で反映した

### その他 validator が検査するサーフェス（種別として明示）

逆ドリフト検査（`checkAssetRegistration`）の対象は commands / agents のみです。以下は主要 asset ではありませんが、変更時に `plugin:validate` が検査するため登録漏れの対象になります。

- **hooks**: manifest に `hooks` フィールドは配布していない（Claude Code は規約パス `hooks/hooks.json` を自動で読み、manifest の `hooks` は追加ファイル専用。規約パスを宣言すると loader が重複と報告する）。`plugin:validate` は宣言の有無に関わらず `hooks/hooks.json` が存在すれば、その `command` が参照する `${CLAUDE_PLUGIN_ROOT}/...` の script 実在を検査する（逆ドリフト検査は commands/agents のみ）。この検査は実在に加えて **plugin root 配下に収まっていること**も見る。`../` で root の外を指す値と、解決先が root の外になる symlink はエラーになる（#2132）。共有 script が必要な場合も plugin 内へ同梱する。抽出は shell の行末コメント（語の境界の `#` 以降）を対象外とし、それ以外は実行対象か引数かを問わず検査する（#2139）
- **marketplace.json**: plugin 名をリネームした場合、`.claude-plugin/marketplace.json` の `plugins[].name` も更新する（`plugin:validate` が不一致を検出する）
- **assets**: `composerIcon`（`assets/icon.svg`）のパスを変えた場合、両 manifest と実ファイルを一致させる（`plugin:validate` が実在を検査する）

## 検証シーケンス（共通・登録後に必ず実行）

```bash
npm run plugin:validate       # manifest 参照の実在・parity・allowlist
npm run plugin:sync:check     # package.json とのフィールド drift 検出
npm run agent-skills:validate # agent-skill を触った場合
npm run meta:validate         # メタ整合
```

いずれかが fail した場合はマージせず、該当項目を修正してから再実行します。

## 公式 validator（`npm run plugin:validate:official`・ローカル専用）

`npm run plugin:validate` はこのリポジトリ固有のルール（cross-manifest parity・逆ドリフト・version 同期）を見るもので、Claude Code 公式の manifest 契約は見ません。公式 validator は `claude plugin validate` であり、`scripts/validate-plugin-official.mjs` がこれを包んでいます。

- 引数によって読む manifest が変わるため、ラッパーは 2 回実行する。ディレクトリ（`.`）を渡すと `marketplace.json` だけを検証し、`commands/` `agents/` とルート `CLAUDE.md` は `.claude-plugin/plugin.json` を明示したときにだけ到達する。
- `--strict` は warning を失敗として扱う。本リポジトリが意図的に受容している warning は `ACCEPTED_WARNINGS`（`scripts/validate-plugin-official.mjs`）に理由付きで列挙し、ラッパーはそれ以外の findings でだけ fail する。新しい warning が増えたときに落ちる回帰ゲートである。
- GitHub Actions runner に `claude` CLI は入っていないため、CI job には追加していない。CLI が無い環境では SKIP して exit 0 になるので、どこから呼んでも安全である。
- 受容中の warning は次の 2 件である。

| warning                                                         | 受容理由                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Unknown field 'composerIcon'`                                  | Codex bundle 契約が必須とするフィールドで、`checkCrossManifestParity` が両 manifest の一致を強制する。Claude Code は無視するだけである |
| `CLAUDE.md at the plugin root is not loaded as project context` | ルート `CLAUDE.md` はリポジトリ自身の agent instructions であり配布 context ではない。validator に除外機構が無い                       |

`commands/` 直下の `*.md` は README も含めて公式 validator にコマンドとして走査されるため、旧 `commands/README.md` は [`distributed-commands.md`](./distributed-commands.md) へ移設した。`commands/` にはコマンド本体だけを置く。

## 関連

- `scripts/validate-plugin-manifest.mjs`（`plugin:validate`）
- `scripts/validate-plugin-official.mjs`（`plugin:validate:official`・公式 CLI ラッパー）
- `scripts/sync-plugin-fields.mjs`（`plugin:sync` / `plugin:sync:check`）
- CLAUDE.md「AI Misoperation Guards」>「Plugin bundle mirror」
- `release-please-config.json` の `extra-files`（version bump は release-please が両 manifest へ反映）
- `pages/guides/add-new-skill.md`（skill 本体の作成手順）
