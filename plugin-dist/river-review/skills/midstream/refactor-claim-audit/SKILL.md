---
id: 'refactor-claim-audit'
name: 'Refactor-Claim Audit リファクタ完了主張の検証'
description: 'コミット/PR の「全部置換した」「-N%削減」等の完了主張を grep で反証できる残骸や best/typical/worst 試算で検証し、抽出・集約リファクタでは並列度(Promise.all)/fast-path/遅延評価の性能特性退行と、Map/Set 集約キーの cross-kind 衝突による検出漏れも監査する'
version: 0.2.0
category: midstream
phase: midstream
applyTo:
  - '**/*.{ts,tsx,js,jsx,mjs}'
  - '**/*.md'
  - '**/*.{yaml,yml,json}'
tags:
  [
    adversarial,
    refactor-claim,
    claim-vs-actual,
    verification,
    midstream,
    cognitive-bias,
    performance-regression,
    key-collision,
  ]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 完了主張の反証は grep 検索による決定論的突合が主だが、主張がない変更では実行を止めるゲートが必要

## Goal / 目的

- 「全部置換した」「すべて移行済み」「-83% 削減」のような **完了主張**（commit message / PR description / コメント）に対し、grep で簡単に反証できる残骸や、過大な数値主張を検証する。
- 抽出（extract function/module）・集約リファクタが伴う **暗黙の挙動不変主張**（「動作は変えていない」「テストは通る」）に対し、戻り値の byte 不変では守られない**性能特性の退行**や**キー集約の衝突**を検証する。
- 「やったと書いてあること」と「実際にやれていること」のギャップを可視化する。

## Non-goals / 扱わないこと

- リファクタの設計妥当性の判断（それ自体が良い変更かは問わない）。
- 残骸が1件もない正当な完了主張への難癖（反証できなければ指摘しない）。
- パフォーマンス計測の代替（数値は主張の論理的整合性のみ検証し、実測はしない）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分・commit message・PR description に完了主張（「全」「すべて」「all」「完了」「移行済」「置換」「-N%」「削減」等）、または抽出・集約リファクタの挙動不変主張（「抽出」「切り出し」「集約」「リファクタ」「挙動不変」「動作は変えていない」「テストは通る」「extract」「refactor」「aggregate」「consolidate」「no behavioral change(s)」「behavior unchanged」「tests pass」等）が含まれている
- [ ] inputContext に diff が含まれている

ゲート不成立時の出力: `NO_REVIEW: refactor-claim-audit — 完了主張・リファクタ挙動不変主張が検出されない`

## False-positive guards / 抑制条件

- 主張の対象を grep しても残骸が見つからない場合は指摘しない（反証できない主張は正しいとみなす）。
- 残骸が意図的に残されたもの（後方互換のための alias、deprecation 期間中の旧 API 等）で、差分内にその旨が明記されている場合は抑制。
- 数値主張が範囲表記（「-47%〜-55%」）で既に幅を持っている場合は抑制。
- 性能特性の退行は、抽出**前**に並列（`Promise.all`）・fast-path・遅延評価が存在したことを差分または元コードで確認できる場合のみ指摘する。元から直列・同一評価順のコードを「直列だ」と指摘しない（新規の非効率提案は本スキルの対象外）。
- キー集約の衝突は、集約対象が単一 kind のみ、または集約キーが元から複合キーで衝突し得ない場合は指摘しない（衝突の現実的な可能性を示せないなら抑制）。

## Rule / ルール

### 検出ロジック

1. **主張の抽出**: 完了主張を抽出し、検証可能な命題に変換する。
   - 置換主張: 「A を B に全置換」→ 「repo 全体に A が残っていないはず」
   - 完了主張: 「移行完了」→ 「旧構造への参照が残っていないはず」
   - 数値主張: 「-N%」→ 「best/typical/worst のどのケースの値か」
2. **反証検索**: 主張の対象パターン（旧 API 名・旧参照形式・旧記法）を repo 全体に grep し、残骸を探す。
3. **数値の独立試算**: `-N%` 等の定量主張は、best-case / typical-case / worst-case を独立に算出し、主張値がどのケースか・過大表示でないかを併記要求する。
4. **ギャップの報告**: 主張と、それを反証する残骸 or 試算を `<file>:<line>` で示す。

### 抽出・集約リファクタの退行観点

抽出・集約リファクタは「動作は変えていない」「テストは通る」という**暗黙の挙動不変主張**を伴う。だがこの主張が守るのは戻り値・出力（byte 不変）までで、次の**非機能的な特性は検証範囲外に落ちやすい**。主張に挙動不変が含まれるとき、抽出前後のコードを対比して以下を追加監査する（grep 単独では判定できない意味論的観点）。

1. **性能特性の退行（parallelism / fast-path / 遅延評価）**: 元コードの並列性・fast path・遅延評価が、抽出後に直列化・全 async 化・先行評価へ劣化していないか。
   - 並列 → 直列: 元が `Promise.all([...])` で並行実行していた処理が、抽出後にループ内 `await`（直列）へ落ちていないか。
   - fast path の消滅: 同期で早期判定していた分岐（例: `Dirent.isDirectory()` の同期チェック）が、抽出後に一律 async 化・追加 I/O 経由へ変わっていないか。
   - 遅延 → 先行評価: 必要時のみ評価していた値が、抽出後に無条件で先行評価（余分な Promise 生成を含む）されていないか。
   - 実例: #1481/#1482 — 抽出で `Promise.all` の並列度が直列 await に落ち、Dirent の同期 fast-path が失われた（gemini 指摘、adopted）。「テストは通る」ため byte 不変検証を素通りした。
