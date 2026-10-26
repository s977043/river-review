# Fixture 01 — New interactive component without disabled / loading states (Happy Path)

## Description

The diff adds a new reusable, exported UI component (`src/components/SubmitButton.tsx`),
so the Pre-execution Gate holds. The component is interactive (it renders a
`<button>` with an `onClick`) and declares a `variant` prop, but it accepts no
`disabled` and no `loading` state, and no `*.stories.*` or type-level declaration
exists elsewhere (`code_search` for `SubmitButton` returns only this file). That is
the Rule section's 状態・variants の確認 step failing on 実害の大きい状態欠落.

## Input Diff

```diff
diff --git a/src/components/SubmitButton.tsx b/src/components/SubmitButton.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/SubmitButton.tsx
@@ -0,0 +1,13 @@
+type Props = {
+  label: string;
+  variant: 'primary' | 'secondary';
+  onClick: () => void;
+};
+
+export function SubmitButton({ label, variant, onClick }: Props) {
+  return (
+    <button className={`btn btn--${variant}`} onClick={onClick}>
+      {label}
+    </button>
+  );
+}
```

`code_search` result quoted as evidence: `rg "SubmitButton" -l` returns only
`src/components/SubmitButton.tsx` — no stories file, no separate type or docs
declaration.

## Expected Behavior

- A finding on `src/components/SubmitButton.tsx:1` (the Props type) for the missing
  `disabled` state, naming the component, the missing state, and the definition to
  add — the three items the Rule 制約 requires.
- A finding on `src/components/SubmitButton.tsx:7` for the missing `loading`
  state on a submit-style action, whose absence forces a後付け対応 later.
- The report must state that the別ファイル確認 was performed (the `code_search`
  above), per the 制約 "別ファイルでの定義有無を確認してから報告する".
- No comment on `focus-visible` styling or on reuse of an existing button — those
  are the Non-goals (`modern-web-a11y-interactive` / `design-system-component-reuse`).

<!-- expected:
findings:
  - severity: minor
    reason: 新規インタラクティブコンポーネントの Props に disabled 状態が定義されておらず、stories・型定義など別ファイルにも記載がない
    anchor: src/components/SubmitButton.tsx:1
  - severity: minor
    reason: 送信系ボタンで loading 状態が未定義であり、後付けでの状態追加が破綻を招く
    anchor: src/components/SubmitButton.tsx:7
-->
