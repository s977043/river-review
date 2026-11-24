# スキル構造設計書

> **内部資料:** Issue #310の設計メモです。スキル仕様の公開リファレンスは [`pages/reference/skill-schema-reference.md`](../pages/reference/skill-schema-reference.md) を参照してください。

Issue #310: 目標ディレクトリ構造・粒度の決定（入口 + 専門）

---

## 現状の構造

```text
skills/
├── upstream/      # 49 スキル（設計・アーキテクチャレビュー）
├── midstream/     # 61 スキル（コード・実装レビュー）
├── downstream/    # 9 スキル（テスト・QAレビュー）
├── registry.yaml  # スキル登録
└── _template.md   # スキルテンプレート
```

## registry.yaml エントリの description

`registry.yaml` の各エントリが持つ `description` は、adopter がカタログを見るための短い要約です。英語や短縮表現で書いてよく、対応する SKILL.md frontmatter の `description` と文言を一致させる必要はありません。

frontmatter の `description` は、レビュー実行時にプランナーや LLM が参照する詳細記述であり、こちらが実行時の SSoT です。registry のカタログ要約とは役割が異なります。

両者の文言差は意図的な役割分担であり、ドリフトとして機械的に揃える対象ではありません。ただし同一言語かつ同一意図のまま字句だけがずれた場合は、要約としての簡潔さを保ちつつ frontmatter 側の最新の意図を反映するように整えます。

## loose / strict 二重 schema の契約

`scripts/validate-agent-skills.mjs` は agent-skill の SKILL.md frontmatter を 2 段階の JSON Schema で検証します。役割は次のとおりです。

| Schema                                  | 役割                                                        | additionalProperties              |
| --------------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| `schemas/agent-skill-loose.schema.json` | 外部 Agent Skills 仕様の受け入れフロント                    | `true`（未知フィールドを許容）    |
| `schemas/skill.schema.json`             | ランタイムの権威。`loadAllSkillMetadata()` がこれで検証する | `false`（未定義フィールドを拒否） |

- **strict schema がランタイムの権威である。** loose schema を通過しても、strict schema に定義のないフィールドがあると `loadAllSkillMetadata()` 読み込み時にバリデーションエラーとなる。未定義フィールドだけが読み飛ばされるのではなく、そのスキル（frontmatter）全体がロード対象から脱落する点に注意する。
- **loose schema は外部 Agent Skills 仕様の受け入れフロントである。** `name` / `description` の最小要件のみを課し、それ以外の未知フィールドを許容する。これは外部ツール（agentskills.io / Warp / Oz / Claude Code 等）が発行する SKILL.md を広く受け入れるための設計であり、ランタイムでの利用を保証するものではない。
- **両者に差分が生まれ、あるフィールドが実行時にも本当に必要だと判明した場合は、strict schema（`schemas/skill.schema.json`）側に定義を追加するのが正しい対応である。** `applyToExemptions`（#1508）はこの経路で追加された実例である。loose schema だけを通り strict schema で弾かれるフィールドは設計上の意図どおりの挙動であり、loose 側を緩めて合わせる対応は誤りとする。

### 脱落事故の教訓（#1559）

`applyToExemptions` フィールドが strict schema に未定義のまま導入され、loose schema のみを通過する状態になっていた。そのため、当該フィールドを持つスキルが `loadAllSkillMetadata()` から**エラーなくサイレントに**脱落していた。CI の loose 検証は green のまま気づかれず、実行時にのみ影響が出る典型的な drift だった。

再発防止として `scripts/validate-agent-skills.mjs` に `validateStrictSchemaDrift()` ガードを追加した。このガードは `loadSkillMetadata()` と同じローダー経路（strict schema 検証込み）を、CI で全 agent-skill に対して強制実行する。`agent` タグ付きスキルは `excludedTags` によるランタイム側の意図的な除外のため、この検証の対象外とする。

### 検証コマンド

```bash
npm run agent-skills:validate
```

このスクリプトは loose 検証・`applyTo` カバレッジ検証・strict drift ガードを一括で実行します。drift ガードが失敗した場合は「loose は通るが strict で落ちる」フィールドがあることを意味するため、strict schema にフィールド定義を追加するか、フィールド自体の要否を見直してください。

