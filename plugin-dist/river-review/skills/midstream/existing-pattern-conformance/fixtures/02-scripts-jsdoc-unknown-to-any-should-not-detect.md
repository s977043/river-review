# Test Case: scripts/ JSDoc `unknown` (Should NOT Detect)

False-positive canary（[#1476](https://github.com/s977043/river-review/pull/1476)）:
`scripts/validate-skills.mjs` に抽出された `loadSkillRegistry()` の JSDoc `@returns`
が `parsed: unknown` を使う差分。

gemini-code-assist はこれを「`unknown` だと `parsed?.skills` のようなプロパティ
アクセスで静的解析エラーになりうる」と指摘した。さらに「`any` / `Record<string, any>`
に変更して DX を上げよ」と提案したが、この提案は誤りです。

`scripts/` は `runners/node-api/tsconfig.json` の `include`（`src/**/*`）に含まれず、
tsc の型検査対象外です。JSDoc の型注釈は文書目的に留まります。`unknown` は呼び出し側に
絞り込みを強制する意図的で保守的な選択です。同レイヤの先行実装
`scripts/validate-agent-skills.mjs`（`@param {unknown} value` /
`@returns {Promise<Map<string, { applyTo: unknown, ... }>>}`）も同じ規約に従っている。

`existing-pattern-conformance` はこの提案をしてはならない。

## Description

- `scripts/validate-skills.mjs` の新規 `loadSkillRegistry()` は
  `@returns {Promise<{ ok: true, parsed: unknown } | { ok: false, phase: 'read' | 'parse', message: string }>}`
  という JSDoc を持つ。
- 同じ `scripts/` 配下の先行実装 `scripts/validate-agent-skills.mjs` も
  `@param {unknown} value` / `@returns {Promise<Map<string, { applyTo: unknown, relPath: string, isAgentSkill: boolean }>>}`
  のように、未検証値を `unknown` として文書化する同一規約を先に採用している。
- `scripts/` はどの `tsconfig.json` の `include` にも含まれず、tsc の型検査対象外
  （検査対象は `runners/node-api/tsconfig.json` の `include: ["src/**/*"]` のみ）。

## Input Diff

```diff
diff --git a/scripts/validate-skills.mjs b/scripts/validate-skills.mjs
index d015e358..d0a19ebc 100644
--- a/scripts/validate-skills.mjs
+++ b/scripts/validate-skills.mjs
@@ -255,6 +255,29 @@ export async function validatePacks({
   return success;
 }

+/**
+ * Read and parse skills/registry.yaml once. Returns `{ ok: true, parsed }` on
+ * success (`parsed` is `{}` for an empty file), or `{ ok: false, phase, message }`
+ * where `phase` is 'read' or 'parse'. Callers keep their own error wording so the
+ * existing console messages stay byte-identical.
+ *
+ * @param {string} registryPath absolute/relative path to registry.yaml
+ * @returns {Promise<{ ok: true, parsed: unknown } | { ok: false, phase: 'read' | 'parse', message: string }>}
+ */
+async function loadSkillRegistry(registryPath) {
+  let raw;
+  try {
+    raw = await fs.readFile(registryPath, 'utf8');
+  } catch (err) {
+    return { ok: false, phase: 'read', message: err.message };
+  }
+  try {
+    return { ok: true, parsed: yaml.load(raw) ?? {} };
+  } catch (err) {
+    return { ok: false, phase: 'parse', message: err.message };
+  }
+}
+
 /**
  * Forward-gate: every `recommended: true` skill in skills/registry.yaml must
  * carry quality evidence — an `eval/` or `fixtures/` directory alongside its
```

## Expected Behavior

The skill should NOT flag this:

1. JSDoc の `parsed: unknown` を `any` / `Record<string, any>` へ変更する提案をしない
   （`scripts/` は型検査対象外で実害がなく、`unknown` は保守的な意図的選択）。
2. 「静的解析エラー回避のため型を緩める」ことを既存パターン逸脱として指摘しない
   （既存実装 `scripts/validate-agent-skills.mjs` も同じ `unknown` 規約に従っており、
   緩めた側がむしろ既存パターンから外れる）。

<!-- expected:
findings: []
reason: scripts/ は tsc の型検査対象外（runners/node-api/tsconfig.json の include に含まれない）であり、JSDoc の unknown は呼び出し側に絞り込みを強制する保守的な意図的選択。同レイヤの先行実装 scripts/validate-agent-skills.mjs も同じ規約（#1476）
-->
