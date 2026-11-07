import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { minimatch } from 'minimatch';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { parseSkillFile } from '../runners/core/skill-loader.mjs';
import { buildExecutionPlan } from '../runners/core/review-runner.mjs';
import {
  buildHeuristicComments,
  SKILL_HEURISTIC_MAP,
  HEURISTIC_SKILL_IDS,
  HEURISTIC_KIND_PRESENTATIONS,
} from '../src/lib/heuristic-review.mjs';

test('buildHeuristicComments detects hardcoded secrets for security skill', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-security-hardcoded-token.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/config/auth.ts');
  assert.equal(comments[0].line, 6);
  assert.equal(comments[0].kind, 'hardcoded-secret');
});

test('buildHeuristicComments is quiet when security skill is not selected', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-security-hardcoded-token.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'typescript-strict' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('buildHeuristicComments detects dangerous eval for security skill (no LLM)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,2 +1,3 @@
 export function run(input) {
+  return eval(input);
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  const evalC = comments.find((c) => c.kind === 'dangerous-eval');
  assert.ok(evalC, 'expected a dangerous-eval finding');
  assert.equal(evalC.file, 'src/handler.ts');
});

test('buildHeuristicComments flags document.write and string-arg setTimeout (#dangerous-eval)', () => {
  const docWrite = `diff --git a/src/ui/render.ts b/src/ui/render.ts
--- a/src/ui/render.ts
+++ b/src/ui/render.ts
@@ -1,1 +1,2 @@
 const a = 1;
+document.write(userHtml);
`;
  const strTimer = `diff --git a/src/ui/render.ts b/src/ui/render.ts
--- a/src/ui/render.ts
+++ b/src/ui/render.ts
@@ -1,1 +1,2 @@
 const a = 1;
+setTimeout('doStuff()', 100);
`;
  const safeTimer = `diff --git a/src/ui/render.ts b/src/ui/render.ts
--- a/src/ui/render.ts
+++ b/src/ui/render.ts
@@ -1,1 +1,2 @@
 const a = 1;
+setTimeout(() => doStuff(), 100);
`;
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const dw = buildHeuristicComments({ diff: { files: parseUnifiedDiff(docWrite).files }, plan });
  const st = buildHeuristicComments({ diff: { files: parseUnifiedDiff(strTimer).files }, plan });
  const safe = buildHeuristicComments({ diff: { files: parseUnifiedDiff(safeTimer).files }, plan });
  assert.ok(dw.find((c) => c.kind === 'dangerous-eval'));
  assert.ok(st.find((c) => c.kind === 'dangerous-eval'));
  assert.equal(
    safe.find((c) => c.kind === 'dangerous-eval'),
    undefined
  );
});

test('buildHeuristicComments flags document.writeln (#1085 review)', () => {
  const diffText = `diff --git a/src/ui/render.ts b/src/ui/render.ts
--- a/src/ui/render.ts
+++ b/src/ui/render.ts
@@ -1,1 +1,2 @@
 const a = 1;
+document.writeln(userHtml);
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'dangerous-eval'));
});

test('buildHeuristicComments still flags eval after a // inside a string (#1085 review)', () => {
  // The trailing-comment strip must be quote-aware: the // here is inside the
  // string literal, so the real eval after it must NOT be lost.
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const u = "http://x"; eval(payload);
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'dangerous-eval'));
});

test('buildHeuristicComments does not flag dangerous eval in test files', () => {
  const diffText = `diff --git a/src/handler.test.ts b/src/handler.test.ts
index 1111111..2222222 100644
--- a/src/handler.test.ts
+++ b/src/handler.test.ts
@@ -1,2 +1,3 @@
 test('x', () => {
+  eval('1+1');
 });
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'dangerous-eval'),
    undefined
  );
});

test('buildHeuristicComments detects leftover debugger for logging skill (no LLM)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,2 +1,3 @@
 export function run() {
+  debugger;
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  const dbg = comments.find((c) => c.kind === 'debugger-leftover');
  assert.ok(dbg, 'expected a debugger-leftover finding');
  assert.equal(dbg.file, 'src/handler.ts');
});

test('buildHeuristicComments does not flag a commented-out debugger', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,2 +1,3 @@
 export function run() {
+  // debugger;
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'debugger-leftover'),
    undefined
  );
});

test('buildHeuristicComments detects disabled TLS verification for security skill (no LLM)', () => {
  const diffText = `diff --git a/src/config/http.ts b/src/config/http.ts
index 1111111..2222222 100644
--- a/src/config/http.ts
+++ b/src/config/http.ts
@@ -1,2 +1,3 @@
 export const agent = new https.Agent({
+  rejectUnauthorized: false,
 });
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  const tls = comments.find((c) => c.kind === 'insecure-tls');
  assert.ok(tls, 'expected an insecure-tls finding');
  assert.equal(tls.file, 'src/config/http.ts');
});

test('buildHeuristicComments detects merge conflict markers (no LLM)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,4 @@
 const a = 1;
+<<<<<<< HEAD
+const b = 2;
+>>>>>>> feature
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'merge-conflict'));
});

test('buildHeuristicComments detects weak hash (md5/sha1) for security skill (no LLM)', () => {
  const diffText = `diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -1,1 +1,2 @@
 import crypto from 'crypto';
+const h = crypto.createHash('md5').update(x).digest('hex');
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'weak-hash'));
});

test('buildHeuristicComments detects command injection via template literal (no LLM)', () => {
  const inj = `diff --git a/src/api/run.ts b/src/api/run.ts
--- a/src/api/run.ts
+++ b/src/api/run.ts
@@ -1,1 +1,2 @@
 import { execSync } from 'child_process';
+execSync(\`ls \${userInput}\`);
`;
  const safe = `diff --git a/src/api/run.ts b/src/api/run.ts
--- a/src/api/run.ts
+++ b/src/api/run.ts
@@ -1,1 +1,2 @@
 import { execFile } from 'child_process';
+execFile('ls', [userInput]);
`;
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const injComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(inj).files },
    plan,
  });
  const safeComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(safe).files },
    plan,
  });
  assert.ok(injComments.find((c) => c.kind === 'command-injection'));
  assert.equal(
    safeComments.find((c) => c.kind === 'command-injection'),
    undefined
  );
});

test('buildHeuristicComments does not flag weak hash in a trailing comment (#1084 review)', () => {
  const diffText = `diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const h = strong(); // do not use createHash('md5')
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'weak-hash'),
    undefined
  );
});

test('buildHeuristicComments does not flag regex.exec as command injection (#1084 review)', () => {
  const diffText = `diff --git a/src/api/run.ts b/src/api/run.ts
--- a/src/api/run.ts
+++ b/src/api/run.ts
@@ -1,1 +1,2 @@
 const re = /x/;
+const m = re.exec(\`value \${userInput}\`);
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'command-injection'),
    undefined
  );
});

test('buildHeuristicComments detects disabled tests (.skip / xit) (no LLM)', () => {
  const diffText = `diff --git a/tests/foo.test.mjs b/tests/foo.test.mjs
index 1111111..2222222 100644
--- a/tests/foo.test.mjs
+++ b/tests/foo.test.mjs
@@ -1,2 +1,4 @@
 import test from 'node:test';
+test.skip('pending', () => {});
+xit('also disabled', () => {});
+xcontext('group disabled', () => {});
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'test-existence' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'disabled-test'));
});

test('buildHeuristicComments detects diff3 base marker ||||||| (#1082 review)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,2 @@
 const a = 1;
+||||||| base
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.find((c) => c.kind === 'merge-conflict'));
});

test('buildHeuristicComments detects @ts-ignore but not @ts-expect-error (no LLM)', () => {
  const ignore = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,1 +1,2 @@
 const a = 1;
+// @ts-ignore
`;
  const expectErr = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,1 +1,2 @@
 const a = 1;
+// @ts-expect-error reason
`;
  const plan = { selected: [{ metadata: { id: 'typescript-strict' } }] };
  const ignoreComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(ignore).files },
    plan,
  });
  const expectComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(expectErr).files },
    plan,
  });
  assert.ok(ignoreComments.find((c) => c.kind === 'ts-suppression'));
  assert.equal(
    expectComments.find((c) => c.kind === 'ts-suppression'),
    undefined
  );
});

test('buildHeuristicComments does not flag debugger in a trailing comment (#1081 review)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,2 +1,3 @@
 export function run() {
+  const x = 1; // remove the debugger later
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'debugger-leftover'),
    undefined
  );
});

