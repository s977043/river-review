---
id: 'gh-address-comments'
name: GitHubレビューコメント対応（修正案つき）
description: PRレビューコメントを重要度ごとに整理し、対応方針・修正案・質問をまとめて返信案を作る
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*'
  - 'lib/**/*'
  - 'apps/**/*'
  - 'packages/**/*'
  - 'tests/**/*'
  - 'docs/**/*'
  - 'pages/**/*'
tags:
  - review
  - github
  - midstream
severity: info
inputContext:
  - diff
outputKind:
  - actions
  - questions
  - summary
modelHint: high-accuracy
dependencies:
  - custom:github
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: レビューコメントの整理・対応方針作成がチェックリスト型の主タスクだが、レビューコメントが存在しない場合は実行不要

## Goal / 目的

- レビューコメントを must/want/nit に整理し、未対応を解消するための最小の修正方針と返信案を用意する。
- 情報不足の箇所は仮対応せず、追加質問として明示する。

## Non-goals / 扱わないこと

- 要求の背景が不明なまま大規模リファクタを提案しない。
- 既に解決済み・outdated なコメントに対する重複指摘を避ける。
- プロダクト要求の意思決定を独断で覆さない。根拠がない反論はしない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] PRにレビューコメント（未対応または要確認）が存在する
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: gh-address-comments — 対応すべきレビューコメントが検出されない`

## False-positive guards / 抑制条件

- コメントが差分に紐づかない、または文脈不足で判断できない場合は質問に倒す。
- 単なる表記ゆれや好みの指摘は `nit` とし、主要な品質・安全性の指摘を優先。

## Rule / 手順

1. コメントの棚卸し
   - 取得コメントを ID 連番で一覧化（種類、ファイル/行、原文、スレッド状態）。
   - severity を must/want/nit から、status を 対応済み/未対応/要確認 から付与。
2. 未対応・要確認への対応案
   - 影響範囲とリスク（互換性、セキュリティ、性能）を簡潔に述べる。
   - 修正方針または最小パッチ案を出す。根拠として差分や仕様を引用する。
   - 代替案があれば 1 行で併記。
3. 質問・確認事項
   - 事実確認が必要な点は具体的に質問化し、ブロッカーを明示。
4. 対応済みの返信案
   - 対応内容を要約し、丁寧な返信文案を日本語で記す。
5. 総括
   - 件数集計（総数/未対応/要確認/対応済み）。不足ログや取得漏れリスクがあれば書く。

## Output / 出力

- すべて日本語。`<file>:<line>: <message>` 形式。場所不明は `(summary):1:` や `(comment C1):1:` を使う。
- `<message>` には `[severity=must|want|nit][status=未対応|要確認|対応済み]` を含め、方針/修正案/質問/返信案を短く書く。
- パッチ案は概要レベルで示し、必要なら対象ファイル名と関数名を添える（長文パッチは禁止）。

## 評価指標（Evaluation）

- 合格: コメントが網羅され、重要度付きで未対応が減る具体方針と質問が提示されている。
- 不合格: 差分と無関係な一般論、根拠のない反論、outdated への重複指摘。

## 人間に返す条件（Human Handoff）

- 仕様や優先度が不明で対応方針が決まらない場合。
- 破壊的変更や大規模リファクタが必要な場合は、合意形成のため人間レビューへ返す。
