# External listing candidates

River Review の外部流入を増やすため、関連する awesome 系・curated list への掲載候補と、各リストの掲載条件・PR 方針・紹介文を整理します。

> 親エピック: [#1276](https://github.com/s977043/river-review/issues/1276) / 追跡 Issue: [#1283](https://github.com/s977043/river-review/issues/1283)

掲載申請では River Review を一般的な AI review bot ではなく、`Review Judgment as Code` / `team-owned audit layer` として説明します。誇張表現・自動承認/自動マージの強調は避けます。

## 紹介文（共通コピー）

英語（1 行・非宣伝的トーン）:

```text
River Review — Review Judgment as Code for AI-assisted development. Lets teams codify review standards as repo-owned skills and run them across plans, diffs, tests, JUnit, and prior review artifacts.
```

短縮版（リスト用 1 行説明）:

```text
Codify team review judgment as repo-owned skills; run them as GitHub Action / plan-diff-test gates.
```

## 候補リストと掲載条件

各リストの条件は申請時に最新の CONTRIBUTING / PR テンプレートで再確認すること（掲載ルールは変わりうる）。

### 優先度: 高

| リスト                | repo                                                                                                | 掲載方法                                                                                                      | 主な条件                                                                                                                                                                                                        | River Review の適合                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| awesome-codex-plugins | [hashgraph-online/awesome-codex-plugins](https://github.com/hashgraph-online/awesome-codex-plugins) | スキャナCIを自リポに追加 → ローカル実行 → fork して README にアルファベット順 1 行追加（PR 説明にスコア記載） | スキャナスコア 80/130 以上・critical/high なし、`.codex-plugin/plugin.json`（name/version/description/repository/license/composerIcon）、512×512 アイコン、SECURITY.md / LICENSE / README.md、1 PR 1 プラグイン | **掲載済み（live）**—upstream の `main` に `plugins/s977043/river-review` として反映済み。外部からの提案もあった |
| awesome-code-review   | [joho/awesome-code-review](https://github.com/joho/awesome-code-review)                             | `Tools` セクションへ PR                                                                                       | アルファベット順、説明は**非宣伝的**で簡潔・末尾に句読点、新カテゴリは 3 件以上、CoC 同意                                                                                                                       | Good — コードレビューツールそのもの。GitHub/Gerrit 等と並ぶ。説明は中立トーン必須                                |
| awesome-actions       | [sdras/awesome-actions](https://github.com/sdras/awesome-actions)                                   | 該当カテゴリ末尾へ PR                                                                                         | 意味のある PR タイトル（"Update readme" は却下）、1 PR 1 提案、1 行説明（3 行に折り返さない）、Title Case、重複不可                                                                                             | Good — GitHub Action として配布しており直球で適合                                                                |

### 優先度: 中

| リスト              | repo                                                                                  | 掲載方法                                                     | 主な条件                                                                                                                                         | River Review の適合                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| awesome-ai-devtools | [jamesmurdza/awesome-ai-devtools](https://github.com/jamesmurdza/awesome-ai-devtools) | `PR & Code Review Bots` カテゴリへ PR（PR テンプレート準拠） | フォーマット詳細は PR テンプレートを要確認                                                                                                       | Good — CodeRabbit / Qodo / Greptile と同カテゴリ。`awesome-developer-tools` には単一の正本が存在しないため、本リストを代替候補とする                             |
| awesome-ai-agents   | [e2b-dev/awesome-ai-agents](https://github.com/e2b-dev/awesome-ai-agents)             | README へ PR（CONTRIBUTING なし、ルールは README 内）        | 「**自律 AI エージェント**で動く企業・プロジェクト」のみ。アルファベット順・正カテゴリ。フレームワーク/SDK は姉妹リスト `awesome-ai-sdks` へ誘導 | Marginal — River Review はレビューフレームワーク/Action でありエージェント製品ではない。掲載は「agentic reviewer」として慎重に位置づけた場合のみ。優先度は下げる |

### 対象外（適合せず）

| リスト                          | repo                                                                              | 理由                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| awesome-llm-apps                | [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | リンク集ではなく、実行可能なオリジナルアプリの monorepo。単なる掲載は不可で、専用テンプレアプリの実装が必要なため River Review の性質と合わない |
| awesome-developer-tools（汎称） | 単一の正本なし                                                                    | 同名の競合リストが複数存在し正本を特定できない。代わりに `awesome-ai-devtools` を狙う                                                           |

## 申請優先順位

1. **awesome-codex-plugins**—✅ **掲載済み（live on `main`）**。同梱プラグインと manifest が揃っており、外部からの提案もあった
2. **awesome-actions**—GitHub Action として直球で適合。⏳ 提出済み・マージ待ち（[#829](https://github.com/sdras/awesome-actions/pull/829)）
3. **awesome-code-review**—ドメイン一致。非宣伝的な説明文を用意。⏳ 提出済み・マージ待ち（[#131](https://github.com/joho/awesome-code-review/pull/131)）
4. **awesome-ai-devtools**—PR & Code Review Bots カテゴリ。⏳ 提出済み・マージ待ち（[#697](https://github.com/jamesmurdza/awesome-ai-devtools/pull/697)）
5. **awesome-ai-agents**—位置づけを慎重に検討（優先度低）。未提出

> 提出済み PR の一覧と状態は下記「提出状況（トラッキング）」を参照。

## 提出状況（トラッキング）

各リストへの提出 PR と、その時点の状態。状態は変わりうるため、確認時は各 PR / upstream の `main` を直接参照すること（最終確認: 2026-07-05）。

| リスト                | 提出 PR                                                                    | 状態                          | 備考                                                                                      |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| awesome-codex-plugins | [#229](https://github.com/hashgraph-online/awesome-codex-plugins/pull/229) | ✅ 掲載済み（live on `main`） | PR は GitHub 上 CLOSED だが maintainer が別経路で `main` へ反映。掲載成立                 |
| awesome-actions       | [#829](https://github.com/sdras/awesome-actions/pull/829)                  | ⏳ Open・マージ待ち           | 2026-06-24 提出。mergeable、修正すべき CI 失敗なし（`UNSTABLE` は upstream 側の良性状態） |
| awesome-code-review   | [#131](https://github.com/joho/awesome-code-review/pull/131)               | ⏳ Open・マージ待ち           | 2026-06-24 提出。mergeable、レビュー未着                                                  |
| awesome-ai-devtools   | [#697](https://github.com/jamesmurdza/awesome-ai-devtools/pull/697)        | ⏳ Open・マージ待ち           | 2026-06-24 提出（旧 #696 は差し替えのため CLOSED）。mergeable、レビュー未着               |
| awesome-ai-agents     | —                                                                          | 未提出                        | Marginal 適合のため優先度低（下記参照）                                                   |
| awesome-claude-code   | —                                                                          | 未提出（ドラフト準備済み）    | **issue フォーム提出**（PR 不可）。適合 Good。下記ドラフト参照                            |
| AlternativeTo         | —                                                                          | 未提出（ドラフト準備済み）    | **Web フォーム提出**（PR なし）。新規アカウントは作成後約1週間の待機が必要。下記参照      |
| awesome-devsecops     | —                                                                          | 未提出（ドラフト準備済み）    | fork+PR。**maintained な TaptuIT/awesome-devsecops** を対象（本家は放置）。適合 Marginal  |

## 提出材料ドラフト

各リストの実際の README / CONTRIBUTING を確認して作成したコピペ用ドラフト。提出方法はリストごとに異なる（fork+PR / issue フォーム / Web フォーム）ため各ドラフト冒頭の「提出方法」に従う。外部リポジトリ・サービスへの操作はリポジトリ管理者が実施する。提出直前に各リストの規約が変わっていないか再確認すること。提出済み PR の状態は上記「提出状況（トラッキング）」を参照。

### awesome-actions（sdras/awesome-actions）

- 追記先: `### Pull Requests` セクションの**末尾**。
- 規約: Title Case、1 行（3 行に折り返さない）、太字/斜体なし、重複確認、PR タイトルは具体的に、コミット本文にリポジトリ URL を含める。

追記する 1 行:

```md
- [River Review](https://github.com/s977043/river-review) - Review pull requests against your team's versioned, repo-owned review skills across plans, diffs, and tests.
```

PR タイトル: `Add River Review to Pull Requests`

PR / コミット本文:

```text
Adds River Review to the Pull Requests section.

River Review is a GitHub Action that runs a team's review standards as
versioned, repo-owned skills across plans, diffs, tests, and prior reviews.
Human-in-the-loop, not auto-merge.

Repository: https://github.com/s977043/river-review
```

### awesome-code-review（joho/awesome-code-review）

- 追記先: `## Tools` セクション。**アルファベット順**で `Review Board` と `Sider` の間。
- 規約: 1 リンク、リンクテキストはツール名、説明はリンクの後に同一行で句読点終わり、**非宣伝的**トーン。

追記する 1 行:

```md
- [River Review](https://github.com/s977043/river-review) Open source framework that runs review standards as versioned, repo-owned skills across plans, diffs, tests, and prior reviews.
```

PR タイトル: `Add River Review to Tools`

### awesome-ai-devtools（jamesmurdza/awesome-ai-devtools）

- 追記先: `### PR & Code Review Bots` セクションの**末尾**（このリストは投稿順）。
- 規約: `[Name](link)` の後ろにダッシュ区切りで説明文を続ける形式（下記コードブロックの実エントリを参照）。既存の crit / PR Triage と同様、human-in-the-loop / OSS を明示すると差別化が伝わる。

追記する 1 行:

```md
- [River Review](https://github.com/s977043/river-review) — Open source, team-owned review layer: codify review judgment as repo-owned skills and run them across plans, diffs, tests, and prior reviews. Human-in-the-loop, not auto-merge.
```

PR タイトル: `Add River Review to PR & Code Review Bots`

### awesome-claude-code（hesreallyhim/awesome-claude-code）

- **提出方法**: **GitHub issue フォームのみ**（[recommend-resource テンプレート](https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml)）。**PR を開かない・`gh` CLI も使わない**（CONTRIBUTING が明記、違反すると一時的な interaction 制限のリスク）。ボットがフォームを検証し、リンク先リポジトリの LICENSE を自動判定する（品質は人間が選別）。
- 規約: 説明は宣伝でなく事実ベース（読者に呼びかけない）・1〜3 文・10〜500 文字・絵文字なし。README エントリは受理後に `generate_readme.py` が自動生成する。カテゴリは固定 16 択のドロップダウン。同カテゴリ内はアルファベット順。
- 適合: **Good**（River Review は実際に Claude Code プラグイン）。
- カテゴリ（推奨）: `Infrastructure & DevOps`（旧「Plugins / Subagents」等のセクションは廃止され話題別に再編済み）。

フォーム記入値（コピペ用）:

```text
Display Name: River Review
Category: Infrastructure & DevOps
Link: https://github.com/s977043/river-review
Author Name: s977043
Author Link: https://github.com/s977043
Description: A "Review Judgment as Code" framework: teams codify their code-review standards as versioned, repo-owned SKILL.md skills and run them over plans, diffs, tests, JUnit, and prior review artifacts. Ships as a Claude Code plugin — a skill-routed review agent plus /river-review:<skill> commands — and as a GitHub Action, keeping humans in the loop rather than auto-merging.
Checklist: 3 項目すべてチェック（未掲載 / リンク有効 / Claude Code 固有）
```

> 注意: 説明は「Claude Code 固有」チェックを満たすため Claude Code を前面に出している（Codex プラグイン・CLI は意図的に控えめ）。author 表示は repo owner の `s977043`（manifest 上は "river-review maintainers"、好みで変更可）。提出前に GitHub サイドバーが `MIT` を表示するか確認する（`LICENSE-CODE` / `LICENSE-CONTENT` が併存するため）。

### AlternativeTo（alternativeto.net）

- **提出方法**: **Web フォームのみ**（PR なし）。サインイン → 右上ユーザーアイコン → "Suggest new application" のウィザード。Step 2 の App Store 取り込みは **SKIP**。全提出は公開前に管理者承認（数日〜1 週間）。
- 規約: **新規アカウントは作成後 約1週間の待機後**に新規アプリ提出可（スパム対策）。プロフィールでの宣伝は禁止（正規の "Add a new application" フローを使う。自作 OSS の自己提出は可）。必須項目: Name / Platforms / License / Description / Tags。
- 適合: **Good**。「alternative to」関係はページ作成後に各対象ツール（CodeRabbit / Qodo / Greptile / Codacy）のページから別途追加し、コミュニティ投票で確定する。

フォーム記入値（コピペ用。レビュー指摘を反映済み: SAST 誤認を招く `static-code-analysis` タグは除外し、比較的な表現を中立化した）:

```text
Name: River Review
Website: https://river-review.the3396.com/
Source code: https://github.com/s977043/river-review
License: Open Source — MIT
Pricing: Free / Open Source
Platforms: Mac, Windows, Linux, Self-Hosted, Node.JS（GitHub Action / Claude Code・Codex プラグインは説明文で補足）
Tags: ai, code-review, ai-code-review, developer-tools, continuous-integration, git, open-source, pull-requests, llm
Short description: Open-source "Review Judgment as Code" framework: teams codify their review standards as versioned, repo-owned skills and run AI-assisted reviews across plans, diffs, tests, JUnit, and prior review artifacts. Human-in-the-loop, not auto-merge.
Full description: River Review is an open-source (MIT) framework and capability pack for AI-assisted code review. Teams codify their own review standards as versioned, repo-owned SKILL.md skills — covering areas such as security, accessibility, migration safety, dependency policy, and plan conformance — and execute them across software-lifecycle artifacts: implementation plans, diffs, tests, JUnit results, and prior review comments. It ships as a Claude Code / Codex plugin (a skill-routed review agent plus /river-review:<skill> commands, installable via the plugin marketplace) and as a GitHub Action, and can also run headless from a CLI. Reviews are human-in-the-loop by design: it surfaces findings and verdicts, but GO/NO-GO, iteration, and merge decisions stay with the team. It does not auto-merge or replace human reviewers, and it complements — rather than replaces — static analysis.
Alternative to（ページ作成後に各ツールページから追加）: CodeRabbit, Qodo, Greptile, Codacy
```

> 注意: `static-code-analysis` タグは River Review を SAST と誤認させるため**外す**（意味的レビュー/ポリシーゲート層であり静的解析の代替ではない）。Platform enum の正確な名称はサインイン後の実フォームで要確認。

### awesome-devsecops（TaptuIT/awesome-devsecops）

- **提出方法**: **fork + PR**。対象は **[TaptuIT/awesome-devsecops](https://github.com/TaptuIT/awesome-devsecops)**（維持されている fork。1.7k stars、community PR を merge）。**本家 `devsecops/awesome-devsecops` は避ける**（star は多いが 2021 以降コミットなし・stale PR 多数で実質放置）。`readme.md` を `main` で編集。
- 適合: **Marginal**（DevSecOps の shift-left 文脈自体は関連するが、リストは脆弱性検出ツールのカテゴリ構成のため構造的にやや外れる）。提出可否はメンテナ判断。正直に「SAST を置き換えず補完する」と明記する。
- 追記先: `Tools > Static Analysis > Multi-Language Support` に、既存の `RIPS` と `SemGrep` の間へアルファベット順で挿入。

追記する 1 行:

```md
- [River Review](https://github.com/s977043/river-review) - _s977043_ - An open-source "Review Judgment as Code" framework that codifies review standards as versioned, repo-owned skills and runs AI-assisted, human-in-the-loop reviews across plans, diffs, tests and JUnit results. Ships security-review skills and policy gates that complement SAST scanners rather than replacing them.
```

PR タイトル: `Add River Review to the Static Analysis section`

## 注意点

- 各リストの掲載ルールは申請時点の CONTRIBUTING / PR テンプレートで再確認する。
- 説明文は非宣伝的トーンを保ち、OpenSSF / CI / CodeQL などの trust signal は事実ベースで触れる。
- npm 公開を前提にした説明にはしない（[プロジェクト方針](../../pages/guides/quickstart.md)）。