test('buildHeuristicComments flags NODE_TLS_REJECT_UNAUTHORIZED=0 but not =1 (#1081 review)', () => {
  const insecure = `diff --git a/src/config/http.ts b/src/config/http.ts
--- a/src/config/http.ts
+++ b/src/config/http.ts
@@ -1,1 +1,2 @@
 const a = 1;
+process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
`;
  const secure = `diff --git a/src/config/http.ts b/src/config/http.ts
--- a/src/config/http.ts
+++ b/src/config/http.ts
@@ -1,1 +1,2 @@
 const a = 1;
+process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
`;
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const insecureComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(insecure).files },
    plan,
  });
  const secureComments = buildHeuristicComments({
    diff: { files: parseUnifiedDiff(secure).files },
    plan,
  });
  assert.ok(insecureComments.find((c) => c.kind === 'insecure-tls'));
  assert.equal(
    secureComments.find((c) => c.kind === 'insecure-tls'),
    undefined
  );
});

test('buildHeuristicComments does not flag eval in a comment (#1080 review)', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
index 1111111..2222222 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,2 +1,3 @@
 export function run(input) {
+  // never use eval(input) here
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'dangerous-eval'),
    undefined
  );
});

test('buildHeuristicComments does not flag a commented-out .only (#1080 review)', () => {
  const diffText = `diff --git a/tests/foo.test.mjs b/tests/foo.test.mjs
index 1111111..2222222 100644
--- a/tests/foo.test.mjs
+++ b/tests/foo.test.mjs
@@ -1,2 +1,3 @@
 import test from 'node:test';
+// test.only('focused', () => {});
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'test-existence' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.equal(
    comments.find((c) => c.kind === 'focused-test'),
    undefined
  );
});

test('buildHeuristicComments detects focused tests (.only) for test skill (no LLM)', () => {
  const diffText = `diff --git a/tests/foo.test.mjs b/tests/foo.test.mjs
index 1111111..2222222 100644
--- a/tests/foo.test.mjs
+++ b/tests/foo.test.mjs
@@ -1,2 +1,3 @@
 import test from 'node:test';
+test.only('focused', () => {});
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'test-existence' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  const focused = comments.find((c) => c.kind === 'focused-test');
  assert.ok(focused, 'expected a focused-test finding');
  assert.equal(focused.file, 'tests/foo.test.mjs');
});

test('buildHeuristicComments detects hardcoded secrets in object literals (unquoted key)', () => {
  const diffText = `diff --git a/src/config/auth.ts b/src/config/auth.ts
index 1111111..2222222 100644
--- a/src/config/auth.ts
+++ b/src/config/auth.ts
@@ -1,3 +1,4 @@
 export const authConfig = {
   issuer: 'https://example.com',
+  serviceToken: 'DUMMY_TOKEN_123',
 };
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/config/auth.ts');
  assert.equal(comments[0].line, 3);
  assert.equal(comments[0].kind, 'hardcoded-secret');
});

test('buildHeuristicComments detects explicit token patterns (AKIA/ghp_/sk-)', () => {
  const diffText = `diff --git a/src/config/keys.ts b/src/config/keys.ts
index 1111111..2222222 100644
--- a/src/config/keys.ts
+++ b/src/config/keys.ts
@@ -1,1 +1,4 @@
+export const AWS_KEY = 'AKIA1234567890ABCDEF';
+export const GH_TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';
+export const API_KEY = 'sk-1234567890abcdef1234567890abcdef';
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 3);
  assert.equal(comments[0].file, 'src/config/keys.ts');
  assert.ok(comments.every((c) => c.kind === 'hardcoded-secret'));
});

test('buildHeuristicComments ignores env var references (process.env / import.meta.env)', () => {
  const diffText = `diff --git a/src/config/keys.ts b/src/config/keys.ts
index 1111111..2222222 100644
--- a/src/config/keys.ts
+++ b/src/config/keys.ts
@@ -1,1 +1,3 @@
+export const API_KEY = process.env.API_KEY;
+export const TOKEN = import.meta.env.VITE_TOKEN;
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('buildHeuristicComments ignores URL values and short values', () => {
  const diffText = `diff --git a/src/config/keys.ts b/src/config/keys.ts
index 1111111..2222222 100644
--- a/src/config/keys.ts
+++ b/src/config/keys.ts
@@ -1,1 +1,3 @@
+export const API_KEY = 'https://example.com/not-a-secret';
+export const API_TOKEN = 'short';
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('buildHeuristicComments limits hardcoded secret findings to 3', () => {
  const diffText = `diff --git a/src/config/keys.ts b/src/config/keys.ts
index 1111111..2222222 100644
--- a/src/config/keys.ts
+++ b/src/config/keys.ts
@@ -1,1 +1,6 @@
+export const TOKEN_1 = 'DUMMY_TOKEN_123';
+export const TOKEN_2 = 'DUMMY_TOKEN_234';
+export const TOKEN_3 = 'DUMMY_TOKEN_345';
+export const TOKEN_4 = 'DUMMY_TOKEN_456';
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 3);
});

test('buildHeuristicComments detects hardcoded secrets in object literals (quoted key)', () => {
  const diffText = `diff --git a/src/config/auth.ts b/src/config/auth.ts
index 1111111..2222222 100644
--- a/src/config/auth.ts
+++ b/src/config/auth.ts
@@ -1,3 +1,4 @@
 export const authConfig = {
   issuer: 'https://example.com',
+  'serviceToken': 'DUMMY_TOKEN_123',
 };
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].kind, 'hardcoded-secret');
});

test('buildHeuristicComments detects silent catch for observability skill', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-observability-silent-catch.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'logging-observability' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/services/payments.ts');
  assert.equal(comments[0].kind, 'silent-catch');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments detects missing tests for downstream test skills', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/downstream-new-behavior-no-tests.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'test-existence' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/calc.ts');
  assert.equal(comments[0].kind, 'missing-tests');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments detects pull_request_target in GitHub Actions workflows', () => {
  const diffText = `diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
index 1111111..2222222 100644
--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -1,3 +1,5 @@
 name: Test
 on:
-  push:
+  pull_request_target:
+    branches: [main]
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, '.github/workflows/test.yml');
  assert.equal(comments[0].kind, 'gh-actions-pull-request-target');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments detects pull_request_target in array syntax', () => {
  const diffText = `diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
index 1111111..2222222 100644
--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -1,2 +1,2 @@
 name: Test
-on: [push, pull_request]
+on: [push, pull_request_target]
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].kind, 'gh-actions-pull-request-target');
});

test('buildHeuristicComments detects excessive permissions in GitHub Actions workflows', () => {
  const diffText = `diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
index 1111111..2222222 100644
--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -5,3 +5,5 @@ on:
 jobs:
   test:
     runs-on: ubuntu-latest
+    permissions: write-all
     steps:
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, '.github/workflows/test.yml');
  assert.equal(comments[0].kind, 'gh-actions-excessive-permissions');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments detects secrets in run blocks', () => {
  const diffText = `diff --git a/.github/workflows/deploy.yml b/.github/workflows/deploy.yml
index 1111111..2222222 100644
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -10,3 +10,4 @@ jobs:
     steps:
       - uses: actions/checkout@v3
+      - run: echo $\{\{ secrets.API_KEY \}\}
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, '.github/workflows/deploy.yml');
  assert.equal(comments[0].kind, 'gh-actions-secret-in-run');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments detects unsanitized user input in run blocks', () => {
  const diffText = `diff --git a/.github/workflows/comment.yml b/.github/workflows/comment.yml
index 1111111..2222222 100644
--- a/.github/workflows/comment.yml
+++ b/.github/workflows/comment.yml
@@ -10,3 +10,4 @@ jobs:
     steps:
       - uses: actions/checkout@v3
+      - run: echo "$\{\{ github.event.issue.title \}\}"
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, '.github/workflows/comment.yml');
  assert.equal(comments[0].kind, 'gh-actions-unsanitized-input');
  assert.ok(Number.isInteger(comments[0].line));
});

test('buildHeuristicComments ignores non-workflow YAML files', () => {
  const diffText = `diff --git a/config/settings.yml b/config/settings.yml
index 1111111..2222222 100644
--- a/config/settings.yml
+++ b/config/settings.yml
@@ -1,1 +1,2 @@
 name: test
+permissions: write-all
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('buildHeuristicComments detects a caller special-case for altitude-generalization', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-altitude-caller-special-case.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/lib/finding-formatter.mjs');
  assert.equal(comments[0].line, 51);
  assert.equal(comments[0].kind, 'caller-special-case');
});

