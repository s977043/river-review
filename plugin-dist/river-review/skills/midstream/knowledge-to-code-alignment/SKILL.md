---
id: 'knowledge-to-code-alignment'
name: 'Knowledge-to-Code Alignment 新知識のコード反映・設計知識の保全'
description: 'リファクタリングを「更新されたチームの理解と、コードが表現する過去の理解の差分同期」と捉え、今回得た新知識（要求・ドメイン知識・制約）が naming と responsibility へ反映されているか、boundary が現在の understanding を表現しているか、diff の削除行やコメントに現れる過去の design history と constraint を失っていないかを diff-time で確認する。Knowledge Delta の signal は diff（追加/削除された hunk・コメント・ADR 参照）を一次情報とし、PR 本文が供給されるときは補助に用い、不確実なら question に留める。ドメイン用語の一貫性は ubiquitous-language-naming、集約/コンテキスト境界の設計判断は bounded-context-language、投機的抽象化・caller special-case は altitude-generalization、スコープ逸脱/前提破壊は fix-scope-integrity、振る舞い変更と構造変更の分離は behavior-structure-separation、完了主張の反証は refactor-claim-audit へ委譲する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
  - 'app/**/*.{ts,tsx,js,jsx,mjs}'
  - 'lib/**/*.{ts,tsx,js,jsx,mjs}'
tags:
  - knowledge-to-code
  - knowledge-delta
  - refactoring
  - naming
  - responsibility
  - design-history
  - midstream
severity: minor
inputContext: [diff]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search, adr_lookup]
---

## Origin / 由来

inspired by:

- <https://agilejourney.uzabase.com/entry/2026/07/16/103000> — リファクタリングを単なるコード整理ではなく、開発によって更新されたチームの理解と、コードが表現する過去の理解との差分を同期する活動として捉える論。

上記は観測された考え方の紹介であり、本文の転載・著者による endorsement を含まない（nominative fair use）。命名は `skills/README.md` Naming に従い value を表す新規名として付与した。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 新知識のコード反映と設計知識の保全は意味的判断が主だが、Knowledge Delta（比較基準）が discover できない差分では実行を止めるゲートが必要。

## Goal / 目的

リファクタリング・機能変更の diff に対し、次を diff-time で確認する。テストが通るだけでは見つからない「設計知識の消失」と「古い理解の残存」を検出する。

1. **新知識の反映**: 今回新しく得た要求・ドメイン知識・制約（Knowledge Delta）が、命名（naming）と責務（responsibility）へ反映されているか。
2. **境界の表現**: モジュール/関数の境界（boundary）が、古い理解ではなく現在の understanding を表現しているか。意図がコメントだけで補足され、コード構造へ反映されていない状態になっていないか。
3. **設計知識の保全**: ADR・過去 PR・コメントに残る過去の design history（設計判断・制約・例外・運用知識）を、今回の変更で失っていないか。

report-only。finding/question のみを出力し、自動修正・自動マージはしない。

## Non-goals / 扱わないこと（委譲表）

- **ドメイン用語の一貫性**: 同一概念の別名・別概念の同名という命名ドリフトは `ubiquitous-language-naming` が担う。本 skill は用語の一貫性ではなく、**新知識が命名・責務へ反映されたか**（Knowledge Delta の反映）を見る。
- **集約・コンテキスト境界の設計判断**: 境界づけられたコンテキスト・集約境界の妥当性は `bounded-context-language` が artifact ベースで担う。本 skill は diff 上の関数/モジュール境界が現在の理解を表現するかに集中する。
- **投機的抽象化・caller special-case**: 将来予測に基づく過剰抽象化・共有基盤への継ぎ接ぎは `altitude-generalization` が担う。本 skill は「新知識の反映不足」「設計知識の消失」を見る。
- **スコープ逸脱・前提破壊**: 指摘対応ループでのスコープ creep・成立済み前提の破壊は `fix-scope-integrity` が担う。
- **振る舞い変更と構造変更の分離**: 外部挙動維持・振る舞い/構造変更の混在判定は `behavior-structure-separation`（sibling）が担う。本 skill は挙動ではなく知識の反映・保全を見る。
- **完了主張の反証**: 「全部置換した」「-N%削減」等の完了主張の grep 反証は `refactor-claim-audit` が担う。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分が**リポジトリ内で実行されるコード**に触れる（docs・コメントのみの差分は対象外）。
- [ ] **Knowledge Delta の signal** が **diff から discover** できる。具体的には次のいずれか: diff の追加/削除された hunk・差分内のコメント（`// ...`・`# ...` 等）・差分内に現れる issue/ADR 参照（`#1573`・`ADR-012` 等）・コミットや PR 本文が供給されている場合はその記述に、「新しく得た要求・ドメイン知識・制約」または「過去の設計判断・制約」が読み取れる。PlanGate が `Knowledge Delta` を提供する場合はそれを入力とする。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）は Gate 判定からもレビュー対象からも除外する。

ゲート不成立時の出力: `NO_REVIEW: knowledge-to-code-alignment — Knowledge Delta の signal が diff から discover できない`

