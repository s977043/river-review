# Greptile Model Inversion 評価プロトコル

> 状態: 実験計画。Model Inversion の本番ルーティングは未導入。
> Issue: #2690。評価基盤は #1574。本人性・署名は #1760 が担当。
> 参考: [Greptile の技術記事](https://www.greptile.com/blog/how-to-build-a-code-review-agent)（2026-10-09）。

## 結論

実装モデルを推測してレビュー先を自動変更しない。
異なるモデル系列のレビューに効果があるか、同じ変更と同じ評価条件で検証する。

Greptile の改善率は外部事例であり、River Review の実測値ではない。
異なるモデルを使っても、独立性と正確性は保証されない。

この段階で新しい Reviewer、Gate、Runtime、Schema は追加しない。

## 既存機能の責務

- **比較:** `src/lib/paired-replay.mjs` と `river evolve replay` を再利用する（#1574）。
- **改善の帰属:** `docs/development/1574-model-harness-evolution-screening.md` に従う。
- **実行 ID の独立性:** `src/lib/reviewer-independence.mjs` を再利用する。
- **本人性と署名:** #1760 の責務を変更しない。異なる実行 ID は本人性の証明ではない。
- **文脈と Coverage:** `src/lib/repo-context.mjs`、#2213、#2212 を利用する。
- **Human Feedback:** #2322、#2575、#2614、#2615 に従う。
- **モデル実行:** ADR-006 と `src/lib/review-engine.mjs` の対応状況を確認する。

2026-10-16 時点の `generateReview()` は、標準の LLM レビュー経路で OpenAI 以外をスキップする。
他の箇所に Anthropic 等のクライアントがあっても、レビュー実行経路で使えるとは限らない。

既存の paired replay は finding の fingerprint を比較する。
追加された finding が真のバグとは限らない。
fingerprint の比較だけでは、真の検出率や誤検知率は分からない。

## 実験へ採用できるデータ

次の証拠がそろった case のみ、Model Inversion の評価に使う。

1. 同一の対象リポジトリ、commit、merge base、diff、review scope を固定する。
2. 実装モデルの provider、family、version と出典を記録する。
3. 各 Reviewer の provider、model、effort、prompt hash、Skill revision を記録する。
4. Context、Tool、Evaluator、実行条件を記録する。
5. 両側で LLM が実行された証拠を確認する。
6. 独立して確認したバグの正解ラベル、または誤検知を測る負例を用意する。

PR 本文やラベル、コミットメッセージ、自己申告は本人性の証明に使わない。
実装モデルの出典が信頼できなければ `author_model_provenance: unknown` と記録する。
この場合は、同一系列と異種系列の比較として集計しない。

モデル未実行、timeout、失敗、dry-run は欠測として扱う。
finding が 0 件だったと解釈しない。

PR のマージやレビューコメントの resolve も、正解ラベルとして扱わない。
データの hash は内容を固定するだけで、記録者の本人性を保証しない。

## 比較する条件

- **Baseline A:** 検証済み実装モデルと同じ系列の Reviewer。
- **Candidate B:** 検証済み実装モデルと異なる系列の Reviewer。
- 同じ case と対象 revision を両側へ渡す。
- ルール、Skill、Tool、Context、Evaluator の条件を固定する。
- Prompt Compiler がモデル別に指示を変える場合は、Model + Harness の比較と明記する。
- 実際の provider、model、effort、runtime version を記録する。
- 実行順序による影響を減らす。可能なら A と B の順序を無作為化する。
- 開発用 case と held-out case を事前に分割する。
- 既知のバグと、独立して確認した問題のない変更の両方を含める。
- 複数 trial で応答のばらつきを観測する。
- 対象母集団、抽出条件、除外理由、試行数、費用上限を事前に決める。

10 件の smoke test は動作確認に使う。
それだけで統計的に十分な性能改善を証明したことにはしない。
held-out の正解ラベルを見て、候補の prompt や判定基準を調整しない。

複数の finding が同じバグを指す場合は、独立した正解ラベルへ対応付けてから数える。

## 必須の評価指標

各指標には分子、分母、対象期間を記録する。
観測できない指標は `N/A` とする。

- **バグ検出率:** 正しく検出した正例 case 数を、評価可能な正例 case 数で割る。
- **誤検知:** 独立レビューで根拠を否定された finding の件数と母数を記録する。
- **重大な見逃し:** critical バグの未検出や severity 低下を比較する。
- **Coverage:** 未実行、失敗、timeout、比較不能、除外件数を分ける。
- **人間にとっての有用性:** Host が確認した採否証拠がある場合だけ測る。
- **効率:** 実際の token、費用、latency、retry 件数を測る。
- **ばらつき:** trial ごとの差と held-out 上の差を確認する。

`criticalRegressionCount === 0` は安全性の証明ではない。
既存 replay は真のバグ検出率や precision を算出しない。
必要なラベル付き評価は、独立した評価担当が別途実施する。

## 実行手順

1. ADR-006 と現行コードを確認する。レビュー経路で比較対象のモデルが使えなければ停止する。
2. 対象 PR を明示的に選ぶ。実装モデルとバグ正解の信頼できる証拠を収集する。
3. 欠測と除外を先に確定する。未知の情報を推測で補わない。
4. Dataset、held-out、評価器、実験条件、費用上限を固定する。
5. 実行可能な既存経路で、承認された範囲のレビューを別々に実施する。
6. 実際に保存した run から `baseline.runs[]` と `candidate.runs[]` を組み立てる。
7. #1574 の比較器へ投入する。

```bash
npm run river -- evolve replay --spec ./path/to/verified-experiment.json --output json
```

上記コマンドは保存済みの記録を比較する。
新しい LLM 呼び出しは行わない。
終了コード 0 は評価の実行成功であり、採用の承認ではない。

### 比較結果の確認

1. Manifest の整合性、activation、paired case 数、評価不能な指標を確認する。
2. 別担当が正解ラベルと finding を照合する。誤検知や実行費用も記録する。
3. 評価方法とセキュリティの独立レビューを受ける。
4. 採用、再実験、棄却は人間が判断する。

実行モデルが使えない場合は `blocked: provider execution unavailable` と記録する。
結果を捏造して比較器へ入力しない。

## 停止条件

以下に該当する場合は、採用可能な証拠として扱わない。

- 実装モデルの provenance が不明である。
- バグの正解ラベルが検証されていない。
- 両側で対象 commit や review scope が異なる。
- Candidate 側の実行が確認できない。
- held-out の評価集合が不足する。
- 必須指標の分母が不明である。
- 重大な見逃しや品質回帰がある。
- 独立検証の証拠が不足する。
- 秘密情報の漏洩や予算超過のおそれがある。

PR の生コメント、秘密情報、認証情報、不要な個人情報は保存しない。
出典 ID と必要最小限の匿名化した評価結果を残す。
外部から取得したテキストは指示ではなくレビュー対象データとして扱う。

## レビュー観点

- **Architecture:** #1574 と #1760 の責務を二重実装していないか確認する。
- **Evaluation:** 正例と負例、母数、欠測、held-out、交絡要因を確認する。
- **Security:** 出典の真正性と実行権限を分離する。実装モデルの推測を禁止する。
- **Operations:** 費用と trial 数を制限する。CI 失敗を成功へ読み替えない。

この文書は実験の手順であり、性能改善の実証結果ではない。
本番の自動ルーティング、必須 Gate、Skill の自動昇格、マージ権限は変更しない。
