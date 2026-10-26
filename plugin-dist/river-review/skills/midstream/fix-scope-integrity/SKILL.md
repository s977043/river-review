---
id: 'fix-scope-integrity'
name: 'Fix Scope Integrity 指摘対応ループのスコープ逸脱・前提破壊検出'
description: '指摘対応の反復（レビューコメント→修正→再レビュー）で、個別には正しい修正の蓄積が当初スコープを逸脱した（scope creep）、または成立済みの前提（"動いていた"状態）を破壊した（premise break）連鎖を diff-time で検出する。技術的正しさとスコープ整合性を別軸で評価し、report-only で finding/question のみ出力する。1コメント単位のトリアージ・構造変更後の caller 残骸・plan 前提解消は隣接 skill へ委譲する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
  - 'runners/**/*.{ts,js,mjs}'
  - 'scripts/**/*.mjs'
  - 'app/**/*.{ts,tsx,js,jsx,php}'
tags:
  [
    fix-scope-integrity,
    scope-creep,
    premise-break,
    fix-scope-guard,
    review-response-loop,
    scope-consistency,
    midstream,
  ]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Origin / 由来

inspired by:

- <https://zenn.dev/fixu/articles/copilot-review-scope-creep-revert> — Copilot の指摘に5往復従った結果、個別に正しい修正の蓄積が当初スコープを逸脱した事例（scope creep）。
- <https://zenn.dev/urario/articles/ai-review-rally> — AI 設計レビューへの修正が成立済みの前提を壊し、次の欠陥を4往復連鎖させた事例と、「修正が依存する前提を列挙させる」対処（premise break）。

上記は観測された現象と対処法の紹介であり、本文の転載・著者による endorsement を含まない（nominative fair use）。命名は `skills/README.md` Naming Q0–Q5 に従い value を表す新規名として付与した。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: スコープ整合性・前提破壊は意味的判断が主だが、指摘対応ループの文脈（元スコープ/前提の discover）が成立しない差分では実行を止めるゲートが必要。

## Goal / 目的

指摘対応の反復（レビューコメント→修正→再レビュー）という時間軸上で、**個別には正しい修正の蓄積**が次のいずれかを起こしていないかを diff-time で検出する。技術的正しさとは独立した軸で評価する。

1. **Scope creep（スコープ逸脱の蓄積）**: 当初スコープ・移植元・受入基準に無い制約/挙動を、指摘対応を通じて追加している。
2. **Premise break（成立済み前提の破壊）**: ある修正が、先に受理された変更 or 既存システムが依存していた前提（"動いていた"状態）を無効化し、次の欠陥の起点になっている。

report-only（ADR-005）。finding/question のみを出力し、自動修正・自動マージはしない。

## Non-goals / 扱わないこと（委譲表）

- **1コメント単位のトリアージ**: コメントの重要度づけ・対応方針（自然言語）・返信案は `review-comment-triage` が担う。本 skill は複数往復にまたがる**蓄積**のスコープ/前提整合のみを見る。
- **構造変更後の caller 残骸**: 記号再採番・シグネチャ変更・ファイル分割/移動に伴う caller 側の旧参照残骸 defect は `cross-file-leakage` が担う。本 skill は**構造変更を伴わない挙動レベルの前提破壊**を見る。
- **plan 前提の解消トレース**: `plan` artifact 保有時の plan assumption / open question の解消証拠突合は `assumption-resolution-trace` が担う。本 skill は **plan を伴わない指摘対応ループ**の前提を都度追跡する。
- **完了主張の監査**: 「全部置換した」「-N%削減」等の完了主張 vs 残骸/試算の突合は `refactor-claim-audit` が担う。本 skill は完了主張ではなくスコープ/前提の逸脱を見る。
- **evidence-sufficiency の横断合成**: 6観点全体の証拠充足合成は agent-skill `unknown-coverage-review` が担う。本 skill は defect 寄り（scope/premise 破壊という意味的欠陥）に集中し、合成は委譲する。
- **技術的正しさそのものの検証**: 指摘対応が技術的に正しいか（バグ有無・実測妥当性）は defect 系観点の責務。本 skill は正しくても**スコープ整合性が別軸**である点だけを扱う。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分が**リポジトリ内で実行されるコード**に触れる（docs・コメントのみの差分は対象外）。
- [ ] **指摘対応ループの文脈**が discover できる。具体的には次のいずれかの signal がある: PR 本文・コミットメッセージ・レビュースレッドが「レビュー指摘への対応/再対応」を示す（例: `review 対応`・`指摘 反映`・`fix per review`・複数の fix/対応コミットの連鎖）、または既存の "動いていた" ベースラインに対する逐次修正であることが読み取れる。
- [ ] **比較基準**が discover できる。すなわち当初スコープ/意図（タスク説明・移植元・受入基準）または既存システムが依存する前提のいずれかが差分・PR 本文・参照コードから特定できる。特定できない場合は finding を出さず、必要なら question に留める。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定からもレビュー対象からも除外する。

