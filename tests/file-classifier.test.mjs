import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyChangedFiles,
  isCIWorkflowFile,
  isDependencyFile,
} from '../src/lib/file-classifier.mjs';

test('classifyChangedFiles: categorizes mixed file set', () => {
  const result = classifyChangedFiles([
    'src/lib/review-engine.mjs',
    'tests/verifier.test.mjs',
    'schemas/skill.schema.json',
    '.github/workflows/test.yml',
    'package.json',
    'docs/architecture.md',
    'pages/reference/eval-keep-discard-policy.md',
    'db/migrations/001_init.sql',
    'unknown-file.xyz',
  ]);

  assert.deepEqual(result.app, ['src/lib/review-engine.mjs']);
  assert.deepEqual(result.test, ['tests/verifier.test.mjs']);
  assert.deepEqual(result.schema, ['schemas/skill.schema.json']);
  assert.deepEqual(result.infra, ['.github/workflows/test.yml']);
  assert.deepEqual(result.config, ['package.json']);
  assert.deepEqual(result.docs, [
    'docs/architecture.md',
    'pages/reference/eval-keep-discard-policy.md',
  ]);
  assert.deepEqual(result.migration, ['db/migrations/001_init.sql']);
  assert.deepEqual(result.unknown, ['unknown-file.xyz']);
});

test('classifyChangedFiles: test files take priority over app', () => {
  const result = classifyChangedFiles(['src/lib/__tests__/foo.test.mjs']);
  assert.deepEqual(result.test, ['src/lib/__tests__/foo.test.mjs']);
  assert.deepEqual(result.app, []);
});

test('classifyChangedFiles: empty input returns empty categories', () => {
  const result = classifyChangedFiles([]);
  assert.equal(Object.values(result).flat().length, 0);
});

test('classifyChangedFiles: config patterns', () => {
  const result = classifyChangedFiles([
    'tsconfig.json',
    '.eslintrc.json',
    '.env.example',
    'jest.config.js',
    '.river-review.json',
  ]);
  assert.equal(result.config.length, 5);
});

// #1804 follow-up: named textlint configs live outside the repo root and are not
// dotfiles, and `.textlintignore` is not an `rc` file. Both must classify as config
// so the review-criteria-integrity skill can see lint-rule weakening.
test('classifyChangedFiles: textlint config and ignore files', () => {
  const result = classifyChangedFiles([
    'tools/textlint/docs.textlintrc.json',
    '.textlintignore',
    '.textlintrc.json',
  ]);
  assert.deepEqual(result.config, [
    'tools/textlint/docs.textlintrc.json',
    '.textlintignore',
    '.textlintrc.json',
  ]);
  assert.deepEqual(result.unknown, []);
});

test('classifyChangedFiles: schema files', () => {
  const result = classifyChangedFiles([
    'schemas/eval-failure.schema.json',
    'schemas/output.schema.json',
  ]);
  assert.equal(result.schema.length, 2);
});

test('classifyChangedFiles: infra patterns', () => {
  const result = classifyChangedFiles([
    '.github/workflows/deploy.yml',
    'Dockerfile',
    '.husky/pre-commit',
    'scripts/setup.sh',
  ]);
  assert.equal(result.infra.length, 4);
});

test('classifyChangedFiles: docs from various locations', () => {
  const result = classifyChangedFiles([
    'README.md',
    'docs/adr/001-eval-driven-improvement-loop.md',
    'AGENTS.md',
  ]);
  assert.equal(result.docs.length, 3);
});

test('classifyChangedFiles: migration patterns', () => {
  const result = classifyChangedFiles([
    'db/migrations/001_init.sql',
    'src/migrations/20240101_add_users.ts',
  ]);
  assert.equal(result.migration.length, 2);
});

test('dependency lockfiles classify as config, including workspace paths', () => {
  const files = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'apps/web/package.json'];
  const classified = classifyChangedFiles(files);
  assert.deepEqual(classified.config, files);
  assert.deepEqual(classified.unknown, []);
  for (const file of files) assert.equal(isDependencyFile(file), true);
  assert.equal(isDependencyFile('tsconfig.json'), false);
  assert.equal(isDependencyFile(null), false);
});

test('CI workflow predicate excludes generic infrastructure', () => {
  assert.equal(isCIWorkflowFile('.github/workflows/ci.yml'), true);
  assert.equal(isCIWorkflowFile('Dockerfile'), false);
  assert.equal(isCIWorkflowFile(undefined), false);
});
