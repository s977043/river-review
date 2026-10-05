Finding: Auto-advance on a single radio question ignores `required`, so an optional question can no longer be skipped.

Evidence:

```diff
+  const autoAdvance = step.questions.length === 1 && question.type === 'radio';
...
+      {!autoAdvance && (
+        <button type="button" onClick={onNext}>
+          次へ
+        </button>
+      )}
```

`src/components/survey/QuestionStep.tsx:12` — the `autoAdvance` condition checks only the question count and `type === 'radio'`. The same component already reads `question.required` (line 18, 必須 badge), but the condition does not. When `autoAdvance` is true, lines 35-39 hide the 次へ button, so the only way forward is selecting an option. A radio group cannot be returned to "no selection", so for an optional question the user is forced to answer. The library-component guard does not apply — this is a native `<input type="radio">` group with custom step logic.

Aspect: Form flow

Suggestion: Auto-advance only when the answer is required, and keep the 次へ button for optional questions:

```tsx
const autoAdvance = step.questions.length === 1 && question.type === 'radio' && question.required;
```

Reference: WCAG SC 3.2.2 On Input.

Severity: minor
Confidence: high
