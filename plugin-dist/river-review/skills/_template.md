---
# Required metadata (validate with schemas/skill.schema.json)
id: '<skill-id>' # 例: code-quality（kebab-case、プレフィックスなし）
name: <Human readable title> # 50文字以内で簡潔に
description: <What this skill checks> # 具体的なチェック目的
category: midstream # core | upstream | midstream | downstream
phase: midstream # upstream | midstream | downstream
applyTo:
  - 'src/**/*.ts' # globパターンを列挙。できるだけ絞り込む
# path_patterns: # applyToのエイリアス。パス指定をここにまとめてもOK
#   - 'src/**/*.ts'
tags:
  - example # カテゴリやドメインタグ（security, testing, api等）。community共有はcommunityを付与
severity: minor # info | minor | major | critical
inputContext:
  - diff # diff / fullFile / tests / adr / commitMessage / repoConfigなど
outputKind:
  - findings # findings / summary / actions / tests / metrics / questions
modelHint: balanced # cheap / balanced / high-accuracy
# dependencies:
#   - code_search # 必要なリソースがあれば指定。不要なら省略
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion / Pipeline / Tool Wrapper / なし
Why: このスキルがこのパターン構成を採る理由を1文で

パターン選択の基準:

- Reviewer — チェックリストや基準に照らした評価が主目的（レビュースキルのデフォルト）
- Inversion — 不足情報がある場合に生成を止めるゲートが必要
- Pipeline — 複数ステップの順序制御とチェックポイントが必要
- Tool Wrapper — 専門知識をオンデマンドで注入する必要がある
- Generator — テンプレートから構造化出力を生成する必要がある

## Goal / 目的

- このスキルで"何を減らす/防ぐ/促す"のかを1〜2行で書く。
- 1スキル=1テーマに絞り、目的が混ざらないようにする。

## Non-goals / 扱わないこと

- このスキルが扱わない領域（例: リファクタ方針の一般論、プロジェクト固有の制約の断定）を書く。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に<関連する変更種別>が含まれている
- [ ] <必要なinputContext>が利用可能である

ゲート不成立時の出力: `NO_REVIEW: <skill-id> — <理由>`

**Gateと抑制条件の違い:**

- Gate = 実行するかどうかの判定（硬い。条件未達なら一切レビューしない）
- 抑制条件 = 実行した上で黙るかどうかの判定（柔らかい。個別の指摘を抑制する）

## False-positive guards / 抑制条件

- Gateを通過した上で、個別の指摘を抑制するケースを列挙する。
- Gateと重複する条件（差分全体に対する判定）はここに書かない。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

- ルールを1観点に絞って箇条書きで書く。
- "nit"を濫発しない（重要度が低いものは控える）。

## Evidence / 根拠の取り方

- 指摘は差分に紐づける（`<file>:<line>`で追える内容）。
- 推測を断定しない（不確実なら"可能性"として書く）。

## Output / 出力（短文版の推奨）

River Reviewのコメントは`<file>:<line>: <message>`形式です。`<message>`は短くても、次が伝わる形にします。
コメントは日本語で返す。

- Finding: 何が問題か（1文）
- Impact: 何が困るか（短く）
- Fix: 次の一手（最小の修正案）

例:

- `src/foo.ts:42: 例外が握りつぶされる可能性。障害調査が困難。Fix: catchでログ+再throw`

## Heuristics / 判定の手がかり（任意）

- 具体的な検出の手がかり（キーワード、構造、パターン）を列挙する。

## Good / Bad Examples（任意）

- 短い例で、何が良い/悪いかを示す。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。

## Execution Steps / 実行ステップ（任意）

複雑なスキルでは、実行順序を明示することで手順飛ばしを防ぐ。

### Leaf skills（実行スキル）の基本形

1. **Gate**: Pre-execution Gateの条件を確認。不成立なら`NO_REVIEW`を返す
2. **Analyze**: Ruleに従い差分を分析。Evidence基準で根拠を収集
3. **Output**: 出力フォーマットに従い結果生成。Human Handoff条件を評価

### Router skills（ルーティングスキル）の基本形

1. **Classify**: 入力を分類し、該当する専門スキルを選択
2. **Execute**: 選択したスキルを実行（並列実行可能な場合は明記）
3. **Aggregate**: 結果を統合し、重複を除去して優先順位を付ける
