---
id: 'plangate-verification-audit'
name: PlanGate 検証監査 (W チェック)
description: 既存のレビュー結果 (review-self / review-external) を再点検し、漏れ・誤検知・ハルシネーション・根拠欠落を検出する W チェック skill
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/review-self.md'
  - '**/review-external.md'
tags: [plangate, verification, w-check, audit, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions, review-audit]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 既存レビュー（`review-self` / `review-external`）を artifact として読み込み、差分および上流 artifact と突き合わせて「レビューに対するレビュー（META finding）」を返す再照合型の skill。入力となるレビューが揃わない場合は実行を止めるゲート（Inversion）として機能する。

## Goal / 目的

- 既に生成されたレビュー（`review-self` / `review-external`）を W チェック（二重レビュー）し、漏れ・誤検知・ハルシネーション・根拠欠落・過剰指摘を検出する。
- 元コードに対する直接指摘ではなく、**レビューそのものの品質**を対象とする META finding を返し、後続の人間判断や Riverbed Memory に再評価材料を提供する。
- `river review verify` CLI（`pages/reference/cli-review-verify-spec.md`）から呼び出される verify 系 skill として、verify ファミリー制限に適合した単一責務の監査を行う。

## Non-goals / 扱わないこと

- 実装コード自体の品質レビュー（midstream / downstream skill の責務）。
- 計画アーティファクト（`plan` / `pbi-input` / `todo` / `test-cases`）の内部整合性チェック（姉妹 skill `plangate-plan-integrity` の責務）。
- 差分が plan と整合しているかの検査（姉妹 skill `plangate-exec-conformance` の責務）。
- 既存レビューの severity 再マッピング全般（本 skill は「過剰指摘」観点のみに限定し、妥当な severity の再評価は行わない）。
- レビューアーの意図や主観の推定。書かれた内容から客観的に判断できる範囲のみを扱う。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 入力 artifact に `review-self` または `review-external` のいずれか1つ以上が解決できている（`pages/reference/artifact-input-contract.md` の ID に準拠）
- [ ] `diff` artifact が解決できている（未指定時は `git diff <mergeBase>..HEAD` による fallback を許容）

ゲート不成立時の出力: `NO_REVIEW: plangate-verification-audit — レビュー入力 (review-self / review-external) または diff が不足`

**Gate と抑制条件の違い:**

- Gate = 監査対象となるレビューまたは差分が揃わなければ W チェックは成立しない。
- 抑制条件 = 実行した上で個別の META finding を抑える。

## False-positive guards / 抑制条件

- 既存レビューが「info」や「参考」として明示的に弱い推奨にとどめている項目を、漏れ・過剰指摘として指摘しない。
- 既存レビューが「推測」「要確認」「後続 Issue に回す」と明示的に不確実性を宣言している項目は、根拠欠落として扱わない。
- diff の fallback 取得で `mergeBase` が曖昧（浅い clone 等）な場合、差分に該当行が見つからない指摘を即ハルシネーションと断定しない。`[q]` として質問に回す。
- `plan` / `test-cases` が未提供の場合、受け入れ条件カバレッジに関する漏れ検出は抑制し、`info` レベルの補足通知にとどめる。
- 既存レビューが自動生成コメント（依存更新、フォーマット）に向けた定型的な観察のみで構成される場合、過剰指摘として扱わない。

## Rule / ルール

既存レビューを以下の観点で再点検する。1 観点=1 指摘を原則とし、最大 8 件まで。

### 1. 漏れ検出 (omissions)

- `pbi-input` / `plan` の主要な受け入れ条件や明示された重大リスクが、既存レビューで一切カバーされていないか。
- diff に含まれる明らかな懸念点（エラー処理欠落、破壊的変更、テスト不足）が既存レビューで触れられていないか。

### 2. 誤検知検出 (false positives)

