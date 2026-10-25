Finding: Popover API (`popover` attribute) introduced without feature detection

Evidence:

```diff
-      <div role="tooltip">{children}</div>
+      <div popover="auto" id={id}>{children}</div>
```

File: `src/components/HelpTooltip.tsx` — the `popover="auto"` attribute (and the
paired `popovertarget` on the button) use the Popover API, which reached all
modern browsers in 2024.

Baseline: Newly available (2024) — Safari 17, Chrome 114, Firefox 125. Older
Safari versions (< 17) and any non-evergreen browser do not support the
`popover` attribute; the element will render as a static, always-visible `<div>`
with no show/hide behaviour.

Suggestion: Add a JavaScript feature-detection guard before relying on the
Popover API behaviour, for example:

```ts
if ('popover' in HTMLElement.prototype) {
  // Popover API path — already handled by the JSX above
} else {
  // fallback: e.g. aria-expanded toggle or CSS-only show/hide
}
```

Alternatively, if only the CSS anchor/display aspect matters, gate styles with:

```css
@supports selector([popover]) {
  /* popover-specific styles */
}
```

If your repo targets evergreen / modern browsers only (documented in
`package.json` `browserslist`, `.browserslistrc`, or `.river/rules.md`), this
suggestion can be dismissed.

Severity: minor
Confidence: high
