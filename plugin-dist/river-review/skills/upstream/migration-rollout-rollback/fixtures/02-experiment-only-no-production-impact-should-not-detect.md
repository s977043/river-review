# Fixture 02 — Staged rollout fully specified, verification-only phase declared (False-Positive Guard)

## Description

The diff changes a document matching `**/*rollout*.md` under `docs/`, so the
Pre-execution Gate is satisfied. The skill stays silent because both suppression
paths hold at once and neither depends on the gate failing:

- The phase this diff adds is explicitly「検証のみ・本番影響なし」（shadow 実行で結果を
  破棄する）, which is the skill's guard「影響範囲が明確に “実験/検証のみ・本番影響なし”
  と書かれている場合は、過度に厳しくしない」.
- The production rollout it belongs to already specifies compatibility window,
  staged steps with completion conditions, rollback criteria with data-consistency
  notes, and release-window observability — all in this same document, unchanged
  by the diff.

## Input Diff

```diff
diff --git a/docs/release/pricing-v2-rollout.md b/docs/release/pricing-v2-rollout.md
--- a/docs/release/pricing-v2-rollout.md
+++ b/docs/release/pricing-v2-rollout.md
@@ -30,6 +30,14 @@
 ステップ 3) 切替: canary 1% → 10% → 50% → 100%。各段階の完了条件は
 「価格差分アラート 0 件かつ p99 が基準比 +10ms 以内で 24 時間経過」。
 ロールバック条件: 価格差分アラートが 5 分継続、または決済失敗率 > 1%。
 手順: feature flag `pricing_v2` を off に戻す（旧カラムは清掃フェーズまで保持）。
 観測: 価格差分ダッシュボード、決済失敗率、相関ID `orderId`。

+## ステップ 0) shadow 検証（本番影響なし）
+
+切替前に、新価格計算を shadow 実行する。本フェーズは検証のみで本番影響は無い:
+算出結果はレスポンスにも DB にも反映せず、比較ログにのみ書き出して破棄する。
+書き込み・課金・ユーザー向け表示のいずれも発生しない。
+
+比較ログの保持は 14 日。差分率が 0.1% を下回ったらステップ 1 へ進む。
+清掃フェーズ（ステップ 4）で旧カラムを DROP する条件は既存の記載どおり変更しない。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The added phase writes nothing, bills nothing, and shows nothing to users, and
  says so explicitly, so the skill does not demand rollback criteria or a
  compatibility window for it — there is no production state to return.
- Compatibility, staged steps with completion conditions, rollback criteria and
  procedure with the data-consistency note, and release-window observability are
  already stated in the unchanged part of the same document; re-raising them
  would be a duplicate finding on content this diff does not modify.
- The one thing the added phase must define — its exit condition into the next
  step — is present (difference rate below 0.1%), so the 段階移行 checklist item is
  satisfied rather than open.

<!-- expected:
findings: []
reason: 追加フェーズは書き込み・課金・ユーザー表示のいずれも発生しない検証のみ・本番影響なしと明記され（抑制条件に該当）、互換性・段階と完了条件・ロールバック条件と整合性注意・観測性は同一文書の不変部分に既述、追加分にも次段階への移行条件がある
-->
