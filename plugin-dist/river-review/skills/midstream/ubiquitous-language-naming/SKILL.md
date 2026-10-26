---
id: 'ubiquitous-language-naming'
name: 'Ubiquitous Language Naming Consistency'
description: 'Detects domain terms drifting between code identifiers and the established ubiquitous language (same concept under different names, or different concepts sharing a name).'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs}'
  - 'app/**/*.{ts,tsx,js,jsx,mjs}'
  - 'lib/**/*.{ts,tsx,js,jsx,mjs}'
tags: [ddd, domain, naming, ubiquitous-language, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: なし
Why: 差分内の識別子をドメイン用語の一貫性という単一観点で評価するレビュースキル

## Goal / 目的

- ドメイン概念の命名ドリフト（同一概念の別名、別概念の同名）が差分から混入するのを防ぐ。
- diff 単体で安全に動作し、plan / ADR が無いリポジトリでも ddd pack の空振りを防ぐ。

## Non-goals / 扱わないこと

- 集約境界・コンテキスト境界の設計判断（`bounded-context-language` が artifact ベースで扱う）。
- primitive obsession / brand 型の検出（`type-driven-design` に委譲する）。
- 一般的な命名の良し悪し（広すぎる名前等）。ドメイン用語の **一貫性** のみを見る。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にドメイン語彙を含む識別子（型名・関数名・プロパティ名）の追加または改名が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: ubiquitous-language-naming — ドメイン識別子の変更なし`

補足: plan / ADR / 用語集が利用可能な場合はそれを正とし、無い場合は **差分周辺の既存コードの語彙** を正とする（degraded mode）。

## False-positive guards / 抑制条件

- 外部 API / ライブラリ由来の名前（SDK の型名等）はプロジェクトの用語と一致しなくても指摘しない。
- テストダブル・fixture 内の意図的な別名は指摘しない。
- 単数形/複数形・大文字小文字のみの揺れで、文脈上意味が同一と判断できる場合は質問に留める。

## Rule / ルール

- 同一概念が差分内・周辺コードで別名になっていないか（例: `Customer` と `Client` の混在）。
- 既存の別概念と同じ名前を新規に割り当てていないか（例: 課金の `Account` と認証の `Account`）。
- ドメイン用語の翻訳揺れ（和英混在で同一概念を指す等）が新規導入されていないか。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、衝突相手（既存の識別子と位置）を併記する。
- 用語の正が判断できない場合は断定せず、`questions` として「どちらの用語に揃えるか」を返す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: どの用語がどこでドリフトしたか（1文）
- Impact: ドメイン理解・検索性への影響（短く）
- Fix: 揃える先の用語と最小の改名案

例:

- `src/billing/invoice.ts:24: 既存の Customer と同概念の Client を新規導入。用語が分裂し検索性が低下。Fix: Customer に統一`
