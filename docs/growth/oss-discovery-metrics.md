# OSS Growth: 90日週次KPI台帳

River Review の外部試用と自然な Stars の増加を、**先行する利用価値と遅行する認知指標を分けて**記録するテンプレートです。対象期間は 2026-11-16〜2027-02-14（JST）。このファイルは指標定義と入力テンプレートです。**毎週の実績・判断の記録先は #2924 のコメントに一本化**します。機密を含むTraffic明細や個人情報の保存先にはしません。

> 現行の公開正本: [Growth Epic #2923](https://github.com/s977043/river-review/issues/2923) / 週次判断: [#2924](https://github.com/s977043/river-review/issues/2924)。旧施策 [#1276](https://github.com/s977043/river-review/issues/1276) / [#1282](https://github.com/s977043/river-review/issues/1282) は履歴として残します。

## 方針

- GitHub Star 数だけで成功を判断しない。README 改善・デモ・発信の実施と、第三者の**初回レビュー成功・人間が評価した有用性・7日後の実再利用**を別々に見る。
- 個人を特定する分析・有料広告の効果測定・npm downloads は対象外とする。
- 毎週月曜に取得日時・対象期間・取得元・根拠URLと作業時間を記録し、次の改善を [#2924](https://github.com/s977043/river-review/issues/2924) で判断する。
- 値の状態は `observed`（実測値、0を含む）/ `unknown`（未観測）/ `not_started`（未実施）/ `n/a`（該当なし）で区別する。未観測を0件と書かない。
- GitHub Trafficは直近14日のスナップショットとして扱う。重複した14日区間を足さず、疑わしいreferrerを実需要とみなさない。非公開Traffic明細と候補者情報は公開GitHubに転記しない。

## 追跡する指標

- **認知の結果**: GitHub Stars / Forks はリポジトリトップの時点値。実利用・指摘の有用性を代替しない。
- **接触の参考値**: GitHub unique visitors / views は Insights → Traffic のリポジトリ到達推定であり、README を読んだ人数とは断定しない。
- **取得行動の参考値**: GitHub clones は Insights → Traffic の複製イベント。自動化・重複を含み得るため、試用意欲や有効レビューの証拠としない。
- **外部到達の参考値**: Docs visits、SNS impressions、Zenn / note PV、referring sites。公開日時と取得元を残すが、同一人物やStar獲得チャネルへ安易に紐付けない。
- **コミュニティ活動**: Issues / Discussions は実際の質問・不具合・提案に分類する。投稿数だけで関心の深さや導入実績とみなさない。
- **利用価値の先行指標**: 外部の試用開始、有効レビュー完了（無介助・介助を分離）、人間の採用/棄却/保留ラベル、Time to First Value、D7実再実行。詳細は [#2925](https://github.com/s977043/river-review/issues/2925) と [#2926](https://github.com/s977043/river-review/issues/2926) の証拠に紐付ける。

> GitHub Traffic（visitors / clones / referrers）は過去14日分のスナップショットです。重なる観測窓を加算せず、非公開明細は私的な保管先に置きます。

## 成功指標と旧30日目標の区別

旧 [oss-discovery-roadmap](../roadmap/oss-discovery-roadmap.md#30-day-success-metrics) の「30日Stars +50・unique visitors 500+・clones 30+」は、旧 #1276 の**履歴上の目標**です。達成実績ではなく、現行90日実験の受入条件でもありません。

現行 #2923 は、11/16観測の **Stars 8 / Forks 1** を基準としています。90日でStars 50（stretch 100）は暫定の挑戦目標です。12/16は導入準備を点検し、1/15に試用・公開後の実績を踏まえて再評価します。各公開施策は公開日から7/14/28日で比較します。

先行指標は次の順で評価します。

1. 外部利用者の有効な初回レビュー完了人数（`run_status: completed` と対象diffの証拠が必要）。
2. 無介助で成功した人数と、失敗・介助理由（失敗した参加者を分母から除かない）。
3. 人間が採用・棄却・保留を理由付きで評価した指摘と参加人数。
4. 初回の**有効レビュー完了日から7〜13日後**の観測窓が閉じた同一完了コホートで、実際に有効レビューを再実行した人数。試用開始7日後のフォローアップとは区別し、自己申告や意向は別欄。
5. Stars / Forks の実測差分。流入元別のStar獲得を根拠なく断定しない。

## 集計の定義と保存先

- **記録先の正本**: 実際の週次集計・判定は毎週月曜に [#2924](https://github.com/s977043/river-review/issues/2924) のコメントへ1回だけ記録。下のテンプレートと11/16基準値は静的な参照資料であり、このファイルに週次ログを重ねて追記しない。Growth週30分では [#2925](https://github.com/s977043/river-review/issues/2925) / [#2926](https://github.com/s977043/river-review/issues/2926) の既存の匿名集計を転記し、再調査を重複させない。
- **観測期間**: Stars / Forks は観測日時の時点値。差分は比較可能な直前観測との差であり、週の新規イベント件数ではない。外部試用・公開URL・工数は対象週に発生したものを数える。Trafficは取得時点の過去14日窓を別記し、区間を重ねて足さない。
- **試用分母**: 参加同意人数と実際の試用開始人数を分け、外部テスターの匿名IDで週内ユニーク人数を集計する。無介助率の分母は**同じ試用開始コホートに属する開始者全員**。途中失敗、介助完了、進行中を分母から除かない。週次の開始・完了欄はそれぞれ当週のイベント人数であり、相互に割って率を出さない。2/3・4/5の探索判定も同一開始コホートで行う。失敗後に介助完了した場合は経緯として両方記録し、各欄を単純合算しない。作者のdogfoodは別計上。
- **Time to First Value（TtFV）**: 未導入ホストでREADMEを開いた時刻から、対象のtracked diffに対して**観測された有効レビュー結果**を得た時刻まで。開始・終了・所要分数・介助有無は参加者の非公開記録へ保存。週次には完了者の中央値と範囲および母数のみを集計し、失敗・未完了を仮の所要時間で補わない。「5分」は測定前の仮説。
- **人間による有用性**: 実行成立と有用な指摘は別。人間が実際のfindingを採用・棄却・保留した件数と理由、評価した参加者数を非公開証拠から匿名集計する。expected-findingsを成果に加えない。採用・棄却・保留は利用者判断であり、検出評価のTP/FP/FN/holdと混同しない。
- **D7フォローアップ（試用開始起点）**: 初回**試用開始日から7日後（JST）**に連絡する。対象は同じ開始コホートの全員であり、未完了・導入失敗・連絡不能を除かない。連絡期限の到来人数・連絡実施人数・連絡不能人数を分けて記録する。これは継続利用率ではない。
- **D7実再利用（初回有効レビュー完了起点）**: 初回の**有効レビュー完了日から7〜13日後（JST）**に、別の日の有効レビューを実行したrun証拠がある場合だけ認定する。再利用率の確定分母は、**初回有効レビューを完了し、13日後までの観測窓が閉じた同一完了コホート**とする。未成熟者を含めず、実再実行・自己申告のみ・未実施回答・連絡不能を分ける。窓が閉じるまでは追跡中として扱い、未観測を0件にしない。遅れて届いた証拠は元の完了コホートへ履歴付きで訂正する。期間外の再利用はD7に算入しない。無介助成功率の分母は引き続き試用を開始した全員とし、D7実再利用率の分母と混同しない。
- **D7記録の基準日**: 週次の実再利用欄は、**その週に観測窓が閉じた初回完了コホート**の結果を記す。その週に発生した再実行イベントの総数とは区別する。試用開始・初回有効レビュー完了・再実行・観測窓終了の日時（JST）は、非公開の照合元に残す。
- **公開情報の制限**: source_public_evidence_url には公開確認済みのGitHub Issue/PR/記事だけを置く。参加者ID・同意履歴・生ログ・非公開Traffic snapshot・私的な証拠URLは公開Issueに書かず、非公開の照合元へ保持する。公開前に少人数（3〜5名）の再識別リスクを人間が点検し、必要なら期間統合・粗粒度化・非公開化する。複数の指標の根拠が異なる場合は、公開可の範囲で指標ごとに根拠を対応付ける。

## 週次記録テンプレート（#2924 のコメント用）

次のブロックを**#2924 の週次コメントにのみ**コピーする。実測0件は observed: 0、未取得は unknown と記入する。項目ごとの根拠・母数を確認してから判定する。

```md
## Week YYYY-MM-DD—YYYY-MM-DD（JST）

- observed_at_jst: unknown
- source_public_evidence_url: unknown
- stars_at_observation: unknown
- forks_at_observation: unknown
- previous_observation_at_jst: unknown
- previous_stars: unknown
- previous_forks: unknown
- star_delta_same_basis: unknown
- fork_delta_same_basis: unknown
- traffic_14d_window_jst: unknown
- traffic_snapshot_status: unknown
- traffic_referrer_anomaly: unknown
- published_urls_and_dates_this_week: not_started
- qualified_interest_this_week: unknown
- consented_external_testers_this_week: unknown
- trial_started_participants_this_week: unknown
- completed_valid_review_this_week: unknown
- unassisted_completed_this_week: unknown
- assisted_completed_this_week: unknown
- failed_or_blocked_participants_this_week: unknown
- trial_in_progress_this_week: unknown
- ttfv_completed_participants_this_week: unknown
- ttfv_completed_median_and_range_minutes: unknown
- ttfv_no_valid_result_count_this_week: unknown
- participants_with_human_labeled_findings_this_week: unknown
- human_labeled_findings_accepted_rejected_pending_this_week: unknown
- d7_contact_due_trial_starters_this_week: unknown
- d7_contacted_trial_starters_this_week: unknown
- d7_followup_unknown_or_unreachable_trial_starters_this_week: unknown
- d7_valid_completion_window_open_this_week: unknown
- d7_valid_completion_window_closed_participants_this_week: unknown
- d7_valid_reruns_in_closed_completion_cohort_this_week: unknown
- d7_self_report_only_in_closed_completion_cohort_this_week: unknown
- d7_no_rerun_reported_in_closed_completion_cohort_this_week: unknown
- d7_unknown_or_unreachable_in_closed_completion_cohort_this_week: unknown
- growth_effort_minutes_this_week: unknown
- technical_effort_minutes_separate_this_week: unknown
- observation_vs_hypothesis: unknown
- next_decision_and_owner: unknown
```

## 固定ベースライン（過去の観測記録）

### 2026-11-16 JST（観測時刻の記録なし）

- Source: [Growth Epic #2923](https://github.com/s977043/river-review/issues/2923) に記載の時点値。
- Stars: **8（観測値）** / Forks: **1（観測値）**。
- Traffic、実試用人数、無介助成功、D7実再利用、Growth工数: **unknown（ここでは実測根拠なし）**。0件と判定しない。
- この行は**11/17時点の現在値ではない**。次週の同条件観測を取得するまで増減を計算しない。
- 旧30日施策の効果: **unknown**。Issue Closeや素材公開を利用成果に置き換えない。

## 改善ループへの接続

- `observation_vs_hypothesis` には実測と原因仮説を区別して書く。例: visitorsに対し試用が少ない場合も、導入導線が原因と断定せず、初見ユーザーの失敗ログで検証する。
- README コピーの A/B 的な変更は、変更日と指標の変化を#2924の該当週の記録に併記して判断材料にする。
- 施策ごとの流入は公開URLと参照元で照合する。ただし14日TrafficとStarの変化を単純にチャネルへ帰属させない。
- 先行3名（2/3無介助）・最終5名（4/5無介助）は少人数の探索基準。安全性・精度・市場適合を一般化しない。Gate 0・Evidence Ready・Docs Ready・Publish Gateの判断は [#2923](https://github.com/s977043/river-review/issues/2923) で記録する。
