---
id: security-model
title: River Review のセキュリティモデル
sidebar_label: セキュリティモデル
description: River Review 自身がなぜ設計上安全かをまとめます。スキルは実行コードではなく、レビューは読み取り専用で、出力はコメントのみ、承認やマージの経路を持ちません。
keywords:
  - security model
  - AIコードレビュー 安全性
  - prompt injection
  - human-in-the-loop
  - River Review
---

River Review 自身が「なぜ設計上安全か」をまとめます。脆弱性の報告手順は [非公開の脆弱性報告フォーム](https://github.com/s977043/river-review/security/advisories/new) を参照してください。

## スキルは実行コードではない

River Review のスキルは、フロントマターとプロンプト本文からなる Markdown ファイルです。`skills/` 配下に `scripts/` ディレクトリは無く、スキルがシェルやコードを実行することはありません。

スキルの「実行」とは、そのプロンプトと差分を LLM に渡してレビュー文を得ることを指します。パイプラインは `eval` / `vm` / 動的 `require` を用いず、差分を受け取るコード実行の sink もありません。決定論的な検出器は正規表現の照合のみで、`git` / `rg` の呼び出しは配列引数の `execFile` でシェルを介しません。

## レビューは読み取り専用

レビューの出力は `<file>:<line>: <message>` 形式の指摘です。形式に合わない出力は破棄され、フォールバックは決定論的なヒューリスティックに限られます。River Review はコードを変更せず、指摘と判定を材料として提示するだけです。

## 承認とマージの経路を持たない

- GitHub Action は既定で `dry_run: true` である。
- PR への投稿はコメント（`COMMENT`）のみで、承認や自動マージの経路は存在しない。
- 決定論的なゲートは「人間レビューへのエスカレーション」しかできず、GO 側へ判定を押し込む手段を持たない。

つまり、いかなる指摘も自動で承認・マージ・コード変更を引き起こしません。

## 信頼できない差分の扱い

差分は信頼できない入力としてプロンプトに含まれます。これは LLM ベースのレビュー全般に共通する prompt injection の接点であり、River Review 固有の欠陥ではありません。悪意ある差分がなし得る最悪のケースは、人間が読む「誤ったレビューコメント」までに限定されます。理由は次のとおりです。

- 出力はコメントのみで、注入によってマージや承認を起こせない。
- 指摘はフォーマット検証を通り、自由記述の注入文は破棄される。
- 検証器は、差分に存在しないファイルを根拠にする指摘を棄却する（[verifier](https://github.com/s977043/river-review/blob/main/src/lib/verifier.mjs)）。
- レビュー規約は、差分外への推測に基づく指摘を禁止している。
- 入力と出力の両方でシークレットを秘匿化（redaction）する。
- 動的なコード実行・デシリアライズを行わないため、RCE 型の「悪意あるペイロード」は成立しない。

## レビュー基準の出所

レビュー基準そのものも、差分と同じリポジトリに置かれます。[`loadProjectRules`](https://github.com/s977043/river-review/blob/main/src/lib/rules.mjs) が `.river/rules.md` と `.river/rules.d/*.md` を working tree からそのまま読み込みます。

- **rules の信頼境界**: `.river/rules.md` および `.river/rules.d/*.md` は被レビューエージェントの書込権限内にある。読み込んだテキストは信頼された policy としてプロンプトへ渡される。
- **出所を固定する機構は無い**: base ref への pin・読み込んだ rules の blob SHA 記録・schema 検証・PR 側から削減できない最低基準は、いずれも存在しない。
- **Action 経路での帰結**: GitHub Action はチェックアウトした working tree の rules を使うため、PR 内で `.river/rules.md` を弱めた変更は、その PR 自身のレビュー基準に即時反映される。
- **最悪ケースの限定**: Action は既定で `dry_run: true`（report-only）であり、承認や自動マージの経路を持たない。影響は「弱い基準で出た甘いコメントを人間が読む」までに留まる。

rules は改竄検知性のない入力です。出所の固定（base への pin・blob SHA の記録）は caller / CI の責務となります。即時の実害は小さいものの、この信頼境界が明文化されていないこと自体がリスクです。同種の記述は [ループ収束契約](../reference/loop-convergence-contract.md) の runs store についても置かれています。

## よくある誤解

- **「大規模変更 → 全スキル実行」はコード実行ではない**。これは全レビュー観点（テスト網羅性・命名・フレーキー等）を適用する、という意味である。特権操作やシェル実行を伴わない。
- **静的解析の置き換えではない**。構文・型・既知パターンの決定論的検査は専用ツールに任せ、River Review は意味的な整合性を補完する。

## 関連ドキュメント

- [脆弱性の報告フォーム](https://github.com/s977043/river-review/security/advisories/new)
- [Human Judgment Focus](./human-judgment-focus.md)
- [River Review とは](./what-is-river-review.md)
