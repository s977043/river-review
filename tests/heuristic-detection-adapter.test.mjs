import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import {
  buildHeuristicComments,
  collectHeuristicDetections,
} from '../src/lib/heuristic-review.mjs';

function parse(diffText) {
  return { files: parseUnifiedDiff(diffText).files };
}

test('collectHeuristicDetections preserves registry order and is uncapped while comments stay capped at 8', () => {
  const diffText = `diff --git a/src/security.ts b/src/security.ts
--- a/src/security.ts
+++ b/src/security.ts
@@ -1,1 +1,10 @@
 const baseline = true;
+const API_KEY_ONE = "ghp_0123456789012345678901234567890123456";
+const API_KEY_TWO = "ghp_1123456789012345678901234567890123456";
+const API_KEY_THREE = "ghp_2123456789012345678901234567890123456";
+eval(inputOne);
+eval(inputTwo);
+eval(inputThree);
+const first = { rejectUnauthorized: false };
+const second = { rejectUnauthorized: false };
+const third = { rejectUnauthorized: false };
`;
  const diff = parse(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const detections = collectHeuristicDetections({ diff, plan });
  const comments = buildHeuristicComments({ diff, plan });

  assert.equal(detections.length, 9);
  assert.deepEqual(
    detections.map((detection) => detection.kind),
    [
      'hardcoded-secret',
      'hardcoded-secret',
      'hardcoded-secret',
      'dangerous-eval',
      'dangerous-eval',
      'dangerous-eval',
      'insecure-tls',
      'insecure-tls',
      'insecure-tls',
    ]
  );
  assert.equal(comments.length, 8);
  assert.deepEqual(comments, detections.slice(0, 8));
});

test('collectHeuristicDetections keeps detector output separate from finding presentation', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,2 @@
 const baseline = true;
+eval(userInput);
`;
  const diff = parse(diffText);
  const plan = { selected: [{ metadata: { id: 'security-basic' } }] };

  const [detection] = collectHeuristicDetections({ diff, plan });

  assert.deepEqual(detection, {
    file: 'src/handler.ts',
    line: 2,
    kind: 'dangerous-eval',
    skillId: 'security-basic',
  });
  assert.equal('finding' in detection, false);
  assert.equal('severity' in detection, false);
  assert.equal('confidence' in detection, false);
});

test('collectHeuristicDetections preserves skipIfSkill semantics without duplicate coverage findings', () => {
  const diffText = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,1 +1,2 @@
 export const baseline = true;
+if (featureEnabled) return runFeature();
`;
  const diff = parse(diffText);
  const plan = {
    selected: [
      { metadata: { id: 'test-existence' } },
      { metadata: { id: 'coverage-gap' } },
    ],
  };

  const missingTests = collectHeuristicDetections({ diff, plan }).filter(
    (detection) => detection.kind === 'missing-tests'
  );

  assert.equal(missingTests.length, 1);
  assert.equal(missingTests[0].skillId, 'test-existence');
});

test('collectHeuristicDetections uses coverage-gap when test-existence is not selected', () => {
  const diffText = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,1 +1,2 @@
 export const baseline = true;
+if (featureEnabled) return runFeature();
`;
  const diff = parse(diffText);
  const plan = { selected: [{ metadata: { id: 'coverage-gap' } }] };

  const missingTests = collectHeuristicDetections({ diff, plan }).filter(
    (detection) => detection.kind === 'missing-tests'
  );

  assert.equal(missingTests.length, 1);
  assert.equal(missingTests[0].skillId, 'coverage-gap');
});

test('collectHeuristicDetections is quiet when no heuristic skill is selected', () => {
  const diffText = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,2 @@
 const baseline = true;
+eval(userInput);
`;
  const diff = parse(diffText);
  const plan = { selected: [{ metadata: { id: 'api-compatibility' } }] };

  assert.deepEqual(collectHeuristicDetections({ diff, plan }), []);
});
