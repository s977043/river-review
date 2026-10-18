---
id: small-change-shadow
sidebar_label: Small-change Shadow 評価
---

# Small-change Shadow 評価（実験）

> **Experimental / Observe-only**。本ガイドおよび付属スクリプトは PR の承認・マージ・review depth の変更を行いません。`candidate` は「入力された観測値の下で低リスク候補」という意味であり、**GitHub の承認可否や信頼済み証跡ではありません**。

## 出典・目的

Will Larson, [Speeding up code review with `small-change`](https://lethain.com/small-changes/)（2026-10-17）。Imprint は小さな PR を限定条件下で迅速に承認する実験と、複数 PR の `review-pr-cluster` を紹介しています。ただし、約10%は初期候補率であり、品質向上・時間短縮の因果的な実証ではありません。

River Review はこの実装をコピーしません。既存の [Review Mode Router](https://github.com/s977043/river-review/issues/2034)、[Review Resolution](https://github.com/s977043/river-review/issues/2322)、[Historical Knowledge](https://github.com/s977043/river-review/issues/2614)、[Evolution](https://github.com/s977043/river-review/issues/1574) の役割を保ちながら、承認自動化の判断前に**除外・不明・候補の割合**を実測できるか検証します。

## 責務境界

| 情報                          | 正本・責務                                  | Shadow の扱い                                                     |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| 変更・head SHA                | Host / GitHub                               | 取得された情報を入力として読むだけ                                |
| review depth / risk-map       | 既存 Router / risk-map                      | 昇格・human-required は除外。無検証のデフォルトを安全証明としない |
| AI findings / Review Coverage | 既存レビュー・Coverage                      | 未完了・欠落は不明。指摘ゼロと完了は別                            |
| CI・branch protection         | Host / GitHub                               | SHA付き観測を受け取る。APIで確認した事実とは扱わない              |
| サービス境界・履歴            | Host の履歴集計・repo-owned policy          | 全サービスで過去10件以上の実績が必要                              |
| PR承認・マージ                | Host / Human / governance                   | **一切行わない**                                                  |
| チーム知見                    | Resolution → 人間確認 → Promotion/Evolution | PR clusterからの仮説を確認済み Feedbackへ転換                     |

### 自動承認しない理由

入力 JSON は任意のユーザーが編集できます。実行スクリプトはデータの**形と整合性**しか検査できず、CI、サービス境界、経験件数、本人性を認証・証明できません。`candidate` を CI の成功ステータス、PR review、`approve` 権限に変換することは禁止です。Host 側に独立した取得・検証・改ざん防止を持つまで権限を付与しません。

## オフライン実行

```bash
node scripts/experiments/small-change-shadow.mjs --input /path/to/observations.json
node --test tests/small-change-shadow.test.mjs
```

入力は1つの PR の観測値です。原則として以下を含みます。

- `subject.headSha`（40文字の Git SHA）
- `change.changedLines` と `change.changedFiles`（変更行数・raw manifest）
- `route`: 同じ SHA・`selectedMode`・`riskAction`・`policyApplied`
- `review`: 同じ SHA・`state`・`coverage`・`majorOrCriticalCount`
- `checks`: 同じ SHA・`state`（必須CI全件確認の結果を Host が作ること）
- `scope`: 同じ SHA・`classifiedChangedFiles`・`classificationComplete`・`sharedLibraryTouched`・`sensitiveAreaTouched`・全影響サービスの `priorMergedPrs`
- `policy`: `maxServicesInclusive`（*リポジトリ所有*の明示閾値）、`excludedPathPrefixes`（明示パス除外）

存在しないフィールドを `false` / `0` と補完しません。スクリプトは承認可能性の証明ではなく**整合性診断**です。重大な違反は `excluded`、入力・証跡が不十分な場合は `unknown`、全て満たす場合のみ `candidate` とします。結果には常に `authorizesApproval: false` と `evidenceTrust: "unverified-input"` が含まれます。

### 境界値・例外

Imprint 記事の影響サービス数には「fewer than N」と N=1（frontend）/N=3（backend）の説明があり、境界値の解釈が曖昧です。この実験ではそれをコピーせず、**明示的な** `maxServicesInclusive` を要求します。1,000行は記事と同じく**1,000未満**（999までは候補、1,000は除外）、全影響サービスの履歴は**10件以上**とします。River Review は Major / Critical と Imprint の P1/P2 を同値と断定しません。比較には severity 対応表と人間による検証が必要です。

## PR cluster → チームナレッジ

一定期間の実PRを小バッチでまとめ、修正理由、繰り返し発生した問題、レビューで見逃した問題、CI/テストへ移せる検証を観測します。提案は `#2322 Review Resolution` と `#2614 Historical Knowledge` に渡し、**人間が確認した結果のみ** `#1568 Promotion` / `#1574 Evolution` に流します。PR 数や同じコメントの出現回数だけでルールを自動昇格しません。機密情報はマスキングし、元 PR や判断根拠への参照を残します。

## 段階導入と停止条件

1. 合成 fixture で positive/negative と missing/stale 証跡を検証する。
2. 実PRの読み取り専用な後追い観測を 5〜10件収集し、`candidate / excluded / unknown`、判定理由、Human 確認負担、重大指摘見逃し、p50/p95レビュー待ち時間を記録する（未観測は `unknown`）。
3. 既存レビューとの paired comparison を独立評価する。false-green が1件でも見つかれば拡大を停止する。
4. 承認・マージポリシー変更はこの Issue の対象外。別Issueで Human / Host が明示承認する。

Tracking: [#2722](https://github.com/s977043/river-review/issues/2722)。

## 既存PRのオフライン集計と証跡不足の扱い

2026-10-18に、GitHubで過去にマージされたPR 10件のHEAD SHA、変更行数、変更ファイル一覧を確認しました。対象PRは #2720 / #2718 / #2716 / #2713 / #2711 / #2712 / #2708 / #2710 / #2709 / #2707 です。

履歴サンプルは `tests/fixtures/small-change-merged-pr-metadata.json` に保存しています。認証済みReview Coverage、risk-map適用、サービス別の経験件数、必須CI証跡は含みません。

```bash
node scripts/experiments/small-change-shadow-batch.mjs --input tests/fixtures/small-change-merged-pr-metadata.json
node --test tests/small-change-shadow-batch.test.mjs
```

バッチ集計の予定値は **candidate 0 / excluded 2 / unknown 8** であり、`candidateShare: null` です。2件はPR内のGitHub Actions設定変更という明示的な除外条件で分類され、8件は判定に必要な証跡が不足しています。**候補率0%ではありません**。すべての結果には `authorizesApproval: false` を付けます。

任意のJSONで結果を偽装できるため、すべての証跡が揃った入力で `candidateShare` が数値になっても、それは **入力ベースのShadow集計値**であり、実運用の承認可能率ではありません。実運用での候補率や効果を主張する前に、Hostが取得元とHEAD SHAを検証し、レビューの独立性、感度分類、Human確認、ベースライン比較を別途完了する必要があります。[Issue #2722](https://github.com/s977043/river-review/issues/2722)で追跡します。

この履歴サンプルは `#2614` のHistorical Team Knowledge Bootstrapの確認済み判断ではなく、`#2615` のPromotion/Evolution評価データでもありません。PRコメント、マージ済み状態、AIの0件指摘を正しさの証拠として昇格しません。
