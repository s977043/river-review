import assert from 'node:assert/strict';
import test from 'node:test';

import { detectApiCompatibilitySignals } from '../src/lib/api-compatibility-signals.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

function detect(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  return detectApiCompatibilitySignals({ diff: { files: parsed.files } });
}

test('detects a DTO field type change as a neutral signal', () => {
  const signals = detect(`diff --git a/src/dto/user.ts b/src/dto/user.ts
--- a/src/dto/user.ts
+++ b/src/dto/user.ts
@@ -1,4 +1,4 @@
 interface UserDto {
-  id: string;
+  id: number;
   name: string;
 }
`);

  assert.deepEqual(signals, [{ kind: 'dto-field-type-changed', file: 'src/dto/user.ts', line: 2 }]);
});

test('detects optional to required without misclassifying it as a type change', () => {
  const signals = detect(`diff --git a/src/types/user.ts b/src/types/user.ts
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ -1,4 +1,4 @@
 export interface UserDto {
-  nickname?: string;
+  nickname: string;
   id: string;
 }
`);

  assert.deepEqual(signals, [
    { kind: 'dto-requiredness-tightened', file: 'src/types/user.ts', line: 2 },
  ]);
});

test('detects a removed DTO field', () => {
  const signals = detect(`diff --git a/src/api/user-contract.ts b/src/api/user-contract.ts
--- a/src/api/user-contract.ts
+++ b/src/api/user-contract.ts
@@ -1,5 +1,4 @@
 interface UserResponse {
   id: string;
-  legacyName: string;
   name: string;
 }
`);

  assert.deepEqual(signals, [
    { kind: 'dto-field-removed', file: 'src/api/user-contract.ts', line: 3 },
  ]);
});

test('detects an added optional field for consumer-handling review', () => {
  const signals = detect(`diff --git a/src/contracts/user.ts b/src/contracts/user.ts
--- a/src/contracts/user.ts
+++ b/src/contracts/user.ts
@@ -1,4 +1,5 @@
 type UserDto = {
   id: string;
+  nickname?: string;
   name: string;
 };
`);

  assert.deepEqual(signals, [
    { kind: 'dto-optional-field-added', file: 'src/contracts/user.ts', line: 3 },
  ]);
});

test('detects a contract-named declaration outside a conventional contract path', () => {
  const signals = detect(`diff --git a/src/service/user.ts b/src/service/user.ts
--- a/src/service/user.ts
+++ b/src/service/user.ts
@@ -1,4 +1,4 @@
 interface UserResponse {
-  id: string;
+  id: number;
   name: string;
 }
`);

  assert.deepEqual(signals, [
    { kind: 'dto-field-type-changed', file: 'src/service/user.ts', line: 2 },
  ]);
});

test('does not treat an internal interface as an API contract signal', () => {
  const signals = detect(`diff --git a/src/service/user.ts b/src/service/user.ts
--- a/src/service/user.ts
+++ b/src/service/user.ts
@@ -1,4 +1,4 @@
 interface CacheState {
-  retries: string;
+  retries: number;
   ready: boolean;
 }
`);

  assert.deepEqual(signals, []);
});

test('does not promote a generic types directory to API contract status', () => {
  const signals = detect(`diff --git a/src/types/cache.ts b/src/types/cache.ts
--- a/src/types/cache.ts
+++ b/src/types/cache.ts
@@ -1,4 +1,4 @@
 interface CacheState {
-  retries: string;
+  retries: number;
   ready: boolean;
 }
`);

  assert.deepEqual(signals, []);
});

test('declaration fallback evaluates only the contract-named hunk', () => {
  const signals = detect(`diff --git a/src/service/user.ts b/src/service/user.ts
--- a/src/service/user.ts
+++ b/src/service/user.ts
@@ -1,4 +1,5 @@
 interface UserResponse {
   id: string;
+  nickname?: string;
   name: string;
 }
@@ -20,4 +21,4 @@
 interface CacheState {
-  retries: string;
+  retries: number;
   ready: boolean;
 }
`);

  assert.deepEqual(signals, [
    { kind: 'dto-optional-field-added', file: 'src/service/user.ts', line: 3 },
  ]);
});

test('does not treat a moved or reformatted property as a contract change', () => {
  const signals = detect(`diff --git a/src/dto/user.ts b/src/dto/user.ts
--- a/src/dto/user.ts
+++ b/src/dto/user.ts
@@ -1,5 +1,5 @@
 interface UserDto {
-  id: string;
   name: string;
+  id: string;
   active: boolean;
 }
`);

  assert.deepEqual(signals, []);
});