補足（degraded mode）: 既定の runner は inputContext として `diff` のみを供給する（`fullFile`・`adr`・`commitMessage` は供給されない前提）。PlanGate から Knowledge Delta が渡されない場合は、diff の hunk・コメント・参照から推定し、**不確実性を明示して question とする**。Plan を再作成しない。

## False-positive guards / 抑制条件

- **反映済みは指摘しない**: 新知識が命名・責務・境界へ既に反映されている場合は指摘しない。
- **コメント補足が妥当なケースは指摘しない**: コード構造への反映が過剰リファクタになる場合（1箇所のみ・変更コスト大）で、意図がコメント・PR 本文に明記されているなら Check 2 を指摘しない。
- **意図的な制約削除は指摘しない**: 過去の制約・例外の削除が、PR 本文・ADR で「その制約はもう不要（前提が変わった）」と明示・正当化されている場合は Check 3 を指摘しない。
- **Knowledge Delta が discover できなければ question**: 新知識・過去の設計判断を diff・PR 本文・ADR・参照コードから特定できない場合は、finding ではなく question とする（false-positive-first）。
- **指摘上限**: Check ごとに finding と question の合算で最大 3 件。保持優先順は findings（severity 降順）→ questions。
- 決定論的に判定できる領域（構文・パターン）はカスタム静的解析側の責務（`.claude/rules/review-core.md` #1070）。本 skill は意味的判断に集中し、canary が守る領域を重複指摘しない。
- **一時対応コメントの撤去条件**: `TODO` / `FIXME` / `HACK` / `WORKAROUND` / `暫定` を含むコメントに、撤去条件（Issue 参照・URL・期日/バージョン・条件節）と恒久宣言（`keep forever` / `by design` / 恒久 等。#1797）のいずれも無い状態は、`src/lib/heuristic-review.mjs` の決定論検出器 `temporary-without-exit`（finding-id `TEMPORARY_WITHOUT_EXIT`。定義は `docs/review/rationale-traceability.md`）が canary 付きで担う。本 skill は同じ観点を重複指摘しない。この検出器は本 skill の選択に相乗りするため、実効範囲は上の `applyTo`（`src` / `app` / `lib` 配下の `.ts` `.tsx` `.js` `.jsx` `.mjs`）を含む差分に限られる。検出器側もディレクトリ接頭辞と 5 拡張子の両方を同じ条件で判定しており（`scripts/` やリポジトリ直下の設定ファイルは対象外）、対象を広げるときは applyTo と検出器を同時に変える。

## Rule / ルール

### Check 1 — Knowledge delta reflected in naming and responsibility / 新知識の命名・責務への反映

今回の変更で新しく得た要求・ドメイン知識・制約（Knowledge Delta）が特定できるのに、**変更した識別子・責務が古い理解のまま**である場合に指摘する。

- 新しい概念・区分・制約が導入されたのに、それを表す名前（型名・関数名・変数名）が旧概念のまま流用されている。
- 責務が再解釈されたのに（例: ある関数の役割が変わった）、責務の所在（どこに置かれているか）が旧構造のまま。
- 新知識を反映する変更が、コメント追記だけで済まされ、名前・責務に反映されていない。

判定に使った Knowledge Delta の出典（diff 内のコメント・追加/削除行・issue/ADR 参照、または供給されていれば PR 本文の該当箇所）を必ず示す。diff から Knowledge Delta を特定できない場合は question とする。

### Check 2 — Boundary expresses current understanding / 境界が現在の理解を表現

モジュール/関数/ファイルの**境界（boundary）が古い理解に基づいた分割のまま**で、現在の understanding を表現していない場合に指摘する。

- 新しい理解では別々に扱うべき責務が、旧境界で1つに束ねられたまま変更されている（またはその逆）。
- 意図・不変条件がコード構造（型・関数分割・引数の形）ではなくコメントだけで表現されている（可能な範囲で構造へ反映すべきケース）。
- 境界の変更が今回の Knowledge Delta と整合していない（新知識が示す責務分割と、diff の境界がずれている）。

過剰な境界再設計を強制しない。FP guard に従い、構造反映が過剰リファクタになる小規模ケースは question に留める。

### Check 3 — Design history and constraint preservation / 過去の設計判断・制約の保全

diff の**削除行（`-` 行）に現れる過去の design history（設計判断・制約・例外・運用知識）を、根拠を引き継がずに失っている**場合に指摘する。判定は diff の削除行を一次情報とする。

- 一見不要に見える分岐・例外処理・ガードが削除行にあり、その近傍のコメントが過去の障害対応・制約（例: `ADR-012`・issue 番号・「除去しないと壊れる」等の理由）を明示している。
- 「なぜこうなっているか」を説明するコメント・ドキュメントが削除行に含まれ、同じ diff 内に根拠の引き継ぎ（別コメント・PR 本文での正当化）が見当たらない。
- 削除された制約・ガードに ADR/issue 参照が付いているのに、同じ diff にその参照先を更新した形跡（ADR ファイルの変更・PR 本文での前提変更の明示）がない。

