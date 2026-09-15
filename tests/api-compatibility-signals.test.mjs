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
