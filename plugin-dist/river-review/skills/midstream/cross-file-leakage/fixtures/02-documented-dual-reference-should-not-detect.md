# Fixture 02 — Old references are a documented migration shim (False-Positive Guard)

## Description

The Pre-execution Gate holds: the diff performs a structural change (module split,
`src/config/loader.mjs` → `src/config/read.mjs` + `src/config/assert.mjs`), so the
skill runs and enumerates callers. Grep does return old-path references, but the
diff keeps `loader.mjs` as an explicit re-export shim and says so in the file, which
is the False-positive guard 「残骸が意図的（旧 API の互換 shim、移行期間中の
dual-reference）で差分内に明記がある場合は抑制」.

## Input Diff

```diff
diff --git a/src/config/read.mjs b/src/config/read.mjs
new file mode 100644
--- /dev/null
+++ b/src/config/read.mjs
@@ -0,0 +1,3 @@
+export async function readConfig(configPath) {
+  return JSON.parse(await fs.readFile(configPath, 'utf8'));
+}
diff --git a/src/config/loader.mjs b/src/config/loader.mjs
--- a/src/config/loader.mjs
+++ b/src/config/loader.mjs
@@ -1,3 +1,2 @@
-export async function readConfig(configPath) {
-  return JSON.parse(await fs.readFile(configPath, 'utf8'));
-}
+// 移行期間中の互換 shim。caller は順次 ./read.mjs へ移行し、v2.0.0 でこのファイルを削除する。
+export { readConfig } from './read.mjs';
```

`code_search` result quoted as evidence: `rg "config/loader.mjs" -n` returns

```text
src/cli.mjs:14:import { readConfig } from './config/loader.mjs';
runners/cli/run.mjs:9:import { readConfig } from '../../src/config/loader.mjs';
```

## Expected Behavior

- `findings: []`.
- The two remaining old-path imports still resolve through the shim and keep the
  same signature, so they are not broken callers.
- The shim's intent and its removal version are written in the diff itself, so the
  suppression rests on evidence in the change, not on an assumption.
- Reporting the callers anyway would be 「残骸がないのに指摘している」under the
  不合格基準.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、旧パス参照は差分内で削除予定版まで明記された互換 shim 経由で解決するため、False-positive guard「意図的な shim / dual-reference は抑制」に該当する
-->