test('caller special-case is quiet on a host opt-in public option (FP canary)', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-altitude-host-optin.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('caller special-case is quiet when the only branch is a single added one', () => {
  const diffText = `diff --git a/src/lib/format.mjs b/src/lib/format.mjs
index 1111111..2222222 100644
--- a/src/lib/format.mjs
+++ b/src/lib/format.mjs
@@ -1,2 +1,5 @@
 export function format(x, options = {}) {
+  if (options.caller === 'cli') {
+    x = x.trim();
+  }
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('caller special-case ignores comment-only mentions of a caller branch', () => {
  const diffText = `diff --git a/src/lib/format.mjs b/src/lib/format.mjs
index 1111111..2222222 100644
--- a/src/lib/format.mjs
+++ b/src/lib/format.mjs
@@ -1,3 +1,5 @@
 export function format(x, options = {}) {
   if (options.caller === 'cli') {
+  // TODO: remove if (options.caller === 'exporter') { someday
+  // if (options.caller === 'exporter') { legacy branch }
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('buildHeuristicComments detects closure scope retention on a lazy singleton', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-closure-scope-retention.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'closure-scope-retention' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/lib/skill-cache.mjs');
  assert.equal(comments[0].line, 18);
  assert.equal(comments[0].kind, 'closure-scope-retention');
});

test('closure scope retention is quiet on immediate reduce-and-release (FP canary)', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-closure-immediate-reduce.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'closure-scope-retention' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('closure scope retention is quiet when the cached object has no methods over large data', () => {
  const diffText = `diff --git a/src/lib/config-cache.mjs b/src/lib/config-cache.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/lib/config-cache.mjs
@@ -0,0 +1,10 @@
+import { readFile } from 'node:fs/promises';
+
+let cachedConfig = null;
+
+export async function getConfig(path) {
+  if (cachedConfig) return cachedConfig;
+  const rawText = await readFile(path, 'utf8');
+  cachedConfig = { port: Number(JSON.parse(rawText).port) };
+  return cachedConfig;
+}
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'closure-scope-retention' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('new simplify heuristics are quiet when their skills are not selected', () => {
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-closure-scope-retention.diff',
    'utf8'
  );
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('caller special-case does not add up across unrelated hunks (per-hunk counting)', () => {
  const diffText = `diff --git a/src/lib/format.mjs b/src/lib/format.mjs
index 1111111..2222222 100644
--- a/src/lib/format.mjs
+++ b/src/lib/format.mjs
@@ -10,3 +10,6 @@ export function formatA(x, options = {}) {
 export function formatA(x, options = {}) {
+  if (options.caller === 'cli') {
+    x = trim(x);
+  }
 }
@@ -40,3 +43,6 @@ export function formatB(y, options = {}) {
 export function formatB(y, options = {}) {
+  if (options.caller === 'exporter') {
+    y = pad(y);
+  }
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'altitude-generalization' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 0);
});

test('closure scope retention fires when the slot declaration is outside the diff', () => {
  const diffText = `diff --git a/src/lib/registry-cache.mjs b/src/lib/registry-cache.mjs
index 1111111..2222222 100644
--- a/src/lib/registry-cache.mjs
+++ b/src/lib/registry-cache.mjs
@@ -5,4 +5,13 @@ let cachedLookup = null;
 export async function getLookup(registryPath) {
   if (cachedLookup) return cachedLookup;
+  const rawText = await readFile(registryPath, 'utf8');
+  const entries = parseAllDocuments(rawText).flatMap((doc) => doc.toJS()?.skills ?? []);
+  cachedLookup = {
+    severityOf(id) {
+      const entry = entries.find((e) => e.id === id);
+      return entry ? entry.severity : 'major';
+    },
+  };
   return cachedLookup;
 }
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'closure-scope-retention' } }] };

  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].file, 'src/lib/registry-cache.mjs');
  assert.equal(comments[0].kind, 'closure-scope-retention');
});

// --- 単一レジストリ（SSoT）の不変条件 -------------------------------------
// detector の追加は heuristic-review.mjs の HEURISTIC_REGISTRY 1 箇所で完結し、
// SKILL_HEURISTIC_MAP / HEURISTIC_SKILL_IDS / HEURISTIC_KIND_PRESENTATIONS は
// すべてそこから導出される。以下はその導出契約を固定する回帰テスト。
test('registry derives HEURISTIC_SKILL_IDS from SKILL_HEURISTIC_MAP keys', () => {
  assert.deepEqual(HEURISTIC_SKILL_IDS, Object.keys(SKILL_HEURISTIC_MAP));
  // dry-run フィルタと review-runner が依存する既知スキル ID の集合。
  assert.deepEqual([...HEURISTIC_SKILL_IDS].sort(), [
    'altitude-generalization',
    'closure-scope-retention',
    'coverage-gap',
    'invisible-unicode-injection',
    'knowledge-to-code-alignment',
    'logging-observability',
    'security-basic',
    'test-existence',
    'typescript-strict',
  ]);
});

test('SKILL_HEURISTIC_MAP values are non-empty detector-name arrays', () => {
  for (const [skillId, names] of Object.entries(SKILL_HEURISTIC_MAP)) {
    assert.ok(Array.isArray(names) && names.length > 0, `${skillId} has detectors`);
    for (const name of names) {
      assert.match(name, /^find[A-Z]/, `${name} looks like a detector function name`);
    }
  }
});

test('every registry kind has a fully-specified presentation (no drift)', () => {
  const SEVERITIES = new Set(['blocker', 'warning', 'nit']);
  const CONFIDENCES = new Set(['high', 'medium', 'low']);
  assert.ok(HEURISTIC_KIND_PRESENTATIONS.size >= 18, 'covers all known kinds');
  for (const [kind, preset] of HEURISTIC_KIND_PRESENTATIONS) {
    for (const field of ['finding', 'evidence', 'impact', 'fix']) {
      assert.equal(typeof preset[field], 'string', `${kind}.${field} is a string`);
      assert.ok(preset[field].length > 0, `${kind}.${field} non-empty`);
    }
    assert.ok(SEVERITIES.has(preset.severity), `${kind}.severity in vocab`);
    assert.ok(CONFIDENCES.has(preset.confidence), `${kind}.confidence in vocab`);
  }
});

test('buildHeuristicComments emits only kinds known to the presentation registry', () => {
  // security-basic のすべての detector を発火させる差分。emit された kind が
  // すべて HEURISTIC_KIND_PRESENTATIONS に存在すれば、review-engine 側の
  // default フォールバックに落ちる orphan kind が無いことを示す。
  const diffText = `--- a/src/app.js
+++ b/src/app.js
@@ -1,0 +1,3 @@
+const API_KEY = "ghp_0123456789012345678901234567890123456";
+eval(userInput);
+const h = createHash('md5');
`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(comments.length > 0, 'at least one detector fired');
  for (const c of comments) {
    assert.ok(HEURISTIC_KIND_PRESENTATIONS.has(c.kind), `kind ${c.kind} has a presentation`);
  }
});

// ---- Invisible / dangerous Unicode injection (GlassWorm-type, #1631) ----
// Payloads are built with String.fromCodePoint so this test file stays pure
// ASCII on disk (no raw invisible bytes for tooling to mangle). The detector is
// deterministic; these positive + negative (canary) cases pin its behavior so a
// once-fixed false positive cannot silently regress (.claude/rules/review-core
// #1070).
const IU_PLAN = { selected: [{ metadata: { id: 'invisible-unicode-injection' } }] };

function invisibleUnicodeKinds(addedLine, file = 'src/payload.ts') {
  const diffText =
    `diff --git a/${file} b/${file}\n` +
    `--- a/${file}\n+++ b/${file}\n` +
    `@@ -1,1 +1,2 @@\n const a = 1;\n+${addedLine}\n`;
  const parsed = parseUnifiedDiff(diffText);
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan: IU_PLAN });
  return comments.map((c) => c.kind);
}

const CP = (...codes) => String.fromCodePoint(...codes);

test('invisible-unicode: flags bidirectional control (Trojan Source) in code', () => {
  // U+202E RIGHT-TO-LEFT OVERRIDE reorders the visible source (CVE-2021-42574).
  const kinds = invisibleUnicodeKinds(`const isAdmin = ${CP(0x202e)}false; // safe`);
  assert.ok(kinds.includes('bidi-control'), `expected bidi-control, got ${JSON.stringify(kinds)}`);
});

test('invisible-unicode: flags isolate control chars (U+2066-2069)', () => {
  const kinds = invisibleUnicodeKinds(`return ${CP(0x2066)}user${CP(0x2069)};`);
  assert.ok(kinds.includes('bidi-control'));
});

test('invisible-unicode: flags zero-width chars hidden in an identifier', () => {
  // Zero-width space splits a token so two identifiers look identical.
  const kinds = invisibleUnicodeKinds(`const ad${CP(0x200b)}min = grantAccess();`);
  assert.ok(kinds.includes('invisible-unicode'));
});

test('invisible-unicode: flags a word joiner (U+2060)', () => {
  assert.ok(invisibleUnicodeKinds(`let a${CP(0x2060)}b = 1;`).includes('invisible-unicode'));
});

test('invisible-unicode: flags a variation selector on a non-emoji base (GlassWorm)', () => {
  // GlassWorm encodes payload bytes into invisible variation selectors attached
  // to ordinary characters.
  const kinds = invisibleUnicodeKinds(`const x${CP(0xfe0f)} = loadPlugin();`);
  assert.ok(kinds.includes('invisible-unicode'));
});

test('invisible-unicode: flags a chained run of variation selectors', () => {
  const kinds = invisibleUnicodeKinds(`const q = "A${CP(0xfe00, 0xfe01, 0xfe02)}";`);
  assert.ok(kinds.includes('invisible-unicode'));
});

test('invisible-unicode: flags a non-leading BOM / zero-width no-break space', () => {
  const kinds = invisibleUnicodeKinds(`const a = 1;${CP(0xfeff)}const b = 2;`);
  assert.ok(kinds.includes('invisible-unicode'));
});

test('invisible-unicode: flags a bare zero-width joiner in an identifier', () => {
  assert.ok(invisibleUnicodeKinds(`let x${CP(0x200d)}y = 1;`).includes('invisible-unicode'));
});

test('invisible-unicode: flags confusable whitespace (NBSP) outside a string', () => {
  const kinds = invisibleUnicodeKinds(`const${CP(0x00a0)}y = compute();`);
  assert.ok(kinds.includes('confusable-whitespace'));
});

test('invisible-unicode: flags ideographic space (U+3000) outside a string', () => {
  assert.ok(invisibleUnicodeKinds(`if (a)${CP(0x3000)}return;`).includes('confusable-whitespace'));
});

// ---- Canary: known-legitimate patterns that must NOT be flagged ----

test('invisible-unicode canary: emoji ZWJ family sequence in a string is not flagged', () => {
  // man+ZWJ+woman: the ZWJ is a legitimate emoji joiner.
  const kinds = invisibleUnicodeKinds(`const label = "${CP(0x1f468, 0x200d, 0x1f469)}";`);
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: emoji with VS16 (heart) in a string is not flagged', () => {
  const kinds = invisibleUnicodeKinds(`const heart = "${CP(0x2764, 0xfe0f)}";`);
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: keycap sequence is not flagged', () => {
  const kinds = invisibleUnicodeKinds(`const one = "${CP(0x31, 0xfe0f, 0x20e3)}";`);
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: NBSP inside a string literal (i18n) is not flagged', () => {
  const kinds = invisibleUnicodeKinds(`const s = "caf${CP(0x00a0)}e au lait";`);
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: a leading BOM only is not flagged', () => {
  const kinds = invisibleUnicodeKinds(`${CP(0xfeff)}import fs from 'node:fs';`);
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: plain ASCII code is not flagged', () => {
  assert.deepEqual(invisibleUnicodeKinds('const total = a + b;'), []);
});

test('invisible-unicode canary: documentation files (.md) are out of scope', () => {
  // Docs legitimately use zero-width joiners / emoji; a zero-width char here
  // must not fire (issue #1631 restricts scope to source code).
  const kinds = invisibleUnicodeKinds(`text with a ${CP(0x200b)} zero width`, 'docs/guide.md');
  assert.deepEqual(kinds, []);
});

test('invisible-unicode canary: quiet when the skill is not selected', () => {
  const diffText =
    'diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n' +
    `@@ -1,1 +1,2 @@\n const a = 1;\n+const ad${CP(0x200b)}min = 1;\n`;
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'typescript-strict' } }] };
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.deepEqual(comments, []);
});

// ---- Invisible / dangerous Unicode: expanded coverage (#1642 adversarial) ----
// Tag characters (ASCII smuggling / prompt injection), VS supplement, bidi
// marks, and additional zero-width formats. Payloads via String.fromCodePoint.

test('invisible-unicode: flags tag characters (U+E0000-E007F, ASCII smuggling)', () => {
  // The primary GlassWorm / prompt-injection vector: invisible tag chars
  // attached to an ASCII base.
  const kinds = invisibleUnicodeKinds(`const cmd = ${CP(0xe0041, 0xe0042)}spawn();`);
  assert.ok(kinds.includes('invisible-unicode'), `got ${JSON.stringify(kinds)}`);
});

test('invisible-unicode: flags a bare CANCEL TAG (U+E007F)', () => {
  assert.ok(invisibleUnicodeKinds(`const y = 1;${CP(0xe007f)}`).includes('invisible-unicode'));
});

test('invisible-unicode: flags a supplementary variation selector (U+E0100, VS17)', () => {
  assert.ok(invisibleUnicodeKinds(`const z${CP(0xe0100)} = load();`).includes('invisible-unicode'));
});

test('invisible-unicode: flags bidi marks LRM/RLM/ALM (U+200E/200F/061C)', () => {
  assert.ok(invisibleUnicodeKinds(`const a = ${CP(0x200e)}1;`).includes('bidi-control'));
  assert.ok(invisibleUnicodeKinds(`const b = ${CP(0x200f)}2;`).includes('bidi-control'));
  assert.ok(invisibleUnicodeKinds(`const c = ${CP(0x061c)}3;`).includes('bidi-control'));
});

test('invisible-unicode canary: script text keeps its bidi marks and join controls', () => {
  for (const line of [
    `const a = "مرحبا${CP(0x200f)}!";`,
    `const a = "${CP(0x200e)}مرحبا";`,
    `const a = "مرحبا${CP(0x061c)}";`,
    `  "a": "می${CP(0x200c)}خواهم"\r`,
    `const a = 'say \\'می${CP(0x200c)}خواهم\\'';`,
    `const a = "say \\"می${CP(0x200c)}خواهم\\"";\r`,
    `const a = "می${CP(0x200c)}خواهم";`,
    `const a = "क्${CP(0x200d)}ष";`,
    `const a = "क्${CP(0x200c)}ष";`,
    `{"label":"می${CP(0x200c)}خواهم"}`,
  ]) {
    assert.deepEqual(invisibleUnicodeKinds(line), [], line);
  }
});

test('invisible-unicode: marks and join controls outside script text stay flagged', () => {
  for (const [line, kind] of [
    [`const a = "admin${CP(0x200f)}user";`, 'bidi-control'],
    [`const مرحبا${CP(0x200f)} = 1;`, 'bidi-control'],
    [`const a = "مرحبا"${CP(0x200f)};`, 'bidi-control'],
    [`const a = "مرحبا" + ${CP(0x200f)}b;`, 'bidi-control'],
    [`const a = ["${CP(0x200f)}", "مرحبا"];`, 'bidi-control'],
    [`const ad${CP(0x200c)}min = 1;`, 'invisible-unicode'],
    [`const a = "ad${CP(0x200d)}min";`, 'invisible-unicode'],
    [`const می${CP(0x200c)}خواهم = 1;`, 'invisible-unicode'],
    [`const a = "می${CP(0x200c)}admin";`, 'invisible-unicode'],
    [`const a = "می${CP(0x200c)}क";`, 'invisible-unicode'],
    [`const a = "می${CP(0x200c)}";`, 'invisible-unicode'],
  ]) {
    assert.ok(invisibleUnicodeKinds(line).includes(kind), line);
  }
});

test('invisible-unicode: a line that cannot prove its strings stays flagged', () => {
  const id = `می${CP(0x200c)}خواهم`;
  for (const line of [
    `/* c */ export const ${id} = 1;`,
    `export const s = \`\${${id}}\`;`,
    `export const s = \`${id}\`;`,
    `class A { #${id} = 2; }`,
    `const r = /'/; const ${id} = 1;`,
    `const r = /'/; const ${id} = '';`,
    `\`; const ${id} = 1;`,
    `// c${CP(0x2028)}const ${id} = 1;`,
    `// c${CP(0x2029)}const ${id} = 1;`,
    `// c\rconst ${id} = 1;`,
    `"a${CP(0x2028)}${id}";`,
    `"a\r${id}";`,
    `* const ${id} = 1;`,
    `* "${id}" const ${id} = 1;`,
    `/* c */ const م${CP(0x200f)} = 1;`,
    `// ${id}`,
    `# ${id}`,
    `# "${id}"`,
    `don't */ const ${id} = 'a';`,
    `"\${${id}}";`,
    `"a */ ${id}";`,
    `"a\`${id}";`,
    `"${id}" const x = 1;`,
    `"a\\" + ${id} + "b";`,
    `const a = "${id}`,
    `myreturn "${id}";`,
    `obj.return "${id}";`,
    `$return "${id}";`,
    `@return "${id}";`,
    `#return "${id}";`,
    `x.y return "${id}";`.replace('x.y ', 'x.'),
    `/* return */ "${id}";`,
    `return "a" + ${id};`,
    `const r = /,"/; const ${id} = 1, s = ",";`,
    `const s = \`, "${id}",`,
    `\\, "${id}",`,
    `x\r,"${id}";`,
    `const م${CP(0x200f)}م = 1;`,
  ]) {
    assert.notDeepEqual(invisibleUnicodeKinds(line), [], line);
  }
});

function invisibleUnicodeKindsInHunk(header, body, file = 'src/payload.js') {
  const diffText = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${header}\n${body}\n`;
  const parsed = parseUnifiedDiff(diffText);
  return buildHeuristicComments({ diff: { files: parsed.files }, plan: IU_PLAN }).map(
    (c) => c.kind
  );
}

test('invisible-unicode: a string continued from the previous line is not exempt', () => {
  const id = `می${CP(0x200c)}خواهم`;
  for (const [file, previous, added] of [
    ['src/a.js', ' let x = "abc\\', `+", ${id} = "+"`],
    ['src/a.ts', ' let x = "abc\\', `+", ${id} = "+"`],
    ['src/a.php', ' $x = "abc', `+", ${id} = "+"`],
    ['src/a.js', ' "abc\\', `+= ", ${id} = "+"`],
    ['src/a.js', ` "abc\\\\\\`, `+", ${id} = "+"`],
    ['src/a.js', '+let x = "abc\\', `+", ${id} = "+"`],
    ['src/a.js', " let x = 'abc", `+', ${id} = '+'`],
    ['src/a.js', ' let x = `abc', `+", ${id} = "+"`],
    ['src/a.py', ' x = """abc', `+", ${id} = "+"`],
  ]) {
    const kinds = invisibleUnicodeKindsInHunk('@@ -1,1 +1,2 @@', `${previous}\n${added}`, file);
    assert.ok(kinds.includes('invisible-unicode'), `${previous} / ${added}`);
  }
  const reopened = invisibleUnicodeKindsInHunk(
    '@@ -1,2 +1,3 @@',
    ` foo'\n x = 'abc\n+', ${id} = '+'`
  );
  assert.ok(reopened.includes('invisible-unicode'), 'previous line open on its own');
  const chained = invisibleUnicodeKindsInHunk(
    '@@ -1,2 +1,3 @@',
    ` x = """abc\n def\n+", ${id} = "+"`,
    'src/a.py'
  );
  assert.ok(chained.includes('invisible-unicode'), 'carried across lines');
});

