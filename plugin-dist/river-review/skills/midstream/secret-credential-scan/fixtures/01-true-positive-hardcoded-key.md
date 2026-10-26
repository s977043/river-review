# Test Case: Hardcoded API Key / Credential (Should Trigger Finding)

実値の API キー・credential が `diff` の追加行に混入したケース。SKILL.md Rule「候補抽出 → 実値判定 → 報告」に従い `major` 相当の機密混入指摘が期待される。値は出力で再掲せずマスクされる。

## Input Artifacts

### diff

```diff
diff --git a/src/services/payment.ts b/src/services/payment.ts
index 1111111..2222222 100644
--- a/src/services/payment.ts
+++ b/src/services/payment.ts
@@ -1,6 +1,11 @@
 import Stripe from 'stripe';

-const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
+// TODO: move to env later
+const STRIPE_SECRET_KEY = 'sk-live-9fJ2kQ8wZ3xT7bN1pR4sV6yU0aC5dE2gH';
+const stripe = new Stripe(STRIPE_SECRET_KEY);
+
+const GITHUB_TOKEN = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
+const AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE2';

 export async function charge(amount: number) {
   return stripe.charges.create({ amount, currency: 'jpy' });
diff --git a/config/runtime.env b/config/runtime.env
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/config/runtime.env
@@ -0,0 +1,2 @@
+DATABASE_URL=postgres://app:S3cr3tP4ssw0rd@db.internal:5432/prod
+OPENAI_API_KEY=sk-proj-7Hq3Lp9Rt2Wx5Zb8Nm1Kc4Vd6Fg0Js
```

## Expected Behavior

The skill should detect (value masked in output):

1. `src/services/payment.ts` に `STRIPE_SECRET_KEY` のハードコード値（接頭辞 `sk-live-`、本物の鍵長）→ API キー混入
2. 同ファイルの `GITHUB_TOKEN`（接頭辞 `ghp_`）→ トークン混入、`AWS_ACCESS_KEY_ID`（接頭辞 `AKIA`）→ credential 混入
3. `config/runtime.env` の `DATABASE_URL` に実パスワード、`OPENAI_API_KEY`（接頭辞 `sk-proj-`）→ .env 実値混入

各指摘は環境変数 / Secrets への移動、コミット履歴からの除去、CI secret-scan(gitleaks 等) の導入を推奨する。`AKIA...EXAMPLE` は形式的には接頭辞一致だが、実害判定は他の本物鍵を優先して 5 件以内に収める。
