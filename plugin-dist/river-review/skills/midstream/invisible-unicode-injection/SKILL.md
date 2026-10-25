---
id: 'invisible-unicode-injection'
name: 'Invisible Unicode Injection Scan 不可視 Unicode コード注入検出'
description: '差分に追加されたソースコードへ混入した不可視・危険な Unicode 文字（タグ文字・異体字セレクター・ゼロ幅文字・双方向制御/マーク・変則空白）を検出する。GlassWorm 型サプライチェーン攻撃・ASCII smuggling・Trojan Source（CVE-2021-42574）でコードを不可視化する手口を、決定論的な静的解析（列挙した code point 集合に限定）として捕捉し、canary テストで誤検出の再発を防ぐ'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*'
tags: [unicode, supply-chain, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, actions]
modelHint: cheap
dependencies: [code_search]
exclude:
  - '**/package-lock.json'
  - '**/pnpm-lock.yaml'
  - '**/yarn.lock'
  - '**/*.lock'
  - 'dist/**'
  - '**/*.min.*'
  - '**/*.map'
  - '**/*.snap'
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 不可視・危険な Unicode 文字の混入は、文字コード（code point）で機械的・決定論に判定できる領域が大きい。よって本スキルの一次担保は `src/lib/heuristic-review.mjs` の決定論 detector（`findInvisibleUnicode`）と canary テストが担い（`.claude/rules/review-core.md` の False-positive 責務分界 #1070）、AI レビューは canary が守る範囲を重複指摘せず、文脈的な妥当性（意図した装飾か・攻撃の疑いか）の判断に限定する。危険文字の混入が無ければ実行を止めるゲートが必要。

## Goal / 目的

- 差分へ**新規追加された**ソースコード行に含まれる、不可視・欺瞞的な Unicode 文字を検出する。
- 対象は 2026 年に急増した GlassWorm 型サプライチェーン攻撃（異体字セレクター・ゼロ幅文字でコードを不可視化）と Trojan Source（CVE-2021-42574、双方向制御文字で表示順と実行順を食い違わせる手口）とする。

## 検出カテゴリ

検出対象は以下に**列挙した code point 集合に限定**する（Unicode の不可視文字を網羅するものではない）。

- **タグ文字（Tag characters）**: U+E0000–E007F。GlassWorm 実物・ASCII smuggling・LLM プロンプトインジェクションの主要ベクタ。絵文字タグシーケンス（地域旗など、絵文字ベースに付随する正当な利用）は除外する。
- **双方向制御・マーク（Bidi control/mark）**: U+202A–202E / U+2066–2069（制御）と U+061C / U+200E / U+200F（マーク）。表示上のコード順序を実行順序とすり替える（Trojan Source / CVE-2021-42574）。
- **異体字セレクター（Variation Selector）**: U+FE00–FE0F（BMP）と U+E0100–E01EF（補助面 VS17+）。GlassWorm がペイロードを不可視に符号化する手口。絵文字の見た目切り替えとして正当な単独利用（絵文字直後の 1 個・キーキャップ）は除外する。
- **不可視・ゼロ幅文字**: ゼロ幅スペース（U+200B）・WORD JOINER（U+2060）・ソフトハイフン（U+00AD）・MONGOLIAN VOWEL SEPARATOR（U+180E）・COMBINING GRAPHEME JOINER（U+034F）・不可視数学演算子（U+2061–2064）・ハングルフィラー（U+115F/U+1160/U+3164）・BRAILLE PATTERN BLANK（U+2800）・インターリニア注釈（U+FFF9–FFFB）・非先頭 BOM（U+FEFF）。
- **ゼロ幅接合子（ZWJ/ZWNJ）**: U+200C / U+200D。絵文字シーケンス内の正当な接合は除外し、識別子・キーワード中の裸の接合子のみ対象とする。
- **変則空白（Confusable whitespace）**: NBSP（U+00A0）・U+2000–200A・U+202F・U+205F・全角空白（U+3000）等。文字列リテラル・コメント外に現れた場合のみ対象とする。

## Non-goals / 扱わないこと

