---
id: 'impact-evidence-coverage'
name: 'Impact Evidence Coverage 影響・失敗系・外部依存の証拠充足'
description: 'diff-time で「影響範囲を repo 全体で調査した証拠」「失敗系を検証した証拠」「外部依存・レート制限・キャッシュ整合を確認した証拠」の欠落を検出する evidence-sufficiency 観点。defect そのものは既存 skill へ委譲し、本 skill は「そのリスク種別を調査した証拠が差分・PR 本文・テストに残っているか」の meta 評価のみを行う。証拠が同一 diff に同梱（テスト・canary・grep 記録）されていれば充足とみなす'
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
    impact-evidence-coverage,
    evidence-sufficiency,
    impact-analysis,
    failure-modes,
    external-dependencies,
    unknown-coverage,
    midstream,
  ]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 証拠の有無は grep / artifact 参照による決定論的突合が主だが、影響・失敗系・外部依存のいずれにも触れない変更では実行を止めるゲートが必要。

## Goal / 目的

完成した差分に対し、次の 3 種のリスクを **調査した証拠が残っているか（evidence-sufficiency）** を diff-time で検証する。defect そのものではなく「証拠の不在」を検出する。

1. **影響調査（Impact）**: 共有シンボル・公開 API・広く参照される設定を変更したとき、影響範囲を repo 全体で調査した証拠（caller の走査記録・grep ログ・影響集合の列挙）があるか。
2. **失敗系検証（Failure）**: 新しい分岐・throw・リトライ・タイムアウト・不可逆処理を追加したとき、失敗経路を観測した証拠（失敗系テスト・境界テスト・fail-safe 方向の退行検知）があるか。
3. **外部依存確認（External）**: 外部 API・レート制限・リトライ・キャッシュ整合・非同期の再実行安全に触れたとき、その挙動を確認した証拠（契約テスト・冪等性テスト・タイムアウト設定の明示）があるか。

## Non-goals / 扱わないこと

- **defect の検出そのもの**は行わない。caller 側残骸は `cross-file-leakage`、契約破壊は `api-compatibility`、外部依存の設計不備は `external-dependencies`、失敗経路のテスト欠落は `coverage-gap` / `test-existence` が担う。本 skill はそれらが指す「顕在した欠陥」ではなく「調査した証拠の不在」だけを扱う。
- **全 Unknown カテゴリの横断合成**は行わない。要件・plan・assumption・セキュリティを含む 6 観点全体の evidence-sufficiency を合成するのは agent-skill `unknown-coverage-review`（finding verification 後の合成ステップ）である。本 skill はその合成層が委譲する **Impact / Failure / External の 3 軸のみ**を、keyword routing で diff-time に単独実行できる registry 版として担う。両者は責務が入れ子で、合成層が動くときは本 skill の findings を残余に取り込む（重複指摘しない分界は `unknown-coverage-review` の DELEGATION.md を SSoT とする）。
- 証拠が実在するのに「なさそう」と推測して指摘すること。反証（grep・artifact 参照）できない証拠不在は question に留める。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分が **リポジトリ内で実行されるコード・migration・schema・公開 API・設定** のいずれかに触れる（docs・コメントのみの差分は対象外）。
- [ ] 差分が上記 3 軸（Impact / Failure / External）の少なくとも 1 つに該当する変更を含む。具体的には、共有シンボル・公開 API・広く参照される設定の変更（Impact）、新しい分岐・throw・リトライ・タイムアウト・不可逆処理（Failure）、外部 API・レート制限・キャッシュ・非同期の再実行（External）のいずれか。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定からもレビュー対象からも除外する。

ゲート不成立時の出力: `NO_REVIEW: impact-evidence-coverage — 影響・失敗系・外部依存に触れる変更が検出されない`

## False-positive guards / 抑制条件

低リスク PR（小さく明確なバグ修正・既存パターンの踏襲）で過剰な指摘を出さないため、次を厳守する。

- **証拠の diff 同梱を充足とみなす**: 影響調査・失敗系・外部依存の証拠が **同一 diff に同梱**されている場合は指摘しない。証拠の同梱形態は次を含む。
  - 失敗系テスト・境界テスト・契約テスト・冪等性テスト・fail-safe 退行検知テストが同じ差分に追加されている。
  - caller 走査・grep の記録、影響集合の列挙、near-miss の棄却根拠が PR 本文または差分内コメントに書かれている。
  - タイムアウト・リトライ・レート制限・キャッシュ TTL の設定値が差分内に明示されている。
