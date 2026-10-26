# Test Case: Safe preparatory refactoring with tests (should NOT detect)

## Description

後続の機能追加に備えた最小限の責務分割（Preparatory Refactoring）。外部挙動は不変で、対象を通す Characterization Test が同じ diff に含まれている。振る舞い変更は混在せず（Check 1 clear）、挙動維持の証拠も揃っている（Check 2 充足）ため、findings は空となる（issue 検証シナリオ Case 1「安全な Preparatory Refactoring」に対応）。

## Input Diff

```diff
diff --git a/src/parser/tokenize.ts b/src/parser/tokenize.ts
index 1111111..2222222 100644
--- a/src/parser/tokenize.ts
+++ b/src/parser/tokenize.ts
@@ -8,3 +8,6 @@ export function tokenize(src: string): Token[] {
-  const raw = src.split(/\s+/).filter(Boolean);
-  return raw.map((w) => ({ value: w, kind: detectKind(w) }));
+  return splitTokens(src).map((w) => ({ value: w, kind: detectKind(w) }));
+}
+
+function splitTokens(src: string): string[] {
+  return src.split(/\s+/).filter(Boolean);
 }
diff --git a/tests/parser/tokenize.test.ts b/tests/parser/tokenize.test.ts
index 3333333..4444444 100644
--- a/tests/parser/tokenize.test.ts
+++ b/tests/parser/tokenize.test.ts
@@ -1,1 +1,9 @@
 import { tokenize } from '../../src/parser/tokenize';
+
+test('tokenize preserves external behavior after extraction', () => {
+  expect(tokenize('a  b\tc')).toEqual([
+    { value: 'a', kind: 'word' },
+    { value: 'b', kind: 'word' },
+    { value: 'c', kind: 'word' },
+  ]);
+});
```

## PR 本文 / Tests

- PR 本文: 「後続の数値トークン対応に備え、空白分割を splitTokens() に抽出する Preparatory Refactoring。外部挙動は不変」。
- `tokenize` の外部挙動を固定する Characterization Test を同時に追加している。
- 丸め・分岐・出力を変える差分は無い（純粋な構造変更）。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 1: 外部挙動を変える差分は無く、構造変更のみ → 混在なし（separation: clear）→ 指摘しない。
2. Check 2: 対象 `tokenize` を通す Characterization Test が差分に存在する → 挙動維持の証拠あり → 指摘しない。
3. findings は空（`findings: []`）。

<!-- expected:
findings: []
reason: 外部挙動不変の Preparatory Refactoring で、tokenize を通す Characterization Test を同時追加。振る舞い/構造の混在なし・挙動維持の証拠ありのため指摘なし
-->
