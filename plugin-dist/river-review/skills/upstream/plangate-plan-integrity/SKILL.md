---
id: 'plangate-plan-integrity'
name: PlanGate 計画整合性チェック
description: pbi-input, plan, todo, test-cases 間の整合性をチェックし、実装着手前の仕様漏れを検知する
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/pbi-input.md'
  - '**/plan.md'
  - '**/todo.md'
  - '**/test-cases.md'
tags: [plangate, planning, integrity, traceability, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: PlanGate の計画成果物（pbi-input / plan / todo / test-cases）を横断的に突き合わせて整合性の欠落を指摘し、不足時は実行を止めるゲートとして機能する。

## Goal / 目的

- PlanGate が生成する計画アーティファクト間の整合性の欠落（PBI と計画の不一致、受け入れ条件とテストケースの抜け、TODO と計画のズレ）を実装着手前に検出する。
- 下流（midstream/downstream）の skill が健全な計画を前提に動けるよう、計画側の穴を早期に可視化する。

## Non-goals / 扱わないこと

- 実装コードそのものの品質レビュー（midstream skill の責務）。
- テストコードの実装妥当性（downstream skill の責務）。
- PBI の事業価値や優先度の妥当性判断（人間の責務）。
- PlanGate 固有のディレクトリ構成や内部コマンドへの依存判定（`pages/reference/artifact-input-contract.md` に従い artifact-driven で判断）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 入力 artifact に `plan` が存在する（`pages/reference/artifact-input-contract.md` の ID に準拠）
- [ ] 入力 artifact に `pbi-input` / `todo` / `test-cases` のいずれか1つ以上が存在する
- [ ] 差分または fullFile のいずれかの inputContext が利用可能である

ゲート不成立時の出力: `NO_REVIEW: plangate-plan-integrity — 計画アーティファクト（plan + 関連1つ以上）が揃っていない`

**Gateと抑制条件の違い:**

- Gate = 計画成果物が揃わなければ整合性判定は不可能なので実行しない。
- 抑制条件 = 実行した上で個別の指摘を抑える。

## False-positive guards / 抑制条件

- `plan` が "TBD" / "未決" として未決事項を明示的に宣言している項目は、欠落ではなく「未決の明示」として扱い指摘しない。
- `todo` / `test-cases` に「次フェーズで追記」と期限付きで明記されたスコープ外項目は指摘しない。
- PlanGate 外のワークフローで任意 artifact を省略している場合、欠損そのものを blocker とせず `artifact-input-contract.md` の「欠損時」挙動に従う。

## Rule / ルール

計画アーティファクトを以下の観点で突き合わせる。1観点=1指摘が目安。

### 1. PBI ↔ plan の整合

- `pbi-input` の目的・対象ユーザー・受け入れ条件が `plan` に反映されているか。
- `plan` の作業範囲が `pbi-input` のスコープを逸脱または不足していないか。
- `pbi-input` に書かれた制約（非機能要件、依存、期限）が `plan` で考慮されているか。

### 2. plan ↔ todo の整合

- `plan` の設計判断・タスクが `todo` にタスク分解されているか。
- `todo` に `plan` に無いタスクが紛れ込んでいないか（スコープクリープ）。
- 依存順序・マイルストーンが矛盾していないか。

### 3. 受け入れ条件 ↔ test-cases の覆域

- `pbi-input` / `plan` の受け入れ条件（Given-When-Then 等）が `test-cases` にカバーされているか。
- 正常系だけでなく代表的な異常系（権限なし / 入力不備 / データなし / タイムアウト / 競合）が `test-cases` に含まれているか。
- `test-cases` に受け入れ条件と紐づかない過剰なケースが含まれていないか。

### 4. 未決事項の明示

- `plan` / `todo` / `test-cases` のいずれかに未決事項がある場合、決定者・期限・判断材料が書かれているか。

## Evidence / 根拠の取り方

- 各指摘は具体的な artifact とセクションに紐づける（`<file>:<line>: ...` 形式で、可能なら見出し引用を付ける）。
- 「受け入れ条件 A が test-cases に欠けている」のように、**どの項目がどこに無いか**を名指しで示す。
- 推測ではなく、参照した artifact の記述（または欠落）を根拠にする。

## Output / 出力

すべて日本語。`<file>:<line>: <message>` 形式。

- 先頭に要約を 1 行: `(summary):1: <計画整合性の総評：健全 / 部分的な抜け / 致命的ギャップ>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 指摘は「どの artifact の何が、どの artifact に対して整合しないか」を1文で示す。
  - 追記/修正の最小アクションを1行で併記する。

例:

- `(summary):1: plan と pbi-input の目的は一致。受け入れ条件1件が test-cases に未反映。`
- `test-cases.md:1: [severity=major] pbi-input の受け入れ条件「権限なしユーザーが操作すると 403 を返す」が test-cases に未登録。Fix: 異常系ケース「権限なし→403」を追加。`
- `todo.md:12: [severity=minor] plan に無い「UI アニメーション改善」タスクが todo に混入（スコープ外）。Fix: plan に追記するか todo から除去。`

## Severity の割り当て方針

- `critical`: 受け入れ条件の中核が `plan` / `test-cases` に完全に欠落し、実装すると仕様不一致が確定する場合。
- `major`: 主要な受け入れ条件や異常系1件以上のカバレッジ欠落、plan と todo の大きな不整合。
- `minor`: 用語の揺れ、スコープの微小なズレ、未決事項の決定者/期限の不備。
- `info`: 記述の補足推奨（未決であることが明示されている等）。

内部語彙との対応は、プロジェクト標準の Severity マッピング（blocker→critical, warning→major, nit→minor, info→info）に従う。詳細は `docs/review/output-format.md`（severity の SSoT）を参照。

## Heuristics / 判定の手がかり

- `pbi-input` / `plan` に箇条書きで列挙された受け入れ条件と、`test-cases` の見出し数の差。
- `plan` の「タスク」「作業項目」セクションと `todo` のチェックボックス行の対応。
- `TBD` / `未定` / `?` / `TODO` などの未決マーカーに決定者・期限が併記されているか。
- `pbi-input` の「対象外」「Non-goals」記述が `plan` / `todo` に流れているか。

## 評価指標（Evaluation）

- 合格基準: 指摘が artifact の具体的セクションに紐づき、欠落/不整合の対象と追記アクションが明示されている。
- 不合格基準: 差分外の一般論、artifact に存在しない項目の推測、抑制条件の無視、「受け入れ条件が足りない」のみの漠然指摘。

## 人間に返す条件（Human Handoff）

- ビジネス判断（優先順位/範囲/コスト）や PBI の妥当性そのものに踏み込む必要がある場合。
- 計画アーティファクトが大幅に不足しており、整合性判定以前の問題として再計画が必要と判断される場合（`questions` として返す）。
- PlanGate 以外のワークフローで意図的に一部 artifact を省略している兆候がある場合（誤判定を避けるため人間確認）。

## Execution Steps / 実行ステップ

1. **Gate**: 必要 artifact が揃っているか確認。不足なら `NO_REVIEW`。
2. **Extract**: `pbi-input` / `plan` / `todo` / `test-cases` から目的・受け入れ条件・タスク・テストケースを抽出。
3. **Cross-check**: 上記 Rule の 4 観点で突き合わせ、欠落/不整合を列挙。
4. **Rank**: 受け入れ条件の中核に近いほど高 severity に並べる。
5. **Output**: 要約 + 最大 8 件の指摘を日本語で出力。Human Handoff 条件を評価して該当時は `questions` で返す。

## 関連ドキュメント

- `pages/reference/artifact-input-contract.md` — 入力 artifact の契約（ID / 形式 / 欠損時挙動）
- `docs/review/output-format.md` — severity とコメント形式の SSoT
