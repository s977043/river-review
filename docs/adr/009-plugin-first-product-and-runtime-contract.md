# ADR-009: Plugin-first Product Boundary—Runtime Adapter と Review Judgment の分離

## Status

Accepted—#2012（親 Epic #2011）で、River Review の第一級配布面を Claude Code / Codex Plugin として固定し、Runtime Adapter が Review Judgment を再定義しない不変条件を記録します。本 ADR が扱うのは配布境界と不変条件の宣言までです。検査スクリプトの実装、および Flow / Agent / Execution Manifest の schema は含みません。検査は #2027（PR #2050）で実装済みであり、D7 が未決として残した点の決着は D7 節末尾の「後日追記」に記録しています（#2059）。

## Context

### 現在の配布資産（実測）

正本の manifest は [`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json) と [`.codex-plugin/plugin.json`](../../.codex-plugin/plugin.json) の 2 つです。両者が宣言する資産は同一ではありません。

| 宣言            | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json`                               |
| --------------- | ---------------------------- | --------------------------------------------------------- |
| `skills`        | `./skills/agent-skills/`     | `./skills/agent-skills/`（同一値）                        |
| `commands`      | `./commands/*.md` 7 本       | 宣言なし                                                  |
| `agents`        | `./agents/river-review.md`   | 宣言なし                                                  |
| icon            | `composerIcon`               | `interface.composerIcon`（同一値）                        |
| host 固有の表示 | なし                         | `interface`（displayName / category / capabilities ほか） |

2 つの manifest が参照する実体パスは `commands/` `agents/` `skills/agent-skills/` `assets/` の 4 系統です。`.claude/**` または `.codex/**` を指す参照は 1 件もありません（両ファイルの全文読み取りによる実測）。

### すでに機械検証されているもの

[`scripts/validate-plugin-manifest.mjs`](../../scripts/validate-plugin-manifest.mjs)（`npm run plugin:validate`）は次を検査します。

- 2 つの manifest の `version` が `package.json` と一致すること（`validatePluginManifest`）
- `.claude-plugin` 側の参照パスが実在すること（`validatePluginManifest`）
- 2 つの manifest 間の parity 6 組。`skills` / `repository` / `displayName` / `composerIcon` / `homepage` / `author.name` が対象である（`checkCrossManifestParity`）
- `commands/` と `agents/` に置いた資産が manifest へ登録済みであること（逆方向ドリフト検査 `checkAssetRegistration`）

一方で「host 固有ディレクトリを配布資産として参照しない」および「host 固有ファイルへ Review Judgment を複製しない」を検査する仕組みは、同スクリプトに存在しません。

### 先行する決定との関係

- #1045 は CLI-first アーキテクチャを導入した。その内容は [`docs/CLI-architecture.md`](../CLI-architecture.md) の「Thin adapter 原則」節へ落ちており、同節は「正規実行面はメイン CLI（`src/cli.mjs`）である」と書いている
- #1446 は 2 つの事実を記録している。npm 未公開ゆえ `npx river-review` が原理的に失敗すること、および CLI 抜きで `review-team` skill の手順をエージェントが直接実行して設計どおりの出力へ到達したことである。[`README.md`](../../README.md) `:86` も配布 2 チャネルと npm 非公開を宣言している
- ADR-006（[`006-model-aware-review-prompt-compiler.md`](./006-model-aware-review-prompt-compiler.md)）は「Model Profile は Review Judgment を変更してはならない」を不変条件として置いている

この 3 つの間に矛盾はありません。ただし、配布面の優先順位を明示した文書がありません。[`docs/CLI-architecture.md`](../CLI-architecture.md) の「Thin adapter 原則」`:67` は plugin を「CLI（または同一の skill 定義）を呼ぶ薄い層」と書いており、CLI 非依存の plugin 実行を排除していません。不足しているのは矛盾の解消ではなく、優先順位の明示です。

## Decision

### D1—配布面の優先順位を固定する

River Review の第一級の利用面かつ配布境界は Plugin とします。

| 順位 | 配布面                     | 位置づけ                                   | 利用者にとっての必須性 |
| ---- | -------------------------- | ------------------------------------------ | ---------------------- |
| 1    | Claude Code / Codex Plugin | end-user distribution / primary UX         | 必須                   |
| 2    | GitHub Actions             | CI integration                             | CI 利用時のみ必須      |
| 3    | repository-local CLI       | contributor / 決定論の accelerator / debug | 必須ではない           |
| 4    | MCP / shell                | optional integration                       | 必須ではない           |

npm 公開は前提にしません。この点は `README.md` `:86` の既存宣言を変更しません。

### D2—CLI は共通実行エンジンであり、利用者の必須依存ではない

本 ADR は #1045 を取り消しません。CLI-first が支配するのは「実行面が判断ロジックを持たない」という adapter 設計であり、「利用者がまず CLI を導入する」という配布順ではありません。読み替えは次のとおりです。

| 論点                 | #1045 系の既存記述               | 本 ADR での読み替え                                                  |
| -------------------- | -------------------------------- | -------------------------------------------------------------------- |
| 判断ロジックの置き場 | CLI 側に置き、adapter は薄くする | 維持する。同じ制約が Plugin adapter へも及ぶ                         |
| 「正規実行面」の語   | メイン CLI                       | 自動化経路（GitHub Actions）における正規実行面と読む                 |
| 利用者の導線         | CLI 呼び出しを第一候補とする     | Plugin 経由の skill 実行を第一候補とする。#1446 の実測経路に合わせる |

したがって #1045 と #1446 は矛盾しません。両者は別の軸（判断の置き場と配布の順序）を規定しており、本 ADR がその軸の違いを明示します。

### D3—Runtime Adapter Invariants

> Runtime Adapter may change invocation mechanics, but MUST NOT redefine Review Judgment.

Review Judgment に属し、adapter 側へ複製してはならない対象は次のとおりです。

- skill の判断基準
- どの skill が選ばれるか（skill 選択）。ADR-006 [`006-model-aware-review-prompt-compiler.md`](./006-model-aware-review-prompt-compiler.md) `:61` が Model Profile の非改変対象として明記している
- severity の語彙と対応関係
- gate / decision の意味
- completion の意味
- human boundary（人間が保持する権限）
- finding に要求する証跡

invocation mechanics に属し、adapter が変えてよい対象は次のとおりです。

- 起動方法（slash command / native subagent / エージェントによる直接実行）
- 表示メタデータ
- host 固有の権限宣言
- ファイル入出力の経路

不変条件は 4 つとし、いずれも述語の形で書きます。

| ID   | 述語                                                                                                                                              | 現在の検証手段                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RA-1 | `.claude/**` / `.codex/**` / 2 つの plugin manifest は、Review Judgment の正本を定義しない                                                        | 実装済み（active）。`checkReviewJudgmentDuplication`（`scripts/validate-plugin-manifest.mjs`）。検出範囲と棚卸しは [`ra1-runtime-adapter-inventory.md`](../development/ra1-runtime-adapter-inventory.md)（#2027） |
| RA-2 | manifest が参照する実体パスは host 非依存のトップレベル（`commands/` `agents/` `skills/` `assets/`）に限り、`.claude/**` / `.codex/**` を含まない | 実装済み（active）。`checkManifestHostIndependentRefs`（`scripts/validate-plugin-manifest.mjs`）（#2027）                                                                                                         |
| RA-3 | 2 つの manifest の `skills` は同一パスを指す                                                                                                      | 実装済み。`checkCrossManifestParity`（`scripts/validate-plugin-manifest.mjs`）                                                                                                                                    |
| RA-4 | 2 つの manifest の `version` は `package.json` と一致する                                                                                         | 実装済み。`validate-plugin-manifest.mjs` の `validatePluginManifest`（2 つの manifest それぞれで `package.json` の `version` と突き合わせる）                                                                     |

RA-1 と RA-2 を検査へ落とす際の述語は、次の 3 要素で定義します。実装は本 ADR の範囲外です。

1. 対象パス集合—`.claude/**`、`.codex/**`、`.claude-plugin/*.json`、`.codex-plugin/*.json`。列挙は `git ls-files` 基準で行い、gitignore 済みの worktree コピー（`.claude/worktrees/**`）を含めない
2. 禁止パターン集合—severity 語彙の対応表、gate / decision の判定条件、completion の判定条件、finding の証跡要件の定義
3. 除外条件—同一ファイル内に SSoT（[`pages/reference/review-policy.md`](../../pages/reference/review-policy.md) / [`docs/review/output-format.md`](../review/output-format.md) / `skills/**` / `src/lib/**`）への参照を持ち、かつ複製された定義が参照先へ逐語で存在する派生記述。逐語一致が取れない複製は違反として扱う

項番 1 で `git ls-files` を基準にするのは、worktree のフルコピーが `.claude/` 配下に置かれるためです。`find .claude -name '*.md'` は本体チェックアウトで 4753 件を返しますが、`git ls-files '.claude/**/*.md'` は 37 件を返します（2026-09-03 実測）。

項番 3 が参照の有無だけを見ると、参照先に存在しない判断内容まで除外されます。実例として [`.claude/rules/review-core.md`](../../.claude/rules/review-core.md) `:21`〜`:23` は severity の対応表を持ちます。しかし同ファイルが宣言する SSoT 3 本に `blocker` は 1 件も現れません。実測では `grep -c blocker pages/reference/review-policy.md docs/review/output-format.md docs/review/viewpoints.md` がいずれも 0 を返します。逐語一致まで求めるのはこのためです。

判定不能な場合は違反として扱います。本リポジトリの fail-safe は目立つ側へ倒す方針であり、ADR-008 が severity 不明を major へ倒す既存実装を根拠として記録しています。

### D4—資産の配置規則

| 分類                     | 置き場所                                                                                 | 配布対象   | Review Judgment の正本 |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------- | ---------------------- |
| runtime-independent 資産 | `skills/**` `commands/**` `agents/**` `schemas/**` `docs/review/**` `pages/reference/**` | 参照される | 持つ                   |
| 判断ロジックの実装       | `src/lib/**`                                                                             | 配布しない | 持つ                   |
| adapter 資産             | `.claude-plugin/*.json` `.codex-plugin/*.json`                                           | 配布される | 持たない               |
| host-local 開発設定      | `.claude/**` `.codex/**`                                                                 | 配布しない | 持たない               |

adapter 資産が持ってよいのは宣言と表示だけです。host-local 開発設定は派生記述のみを置き、SSoT への参照を伴わせます。

`src/lib/**` を正本の側へ並べているのは、散文ドキュメントだけでは正本が閉じないためです。severity の内部語彙 `blocker` / `warning` / `nit` を列挙した散文ドキュメントは、`docs/review/**` と `pages/reference/**` のどちらにも存在しません。実体は [`src/lib/finding-factory.mjs`](../../src/lib/finding-factory.mjs) `:8` の `FINDING_SEVERITIES` と、同ファイル `:373` `normalizeSeverity` が出力スキーマへ写す対応にあたります。したがって severity 語彙の正本は `src/lib/**` にあります。`docs/review/**` と `pages/reference/**` はその説明を担います。

### D5—host-specific fallback

Codex 側の manifest は `commands` と `agents` を宣言しません（Context の実測）。そのため Claude Code の slash command と native subagent は Codex では解決しません。fallback は次の順で定義します。

1. host が command / agent の primitive を持つ場合、それを adapter として使う
2. 持たない場合、エージェントが対応する skill の手順を直接実行する（#1446 が実測した経路）
3. どちらも取れない場合、repository-local CLI（contributor 経路）へ退避する

fallback が変えるのは起動経路だけです。選ばれる skill、severity、gate、completion の判定は 3 経路で同一でなければなりません。

### D6—version pinning と互換性

- plugin の version は `package.json` の version と同値とし、更新主体は release-please だけとする。[`scripts/sync-plugin-fields.mjs`](../../scripts/sync-plugin-fields.mjs) `:9` は version を同期対象から明示的に外し、一致の検査は `validate-plugin-manifest.mjs` が担う
- 互換性の単位は skill の id と version であり、adapter の version ではない。adapter だけの変更（表示メタデータ、host 固有の宣言）は Review Judgment の互換性へ影響しない。逆に `skills/**` の判断基準の変更は、adapter を変更しなくても互換性へ影響する
- host 側の設定によっては配布物の自動更新が働かない。版ズレを疑う場合の診断手順は [`docs/runbook/plugin-cache-purge.md`](../runbook/plugin-cache-purge.md) に従う

### D7—既存 manifest からの移行方針

本 ADR の規則へすでに適合しているのは 2 つの manifest に限った話であり、RA-1 全体の適合を意味しません。manifest 側のフィールドの書き換えは不要です。移行として残るのは次の 4 点です。

1. RA-1 と RA-2 の検査を `scripts/validate-plugin-manifest.mjs` へ追加する。本 ADR では実装しない
2. [`.claude/rules/review-core.md`](../../.claude/rules/review-core.md)（40 行）の扱いを固定する。同ファイルは severity の対応表を持ち、冒頭で SSoT 3 本を参照しており、manifest からも参照されないため配布対象ではない。ただし D3-3 の逐語一致まで見ると、参照先 3 本に `blocker` が現れないため除外条件を満たさない。対応表の出典へ `src/lib/finding-factory.mjs` を加えるか、対応表そのものを落とすかは、RA-1 実装時に決める
3. `docs/CLI-architecture.md` の「Thin adapter 原則」節から本 ADR を参照し、「正規実行面」の語が自動化経路を指すことを読者が辿れるようにする
4. `.claude/commands/**` の棚卸し。RA-1 の対象は `git ls-files '.claude/**/*.md'` 基準で 37 件ある。本 ADR が扱ったのは項番 2 の `review-core.md` 1 件だけである。たとえば [`.claude/commands/merge-check.md`](../../.claude/commands/merge-check.md) は `:156` と `:162` で MERGE_OK / BLOCKED の判定条件を定義している。これは D3 が禁じる「gate / decision の判定条件」に当たる。同ファイルが宣言する SSoT は `docs/governance.md`（`:9`）である。これを D3-3 の除外 SSoT 一覧へ加えるか否かは未決とし、RA-1 実装時に決める。したがって RA-1 の検査を実装した時点で、`.claude/commands/**` から既存違反が出る見込みである

#### 後日追記—#2027（PR #2050）で決まったこと

上の 4 点は本 ADR の時点の記録であり、項番 2 と項番 4 は未決のまま残していました。RA-1 の検査を実装した #2027 で次のように決まりました。決定時点の記録を保つため、上の本文は書き換えません。

- 項番 2 は「対応表を残し、出典へ `src/lib/finding-factory.mjs` を足す」で決着した。D3-3 の除外条件はこれで成立する
- 項番 4 の `.claude/commands/**` は、既存違反の発生源としては解消した。変えたのは `gate-decision-condition` 規則が verdict とみなす語彙であり、製品の gate 語彙（`src/lib/gate-decision.mjs` の `GATE_DECISIONS`）へ限定した
- **対象パス集合は変えていない。** `.claude/**` は `RA1_TARGET_PATHSPECS` に残っており、`.claude/commands/**` のファイルが製品の gate 語彙を D3-3 の出典なしで定義すれば、今も違反になる
- `merge-check.md` の `MERGE_OK` / `BLOCKED` が判定するのはリポジトリの作業手順であり、レビューではない。製品の gate 語彙とは名前空間が異なるという読みによる
- したがって項番 4 末尾の「既存違反が出る見込み」は実現しなかった。2026-09-04 の実測で `.claude/commands/**` の違反は 0 件である

判断の根拠と実測は [`ra1-runtime-adapter-inventory.md`](../development/ra1-runtime-adapter-inventory.md) の「決定 1」節に記録しています。

## Non-goals

- Plugin runtime そのものの書き換え
- host ごとの Skill fork
- npm 公開
- Flow / Agent / Execution Manifest の schema 定義と実装。これは #2013 / #2014 / #2015 の責務である
- RA-1 と RA-2 の検査スクリプトの実装
- 既存 manifest のフィールド追加と削除
- CLI の廃止、および `docs/CLI-architecture.md` が記録する 2 系統 CLI の統合

## Consequences

- 配布面の優先順位が 1 か所で決まる。skill / command の案内文を「CLI をまず入れる」導線へ戻す余地が減る
- Codex 側で slash command と native subagent が解決しない事実を、欠陥ではなく fallback の対象として扱える
- RA-1 と RA-2 の担保は当面レビューに依存する。宣言だけでは機械的に守られないため、検査を追加するまでは違反の入り込む余地が残る
- adapter 資産へ判断を足したくなった場合の昇格先が明確になる。昇格先は `skills/**`、`schemas/**`、SSoT ドキュメントのいずれかであり、host 固有ファイルではない
- 本 ADR は利用者から見た挙動を変えない。manifest と skill のどちらも変更しないため、リリース時の互換性へ影響しない

### 再参入条件

D1 の優先順位は、次のいずれかが成立した時点で再検討します。

1. npm 公開を行う方針転換があること。この場合、配布面の順位と「必須性」の列が変わる
2. host 側の primitive が変わり、D5 の fallback 3 段のいずれかが恒常的に到達不能になること

## 関連

- #2011—Plugin-first Continuous Review Protocol（親 Epic。本 ADR は Phase 1 にあたる）
- #2012—本 ADR の起票元
- #1045—CLI-first architecture / common execution surface
- #1446—Plugin 配布と CLI 非依存のエージェント実行
- ADR-006—Model-Aware Review Prompt Compiler（Review Judgment を変えない不変条件の先例）
- ADR-008—`actionability` 軸の吸収（fail-safe を目立つ側へ倒す方針の出典）