- 既存レビューの指摘が、diff に実在しない条件（コード、分岐、API 使用）を前提にしていないか。
- `plan` / `pbi-input` / `test-cases` で明示的にスコープ外・対応済みと宣言されている項目を、既存レビューが問題視していないか。

### 3. ハルシネーション検出 (hallucination)

- 既存レビューが参照する `<file>:<line>` が diff に存在するか。存在しない file / line / symbol を名指ししていれば指摘する。
- 実在しない API、ライブラリ、仕様名を根拠として使っていないか。

### 4. 根拠欠落 (missing grounding)

- 既存レビューの finding が、どの artifact（`plan` / `pbi-input` / `test-cases` / diff の具体行）を根拠にしているか不明瞭でないか。
- 「一般論としてこうあるべき」のみで具体的 evidence を欠く指摘を抽出する。

### 5. 過剰指摘 (over-flagging)

- 既存レビューの severity が、diff の実態（影響範囲、発生確率、回復容易性）と比較して明らかに高く付けられていないか（例: 局所的な nit を critical としている等）。
- 単一の根拠から派生する複数指摘を重複して高 severity で列挙していないか。

## Evidence / 根拠の取り方

- 各 META finding は「どのレビューの何行目が、どの artifact のどこと、どう食い違うか」を具体的に示す。
- Evidence 行には `review-self: L<n>` または `review-external: L<n>` と、対応する `artifact: <ref>`（例: `diff: src/foo.ts:42` / `plan: §設計判断` / `pbi-input: 受け入れ条件#3`）をペアで示す。
- 推測ではなく、参照した artifact の記述（または欠落）を根拠にする。既存レビュー本文の引用は最小限（1 文以内）にする。
- diff に存在しないコードへの推測に基づく META finding は禁止（`review-core` ルール遵守）。

## Output / 出力

すべて日本語。`<file>:<line>: <message>` 形式。

- 先頭に要約を 1 行: `(summary):1: <W チェック総評：健全 / 軽微な漏れ / 重大な誤検知あり 等>`
- 以降は META finding（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を必ず含める。
  - 「どの既存レビューの、どの観点（漏れ/誤検知/ハルシネーション/根拠欠落/過剰指摘）に該当するか」を 1 文で示す。
  - `Evidence — review-self: L<n>` または `review-external: L<n>` と `artifact: <ref>` を併記する。
  - `Fix: <最小の是正案>`（追記 / 取り下げ / severity 見直し / Evidence 追加）を 1 行で付す。

例:

- `(summary):1: review-external は主要観点を概ね網羅。ハルシネーション 1 件、過剰指摘 1 件を検出。`
- `review-external.md:18: [severity=major] diff に存在しない関数 'validateToken()' を根拠にした指摘（ハルシネーション）。Evidence — review-external: L18, artifact: diff に該当 symbol なし。Fix: 指摘を取り下げるか対象関数名を修正。`
- `review-self.md:7: [severity=minor] 「命名が不適切」との指摘に diff の具体行参照がなく根拠が不明瞭。Evidence — review-self: L7, artifact: diff の対応行なし。Fix: 対象 <file>:<line> を併記するか取り下げ。`

## Severity の割り当て方針

META finding の severity は**外部語彙**（`critical` / `major` / `minor` / `info`）で直接付与し、`.claude/rules/review-core.md` のマッピング（内部語彙 blocker/warning/nit/info → 外部語彙 critical/major/minor/info）に整合させる。詳細は `docs/review/output-format.md`（severity の SSoT）を参照。

- `critical`: 既存レビューが diff に存在しない重大事項を critical / blocker として指摘している（誤検知による CI ブロック等）、または重大リスクを完全に見落としている。
- `major`: 主要観点の漏れ 1 件以上、明確なハルシネーション、または severity が 2 段階以上過大な過剰指摘。
- `minor`: 軽微な根拠欠落、1 段階の過剰指摘、軽微な漏れ（info 相当の補足）。
- `info`: 改善余地の提案、既存レビューが妥当であることの確認通知、`plan` 未提供による部分監査の旨。

