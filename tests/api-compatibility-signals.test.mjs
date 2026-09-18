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

test('--unified=0: a contract declared outside an api path is found in the hunk heading', () => {
  const signals = detect(`diff --git a/src/models/checkout.ts b/src/models/checkout.ts
index 88f17e5..a59193d 100644
--- a/src/models/checkout.ts
+++ b/src/models/checkout.ts
@@ -3 +2,0 @@ interface CheckoutResponse {
-  couponCode: string;
`);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ['dto-field-removed']
  );
});

test('--unified=0: a non-contract heading outside an api path still emits nothing', () => {
  const signals = detect(`diff --git a/src/models/cart.ts b/src/models/cart.ts
index 88f17e5..a59193d 100644
--- a/src/models/cart.ts
+++ b/src/models/cart.ts
@@ -3 +2,0 @@ interface InternalCartState {
-  scratchValue: string;
`);
  assert.deepEqual(signals, []);
});
