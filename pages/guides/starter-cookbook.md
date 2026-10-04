---
title: Starter Cookbook — 既存のレビュー観点から始める
---

River Review は、最初から独自 Skill を書く必要はありません。まず同梱の専門 review skill と既存の repo-owned Skill を使い、**実際に不足した判断だけを後から追加**してください。

> 各 Skill は `applyTo` / phase / routing 条件を持つため、下記に挙げた Skill が毎回すべて実行されるわけではありません。差分に関係する観点だけを選ぶことがノイズ抑制につながります。

## Recipe 1: Security / Guardrails

Claude Code:

```text
/river-review:river-review-security
```

代表的な既存 Skill:

- `security-basic` — 一般的なセキュリティ脆弱性
- `secret-credential-scan` — API key / token / credential の混入
- `trust-boundaries-authz` — 認証・認可と trust boundary の設計
- `nextjs-server-action-security` — Next.js Server Actions のセキュリティ境界
- `gha-workflow-security` — GitHub Actions の downstream セキュリティ

**向いている場面**: 認証・認可、外部入力、secret、CI/CD、権限変更を含む差分。

## Recipe 2: Architecture / Maintainability

Claude Code:

```text
/river-review:river-review-architecture
```

代表的な既存 Skill:

- `architecture-boundaries` — レイヤ・境界・依存方向
- `api-design` — API 設計
- `external-dependencies` — 外部依存の採用判断
- `migration-rollout-rollback` — migration / rollout / rollback
- `existing-pattern-conformance` — 既存設計パターンとの整合

**向いている場面**: 新しい依存、境界変更、API 変更、migration、大きめのリファクタ。

## Recipe 3: Performance

Claude Code:

```text
/river-review:river-review-performance
```

代表的な既存 Skill:

- `modern-web-performance` — Web フロントエンドの性能
- `laravel-eloquent-nplus1` — Laravel / Eloquent の N+1
- `cache-strategy-consistency` — cache 戦略の整合
- `capacity-cost-design` — capacity / cost を含む設計レビュー

**向いている場面**: DB query、render、cache、hot path、スケール前提の変更。

## Recipe 4: Testing / Reliability

Claude Code:

```text
/river-review:river-review-testing
```

代表的な既存 Skill:

- `coverage-gap` — 重要パス・失敗パスのテスト不足
- `test-assertion-effectiveness` — assertion が実際に振る舞いを検証しているか
- `flaky-test` — flaky なテスト構造
- `logging-observability` — 障害時に追跡可能な signal が残るか
- `failure-modes-observability` — 設計時の failure mode と observability

**向いている場面**: 分岐追加、例外処理、retry / fallback、重要フローの変更。

## Recipe 5: 迷ったら現在の差分をまとめてレビュー

```text
/river-review:review-local
```

まず汎用のローカルレビューを実行し、結果から Security / Architecture / Performance / Testing の専門 review skill を追加してください。

## チーム固有ルールは最初から Skill にしなくてよい

軽量なルールは `.river/rules.md` から始められます。

```markdown
# Project review rules

- 複数の repository / aggregate をまたぐ write は transaction boundary を明示する。
- catch した例外は log / rethrow / 明示的な無視理由のいずれかを持つ。
- 新規の外部依存は、既存依存で代替できない理由を PR に残す。
```

運用で繰り返し現れ、**入力・期待 finding・false-positive 条件をテストしたくなった判断**だけを custom Skill に昇格させるのが安全です。

## Skill に昇格するとき

1. [はじめてのスキル作成](../tutorials/creating-your-first-skill.md) で最小 Skill を作る。
2. `applyTo` と phase を狭くし、不要な実行を避ける。
3. fixture + golden output で「検出すべき」「出してはいけない」を固定する。
4. 回帰 Eval で変更前後を比較する。
5. 実運用では suppression / Run store を見て false-positive を調整する。

実在する Skill の fixture と期待出力は [代表スキルのショーケース](./representative-skills.md) を参照してください。全 Skill は [Skills Catalog](../reference/skills-catalog.md) から確認できます。

## 導入後に見る指標

「導入したか」ではなく「レビュー判断が改善したか」を見ます。

- 新規 finding / 解消 finding / 再発 finding: [Run store と回帰比較](./track-runs-and-regressions.md)
- suppression の傾向: Run store / suppression analytics
- false-positive: fixture / guard case / per-skill eval
- 実行コスト: [コスト見積もりと最適化](./cost-estimation.md)
- 全体傾向: [ダッシュボード](../dashboard.md)

これらの結果を見てから、Skill を増やすか、狭めるか、廃止するかを判断してください。
