---
id: 'plangate-exec-conformance'
name: PlanGate Exec Conformance Guard
description: 実装差分が plan / todo / test-cases アーティファクトの方針と一致しているかを検査し、逸脱・漏れ・意図外変更を検知する
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/*'
tags:
  - plangate
  - conformance
  - exec
  - plan
  - todo
  - test-cases
  - upstream
severity: major
inputContext:
  - diff
  - repoConfig
outputKind:
  - findings
  - summary
  - questions
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: plan/todo/test-cases を基準として差分を突き合わせる照合型レビューであり、必須 artifact が揃わない場合は実行を止めるゲート（Inversion）も要する。

## Goal / 目的

- 実装差分（`diff`）が `plan` の方針、`todo` の作業項目、`test-cases` の検証内容に整合しているかを検査する。
- 計画外の変更、未実装の TODO、テストで覆われない差分などを可視化し、PlanGate 上流成果物と実装の drift を防ぐ。

## Non-goals / 扱わないこと

- plan / todo / test-cases 自体の内部整合性チェック（それは姉妹 skill `plangate-plan-integrity` の責務）。
- 実装コードの品質・性能・セキュリティ観点の指摘（midstream の各 skill が担当）。
- 差分量や規模に対する一般論（PlanGate の計画と無関係な規模指摘はしない）。
- PlanGate 固有のディレクトリ構成や内部コマンドへの依存（`pages/reference/artifact-input-contract.md` の契約に従う）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] inputContext に `diff` が含まれ、レビュー対象の差分が空でない
- [ ] artifact として `plan`（または `pbi-input`）が解決できている
- [ ] artifact として `todo` または `test-cases` のいずれかが解決できている

ゲート不成立時の出力: `NO_REVIEW: plangate-exec-conformance — 差分または plan/todo/test-cases artifact が揃っていない`

**Gate と抑制条件の違い:**

- Gate = 実行するかどうかの判定（必須 artifact が欠損していれば一切レビューしない）。
- 抑制条件 = 実行した上で黙るかどうかの判定。

## False-positive guards / 抑制条件

- `plan` に「本 PR のスコープ外」「別 PR で対応」と明記された項目の未実装は指摘しない。
- `todo` に `[x]` で完了済みとマークされた項目は、差分での検証を緩める（完了前提として扱う）。
- 生成物・フォーマッタ出力・依存更新など、計画で明示的に除外された機械的差分は抑制する。
- `test-cases` が「記録のみ（実装不要）」と明示している項目は、テスト実装の欠如を指摘しない。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

1. 方針整合（plan → diff）
   - 差分の主要な変更点が plan に記載された目的・アプローチ・設計判断の範囲内か確認する。
   - plan に記載のない新規依存・新規モジュール・破壊的変更が含まれていれば指摘する。
2. 作業項目の網羅（todo → diff）
   - todo の各項目について、対応する差分が存在するか確認する。
   - 逆に、todo に存在しない領域への変更（意図外の副次変更）がないか確認する。
3. テスト整合（test-cases → diff / junit）
   - test-cases で宣言されたケースに対応するテストコードが差分に含まれているか確認する。
   - `junit` artifact が与えられている場合は、該当ケースが実行・成功しているか突き合わせる。
4. 変更の局在性
   - plan に「影響範囲」の記載がある場合、差分がその範囲に収まっているか確認する。超過分は指摘する。
5. 不確実性の扱い
   - plan / todo / test-cases の記述が曖昧で整合性判断が分かれる場合は、断定せず `[q]` として質問形式で返す。

## Finding 分類（taxonomy）

各指摘には、追跡しやすさのため次の **finding-id** を `[id=...]` として付与してよい（任意。出力形式は従来どおり `<file>:<line>: <message>` を維持する）。id は既存ルールに対応し、新しい artifact を要求しない。

| finding-id                    | 意味                                                                      | 既定 severity     | 対応ルール |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------- | ---------- |
| `planned-but-missing`         | 計画した task / 受入項目が実装されていない（todo `[x]` だが差分に無い等） | blocker           | Rule 2     |
| `implemented-but-not-planned` | plan / todo に無い挙動が差分に追加されている                              | warning           | Rule 1 / 2 |
| `target-file-violation`       | 変更ファイルが plan の影響範囲を正当化なく超えている                      | warning           | Rule 4     |
| `out-of-scope-change`         | plan で明示的に除外された領域に変更が及んでいる                           | blocker           | Rule 2 / 4 |
| `design-deviation`            | plan に記載された設計判断・境界に実装が矛盾している                       | warning / blocker | Rule 1     |
| `test-contract-missing`       | test-cases 宣言分のテストが差分 / `junit` に無い                          | warning           | Rule 3     |
| `unexpected-dependency-added` | plan の根拠なく新規依存が追加されている                                   | warning           | Rule 1     |
| `unjustified-abstraction`     | plan の根拠なく新規の抽象 / モジュールが導入されている                    | nit / warning     | Rule 1     |

補足:

- `design-deviation` は **plan に書かれた設計判断との突合**に限定する。独立した `design.md` / ADR を入力にした厳密な設計逸脱検出は、artifact 契約への `design` 追加を要する将来拡張（本 skill の現スコープ外）。
- finding-id は内部分類であり、付与は任意。severity マッピング（blocker/warning/nit）と出力形式は下記 Output に従う。

## Evidence / 根拠の取り方

- 指摘は差分側の `<file>:<line>` と、根拠となる artifact 側の見出し・行・チェックリスト項目をペアで示す。
- artifact に明記されていない事項を「逸脱」と断定しない。不明瞭な場合は質問に回す。
- diff に登場しないコードへの推測に基づく指摘は禁止（`review-core` ルール遵守）。

## Output / 出力

- すべて日本語。コメントは River Review の `<file>:<line>: <message>` 形式。
- severity は内部語彙 `blocker|warning|nit` を使用し、スキーマ側 `critical|major|minor|info` への変換は `review-core` ルールに委ねる。分類ガイド:
  - `blocker`: plan の明示的な方針に反する破壊的変更、todo 完了マーク済みだが未実装。
  - `warning`: 計画外の依存追加、test-cases 宣言分のテスト欠落、影響範囲外への意図外変更。
  - `nit`: 軽微な命名・配置の計画との差異。
  - severity 省略: 参考情報や補足の質問。
- サマリ行: `(summary):1: 方針整合 <件数> / todo 網羅 <件数> / テスト整合 <件数> / 質問 <件数>`
- 個別 finding の推奨構造:
  - Finding: 何がどの artifact とどう食い違うか（1 文）。任意で先頭に `[id=<finding-id>]`（上記 taxonomy のいずれか）を付けて分類を明示してよい。
  - Evidence: `diff: <file>:<line>` と `plan|todo|test-cases: <見出しまたは行>`。
  - Fix: 最小の是正案（実装追加 / plan 追記 / スコープ分割など）。
- 質問は `(questions):1: [q] <確認したいこと>` のように疑似ファイル名付きで 1 件 1 行で出力する（パーサが `<file>:<line>: <message>` 形式のみ抽出するため、自由文の別セクションは無視される）。

## Heuristics / 判定の手がかり

- plan の「方針」「スコープ」「非スコープ」節と、差分で触っているディレクトリ／モジュールを対応付ける。
- todo のチェックリスト（`- [ ]` / `- [x]`）と差分の変更セットを突き合わせる。
- test-cases の表・箇条書きに含まれる "given/when/then" 的記述と、追加/変更されたテスト関数名・アサーションを対応付ける。
- `junit` / `coverage` が与えられた場合、test-cases の各項目が pass / covered になっているかを補助判定に使う。

## Good / Bad Examples

- Good: plan に「X モジュールに Y を追加」と記載 → 差分が X モジュールに Y を追加 + 対応する todo にチェック + test-cases に対応テスト記載 + 実テストが追加されている。
- Bad: plan に記載のない新規依存 `foo-lib` が package.json に追加され、todo にも該当項目がない → 方針整合違反として `major` 指摘。
- Bad: todo に `- [x] 管理画面の表示を修正` とあるが、差分には該当変更が見当たらない → `critical` 指摘（完了宣言と実装の齟齬）。

## 評価指標（Evaluation）

- 合格: 指摘が差分と artifact のペアで根拠づけられ、severity が方針整合・網羅性・テスト整合のいずれかに明確に紐づく。
- 不合格: artifact に明記されていない事項への逸脱断定、差分に存在しないコードへの指摘、一般論のみの指摘。

## 人間に返す条件（Human Handoff）

- plan / todo / test-cases の記述が曖昧で、複数の解釈が成り立つ場合。
- PlanGate の上流判断（スコープ変更・計画修正）を要する齟齬が検出された場合。
- plan 改訂と実装修正のどちらで整合を取るかが判断を要する場合（方針決定は人間に委ねる）。

## Execution Steps / 実行ステップ

1. **Gate**: `diff` が非空、かつ `plan`（または `pbi-input`）と `todo` / `test-cases` の少なくとも片方が解決できているか確認。不成立なら `NO_REVIEW`。
2. **Analyze**:
   - plan の方針・スコープ・非スコープを抽出し、差分の変更セットと突き合わせる。
   - todo の項目ごとに対応差分の有無を判定（完了マーク vs 実装の齟齬に注意）。
   - test-cases の各ケースに対応するテスト差分・`junit` 結果を突き合わせる。
3. **Output**: severity マッピングに従って findings を生成し、artifact との対応箇所を Evidence として添える。曖昧な箇所は `[q]` として質問に回す。

## 関連ドキュメント

- [Artifact Input Contract](../../../pages/reference/artifact-input-contract.md) — 入力アーティファクトの契約
- [Review Policy](../../../pages/reference/review-policy.md) — レビュー標準ポリシー
- 姉妹 skill: `plangate-plan-integrity`（Issue #519）— plan/pbi/todo/test-cases 自体の整合性チェック
- 親: Capability #510 / Epic #507
