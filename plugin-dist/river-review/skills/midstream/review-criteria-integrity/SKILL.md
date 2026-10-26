---
id: 'review-criteria-integrity'
name: 'Review Criteria Integrity レビュー基準・品質ゲートの自己弱体化検出'
description: '差分が「その差分自身を審査するレビュー基準・品質ゲート」を弱めていないかを diff-time で検出する。Check 1 レビュールールの削除・弱体化（.river/rules.md / .river/rules.d/*）、Check 2 実行時コンフィグの閾値・ゲート緩和（.river-review.{json,yaml,yml} の review.severity 引き下げ / exclude 拡大 / memory.suppressionEnabled 無効化 / selection.skills.exclude 追加）、Check 3 suppression entry の新規追加、Check 4 lint・静的解析設定からのルール削除や無効化、Check 5 branch protection・required check の緩和、の 5 Check を対象とし、これらが機能変更と同一 PR に混在し、かつ意図の宣言が無い場合に指摘する。report-only。workflow の permissions / action pin は gha-workflow-security、既存 suppression entry の使い分けは suppression-feedback、設定ファイルの一般的妥当性は config-json、.only / .skip / @ts-ignore / @ts-nocheck は heuristic-review.mjs の決定論検出器、リファクタと機能追加の混在は behavior-structure-separation へ委譲する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '.river/rules.md'
  - '.river/rules.d/**/*.md'
  - '.river-review.{json,yaml,yml}'
  - '.river/**/*.{json,yaml,yml}'
  - '**/.eslintrc*'
  - 'eslint.config.{js,mjs,cjs,ts}'
  - '.textlintrc*'
  - '**/*textlintrc*'
  - '**/.textlintignore'
  - '.markdownlint*'
  - '**/tsconfig*.json'
  - '.github/workflows/**/*.{yml,yaml}'
  - '.github/**/*.{yml,yaml,json}'
tags:
  [
    review-criteria-integrity,
    review-definition,
    quality-gate,
    rules-provenance,
    self-weakening,
    suppression,
    midstream,
  ]
severity: major
inputContext: [diff, prDescription, fullFile]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Origin / 由来

inspired by <https://zenn.dev/nnku/articles/f6c7a62b78a47e>

上記はレビュー基準の出所を固定する設計の紹介であり、本文の転載や著者による endorsement を含まない（nominative fair use）。

取り込むのは **「差分が自分のレビュー基準を弱めている」ことをレビュー観点として指摘する** という一点に限る。記事が提示する仕組み（二層 Definition・blob SHA 記録・fallback 規則）は移植しない。それらは config schema と run record の変更を伴う別スライスであり、`docs/adr/005-review-learning-loop-incremental-extension.md` の「外部記事の自動化度をそのまま持ち込まない」前例に従って設計から分離する。

命名は `skills/README.md` Naming Q0–Q5 に従う。Q0 で「概念の再実装」に分類されるためリネームが既定となり、Q1 では原語 `Review Definition` が本リポジトリの既存語彙（`.river/rules.md` / rules / policy）と衝突する。Q2 で役割が変わる（記事は基準解決アルゴリズムの設計、本 skill はレビュー観点）ため、**Q2 でリネーム確定**とし、既存の `*-integrity` 命名ファミリ（`fix-scope-integrity` / `plangate-plan-integrity`）に揃えた `review-criteria-integrity` を付与した。原語は `tags` の `review-definition` に残す。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 基準の弱体化はパターンとして拾えるが、「弱体化かどうか」と「正当な緩和か」の判定は意味的であり、比較基準（弱体化前の基準・宣言された意図）が discover できない差分では実行を止めるゲートが必要である。

## Goal / 目的

レビュー基準・品質ゲートは被レビューエージェントの書込権限内にあり、PR 内で `.river/rules.md` を弱めた変更は、その PR 自身のレビュー基準に即時反映される（`pages/explanation/security-model.md` §「レビュー基準の出所」）。この信頼境界を diff-time の観点として可視化する。

