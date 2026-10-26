---
id: 'normalization-consistency'
name: Normalization Consistency Review
description: Detect inconsistencies in ID formatting, date/time display, monetary amounts, and enum/status labels compared to existing patterns in the codebase.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx}'
  - 'app/**/*.{ts,tsx,js,jsx}'
  - 'lib/**/*.{ts,tsx,js,jsx}'
  - 'packages/**/*.{ts,tsx,js,jsx}'
tags:
  - consistency
  - normalization
  - formatting
  - midstream
severity: minor
inputContext:
  - diff
  - fullFile
outputKind:
  - findings
modelHint: high-accuracy
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 正規化の不整合は差分単体では見えにくく、既存コードとの比較が必要

## Guidance

- Compare new date/time formatting with existing patterns (e.g., mixing `format(date, 'yyyy/MM/dd')` with `date.toLocaleDateString()`, or `dayjs` vs `date-fns`).
- Check monetary amount display: inconsistent currency symbols, decimal places, or formatting utilities (`toLocaleString` vs `Intl.NumberFormat`).
- Check ID formatting: mixing hyphenated UUIDs with non-hyphenated, or mixing numeric IDs with string IDs in the same context.
- Check enum/status label rendering: if existing code uses a `statusLabel()` helper, flag direct string literals for status values.
- Flag when new code introduces a different normalization approach for the same data type.

## Non-goals

- 意図的なフォーマット差異（管理画面と公開画面の表示形式が異なる等）は指摘しない。
- テストコード内のハードコードされた値は対象外。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にUI表示に関連するコード（date, amount, id, status labelの表示処理）が含まれている
- [ ] または差分にフォーマット処理関数の変更が含まれている

ゲート不成立時の出力: `NO_REVIEW: normalization-consistency — 表示正規化に関連する変更が検出されない`

## False-positive guards

- 既存パターンと同じユーティリティを使っている場合は指摘しない。
- コメントやdoc stringのみの変更は対象外。
