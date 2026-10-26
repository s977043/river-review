# Fixture 02 — New component is a purely static display element (False-Positive Guard)

## Description

The Pre-execution Gate holds: the diff adds a new exported, reusable UI component
under `src/components/`. The skill therefore runs rather than emitting
`NO_REVIEW`. The component renders a static SVG badge with no handlers, no focus
target, and no interactive affordance, so the False-positive guard "状態を持たない
純粋な表示コンポーネント（静的なテキスト・アイコン表示など、インタラクションが
無い）は指摘しない" suppresses any state-coverage finding.

## Input Diff

```diff
diff --git a/src/components/StatusDot.tsx b/src/components/StatusDot.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/StatusDot.tsx
@@ -0,0 +1,9 @@
+type Props = { tone: 'ok' | 'warn' | 'error' };
+
+export function StatusDot({ tone }: Props) {
+  return (
+    <svg width="8" height="8" role="presentation" aria-hidden="true">
+      <circle cx="4" cy="4" r="4" className={`dot dot--${tone}`} />
+    </svg>
+  );
+}
```

## Expected Behavior

- `findings: []`.
- `tone` is already a variants axis and is fully enumerated by the union type, so
  the variants side of the checklist is satisfied within the diff itself.
- disabled / loading / error interaction states do not apply: the element is
  `aria-hidden` decoration with no event handler, so demanding them would be the
  「状態を持たない表示要素への難癖」listed under 不合格基準.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、追加されたのはハンドラも focus 対象も持たない静的表示コンポーネントであり、False-positive guard「状態を持たない純粋な表示コンポーネントは指摘しない」に該当する。variants（tone）は union 型で差分内に列挙済み
-->