次の 5 Check のいずれかに該当する変更が、**機能変更と同一 PR に混在**し、かつ**意図の宣言が無い**場合に指摘する。

- **Check 1（レビュールール）**: `.river/rules.md` / `.river/rules.d/*` の基準の削除・条件の弱体化。
- **Check 2（実行時コンフィグの閾値・ゲート）**: `.river-review.{json,yaml,yml}` の `review.severity` 引き下げ（`strict` → `normal` / `relaxed`）、`exclude.files` の拡大、`exclude.prLabelsToIgnore` の追加、`memory.suppressionEnabled: false`、`selection.skills.exclude` への追加、`selection.packs` からの削除。
- **Check 3（suppression entry）**: suppression entry の新規追加（`river suppression add` 相当の登録差分）。
- **Check 4（lint・静的解析設定）**: lint / 型チェック設定からのルール削除・無効化（ESLint rule の `off` 化や削除、`tsconfig` の `strict` 系フラグの無効化、textlint / markdownlint のルール削除）。
- **Check 5（branch protection・required check）**: branch protection / required status check の緩和（required check の削除、`strict` の無効化、必須レビュー人数の引き下げ）。

report-only（ADR-005）。finding / question のみを出力し、自動修正・自動マージはしない。

## Non-goals / 扱わないこと（委譲表）