## 現在の構造

### Agent Skills 形式（実装済み）

```text
skills/
├── agent-skills/                    # Agent Skills 公式仕様準拠
│   ├── river-review/              # 入口スキル（ルーター）
│   │   ├── SKILL.md
│   │   └── references/
│   ├── river-review-security/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── river-review-architecture/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── river-review-code/
│   ├── river-review-performance/
│   ├── river-review-testing/
│   └── adversarial-review/
├── upstream/                        # 従来形式（移行元）
├── midstream/                       # 従来形式（移行元）
└── downstream/                      # 従来形式（移行元）
```

---

## 入口スキル: `river-review`

### 役割

- **ルーター**: 入力に応じて適切な専門スキルへ案内
- **分類基準**: フェーズ（upstream/midstream/downstream）と観点（security/performance 等）
- **Progressive Disclosure**: 詳細は専門スキルに委譲

### SKILL.md 骨格

```yaml
---
name: river-review
description: River Review のメインエントリポイント。レビュー依頼を適切な専門スキルへルーティングする。
---
```

### 導線定義

| 入力キーワード         | 導線先スキル                |
| ---------------------- | --------------------------- |
| 設計、アーキ、ADR      | `river-review-architecture` |
| セキュリティ、脆弱性   | `river-review-security`     |
| パフォーマンス、最適化 | `river-review-performance`  |
| テスト、カバレッジ     | `river-review-testing`      |
| （上記以外）           | `river-review-code`         |

> **デフォルト動作**: キーワードがどれにも当てはまらない場合は `river-review-code`（一般コードレビュー）にフォールバックする。これにより、すべてのレビュー依頼が適切に処理される。

---

## 専門スキル群

### 命名規則

```text
river-review-<domain>
```

- `domain`: 観点を表すケバブケース（例: `security`, `architecture`, `testing`）

### 推奨専門スキル

| スキル名                    | 担当フェーズ       | 説明                         |
| --------------------------- | ------------------ | ---------------------------- |
| `river-review-architecture` | upstream           | 設計・アーキテクチャレビュー |
| `river-review-security`     | upstream/midstream | セキュリティ観点レビュー     |
| `river-review-api`          | upstream           | API 設計・契約レビュー       |
| `river-review-code`         | midstream          | 一般コード品質レビュー       |
| `river-review-testing`      | downstream         | テスト観点レビュー           |

---

## 責務分担

| 配置場所      | 内容                                                 |
| ------------- | ---------------------------------------------------- |
| `SKILL.md`    | 手順骨格、トリガー条件、出力フォーマット（短く保つ） |
| `references/` | チェックリスト、具体例、詳細説明                     |
| `scripts/`    | 自動化スクリプト（必要に応じて）                     |
| `assets/`     | 図表など（必要に応じて）                             |

---

## 行数ガイドライン