test('does not activate on a newly-added DTO file', () => {
  const signals = detect(`diff --git a/src/dto/new-user.ts b/src/dto/new-user.ts
new file mode 100644
--- /dev/null
+++ b/src/dto/new-user.ts
@@ -0,0 +1,4 @@
+interface NewUserDto {
+  id: string;
+  nickname?: string;
+}
`);

  assert.deepEqual(signals, []);
});

test('does not activate on tests or fixtures', () => {
  const signals = detect(`diff --git a/tests/dto/user.test.ts b/tests/dto/user.test.ts
--- a/tests/dto/user.test.ts
+++ b/tests/dto/user.test.ts
@@ -1,4 +1,4 @@
 interface UserFixture {
-  id: string;
+  id: number;
 }
`);

  assert.deepEqual(signals, []);
});

test('does not treat an ordinary object property edit as an API contract signal', () => {
  const signals = detect(`diff --git a/src/service/user.ts b/src/service/user.ts
--- a/src/service/user.ts
+++ b/src/service/user.ts
@@ -1,4 +1,4 @@
 const defaults = {
-  timeout: string;
+  timeout: number;
 };
`);

  assert.deepEqual(signals, []);
});

// --- #2314: combined diff marker columns and the --unified=0 declaration scope

const CC_FIRST_PARENT = `diff --cc src/api/user.ts
index cf979c5,27481b2..c46f3ff
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@@ -1,4 -1,6 +1,5 @@@
  interface UserResponse {
    id: string;
 -  legacyName: string;
    name: string;
+   locale: string;
  }
`;

// The same merge read from the other parent. The semantic change is identical;
// only which column carries the marker differs.
const CC_REVERSE = `diff --cc src/api/user.ts
index 27481b2,cf979c5..c46f3ff
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@@ -1,6 -1,4 +1,5 @@@
  interface UserResponse {
    id: string;
-   legacyName: string;
    name: string;
 +  locale: string;
  }
`;

test('combined diff: a removal in the second parent column is not read as context', () => {
  const signals = detect(CC_FIRST_PARENT);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-removed']
  );
});

test('combined diff: the verdict does not depend on which parent the merge is read from', () => {
  const first = detect(CC_FIRST_PARENT).map((signal) => signal.kind);
  const reverse = detect(CC_REVERSE).map((signal) => signal.kind);
  assert.deepEqual(first, reverse);
  assert.deepEqual(first, ['dto-field-removed']);
});

test('combined diff: a merge that changes no contract property emits nothing', () => {
  const signals = detect(`diff --cc src/api/user.ts
index cf979c5,27481b2..c46f3ff
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@@ -1,4 -1,4 +1,4 @@@
  interface UserResponse {
 -  // renamed in one parent
 +  // renamed on this side
    id: string;
  }
`);
  assert.deepEqual(signals, []);
});

// Cross-check against the production parse path rather than against a second
// copy of the column rules written inside this test (CLAUDE.md "Self-consistent
// test traps"). `parseUnifiedDiff` records the new-file line number of every
// line it classified as added; the detector must anchor its added-line signal
// on one of those, which is only true if both read the same columns.
test('combined diff: detector line anchors agree with parseUnifiedDiff addedLines', () => {
  const diffText = `diff --cc src/api/profile.ts
index d0bd09c,44f47d8..21a014c
--- a/src/api/profile.ts
+++ b/src/api/profile.ts
@@@ -1,4 -1,4 +1,5 @@@
  interface ProfileResponse {
    id: string;
 +  nickname?: string;
+   avatarUrl: string;
  }
`;
  const parsed = parseUnifiedDiff(diffText);
  const addedLines = parsed.files[0].addedLines;
  assert.deepEqual(addedLines, [3, 4]);

  const signals = detectApiCompatibilitySignals({ diff: { files: parsed.files } });
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-optional-field-added']
  );
  assert.ok(
    addedLines.includes(signals[0].line),
    'signal anchored on a line parseUnifiedDiff did not classify as added'
  );
});

// Real `git diff` output: `ttlSeconds` changes inside a `@Module({...})`
// argument. git's funcname heuristic skips the `@`-prefixed opener and labels
// the hunk with the already-closed interface above it.
const STALE_HEADING_DEFAULT = `diff --git a/src/app/app.module.ts b/src/app/app.module.ts
index a147f95..f97f6e2 100644
--- a/src/app/app.module.ts
+++ b/src/app/app.module.ts
@@ -4,6 +4,6 @@ export interface HealthResponse {
 
 @Module({
   providers: [],
-  ttlSeconds: 30,
+  ttlSeconds: 60,
 })
 export class AppModule {}
`;

