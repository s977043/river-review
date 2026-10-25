---
id: 'assumption-resolution-trace'
name: 'Assumption Resolution Trace Plan の前提解消トレーサビリティ'
description: 'plan artifact がある時のみ、plan 中の assumption / open question が実装で解消された証拠を diff・PR 本文と突合する evidence-sufficiency 観点。解消されないまま残った前提・未記録の新規 Unknown を検出する。plan 欠損時は発火しない（Pre-execution Gate）。plan 欠損でも PR 本文に前提が inline 列挙されていれば列挙分のみ部分評価し、計画 issue の bare 参照だけなら skip する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
  - 'runners/**/*.{ts,js,mjs}'
  - 'scripts/**/*.mjs'
  - '**/migrations/**'
  - '**/*.sql'
tags:
  [
    assumption-resolution-trace,
    evidence-sufficiency,
    plan-traceability,
    assumption,
    open-question,
    unknown-coverage,
    midstream,
  ]
severity: major
inputContext: [diff, fullFile, prDescription, reviewSelf]
outputKind: [findings, questions, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: plan の assumption と diff の突合は artifact 参照による決定論的照合が主だが、plan artifact が無い変更では実行を止めるゲートが必要。

## Goal / 目的

`plan` artifact が存在するとき、その plan に記録された **assumption（前提）/ open question（未解決の問い）** が実装で解消された証拠を、diff・PR 本文と突合する。evidence-sufficiency の観点であり、plan の設計妥当性そのものは問わない。

1. **Assumption 解消の突合**: plan の各 assumption に対し、それが実装で確認・解消された証拠（該当コード・テスト・PR 本文の言及）が残っているか。
2. **Open question 解消の突合**: plan の各 open question に対し、diff・PR 本文に回答（解消 or 明示的な繰り越し）があるか。
3. **新規 Unknown の記録**: 実装中に新たに判明した前提・制約が、plan・PR 本文・コメントに記録された証拠があるか。

既定 CI レビューでは自動発火しない（`/challenge` 等の明示呼び出し向け）。

## Non-goals / 扱わないこと

- **plan の設計妥当性の判断**（assumption 自体が妥当かは問わない）。本 skill は「解消された証拠が残っているか」だけを見る。
- **plan artifact が無いときの評価**。plan 欠損時は発火しない（Pre-execution Gate）。PlanGate #810 の unknown ledger など専用 artifact が将来入力に載る場合も、その受け取りは `plan` 経由の同じ artifact-driven パターンに従う。
- **plan / assumption 整合そのものの検証**（pbi / plan / todo の整合は `plangate-plan-integrity`、W チェックの再点検は `plangate-verification-audit` へ委譲）。本 skill は「解消の証拠不在」だけを扱い、重複指摘しない。
- **全 Unknown カテゴリの横断合成**は agent-skill `unknown-coverage-review`（観点6 Plan / Assumption Traceability）が担う。本 skill はその観点6 を registry として plan 保有時に単独実行する版であり、合成層はその findings を残余に取り込む。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。**plan の有無を最初に判定する**。

- [ ] inputContext に `diff` が含まれている。
- [ ] **`plan` artifact が存在する**、または PR 本文に assumption / open question が inline で列挙されている（下記「plan 欠損時の扱い」を適用）。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定・レビュー対象から除外する。

### plan 欠損時の扱い（T41 改善提案2）

`plan` artifact が無いときの分岐を次のとおり一意に定める。

- **plan artifact あり** → 全評価（assumption / open question / 新規 Unknown 記録の突合）。
- **plan artifact 無し・PR 本文に assumption / open question が inline 列挙されている** → **列挙された項目のみ部分評価**する（例: PR 本文に「前提: X が Y であること」等が具体的に書かれている場合）。評価対象を PR 本文に inline された項目に限定し、外部 issue の内容は取得・推測しない。出力に `partialEvaluation: true` と評価対象の出所を明記する。
- **plan artifact 無し・PR 本文に計画 issue の bare 参照（`#NNNN` のみ）しかない** → **skip**（`NO_REVIEW`）。bare 参照は plan artifact ではなく、外部 issue 本文を取得・推測して評価しない。`skippedSkills` に `{ id: 'assumption-resolution-trace', reasons: ['plan artifact missing; only a bare plan-issue reference'] }` 相当を記録し、解消には plan artifact か PR 本文への前提 inline 化が必要である旨を残す。

ゲート不成立時の出力: `NO_REVIEW: assumption-resolution-trace — plan artifact も inline 列挙された前提も存在しない`

## False-positive guards / 抑制条件

- finding の `file:line` は差分内にアンカーする。plan 側の参照は plan artifact の該当箇所を引用する。差分外の推測に基づく指摘は question とする。
- 「assumption が解消された証拠が別ファイル・既存テスト・PR 本文に存在する可能性」を Grep / Glob / artifact 参照で棄却できた場合のみ finding 化する。棄却できなければ question とする。
- plan / plan 整合の検証（`plangate-plan-integrity` / `plangate-verification-audit` の領分）は出さない。本 skill の finding は「解消の証拠不在」に限る。
- bare な計画 issue 参照から外部 issue 本文を取得・推測して assumption を捏造しない（部分評価は PR 本文に inline された項目に限る）。
- 指摘上限: finding と question の合算で最大 5 件とする。question は `info` 相当として扱い、保持の優先順は findings（severity 降順）→ questions とし、上限超過分は優先度の低い側（questions → 低 severity findings）から切り捨てる。

## Rule / ルール

### 検出ロジック

1. **plan の抽出**: plan artifact（または部分評価時は PR 本文に inline された前提）から assumption / open question / 新規 Unknown を列挙する。
2. **解消証拠の探索**: 各項目について、解消の証拠（該当コード・テスト・PR 本文の回答）を diff・PR 本文・repo に Grep / artifact 参照で探索する。
3. **証拠不在の確定**: 解消の証拠が無く、別在の可能性を棄却できたときのみ finding 化する。plan の assumption を引用し、どの diff が解消すべきだったかを示す。
4. **resolution の付与**: 各 finding に「plan の該当前提をどう解消すれば良いか」（実装で確認する / PR 本文に解消根拠を書く / open question を明示的に繰り越す）を添え、merge 前必須か merge 後観測で足りるかを区別する。

### severity 較正

- 解消されない前提が **不可逆・互換破壊・セキュリティ境界** に関わるものは `blocker`。
- 現在系の挙動に関わるが可逆で、merge 前に解消証拠を残すべきものは `warning`。
- リスクが将来ドリフトで、resolution が merge 後の観測・follow-up で足りるものは `nit`。

## Evidence / 根拠の取り方

- plan の assumption / open question は plan artifact の該当箇所を引用する（どの前提が未解消かを特定できるように）。
- 解消証拠の探索に使った grep の検索語を明示し、再現可能にする。
- 部分評価時は評価対象が PR 本文の inline 列挙由来であること、外部 issue を取得していないことを明記する。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に plan 引用・`evidence_missing`・`resolution` を含める。部分評価時は `partialEvaluation: true` を先頭に記す。

```text
(assumption-resolution-trace):1: [要約] 未解消のまま残る前提は〈1文〉

<file>:<line>: [Assumption 未解消] <タイトル> CriterionRefs: <ID のカンマ区切り> ArtifactRefs: <アンカーのカンマ区切り>
  plan 前提: 「<plan からの引用>」(<plan の該当箇所>)
  evidence_missing: <解消の証拠が diff・PR 本文・テストに無いこと>(探索した検索語: `<grep pattern>`)
  Severity: blocker | warning | nit（較正基準に従う）
  resolution: <実装で確認 / PR 本文へ解消根拠 / open question を明示繰り越し>（merge 前必須 / merge 後観測で足りる を明記）
```

### トレーサビリティ ref の付記（#1666 / #1545 Phase 2）

plan artifact 由来の受け入れ条件 ID・テストケース ID・見出しアンカーが**判明している場合のみ**、finding に次のラベルを付ける。

- `CriterionRefs:` — その finding が紐づく受け入れ条件 / テストケースの ID（例: `AC-4, TC-7`）。
- `ArtifactRefs:` — その finding が紐づく artifact のアンカー（例: `plan.md#assumptions-3, todo.md#TASK-3`）。

制約は次のとおり。

- **`<file>:<line>:` と同じ行の末尾に置く**。取り込みは行単位で行われ、2 行目以降に書いたラベルは finding へ届かない。
- **ID を捏造しない**。artifact に実在する見出し・ID をそのまま転記する。採番や正規化は行わない（名前空間は River Review が所有しない）。
- **artifact が欠損しているときは付けない**。Pre-execution Gate の既存挙動（全評価 / 部分評価 / skip）は変えない。部分評価では PR 本文へ inline された項目だけを対象とする。
- 値は**空白を含まないトークン**にし、区切りは `,` または `、` を使う。空白区切りの 2 個目以降は取り込まれない。
- **アンカー付きで書く**（`plan.md#assumptions-3`）。`#` の無い裸のファイルパスは Evidence のファイル参照と区別できず、差分照合の対象に残る（fail-safe）。
- ラベル名は大文字小文字を区別する。`criterionRefs:` のような lowerCamel 表記はラベルとして扱われない。
- 散文の中でラベル名に言及するときは `` `CriterionRefs:` `` のようにバッククォートで囲む。囲まないと構造ラベルとして解釈される。
- 付記は additive なメタデータであり、severity・`verified` 判定・ゲート判定には影響しない。

## Good / Bad Examples

### Good

```text
src/lib/rate-limit.mjs:12: [Assumption 未解消] plan の「上流 API は 429 を返す」前提の解消証拠が無い ArtifactRefs: plan.md#assumptions-3
  plan 前提: 「上流 API はレート超過時に HTTP 429 を返すと仮定する」(plan.md #assumptions-3)
  evidence_missing: 429 を受けた際の後処理・その前提を確認したテストが diff・repo に無い（検索語: `429` を src/ と tests/ に grep）
  Severity: warning
  resolution: 429 応答の処理経路を実装で確認するか、前提を検証した契約テストを追加する。merge 前に解消証拠を残すべき
```

### Bad

```text
plan の前提がいくつか未確認のようです
```

（plan 引用なし、検索語なし、未解消の具体箇所なし、resolution なし）

## 評価指標（Evaluation）

- 合格基準: plan（または inline 列挙）から assumption / open question が引用され、evidence_missing が grep 再現可能な検索語で示され、別在の可能性が棄却され、resolution が merge 前 / 後の別付きで示されている。plan 欠損時は Gate の分岐（全評価 / 部分評価 / skip）に従っている。
- 不合格基準: plan artifact が無いのに全評価している、bare issue 参照から外部本文を推測して評価している、plan 整合そのものを指摘している（委譲先の領分）、resolution が無い。

## 人間に返す条件（Human Handoff）

- 未解消の前提が不可逆・互換破壊・セキュリティ境界に関わり、merge 可否の判断を要する場合。
- open question の繰り越し可否（今 merge してよいか）にチーム判断を要する場合。

## References

- `skills/agent-skills/unknown-coverage-review/references/DELEGATION.md` — 合成層との分界・委譲表（SSoT。観点6 Plan / Assumption Traceability）
- `pages/reference/artifact-input-contract.md` — `plan` artifact の入力契約（PlanGate 非依存のデグレード挙動、および PlanGate #810 ledger を専用 artifact なしで `plan` 経由に受け取る方針）
