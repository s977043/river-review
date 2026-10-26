# Fixture 01 — A rule declared at the top is broken further down the same file (Happy Path)

## Description

The diff adds a contributor guide containing declarative phrases
（「必ず」「禁止」）, satisfying the Pre-execution Gate. Line 5 declares that
examples must never hardcode absolute machine-local paths, and line 17 of the same
file does exactly that. Line 6 declares that every command example must be
runnable as written, and line 23 shows a placeholder-only command. Both are the
Rule section's 宣言 → 実装との突合 failing inside one file.

## Input Diff

````diff
diff --git a/docs/contributing/examples.md b/docs/contributing/examples.md
new file mode 100644
--- /dev/null
+++ b/docs/contributing/examples.md
@@ -0,0 +1,24 @@
+# Example conventions
+
+## Rules
+
+- 例示のパスに個人環境の絶対パスを書くことを禁止する。必ずリポジトリ相対パスを使う。
+- コマンド例は必ずそのまま実行できる形で書く。
+
+## Setup
+
+Clone the repository and install dependencies.
+
+## Running a review
+
+Run the CLI against a diff file:
+
+```bash
+node /Users/alice/work/river-review/src/cli.mjs review --diff ./tmp.diff
+```
+
+Then publish the result:
+
+```bash
+node src/cli.mjs publish --token <YOUR_TOKEN_HERE>
+```
````

## Expected Behavior

- A finding anchored at `docs/contributing/examples.md:17` quoting the declaration
  at `:5`（「個人環境の絶対パスを書くことを禁止する」）and showing the violation
  (`/Users/alice/work/...`), with both `<file>:<line>` positions present as the
  Evidence section requires.
- A finding anchored at `docs/contributing/examples.md:23` quoting the declaration
  at `:6`（「そのまま実行できる形で書く」）against the placeholder-only command.
- No opinion on whether the rules themselves are good — 規則そのものの妥当性判断
  is a Non-goal.

<!-- expected:
findings:
  - severity: major
    reason: L5 で「個人環境の絶対パスを禁止」と宣言した同一ファイルの L17 が絶対パスを使用しており宣言と実装が真逆
    anchor: docs/contributing/examples.md:17
  - severity: major
    reason: L6 で「コマンド例はそのまま実行できる形で書く」と宣言しながら L23 がプレースホルダのままで実行できない
    anchor: docs/contributing/examples.md:23
-->
