# Fixture 01 — Big-bang cutover with a destructive step and no rollback (Happy Path)

## Description

A release plan describes a one-shot cutover that drops the old columns in the
same deploy. Four Checklist items of this skill fail deterministically from the
text alone:

1. **互換性** — 旧クライアントが残る前提が触れられておらず、破壊的変更に対する
   バージョニングも移行ガイドも無い。
2. **段階移行** — ステップ（準備→並行稼働→切替→清掃）が無く、一度に全テナントを
   切り替える。Feature flag も段階リリースの単位も切替条件も無い。
3. **ロールバック** — 戻す条件（どのメトリクス/症状で戻すか）が無く、同一デプロイで
   旧カラムを DROP するため戻したときの整合性が担保できない（実質ロールバック不能）。
4. **観測性** — リリース中に見るべきメトリクス・ログ・ダッシュボード・アラートが無く、
   切り分けに使う相関IDの設計も無い。

The Pre-execution Gate is satisfied: the path matches `**/*release*.md` and lives
under `docs/`, and the diff is about rollout and migration.

## Input Diff

```diff
diff --git a/docs/release/pricing-v2-release.md b/docs/release/pricing-v2-release.md
new file mode 100644
--- /dev/null
+++ b/docs/release/pricing-v2-release.md
@@ -0,0 +1,12 @@
+# Pricing v2 release
+
+## 手順
+
+リリース当日に全テナントを新価格計算へ一斉に切り替える。
+
+同じデプロイで、旧価格テーブルの `legacy_price` と `legacy_currency` カラムを
+DROP する。
+
+## 確認
+
+リリース後、問題がなさそうならそのまま。問題があれば直す。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming what changes (pricing
  calculation, schema) and whether a migration is required.
- A finding that the cutover is irreversible: dropping `legacy_price` and
  `legacy_currency` in the same deploy destroys the data a rollback would need,
  so returning to the old calculation is impossible without a restore. Severity
  critical, with the
  `ロールバック条件: <監視指標/閾値/期間> / 手順: <戻す操作> / 注意: <データ整合性>`
  template.
- A finding that no staged migration exists: preparation, parallel run, cutover,
  and cleanup are not separated, there is no feature flag or rollout unit, and no
  switch condition, so a defect reaches 100% of tenants at once. Severity
  critical, with the
  `移行ステップ: 1) 準備, 2) 並行稼働, 3) 切替, 4) 清掃（各ステップの完了条件も）`
  template.
- A finding that compatibility with old clients and stored data is not addressed:
  a breaking pricing change ships with no versioning and no migration guide.
  Severity major.
- A finding that「問題がなさそうなら」is not an observable criterion — no metric,
  log, dashboard, alert, or correlation id is defined for the release window, so
  a problem cannot be detected or triaged. Severity major.
- At most 8 findings total, per the Rule.
- No finding designing the CI/CD pipeline itself — the Non-goals exclude that,
  except where a missing prerequisite is what causes the gap.

<!-- expected:
findings:
  - severity: critical
    reason: 同一デプロイで legacy_price / legacy_currency を DROP するためロールバック時に必要なデータが失われ、実質ロールバック不能になる
    anchor: docs/release/pricing-v2-release.md:8
  - severity: critical
    reason: 準備→並行稼働→切替→清掃の段階が無く、feature flag も段階リリース単位も切替条件も無いまま全テナントを一斉切替する
    anchor: docs/release/pricing-v2-release.md:5
  - severity: major
    reason: 破壊的な価格計算変更に対する旧クライアント互換期間・バージョニング・移行ガイドが無い
    anchor: docs/release/pricing-v2-release.md:5
  - severity: major
    reason: リリース中に見るべきメトリクス・ログ・ダッシュボード・アラートと切り分け用の相関IDが無く、「問題がなさそう」を観測可能な基準にできない
    anchor: docs/release/pricing-v2-release.md:12
-->
