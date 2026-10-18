# upstream-design-review-demo

**設計フェーズ（upstream）のレビューを River Review がどう行うかを、5 分で読める最小デモです。**

[`plan-conformance-demo`](../plan-conformance-demo/README.md) が midstream（plan 対 diff）を扱うのに対し、こちらは **upstream**——コードを書く前の設計プラン／ADR そのものをレビュー対象にします。River Review は SDLC の上流でも、チームの設計基準に対する判断を実行できます。

> このデモは読み物として完結します。LLM の API キーや `npm install` は不要です。

## シナリオ

新しい Webhook 配信機能の設計プラン（[`design-plan.md`](./design-plan.md)）をレビューします。プランは機能要件は書けていますが、**設計上の重要な観点が抜けています**。

- 失敗時のリトライ／配信保証の方針が未記載 ❌
- ペイロードのバージョニング・後方互換の方針が未記載 ❌
- 可観測性（メトリクス／アラート）の計画が未記載 ❌

これらは「コードを書く前」に設計で詰めるべき事項で、midstream の diff レビューでは手遅れになりがちです。

## River Review が出す指摘（期待値）

機械可読な期待出力は [`expected-findings.json`](./expected-findings.json) にあります。要約すると次の 3 件（すべて `phase: upstream`）です。

| #   | severity | title                                               | なぜ指摘されるか                                       |
| --- | -------- | --------------------------------------------------- | ------------------------------------------------------ |
| 1   | major    | Missing failure-mode and retry design               | 配信失敗時の挙動・リトライ・冪等性が設計に無い         |
| 2   | major    | No payload versioning / backward-compatibility plan | ペイロード進化時の互換方針が無く、後で破壊的変更になる |
| 3   | minor    | No observability plan                               | 配信成功率・遅延の計測やアラートの計画が無い           |

いずれも実装差分には現れず、**設計ドキュメントを読んで初めて分かる**指摘です。これが upstream ゲートのレビュー判断です。

## ファイル構成

```text
upstream-design-review-demo/
├── README.md             # このファイル
├── design-plan.md        # レビュー対象の設計プラン / ADR
├── review-points.md      # 設計レビューで見る観点と、本プランの過不足
└── expected-findings.json # River Review が出すべき指摘の期待値
```

## 次に試すこと

- 自分のリポジトリの設計プラン（ADR / RFC）で upstream レビューを動かす → [はじめる](../../pages/guides/quickstart.md)
- 上流レビューの観点を読む → [レビュー観点](../../docs/review/viewpoints.md)
