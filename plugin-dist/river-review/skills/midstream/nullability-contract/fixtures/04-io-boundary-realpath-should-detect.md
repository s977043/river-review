# Test Case: IO Boundary Exception (Should Detect)

Should-detect canary（#1475）: `fs.realpathSync` は外部 IO・環境境界の呼び出しで、
渡されたパスが存在しなければ `ENOENT` を throw する。try/catch なしで呼ぶと
実行時にクラッシュする実バグ（#1483 で修正）。fail-fast 分界の**外部境界側**であり、
`nullability-contract` はここへの防衛欠落を指摘しなければならない。#1480 の内部
不変条件（FP）と対になる、防衛必須のケース。

## Description

`realpathSync` の入力はモジュール外部（`argv` / 呼び出し元）由来で、存在保証がない。
存在しないパスで `ENOENT` が throw され、下流にエラーが伝播してプロセスがクラッシュする。

## Input Diff

```diff
diff --git a/src/lib/resolve-entry.ts b/src/lib/resolve-entry.ts
index abc1234..def5678 100644
--- a/src/lib/resolve-entry.ts
+++ b/src/lib/resolve-entry.ts
@@ -3,3 +3,5 @@ import { realpathSync } from 'node:fs';
 export function resolveEntry(inputPath: string): string {
-  return inputPath;
+  // inputPath は argv 由来で存在保証がない（外部 IO 境界）
+  const canonical = realpathSync(inputPath);
+  return canonical;
 }
```

## Expected Behavior

The skill should:

1. `realpathSync(inputPath)` を外部 IO 境界の呼び出しとして flag する — `inputPath` が
   存在しなければ `ENOENT` を throw し、未処理でクラッシュする。
2. Severity: major
3. Fix: 存在確認または try/catch でエラーを握らず処理し、呼び出し元へ意味のある
   結果（null / 明示エラー）を返す。

<!-- expected:
findings:
  - severity: major
    boundary: external-io
    pattern: realpathSync-enoent
reason: realpathSync は外部 IO 境界（argv 由来パス）で ENOENT を throw しうる。防衛欠落は実バグで指摘必須。#1480 の内部不変条件（FP）と対になる本物ケース（#1475→#1483）
-->
