# plan-conformance-demo

**Plan に反した実装を River Review がどう検出するかを、5 分で体感するための最小デモです。**

River Review の中核価値は、レビュー判断を「diff だけ」ではなく **plan / diff / tests をまたいで**実行することにあります。このデモは、承認済みプランと実装差分が食い違うとき、River Review が何を指摘するのかを具体的な期待出力（`expected-findings.json`）で示します。

> このデモは読み物として完結します。LLM の API キーや `npm install` は不要です。実際にレビューを動かしたい場合は [はじめる](../../pages/guides/quickstart.md) を参照してください。

## シナリオ

ある API に入力バリデーションを追加するタスクを想定します。

承認済みプラン（[`plan.md`](./plan.md)）はこう約束しています。

1. 入力バリデーションを追加する
2. 既存 API のレスポンス互換性を維持する
3. バリデーションエラー時は HTTP 400 を返す

ところが実装差分（[`diff.patch`](./diff.patch)）はプランから逸脱しています。

- バリデーションは追加された ✅
- しかし既存のレスポンス形式（`{ user: ... }`）を壊した ❌
- エラー時に 400 ではなく 500 を返している ❌
- プランが要求する境界値テストが追加されていない ❌（[`test-cases.md`](./test-cases.md) 参照）

## River Review が出す指摘（期待値）

機械可読な期待出力は [`expected-findings.json`](./expected-findings.json) にあります。要約すると次の 3 件です。

| #   | severity | title                                               | なぜ指摘されるか                                       |
| --- | -------- | --------------------------------------------------- | ------------------------------------------------------ |
| 1   | critical | Plan conformance violation: error status code       | プランは 400 を約束したが実装は 500 を返す             |
| 2   | major    | Backward compatibility risk: response shape changed | 既存レスポンス形式を破壊し、プランの互換性維持に反する |
| 3   | major    | Missing boundary test for validation                | プランが要求する境界値テストが追加されていない         |

いずれも「diff を読むだけ」では見落としやすく、**plan と tests を突き合わせて初めて分かる**指摘です。これが River Review の `plan / diff / tests` をまたぐレビュー判断です。

## ファイル構成

```text
plan-conformance-demo/
├── README.md             # このファイル
├── plan.md               # 承認済みプラン（レビューの基準）
├── diff.patch            # 実装差分（レビュー対象）
├── test-cases.md         # 追加されたテストと、不足しているテスト
└── expected-findings.json # River Review が出すべき指摘の期待値
```

## 次に試すこと

- 自分のリポジトリの実プランと差分で `river run` を動かす → [はじめる](../../pages/guides/quickstart.md)
- plan conformance を担うスキルの考え方を読む → [レビュー観点](../../docs/review/viewpoints.md)