指摘の根拠は削除行の `file:line` と、そこに現れる ADR/issue 参照・制約コメントの文言を引用して示す。削除行に制約の signal が読み取れ、かつ同じ diff（PR 本文が供給される場合はそれも含む）に正当化が見当たらない場合は finding とする（回帰リスクに応じて severity を較正）。`adr_lookup` / `code_search` が利用可能なら参照先の実在確認に用いてよいが、既定の runner では供給されない前提とする。diff の削除行に制約の signal が読み取れない場合は指摘しない。signal はあるが制約かどうか・正当化の有無が diff から判断しきれない場合は question とする。

## severity 較正

- 過去制約の消失が**回帰・データ損失・互換破壊**を招くなら `major`。
- 新知識の未反映・境界の不整合で、merge 前に是正すべきものは `minor` を起点とする。
- 確信が持てない（Knowledge Delta が推定に留まる）ものは question（`info` 相当）とし、不確実性を明示する。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内にアンカーする。差分外の推測に基づく指摘は question として返す。
- Knowledge Delta の出典（diff 内のコメント・追加/削除行・issue/ADR 参照、または供給されていれば PR 本文の該当箇所）と、判断に使った検索語（grep pattern）を明示し、再現可能にする。
- 過去制約の signal は diff の削除行とその近傍コメントの位置を示す。diff の外に制約が「あったはず」と推測で断定しない（確認できなければ question）。
- 批判的・攻撃的な口調を避ける（`.claude/rules/review-core.md`）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `check`（1|2|3）と `knowledge_delta`（判定に使った新知識/過去制約）を含める。

```text
(knowledge-to-code-alignment):1: [要約] 最も知識反映が不足している点は〈1文〉

<file>:<line>: [Check N] <タイトル>
  check: 1 | 2 | 3
  knowledge_delta: <今回の新知識 or 過去の設計判断>（出典: diff 内のコメント/参照、または供給されていれば PR 本文の該当箇所）
  gap: <知識とコード表現のギャップ>（検索語: `<grep pattern>`）
  Severity: major | minor | info（較正基準に従う）
  Fix: <名前/責務/境界の是正案 or 制約の復元・根拠の明示>
```

## Good / Bad Examples

### Good

```text
src/pricing/discount.ts:18: [Check 1] 新概念「会員ランク別割引」を旧名 flatDiscount のまま実装
  check: 1
  knowledge_delta: issue #1573「割引は会員ランクに依存する」（PR 本文で明示）。従来は一律割引
  gap: rate 計算はランク依存に変わったが、関数名・型は flatDiscount のまま（検索語: `flatDiscount`, src/pricing/discount.ts:18）
  Severity: minor
  Fix: rankedDiscount 等、現在の理解を表す名前へ改名し、ランクを引数の型に反映する
```

```text
src/import/csv.ts:44: [Check 3] ADR-012 記載の BOM 除去例外を根拠確認せず削除
  check: 3
  knowledge_delta: 削除行のコメント「一部取引先の CSV は先頭 BOM 付き（ADR-012）。除去しないと parse 失敗」（diff の `-` 行に明示）
  gap: BOM 除去分岐を「不要」として削除。同じ diff に前提変更の正当化がなく、回帰で該当取引先の取込が壊れる（検索語: `\uFEFF`, 削除行 src/import/csv.ts:44）
  Severity: major
  Fix: BOM 除去を復元するか、前提が変わった旨を ADR/PR に明記して正当化する
```

### Bad

```text
命名がドメインに合っていない気がします
```

（Check の特定なし、Knowledge Delta の出典なし、検索語なし、Fix なし、ubiquitous-language-naming の領分との分離なし）

## 評価指標（Evaluation）

- 合格基準: Check が特定され、Knowledge Delta の出典が示され、コードとのギャップが grep 再現可能なアンカーで示され、Fix が付いている。反映済み・意図的削除・推定に留まるケースでは指摘しない（question 化）。
- 不合格基準: Knowledge Delta の出典を示さず「合っていない気がする」で指摘、過去制約の実在を確認せず削除を断じる、隣接 skill の領分（用語一貫性・境界設計・投機的抽象化・スコープ逸脱・振る舞い分離・完了主張）を重複指摘、Fix が無い。

## 人間に返す条件（Human Handoff）

- 過去制約の消失が "動いていた" 経路の回帰・データ損失に及び、復元可否や影響範囲の判断を要する場合。
- Knowledge Delta の解釈（新知識をどう命名・境界へ落とすか）がチーム/PO 判断を要する場合。

## References

- `skills/midstream/behavior-structure-separation/SKILL.md` — 振る舞い変更と構造変更の分離（sibling）
- `skills/midstream/ubiquitous-language-naming/SKILL.md` — ドメイン用語の一貫性（委譲先）
- `skills/midstream/altitude-generalization/SKILL.md` — 投機的抽象化・caller special-case（委譲先）
- `skills/midstream/fix-scope-integrity/SKILL.md` — スコープ逸脱・前提破壊（委譲先）
- `skills/midstream/refactor-claim-audit/SKILL.md` — 完了主張の反証（委譲先）
- `.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」
- `docs/review/output-format.md` — 重要度ラベルと出力形式（SSoT）
