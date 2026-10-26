---
id: 'doc-hygiene'
name: 'Documentation Hygiene ドキュメント衛生'
description: 'AGENTS.md などの恒久ドキュメントに一過性のタスクログが混入していないか、SOP / decision / log / learned の役割が混同されていないか、公開物（README / docs / 記事）に内部メモ・ローカルパス・AI 会話断片が残っていないかを差分で検出する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.md'
  - '**/*.mdx'
tags: [documentation, hygiene, maintainability, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: ドキュメントの役割汚染・内部メモ混入はパターン的に拾える部分が多いが、恒久 SOP と一過性ログのどちらなのかという文書の意図の判断が要る。ドキュメント差分を含まない変更では実行を止めるゲートが必要。

## Goal / 目的

- 恒久ドキュメント（`AGENTS.md` / SOP / ガイド）に、**一過性のタスクログ・特定 PR 固有の作業記録**が混入していないかを検出する。
- **SOP / decision / log / learned** の役割が混同されていないか（手順書に決定記録や日次ログを混ぜるなど）を検出する。
- 公開物（README / docs / 記事）に、**内部メモ・ローカルパス・AI との会話断片・デバッグ出力**が残っていないかを検出する。

## Non-goals / 扱わないこと

- ドキュメントと実装の整合性（`river-review-docs` ルーターの領域）。
- 日本語の文体・textlint 的な体裁（lint の領域）。
- 翻訳パリティ（ja/en の対応漏れは docs 系の別観点）。
- 記事そのものの技術的正しさや SEO（article-reviewer の領域）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分に**ドキュメントファイル**（`*.md` / `*.mdx` / `AGENTS.md` など、恒久ドキュメントまたは公開物）の追加・変更が含まれている
- [ ] inputContext に diff が含まれ、`code_search`（grep）が利用可能である

ゲート不成立時の出力: `NO_REVIEW: doc-hygiene — ドキュメントの変更が検出されない`

## False-positive guards / 抑制条件

- 一過性ログを**意図的に置く場所**（`CHANGELOG.md` / `docs/**/retrospectives/**` / `_docs/decisions/**` / 日付付きログファイル）への追記は、その役割に沿う限り指摘しない。
- 手順書内のコマンド例・出力例として**意図的に引用されたログ**は指摘しない（地の文に紛れ込んだ作業ログのみ対象）。
- ローカルパスでも、汎用的な例示（`/path/to/...`、`~/project`）は指摘しない。実在の個人パス（`/Users/<name>/`、`/home/<name>/`、`C:\Users\<name>\`）のみ対象。
- 内部向けと明記されたドキュメント（先頭に「内部資料」等の宣言がある）への内部メモは、公開物でない限り指摘しない。
- **リンクの絶対/相対はリンク元の配布文脈で正誤が逆転するため、一律の変換提案はしない**（#1464 / #1493）。`pages/`（Docusaurus 公開ルート）配下から repo 内の非公開領域（`skills/` / `docs/` など Docusaurus で配信されないパス）への参照は、絶対 GitHub URL が正典であり、相対化すると公開サイトで 404 になる。逆に `skills/` 配下（plugin バンドルに `docs/` が同梱される）から `docs/` への参照は相対リンクが正典（#1494）。相対化・絶対化のどちらを提案する前にも、**リンク元ディレクトリの配布経路**（Docusaurus 公開 or plugin バンドル同梱）を確認し、「repo 内リンクは常に相対化すべき」という一律ルールを適用しない。
- **`[#N](URL)` を bare `#N` へ簡約する提案はしない**（#1464）。bare `#N` の自動リンクは GitHub の issue / PR 本文だけの仕様であり、レンダリングされた `.md`（Docusaurus / GitHub のファイルビュー）ではプレーンテキストになるため、一律で簡約の提案を禁止する。
- **SKILL.md 内の severity 内部語彙（`blocker` / `warning` / `nit`）を出力スキーマ語彙（`critical` / `major` / `minor`）へ統一する提案はしない**（#1502）。`.claude/rules/review-core.md`「Severityの語彙マッピング」が定義するとおり、SKILL.md（LLM プロンプト向け内部語彙）と出力 JSON スキーマ（正規化後語彙）は意図的に異なるボキャブラリを使う二層構造であり、写像は既に規約として定義済み。両者の語彙差を「表記揺れ」と誤認し、どちらか一方に統一する提案をしない。

## Rule / ルール

### 検出ロジック

1. **役割の特定**: 変更されたドキュメントが恒久ドキュメント（SOP / ガイド / `AGENTS.md`）か、公開物（README / docs / 記事）か、ログ用（CHANGELOG / retrospective）かを判定する。
2. **混入の検出**:
   - 恒久ドキュメントへの一過性タスクログ・特定 PR 固有記述の追記
   - SOP に decision/log/learned を混ぜる役割混同
   - 公開物への内部メモ・実在の個人ローカルパス・AI 会話断片（「ユーザー:」「アシスタント:」「以下を実行します」等の対話痕跡）・デバッグ出力の残存
3. **報告**: 該当箇所を `<file>:<line>` で示し、本来あるべき置き場所（別ファイル・別セクション）または除去を提案する。

### 制約

- 検出は最大 5 件。公開物への内部情報漏洩・恒久ドキュメントの役割汚染など影響の大きいものを優先する。
- 各指摘に「混入の種別」「あるべき置き場所 / 除去」を必ず含める。
- 役割の判断が曖昧な場合は断定せず `questions` で確認する。

## Evidence / 根拠の取り方

- 混入箇所は必ず `<file>:<line>` に紐づけ、推測で「ログのようだ」と述べない。
- 「このファイルは恒久ドキュメント / 公開物であり、ここに一過性ログ / 内部メモが入っている」と役割と混入を対比して具体的に示す。

## Output / 出力フォーマット

すべて日本語。

```text
(doc-hygiene):1: [要約] 最も重大なドキュメント衛生の問題は〈1文〉

<file>:<line>: [衛生1] <タイトル>
  種別: <一過性ログ混入 / 役割混同 / 内部メモ残存 / 個人パス / AI会話断片>
  混入: <恒久ドキュメント・公開物に何が入っているか>(<file>:<line>)
  影響: <内部情報の公開漏洩 / ドキュメントの陳腐化・役割崩壊>
  Fix: <あるべき置き場所（別ファイル・別セクション）への移動、または除去>
```

## 評価指標（Evaluation）

- 合格基準: 恒久ドキュメント・公開物への混入を `<file>:<line>` で示し、あるべき置き場所を具体的に提案している。意図的なログ置き場への追記を誤検出していない。
- 不合格基準: CHANGELOG/retrospective への正当な追記を誤検出する、汎用例示パスを使った難癖、文体・翻訳・実装整合まで越境した指摘。

## 人間に返す条件（Human Handoff）

- ドキュメントが恒久（SOP）か一過性（ログ）かの役割が、文面からは判断できない場合。
- 内部メモを公開物に意図的に残しているか（テンプレート等）の判断が必要な場合。
