---
id: 'altitude-generalization'
name: Altitude Generalization Guard
description: Detects per-caller special-cases (bandaids) bolted onto shared infrastructure/common functions, and when two or more same-kind special-cases exist proposes generalizing the lower-level mechanism instead.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'runners/**/*.{ts,tsx,js,jsx,mjs,cjs}'
tags:
  - simplify
  - altitude
  - generalization
  - maintainability
  - midstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - actions
modelHint: high-accuracy
prompt:
  system: prompt/system.md
  user: prompt/user.md
eval:
  promptfoo: eval/promptfoo.yaml
---

> 由来: Claude Code の `/simplify`（Altitude 観点）に由来（inspired by）。Issue #1452 P3 で、`skills/agent-skills/river-review-code/references/SIMPLIFY.md` から Altitude の詳細検出を本 registry skill へ委譲した。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 共有基盤への継ぎ接ぎ（bandaid）をチェックリストで評価するが、special-case の証拠が差分に無い変更では実行しない。

## Goal / 目的

- 共有基盤・共通関数に「特定の呼び出し元のためだけ」の分岐（bandaid）が積み上がるのを防ぐ。
- 同種の special-case が2つ以上ある場合に、下層機構の一般化（設定テーブル / strategy / caller ごとの宣言的マップ）を促す。

## Non-goals / 扱わないこと

- correctness bug・セキュリティ欠陥は対象外（bug 系・security 系観点の責務）。
- 設計思想への一般論（「もっと抽象化すべき」等、差分に証拠のない主張）は出さない。
- リファクタ完了主張の反証は `refactor-claim-audit` の責務であり、本観点では扱わない。

## applyTo に `scripts/**` と `runners/**` を含める理由

`applyTo` の各 glob は拡張子で境界付けした midstream ソース限定（scoping ガイド「midstream (application source)」の範囲内）である。SIMPLIFY 観点は `src/` だけでなく `scripts/`・`runners/` で実行されるコードにも special-case が生じ得る（P2 実地検証では `scripts/**` の hygiene / 検証ロジックが対象になった）。本 skill はその applyTo 経路差を解消するため、実行コードを持つ3ルートを対象にする。`tests/**`・`docs/**`・`dist/**` は含めない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り `NO_REVIEW` を返す。dispatcher 経路では Gate が強制されないため、実行時に本文の Gate を必ず自己適用する。

- [ ] 差分に**リポジトリ内で実行されるコード**（`src/` / `scripts/` / `runners/` 配下の `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs`）の変更が含まれている。
- [ ] 差分に**呼び出し元を特定する special-case の証拠**（呼び出し元判定の条件分岐・専用フラグ・型チェックによるバイパス）が少なくとも1つ含まれている。
- [ ] `inputContext` に `diff` が含まれている。
- [ ] ビルド成果物・生成物（`dist/**`・`*.map`・lockfile・自動生成 manifest）のみの差分ではない。

ゲート不成立時の出力: `NO_REVIEW: altitude-generalization — 共有基盤への caller special-case の証拠が差分に検出されない`

## False-positive guards / 抑制条件

Gate を通過した上で、以下は指摘しない（黙る）。

- **意図的な host opt-in**: 分岐が呼び出し元 ID ではなく、任意の呼び出し元が渡せる**第一級の公開オプション/フラグ**（例: `options.compact` のような公開整形オプション）を条件にしている場合。これは bandaid ではなく正当な API 拡張である。
- **special-case が差分内に1つのみ**で、同種の先行 special-case が差分外にも存在しない場合（単発の分岐は「正しい深さ」の可能性が高く、一般化を急がない）。証拠のある同種の special-case が2つ以上そろって初めて一般化を提案する。
- 指摘行（finding の `file:line`）が差分内に無い場合。
- 意図的な非 DRY（過度な抽象化の回避）が差分・コメントから読み取れる場合。

## Rule / ルール

- 共有基盤・共通関数（複数の呼び出し元から使われる formatter / dispatcher / builder 等）に、**特定の呼び出し元のためだけ**の分岐を追加していないか。
- 既存の一般機構で表現できる変更を、機構を迂回する重複実装で足していないか。
- 同種の special-case（呼び出し元判定の分岐・専用フラグ・型チェック）が差分内・周辺コンテキストを合わせて**2つ以上**ある場合は、下層機構の一般化を代替案として提案する（例: caller ごとの整形設定を宣言的マップ/テーブルに寄せる、strategy を渡す）。

## Evidence / 根拠の取り方

- special-case の証拠（条件分岐・フラグ・型チェック）を `file:line` で名指しする。
- 「同種が2つ以上」の判定根拠となる各分岐を列挙する（差分内の追加行、または同一 hunk 内の既存行）。
- 推測を断定しない（証拠が1つしかなければ finding 化しない）。

## Output / 出力

[SKILL.md](../../agent-skills/river-review-code/SKILL.md) の Output Format に従い（Finding / Impact / Fix）、各 finding に Severity と Confidence（`high` / `medium` / `low`）を併記する。severity は**出力スキーマ語彙**（`info` / `minor` / `major`）で書く。`minor` を起点とし、bandaid の規模が大きく確証が強い場合のみ `major`。確信が持てない場合は `info` に落とす。

例:

- `src/lib/finding-formatter.mjs:51: 共有 formatter に3つ目の caller 専用分岐（markdown-exporter）を追加。Impact: caller が増えるたびに共有関数が肥大化し保守が難化。Fix: caller ごとの整形を宣言的マップに寄せ、formatFinding は表引きにする。Severity: minor / Confidence: high`

## 人間に返す条件（Human Handoff）

- 一般化が広範なリファクタ（公開 API 変更を伴う等）になる場合は、代替案を提示した上で人間レビューへ返す。