test('invisible-unicode: a line whose previous line is not visible is not exempt', () => {
  const id = `می${CP(0x200c)}خواهم`;
  const kinds = invisibleUnicodeKindsInHunk('@@ -10,0 +11 @@', `+", ${id} = "+"`);
  assert.ok(kinds.includes('invisible-unicode'));
  const legit = invisibleUnicodeKindsInHunk('@@ -10,0 +11 @@', `+const a = "${id}";`);
  assert.ok(legit.includes('invisible-unicode'));
});

test('invisible-unicode canary: closed previous lines and file starts keep the exemption', () => {
  const id = `می${CP(0x200c)}خواهم`;
  for (const [header, body] of [
    ['@@ -0,0 +1 @@', `+const a = "${id}";`],
    ['@@ -1,1 +1,2 @@', ` const b = "x\\\\";\n+const a = "${id}";`],
    ['@@ -1,1 +1,2 @@', ` const b = 'it\\'s';\n+const a = "${id}";`],
    ['@@ -1,2 +1,2 @@', ` const b = 1;\n-const a = "old\n+const a = "${id}";`],
    ['@@ -1,1 +1,2 @@', ` const b = 1; // C:\\\\\n+const a = "${id}";`],
  ]) {
    assert.deepEqual(invisibleUnicodeKindsInHunk(header, body), [], body);
  }
});

