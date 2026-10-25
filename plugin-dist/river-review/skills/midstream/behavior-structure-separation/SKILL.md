---
id: 'behavior-structure-separation'
name: 'Behavior-Structure Separation 振る舞い変更と構造変更の分離・外部挙動維持'
description: 'リファクタリング（構造変更）と機能変更（behavior change）が同一 diff に混在していないかを識別し、structural change に対する external behavior preservation の証拠（テスト・型・静的解析）が揃っているかを diff-time で確認する。証拠不足のときは Characterization Test 追加を促すか question とする。DTO/公開 API の破壊的変更検出は api-compatibility、完了主張の反証や抽出リファクタの性能特性退行は refactor-claim-audit、新知識の命名・責務・境界への反映は knowledge-to-code-alignment、投機的抽象化・スコープ逸脱は altitude-generalization / fix-scope-integrity へ委譲する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
  - 'app/**/*.{ts,tsx,js,jsx,mjs}'
  - 'lib/**/*.{ts,tsx,js,jsx,mjs}'
tags:
  - behavior-preservation
  - refactoring
  - characterization-test
  - structural-change
  - safety-net
  - midstream
severity: minor
inputContext: [diff]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search, test_runner]
---

## Origin / 由来

inspired by:

- <https://agilejourney.uzabase.com/entry/2026/07/16/103000> — 構造変更（リファクタリング）と振る舞い変更を分離し、外部挙動を維持したまま設計を更新する営みとしてのリファクタリング論。Preparatory / Post-change Refactoring と Behavior Change の識別、Characterization / Safety Net の考え方。

上記は観測された考え方の紹介であり、本文の転載・著者による endorsement を含まない（nominative fair use）。命名は `skills/README.md` Naming に従い value を表す新規名として付与した。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 振る舞い/構造変更の混在と外部挙動維持の証拠評価は意味的判断が主だが、構造変更の証拠が差分に無い変更では実行を止めるゲートが必要。

## Goal / 目的

diff に対し、次を diff-time で確認する。テストが通るだけでは分からない「仕様混在」と「安全網なしの構造変更」を検出する。

1. **分離**: 外部挙動を変える behavior change と、外部挙動を変えない structural change（リファクタリング）が同一 diff に混在していないか。混在する場合、diff・説明・コミットからそれを識別できるか。
2. **外部挙動維持の証拠**: structural change の前後で外部挙動が維持されている証拠（テスト・型・静的解析）が揃っているか。証拠が不足する場合、Characterization Test の追加を促すか `needs_review`（question）とする。

PlanGate が Behavior Change / Preparatory Refactoring / Post-change Refactoring / Characterization の区分を提供する場合はそれを入力とし、River Review は Plan を再作成せず、**diff と検証結果が Plan の変更順序・完了条件を満たすか**を確認する。

report-only。finding/question のみを出力し、自動修正・自動マージはしない。

## Non-goals / 扱わないこと（委譲表）

- **公開 API / DTO の破壊的変更検出**: エンドポイント・DTO・インターフェースの後方互換破壊とその影響範囲は `api-compatibility` が担う。本 skill は破壊的変更の検出ではなく、**振る舞い変更と構造変更の混在**と**構造変更の挙動維持証拠**を見る。
- **完了主張の反証・性能特性の退行**: 「動作は変えていない」「全部置換した」等の主張の grep 反証と、抽出リファクタの並列度/fast-path/遅延評価の退行・キー集約衝突は `refactor-claim-audit` が担う。本 skill は主張の有無に関わらず**分離の質と証拠の有無**を評価する。
- **新知識の命名・責務・境界への反映、設計知識の保全**: `knowledge-to-code-alignment`（sibling）が担う。本 skill は知識反映ではなく挙動維持を見る。
- **投機的抽象化・不要なスコープ拡大**: `altitude-generalization` / `fix-scope-integrity` が担う。
- **テストの命名・網羅性そのものの品質**: Characterization Test の中身の良し悪しは testing 系観点の責務。本 skill は「挙動維持の証拠が有るか無いか」の充足のみを見る。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分に**構造変更の証拠**（関数/メソッドの抽出・移動・改名、ファイル分割/統合、シグネチャ変更、内部データ構造の付け替え等）が少なくとも1つ含まれている。
- [ ] 差分が**リポジトリ内で実行されるコード**に触れる（docs・コメントのみの差分は対象外）。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定からもレビュー対象からも除外する。

