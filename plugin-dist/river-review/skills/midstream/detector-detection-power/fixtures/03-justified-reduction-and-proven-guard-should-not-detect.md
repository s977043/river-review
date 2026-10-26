# Test Case: 根拠づけられた検出減少・実証済みの新設ガード・委譲先の領分（Check 1 / 2 の抑制条件 / canary）

## Description

Pre-execution Gate を通過する（検出ロジックの変更と検査の新設を両方含む）が、抑制条件がすべて効いて findings が 0 件になるべき should-not-detect canary。

- 検出が減る変更だが、除外は誤検出 2 件だけを**完全一致で名指し**しており、内訳と理由がコメントと PR 本文に示されている（Check 1 の抑制）。
- 新設ガードには変異注入の証跡が両方向で付いている。検出すべき入力で終了コード 1、正当な入力で 0、走査対象が空のときも 1（vacuous pass の封じ込め）(Check 2 の抑制)。
- 同一 PR に ESLint ルールの `off` 化が混ざっているが、これは `review-criteria-integrity` の領分であり本 skill は重複指摘しない。

## Input Diff

```diff
diff --git a/scripts/check-doc-links.mjs b/scripts/check-doc-links.mjs
index 1111111..2222222 100644
--- a/scripts/check-doc-links.mjs
+++ b/scripts/check-doc-links.mjs
@@ -40,4 +40,7 @@ function isKnownFalsePositive(link) {
   return (
     link.startsWith('mailto:') ||
+    // 認証必須のため HEAD が 401 を返し到達不能と誤判定される 2 件のみを完全一致で除外する
+    link === 'https://example.com/private/dashboard' ||
+    link === 'https://example.com/private/billing' ||
     link.startsWith('tel:')
   );
diff --git a/scripts/check-schema-drift.mjs b/scripts/check-schema-drift.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/scripts/check-schema-drift.mjs
@@ -0,0 +1,14 @@
+import { readdirSync, readFileSync } from 'node:fs';
+
+const routes = readdirSync('src/routes').filter((f) => f.endsWith('.ts'));
+const schemas = readFileSync('src/schemas/index.ts', 'utf-8');
+
+if (routes.length === 0) {
+  console.error('scanned 0 route(s): the scan target is missing');
+  process.exit(1);
+}
+
+const missing = routes.filter((r) => !schemas.includes(r.replace('.ts', 'Schema')));
+
+console.log('schema drift: scanned ' + routes.length + ' route(s), ' + missing.length + ' missing');
+process.exit(missing.length > 0 ? 1 : 0);
diff --git a/tests/check-schema-drift.test.mjs b/tests/check-schema-drift.test.mjs
new file mode 100644
index 0000000..4444444
--- /dev/null
+++ b/tests/check-schema-drift.test.mjs
@@ -0,0 +1,25 @@
+import { execFileSync } from 'node:child_process';
+import { describe, expect, it } from 'vitest';
+
+function run(fixtureDir) {
+  try {
+    execFileSync('node', ['scripts/check-schema-drift.mjs'], { cwd: fixtureDir });
+    return 0;
+  } catch (error) {
+    return error.status;
+  }
+}
+
+describe('check-schema-drift', () => {
+  it('fails when an injected route has no schema', () => {
+    expect(run('tests/fixtures/schema-drift/injected')).toBe(1);
+  });
+
+  it('passes when every route has a schema', () => {
+    expect(run('tests/fixtures/schema-drift/clean')).toBe(0);
+  });
+
+  it('fails when the scan target is empty', () => {
+    expect(run('tests/fixtures/schema-drift/empty')).toBe(1);
+  });
+});
diff --git a/.eslintrc.json b/.eslintrc.json
index 6666666..7777777 100644
--- a/.eslintrc.json
+++ b/.eslintrc.json
@@ -8,3 +8,3 @@
   "rules": {
-    "no-console": "warn",
+    "no-console": "off",
     "eqeqeq": "error"
```

## 照合先 / Artifacts

- PR 本文: 「リンク検査の誤検出 2 件を除外した。内訳は `https://example.com/private/dashboard` と `https://example.com/private/billing` の 2 件で、いずれも認証必須のため HEAD が 401 を返し到達不能と誤判定されていた。検出は 44 → 42 件（この 2 件のみ）」。
- 除外は前方一致やパターンではなく**完全一致 2 件**であり、同じ種別の他の URL は引き続き検出される。
- 新設ガード `scripts/check-schema-drift.mjs` には `tests/check-schema-drift.test.mjs` が付き、陽性方向（違反注入で終了コード 1）・陰性方向（正当な入力で 0）・空集合（走査 0 件で 1）の 3 ケースを固定している。
- 新設ガードは走査件数を標準出力に出す（`scanned N route(s)`）ため、走査範囲が縮んだ場合に気付ける。
- `.eslintrc.json` の `no-console` 無効化については PR 本文に意図の宣言が無いが、これはレビュー基準・品質ゲートの弱体化であり `review-criteria-integrity` が扱う。

## Expected Behavior

本 skill は findings も questions も 1 件も出さないこと。

1. **Check 1 として指摘しない**: 減った 2 件の内訳と、各件が誤検出であった理由が PR 本文とコード内コメントに示されている。除外は完全一致 2 件に絞られており、種別全体を消していない。
2. **Check 2 として指摘しない**: 変異注入の証跡が陽性・陰性の両方向で示されている。空集合での vacuous pass も明示的に失敗させている。
3. **委譲先の領分を指摘しない**: `.eslintrc.json` の `no-console` 無効化は `review-criteria-integrity` の Check 4 に該当し、本 skill からは出力しない。
4. **検出力に無関係な実装品質を指摘しない**: 同期 I/O、`error.status` の型、テストの命名などには触れない。
5. 一般論の指摘や「念のため」の question を出さない（false-positive-first / 責務分界の遵守）。

<!-- expected:
findings: []
-->
