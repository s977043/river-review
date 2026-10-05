# Fixture 03 — Auto-advance on single radio selection ignores `required` (Happy Path)

## Description

A one-question radio step hides the 次へ button and advances as soon as an option is selected.
The auto-advance condition (`autoAdvance`) checks only the question count and type, not `question.required`, even though the step already reads `question.required` to show the 必須 badge.
A radio group cannot be cleared back to "no selection", so on an optional question the user can no longer skip it: the only way forward is to pick an answer.
The optional question becomes effectively required.

## Input Diff

```diff
diff --git a/src/components/survey/QuestionStep.tsx b/src/components/survey/QuestionStep.tsx
index a92c49f..ca8a3de 100644
--- a/src/components/survey/QuestionStep.tsx
+++ b/src/components/survey/QuestionStep.tsx
@@ -5,32 +5,38 @@ type Props = {
   answers: Answers;
   onAnswer: (questionId: string, value: string) => void;
   onNext: () => void;
 };

 export function QuestionStep({ step, answers, onAnswer, onNext }: Props) {
   const question = step.questions[0];
+  const autoAdvance = step.questions.length === 1 && question.type === 'radio';

   return (
     <fieldset>
       <legend>
         {question.label}
         {question.required && <span className="badge">必須</span>}
       </legend>
       {question.options.map((option) => (
         <label key={option.value}>
           <input
             type="radio"
             name={question.id}
             value={option.value}
             checked={answers[question.id] === option.value}
-            onChange={() => onAnswer(question.id, option.value)}
+            onChange={() => {
+              onAnswer(question.id, option.value);
+              if (autoAdvance) onNext();
+            }}
           />
           {option.label}
         </label>
       ))}
-      <button type="button" onClick={onNext}>
-        次へ
-      </button>
+      {!autoAdvance && (
+        <button type="button" onClick={onNext}>
+          次へ
+        </button>
+      )}
     </fieldset>
   );
 }
```

## Expected Behavior

- `Aspect: Form flow`.
- A finding on `src/components/survey/QuestionStep.tsx:12` (the `autoAdvance` condition), citing the hidden 次へ button on lines 35-39 as the consequence.
- The finding explains that an optional radio question cannot be skipped once the button is hidden, because a radio group cannot be returned to "no selection".
- Suggestion: prefer keeping the explicit 次へ button, because native radio groups fire `onChange` on arrow-key selection and would advance keyboard users on the first arrow key. If auto-advance is kept, limit it to required questions and trigger it from an explicit action (click / Enter), not from `onChange`.
- `Severity: minor`.
- `Confidence: high`.