ゲート不成立時の出力: `NO_REVIEW: behavior-structure-separation — 構造変更の証拠が差分に検出されない`

## False-positive guards / 抑制条件

- **純粋な構造変更で証拠が揃っていれば指摘しない**: 外部挙動を変えず、対象を通るテストが差分・既存に存在する（または型・静的解析で不変が保証される）場合は指摘しない。
- **宣言済みの behavior change は混在指摘しない**: PR 本文・コミットで「これは仕様変更である」と明示され、構造変更と区別されている場合、Check 1 の混在としては指摘しない。
- **behavior change 単独は対象外**: 構造変更を伴わない純粋な仕様変更は本 skill の対象ではない（Gate で除外）。
- **既存テストで担保される場合は追加要求しない**: 変更対象の外部挙動を通す既存テストが存在し、それが green である証拠がある場合、Characterization Test の追加は要求しない。
- **証拠の有無が discover できなければ question**: テストの有無・挙動維持の証拠を diff・test 差分・参照から判定できない場合は、finding ではなく question とする（false-positive-first）。
- **指摘上限**: Check ごとに finding と question の合算で最大 3 件。保持優先順は findings（severity 降順）→ questions。
- 決定論的に判定できる領域（構文・パターン）はカスタム静的解析側の責務（`.claude/rules/review-core.md` #1070）。本 skill は意味的判断に集中する。

## Rule / ルール

### Check 1 — Behavior and structural change separation / 振る舞い変更と構造変更の分離

外部挙動を変える behavior change と、外部挙動を変えない structural change が**同一 diff に混在し、区別できない**場合に指摘する。

- リファクタリングを名目にしつつ、公開挙動（戻り値・分岐条件・副作用・出力）を変える変更が同じ hunk に紛れている。
- 構造変更（抽出・移動・改名）と仕様変更が1コミットに束ねられ、PR 本文・コミットでどちらがどれか識別できない。
- 「リファクタのみ」と説明されているのに、diff に外部挙動を変える差分が含まれている。

判定に使った「外部挙動を変える差分」の位置（`file:line`）と、構造変更部分との対比を示す。混在が疑わしいが証拠が弱い場合は question とする。

### Check 2 — External behavior preservation evidence / 外部挙動維持の証拠

structural change の前後で**外部挙動が維持されている証拠（テスト・型・静的解析）が差分から観察できない**場合に指摘する。

- 抽出・移動・改名・シグネチャ変更を行ったが、その対象を通すテストの追加・更新が**同一 diff に含まれない**（Safety Net なしの構造変更）。
- 挙動維持が型・静的解析で保証されない（動的な分岐・副作用を含む）のに、diff にテスト証拠がない。
- 証拠不足の場合、`Characterization Test`（現状の外部挙動を固定するテスト）の追加を促すか、`needs_review`（question）とする。

判定は inputContext の `diff`（テスト差分を含む）を一次情報とする。`code_search` / `test_runner` が利用可能なら既存テストの実在確認に用いてよいが、これらは既定の runner では供給されない前提で運用する。「diff に安全網が観察できない構造変更」は Safety Net 未提示として `minor` の finding とし、Characterization Test の追加（または needs_review）を促す。ただし diff の外に既存テストがある可能性は排除できないため、「既存テストが無い」と断定する書き方はせず、指摘は「この変更に挙動維持の証拠が含まれていない」という diff 内で反証可能な形に限定する。構造変更かどうか自体が diff から判別できない場合は question とする。

## severity 較正

- 構造変更に紛れた behavior change が**回帰・互換破壊**を招き、Safety Net もない場合は `major`。
- 混在または証拠不足で、merge 前に分離・テスト追加すべきものは `minor` を起点とする。
- 証拠の有無・混在の判定が推定に留まるものは question（`info` 相当）とし、不確実性を明示する。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内にアンカーする。差分外の推測に基づく指摘は question として返す。
- 「外部挙動を変える差分」と「構造変更の差分」を対比で示し、どこが behavior でどこが structure かを明示する。
- 挙動維持の証拠（diff 内のテスト差分の `file:line`・型による保証・静的解析）を示すか、diff に証拠が無いことを示す（既存テストの有無を diff だけでは断定できない場合は question とし、確認に使える検索語を添える）。
- 批判的・攻撃的な口調を避ける（`.claude/rules/review-core.md`）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `check`（1|2）と `separation`（clear|mixed|unclear）を含める。

