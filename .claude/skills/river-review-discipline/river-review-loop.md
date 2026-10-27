# RiverReview Loop

レビューの標準ループ。各フェーズは前フェーズの output を input にする。
`stop conditions` に当たったら次へ進まず止め、`human escalation` に当たったら人間へ返す。

## 0. Intake

- **input**: レビュー依頼、対象（PR / 差分 / 仕様 / 設計 / レポート等）、文脈。
- **output**: レビュー対象の一覧と、各対象の所在（ファイル・PR 番号・コマンド）。
- **checklist**: 何をレビューするのか / 何を**しない**のかを1行で確定したか。対象の実体（差分・仕様）にアクセスできるか。
- **stop conditions**: 対象の実体が取得できない（差分が空・仕様が無い）。
- **human escalation**: レビュー範囲そのものが不明で依頼者の意図確認が要る。

## 1. Classify

- **input**: Intake の対象一覧。
- **output**: 各対象の分類（requirements / design / implementation_plan / diff / test / verification_report / report / documentation / release_readiness / security_sensitive_change / data_sensitive_change / unknown）。
- **checklist**: `unknown` を残していないか。security/data に該当しないか（該当なら強制 high 以上）。
- **stop conditions**: `unknown` のまま Review に進もうとしている。
- **human escalation**: 分類できるだけの情報が無い。

## 2. Review

- **input**: 分類済み対象。
- **output**: 分類ごとの findings（重要度 critical/major/minor/info 付き、file:line 付き）。
- **checklist**: 分類に対応するテンプレの観点を通したか。差分外の重要箇所・既存整合を見たか。差分に存在しないコードへの推測になっていないか。
- **stop conditions**: テンプレの必須観点を飛ばしている。
- **human escalation**: 外部仕様・料金・規約の確認が必要で内部情報だけでは判断できない。

### 2-bis. Fresh Context Plan Review（任意 / 対象限定）

- **対象**: `design` / `implementation_plan` のうち、既存の分類・リスクで設計の不確実性が高い変更に限る。小さな低リスク変更は適用不要。
- **実行**: `templates/fresh-context-plan-review-template.md` を使い、ComprehensionとImplementation Readinessを確認する。Reviewerはread-onlyであり、Planや実装を修正しない。
- **独立性**: 同じ会話での自己レビューと、会話履歴なしの新規subagent/sessionによるレビューを区別する。起動手段やHost由来の実行証跡が無い場合は独立性 `unverified` として扱い、独立レビュー完了とは記録しない。
- **情報境界**: 対象文書・明示された参照資料・最小限の制約を渡し、hidden CoT・会話履歴・先行レビュー結論を渡さない。読み手が推測しなければ埋まらない前提をFindingにする。
- **結果**: 既存のSeverity・Finding・Coverageに統合する。Advisoryの結果だけで承認・Gate・mergeを行わず、レビュー未実行を `findings=0` と同一視しない。
- **重複/過剰設計の抑制**: 既存レビューで検出済みの欠落を再計上せず、実装者に委譲可能な詳細まで事前固定を要求しない。

## 3. Risk Assessment

- **input**: findings。
- **output**: 各 finding とレビュー全体の risk level（low / medium / high / critical）。
- **checklist**: 強制 high 項目（データ削除・schema・認証認可・課金・外部 API・本番設定・CI/CD・セキュリティ・大規模リファクタ・不可逆・PII/secret・監視影響）に該当していないか。不明は安全側へ倒したか。
- **stop conditions**: high/critical を含むのに緩い判断へ進もうとしている。
- **human escalation**: critical リスク（本番・データ・認証・課金・セキュリティの未確認影響）。

## 4. Decision

- **input**: findings + risk。
- **output**: approved / needs_revision / blocked / rejected と、その根拠。
- **checklist**: approved なら「確認した根拠」を添えたか。needs_revision なら Required changes を具体化したか。high/critical 未確認は blocked にしたか。
- **stop conditions**: 「問題なさそう」など根拠なしの approved。
- **human escalation**: blocked（人間承認・検証不能・外部確認要）。

## 5. Verify

- **input**: 検証レポート / 実行結果 / 差分。
- **output**: 実行した検証・未実行の検証・証跡・完了判定（complete / partial / not_complete）。
- **checklist**: 「実装したこと / 確認できたこと / できていないこと / 推測 / 人間確認要」を分けたか。テストが適切な失敗を検知するか。報告の数値・出力を実体（diff/log/ファイル）で裏取りしたか。
- **stop conditions**: 未検証事項があるのに complete と判定しようとしている。
- **human escalation**: 検証不能（環境・権限・外部依存）。

## 6. Remember

- **input**: 判断・懸念・却下理由・未解決事項。
- **output**: `review-memory.md`（または `docs/CONTINUITY.md`）への追記。
- **checklist**: 採用判断・却下案と理由・既存制約・繰り返しそうな漏れ・検証コマンド・未解決リスク・次に見るファイルを残したか。`/compact` 後に失われて困る判断を残したか。
- **stop conditions**: 却下した案とその理由を残さずに終えようとしている。
- **human escalation**: なし（記録は常に行う）。

## 7. Next Action

- **input**: Remember の未解決リスク・未検証事項。
- **output**: 次の一手（1つ）。
- **checklist**: 次の一手を**最もリスクが高い未確認事項**から選んだか。低リスクの雑務を先に置いていないか。
- **stop conditions**: 未確認の high/critical があるのに別の低リスク作業を次に置いている。
- **human escalation**: 次の一手が人間の判断（実装 GO / マージ / 本番反映）を要する。
