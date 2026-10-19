import assert from 'node:assert/strict';
import test from 'node:test';

import { detectAsyncCorrectnessSignals } from '../src/lib/async-correctness-signals.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

function detect(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  return detectAsyncCorrectnessSignals({ diff: { files: parsed.files } });
}

function diffFor(path, lines) {
  return `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -0,0 +1,${lines.length} @@
${lines.map((line) => `+${line}`).join('\n')}
`;
}

const LOAD = 'async function load() { return 1; }';

test('detects an un-awaited async call in a condition', () => {
  const signals = detect(diffFor('src/a.ts', [LOAD, 'if (load()) {}']));
  assert.deepEqual(signals, [{ kind: 'async-call-in-condition', file: 'src/a.ts', line: 2 }]);
});

test('does not flag an awaited async call in a condition', () => {
  assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, 'if (await load()) {}'])), []);
});

test('detects a floating async call statement', () => {
  const signals = detect(diffFor('src/a.ts', [LOAD, 'load();']));
  assert.deepEqual(signals, [{ kind: 'async-call-floating', file: 'src/a.ts', line: 2 }]);
});

test('does not flag a void-prefixed or .catch-handled call', () => {
  assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, 'void load();', 'load().catch(log);'])), []);
});

test('detects an async result assigned without await', () => {
  const signals = detect(diffFor('src/a.ts', [LOAD, 'const x = load();']));
  assert.deepEqual(signals, [
    { kind: 'async-result-assigned-unawaited', file: 'src/a.ts', line: 2 },
  ]);
});

test('does not flag an awaited assignment or a Promise combinator', () => {
  const lines = [LOAD, 'const x = await load();', 'const y = Promise.all([load()]);'];
  assert.deepEqual(detect(diffFor('src/a.ts', lines)), []);
});

test('detects an un-awaited async return inside try', () => {
  const signals = detect(diffFor('src/a.ts', [LOAD, 'try {', '  return load();', '} catch {}']));
  assert.deepEqual(signals, [{ kind: 'async-return-in-try', file: 'src/a.ts', line: 3 }]);
});

test('does not flag an async return outside try', () => {
  assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, 'return load();'])), []);
});

test('detects an async callback passed to an iteration method', () => {
  const signals = detect(diffFor('src/a.ts', ['items.forEach(async (item) => item);']));
  assert.deepEqual(signals, [{ kind: 'async-callback-in-iteration', file: 'src/a.ts', line: 1 }]);
});

test('does not flag an async callback passed to map', () => {
  assert.deepEqual(detect(diffFor('src/a.ts', ['items.map(async (item) => item);'])), []);
});

test('emits nothing for test files, non-source files, or calls behind a comment', () => {
  assert.deepEqual(detect(diffFor('tests/a.test.ts', [LOAD, 'load();'])), []);
  assert.deepEqual(detect(diffFor('docs/a.md', [LOAD, 'load();'])), []);
  assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, '// load();'])), []);
  assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, "const u = 'x'; // load();"])), []);
});

test('a // inside a string literal does not hide the rest of the line', () => {
  const lines = [LOAD, "if (url === 'http://x' && load()) {}", 'const u = "a//b"; load();'];
  assert.deepEqual(detect(diffFor('src/a.ts', lines)), [
    { kind: 'async-call-in-condition', file: 'src/a.ts', line: 2 },
  ]);
  const backtick = detect(diffFor('src/a.ts', [LOAD, 'if (`//${x}` && load()) {}']));
  assert.deepEqual(backtick, [{ kind: 'async-call-in-condition', file: 'src/a.ts', line: 2 }]);
});

test('escaped quotes and backslashes keep the string open until its real close', () => {
  for (const line of [
    "if (s === 'it\\'s // x' && load()) {}",
    'if (s === "\\\\" && x === "//" && load()) {}',
  ]) {
    assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, line])), [
      { kind: 'async-call-in-condition', file: 'src/a.ts', line: 2 },
    ]);
  }
});

// Known limits: nested `${}` inside template literals and `/* */` block comments
// spanning code are not modelled; a block comment is skipped only when it sits
// in regex-literal position.
test('unclosed quotes and regex literals do not swallow a real // comment', () => {
  for (const line of [
    "if (/'/.test(s)) {} // if (load()) x",
    'while (re.test(/"/)) {} // while (load())',
    "if (x) return <p>don't</p>; // if (load())",
    "if (s === 'a') {} /* it's */ // if (load())",
  ]) {
    assert.deepEqual(detect(diffFor('src/a.ts', [LOAD, line])), [], line);
  }
});
