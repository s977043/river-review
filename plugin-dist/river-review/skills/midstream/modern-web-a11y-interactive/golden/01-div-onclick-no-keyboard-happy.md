Finding: Clickable `<div>` lacks keyboard support — previously a `<button>`, now a generic element with `onClick` only.

Evidence:

```diff
-  return <button onClick={onSelect}>{label}</button>;
+  return (
+    <div onClick={onSelect} className="menu-item">{label}</div>
+  );
```

`src/components/MenuItem.tsx` — the original `<button>` was removed in favour of a `<div>` that carries no implicit keyboard role, no `tabIndex`, and no `onKeyDown` handler. Keyboard users and AT users navigating by Tab / Enter / Space cannot activate this element. The library-component guard does not apply — this is a custom `<div>`, and no `tabIndex` / `aria-*` attributes have been set deliberately.

Aspect: Keyboard

Suggestion: Revert to `<button>` (preferred — keyboard, focus, and implicit `role="button"` are provided for free):

```tsx
return (
  <button onClick={onSelect} className="menu-item">
    {label}
  </button>
);
```

If a non-button element is required for styling reasons, add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that calls `onSelect` on `Enter` / `Space`:

```tsx
return (
  <div
    role="button"
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') onSelect();
    }}
    className="menu-item"
  >
    {label}
  </div>
);
```

Reference: WAI-ARIA Authoring Practices — Button Pattern; WCAG SC 2.1.1 Keyboard.

Severity: minor
Confidence: high