- **証拠の別在の棄却が前提**: 「証拠が repo 内・別ファイル・既存テスト・PR 本文に存在する可能性」を Grep / Glob / artifact 参照で棄却できた場合のみ finding 化する。棄却できなければ finding ではなく question とする。
- **委譲先の領分を侵さない**: 委譲表（`unknown-coverage-review` の DELEGATION.md）で defect 検出に割り当てられた指摘（caller 残骸・契約破壊・テスト欠落そのもの）は出さない。本 skill の finding は「証拠の不在（evidence_missing）」に限る。
- **指摘上限**: 観点（Impact / Failure / External）ごとに finding と question の合算で最大 3 件とする。question は `info` 相当として扱い、保持の優先順は findings（severity 降順）→ questions とし、上限超過分は優先度の低い側（questions → 低 severity findings）から切り捨てる。
- correctness bug・セキュリティ欠陥そのものは対象外（defect 系観点の責務）。

## Rule / ルール

### 検出ロジック

1. **軸の特定**: 差分が Impact / Failure / External のどの軸に該当するかを判定する。該当軸のみ調査する。
2. **証拠の探索**: 該当軸について、証拠の所在を Grep / Glob / artifact（PR 本文・テスト・設定）で探索する。
   - Impact: 変更した共有シンボル名・旧記法を repo 全体に grep し、caller の走査記録や影響集合の列挙が差分・PR 本文に残っているか確認する。
   - Failure: 追加した分岐・throw・リトライ・不可逆処理に対する失敗系・境界テストが同一 diff にあるか、既存テストで覆われているかを確認する。
   - External: 外部呼び出し・レート制限・キャッシュ・再実行に対する契約テスト・冪等性テスト・タイムアウト設定が差分・repo にあるか確認する。
3. **証拠不在の確定**: 上記いずれの所在にも証拠がなく、別在の可能性を棄却できたときのみ、`evidence_missing` として finding 化する。
4. **resolution の付与**: 各 finding に「どの証拠を残せば解消するか」（例: 「gate ON 経路を呼び出し元経由で通す統合テストを追加」）を添える。証拠追加が merge 前に必須か merge 後の観測で足りるかを区別する。

### severity 較正

- 影響が **不可逆・互換破壊・データ損失** に及ぶ軸で証拠不在なら `blocker`（重大 Blocking）。
- 影響が現在系の挙動に及ぶが可逆で、merge 前の証拠追加で解消すべきものは `warning`。
- リスクが将来ドリフト（現在の diff は等価と確認済み）で、resolution が merge 後の観測（次回 eval run・follow-up）で足りるものは `nit`。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内にアンカーする。差分外の推測に基づく証拠不在は question として返す。
- 証拠の探索に使った grep の検索語を明示し、再現可能にする。「探したが無い」を検索語なしで主張しない。
- 証拠が同一 diff に同梱されている場合は、そのテスト・記録の `file:line` を挙げて充足と判断した根拠を示す（過剰指摘の抑制を可視化する）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `evidence_missing` と `resolution` を含める。

```text
(impact-evidence-coverage):1: [要約] 最も証拠が不足している軸は〈1文〉

<file>:<line>: [Impact 証拠不足] <タイトル>
  軸: Impact / Failure / External のいずれか
  evidence_missing: <どの証拠が差分・PR 本文・テストに無いか>(探索した検索語: `<grep pattern>`)
  Severity: blocker | warning | nit（較正基準に従う）
  resolution: <残せば解消する証拠>（merge 前必須 / merge 後観測で足りる を明記）
```

## Good / Bad Examples

### Good

```text
gate.mjs:88: [External 証拠不足] SSoT 統合の等価性が呼び出し元経由で観測された証拠が無い
  軸: External（再実行・env 伝播）
  evidence_missing: gate ON 経路を呼び出し元（runLocalReview / runReviewPlan）経由で通す統合テスト。追加テストは helper 単体レベルのみ（検索語: `git grep -l RIVER_DETERMINISTIC_EXEC tests/` が helper 単体 1 ファイルのみ）
  Severity: nit
  resolution: call-site 統合テストまたは gate-conformance 契約テストへ 1 ケース追加。現在系は等価と確認済みでリスクは将来ドリフトのため merge 後の follow-up で足りる
```

### Bad

```text
影響範囲の調査が足りなそうです
```

（軸の特定なし、検索語なし、証拠不在の具体箇所なし、resolution なし）

## 評価指標（Evaluation）

- 合格基準: 軸が特定され、evidence_missing が grep 再現可能な検索語で示され、別在の可能性が棄却され、resolution が merge 前 / 後の別付きで示されている。証拠が同一 diff に同梱されているケースでは指摘しない。
- 不合格基準: defect そのものを指摘している（委譲先の領分）、証拠の別在を棄却せず「なさそう」で指摘している、同一 diff に証拠があるのに指摘している、resolution が無い。

## 人間に返す条件（Human Handoff）

- 証拠不足が不可逆・互換破壊・データ損失の軸に及び、merge 可否の判断を要する場合。
- resolution が「follow-up テスト追加」型で、追跡担保（issue 化の要否）にチーム判断を要する場合。

## References

- `skills/agent-skills/unknown-coverage-review/references/DELEGATION.md` — 合成層との分界・委譲表（SSoT）
- `docs/review/output-format.md` §4 — Unverified / Residual Risk（残存 Unknown の出力先）