test('invisible-unicode canary: return starts a string', () => {
  const id = `می${CP(0x200c)}خواهم`;
  for (const line of [`return "${id}";`, `  return '${id}';`, `\treturn "${id}"`]) {
    assert.deepEqual(invisibleUnicodeKinds(line), [], line);
  }
  const continued = invisibleUnicodeKindsInHunk('@@ -1,1 +1,2 @@', ` x = "abc\\\n+return "${id}";`);
  assert.ok(continued.includes('invisible-unicode'), 'continuation line');
});

test('invisible-unicode: a mark next to an ASCII token stays flagged', () => {
  for (const line of [
    `const s = "admin${CP(0x200f)}, مرحبا";`,
    `const s = "مرحبا, ${CP(0x200f)}admin";`,
    `const s = "مرحبا${CP(0x200f)}2";`,
  ]) {
    assert.ok(invisibleUnicodeKinds(line).includes('bidi-control'), line);
  }
});

test('invisible-unicode: a line full of marks is scanned in linear time', () => {
  const started = performance.now();
  assert.ok(invisibleUnicodeKinds(CP(0x200f).repeat(40000)).includes('bidi-control'));
  assert.ok(performance.now() - started < 2000);
});

test('invisible-unicode: override and isolate controls stay flagged inside script text', () => {
  for (const cp of [0x202a, 0x202e, 0x2066, 0x2067, 0x2069]) {
    const line = `const a = "مر${CP(cp)}حبا";`;
    assert.ok(invisibleUnicodeKinds(line).includes('bidi-control'), line);
  }
});

test('invisible-unicode: flags additional invisible formats (math op / braille / filler / CGJ / interlinear)', () => {
  assert.ok(invisibleUnicodeKinds(`const m = a${CP(0x2062)}b;`).includes('invisible-unicode'));
  assert.ok(invisibleUnicodeKinds(`const q =${CP(0x2800)}1;`).includes('invisible-unicode'));
  assert.ok(invisibleUnicodeKinds(`const h${CP(0x3164)} = 1;`).includes('invisible-unicode'));
  assert.ok(invisibleUnicodeKinds(`const c${CP(0x034f)}d = 1;`).includes('invisible-unicode'));
  assert.ok(invisibleUnicodeKinds(`const i = ${CP(0xfff9)}x;`).includes('invisible-unicode'));
});

test('invisible-unicode canary: an emoji subdivision-flag tag sequence is not flagged', () => {
  // Scotland flag: base pictographic + tag chars + CANCEL TAG — a legitimate
  // emoji tag sequence anchored to a pictographic base.
  const scotland = CP(
    0x1f3f4,
    0xe0067,
    0xe0062,
    0xe0073,
    0xe0063,
    0xe0074,
    0xe006c,
    0xe0061,
    0xe006e,
    0xe0064,
    0xe007f
  );
  assert.deepEqual(invisibleUnicodeKinds(`const flag = "${scotland}";`), []);
});

// ---- TEMPORARY_WITHOUT_EXIT (#1783 Phase 2) ----
// 一時対応コメントのうち、撤去条件（Issue 参照 / URL / 期日・バージョン / 条件節）が
// 無いものだけを検出する。撤去条件が書かれているコメントを落とすと実害のある誤検出に
// なるため、negative 側を canary として固定する（#1070 の責務分界）。
const TWE_PLAN = { selected: [{ metadata: { id: 'knowledge-to-code-alignment' } }] };

function temporaryComments(addedLines, { file = 'src/service.ts', contextLines = [] } = {}) {
  const body = [
    ...contextLines.map((line) => ` ${line}`),
    ...addedLines.map((line) => `+${line}`),
  ].join('\n');
  const oldCount = contextLines.length;
  const newCount = contextLines.length + addedLines.length;
  const diffText =
    `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n` +
    `@@ -1,${oldCount} +1,${newCount} @@\n${body}\n`;
  const parsed = parseUnifiedDiff(diffText);
  return buildHeuristicComments({ diff: { files: parsed.files }, plan: TWE_PLAN });
}

test('temporary-without-exit: flags a bare TODO comment', () => {
  const comments = temporaryComments(['// TODO: リトライ間隔を調整する']);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].kind, 'temporary-without-exit');
  assert.equal(comments[0].file, 'src/service.ts');
  assert.equal(comments[0].line, 1);
  assert.equal(comments[0].skillId, 'knowledge-to-code-alignment');
});

