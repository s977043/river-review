# Test Case: Fail-Fast Internal Invariant (Should NOT Detect)

False-positive canary（#1480）: モジュール内部で構築した registry を引く際、
欠落したら**即クラッシュさせる**のが設計意図（fail-fast）。ここへ `?? {}` の
防衛的フォールバックを足すと、根絶したはずの silent drift を再導入する。
`nullability-contract` はこの内部不変条件へ防衛を提案してはならない。

## Description

`SKILL_REGISTRY` は同一モジュール内で全 kind を登録した内部不変条件。存在しない
kind を引くのは登録漏れ = バグであり、握りつぶさず throw させたい。`?? {}` は
その fail-fast を壊す（値の出所が外部 IO ではなく内部登録である点が判断基準）。

## Input Diff

```diff
diff --git a/src/core/skill-dispatcher.ts b/src/core/skill-dispatcher.ts
index abc1234..def5678 100644
--- a/src/core/skill-dispatcher.ts
+++ b/src/core/skill-dispatcher.ts
@@ -12,0 +12,6 @@ const SKILL_REGISTRY: Record<Kind, SkillEntry> = buildRegistry();
+
+export function resolveEntry(kind: Kind): SkillEntry {
+  const entry = SKILL_REGISTRY[kind];
+  if (!entry) throw new Error(`unregistered skill kind: ${kind}`);
+  return entry;
+}
```

## Expected Behavior

The skill should NOT flag this:

1. `SKILL_REGISTRY[kind]` の欠落は内部不変条件違反であり、`throw` で fail-fast させる意図。
2. `?? {}` などのフォールバックを提案しない（silent drift の再導入になる）。値の出所が
   内部登録であり、外部 IO 境界ではないため防衛は不要。

<!-- expected:
findings: []
reason: 内部で構築した registry の欠落は fail-fast が設計意図であり、防衛的フォールバック（?? {}）を提案しない。値の出所が内部不変条件で外部 IO 境界ではない（#1480）
-->
