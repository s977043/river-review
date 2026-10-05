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

Suggestion: Keep the explicit 次へ button for every question and drop the advance from `onChange`. Native radio groups move the selection with the arrow keys and fire `onChange` on each move, so advancing on selection change also sends keyboard users to the next step on their first arrow key:

```tsx
onChange={() => onAnswer(question.id, option.value)}
...
<button type="button" onClick={onNext}>
  次へ
</button>
```

If auto-advance must stay, limit it to required questions (`&& question.required`) and trigger it from an explicit action such as a click or Enter, not from `onChange`. An optional question that offers an explicit skip option (for example 「回答しない」) would not need this finding.

Reference: WCAG SC 3.2.2 On Input — changing a radio selection should not change the context without warning.

Severity: minor
Confidence: high