test('temporary-without-exit: flags a trailing FIXME comment', () => {
  const comments = temporaryComments(['const v = compute(); // FIXME: 失敗時の経路が未実装']);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].kind, 'temporary-without-exit');
});

test('temporary-without-exit: flags a Japanese 暫定対応 comment', () => {
  assert.equal(temporaryComments(['// 暫定対応: レスポンスをそのまま返す']).length, 1);
});

test('temporary-without-exit: fires on the real plan path (skill selection + detector)', async () => {
  // 手組みプランではなく、本番の skill 選択（`buildExecutionPlan`）を通した経路で
  // 発火することを固定する。配線先スキルの applyTo は `src|app|lib/**` の JS/TS な
  // ので、検出器もその範囲だけを走査する。`scripts/**` やリポジトリ直下のファイルは
  // たとえ拡張子が一致していても実効範囲外（下の scripts/** 回帰テストで固定）。
  const diffText =
    'diff --git a/src/lib/service.mjs b/src/lib/service.mjs\n' +
    '--- a/src/lib/service.mjs\n+++ b/src/lib/service.mjs\n' +
    '@@ -1,0 +1,1 @@\n+// HACK: 上流の型が壊れているので any で通す\n';
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/service.mjs'],
    availableContexts: ['diff'],
    diffText,
    dryRun: false,
    llmEnabled: false, // no-key 経路（決定論チェックのみ）
  });
  const selectedIds = plan.selected.map((s) => s.metadata?.id ?? s.id);
  assert.ok(
    selectedIds.includes('knowledge-to-code-alignment'),
    `owning skill must be selected, got ${JSON.stringify(selectedIds)}`
  );
  const parsed = parseUnifiedDiff(diffText);
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.ok(
    comments.some((c) => c.kind === 'temporary-without-exit'),
    `expected a temporary-without-exit finding, got ${JSON.stringify(comments)}`
  );
});

test('temporary-without-exit: stays quiet for scripts/** on the real plan path', async () => {
  // 配線先スキルの applyTo は `src|app|lib/**` なので、`src/**` の変更でスキルが
  // plan に載っても、同じ PR に含まれる `scripts/**` や リポジトリ直下の JS の
  // 一時対応コメントでは発火してはならない（#1788 major-1）。
  const diffText =
    'diff --git a/src/lib/service.mjs b/src/lib/service.mjs\n' +
    '--- a/src/lib/service.mjs\n+++ b/src/lib/service.mjs\n' +
    '@@ -1,0 +1,1 @@\n+const ok = true;\n' +
    'diff --git a/scripts/check-refs.mjs b/scripts/check-refs.mjs\n' +
    '--- a/scripts/check-refs.mjs\n+++ b/scripts/check-refs.mjs\n' +
    '@@ -1,0 +1,1 @@\n+// TODO(follow-up PR): 参照チェックを広げる\n' +
    'diff --git a/eslint.config.mjs b/eslint.config.mjs\n' +
    '--- a/eslint.config.mjs\n+++ b/eslint.config.mjs\n' +
    '@@ -1,0 +1,1 @@\n+// TODO: ルールを整理する\n';
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/service.mjs', 'scripts/check-refs.mjs', 'eslint.config.mjs'],
    availableContexts: ['diff'],
    diffText,
    dryRun: false,
    llmEnabled: false,
  });
  const selectedIds = plan.selected.map((s) => s.metadata?.id ?? s.id);
  assert.ok(
    selectedIds.includes('knowledge-to-code-alignment'),
    `owning skill must still be selected, got ${JSON.stringify(selectedIds)}`
  );
  const parsed = parseUnifiedDiff(diffText);
  const comments = buildHeuristicComments({ diff: { files: parsed.files }, plan });
  assert.deepEqual(
    comments.filter((c) => c.kind === 'temporary-without-exit'),
    [],
    `out-of-applyTo paths must not fire, got ${JSON.stringify(comments)}`
  );
});

test('temporary-without-exit canary: directory scope follows the applyTo prefixes', () => {
  // applyTo 内（発火する）
  assert.equal(temporaryComments(['// TODO: 直す'], { file: 'src/a.ts' }).length, 1);
  assert.equal(temporaryComments(['// TODO: 直す'], { file: 'app/routes/a.tsx' }).length, 1);
  assert.equal(temporaryComments(['// TODO: 直す'], { file: 'lib/deep/nest/a.mjs' }).length, 1);
  // applyTo 外（発火しない）
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'scripts/build.mjs' }), []);
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'eslint.config.mjs' }), []);
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'tools/gen.ts' }), []);
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'migrations/001.js' }), []);
  // `src` を末尾に含むだけのパスも対象外（接頭辞一致であること）。
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'packages/web/src/a.ts' }), []);
});

test('temporary-without-exit canary: example / sample template directories are excluded', () => {
  // テンプレートの placeholder（利用者が埋める前提）には撤去条件が書かれない。
  assert.deepEqual(
    temporaryComments(['// TODO: Process new order'], { file: 'src/examples/o.ts' }),
    []
  );
  assert.deepEqual(
    temporaryComments(['// TODO: Process new order'], { file: 'src/example/o.ts' }),
    []
  );
  assert.deepEqual(
    temporaryComments(['// TODO: Process new order'], { file: 'src/samples/o.ts' }),
    []
  );
});

test('temporary-without-exit: scans a production templates/ directory (no blanket exclusion)', () => {
  // `src/templates/**` は本番のテンプレート描画コードであり、除外対象ではない。
  assert.equal(
    temporaryComments(['// TODO: 旧レンダラを消す'], { file: 'src/templates/render.mjs' }).length,
    1
  );
});

test('temporary-without-exit: a URL inside a string literal is not mistaken for the comment', () => {
  // quote-aware な行末コメント切り出しにより、コメント部分は `// TODO` だけになる。
  // コード側の URL を撤去条件と数えると本物を取りこぼす（false negative）。
  assert.equal(temporaryComments(["const u = 'http://example.com'; // TODO"]).length, 1);
});

test('temporary-without-exit canary: an Issue reference counts as an exit criterion', () => {
  assert.deepEqual(temporaryComments(['// TODO(#1234): 新 API へ切り替える']), []);
});

test('temporary-without-exit canary: a conditional clause counts as an exit criterion', () => {
  assert.deepEqual(temporaryComments(['// FIXME: upstream の修正がリリースされたら削除する']), []);
  assert.deepEqual(temporaryComments(['// HACK: remove once the upstream patch ships']), []);
});

test('temporary-without-exit canary: a deadline or version counts as an exit criterion', () => {
  assert.deepEqual(temporaryComments(['// TODO: 2026-09-01 までに恒久対応へ置き換える']), []);
  assert.deepEqual(temporaryComments(['// WORKAROUND: v2.1.0 で入る API を待つ']), []);
});

test('temporary-without-exit canary: an upstream issue URL counts as an exit criterion', () => {
  assert.deepEqual(
    temporaryComments(['// WORKAROUND: https://github.com/nodejs/node/issues/1 の修正待ち']),
    []
  );
});

test('temporary-without-exit canary: the exit criterion may sit on the next comment line', () => {
  assert.deepEqual(
    temporaryComments(['// TODO: 旧経路を削除する', '// (blocked on the #987 migration)']),
    []
  );
});

test('temporary-without-exit canary: a block-comment continuation line is part of the block', () => {
  // 継続行が `*` prefix を持たない書き方。行頭 prefix だけを見る判定では塊が切れ、
  // 撤去条件を読み落として誤検出になっていた（E1）。
  assert.deepEqual(temporaryComments(['/* TODO: この分岐を消す', '   until #987 lands */']), []);
  // JSDoc 形式（`*` 継続）も同様に塊として読む。
  assert.deepEqual(
    temporaryComments([
      '/**',
      ' * FIXME: 旧経路の互換を残す',
      ' * remove once #55 is merged',
      ' */',
    ]),
    []
  );
});

test('temporary-without-exit canary: an HTML-comment continuation line is part of the block', () => {
  // E4。検出器が `<!--` を開始 prefix に採用している以上、継続行も読む必要がある。
  assert.deepEqual(
    temporaryComments(['<!-- TODO: replace markup', '     once #55 is merged -->']),
    []
  );
});

test('temporary-without-exit canary: a blank line does not split the comment block', () => {
  assert.deepEqual(
    temporaryComments(['// TODO: 旧経路を削除する', '', '// remove once #12 lands']),
    []
  );
});