- **workflow の権限・供給網**: GitHub Actions workflow の `permissions` 拡大、third-party action の未ピン留め、`pull_request_target` と untrusted checkout の組み合わせは `gha-workflow-security` が担う。本 skill が workflow ファイルを見るのは **required check の定義や品質ゲート job の削除**という文脈のみで、権限・pin・トリガーには触れない。
- **suppression entry の使い分け判断**: 既存 suppression entry を使うべきか（`accepted_risk` / `false_positive` / `wont_fix` のどれを選ぶか、HIGH_SEVERITY guard の扱い）は `suppression-feedback` が担う。本 skill は **entry が新規追加された事実と機能変更との混在**のみを見る。
- **設定ファイルの一般的妥当性**: JSON / YAML の構文・型・ベストプラクティス違反は `config-json` が担う。本 skill は **基準を弱める方向の差分**のみを見る。
- **決定論検出器がカバー済みの抑制**: `.only` / `.skip` / `xit` / `xdescribe` / `@ts-ignore` / `@ts-nocheck` は `src/lib/heuristic-review.mjs` の決定論検出器が既に検出する。本 skill はこれらを**重複指摘しない**（`.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」）。
- **AI レビュー結果の扱いそのもの**: レビュー自動化の境界（AI の指摘をどこまで自動適用するか）は `review-automation-boundary` が担う。本 skill は基準の変更差分のみを見る。
- **スコープ逸脱一般**: 指摘対応ループの scope creep / premise break は `fix-scope-integrity` が担う。本 skill は**混在の対象が「レビュー基準・品質ゲート」である場合**に限定する。
- **振る舞い変更と構造変更の混在**: リファクタ（構造変更）と機能追加（振る舞い変更）が同一 diff に混在していないかは `behavior-structure-separation` が担う。本 skill が扱う混在は**「レビュー基準・品質ゲートを弱める変更」と機能変更の組み合わせ**に限る。したがって、リファクタと機能追加が混ざっているだけで基準・ゲートに触れていないケースは本 skill の対象外であり、指摘しない。
- **rules の出所固定の実装**: blob SHA 記録・base pin・provenance 記録は skill の責務ではなく、config schema と run record の設計課題である（#1669 スライス3）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分が Check 1〜5 の対象パス（`.river/rules.md` / `.river/rules.d/*` / `.river-review.{json,yaml,yml}` / suppression store / lint・型チェック設定 / branch protection・required check 定義）のいずれかに触れている。
- [ ] **弱体化の判定基準**が discover できる。すなわち削除・変更された基準の変更前の値が差分（`-` 行）から読み取れる、または参照設定から特定できる。特定できない場合は finding を出さず question に留める。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定からもレビュー対象からも除外する。

ゲート不成立時の出力: `NO_REVIEW: review-criteria-integrity — レビュー基準・品質ゲートに触れる差分が無い、または弱体化の判定基準が discover できない`

## False-positive guards / 抑制条件

正当な基準変更を FP にしないため、次を厳守する。

- **基準変更のみの PR は指摘しない**: 機能変更（`src/**` 等の挙動を変える差分）が同一 PR に無く、基準の見直しそのものが PR の目的である場合は指摘しない。本 skill が問題視するのは**混在**である。
- **強化方向の変更は指摘しない**: 基準の追加、`review.severity` の引き上げ、required check の追加、lint ルールの追加は弱体化ではない。
- **意図が宣言されていれば指摘しない**: PR 本文・issue・コミットメッセージ・設定内コメントで緩和の理由と適用範囲が明示され、期限や再強化の条件が示されている場合は指摘しない。
- **リネーム・移設は指摘しない**: ルールの別ファイルへの移動、`rules.d/` への分割、required check 名の変更に伴う登録差し替えなど、**基準の総量が減っていない**変更は弱体化ではない。差分の削除側だけを見て判断しない。
- **上流由来の変更は指摘しない**: 依存パッケージの preset 更新や自動生成物の追随でルール集合が変わった場合は、意図的な緩和ではない。
- **委譲先の領分は指摘しない**: `.only` / `.skip` / `@ts-ignore` / `@ts-nocheck`・workflow の permissions / action pin・suppression entry の種別選択は、それぞれ決定論検出器・`gha-workflow-security`・`suppression-feedback` の責務であり、本 skill からは指摘しない。
- **discover できなければ question**: 変更前の基準・宣言された意図を差分・PR 本文・参照設定から特定できない場合は、finding ではなく question とする（false-positive-first）。
- **指摘上限**: Check ごとに finding と question の合算で最大 2 件、全体で最大 5 件とする。保持の優先順は findings（severity 降順）→ questions（info 相当）とし、上限超過分は優先度の低い側（questions → 低 severity findings）から切り捨てる。

## Rule / ルール

### 検出ロジック

1. **Check の特定**: 差分が Check 1〜5 のどれに該当するかを判定する。該当 Check のみ調査する。
2. **方向の判定**: 変更前後を比較し、基準が**弱まる方向**かを判定する。削除行と追加行の両方を読み、移設・リネームによる見かけ上の削除を除外する。
3. **混在の確認**: 同一 PR に機能変更（実行されるコードの挙動を変える差分）が含まれるかを確認する。含まれない場合は指摘しない。
4. **正当化の棄却**: 緩和の理由・適用範囲・再強化条件が PR 本文・issue・コミットメッセージ・設定内コメントに残っていないことを確認する。残っていれば指摘しない。棄却の可否が判断できなければ question とする。
5. **resolution の付与**: 各 finding に解消手順を添える。「基準変更を別 PR へ分離する」「緩和の理由・適用範囲・再強化条件を PR 本文に明記する」「緩和ではなく suppression entry として記録する」のいずれかを明示する。

### severity 較正

- 品質ゲートの無効化（`memory.suppressionEnabled: false`・required check の削除・skill の一括除外）が機能変更と混在し、その PR 自身の審査を素通りさせるものは `blocker`。
- 個別のルール削除・閾値引き下げ・`exclude` 拡大が機能変更と混在し、merge 前に分離または宣言すべきものは `warning`。
- 影響範囲が狭く（単一ファイルの lint ルール 1 件の `off` 化など）、merge 後の follow-up で足りるものは `nit`。
- 変更前の基準や意図の宣言が discover できず確証が持てないものは question（`info` 相当）。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内にアンカーする。差分外の推測に基づく指摘は question として返す。
- 弱体化の判断に使った変更前の値（削除された `-` 行・変更前の設定値）と、混在を確認した機能変更側の `file:line` を併記し、再現可能にする。
- 「基準を弱める意図があった」と断定しない。混在という構造と、宣言が見当たらない事実のみを述べる（`.claude/rules/review-core.md`）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `check`（1〜5）と `resolution` を含める。

```text
(review-criteria-integrity):1: [要約] 最も影響の大きい弱体化は〈1文〉

<file>:<line>: [Review criteria weakening] <タイトル>
  check: 1 | 2 | 3 | 4 | 5
  変更前の基準: <削除・変更された基準の変更前の値>(アンカー: `<file>:<line>`)
  弱体化内容: <どの方向にどれだけ弱まったか>
  混在する機能変更: <同一 PR の機能変更側 file:line>
  Severity: blocker | warning | nit（較正基準に従う）
  resolution: <解消手順>（別 PR へ分離 / 緩和理由と再強化条件を明記 / suppression entry として記録 のいずれか）
```

## Good / Bad Examples

### Good

```text
.river/rules.md:12: [Review criteria weakening] レビュー基準の削除が機能変更と同一 PR に混在している
  check: 1
  変更前の基準: 「外部入力を扱う関数には入力検証を必須とする」(アンカー: .river/rules.md:12 の削除行)
  弱体化内容: 入力検証を必須とする基準が削除され、同 PR で追加された外部入力の受け口が本基準の審査対象から外れる
  混在する機能変更: src/api/webhook.mjs:31（新規の外部入力ハンドラを追加）
  Severity: blocker
  resolution: 基準の削除を別 PR へ分離するか、削除理由と代替の担保（既存の検証層など）を PR 本文に明記する
```

### Bad

```text
レビュー基準を勝手に緩めています
```

（Check の特定なし、変更前の値のアンカーなし、混在の確認なし、resolution なし、意図の断定と攻撃的な口調）

## 評価指標（Evaluation）

- 合格基準: Check が特定され、変更前の基準が差分内のアンカーで示され、機能変更との混在が具体的な `file:line` で確認され、正当化（宣言・移設・強化方向・上流由来）の可能性が棄却され、resolution が示されている。基準変更のみの PR や強化方向の変更では指摘しない。
- 不合格基準: 混在を確認せずに基準の変更だけで指摘している、移設・リネームを削除と誤認している、委譲先の領分（`.only` / `@ts-ignore`・workflow permissions・suppression entry の種別選択）を重複指摘している、意図を断定している、resolution が無い。

## 人間に返す条件（Human Handoff）

- 緩和が意図的か事故かの判別に、PR 作成者の説明や運用上の合意が必要な場合。
- 品質ゲートの緩和が組織の運用ポリシー（branch protection の管理主体など）に関わり、merge 可否の判断がチーム / 管理者を要する場合。

## References

- `skills/downstream/gha-workflow-security/SKILL.md` — workflow の権限・供給網（委譲先）
- `skills/midstream/suppression-feedback/SKILL.md` — suppression entry の使い分け（委譲先）
- `skills/midstream/config-json/SKILL.md` — 設定ファイルの一般的妥当性（委譲先）
- `skills/midstream/fix-scope-integrity/SKILL.md` — 指摘対応ループのスコープ逸脱（隣接）
- `skills/midstream/behavior-structure-separation/SKILL.md` — 振る舞い変更と構造変更の混在（委譲先）
- `pages/explanation/security-model.md` §「レビュー基準の出所」 — rules の信頼境界（SSoT・#1669 スライス1）
- `src/lib/heuristic-review.mjs` — `.only` / `.skip` / `@ts-ignore` / `@ts-nocheck` の決定論検出器（重複指摘しない境界）
- `src/lib/rules.mjs` — `.river/rules.md` と `.river/rules.d/*` の読み込み実装
- `pages/reference/config-schema.md` — `.river-review.json` の項目とデフォルト
- `.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」 — 意味的判断と静的解析の分界
- `docs/review/output-format.md` — 重要度ラベルと出力形式（SSoT）
