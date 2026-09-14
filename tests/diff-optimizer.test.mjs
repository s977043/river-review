import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLlmDiffView, optimizeDiff, parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

const whitespaceDiff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,3 @@
-const foo = 1;
+const foo = 1;
 const bar = 2;
 `;

const commentDiff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,3 @@
-// old comment
+// new comment
 const bar = 2;
 `;

const markdownDiff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-hello
+hello world
`;

function buildLargeDiff() {
  const before = Array.from({ length: 250 }, (_, i) => `${i + 1}`).join('\n');
  const after = Array.from({ length: 250 }, (_, i) => `${i + 1}`)
    .concat(['251', '252', '253'])
    .join('\n');
  return `diff --git a/src/big.js b/src/big.js
--- a/src/big.js
+++ b/src/big.js
@@ -1,250 +1,253 @@
-${before.split('\n').join('\n-')}
+${after.split('\n').join('\n+')}`;
}

function optimizeFromText(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  return optimizeDiff({ files: parsed.files, diffText });
}

test('filters whitespace-only changes', () => {
  const result = optimizeFromText(whitespaceDiff);
  assert.equal(result.files.length, 0);
  assert.equal(result.diffText, '');
});

test('filters comment-only changes', () => {
  const result = optimizeFromText(commentDiff);
  assert.equal(result.files.length, 0);
});

test('filters markdown file changes', () => {
  const result = optimizeFromText(markdownDiff);
  assert.equal(result.files.length, 0);
});

test('filters bundled dist file changes', () => {
  const distDiff = `diff --git a/runners/github-action/dist/index.mjs b/runners/github-action/dist/index.mjs
--- a/runners/github-action/dist/index.mjs
+++ b/runners/github-action/dist/index.mjs
@@ -1,2 +1,2 @@
-const bundled = 1;
+const bundled = 2;
`;
  const result = optimizeFromText(distDiff);
  assert.equal(result.files.length, 0);
  assert.equal(result.diffText, '');
});

test('filters files under a nested dist/ path segment (path-based, not by content type)', () => {
  const nestedDistDiff = `diff --git a/runners/node-api/dist/index.d.ts b/runners/node-api/dist/index.d.ts
--- a/runners/node-api/dist/index.d.ts
+++ b/runners/node-api/dist/index.d.ts
@@ -1,1 +1,1 @@
-export declare const a: number;
+export declare const a: string;
`;
  const result = optimizeFromText(nestedDistDiff);
  assert.equal(result.files.length, 0);
});

test('filters files where dist/ is a mid-path segment', () => {
  const midSegmentDiff = `diff --git a/packages/foo/dist/bar.js b/packages/foo/dist/bar.js
--- a/packages/foo/dist/bar.js
+++ b/packages/foo/dist/bar.js
@@ -1,2 +1,2 @@
-const bar = 1;
+const bar = 2;
`;
  const result = optimizeFromText(midSegmentDiff);
  assert.equal(result.files.length, 0);
});

test('does not exclude a file named dist.config.js (basename, not a dist/ segment)', () => {
  const distConfigDiff = `diff --git a/dist.config.js b/dist.config.js
--- a/dist.config.js
+++ b/dist.config.js
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
`;
  const result = optimizeFromText(distConfigDiff);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'dist.config.js');
});

test('keeps normal source file changes (does not over-exclude)', () => {
  const srcDiff = `diff --git a/src/lib/diff-processor.mjs b/src/lib/diff-processor.mjs
--- a/src/lib/diff-processor.mjs
+++ b/src/lib/diff-processor.mjs
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
`;
  const result = optimizeFromText(srcDiff);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'src/lib/diff-processor.mjs');
  assert.match(result.diffText, /src\/lib\/diff-processor\.mjs/);
});

test('does not exclude paths that merely contain "dist" as a substring', () => {
  const redistDiff = `diff --git a/src/redistribute.mjs b/src/redistribute.mjs
--- a/src/redistribute.mjs
+++ b/src/redistribute.mjs
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
`;
  const result = optimizeFromText(redistDiff);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'src/redistribute.mjs');
});

test('truncates large hunks', () => {
  const result = optimizeFromText(buildLargeDiff());
  const hunkLines = result.files[0].hunks[0].lines;
  assert.ok(hunkLines.includes('... (hunk truncated) ...'));
});

test('reduces token estimate compared to raw diff', () => {
  const result = optimizeFromText(`${commentDiff}\n${buildLargeDiff()}`);
  assert.ok(result.rawTokenEstimate >= result.tokenEstimate);
  assert.ok(result.reduction >= 0);
});

test('renders new file paths with /dev/null correctly', () => {
  const newFileDiff = `diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+console.log('new');
+module.exports = {};
`;
  const result = optimizeFromText(newFileDiff);
  assert.match(result.diffText, /--- \/dev\/null/);
  assert.match(result.diffText, /\+\+\+ b\/new.js/);
});

// buildLlmDiffView — centralized LLM-facing view used by generateReview so both
// the diff body and the "Changed files" summary drop non-reviewable artifacts.
const twoFileArtifactDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
diff --git a/runners/github-action/dist/index.mjs b/runners/github-action/dist/index.mjs
--- a/runners/github-action/dist/index.mjs
+++ b/runners/github-action/dist/index.mjs
@@ -1,2 +1,2 @@
-const bundled = 1;
+const bundled = 2;
`;

test('buildLlmDiffView reuses the precomputed optimized view (collectRepoDiff shape)', () => {
  const parsed = parseUnifiedDiff(twoFileArtifactDiff);
  const srcOnly = parsed.files.filter((f) => f.path === 'src/app.ts');
  const view = buildLlmDiffView({
    files: parsed.files, // raw, incl dist
    filesForReview: srcOnly, // optimizeDiff output, excl dist
    diffText: 'PRECOMPUTED_OPTIMIZED',
  });
  assert.deepEqual(
    view.files.map((f) => f.path),
    ['src/app.ts']
  );
  assert.equal(view.diffText, 'PRECOMPUTED_OPTIMIZED');
});

test('buildLlmDiffView re-optimizes the raw chunk alias shape', () => {
  const parsed = parseUnifiedDiff(twoFileArtifactDiff);
  const rawChunk = parsed.files;
  const view = buildLlmDiffView({
    files: rawChunk,
    filesForReview: rawChunk,
    diffText: twoFileArtifactDiff,
  });

  assert.deepEqual(
    view.files.map((f) => f.path),
    ['src/app.ts']
  );
  assert.equal(view.diffText.includes('dist/index.mjs'), false);
  assert.match(view.diffText, /src\/app\.ts/);
});

test('buildLlmDiffView filters dist on the fly when filesForReview is absent (plan/exec path)', () => {
  const parsed = parseUnifiedDiff(twoFileArtifactDiff);
  const view = buildLlmDiffView({ diffText: twoFileArtifactDiff, files: parsed.files });
  assert.deepEqual(
    view.files.map((f) => f.path),
    ['src/app.ts']
  );
  assert.equal(view.diffText.includes('dist/index.mjs'), false);
  assert.match(view.diffText, /src\/app\.ts/);
});

test('buildLlmDiffView passes diffText through unchanged when nothing is excluded', () => {
  const cleanDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,1 +1,1 @@
-const value = 1;
+const value = 2;`;
  const parsed = parseUnifiedDiff(cleanDiff);
  const view = buildLlmDiffView({ diffText: cleanDiff, files: parsed.files });
  assert.equal(view.files.length, 1);
  assert.equal(view.diffText, cleanDiff);
});
