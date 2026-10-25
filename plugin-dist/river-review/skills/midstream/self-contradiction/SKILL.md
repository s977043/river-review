---
id: 'self-contradiction'
name: 'Self-Contradiction Detector 自己矛盾検出'
description: '同一ファイル/隣接ファイル内で「規則Xを守れ」と宣言した直後にXを破っている、宣言と実装の乖離を検出する'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.md'
  - '**/*.{ts,tsx,js,jsx,mjs}'
  - '**/SKILL.md'
  - '**/AGENTS.md'
tags: [adversarial, self-contradiction, claim-vs-actual, consistency, midstream, cognitive-bias]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 宣言（declarative phrase）と実装の突合はチェックリスト型だが、宣言が差分に存在しない変更では実行を止めるゲートが必要

## Goal / 目的

- ファイル/スキル/ドキュメントが「規則 X を守れ」と宣言した直後・同じファイル内で **規則 X を破っている** パターンを検出する。
- Pre-mortem（失敗シナリオ）や Logic Torturing（論理の穴）では捉えにくい、**「宣言」と「実装」の乖離** に特化する。

## Non-goals / 扱わないこと

- 個別の論理的整合性の検証（`logic-torturing` の役割）。
- 攻撃経路の分析（`war-game` の役割）。
- 規則そのものの妥当性判断（規則が正しいか否かではなく、宣言と実装が一致するかを見る）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分に宣言的フレーズ（「〜しない」「禁止」「必ず〜する」「don't」「never」「MUST」「always」等）が含まれている、またはそれを含む既存ファイルへの変更である
- [ ] inputContext に diff または fullFile が含まれている

ゲート不成立時の出力: `NO_REVIEW: self-contradiction — 宣言的フレーズが検出されない`

## False-positive guards / 抑制条件

- 宣言が「例外を明示している」場合（「ただし X の場合を除く」）で、実装がその例外条件に該当するなら抑制。
- 宣言がコメントアウトされた旧仕様や、引用ブロック（「悪い例」として提示されたコード）の場合は抑制。
- 宣言と実装が別の対象を指している（同名だがスコープが異なる）場合は抑制。

## Rule / ルール

### 検出ロジック

1. **宣言の抽出**: 差分・対象ファイルから declarative phrase を抽出する。
   - 禁止形: 「〜しない」「〜してはいけない」「禁止」「避ける」「don't」「never」「avoid」「MUST NOT」
   - 義務形: 「必ず〜する」「〜すること」「MUST」「always」「required」
2. **対象の特定**: 各宣言が何を規律しているか（参照形式・命名・依存方向・出力形式等）を1文で言語化する。
3. **実装との突合**: 同一ファイル、次いで隣接/関連ファイルの本文・コードを走査し、宣言に違反する箇所を探す。
4. **乖離の報告**: 宣言の位置と違反の位置を両方 `<file>:<line>` で示す。

### 制約

- 検出は最大 5 件。乖離が明白で影響の大きいものを優先。
- 各指摘には「宣言」「宣言位置」「違反位置」「乖離の説明」を必ず含める。
- 宣言が差分外にあっても、違反が差分内にあれば指摘可能（逆も可）。ただし両方とも差分外の場合は対象外。

## Evidence / 根拠の取り方

- 宣言と違反は必ず両方の `<file>:<line>` を示し、推測ではなく実際の行に紐づける。
- 「規則 X」を引用し、違反箇所がどう X に反するかを具体的に説明する。

## Output / 出力フォーマット

すべて日本語。

```text
(self-contradiction):1: [要約] 最も重大な宣言と実装の乖離は〈1文〉

<file>:<line>: [自己矛盾1] <タイトル>
  宣言: 「<規則 X の引用>」(<file>:<宣言の行>)
  違反: <宣言に反する実装の説明>(<file>:<違反の行>)
  乖離: <なぜ宣言と矛盾するか>
  Fix: <宣言に合わせるか宣言を改めるか、最小限の修正>

<file>:<line>: [自己矛盾2] ...
```

## Good / Bad Examples

### Good

```text
sub-supervisor.md:38: [自己矛盾] 章番号参照禁止を宣言した直後に章番号参照を使用
  宣言: 「章番号参照ではなくファイル単位で参照する」(sub-supervisor.md:17)
  違反: 本文で `SKILL §2.1` / `§4` と章番号参照を使用 (sub-supervisor.md:38,68,85)
  乖離: L17 の宣言と同一ファイル L38 以降の実装が真逆
  Fix: `SKILL §2.1` を該当ファイルパス参照に置換、または L17 の宣言を実態に合わせて緩和
```

### Bad

```text
sub-supervisor.md: 矛盾がありそう
```

（宣言の引用なし、違反位置なし、具体性なし）

## 評価指標（Evaluation）

- 合格基準: 宣言と違反が両方 `<file>:<line>` で示され、引用された規則に対し違反が具体的に説明されている。
- 不合格基準: 宣言の引用がない、違反位置が曖昧、規則の妥当性への意見、差分にない矛盾の推測。

## 人間に返す条件（Human Handoff）

- 宣言と実装のどちらが正しいか（規則を直すか実装を直すか）が設計判断を要する場合。
- 矛盾が複数ファイル・複数チームの規約にまたがる場合。