2. **キー集約の衝突退行（cross-kind collision）**: 複数ソースを単一の Map / Set / Object に集約するリファクタで、集約キーが識別子の一部（label のみ等）に落ち、**異種（kind 違い）の同名エントリが上書き・dedup されて検出漏れ**しないか。
   - 集約キーが `label` 単体になっていないか（本来は `kind:label` 等の複合キーが必要）。
   - 同名・別 kind のエントリが後勝ちで消えないか、`Set` 化で異種の重複が黙って畳まれないか。
   - 実例: #1468 — Map キーが label のみになり、kind の異なる同名エントリが衝突して片方が上書き消失し、検出漏れになった（gemini 指摘、adopted）。

### 制約

- 検出は最大 5 件。反証が明確で影響が大きいものを優先。
- 各指摘には「主張」「主張の出典」「反証（残骸位置 or 試算 or 抽出前後の対比）」を必ず含める。
- 残骸を挙げるときは grep で再現可能な検索語を明示する。
- 性能特性・キー集約の退行は、抽出前（base）と抽出後（diff）の該当箇所を `<file>:<line>` で併記し、どの特性がどう変わったかを対比で示す。

## Evidence / 根拠の取り方

- 反証する残骸は必ず `<file>:<line>` と検索語を示し、推測しない。
- 数値主張は算出根拠（分母・分子・ケース定義）を明示し、best/typical/worst を区別する。
- 性能特性の退行は、抽出前に並列（`Promise.all`）・fast-path・遅延評価が実在したことを差分または base コードで確認してから指摘する（元から直列なら退行ではない）。

## Output / 出力フォーマット

すべて日本語。

```text
(refactor-claim-audit):1: [要約] 最も過大な完了主張は〈1文〉

<file>:<line>: [完了主張の反証1] <タイトル>
  主張: 「<完了主張の引用>」(<出典: commit message | PR | file:line>)
  反証: <残骸の説明 or 試算>(検索語: `<grep pattern>`, <file>:<line>)
  実態: <主張と実態のギャップ>
  Fix: <残骸を処理するか、主張を実態に合わせて訂正する>

<file>:<line>: [完了主張の反証2] ...
```

## Good / Bad Examples

### Good

```text
sub-supervisor.md:1: [完了主張の反証] 「章番号参照を全置換」主張に対し本文7箇所が未置換
  主張: 「sub-supervisor の章番号参照 → ファイル参照に置換」(commit message)
  反証: 冒頭の参照表のみ置換、本文は §refs のまま (検索語: `§[0-9]`, sub-supervisor.md:38,68,85,87,111,123)
  実態: 7 箇所が未置換で「全置換」は不成立
  Fix: 本文 7 箇所を置換するか、commit message を「参照表のみ置換」に訂正
```

```text
scan.mjs:42: [挙動不変主張の反証] 「ヘルパーへ抽出（動作は変えない）」だが並列度が直列に退行
  主張: 「エントリ収集を collectEntries() に抽出、動作は変えていない」(PR description)
  反証: 抽出前は `await Promise.all(dirs.map(readOne))`（並列）だったが、抽出後は for-of 内 `await readOne(d)`（直列）(scan.mjs:42-48、抽出元 scan.mjs@base:31)
  実態: 戻り値は byte 不変でテストは通るが、I/O 並列度が失われスループットが退行
  Fix: 抽出後も `Promise.all` で並列実行を維持するか、直列化する旨を主張に明記
```

```text
registry.mjs:88: [挙動不変主張の反証] Map 集約でキーが label のみになり cross-kind 衝突が発生
  主張: 「skill と agent-skill を単一 Map に集約（リファクタのみ）」(commit message)
  反証: キーが `entry.label` 単体（registry.mjs:88）。kind の異なる同名 label が後勝ちで上書き消失する（検索語: `new Map`, registry.mjs:88）
  実態: 同名・別 kind のエントリが dedup され、片方が検出対象から漏れる
  Fix: 集約キーを `${entry.kind}:${entry.label}` 等の複合キーにするか、kind 別に Map を分ける
```

### Bad

```text
リファクタが不完全そうです
```

（主張の引用なし、残骸位置・検索語なし、具体性なし）

## 評価指標（Evaluation）

- 合格基準: 完了主張（または挙動不変主張）が引用され、反証が grep 再現可能な検索語 + `<file>:<line>`、明示された試算、または抽出前後の対比で示されている。
- 不合格基準: 主張の引用がない、残骸を grep で再現できない、数値試算の根拠がない、性能特性の退行を base コードでの並列/fast-path/遅延の実在確認なしに指摘している、反証できないのに指摘している。

## 人間に返す条件（Human Handoff）

- 残骸を処理するか主張を訂正するかが、後方互換や移行戦略の判断を要する場合。
- 数値主張の正しいケース定義（何を分母にするか）がチーム合意を要する場合。
