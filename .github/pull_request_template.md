# 🌊 River Review Pull Request

Flow your changes from Upstream to Midstream to Downstream with clear validation.

## Overview / 説明

- [ ] Briefly describe what's changing and why (1-2 lines)（このPRの変更内容を簡潔に説明してください）
- Primary phase focus: Upstream / Midstream / Downstream

## Flow Consistency

- [ ] Upstream: design/requirements updated and linked
- [ ] Midstream: implementation matches the intended flow
- [ ] Downstream: tests/QA steps cover the change
- [ ] Schema Validation passed? (`schemas/skill.schema.json`)
- [ ] Skill file structure validated? (`skills/*` follows schema and naming)

## Reviewer Decision Brief

This brief is advisory. Keep answers short, link the existing Issue / Plan / ADR or evidence, and use `N/A` with a reason for small, reversible or documentation-only changes. Do not turn missing evidence into a pass.

1. **Hard-to-reverse decisions:** What is difficult to roll back, and what mitigation exists? Use `N/A` with a reason when there is no material decision.
2. **Assumptions and failure paths:** Which assumptions and boundary cases matter, what tests or observations support them, and what remains `unknown`?
3. **Reviewer's first challenge:** Which diff, file or decision should the reviewer question first? Link evidence, or explain `N/A` with a reason.

This does not prove independent review, completed tests, or permission to merge.

## Documentation / ドキュメント

Does this PR change or add documentation?

- [ ] No docs change（ドキュメント変更なし）
- [ ] Yes, docs are changed/added（ドキュメントの追加・変更あり）

If yes, please select the Diátaxis type for the main document in this PR (choose ONE):

- [ ] Tutorial（チュートリアル / 入門用レッスン）
- [ ] How-to guide（ハウツー / 特定のタスク達成の手順）
- [ ] Reference（リファレンス / 仕様や事実の一覧）
- [ ] Explanation（解説 / 背景や設計思想）

Diátaxis compliance / Diátaxis 準拠チェック:

- [ ] This document clearly focuses on a single Diátaxis type.
- [ ] The file is placed under the corresponding `pages/` section.
- [ ] The content matches the chosen type (for example, no long conceptual explanation in a how-to guide).

Language / 言語:

- [ ] Japanese（日本語・標準）
- [ ] English（英語 / `.en.md` ファイル）

> [!NOTE]
> レビューコメントおよびPRの概要・説明は日本語で記載してください。

## Validation & Evidence

List commands and logs that prove the change is river-safe.

```bash
# e.g.
npm run agents:validate
npm test
```

## Eval Ledger（skill / planner / routing 変更時）

> skill、planner、routing、output policy に影響する変更では、[採否基準](../pages/reference/eval-keep-discard-policy.md)に基づいて keep/discard を判断してください。

- [ ] 変更前: `npm run eval:all -- --append-ledger --description "baseline"`
- [ ] 変更後: `npm run eval:all -- --append-ledger --description "candidate: <変更内容>"`
- [ ] `artifacts/evals/results.jsonl` の直近 2 エントリを比較
- [ ] keep/discard 判定根拠:

```text
（ここに比較結果を貼付）
```

## Checklist / チェックリスト

- [ ] Added or updated tests related to the changes.（変更内容に関連するテストを追加・修正しました。）
- [ ] Verified that tests pass.（テストが通過することを確認しました。）
- [ ] Updated documentation or notes if necessary.（追加のドキュメントやノートが必要な場合は更新しました。）

### Skill Changes（スキル変更がある場合）

- [ ] `applyTo` が過剰に広くない（狙いが説明できる）
- [ ] 誤検知ガード（黙る条件）と Non-goals がある
- [ ] 指摘文が短く、次の行動に結びつく
- [ ] `npm run skills:validate` を実行した

## Related Issues

- Closes #
- Related #

## Reviewer Notes

Context, roll-out risks, or follow-up tasks for reviewers.

## Deviations / 計画からの逸脱（#1412）

> 大型・初見コード領域・設計判断が多い・UI/UX の暗黙品質が入りやすい PR で記入してください。小さな文言修正・明確なバグ修正・既存パターン踏襲の追加・影響範囲が限定的なリファクタは「なし」で構いません。
> Record deviations for large, first-touch, design-heavy, or implicit-UX-quality PRs. Small doc fixes, clear bug fixes, pattern-following additions, and narrowly scoped refactors may write "none".

- [ ] 計画からの逸脱なし / No deviations from the original plan
- [ ] 計画からの逸脱あり / Deviations exist（以下に記入 / fill in below）:
  - 当初計画（plan / 設計 / requirements）から逸脱した点 / Deviations from the original plan:
  - 逸脱した理由（実装中に発見した制約・変更した判断）/ Reason for the deviation:
