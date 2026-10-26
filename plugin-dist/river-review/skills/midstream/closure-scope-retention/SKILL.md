---
id: 'closure-scope-retention'
name: Closure Scope Retention Guard
description: Detects long-lived objects (caches, listeners, singletons) that capture an entire enclosing scope via closures/environment capture, keeping large arrays or buffers alive, and proposes copying only the needed fields.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}'
  - 'runners/**/*.{ts,tsx,js,jsx,mjs,cjs}'
tags:
  - simplify
  - memory
  - closure
  - retention
  - midstream
severity: major
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

> 由来: Claude Code の `/simplify`（Efficiency 観点の closure 保持）に由来（inspired by）。Issue #1452 P3 で、`skills/agent-skills/river-review-code/references/SIMPLIFY.md` から closure スコープ保持の詳細検出を本 registry skill へ委譲した。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 長寿命オブジェクトの closure 保持をチェックリストで評価するが、保持の証拠が差分に無い変更では実行しない。

## Goal / 目的

- 長寿命オブジェクト（キャッシュ・リスナー・シングルトン・戻り値として保存されるオブジェクト）が、closure/環境キャプチャで enclosing scope 全体（大きな配列・一時バッファ等）を生存させ続けるメモリ保持を防ぐ。
- 必要なフィールドだけをコピーする形（class / 明示フィールド化 / 縮約済み構造）を促す。

## Non-goals / 扱わないこと

- correctness bug・セキュリティ欠陥は対象外（bug 系・security 系観点の責務）。
- 短命な関数スコープ内で完結し、戻り後に到達不能になる一時変数は対象外。
- 一般的なパフォーマンス最適化論（ホットパスの計算量など）は SIMPLIFY 側 Efficiency の残余に委ねる。

## applyTo に `scripts/**` と `runners/**` を含める理由

`applyTo` の各 glob は拡張子で境界付けした midstream ソース限定（scoping ガイド「midstream (application source)」の範囲内）である。長寿命 singleton / キャッシュは `src/` に限らず `scripts/`・`runners/` の常駐プロセス・起動パスにも生じ得るため、SIMPLIFY の applyTo 経路差を解消する目的で実行コードを持つ3ルートを対象にする。`tests/**`・`docs/**`・`dist/**` は含めない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り `NO_REVIEW` を返す。dispatcher 経路では Gate が強制されないため、実行時に本文の Gate を必ず自己適用する。

- [ ] 差分に**リポジトリ内で実行されるコード**（`src/` / `scripts/` / `runners/` 配下の `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs`）の変更が含まれている。
- [ ] 差分に**長寿命オブジェクト**（module-level singleton・キャッシュ・登録されるリスナー・戻り値として保存されるオブジェクト）を **closure/環境キャプチャで構築する証拠**が含まれている。
- [ ] その closure が **enclosing scope の大きなデータ**（ファイル全文・大配列・一時バッファ・パース済みドキュメント群）を到達可能に保っている証拠がある。
- [ ] `inputContext` に `diff` が含まれている。

ゲート不成立時の出力: `NO_REVIEW: closure-scope-retention — 長寿命オブジェクトによる大きな scope の closure 保持が差分に検出されない`

## False-positive guards / 抑制条件

Gate を通過した上で、以下は指摘しない（黙る）。

- **即時縮約して解放されるケース**: 大きなデータを読み込んでも、その場で必要フィールドだけを小さな構造（Map・plain object・プリミティブ）へコピーし、関数リターン後に元データが到達不能（GC 可能）になる場合。closure が元データを掴んでいないなら保持は起きない。
- 短命なオブジェクト（同一 tick / 同一リクエスト内で破棄される）に対する保持は対象外。
- 保持しているデータが小さい（数十 KB 未満が明らかな）場合。
- 指摘行（finding の `file:line`）が差分内に無い場合。

## Rule / ルール

- 長寿命オブジェクトを組み立てる closure が、必要な小さいフィールドだけでなく **enclosing scope の大きな変数**（`rawText`・`documents`・`allEntries` 等）を参照し続けていないか。
- アクセサ（メソッド）が閉じ込めた大きな配列を毎回線形探索する等、**縮約すれば済む**構造を大きいまま抱えていないか。
- 修正案は「必要なフィールドだけをコピーする」形を具体的に示す（例: `id -> severity` の `Map` を事前構築し、closure は大きな元データを掴まない）。

## Evidence / 根拠の取り方

- 長寿命オブジェクトの宣言（`let cached = ...` / シングルトン / リスナー登録）を `file:line` で示す。
- closure が掴んでいる大きな変数名と、それが解放されない経路を示す。
- 「小さくコピーすれば足りる」ことを、実際に読まれているフィールド（例: `id` と `severity` のみ）で裏づける。

## Output / 出力

[SKILL.md](../../agent-skills/river-review-code/SKILL.md) の Output Format に従い（Finding / Impact / Fix）、各 finding に Severity と Confidence（`high` / `medium` / `low`）を併記する。severity は**出力スキーマ語彙**（`info` / `minor` / `major`）で書く。保持データが MB 級で長寿命が明確なら `major`、規模が中程度なら `minor`、確信が持てない場合は `info` に落とす。

例:

- `src/lib/skill-cache.mjs:18: module-level singleton の accessor が closure で rawText / documents / allEntries（MB級）を保持。Impact: プロセス生存中ずっと元データが解放されずメモリを圧迫。Fix: 生成時に id -> severity の Map へ縮約し、closure は大きな元データを掴まない。Severity: major / Confidence: high`

## 人間に返す条件（Human Handoff）

- 保持データのサイズ・寿命の見積もりに強い不確実性がある場合は、計測を促して人間レビューへ返す。
