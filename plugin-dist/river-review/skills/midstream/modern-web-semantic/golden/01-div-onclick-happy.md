Finding: A `<div>` with an `onClick` handler and `tabIndex` is used where a `<button>` element would provide the same interaction natively.

Evidence:

```diff
-      <button onClick={onSave}>Save</button>
+      <div onClick={onSave} tabIndex={0} className="save-btn">
+        Save
+      </div>
```

The diff replaces a `<button>` with a `<div>` that manually re-implements keyboard focus via `tabIndex={0}`. This loses the built-in Enter/Space key activation, implicit `role="button"` ARIA semantics, and native focus styling that `<button>` provides automatically.

Suggestion: Revert to `<button onClick={onSave} className="save-btn">Save</button>`. The HTML `<button>` element (MDN: [HTMLButtonElement](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button)) provides focus management, keyboard activation (Enter and Space), and `role="button"` at zero cost. The manual `tabIndex` on `<div>` does not restore Enter/Space handling without an additional `onKeyDown` guard. If custom styling is the concern, CSS resets (`all: unset` or targeted overrides) on `<button>` are the recommended approach.

Note: No false-positive guard applies — this is not a library-provided component, not a typo/rename diff, and no legacy browser support policy was detected.

Severity: minor
Confidence: high
