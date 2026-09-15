# Roadmap: River Review

## Vision

レビューを、組織の判断資産へ。

現在の River Review は、チームのレビュー判断を versioned / repo-owned な Skill として運用する **Review Judgment Platform**（チーム所有の監査レイヤー）に位置づける。長期の拡張方向として、レビュー以外の判断職務へ広げる **Engineering Judgment Infrastructure** を置く。ただしこれは将来の到達点であり、現在の看板として使わない。

AI が人間の可読量を超えるコードを生成できる時代において、River Review は生成コードの全行確認ではなく、信頼できるソフトウェアを生む開発フロー全体をレビュー対象にする。Artifact Review の姿勢を、次のフレーズで表す。

> Review the Flow, Not Just the Code.

語彙は Tagline / Core Mechanism / Current Product / Long-term Direction の 4 層に分ける。定義の SSoT は [コンセプト](https://river-review.the3396.com/explanation/concept/) にある。

## Strategy

"Metadata First"—すべてのレビューロジック、設定、そして戦略自体を構造化データ（Markdown + Frontmatter）として管理し、決定論的な制御と自律的な改善を実現する。

- **Flow-based**: フェーズ別（upstream/midstream/downstream）のスキルで、開発フローに寄り添う非ブロッキングなレビューを行う。
- **Metadata-first**: YAML frontmatter + Markdown を「スキル」とし、`schemas/skill.schema.json` で厳格に定義・検証する。
- **Automation-ready**: GitHub Actions など CI/CD から容易に呼び出せるランナーとルーティング層を用意する。
- **Harness-first**: テスト、型、Lint、静的解析、セキュリティチェックなどの検証ハーネスを品質保証の中心に置く。
- **Risk-based HITL**: 人間レビューは全行確認ではなく、認証・認可、決済、データ削除、大規模リファクタなど高リスク変更へ集中させる。

## Phase 0: Branding & Foundation (完了)

- [x] River Review へのリブランディング（README/用語集/スキーマ説明）
- [x] ディレクトリ整備：`skills/{upstream,midstream,downstream}`、`schemas/`、`docs/`、`assets/`
- [x] スキルメタデータ JSON Schema (`schemas/skill.schema.json`)
- [x] ブートストラップスクリプト（`scripts/setup_river_review.sh`—#1824 で DEPRECATED。追跡ファイルを上書きするため実行しないこと。2026-11-12 以降に削除予定）とリファクタスクリプト（`scripts/rr_validate_skills.py`）
- [x] 最小 GitHub Actions ワークフロー雛形 (`.github/workflows/river-review.yml`)
- Exit Criteria: 達成（基本ドキュメントとスキーマ/スクリプトが揃い、新規スキル追加の足場がある）。

## Phase 1: Skill Migration & Coverage

- [x] スキル定義を `skills/**/*.md` に集約（YAML frontmatter をスキーマ準拠で付与）
- [x] ID プレフィックスを `rr-` に正規化
- [x] Upstream/Midstream/Downstream それぞれに本番想定スキルを追加（設計ガードレール、実装レビュー、QA/回帰確認など）
- [x] Quality/Domain タグ付け（例: `performance`, `security`, `reliability`）
- Exit Criteria: 各フェーズに少なくとも1つ以上の本番想定スキルが配置され、スキーマ検証を通過する。

## Phase 2: Loader & Runner (Phase-aware Routing)

- [x] `skills/**/*.md` を再帰的に読み込み、`phase` でフィルタ可能なローダーを実装（`RIVER_PHASE` / `--phase` 対応）
- [x] スキルメタデータの JSON Schema バリデーションを Runner に組み込み（Ajv）
- [x] GitHub Actions/CLI ラッパーを整備し、midstream をデフォルトにフェーズ切替を可能にする
- [x] Stream Router の下地として、変更ファイルのグロブと `applyTo` の突合を追加
- Exit Criteria: フェーズ指定でスキルを実行でき、メタデータのバリデーションを通過したものだけが走る。

### 次の具体タスク案（Phase 3 着手用）

- [ ] ゴールデンケース（差分・期待出力）を fixtures として追加し、回帰を検知できるテストを追加
- [ ] スキルごとの失敗パス（コンテキスト不足/依存不足）をテストで検知
- [ ] Evals/回帰テストを CI へ組み込み、スキル変更時に必ず実行
- [ ] Harness Assessment Skill を追加し、テスト/型/Lint/静的解析/セキュリティチェックの有無を評価
- [ ] Human Escalation Skill を追加し、高リスク変更を人間レビューへエスカレーション

## Phase 3: Reliability & Evals

- [ ] Prompt/Evals 環境の整備（例: Promptfoo）とゴールデンケースの準備
- [ ] スキルごとの「検出すべき/避けるべき」テストケースを追加し、回帰を検知
- [ ] CI にスキル回帰テストを組み込み、失敗時はブロック
- [ ] 検証ハーネスの充足度を評価する Harness Assessment Skill を導入
- [ ] 認証・認可、決済、データ削除、アーキテクチャ変更などを Human Escalation 対象として定義
- Exit Criteria: スキル変更で自動評価が走り、デグレを防止できる。加えて、高リスク変更は自動的に人間レビューへ誘導される。

## Phase 4: Riverbed Memory & Intelligence

- [x] Riverbed Memory の設計（ADR/WontFix/過去指摘の永続化と再利用） — v1 実装済み（#474）。`src/lib/riverbed-memory.mjs` / `schemas/riverbed-entry.schema.json` / `.github/workflows/riverbed-persist.yml`。v2（外部データストア連携）は将来計画
- [ ] セマンティック/コンテキストルーティング（PR タイトル/差分/依存関係を考慮） — **部分実装**。差分ベースの mode 選択は `src/lib/review-mode-router.mjs`（#1323、Slice 1+2）で実装済みだが、入力は `changedFiles` / `diffText` / `riskMap` に限られ、**PR タイトルと依存関係は考慮していない**。「セマンティック」に相当する LLM による diff 内容分析は同設計書で明示的に非ゴール
- [x] 抑止・再提示の仕組み（抑制した指摘の再浮上条件を定義） — 実装済み（#687）。`src/lib/suppression.mjs` / `src/lib/suppression-apply.mjs`。`river suppression add` で抑止し、`--expires` を付けるとその日時以降に抑制が外れて再浮上する
- [ ] Review Philosophy Skill を追加し、「Review the System, Not Every Line」を River Review の判断原則として形式知化 — 未着手。`skills/` 配下に該当 skill は無く、この文言は本ファイルにのみ存在する
- [ ] Riverbed Memory にレビュー思想、検証ハーネス、エスカレーション判断の履歴を蓄積し、継続的改善へ接続 — 上記「Review Philosophy Skill」が未着手のため、蓄積対象の一部が存在しない
- Exit Criteria: コンテキストに応じたスキル選択が行われ、不要実行が削減される。さらに、過去の判断とレビュー思想を再利用して、AI 開発フロー全体の信頼性を高められる。

## GitHub Projects 推奨フィールド

- **Phase (Single Select)**: Phase 0〜4（上記に対応）
- **Component (Single Select)**: Schema / Loader / Runner / Skills / Evals / Memory / Harness / Governance
- **View 例**:
  - Roadmap View: Target Date × Phase のタイムライン
  - Kanban View: Status 別の進行管理

この構成で、フェーズ別の進捗とコンポーネント別の責務を可視化し、River Review の流れに沿った開発管理を行う。

---

## Milestones（v0.1 / v0.2 / v0.3 / v1.0）

本リポジトリでは、Phase 0〜4 の方向性を維持しつつ、外部利用者に分かりやすい Milestone（SemVer）で進行を管理します。

- `v0.1.0 – Public Ready`（Phase 2〜3 の“外部利用”を安定させる）
- `v0.2.0 – Developer Experience`（導入/トラブルシュート/拡張を軽くする）
- `v0.3.0 – Smart Reviewer`（評価基盤 + “賢さ 1 点突破”）
- `v1.0.0 – Community Edition`（互換性/安定 I/F/運用の固定）

具体的な 1〜2 週間粒度のバックログ（Issue にコピペ可能）は `docs/implementation-plan.md` にまとめます。

## Related Issues

- #819 AI時代のレビュー思想をRiver Reviewへ取り込む