test('temporary-without-exit canary: broader conditional and reference forms count', () => {
  // 「撤去条件を明示している」のに発火していた 7 形（major-3）。
  assert.deepEqual(temporaryComments(['// TODO: Remove unless the vendor keeps the old API.']), []);
  assert.deepEqual(temporaryComments(['// TODO: Delete if upstream lands the fix.']), []);
  assert.deepEqual(temporaryComments(['// TODO: drop this, see issue 1234 in the tracker']), []);
  assert.deepEqual(temporaryComments(['// FIXME: temporary; remove in the next release']), []);
  assert.deepEqual(temporaryComments(['// TODO: remove by 2026Q3']), []);
  assert.deepEqual(temporaryComments(['// TODO: 来月の棚卸しで消す']), []);
  assert.deepEqual(temporaryComments(['// 暫定: 新スキーマ移行が終わった後に削除する']), []);
});

test('temporary-without-exit canary: a permanent declaration counts as an allowance (#1797)', () => {
  // 恒久であることの宣言（keep forever / by design / permanent / 恒久系）は
  // 「撤去しない」という意思表示であり、撤去条件を書き足す提案が噛み合わない。
  assert.deepEqual(temporaryComments(['// HACK: required by the DOM spec, keep forever']), []);
  assert.deepEqual(temporaryComments(['// HACK: keep this forever, the DOM spec requires it']), []);
  assert.deepEqual(temporaryComments(['// HACK: this ordering is by design, do not reorder']), []);
  assert.deepEqual(temporaryComments(['// WORKAROUND: permanent, upstream will not fix']), []);
  assert.deepEqual(temporaryComments(['// HACK: permanently required for IME composition']), []);
  assert.deepEqual(
    temporaryComments(['// HACK: DOM 仕様上の制約に対する恒久対応として維持する']),
    []
  );
  assert.deepEqual(temporaryComments(['// HACK: 恒久的にこの分岐を残す']), []);
});

test('temporary-without-exit: assignee-style TODO(name) still fires (#1797)', () => {
  // 担当者名は撤去条件でも恒久宣言でもない（メンテナ決定）。TODO(owner) 記法を除外しない。
  const comments = temporaryComments(['// TODO(alice): rename this']);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].kind, 'temporary-without-exit');
});

test('temporary-without-exit: an incidental "by design" word sequence is not an allowance', () => {
  // 「by design review」のような名詞複合の偶然の並びは恒久宣言ではない。
  assert.equal(temporaryComments(['// TODO: get sign-off by design review']).length, 1);
  assert.equal(temporaryComments(['// TODO: flagged by design team, fix the padding']).length, 1);
});

test('temporary-without-exit canary: pseudo-code inside a template literal is not a comment', () => {
  assert.deepEqual(temporaryComments(['const stub = `', '  // TODO: implement', '`;']), []);
});

test('temporary-without-exit: an unrelated trailing comment on the next line does not suppress', () => {
  // 行末コメントは「その行だけの単位」。隣の行末コメントを塊に連結すると、無関係な
  // 撤去条件（`valid until 2027-01-01`）が抑制根拠になってしまう（m6）。
  const comments = temporaryComments([
    'foo(); // TODO: ここを直す',
    'bar(); // valid until 2027-01-01',
  ]);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].line, 1);
});

test('temporary-without-exit canary: an existing comment block already carries the criterion', () => {
  // 撤去条件は差分の外（context 行）にあり、追加行はその塊の続き。
  assert.deepEqual(
    temporaryComments(['// TODO: ここも同じ理由で残す'], {
      contextLines: ['// blocked on https://example.com/issues/12'],
    }),
    []
  );
});

test('temporary-without-exit canary: a marker inside a string literal is not a comment', () => {
  assert.deepEqual(temporaryComments(["const label = 'TODO';"]), []);
  // main に実在する形（`src/lib/feedback.mjs:216` の eval テンプレート文字列）。
  assert.deepEqual(
    temporaryComments(["const tpl = '```diff\\n# TODO: paste the diff\\n```';"]),
    []
  );
});

test('temporary-without-exit canary: ordinary descriptive comments are never flagged', () => {
  // マーカー集合を広げすぎると通常のコメントが全部指摘対象になる。マーカー側の
  // 変異（always-match）で確実に落ちるよう、撤去条件を含まない普通のコメントを固定する。
  assert.deepEqual(temporaryComments(['// 入力を NFC へ正規化する']), []);
  assert.deepEqual(temporaryComments(['// Normalize the payload before hashing.']), []);
  assert.deepEqual(temporaryComments(['const v = 1; // 呼び出し側の期待に合わせる']), []);
  assert.deepEqual(temporaryComments(['/**', ' * Build the review plan.', ' */']), []);
});

test('temporary-without-exit canary: lowercase prose mentions are out of scope', () => {
  assert.deepEqual(temporaryComments(['// workaround for the Safari layout bug']), []);
  assert.deepEqual(temporaryComments(['// 一時的にバッファへ退避する']), []);
});

test('temporary-without-exit canary: test / docs / generated / vendored paths are excluded', () => {
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'tests/service.test.mjs' }), []);
  assert.deepEqual(temporaryComments(['- TODO: 書く'], { file: 'docs/plan.md' }), []);
  assert.deepEqual(
    temporaryComments(['// TODO: 直す'], { file: 'runners/github-action/dist/index.mjs' }),
    []
  );
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'node_modules/x/index.js' }), []);
  assert.deepEqual(
    temporaryComments(['// TODO: 直す'], { file: 'src/lib/fixtures/sample.ts' }),
    []
  );
  // 実効範囲外（配線先スキルの applyTo は `src|app|lib` 配下の JS/TS のみ）。
  assert.deepEqual(temporaryComments(['# HACK: 直す'], { file: 'scripts/build.py' }), []);
  assert.deepEqual(temporaryComments(['  # TODO: 直す'], { file: '.github/workflows/ci.yml' }), []);
  assert.deepEqual(temporaryComments(['// TODO: 直す'], { file: 'src/legacy.cjs' }), []);
});

test('temporary-without-exit canary: an unchanged (context) TODO is not flagged', () => {
  assert.deepEqual(
    temporaryComments(['const v = 1;'], { contextLines: ['// TODO: 昔からある宿題'] }),
    []
  );
});

test('temporary-without-exit: is quiet when the owning skill is not selected', () => {
  const diffText =
    'diff --git a/src/service.ts b/src/service.ts\n--- a/src/service.ts\n+++ b/src/service.ts\n' +
    '@@ -1,0 +1,1 @@\n+// TODO: 直す\n';
  const parsed = parseUnifiedDiff(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };
  assert.deepEqual(buildHeuristicComments({ diff: { files: parsed.files }, plan }), []);
});

test('temporary-without-exit: is capped at 3 findings', () => {
  const comments = temporaryComments([
    '// TODO: a',
    'const a = 1;',
    '// TODO: b',
    'const b = 2;',
    '// TODO: c',
    'const c = 3;',
    '// TODO: d',
  ]);
  assert.equal(comments.length, 3);
});

// ---- 宣言（SKILL.md の applyTo）と実効（検出器のスコープ述語）のドリフト検知 ----
//
// 以下は「将来 applyTo を変えたときに検出器のスコープがドリフトしたら CI が落ちる」ことを
// 目的にした canary であり、期待値をハードコードしない点が上の canary 群と違う。期待値は
// 配線先スキルの `SKILL.md` から読んだ applyTo と `minimatch` から**その場で導出**する。
//
// 書き方の型（スコープ正規表現を持つ検出器が増えたら同じ形を足す）:
//   1. 配線先スキルの frontmatter を `parseSkillFile`（`runners/core/skill-loader.mjs`）で読む。
//      YAML を自前でパースしない（CLAUDE.md「Import the SSoT, never re-derive it」）。
//   2. glob 判定は本番の skill 選択（`runners/core/review-runner.mjs:79-83`）と同じ
//      `minimatch(file, pattern, { dot: true })` を使う。マッチャを再実装しない。
//   3. サンプルパス表を用意し、各パスの期待発火を glob 側から導出して、検出器の実挙動と突き合わせる。
//      サンプルには**スコープ以外の除外規則**（test / fixture / vendored / examples）に
//      掛かるパスを入れない。掛かると glob 由来の期待と一致しなくなり、この canary が
//      スコープ以外の理由で落ちる。
//   4. サンプル表が applyTo の全 glob を 1 件以上覆っていることを assert する。これが無いと
//      表に無いディレクトリが applyTo へ足されたとき（宣言だけが広がる向き）に緑のまま通る。
//
// 残余（この canary でも捕まらない範囲）: 既存 glob の**拡張子だけ**を増やした場合
// （`{ts,tsx,js,jsx,mjs}` へ `cts` を足す等）は、その拡張子のサンプルパスが表に無ければ
// 検出されない。glob の brace 展開まで列挙する assert は入れていないため、拡張子を触る
// ときはサンプル表へ 1 行足すこと。
//
// 検出器のスコープは 2 通りの書き方で表現される。上の grep が拾うのは前者だけである:
//   - スコープ正規表現の定数（`TEMPORARY_SCOPE_PATH_RE` /
//     `grep -nE "^const [A-Z_]*(SCOPE|PATH|EXT)[A-Z_]*_RE" src/lib/heuristic-review.mjs`）
//   - 述語関数（`looksLikeGitHubWorkflowFile` / `looksLikeSourceCodeFile` など
//     `grep -n "^function looksLike.*File" src/lib/heuristic-review.mjs`）
// 後者にも宣言／実効の乖離は既にある。`findGitHubActionsIssues`
// （`src/lib/heuristic-review.mjs:641-643` の `looksLikeGitHubWorkflowFile`）は
// `.github/workflows/**.yml` に限定するが、配線先 `security-basic` の applyTo
// （`skills/midstream/security-basic/SKILL.md:9`）はワークフロー YAML に一致しない。
// 是正は #1797 で追跡している。
const TWE_SKILL_PATH = 'skills/midstream/knowledge-to-code-alignment/SKILL.md';

