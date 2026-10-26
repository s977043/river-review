---
id: 'plan-review-gate'
name: 実装計画レビューゲート
description: 実装計画（plan.md / pbi-input.md）に含まれる危険操作・触れてはならないスコープ・人間承認必須条件を検出し、AI 自律実行前のゲートとして機能する
version: 0.2.1
category: upstream
phase: upstream
applyTo:
  - '**/plan.md'
  - '**/pbi-input.md'
tags: [plangate, plan-review, human-approval, safety, upstream, stop-work]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Gate
Why: 実装計画アーティファクトを読み込み、AI が自律実行すべきでない危険操作・スコープ外操作・人間承認必須条件を検出する。問題あり時は実行を止めるゲートとして機能する。

## Goal / 目的

- 実装計画（`plan.md` / `pbi-input.md`）に記載された作業が、AI エージェントが単独で実行してよい範囲に収まっているかを判定する。
- 危険操作、触れてはならないスコープ（Do Not Touch）、人間承認が必要な条件（`human_approval: required`）を早期に検出し、下流フェーズへの誤進入を防ぐ。
- 過実装（over-implementation）および設計書との矛盾を検出し、計画段階での修正機会を提供する。

## Non-goals / 扱わないこと

- 計画アーティファクト間の整合性チェック（`plangate-plan-integrity` の責務）。
- 実装コードそのものの品質レビュー（midstream skill の責務）。
- テストコードの実装妥当性（downstream skill の責務）。
- ビジネス価値や優先度の妥当性判断（人間の責務）。

## 責務分界 / plangate-plan-integrity との違い

| 観点             | plangate-plan-integrity                   | plan-review-gate（本スキル）           |
| ---------------- | ----------------------------------------- | -------------------------------------- |
| 主目的           | PBI / plan / todo / test-cases 間の整合性 | 危険操作・スコープ外・承認必須の検出   |
| 検出対象         | アーティファクト間の矛盾・欠落            | 安全性・権限・影響範囲のリスク         |
| ゲート条件       | plan + 関連 artifact 1 件以上             | plan または pbi-input が存在すれば起動 |
| 人間への引き渡し | 再計画が必要な場合                        | 人間承認必須トリガーを検出した場合     |

## Pre-execution Gate / 実行前ゲート

以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 入力 artifact に `plan.md` または `pbi-input.md` が存在する
- [ ] diff または fullFile のいずれかの inputContext が利用可能である

ゲート不成立時の出力:
`NO_REVIEW: plan-review-gate — plan.md または pbi-input.md が見つからない`

## Rule / ルール

### 1. 危険操作の検出（Stop-work トリガー）

以下のいずれかを計画が含む場合、`human_approval: required` として即座に Stop-work を返す。

- 破壊的コマンド（`rm -rf`, `DROP TABLE`, `kubectl delete` 等）
- 認証情報・シークレットの書き込み・上書き（`credential`, `secret`, `token` の作成・変更）
- 設定ファイルの上書き（`config overwrite`, `overwrite settings`）
- 外部サービスへのポスト・通知（`external posting`, `Slack 送信`, `メール送信`）
- 本番環境デプロイ（`deployment`, `本番 deploy`, `production release`）
- cron / スケジューラ登録（`cron`, `scheduled task`）
- エージェントメモリへの書き込み（`memory write`）
- 課金・請求操作（`billing`）
- プロバイダ変更（`provider change`, `クラウド移行`）
- 認証フロー変更（`auth`, `SSO`, `OAuth` の変更）
- 権限変更（`permission change`, `IAM`, `RBAC` の変更）
- ユーザーデータの処理（`user data`, `PII`, `個人情報`）

### 2. Do Not Touch スコープの検出

計画に「触れてはならない」スコープが明記されている場合、その範囲が本計画のタスクと重複していないか確認する。

- `# Do Not Touch`, `## 変更禁止`, `off-limits` セクションの存在を検出
- そのセクションに列挙されたファイル・モジュール・APIが plan のタスクに含まれていないか照合
- 含まれている場合: `[severity=critical]` で Stop-work を発行

### 3. 過実装（over-implementation）の検出

- plan の Scope / Goals セクションに記載のない機能追加・リファクタリングが含まれていないか
- 受け入れ条件に対してタスクが過剰（スコープクリープ）になっていないか
- Non-goals に記載された項目がタスクに紛れていないか

### 4. 設計書との矛盾の検出

- plan に参照されている設計書（ADR, ERD, interface contract 等）の内容と、タスクの実装方針が明らかに矛盾していないか
- 「TBD」「未決」として保留されている判断に依存するタスクが着手予定になっていないか

### 5. テストギャップの検出

- 計画に実装タスクがあるにも関わらず、対応するテストタスクが計画に含まれていない場合
- 「後で追加」と明記されていない限り、テスト不在は `[severity=major]` として指摘

## Human Approval 判定

Rule 1 の危険操作トリガーが1件以上検出された場合:

- `human_approval: required` を出力に含める
- scoring engine の `humanApprovalRequired=true` フラグに対応する verdict `human-review-required` が返される
- findings の最初に Stop-work 項目を配置する

