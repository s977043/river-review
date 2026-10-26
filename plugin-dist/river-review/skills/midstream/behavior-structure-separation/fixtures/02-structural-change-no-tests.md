# Test Case: Structural change without behavior-preservation evidence (should detect)

## Description

`tokenize()` を `splitTokens()` と `classify()` に分割抽出する構造変更を行ったが、対象を通すテストが差分にも既存にも見当たらない。外部挙動を変えていない主張はあるが、それを保証する Safety Net（テスト・型・静的解析）がない。behavior-structure-separation は Check 2 で 1 件検出する。

## Input Diff

```diff
diff --git a/src/parser/tokenize.ts b/src/parser/tokenize.ts
index 1111111..2222222 100644
--- a/src/parser/tokenize.ts
+++ b/src/parser/tokenize.ts
@@ -8,3 +8,10 @@ export function tokenize(src: string): Token[] {
-  const raw = src.split(/\s+/).filter(Boolean);
-  return raw.map((w) => ({ value: w, kind: detectKind(w) }));
+  return classify(splitTokens(src));
+}
+
+function splitTokens(src: string): string[] {
+  return src.split(/\s+/).filter(Boolean);
+}
+
+function classify(words: string[]): Token[] {
+  return words.map((w) => ({ value: w, kind: detectKind(w) }));
 }
```

## Tests / 参照

- PR 本文: 「tokenize を splitTokens / classify に分割抽出。挙動は不変」。
- `code_search` で `tokenize(` / `splitTokens(` を tests/ 配下に検索してもヒットしない（対象を通すテストが存在しない）。
- 分岐・副作用を含むため型・静的解析だけでは挙動不変を保証できない。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 2（外部挙動維持の証拠）を 1 件検出する（分割抽出したが対象を通すテストが無い＝Safety Net なし）。
2. 証拠が無いことを `code_search` の検索語付きで示す（tests/ に `tokenize(` / `splitTokens(` がヒットしない）。
3. separation は unclear、behavior_change は none detected とする。
4. Fix として抽出前の外部挙動を固定する Characterization Test の追加、または needs_review を促す。

<!-- expected:
findings:
  - check: 2
    severity: minor
    reason: 分割抽出した tokenize を通すテストが差分・既存に無く、外部挙動維持の証拠が不足（Safety Net なし）
-->
