# OSS Growth: 90日週次KPI台帳

River Review の外部試用と自然な Stars の増加を、**先行する利用価値と遅行する認知指標を分けて**記録するテンプレートです。対象期間は 2026-11-16〜2027-02-14（JST）。このファイルは記録方法の補助であり、機密を含むTraffic明細や個人情報の保存先にはしません。

> 現行の公開正本: [Growth Epic #2923](https://github.com/s977043/river-review/issues/2923) / 週次判断: [#2924](https://github.com/s977043/river-review/issues/2924)。旧施策 [#1276](https://github.com/s977043/river-review/issues/1276) / [#1282](https://github.com/s977043/river-review/issues/1282) は履歴として残します。

## 方針

- GitHub Star 数だけで成功を判断しない。README 改善・デモ・発信の実施と、第三者の**初回レビュー成功・人間が評価した有用性・7日後の実再利用**を別々に見る。
- 個人を特定する分析・有料広告の効果測定・npm downloads は対象外とする。
- 毎週月曜に取得日時・対象期間・取得元・根拠URLと作業時間を記録し、次の改善を [#2924](https://github.com/s977043/river-review/issues/2924) で判断する。
- 値の状態は `observed`（実測値、0を含む）/ `unknown`（未観測）/ `not_started`（未実施）/ `n/a`（該当なし）で区別する。未観測を0件と書かない。
- GitHub Trafficは直近14日のスナップショットとして扱う。重複した14日区間を足さず、疑わしいreferrerを実需要とみなさない。非公開Traffic明細と候補者情報は公開GitHubに転記しない。

## 追跡する指標

| 指標                    | 取得元                               | 目的        |
| ----------------------- | ------------------------------------ | ----------- |
| GitHub Stars            | リポジトリトップ                     | 認知        |
| GitHub unique visitors  | Insights → Traffic                   | README 流入 |
| GitHub clones           | Insights → Traffic                   | 試用意欲    |
| Docs visits             | docs ホスティングの解析              | 導入検討    |
| Issues / Discussions 数 | Issues / Discussions                 | 関心の深さ  |
| SNS impressions         | X / 各 SNS の解析                    | 発信効果    |
| Zenn / note PV          | 各記事の解析                         | 記事効果    |
| External links          | Insights → Traffic → Referring sites | 外部流入    |

> GitHub の Traffic 指標（visitors / clones / referrers）は**過去 14 日分のみ**保持されるため、週次記録を欠かさないこと。

## 成功指標と旧30日目標の区別

旧 [oss-discovery-roadmap](../roadmap/oss-discovery-roadmap.md#30-day-success-metrics) の「30日Stars +50・unique visitors 500+・clones 30+」は、旧 #1276 の**履歴上の目標**です。達成実績ではなく、現行90日実験の受入条件でもありません。

現行 #2923 は、11/16観測の **Stars 8 / Forks 1** を基準としています。90日でStars 50（stretch 100）は暫定の挑戦目標です。12/16は導入準備を点検し、1/15に試用・公開後の実績を踏まえて再評価します。各公開施策は公開日から7/14/28日で比較します。

先行指標は次の順で評価します。

1. 外部利用者の有効な初回レビュー完了人数（`run_status: completed` と対象diffの証拠が必要）。
2. 無介助成功人数と、失敗・介助理由（失敗した参加者を分母から除かない）。
3. 人間が採用・棄却・保留を理由付きで評価した指摘と参加人数。
4. 7日後に追跡期限を迎えた人数のうち、実際に再実行した人数。自己申告や意向は別欄。
5. Stars / Forks の実測差分。流入元別のStar獲得を根拠なく断定しない。

## 週次記録テンプレート

新しい週はこのブロックをコピーして追記する。

```md
## Week of YYYY-MM-DD（JST）

- observed_at_jst: unknown
- source_and_evidence_url: unknown
- period_start_jst: unknown
- period_end_jst: unknown
- stars: unknown
- forks: unknown
- previous_stars_observation: unknown
- star_delta_same_basis: unknown
- github_traffic_14d: private_snapshot_or_unknown
- traffic_anomaly: unknown
- docs_visits: unknown
- published_posts_with_urls: not_started
- qualified_interest: unknown
- consented_external_testers: unknown
- first_review_completed: unknown
- unassisted_review_completed: unknown
- useful_finding_human_labeled: unknown
- d7_mature_participants: unknown
- d7_actual_reruns: unknown
- d7_self_report_only: unknown
- d7_unknown_or_unreachable: unknown
- growth_effort_minutes: unknown
- technical_effort_minutes_separate: unknown
- observation_vs_hypothesis: unknown
- next_decision_and_owner: unknown
```

## 記録ログ

<!-- 新しい週を上に追記する。公開版には非公開Traffic明細、個人名、同意情報、raw artifactを載せない。 -->

### Baseline（2026-11-16 JST、時刻未記録）

- Source: [Growth Epic #2923](https://github.com/s977043/river-review/issues/2923) に記載の時点値。
- Stars: **8（観測値）** / Forks: **1（観測値）**。
- Traffic、実試用人数、無介助成功、D7実再利用、Growth工数: **unknown（ここでは実測根拠なし）**。0件と判定しない。
- この行は**11/17時点の現在値ではない**。次週の同条件観測を取得するまで増減を計算しない。
- 旧30日施策の効果: **unknown**。Issue Closeや素材公開を利用成果に置き換えない。

## 改善ループへの接続

- `observation_vs_hypothesis` には実測と原因仮説を区別して書く。例: visitorsに対し試用が少ない場合も、導入導線が原因と断定せず、初見ユーザーの失敗ログで検証する。
- README コピーの A/B 的な変更は、変更日と指標の変化をこのログに併記して判断材料にする。
- 施策ごとの流入は公開URLと参照元で照合する。ただし14日TrafficとStarの変化を単純にチャネルへ帰属させない。
- 先行3名（2/3無介助）・最終5名（4/5無介助）は少人数の探索基準。安全性・精度・市場適合を一般化しない。Gate 0・Evidence Ready・Docs Ready・Publish Gateの判断は [#2923](https://github.com/s977043/river-review/issues/2923) で記録する。