機械的検出は 2 層で行う（#1348 S1 / Epic #1347）:

- **HIGH confidence（regex 単独で確定）**: 破壊的コマンド・具体的シークレット・日本語危険語に加え、危険語を避けた婉曲表現（「再帰的に整理」「接続情報」「稼働環境へ反映」等）も HIGH として検出する
- **LOW confidence（LLM adjudicator が最終判定）**: `cron` / `webhook` / `auth` 等の文脈依存語。LLM が使える実行パス（`river review exec`）では adjudicator がエスカレーション方向にのみ判定し、LLM 不在時は regex-only mode で従来どおり動作する
- adjudicator は HIGH 判定を覆して緩める方向には決して使われない（非対称エスカレーション）

既知のすり抜けパターン（婉曲表現）と過検出パターンは `fixtures/` の双方向 canary（should_trigger / should_not_trigger）で回帰監視し、pass 率は `tests/plan-review-gate-canary.test.mjs` が機械的に計測する。

## False-positive guards / 抑制条件

- コメント・例示・Non-goals セクションに登場するキーワードは、実際のタスクへの言及でない限り指摘しない。
- テスト計画内の「テスト対象として危険操作を模擬する」記述（`simulate destructive command`）は実際の実行計画ではないため指摘しない。
- `plan.md` のメタデータ（frontmatter）に `human_approval: required` が既に明記されている場合、重複指摘しない（確認済みとみなす）。

## Evidence / 根拠の取り方

- 各指摘は plan.md または pbi-input.md の具体的なセクション・行番号に紐づける（`<file>:<line>: ...` 形式）。
- 「キーワード X が行 N に存在する」のように、**何がどこで検出されたか**を名指しで示す。
- 推測ではなく、計画テキストの実際の記述を根拠にする。

## Output / 出力

すべて日本語。`<file>:<line>: <message>` 形式。

- 先頭に要約を 1 行: `(summary):1: <ゲート判定：PASS（安全）/ STOP（人間承認必須）/ WARN（要注意）>`
- Stop-work の場合: `human_approval: required` をサマリ行の直後に出力
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める
  - 指摘は「何がどの行で検出されたか + なぜ人間承認が必要か」を 1 文で示す
  - 解決アクションを 1 行で併記する

例:

- `(summary):1: STOP — 危険操作が 2 件検出されました。human_approval: required`
- `plan.md:14: [severity=critical] 破壊的コマンド "rm -rf /data" が実行タスクに含まれています。Fix: 計画から除去するか、human_approval: required を明示して人間の確認を得てください。`
- `plan.md:27: [severity=major] 本番 deployment タスクが AI 自律実行フローに含まれています。Fix: deployment ステップを人間操作フローに移動してください。`

## Severity の割り当て方針

- `critical`: Stop-work トリガー（危険操作・Do Not Touch スコープ違反）。
- `major`: 人間承認が推奨される操作（外部通知・設定変更）、過実装、テストギャップ。
- `minor`: Non-goals との微小な重複、用語の不整合。
- `info`: 確認推奨（未決依存タスクの明示、リスク小の外部操作）。

内部語彙との対応は、プロジェクト標準の Severity マッピング（blocker→critical, warning→major, nit→minor）に従う。詳細は `docs/review/output-format.md` を参照。

## Verdict マッピング

| ゲート結果                            | verdict                    |
| ------------------------------------- | -------------------------- |
| 危険操作検出あり（critical 1 件以上） | `human-review-required`    |
| 人間承認推奨（major のみ）            | `human-review-recommended` |
| 問題なし                              | `auto-approve`             |

`humanApprovalRequired=true` フラグが scoring engine に渡されると、スコアに関わらず `human-review-required` が返される。

## Execution Steps / 実行ステップ

1. **Gate**: `plan.md` / `pbi-input.md` が存在するか確認。なければ `NO_REVIEW`。
2. **Scan triggers**: Rule 1 の危険操作パターンを全文スキャン（コメント・Non-goals を除外）。
3. **Do Not Touch check**: 禁止スコープセクションの存在とタスクとの重複を確認。
4. **Scope check**: over-implementation・Non-goals 漏れ・設計書矛盾を確認。
5. **Test gap check**: 実装タスクに対応するテストタスクの有無を確認。
6. **Rank**: critical → major → minor の順に並べる。
7. **Output**: 要約 + 最大 8 件の指摘を日本語で出力。Stop-work 条件を満たす場合は `human_approval: required` を明示。

## 関連ドキュメント

- `docs/review/output-format.md` — severity とコメント形式の SSoT
- `src/lib/plan-review/human-approval-policy.mjs` — 危険操作パターン定義（機械的検出の実装）
- `src/lib/plan-review/llm-adjudicator.mjs` — LOW confidence 候補の LLM 最終判定（エスカレーション専用）
- `fixtures/` — 敵対的（婉曲表現）プランと良性プランの双方向 canary
- `skills/upstream/plangate-plan-integrity/SKILL.md` — 計画整合性チェック（関連スキル）
- `pages/reference/artifact-input-contract.md` — 入力 artifact の契約