// スコープ以外の除外規則に掛からないサンプルパス。in / out は宣言せず glob から導出する。
// 既存のハードコード canary（`directory scope follows the applyTo prefixes`、#1788 で追加）
// が使う 8 パスをすべて含む。あちらは導出前の pin として意図的に併存させている。applyTo と
// 検出器を同時に広げた場合、この導出テストは緑のままだがハードコード側が落ち、意図した
// 拡張であることの明示的な確認を強制する。
const TWE_SCOPE_SAMPLE_PATHS = [
  'src/a.ts',
  'src/nested/deep/a.tsx',
  'src/a.js',
  'src/a.jsx',
  'src/a.mjs',
  'app/routes/a.tsx',
  'lib/deep/nest/a.mjs',
  'scripts/build.mjs',
  'eslint.config.mjs',
  'tools/gen.ts',
  'migrations/001.js',
  'packages/web/src/a.ts',
  'src/a.py',
  'src/a.sh',
  'src/a.cjs',
  'src/a.yml',
];

test('temporary-without-exit canary: detector scope stays in sync with the skill applyTo (drift guard)', async () => {
  const { metadata } = await parseSkillFile(TWE_SKILL_PATH);
  const globs = metadata.applyTo ?? [];
  assert.ok(
    Array.isArray(globs) && globs.length > 0,
    `${TWE_SKILL_PATH} must declare a non-empty applyTo, got ${JSON.stringify(globs)}`
  );

  // サンプル表が applyTo の両側（マッチする / しない）を覆っていることを先に固定する。
  // 片側しか無い表は、スコープが全開・全閉へドリフトしても落ちない。
  const inScope = TWE_SCOPE_SAMPLE_PATHS.filter((file) =>
    globs.some((pattern) => minimatch(file, pattern, { dot: true }))
  );
  assert.ok(inScope.length > 0, 'sample paths must cover at least one in-applyTo path');
  assert.ok(
    inScope.length < TWE_SCOPE_SAMPLE_PATHS.length,
    'sample paths must cover at least one out-of-applyTo path'
  );

  // さらに、**全 glob** が 1 件以上のサンプルで覆われていることを要求する。上の 2 本だけでは
  // 表に無いディレクトリ（`server/**` 等）が applyTo へ足されても緑のまま通ってしまい、
  // 宣言だけが広がる向きのドリフトを見逃す。
  for (const pattern of globs) {
    assert.ok(
      TWE_SCOPE_SAMPLE_PATHS.some((file) => minimatch(file, pattern, { dot: true })),
      `sample paths must cover applyTo pattern ${pattern}: add a matching path to ` +
        'TWE_SCOPE_SAMPLE_PATHS so the drift guard can observe this glob'
    );
  }

  for (const file of TWE_SCOPE_SAMPLE_PATHS) {
    const expected = globs.some((pattern) => minimatch(file, pattern, { dot: true }));
    const fired = temporaryComments(['// TODO: 直す'], { file }).some(
      (c) => c.kind === 'temporary-without-exit'
    );
    assert.equal(
      fired,
      expected,
      `scope drift for ${file}: applyTo(${JSON.stringify(globs)}) says ${expected}, ` +
        `detector says ${fired}. Update TEMPORARY_SCOPE_PATH_RE in src/lib/heuristic-review.mjs ` +
        `and the applyTo in ${TWE_SKILL_PATH} together.`
    );
  }
});

// ---- looksLikeTestFile: e2e / cypress conventions (#1797 item 1) ----
// 変更前の実測（main 30aca0b9）: `e2e/spec.ts` / `cypress/integration/login.ts` は
// テスト扱いにならず、focused-test は [], hardcoded-secret は発火、
// `src/e2e/spec.ts` の temporary-without-exit は発火だった。
// この節はその挙動を「テスト扱いになる」側へ反転させたことを pin する。

function singleLineDiff(file, line) {
  const diffText =
    `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n` +
    `@@ -1,0 +1,1 @@\n+${line}\n`;
  return { files: parseUnifiedDiff(diffText).files };
}

function kindsFor(file, line, skillId) {
  const plan = { selected: [{ metadata: { id: skillId } }] };
  return buildHeuristicComments({ diff: singleLineDiff(file, line), plan }).map((c) => c.kind);
}

test('looksLikeTestFile (#1797): focused-test fires in e2e/ and cypress/ suites', () => {
  // 変更前は [] だった（test ファイルのみ走査するため素通り）。
  assert.deepEqual(kindsFor('e2e/spec.ts', "test.only('x', () => {});", 'test-existence'), [
    'focused-test',
  ]);
  assert.deepEqual(
    kindsFor('cypress/integration/login.ts', "it.only('x', () => {});", 'test-existence'),
    ['focused-test']
  );
});

test('looksLikeTestFile (#1797): disabled-test fires in a cypress/ suite', () => {
  assert.deepEqual(
    kindsFor('cypress/integration/login.ts', "it.skip('x', () => {});", 'test-existence'),
    ['disabled-test']
  );
});

test('looksLikeTestFile (#1797): hardcoded-secret skips e2e/ and cypress/ suites', () => {
  // 変更前は hardcoded-secret が発火していた（トレードオフ: skip 系検出器の
  // カバレッジは E2E スイート分だけ減る）。
  assert.deepEqual(
    kindsFor('e2e/spec.ts', "const serviceToken = 'DUMMY_TOKEN_123';", 'security-basic'),
    []
  );
  assert.deepEqual(
    kindsFor(
      'cypress/integration/login.ts',
      "const serviceToken = 'DUMMY_TOKEN_123';",
      'security-basic'
    ),
    []
  );
});

test('looksLikeTestFile (#1797): temporary-without-exit skips src/e2e/spec.ts', () => {
  // 変更前は発火していた（TEMPORARY_SCOPE_PATH_RE の src/ 接頭辞内に e2e/ が来る形）。
  assert.deepEqual(
    kindsFor('src/e2e/spec.ts', '// TODO: リトライ間隔を調整する', 'knowledge-to-code-alignment'),
    []
  );
});

test('looksLikeTestFile (#1797): partial matches are not treated as test files', () => {
  // `contest` / `protest` / `e2e-utils` のような部分一致はテスト扱いしない
  // （境界条件 ^ または / を要求する）。
  assert.deepEqual(
    kindsFor('src/contest/auth.ts', "const serviceToken = 'DUMMY_TOKEN_123';", 'security-basic'),
    ['hardcoded-secret']
  );
  assert.deepEqual(
    kindsFor('src/protest.js', '// TODO: リトライ間隔を調整する', 'knowledge-to-code-alignment'),
    ['temporary-without-exit']
  );
  assert.deepEqual(
    kindsFor(
      'src/e2e-utils/a.ts',
      '// TODO: リトライ間隔を調整する',
      'knowledge-to-code-alignment'
    ),
    ['temporary-without-exit']
  );
});

test('looksLikeTestFile (#1797): separator-adjacent test./spec. filenames count as tests', () => {
  // `e2e/spec.ts` と同型の「パス区切り直後の spec./test.」をルート直下でも pin する。
  assert.deepEqual(kindsFor('spec.ts', "test.only('x', () => {});", 'test-existence'), [
    'focused-test',
  ]);
  assert.deepEqual(
    kindsFor('src/test.helpers.ts', "const serviceToken = 'DUMMY_TOKEN_123';", 'security-basic'),
    []
  );
});
