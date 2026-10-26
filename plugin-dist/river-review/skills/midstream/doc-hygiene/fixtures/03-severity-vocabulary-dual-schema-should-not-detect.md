# Test Case: Severity Dual Vocabulary in Registry SKILL.md (Should NOT Detect)

False-positive canary（[#1502](https://github.com/s977043/river-review/pull/1502)）:
a registry skill's `SKILL.md` uses the internal severity vocabulary
（`blocker` / `warning` / `nit`）in its "severity 較正" (calibration) section
and Output example, while the frontmatter and downstream JSON schema use the
normalized vocabulary（`critical` / `major` / `minor`）. This is not vocabulary
drift — `.claude/rules/review-core.md`「Severityの語彙マッピング」defines this as
an intentional two-layer mapping (internal prompt vocabulary → normalized
output schema). `doc-hygiene` must not propose unifying the two vocabularies.

## Description

- SKILL.md 本文の「severity 較正」節・Output 例は `blocker` / `warning` / `nit`
  を使う（LLM プロンプト向け内部語彙）。
- 同じ SKILL.md の frontmatter `severity:` フィールドは正規化後語彙
  （`major` 等）を使う。
- これは規約（`.claude/rules/review-core.md` の写像表）で定義済みの意図的な
  二層構造であり、「表記が揺れている」とみなして一方に統一する提案は誤り。

## Input Diff

```diff
diff --git a/skills/midstream/impact-evidence-coverage/SKILL.md b/skills/midstream/impact-evidence-coverage/SKILL.md
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/skills/midstream/impact-evidence-coverage/SKILL.md
@@ -0,0 +1,14 @@
+---
+id: 'impact-evidence-coverage'
+severity: major
+---
+
+### severity 較正
+
+- 影響が不可逆・互換破壊・データ損失に及ぶ軸で証拠不在なら `blocker`（重大 Blocking）。
+- 影響が現在系の挙動に及ぶが可逆で、merge 前の証拠追加で解消すべきものは `warning`。
+- リスクが将来ドリフトで、resolution が merge 後の観測で足りるものは `nit`。
+
+## Output / 出力フォーマット
+
+`<file>:<line>` の指摘に `Severity: blocker | warning | nit`（較正基準に従う）を含める。
```

## Expected Behavior

The skill should NOT flag this:

1. `blocker` / `warning` / `nit` を `critical` / `major` / `minor` へ統一する提案をしない。
2. frontmatter `severity: major` と本文中の `blocker`/`warning`/`nit` の並存を
   「表記揺れ」として指摘しない — `.claude/rules/review-core.md` の写像が SSoT。

<!-- expected:
findings: []
reason: registry SKILL.md の内部語彙（blocker/warning/nit）と出力スキーマ語彙（critical/major/minor）は review-core.md で定義済みの意図的な二層構造であり、統一提案は指摘対象外（#1502）
-->