- 依存パッケージ内部（`node_modules` 等）の不可視文字検出（別途 CI / SCA の領域）。
- ドキュメント（`.md` / `.txt` 等）中のゼロ幅・絵文字利用。正当な装飾・組版が多く、本スキルはソースコードに限定する。**既知の受容リスク**: README 等のコードフェンスへの注入は現状すり抜ける（#1602 の教訓）。
- 上記に列挙していない Unicode 不可視文字の網羅。列挙集合の外は現状スコープ外とする。
- CJK 漢字の異体字シーケンス（IVS, U+E0100+ を非絵文字ベースに付与する正当な用途）はコードでは稀なため、補助面 VS を一律検出する副作用として誤検出しうる（**受容リスク**）。
- 機密情報（API キー・トークン）の検出（`secret-credential-scan` の領域）。SQLi / XSS 等（`security-basic` の領域）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分の**追加行**に、上記いずれかのカテゴリに該当する不可視・危険な Unicode 文字が含まれている
- [ ] その追加行がソースコードファイル（テスト・フィクスチャを除く）に属する
- [ ] inputContext に diff が含まれ、`code_search` が利用可能である

ゲート不成立時の出力: `NO_REVIEW: invisible-unicode-injection — 不可視・危険な Unicode 文字が差分に検出されない`

## False-positive guards / 抑制条件

- 絵文字シーケンス内の ZWJ（例: 家族絵文字）・絵文字直後の異体字セレクター（例: 赤いハート）・キーキャップ（例: `1` + VS16 + U+20E3）は指摘しない。
- 文字列リテラル内の NBSP など、国際化テキストの正当な組版は指摘しない（コメント・文字列外の変則空白のみ対象）。
- ファイル先頭の BOM（列 0）は正当なので指摘しない。非先頭の BOM のみ対象とする。
- ドキュメント（`.md` / `.txt` 等）・テストファイル・フィクスチャは対象外。
- 差分の追加行にない既存行（文脈行）のみに含まれる文字は対象外。

## Rule / ルール

1. **検出**: 差分の追加行を code point 単位で走査し、上記カテゴリの文字を検出する。1 行あたりの指摘は重大度順（bidi > 不可視 > 変則空白）に 1 件へ集約する。
2. **文脈判定**: 絵文字シーケンス・キーキャップ・文字列内 NBSP・先頭 BOM を上記ガードで除外する。
3. **報告**: 該当箇所を `<file>:<line>` で示し、カテゴリ・混入手口・推奨対応（該当文字の削除、意図した装飾でない限りコードに不可視文字を残さない、CI での恒久ガード導入）を述べる。文字自体の raw なバイト列は出力へ再掲しない。

## Evidence / 根拠の取り方

- 混入箇所は必ず `<file>:<line>` に紐づけ、追加行であることを確認する。
- カテゴリ（どの code point 範囲か）と、攻撃手口（表示順すり替え / コード不可視化 / トークン分割）を具体的に示す。

## Output / 出力フォーマット

すべて日本語。

```text
(invisible-unicode):1: [要約] 最も重大な不可視 Unicode 混入は〈1文〉

<file>:<line>: [不可視Unicode1] <タイトル>
  種別: <双方向制御 / ゼロ幅 / 異体字セレクター / 接合子 / 変則空白>
  混入: <どこに何が追加されたか（code point で示し、raw 文字は再掲しない）>(<file>:<line>)
  影響: <表示と実行の食い違い / コード不可視化 / サプライチェーン汚染>
  Fix: <該当文字の削除／意図した装飾の限定／CI での恒久ガード導入>
```

## 評価指標（Evaluation）

- 合格基準: 追加行の不可視・危険 Unicode のみを `<file>:<line>` で示し、絵文字シーケンス・文字列内 NBSP・先頭 BOM を誤検出していない。raw 文字を再掲していない。
- 不合格基準: 正当な絵文字・国際化テキストへの誤検出、ドキュメントやテストへの指摘、差分外への指摘、raw 文字の再掲。

## 人間に返す条件（Human Handoff）

- 検出された不可視文字が意図した装飾（絵文字・特殊組版）か攻撃かをコードから断定できない場合。
- 既にマージ済みの混入について、履歴からの除去や依存関係の再監査が運用判断を要する場合。