const STALE_HEADING_U0 = `diff --git a/src/app/app.module.ts b/src/app/app.module.ts
index a147f95..f97f6e2 100644
--- a/src/app/app.module.ts
+++ b/src/app/app.module.ts
@@ -7 +7 @@ export interface HealthResponse {
-  ttlSeconds: 30,
+  ttlSeconds: 60,
`;

test('a stale contract hunk heading does not activate: default band', () => {
  assert.deepEqual(detect(STALE_HEADING_DEFAULT), []);
});

test('a stale contract hunk heading does not activate: --unified=0 band', () => {
  // The same stale heading survives --unified=0, which is why trusting the
  // heading only in that band would not have removed the false activation.
  assert.deepEqual(detect(STALE_HEADING_U0), []);
});

test('a stale contract hunk heading does not activate: top-level IIFE opener', () => {
  assert.deepEqual(
    detect(`diff --git a/src/app/boot.ts b/src/app/boot.ts
index 7fdbe0f..fcd923f 100644
--- a/src/app/boot.ts
+++ b/src/app/boot.ts
@@ -4,7 +4,7 @@ export interface BootResponse {
 
 (function bootstrap() {
   const cfg = {
-    retries: 3,
+    retries: 5,
   };
   return cfg;
 })();
`),
    []
  );
});

// The `-`-before-`+` order inside classifyBodyLine is load-bearing, and the
// cross-check above cannot pin it because real git never emits a line whose
// columns mix the two. Pin it directly on a mixed-column line instead: reading
// `-+` as added would invent a new-file line for a line that is absent from the
// merge result and shift every anchor below it by one.
test('combined diff: a mixed-column line is read as removed, not added', () => {
  const signals = detect(`diff --cc src/api/order.ts
index 1111111,2222222..3333333
--- a/src/api/order.ts
+++ b/src/api/order.ts
@@@ -1,5 -1,5 +1,4 @@@
  interface OrderResponse {
    id: string;
-+  legacyTotal: string;
    total: number;
  }
`);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-removed']
  );
  // Anchored on the line the removed property used to sit at. If the mixed
  // column had been read as added, the counter would have advanced past it and
  // `total` would have been anchored one line low.
  assert.equal(signals[0].line, 3);
});

test('combined diff: the reversed mixed column is read as removed too', () => {
  const signals = detect(`diff --cc src/api/order.ts
index 1111111,2222222..3333333
--- a/src/api/order.ts
+++ b/src/api/order.ts
@@@ -1,5 -1,5 +1,4 @@@
  interface OrderResponse {
    id: string;
+-  legacyTotal: string;
    total: number;
  }
`);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-removed']
  );
  assert.equal(signals[0].line, 3);
});

test('combined diff: a `\\ No newline` marker does not advance the line counter', () => {
  const signals = detect(`diff --cc src/api/tail.ts
index 1111111,2222222..3333333
--- a/src/api/tail.ts
+++ b/src/api/tail.ts
@@@ -1,4 -1,4 +1,4 @@@
  interface TailResponse {
 -  id: string;
\\ No newline at end of file
 +  id: number;
  }
`);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-type-changed']
  );
  assert.equal(signals[0].line, 2);
});

// #2309 made the single-parent path stop counting `\ No newline at end of file`
// as a context line, so the two parse-layer classifiers now agree. This
// consumer has to follow, or its signal anchors drift one line below every
// such marker. Cross-checked against parseUnifiedDiff's own addedLines rather
// than against a hand-computed number.
test('single-parent diff: a `\\ No newline` marker does not advance the line counter', () => {
  const diffText = `diff --git a/src/api/tail.ts b/src/api/tail.ts
--- a/src/api/tail.ts
+++ b/src/api/tail.ts
@@ -1,4 +1,4 @@
 interface TailResponse {
   id: string;
-  total: string;
\\ No newline at end of file
+  total: number;
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  assert.deepEqual(parsed.files[0].addedLines, [3]);

  const signals = detectApiCompatibilitySignals({ diff: { files: parsed.files } });
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-type-changed']
  );
  assert.ok(
    parsed.files[0].addedLines.includes(signals[0].line),
    'signal anchored on a line parseUnifiedDiff did not classify as added'
  );
});