```text
(behavior-structure-separation):1: [要約] 分離の質は clear|mixed|unclear、最大の懸念は〈1文〉

<file>:<line>: [Check N] <タイトル>
  check: 1 | 2
  separation: clear | mixed | unclear
  behavior_change: <外部挙動を変える差分の位置と内容>（該当なしなら "none detected"）
  structural_change: <構造変更の位置と内容>
  evidence: <挙動維持の証拠（tests/types/static）or "none found"（検索語: `<grep pattern>`）>
  Severity: major | minor | info（較正基準に従う）
  Fix: <分離（別 PR/別コミット）or Characterization Test 追加 or 仕様変更の明示>
```

## Good / Bad Examples

### Good

```text
src/order/total.ts:30: [Check 1] リファクタと称して丸め方式（floor→round）を変更、仕様変更が混在
  check: 1
  separation: mixed
  behavior_change: 合計計算の丸めが Math.floor → Math.round に変わり公開挙動が変化（src/order/total.ts:30）
  structural_change: 計算ロジックを calcTotal() へ抽出（src/order/total.ts:22-35）
  evidence: 抽出後の calcTotal を通すテストはあるが、丸め方式変更を検証するテストは無し（検索語: `Math.round`, tests/ に該当なし）
  Severity: major
  Fix: 丸め方式変更を別 PR に分離し仕様変更として明示するか、変更を検証するテストを追加する
```

```text
src/parser/tokenize.ts:12: [Check 2] tokenize を分割抽出したが対象を通すテストが無い（Safety Net なし）
  check: 2
  separation: unclear
  behavior_change: none detected
  structural_change: tokenize() を splitTokens()/classify() に分割抽出（src/parser/tokenize.ts:12-40）
  evidence: none found — tokenize/ splitTokens を通すテストが差分・既存に見当たらない（検索語: `tokenize\\(|splitTokens\\(` in tests/）
  Severity: minor
  Fix: 抽出前の外部挙動を固定する Characterization Test を追加してから構造変更する（または needs_review）
```

### Bad

```text
テストが足りない気がします
```

（Check の特定なし、behavior/structure の対比なし、証拠の検索語なし、Fix なし、api-compatibility / refactor-claim-audit の領分との分離なし）

## 評価指標（Evaluation）

- 合格基準: Check が特定され、behavior change と structural change が対比で示され、挙動維持の証拠の有無が grep/テスト位置で示され、Fix（分離 or Characterization Test）が付いている。証拠が揃った純粋な構造変更・宣言済み仕様変更では指摘しない（question 化）。
- 不合格基準: テストの実在を確認せず「テストがない」と断じる、behavior/structure の対比を示さず「混ざっている気がする」で指摘、公開 API 破壊的変更（api-compatibility）や完了主張反証（refactor-claim-audit）を重複指摘、Fix が無い。

## 人間に返す条件（Human Handoff）

- 構造変更に紛れた behavior change が "動いていた" 経路の回帰・互換破壊に及び、分離可否や revert 範囲の判断を要する場合。
- Characterization Test を追加してから進めるか、証拠不足のまま `needs_review` で人間判断に委ねるかがチーム判断を要する場合。

## References

- `skills/midstream/knowledge-to-code-alignment/SKILL.md` — 新知識のコード反映・設計知識の保全（sibling）
- `skills/midstream/api-compatibility/SKILL.md` — 公開 API / DTO の破壊的変更検出（委譲先）
- `skills/midstream/refactor-claim-audit/SKILL.md` — 完了主張の反証・性能特性の退行（委譲先）
- `skills/midstream/fix-scope-integrity/SKILL.md` — スコープ逸脱・前提破壊（委譲先）
- `.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」
- `docs/review/output-format.md` — 重要度ラベルと出力形式（SSoT）
