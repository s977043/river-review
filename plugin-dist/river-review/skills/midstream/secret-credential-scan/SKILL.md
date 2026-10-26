---
id: 'secret-credential-scan'
name: 'Secret / Credential Scan 機密情報の混入検出'
description: '差分に追加された API キー・トークン・credential・秘密鍵・.env 値・個人ローカルパスなどの機密情報を、言語・ファイル種別に依存せず検出する。決定論的に判定できる範囲は CI（gitleaks 等）へ移譲しつつ、レビューで取りこぼしを補足する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*'
tags: [secret, credential, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
dependencies: [code_search]
exclude:
  - '**/package-lock.json'
  - '**/pnpm-lock.yaml'
  - '**/yarn.lock'
  - '**/*.lock'
  - 'dist/**'
  - '**/*.min.*'
  - '**/*.map'
  - '**/*.snap'
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 機密情報の検出はパターン的・決定論で判定できる領域が大きく、本来は CI に委ねるべき。一方で CI 未整備のリポジトリや、CI が見ない種別（個人パス・ローカル設定）を補足する補助レビューとして機能する。秘匿情報を含む追加が無ければ実行を止めるゲートが必要。

## Goal / 目的

- 差分へ**新規追加された**機密情報を、言語やファイル種別を問わず検出する。対象は API キー / トークン / credential / 秘密鍵 / `.env` 値 / 個人ローカルパス / ローカル固有設定とする。
- 既存の言語限定 secret チェック（`security-basic` は `.ts/.tsx/.js/.jsx`、`config-json` は `.json/.yml`）が見ない種別・ファイルの取りこぼしを補う。

## Non-goals / 扱わないこと

- アプリコード内の SQLi / XSS など機密以外のセキュリティ（`security-basic` の領域）。
- BaaS のルール/鍵露出（`firebase-security-rules` / `supabase-rls-policy` の領域）。
- 決定論で完全な判定ができる検出を恒久的な肩代わりとすること（本スキルは CI = gitleaks / trufflehog 等の導入を促し、移譲する）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分の**追加行**に、機密情報の候補（高エントロピー文字列・`API_KEY`/`SECRET`/`TOKEN` 等のキー・`-----BEGIN ... PRIVATE KEY-----`・`/Users/` や `/home/`、`C:\Users\` で始まる個人パス・`.env` 実値行）が含まれている
- [ ] inputContext に diff が含まれ、`code_search`（grep）が利用可能である

ゲート不成立時の出力: `NO_REVIEW: secret-credential-scan — 機密情報の候補が差分に検出されない`

## False-positive guards / 抑制条件

- プレースホルダ・例値（`xxx` / `your-api-key` / `dummy` / `example` / `<...>` / `***`）は指摘しない。
- `.env.example` / `.env.sample` / `.env.template` などサンプルファイルの**プレースホルダ**は指摘しない（実値が入っていれば指摘する）。
- テストフィクスチャ・ドキュメントの**明らかな擬似値**は指摘しない。実在しうる形式（本物の鍵長・接頭辞 `sk-` / `ghp_` / `AKIA` 等）の場合のみ指摘する。
- 既に環境変数参照（`process.env.X` / `os.environ[...]`）に置き換わっている場合は指摘しない。
- 既存行（差分の文脈行）にあるだけで追加・変更されていない機密は対象外（追加・変更行のみ）。

## Rule / ルール

### 検出ロジック

1. **候補抽出**: 差分の追加行から次の機密候補を抽出する。
   - 鍵名（`API_KEY`/`SECRET`/`TOKEN`/`PASSWORD`/`CREDENTIAL`）への実値代入
   - 既知接頭辞（`sk-`/`ghp_`/`AKIA`/`AIza` 等）や `-----BEGIN ... PRIVATE KEY-----`
   - 高エントロピー文字列、個人パス（`/Users/<name>/`、`/home/<name>/`、`C:\Users\<name>\`）、実値入り `.env` 行
2. **実値判定**: プレースホルダ・例値・環境変数参照を `code_search` で確認して除外し、実在しうる値のみ残す。
3. **報告**: 該当箇所を `<file>:<line>` で示し、機密の種別と推奨対応（環境変数 / Secrets への移動、コミット履歴からの除去、CI secret-scan の導入）を述べる。値そのものは出力に再掲しない（マスクする）。

### 制約

- 検出は最大 5 件。実害の大きいもの（本物の鍵・credential）を優先する。
- 各指摘に「種別」「混入箇所」「推奨対応」を必ず含める。
- 機密の値そのものは出力へ再掲せず、種別と位置のみ示す。
- 決定論で完全に検出できる範囲は「CI（gitleaks 等）での恒久ガードを推奨」と必ず併記する。

## Evidence / 根拠の取り方

- 混入箇所は必ず `<file>:<line>` に紐づけ、推測で「秘密だ」と断定しない。
- プレースホルダか実値かの判定根拠（接頭辞・鍵長・形式）を具体的に示す。

## Output / 出力フォーマット

すべて日本語。

```text
(secret-scan):1: [要約] 最も重大な機密混入は〈1文〉

<file>:<line>: [機密混入1] <タイトル>
  種別: <API キー / トークン / 秘密鍵 / credential / 個人パス / .env 実値>
  混入: <どこに何が追加されたか（値はマスク）>(<file>:<line>)
  影響: <漏洩リスク / 権限奪取 / 環境依存の壊れ>
  Fix: <環境変数・Secrets への移動／履歴からの除去／CI secret-scan(gitleaks 等) の導入>
```

## 評価指標（Evaluation）

- 合格基準: 実在しうる機密のみを `<file>:<line>` で示し、プレースホルダ・例値・環境変数参照を誤検出していない。値を再掲していない。
- 不合格基準: プレースホルダへの誤検出、既存行への指摘、値の再掲、機密と無関係な高エントロピー文字列（ハッシュ・UUID）への難癖。

## 人間に返す条件（Human Handoff）

- 検出値が実在の機密と擬似値のどちらなのか、コードからは断定できない場合。
- 既にコミット済みの機密について、履歴除去・鍵ローテーションの要否が運用判断を要する場合。
