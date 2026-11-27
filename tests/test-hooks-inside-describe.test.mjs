import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `npm test` は --experimental-test-isolation=none で全ファイルを 1 プロセスで流すため、
// ファイル直下の hook は他ファイルのテストにも効く（PR #2519 と PR #2959 で同じ失敗が再発）。
// 規則の本文は docs/development/worker-discipline-template.md にある。

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const TOP_LEVEL_HOOK = /^(beforeEach|afterEach|before|after)\s*\(/gm;

// 直下の before / after が既にあるファイル。1 回だけ走るので他ファイルの各テストには効かないが、
// 新しく増やさない。直したら一覧から外す（外し忘れは下のテストが落とす）。
const ALLOWED_ONCE_HOOKS = new Set([
  'after-change-adapter.test.mjs',
  'after-change-observe-hook.test.mjs',
  'cli-base-ref-consistency.test.mjs',
  'cli-review-base-range.test.mjs',
  'fast-verification-staging.test.mjs',
  'fast-verification.test.mjs',
  'flow-loader.test.mjs',
  'scripts-verify-agent-report.test.mjs',
  'validate-agents-no-node-modules-canary.test.mjs',
]);

function topLevelHooks(source) {
  return [...source.matchAll(TOP_LEVEL_HOOK)].map((m) => m[1]);
}

function violations(file, source) {
  return topLevelHooks(source).filter(
    (hook) => !(ALLOWED_ONCE_HOOKS.has(file) && (hook === 'before' || hook === 'after'))
  );
}

const testFiles = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs'));

describe('test hooks are registered inside describe', () => {
  test('detects only column-0 hook calls', () => {
    assert.deepEqual(topLevelHooks('beforeEach(() => {});\nafterEach (() => {});\n'), [
      'beforeEach',
      'afterEach',
    ]);
    assert.deepEqual(
      topLevelHooks("  beforeEach(() => {});\nimport { after } from 'node:test';\n"),
      []
    );
    assert.deepEqual(
      violations('flow-loader.test.mjs', 'after(() => {});\nbeforeEach(() => {});\n'),
      ['beforeEach']
    );
  });

  test('no test file registers a new top-level hook', () => {
    const found = testFiles.flatMap((file) =>
      violations(file, readFileSync(path.join(testsDir, file), 'utf8')).map(
        (hook) => `${file}: ${hook}(`
      )
    );
    assert.deepEqual(found, []);
  });

  test('every allowlisted file still has a top-level before / after', () => {
    const stale = [...ALLOWED_ONCE_HOOKS].filter(
      (file) =>
        !testFiles.includes(file) ||
        !topLevelHooks(readFileSync(path.join(testsDir, file), 'utf8')).some(
          (hook) => hook === 'before' || hook === 'after'
        )
    );
    assert.deepEqual(stale, []);
  });
});
