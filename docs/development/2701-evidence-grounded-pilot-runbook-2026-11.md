# #2701 Evidence-grounded Review PoC—実行・判定計画

> **Status: Proposal / observe-only（2026-11-15 JST）**。これは評価運用の作業計画であり、新しい製品仕様・品質Gate・承認・自動昇格の許可ではない。
> 対象: `s977043/river-review`、計画時の `main` = `1c78b6ed93adb2aa421c72dd1a6b64d2c9af1fc4`。実行前にリモートHEAD、PR、CIを再取得する。
> Owner: [#2701](https://github.com/s977043/river-review/issues/2701)（正解データ）、[#1574](https://github.com/s977043/river-review/issues/1574)（paired replay）、[#2615](https://github.com/s977043/river-review/issues/2615)（効果）、[#2378](https://github.com/s977043/river-review/issues/2378)（Human Attention）。本書自体を新SSoTにはしない。

## 1. Decision / 完了条件

**最初の実験は、既存の重大指摘を独立のコード・実行根拠で確認し、正しい指摘を落とさず有害な誤指摘を減らせるかを測る。** 反証探索は、重大指摘に対する単一の候補差分としてのみ扱う。結果を見てから仮説・分母・閾値を変更しない。

- **このPRの完了条件**: 実行者、順序、依存関係、最小データ、比較条件、採点、停止条件、未確認事項が既存のOwnerに接続され、運用者がPhase 0へ進めること。
- **PoCの完了条件（別）**: 正解が独立確認された陽性・陰性ケース、比較可能な保存済みrun、独立採点、人の確認時間、費用を揃え、Humanが `Keep / Adapt / Revert / Defer` を判断できること。
- **非目的**: 新しい評価エンジン・永続Schema・レビュアー役・必須Gate・定期cron・本番デプロイ・レビュー削減・自動承認・自動マージ・Skill自動昇格・無承認の外部コード実行。過去Incident全件を自動収集しない。
- **信頼境界**: Evidence ≠ Judgment、Observation ≠ Attestation、Trigger ≠ Permission。LLM出力、`metadataStatus: complete`、fingerprint一致、CLI exit 0、PRのマージは、いずれも独立の不具合正解または採用許可にならない。

## 2. 既存資産との重複回避

<!-- prettier-ignore -->
| 既存資産 | 再利用する責務 | 今回追加しないもの |
| --- | --- | --- |
| [#2844](https://github.com/s977043/river-review/pull/2844) / `scripts/experiments/incident-review-smoke-preflight.mjs` | 人間が提出したケース**メタデータの構造**を検査する（read-only） | Ground truth の真正性検査、実際の精度の計算 |
| `docs/development/2701-incident-revert-reviewer-benchmark-gap-analysis.md` | ケース適格性、信頼境界、分母、実験停止規則 | 類似した正解DB・永続データ契約 |
| `river evolve replay` / `docs/development/1574-p2-paired-replay.md` | 保存済みbaseline/candidateのfingerprint突合、Manifest、held-out、activation観測 | LLM再実行、指摘の真偽判定、自動採用 |
| [PR #2881](https://github.com/s977043/river-review/pull/2881)（Open・未マージ、2026-11-17確認） | Verification-First / リスク別レビューの**広い**A/B/C評価計画 | 同じ内容の大規模な再設計。こちらは実験運用の一候補に限定 |
| [#2781](https://github.com/s977043/river-review/issues/2781)、[#2267](https://github.com/s977043/river-review/issues/2267) | リスク評価、反証・独立検証 | 製品Gate変更、外部検証基盤の新設 |
| [#2812](https://github.com/s977043/river-review/issues/2812)、[PR #2912](https://github.com/s977043/river-review/pull/2912) | 未実行をcleanと誤表示する問題、detector→strict blockの回帰を個別Ownerで扱う | このPoC文書PRで未関連のruntime修正を同梱しない |

`#2812` のfalse-clean問題が未解決なら、今回のshadow実験は「未実行/未検証を可視化する観測」に限る。**本番のレビュー深さの削減・Gate緩和への移行はしない。**

## 3. まず比較対象を最小化する（実験プロトコル）

### 主仮説と評価範囲

- **Baseline A**: 同じrevisionの現行Reviewerが返した保存済み指摘。
- **Candidate B**: **Aと完全に同じ指摘集合を入力**に、重大指摘について独立した根拠照合・反証探索を追加し、`retain / refute / inconclusive` を記録する候補。
- 最初の比較は**post-reviewの指摘選別の品質**であり、新しい不具合を発見する能力の比較ではない。Aの見逃しをBが検出したと主張しない。
- 根拠照合の仕様・検証対象・期待値は、Bから変更できない独立領域へ事前固定する。検証環境が失敗したら `inconclusive` であり `refute` や `clean` ではない。
- 可能なら同じ保存済みReviewer runを両条件で再利用し、追加Reviewerの呼び出しを省く。現行run形式がBへの再評価を許容しない場合、実行器を二重実装せず、両armの `river run` を同条件で保存する計画へ切り替える。**この接続可能性は未検証**。
- **replayの観測範囲**: `src/lib/paired-replay.mjs` の `pairFindings` はfingerprintとseverityの有無・変更を比較する。`retain / refute / inconclusive` の判定だけを変えても `activationCheck.observedDifference` はfalseのままになり得る。その結果の `activationCheck.verified: false` を「Verifierが実行されなかった」という確定事実にはせず、別の実行traceを確認する。**このPoCの本採点は独立のfinding判定台帳が担当**し、paired replayは観測可能なfinding差分がある場合の補助指標とする。差分を発生させるために本来維持すべき指摘を落とす操作は禁止。
- 独立の正解判定者はA/Bの作者や採用候補から分離する。分離できない場合、探索結果は `exploratory` と明示し、本番採用判断には使わない。

### 固定条件

<!-- prettier-ignore -->
| 固定するもの | 記録する値 |
| --- | --- |
| レビュー対象 | repository、base/head完全SHA、merge base、diff範囲、レビュー時点 |
| モデルとHarness | provider/model/version/effort、prompt・Skill digest、ツール権限、予算、context、routing |
| 評価 | 独立のoracle（候補側に非公開）、採点ルーブリック、試行回数、evaluator version |
| データセット | case ID、snapshot digest、`development` / `held_out`、凍結日時 |
| 実行 | run ID、開始/終了、再試行、timeout、失敗理由、実支出、Hostが測った確認時間 |

候補でReviewerモデルやpromptまで変えた場合、独立のverifier効果ではなく **Model + Harness の結合変更**として報告する。

## 4. 実行フェーズと依存関係

<!-- prettier-ignore -->
| Phase | 作業（先行条件） | 成果物・出口条件 | 今回時点 |
| --- | --- | --- | --- |
| **0. Trust/readiness** | #2701のセキュリティ・PII・正解確認の独立レビュー、[#2812](https://github.com/s977043/river-review/issues/2812)ほかfalse-clean関連の最新状態確認。外部実行を許可する主体を指定 | 使用可能なsource/権限、秘密情報を除外する方法、Go/No-goを記録 | **未完了** |
| **1. Corpus候補** | 運用者が**個別に**公開・利用可能な対象を選ぶ（過去履歴の無差別crawlは禁止） | 不具合候補5件＋正常/妥当な別実装候補5件。未確認は `unknown`、未適格は `ineligible` | **未収集** |
| **2. 独立のoracleと凍結** | 対象revisionでの不具合原因・位置・再現証拠、正常例の欠陥不在の**限定範囲**を別担当が確認 | 凍結したdevelopment 6件（不具合3＋正常3）、held-out 4件（不具合2＋正常2）。正解・後日修正・非公開報告をReviewerの入力から隔離 | **未実施** |
| **3. Dry run** | Phase 2の非機密メタデータが揃う | #2844 preflightと#1574 replayの境界を合成ケースで検証。実ケースの正解・実Runを使うPoCは別。合成データで精度を主張しない | **合成境界テストを本PRに追加、実コーパスは未実施** |
| **4. Bounded comparison** | 事前に利用範囲と**実際の費用上限**を承認、対象・検証条件を固定 | 同じ指摘にA/Bを適用。可能な限り既存Runを再利用、結果・失敗・追加費用を記録。必要なときだけ既存 `river run` 経路で収集 | **未実施** |
| **5. Independent score** | Phase 4の全Run、採点者の独立性を確認 | `river evolve replay` の比較**に加えて**、全findingを正解に照合。重大見逃し・有害なFP・時間/費用を別集計 | **未実施** |
| **6. Human decision** | 少数試行の限界、残リスク、独立レビューを提示 | Human `Keep / Adapt / Revert / Defer`。PoC通過でもGate変更、canary、auto-approvalは**別判断** | **保留** |

Phase 0〜3は外部モデル課金なしのread-only準備で進める。Phase 4の追加モデル呼び出し、外部コード実行、機密データ利用は、その対象・予算・許可を確定してから実施する。

## 5. 指標・分母・採否

<!-- prettier-ignore -->
| 指標 | 分子 / 分母または計測単位 | 備考 |
| --- | --- | --- |
| 既知バグの検出 | 原因・位置まで独立一致した不具合ケース / **確認済みかつレビュー可能な陽性ケース** | 1バグに複数findingがあっても1回。Aの新しい未検出バグをBが検出する試験ではない |
| 重大な指摘の保持 | Bが保持したAの独立確認済みcritical/major finding / Aの独立確認済みcritical/major finding | **正しい重大指摘の1件の新規喪失も停止して原因調査** |
| 有害な誤指摘 | 独立に悪影響を確認したfinding / **全findingのうち判定できたfinding** | 正解未確定のfinding数を別記。完全採点でない限り全指摘precisionを主張しない |
| 正常変更での有害なFP | 有害な誤指摘があった正常ケース / **適格な正常ケース** | 「修正後の対象バグがない」ことと「PR全体が正常」を混同しない |
| 有効性・実行欠落 | 完了した比較可能ケース / 当初凍結したケース。`unpaired` / `unknown` / `not_executed` / 環境失敗を併記 | 0分母は0%でなく `N/A` |
| Human Attention | Host計測の確認時間（各arm）、追加質問、再確認数 | コメント数から人間の時間を推定しない |
| コスト・速度 | arm別の実費・トークン・wall-clock・retry件数 | provider課金は事前上限で停止 |

**注意**: 既存paired replayの `criticalRegressionCount` はfingerprintの消失・重大度低下であり、**独立確認済みの重大バグの見逃し件数とは異なる**。両方を並記する。

事前の評価境界（提案）: confirmed critical/majorの新しい見逃し0件、有害なFP悪化なし、重大疑義の `inconclusive` をPASS扱いしない、実行コストの承認上限を守る。これらは必要条件であり、小規模10件が満たしても本番への一般化は不可。

## 6. 停止・復旧・機密情報

- 誤って認可なしのincident参照・秘密/個人情報を候補へ渡した、held-outに正解が漏れた、対象SHAが違う、元の証明条件が候補により書き換えられた場合は停止。汚染ケースを新しいhold-outに置き換える際は実験IDとdataset hashを新しくする。
- 正しいcritical/majorの指摘をBが落とした、正常変更への有害なFPが悪化した、独立性を証明できない、費用上限を超えたら `Defer/Adapt`。隠して合格扱いにしない。
- test `FAIL`（実行して仕様との不一致を観測）、`NOT_EXECUTED`（未起動）、`ENV_FAILURE`（環境側の失敗）、`INCONCLUSIVE`（根拠不足）を運用台帳で区別する。これらは**説明用の作業語彙**であり、新しい永続schemaやGateのenumを作る指示ではない。
- source/oracleデータは候補の変更権限外・アクセス制御下で保管する。公開repoには非機密参照のみ。AIによる新しい「独立して確認した」という主張は認証済みの証拠に置き換えない。
- 実行不能なら停止理由・再開条件を記録する。失敗した実験の結果を良好な評価として次へ送らない。

### 2026-11-17のコード監査・実行接続の差分

- `src/lib/paired-replay.mjs` の `pairFindings` / `activationCheck` を読み、**判定のみの差はpaired replayの差分に表れない**と確認した。既存replayの動作は変更しない。
- `tests/incident-review-smoke-paired-boundary.test.mjs`（本PRで新設）に合成正負例、判定のみの非観測、criticalの全体集計、held-outの自己申告の未確認を固定した。テスト結果は**HEADのCIが完了するまで未検証**。
- 合成テストは「独立oracleが存在する」証拠ではない。正解ラベル、実際のrunと費用、人の確認負荷は引き続き未収集とする。

## 7. 役割別計画レビュー（2026-11-15）

以下は**同一実行主体による多視点セルフレビュー**であり、独立したサブエージェント/第三者のレビュー完了を意味しない。独立レビューはPhase 0とPRレビューで別途必要。

<!-- prettier-ignore -->
| 視点 | 発見した計画上のリスク | 最適化して採用した修正 | 未解決 |
| --- | --- | --- | --- |
| 要件・オーナー | 新しい評価Engineと#2881の3群比較を重複実装する恐れ | #2701/#1574のOwnerを固定、最初は**1仮説・1差分**に限定 | 既存Runに後段だけ適用可能か実証 |
| QA・検出品質 | 正常例がない／事後修正だけで真偽を決める／post-filterで検出率が改善したと誤認 | 5 bug + 5 clean、対象revision・再現・不在範囲を独立確認。post-filterの能力境界を明記 | 10件の実正解ラベル |
| セキュリティ・独立性 | 候補が期待値・後日修正・認証情報を書き換え/参照し得る | 正解を候補外で凍結、contextの実際の監査、非機密opaque ref、改竄時停止 | Phase 0の正式な独立trust review |
| 評価方法・統計 | 小標本のzero missesを安全性証明と誤用／fingerprintと真の不具合を混同 | 異なる分母・全指摘の未判定・両面評価・少数PoC限界を明記 | 複数試行と拡大標本のサイズ |
| 運用・コスト | 20回のReviewer呼び直しが不必要、provider課金・長時間運用 | 同じ保存済みfindingを使う後段比較を先に試す。段階的なbudgetとstopを追加 | 実料金・execution adapter確認 |

### 5巡の自己検証結果（独立レビューとは別）

1. **要件**: 最初の完了は「運用計画」とし、実験完了や本番採用と分離。修正: 2種類の出口条件を明記。
2. **正常・異常**: 陽性/陰性/別実装、未実行、環境失敗、証拠欠落を区別。修正: post-filterの検出能力の限界と分母を明記。
3. **設計・信頼**: Owner/SSoT、host authority、oracle isolation、privacy、Cliff/Hillを照合。修正: 追加schemaと自動Gateを禁止。
4. **統合**: #2844、`river evolve replay`、#2881、#2812、#2912との重複・依存を整理。未実行: 実Runの統合テストとCIは実験開始後。
5. **完了判断**: このPRはdocs-only、全PoCは未検証。独立レビュー・正式採否・Human mergeは残す。

## 8. 直近の具体的な作業順

1. [#2701](https://github.com/s977043/river-review/issues/2701)に本計画を関連付け、Phase 0の独立trust/PIIレビュー担当とHostのケース選定者を決める。
2. [#2812](https://github.com/s977043/river-review/issues/2812)、[PR #2912](https://github.com/s977043/river-review/pull/2912)、[PR #2881](https://github.com/s977043/river-review/pull/2881)の最新状態を踏まえ、shadow評価に使える実行経路だけ選ぶ。既存PRへ無関係な修正を加えない。
3. 非機密・公開範囲で候補ケースの**参照先**を運用者が選び、各ケースのoriginal revision、scope、source digestを確認する。**選定するまでは正解ラベル0件（未収集）**。
4. 実ケースの独立oracle確定後、既存 `incident-review-smoke-preflight.mjs` を実行し、`river evolve replay`との接続可否を確認する。新しいadapterが必要だと立証された場合のみ、最小の別PRで検討する。
5. 実行予算と外部実行の許可がそろってからA/Bの記録と独立採点を行い、#2615へ効果・限界を引き継ぐ。

## 参考一次資料（設計の着想であり、River Reviewの実測ではない）

- [Google DeepMind: AlphaProof Code（2026-11-10）](https://google-deepmind.github.io/code-verification/)—承認済み仕様と証明エージェントの分離。
- [ProofCoder（2026-11-10、プレプリント）](https://arxiv.org/abs/2611.14106)—検証状態を踏まえた局所的再試行。ただしコードレビューの精度ではない。
- [Autonomous Code Review（2026-11-06、プレプリント）](https://arxiv.org/abs/2611.10098)—レビュー前後のテスト成否は指摘の真偽と別。
- [ReviewBench（2026-10-05）](https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/)—既知不具合の検出と全findingの有用性を分離。

**Decision**: 本番への導入は `Defer`。Phase 0〜3のread-only準備だけ次へ進める。Human承認に必要な独立正解・反証結果・費用/時間の観測はまだない。