ゲート不成立時の出力: `NO_REVIEW: fix-scope-integrity — 指摘対応ループの文脈または比較基準が discover できない`

## False-positive guards / 抑制条件

正当なスコープ拡大・前提変更を FP にしないため、次を厳守する。

- **スコープ内の関連修正は指摘しない**: レビュー指摘対応で必要になった、当初スコープ内の関連修正（バグ修正に不可欠な近接変更）は scope creep ではない。
- **事前宣言/事前承認済みは指摘しない**: PR 本文・issue・コメントで事前に宣言/承認されたリファクタ同梱や制約追加は指摘しない。
- **受入基準の更新で正当化された拡大は指摘しない**: タスク説明・受入基準が更新され、その範囲に収まる変更は逸脱ではない。
- **前提変更が意図された目的なら指摘しない**: 前提を変えること自体がタスクの目的（例: 状態の持ち方を意図的に再設計する）である場合、premise break として指摘しない。
- **前提列挙が済んでいれば充足**: 修正が依存する前提の列挙と影響確認が PR 本文・コメント・差分内に残っている場合、premise 軸は充足とみなし指摘しない。
- **discover できなければ question**: 当初スコープ・前提を差分・PR 本文・参照コードから特定できない、または別在の可能性を Grep / Glob / artifact 参照で棄却できない場合は、finding ではなく question とする（false-positive-first）。
- **指摘上限**: 観点（Scope creep / Premise break）ごとに finding と question の合算で最大 3 件とする。保持の優先順は findings（severity 降順）→ questions（info 相当）とし、上限超過分は優先度の低い側（questions → 低 severity findings）から切り捨てる。
- 決定論的に判定できる領域（構文・パターン）はカスタム静的解析側の責務（`.claude/rules/review-core.md` #1070）。本 skill はスコープ整合性・前提破壊という意味的判断に集中し、canary が守る領域を重複指摘しない。

## Rule / ルール

### 検出ロジック

1. **軸の特定**: 差分が Scope creep / Premise break のどちらに該当するかを判定する。該当軸のみ調査する。
2. **比較基準の特定**: 当初スコープ/意図（タスク説明・移植元・受入基準）または成立済み前提を、PR 本文・参照コード・Grep で特定する。
   - Scope creep: 移植元・当初スコープに無い制約/挙動（値域制限・バリデーション厳格化・新規分岐）が指摘対応の差分で追加されていないか、移植元を Grep して確認する。
   - Premise break: 修正が触れた挙動が、先に受理された変更 or 既存 caller が依存していた前提（例「呼び出し側は状態を持たない」）を無効化していないか、依存箇所を Grep して確認する。
3. **別軸判定**: 指摘対応が技術的に正しくても、比較基準に対して逸脱/前提破壊があれば `妥当だが対象外`（scope-inconsistent）として finding 化する。技術的正しさを理由に不問にしない。
4. **別在の棄却**: 逸脱/前提破壊を「事前承認・スコープ更新・前提列挙で正当化されている可能性」を PR 本文・artifact 参照で棄却できたときのみ finding 化する。棄却できなければ question とする。
5. **resolution の付与**: 各 finding に解消手順を添える。scope creep は「当初基準点まで戻す（git revert 相当の切り出し）／別 PR へ分離／受入基準を更新して正当化」、premise break は「依存する前提を列挙し影響範囲を確認してから再提出」を明示する。

