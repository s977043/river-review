# Sashiko型の自己棄却監査：shadow評価計画

> Status: Proposal / shadow-only（2026-11-22）。
> 本番のReview Coverage・Gate・承認・マージ権限は変更しない。
> 基準main: e78b523464992f3a37200e8974fa732d65638ebe。
> 実行前とマージ前にHEADを再確認する。

## 情報源と検証仮説

- [Google Sashiko公式報告](https://cloud.google.com/blog/products/application-development/lessons-from-building-sashiko-an-agentic-code-review-system)

Sashikoは専門レビューで発見した不具合候補だけでなく、担当者が棄却した懸念も別の検証へ送る。
Linuxでの運用実績をRiver Reviewの性能保証とは扱わない。

River ReviewにはFinding Criticがある。
また、差分の検証と実行IDの分離、レビュー範囲の観測機能も存在する。
それぞれの既存Ownerを再利用する。

今回の仮説は「Findingへ確定する前の自己棄却が、既存Criticから見えない可能性」です。
本番で実際に発生しているかは未確認。
この段階で製品の出力契約を新設しない。

## 対応範囲

オフラインの人間ラベル付き比較評価のみを実装する。
対象はsrc/lib/self-dismissal-shadow-eval.mjsと専用テスト。
真の不具合と誤警報を別々の分母で数える。
評価結果はレビュー判定や品質ゲートへ渡さない。

入力には固有ID・自己棄却の事実・人間が確定した正解・対象revisionを含める。
再検証側には実行ID・対象revision・候補判定・コード参照を含める。
正解ラベルは再検証前に凍結することを前提とする。

実装はrevisionの一致と参照形式を検査します。
さらに既存の実行ID分離ヘルパーを再利用する。
どの検査も証拠の真正性やコード上の正しさを証明しない。
構造チェックを通過した結果は「人間の証拠監査候補」としてのみ扱う。

不正入力やID重複はエラーにする。
古いrevision・参照不足・同一実行者・未実行・未解決は合格扱いしない。
対象が0件なら率はnullとする。0件を完全レビューとはみなさない。

## 段階導入

- **Stage 0**: #1978・#2212・#2455・PR #2934との責務境界を再確認。
- **Stage 1**: 独立した評価ヘルパーと合成テストを追加。CI成功が必要。
- **Stage 2**: 実PRから人間ラベル付きの過去ケースを凍結し、同一SHAで比較。
- **Stage 3**: 実測に基づき既存Criticへのopt-in接続を別PRで検討。
- **Stage 4**: 重大見逃しと誤検知が悪化せず、費用上限を守れる場合だけ導入判断。

Stage 2では再発見候補数・誤警報数・不明領域を記録する。
さらに実行時間・トークン費用・人間確認負荷を記録する。
Stage 2以降のデータが揃うまで自動検証を製品へ接続しない。

## 停止条件

- LLMの自己申告だけでFindingを確定する場合。
- 根拠のない実行IDや古いrevisionが独立検証として通過する場合。
- 検証未実行をcleanと分類する場合。
- 評価結果を見てから人間の正解ラベルを書き換える場合。
- Gate・承認・QA実行の責務を追加する場合。

停止時には入力と未解決事項を記録する。
成功扱いへ暗黙に変換しない。

## 5観点による設計レビュー

- **セキュリティ**: コード引用と実行IDは偽造できる。人間の証拠監査を必須とする。
- **品質保証**: 誤検知の減少だけを成果としない。重大な見逃しの変化も測る。
- **アーキテクチャ**: 既存Finding Criticを再利用する。判定状態機械を増やさない。
- **保守性**: PR #2934のQA入力契約とは別に扱う。本番の配線を変更しない。
- **運用コスト**: 初期段階ではLLMを追加実行しない。実測後に予算を判断する。

このレビューは設計観点による自己点検です。
独立した5エージェントの実行証跡ではない。
マージ前の独立レビューを置き換えない。

## 検証とマージ条件

対象PRのHEADで次の検証を行う。

- node --test tests/self-dismissal-shadow-eval.test.mjs
- npm run lint
- npm test
- npm run meta:validate

必須CI・最新HEAD・PRの両コメント経路・blocking labelを確認する。
独立レビューの重大指摘が残る場合はマージしない。

ADR-016段階1ではエージェントによるマージは禁止されている。
人間が最終マージを実施する。
auto-mergeも有効にしない。

## 関連IssueとPR

- #1978: Finding Critic
- #2212: Review Coverage
- #2455: Review Concern
- #1857: Semantic Precision
- PR #2934: QA Evidence Intake
- PR #2881: Verification-First
