# Fixture 01 — Signature change leaves callers on the old shape (Happy Path)

## Description

The diff renames an exported symbol and changes its signature
(`loadConfig(path)` → `readConfig(path, options)`), which is a structural change
per the Pre-execution Gate. The definition file is updated, but grepping the old
identifier still returns caller sites that the diff never touches — the Rule
section's caller の列挙 → 残骸の判定 steps.

## Input Diff

```diff
diff --git a/src/config/loader.mjs b/src/config/loader.mjs
--- a/src/config/loader.mjs
+++ b/src/config/loader.mjs
@@ -1,3 +1,4 @@
-export async function loadConfig(configPath) {
-  return JSON.parse(await fs.readFile(configPath, 'utf8'));
+export async function readConfig(configPath, { strict = false } = {}) {
+  const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
+  return strict ? assertShape(raw) : raw;
 }
```

`code_search` result quoted as evidence: `rg "loadConfig" -n` returns

```text
src/cli.mjs:14:import { loadConfig } from './config/loader.mjs';
src/cli.mjs:31:  const config = await loadConfig(argv.config);
runners/cli/run.mjs:9:import { loadConfig } from '../../src/config/loader.mjs';
```

## Expected Behavior

- One finding (同一原因の残骸は 1 件にまとめる, per the 制約) anchored at
  `src/config/loader.mjs:1`, stating 構造変更（`loadConfig(path)` →
  `readConfig(path, options)`）, the 検索語 (`loadConfig`), and the 未更新 caller
  list with an explicit count: 3 箇所 — `src/cli.mjs:14`, `src/cli.mjs:31`,
  `runners/cli/run.mjs:9`.
- The impact must state that the old import no longer resolves, so the callers
  break at load time.
- No opinion on whether the rename was a good idea, and no in-file consistency
  comment — those are Non-goals（`self-contradiction` の領域）.

<!-- expected:
findings:
  - severity: major
    reason: loadConfig を readConfig へ改名・シグネチャ変更したが caller 3 箇所が旧シンボルを import したまま残っている
    anchor: src/config/loader.mjs:1
-->