不明な severity 値が発生した場合は fail-safe として `major` に分類する（`.claude/rules/review-core.md`）。

## Heuristics / 判定の手がかり

- 既存レビューの `<file>:<line>` を抽出し、diff の hunk ヘッダと突き合わせてハルシネーションを判定する。
- `pbi-input` / `plan` の箇条書き受け入れ条件数と、既存レビューで言及されている条件数の差を漏れ検出の手がかりにする。
- 既存レビュー内で severity ラベル（`[severity=...]` / `Critical` / `blocker` 等）の分布を取り、diff の規模・影響範囲と著しく乖離していれば過剰指摘を疑う。
- 既存レビューの指摘から Evidence 行（`diff:` / `plan:` / `test-cases:` などの参照）の有無を抽出し、欠落件数を根拠欠落のスコアに用いる。
- `plan` / `pbi-input` に「スコープ外」「別 PR で対応」と明記された項目に対する既存レビューの指摘は誤検知候補として優先確認する。

## 評価指標（Evaluation）

- 合格基準: 各 META finding が既存レビューの具体行（`review-self` / `review-external` の L<n>）と、対応する artifact 上の根拠（または欠落）を双方示している。severity が 5 観点（漏れ/誤検知/ハルシネーション/根拠欠落/過剰指摘）のいずれかに明確に紐づく。
- 不合格基準: 既存レビューの内容を抽象化した一般論、diff に存在しないコードへの推測に基づく META finding、抑制条件の無視、「既存レビューが不十分」のみの漠然指摘。

## 人間に返す条件（Human Handoff）

- 既存レビューが多数の指摘を持ち、監査結果が 8 件の上限を超える可能性が高い場合（`questions` で優先度判断を仰ぐ）。
- `review-self` と `review-external` で指摘が真っ向から対立しており、どちらが妥当か artifact のみでは判断できない場合。
- 既存レビューが主観的・裁量的な設計判断（命名、アーキテクチャ選好）を主題とし、W チェックの客観的根拠に乏しい場合。
- diff や artifact が W チェック継続に十分な情報を含まないと判断される場合（部分監査の旨を `info` で明示しつつ、`questions` で再実行条件を提示する）。

## Execution Steps / 実行ステップ

1. **Gate**: `review-self` または `review-external` のいずれかが解決でき、かつ `diff` が解決できているか確認。不成立なら `NO_REVIEW`。
2. **Extract**: 既存レビューから `<file>:<line>` 参照、severity ラベル、Evidence 行を抽出。diff の hunk 構造と `plan` / `pbi-input` / `test-cases` の受け入れ条件を対応表に整理。
3. **Cross-check**: 5 観点（漏れ / 誤検知 / ハルシネーション / 根拠欠落 / 過剰指摘）で突き合わせ、候補を列挙。抑制条件に該当するものを除外。
4. **Rank**: 重大リスクの見落とし・ハルシネーションを高 severity に、軽微な根拠欠落・1 段階の過剰指摘を低 severity に並べる。最大 8 件に絞る。
5. **Output**: 要約 + META finding を日本語で出力。Human Handoff 条件に該当する場合は `questions` で返す。

## 関連ドキュメント

- `pages/reference/cli-review-verify-spec.md` — `river review verify` CLI の呼び出し契約と verify ファミリー制限
- `pages/reference/artifact-input-contract.md` — 入力 artifact の契約（ID / 形式 / 欠損時挙動）
- `docs/review/output-format.md` — severity とコメント形式の SSoT
- 姉妹 skill: `plangate-plan-integrity` — 計画アーティファクト自体の整合性チェック
- 姉妹 skill: `plangate-exec-conformance` — 差分と plan の整合性チェック
- 親: Capability #510 / Epic #507 / Task #577