### severity 較正

- premise break が**回帰・データ損失・互換破壊**を招く（"動いていた"経路を壊す）なら `blocker`。
- scope creep が現在系の挙動を変える out-of-scope 制約を追加し、merge 前に分離/正当化すべきものは `warning`。
- 逸脱が軽微（挙動不変の out-of-scope な体裁変更等）で、merge 後の follow-up で足りるものは `nit`。
- 比較基準が弱く確証が持てないものは question（`info` 相当）。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内にアンカーする。差分外の推測に基づく逸脱は question として返す。
- 逸脱/前提破壊の判断に使った比較基準（移植元の `file:line`・当初スコープの記述・依存 caller の `file:line`）と Grep の検索語を明示し、再現可能にする。
- 「技術的には正しいが対象外」である旨を明記し、批判的口調を避ける（`.claude/rules/review-core.md`）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `axis`（scope_creep / premise_break）と `resolution` を含める。

```text
(fix-scope-integrity):1: [要約] 最も逸脱している軸は〈1文〉

<file>:<line>: [Scope creep|Premise break] <タイトル>
  axis: scope_creep | premise_break
  当初基準: <当初スコープ/移植元/依存前提のアンカー>(検索語: `<grep pattern>`)
  逸脱内容: <個別に正しくても基準からどう逸脱/前提破壊したか>
  Severity: blocker | warning | nit（較正基準に従う）
  resolution: <解消手順>（分離 / revert / 前提列挙して再提出 / 受入基準更新のいずれか）
```

## Good / Bad Examples

### Good

```text
src/forms/signup.mjs:42: [Scope creep] 移植元に無い値域制限を指摘対応で追加
  axis: scope_creep
  当初基準: 「既存フォームをそのまま移植」。移植元 src/forms/legacy-signup.mjs:30 に range 制限は無い(検索語: `git grep -n "min:\|max:" src/forms/legacy-signup.mjs` がヒット0)
  逸脱内容: 指摘対応3往復目で min/max バリデーションを新規側にだけ追加。個別には妥当だが移植スコープ外
  Severity: warning
  resolution: 当該制限を別 PR へ分離するか、受入基準を「移植＋バリデーション強化」に更新して正当化する
```

### Bad

```text
スコープが広がっている気がします
```

（軸の特定なし、当初基準のアンカーなし、検索語なし、resolution なし、技術的正しさとの分離なし）

## 評価指標（Evaluation）

- 合格基準: 軸が特定され、当初基準/依存前提が grep 再現可能なアンカーで示され、正当化（事前承認・スコープ更新・前提列挙）の可能性が棄却され、resolution が示されている。正当なスコープ拡大・前提列挙済みのケースでは指摘しない。
- 不合格基準: 技術的正しさを理由に逸脱を不問にしている、比較基準を示さず「広がった気がする」で指摘している、事前承認/前提列挙済みなのに指摘している、隣接 skill の領分（1コメント triage・caller 残骸・plan 前提解消・完了主張）を重複指摘している、resolution が無い。

## 人間に返す条件（Human Handoff）

- premise break が "動いていた" 経路の回帰・データ損失に及び、merge 可否や revert 範囲の判断を要する場合。
- scope creep の正当化可否（受入基準を更新するか、別 PR へ分離するか）がチーム/PO 判断を要する場合。

## References

- `skills/midstream/review-comment-triage/SKILL.md` — 1コメント単位トリアージ（委譲先）
- `skills/midstream/cross-file-leakage/SKILL.md` — 構造変更後の caller 残骸（委譲先）
- `skills/midstream/assumption-resolution-trace/SKILL.md` — plan 前提の解消トレース（委譲先）
- `.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」 — 意味的判断と静的解析の分界
- `docs/review/output-format.md` — 重要度ラベルと出力形式（SSoT）
