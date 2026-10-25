# Fixture 02 — The implementation matches the declared exception (False-Positive Guard)

## Description

The Pre-execution Gate holds: the diff contains declarative phrases
（「禁止」「ただし」「必ず」）, so the skill runs rather than returning
`NO_REVIEW`. The apparent violation at line 15 is covered by the exception the
declaration itself spells out at line 5, and the block at line 21 is an explicitly
labelled 悪い例 quotation. These are two of the False-positive guards:
「宣言が例外を明示しており実装がその例外条件に該当する」and
「引用ブロック（悪い例として提示されたコード）」.

## Input Diff

````diff
diff --git a/docs/contributing/examples.md b/docs/contributing/examples.md
new file mode 100644
--- /dev/null
+++ b/docs/contributing/examples.md
@@ -0,0 +1,22 @@
+# Example conventions
+
+## Rules
+
+- 例示のパスに絶対パスを書くことを禁止する。ただしプラットフォーム固有の
+  インストール先を示す場合（Homebrew の prefix 等）はこの限りではない。
+
+## Node のバージョン
+
+Homebrew 版 Node 22 のインストール先は環境固有の絶対パスになります。
+
+```bash
+export PATH=/opt/homebrew/opt/node@22/bin:$PATH
+```
+
+## Bad example
+
+以下は禁止例です。個人のホームディレクトリを含む絶対パスを書いてはいけません。
+
+```bash
+node /Users/alice/work/river-review/src/cli.mjs review
+```
````

## Expected Behavior

- `findings: []`.
- Line 15's `/opt/homebrew/opt/node@22/bin` is a platform install prefix, the case
  the declaration at line 5 explicitly excludes, so the first guard applies.
- Line 21's absolute path sits inside a block introduced as 「以下は禁止例です」,
  so the second guard（引用ブロック / 悪い例）applies.
- Flagging either would be 「差分にない矛盾の推測」listed under 不合格基準.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、L15 は宣言が明示した例外（プラットフォーム固有のインストール先）に該当し、L21 は「悪い例」として提示された引用ブロックであるため、いずれも False-positive guard により抑制される
-->