- **SKILL.md**: 推奨 100行以下、上限 200行
- **references/**: 制限なし（詳細はここに集約）

---

## 移行方針

1. **Phase 1**: 入口スキル `river-review` を作成（**完了**）
2. **Phase 2**: 高優先度の専門スキルを作成（security / architecture / code / performance / testing / adversarial-review）（**完了**）
3. **Phase 3**: 従来スキルの内容を専門スキルへ統合
4. **Phase 4**: 従来スキルを deprecated 化

### Phase 4: Deprecated 化の具体的手順

1. `registry.yaml` で従来スキルに `deprecated: true` フラグを設定
2. 各スキルファイルの冒頭に deprecation 警告を追記
3. ドキュメント（README, CONTRIBUTING）に移行先を明記
4. 3ヶ月の猶予期間後、次のメジャーバージョンで従来スキルを削除

---

## 次のアクション

- [x] `skills/agent-skills/` ディレクトリを作成
- [x] 入口スキル `river-review` を作成
- [x] テンプレート（#311）を使用して専門スキルを追加（Issue #310, #311 CLOSED）

---

## Per-Skill Eval Fixture Convention

スキルごとの回帰テスト用フィクスチャの配置ルール。

### ディレクトリ構造

```text
skills/<phase>/<skillId>/
├── eval/
│   └── promptfoo.yaml    # promptfoo 設定（テスト定義）
├── fixtures/
│   ├── 01-<name>-happy.md      # 検出すべき diff（happy path）
│   └── 02-<name>-false-positive.md  # 誤検知すべきでない diff（guard）
└── golden/
    └── 01-<name>-happy.md      # 期待する出力（similarity チェック用）
```

### 最小フィクスチャ要件

各スキルに最低 2 つのテストケースが必要:

1. **Happy path** (`01-*-happy.md`): スキルが問題を検出すべき diff
2. **False-positive guard** (`02-*-false-positive.md`): スキルが誤検知してはならない diff

### フィクスチャファイル形式

```markdown
# Test Case: <タイトル>

## Description

テストの目的

## Input Diff

\`\`\`diff
(実際の git diff 形式)
\`\`\`

## Expected Behavior

- 検出 / 非検出の期待値を箇条書きで記述
```

### Golden ファイル形式

```markdown
# Expected Output: <タイトル>

**Finding:** <問題の概要>
**Evidence:** <証拠コード>
**Impact:** <影響>
**Fix:** <修正案>
**Severity:** major|minor|critical|info
**Confidence:** high|medium|low
```

### promptfoo.yaml のアサーション型

| アサーション型 | 用途                                                     |
| -------------- | -------------------------------------------------------- |
| `llm-rubric`   | LLM による意味的な合否判定（主観的な基準）               |
| `contains`     | 必須文字列が含まれるか                                   |
| `not-contains` | false-positive guard（誤検知がないか）                   |
| `similar`      | golden ファイルとのコサイン類似度（threshold: 0.7 推奨） |

### ローカル実行

```bash
cd skills/<phase>/<skillId>/eval
promptfoo eval
```

### CI での位置づけ（マージゲートではない）

`.github/workflows/skill-eval.yml`（ワークフロー名 `Skill Evaluation`）は `eval/promptfoo.yaml` のあるスキルを自動検出し、PR で起動します。ただしマージのゲートではありません。理由は 2 つあります。

1. `Skill Evaluation` は main ブランチの必須ステータスチェックに含まれない（必須は下記 7 件）
2. API キーを repo secret に登録していないため、アサーション実行 step は skip され、設定検証まで縮退する

2 について、skip されるのは `Run evaluation` と `Check must_include assertions` です。残るのは `Validate config (no API keys)` であり、`promptfoo.yaml` の YAML 構文と参照ファイルの存在だけを確認します。`continue-on-error: false` が効くのはこの縮退後の step までです。

必須ステータスチェックは `gh api repos/:owner/:repo/branches/main/protection --jq '.required_status_checks.checks[].context'` で取得できます。

```text
Lint
Unit tests (22.x)
Skill schema validation
Meta consistency
Action dist freshness
Integration (CLI)
Blocked label guard
```

LLM ベースの eval（promptfoo）は、API キーを持つ環境での手動・任意実行という位置づけです。手順は [`docs/runbook/community-skill-eval.md`](./runbook/community-skill-eval.md) を参照してください。

### 実際のマージゲート

スキル品質を機械的に守るのは、決定論的な検証です。必須チェック `Skill schema validation` から `npm run skills:validate`（`scripts/validate-skills.mjs`）が実行され、次を検証します。

- recommended skill が `eval/` または `fixtures/` を持つこと（`GRANDFATHERED_WITHOUT_EVAL` の免除分は除く）
- fixture へ埋め込んだ `<!-- expected: -->` ブロックと SKILL.md の Check 見出しが整合すること（fixture drift）
- registry のパスと ID、pack 定義、命名衝突

PR #1826 では upstream 5 スキルの免除を外しました。対象から `fixtures/` を削除すると、`npm run skills:validate` は exit 1 で失敗します。対象は `adr-decision-quality` / `api-design` / `api-versioning-compat` / `architecture-boundaries` / `failure-modes-observability` の 5 件です。

まとめると、決定論的な検証がメインのゲートであり、LLM eval はオプションです。
