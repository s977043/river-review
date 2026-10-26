---
id: 'i18n-unused-key'
name: i18n Unused Key Review
description: Detect i18n/locale keys that are removed from source but remain in locale files, or keys added to locale files without source usage.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/i18n/**'
  - '**/locales/**'
  - '**/messages/**'
  - '**/*.json'
tags:
  - i18n
  - localization
  - dead-code
  - midstream
severity: minor
inputContext:
  - diff
  - fullFile
outputKind:
  - findings
modelHint: balanced
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: i18n key管理はdiff単体では判断が難しく、ファイル全体とソース参照の両方を踏まえる必要がある

## Guidance

- Check if translation keys deleted from source code (e.g., `t('key')`, `i18n.t('key')`, `$t('key')`) still exist in locale JSON files — report as unused key.
- Check if new keys added to locale JSON files are referenced in source code — report as potentially orphaned key.
- Look for patterns like `t('user.profile.name')`, `i18n('common.cancel')`, `formatMessage({ id: 'key' })`.
- When source file is deleted entirely, flag all its keys in locale files as candidates for removal.

## Non-goals

- 動的に構築されるkey（テンプレートリテラルやconcat）は誤検知になりやすいため指摘しない。
- 外部ライブラリのkey（third-party component内部のi18n keyなど）は対象外。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にi18n/locale関連ファイル（\*.json, **/i18n/**, **/locales/**）の変更が含まれている
- [ ] または差分にUI文言を削除・変更するソースコードの変更が含まれている

ゲート不成立時の出力: `NO_REVIEW: i18n-unused-key — i18n/locale関連の変更が検出されない`

## False-positive guards

- keyがワイルドカードや動的参照で使用されている可能性がある場合は黙る。
- テスト用フィクスチャやstorybook内のkey定義は対象外。
- 同一PR内で追加と削除が対になっている（リネーム）場合は指摘しない。
