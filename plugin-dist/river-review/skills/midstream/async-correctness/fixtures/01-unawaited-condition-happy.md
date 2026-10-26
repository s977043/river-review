# Fixture 01 — Promise evaluated in a condition without await (Happy Path)

## Description

A new job runner adds a lock check before processing, but calls the async
function `isLocked()` inside an `if` condition without `await`. A Promise object
is always truthy, so the early return always fires and the job is never
processed — exactly the "looks correct but is broken" async bug this skill
targets.
Additionally, `markDone()` is called without awaiting or handling errors
(floating promise).

Repository context (not part of the diff): `isLocked` and `markDone` are
declared in `src/jobs/store.ts` as `async function` returning `Promise<boolean>`
/ `Promise<void>`.

## Input Diff

```diff
diff --git a/src/jobs/runner.ts b/src/jobs/runner.ts
new file mode 100644
--- /dev/null
+++ b/src/jobs/runner.ts
@@ -0,0 +1,9 @@
+import { isLocked, markDone, process } from './store';
+
+export async function runJob(id: string): Promise<void> {
+  if (isLocked(id)) {
+    return;
+  }
+  await process(id);
+  markDone(id);
+}
```

## Expected Behavior

- One finding anchored to `src/jobs/runner.ts:4`: `isLocked(id)` returns a
  Promise, which is always truthy, so the early return always fires and the job
  is never processed. Severity: major. Fix: `if (await isLocked(id))`.
- One finding anchored to `src/jobs/runner.ts:8`: `markDone(id)` is a floating
  promise — completion is not awaited and rejection is unhandled. Severity:
  major (or minor if the repo enforces no-floating-promises). Fix:
  `await markDone(id)`.
- No findings about parallelization opportunities or code style.
