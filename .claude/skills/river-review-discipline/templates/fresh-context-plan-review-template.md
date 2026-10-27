# Fresh Context Plan Review (Shadow / Advisory)

設計または実装計画の初見理解・実装準備を確認するための**任意**テンプレート。
`requirements-acceptance` / `plangate-plan-integrity` / `architecture-validation-plan` の判定を複製しない。
通常の差分レビュー・レビュー権限・PlanGate の C-2/C-3/C-4 を変更しない。

## Eligibility

- 対象: `design` / `implementation_plan` のうち、複数コンポーネント・新しい契約・移行・high以上のリスク等で実装判断が重要なもの:
- 対象外: typo、単純で低リスクな修正、既存の検証で十分な変更:
- 実行方式: `shadow / advisory`（Gate判定・承認は変更しない）:

## Review Input / Provenance

- 対象文書とrevision / content hash（観測できたもののみ）:
- 許可された参照: Canonical Plan / PBI / AC / TODO / test-cases / 既存コードの該当箇所:
- 参照できなかった必須資料（推測で補わない）:
- Reviewerの実行環境 / session分離の証跡（Hostで検証できた事実のみ）:
- 独立性: `verified` / `unverified`（役割名・自己申告だけではverifiedにしない）:
- 実行状態: executed / partial / not_executed（既存Coverageの事実と区別せずに推測しない）:

## Comprehension / 初見理解

**会話履歴を知らない読み手として**、入力文書から再構成する。再構成できない箇所は推測せずFindingにする。

- 目的・期待する利用者価値:
- In scope / Non-goals:
- Acceptance Criteria と成功の確認方法:
- 前提条件・依存先・所有者:
- 未定義の専門用語・参照先・暗黙の手順:
- 原文から一意に判断できない箇所:

## Implementation Readiness / 実装準備

- 変更対象とその責務・既存仕様との関係:
- 実装順序・外部依存・前提条件:
- 契約/API/データ変更で実装前に確定すべき判断:
- エラー・失敗時・互換性・移行/rollbackで今回必要な取り決め:
- AC に結び付いた検証方法と、必須確認事項:
- 実装者に委ねてよい局所詳細（必要以上の関数名・ファイル列挙を強制しない）:

## Finding / Evidence

既存Severity (`critical / major / minor / info`) と既存の出力契約を使う。
各指摘は原文の `path:line` または明示的なartifact参照、欠落した判断、最小修正案を持つ。
不足情報を「存在しない」と断定する前に、許可された文書内の前方・後方参照を確認する。

- Findings（根拠・Severity・最小修正案）:
- 明示的な対象外・次フェーズの決定済み事項（誤検知除外）:
- 既存レビューと重複する指摘（新しいFindingとして二重計上しない）:
- 依然として判断に必要なHuman questions:

## Outcome / Limitations

- Review outcome: findingsあり / findingsなし / incomplete（承認やGateの結果ではない）:
- 未実行・不明な独立性・欠落資料・残リスク:
- 現行Planの変更権限: reviewerには無し。修正はPlan ownerが承認境界に従って実施:
- 再評価で照合するartifact revision / evidence refs:

> Fresh context と独立検証は異なる。新規セッション・subagentの実行証跡が無いときは、通常の文書理解レビューとして記録し、EGM型の独立Goldfishレビュー完了とは主張しない。
