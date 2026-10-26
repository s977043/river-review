Finding: The `<button>` in `CloseButton.tsx` lost its `aria-label="Close"` and now contains only an icon with no accessible name.

Evidence:

```diff
-  return <button onClick={onClose} aria-label="Close">{/* icon */}<XIcon /></button>;
+  return <button onClick={onClose}><XIcon /></button>;
```

Line 15 of the diff removes the `aria-label` attribute, leaving the button with no visible text and no ARIA label.

Impact: Screen reader users will hear an unlabeled or ambiguously named button (e.g., "button") instead of a meaningful name. This makes the close action undiscoverable for assistive technology users.

Fix: Restore `aria-label="Close"` on the button, or add visible text describing the action.

```tsx
<button onClick={onClose} aria-label="Close">
  <XIcon />
</button>
```

Severity: minor
Confidence: high
