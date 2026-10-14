// Contract regression tests for #2034: freeze today's route JSON without changing routing.
import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyChangedFiles } from '../src/lib/file-classifier.mjs';
import { routeReviewMode } from '../src/lib/review-mode-router.mjs';
import { selectRolesAuto } from '../src/lib/reviewer-orchestrator.mjs';
import { compileSchemaFile } from './helpers/schema-validator.mjs';

const validate = compileSchemaFile('review-route.schema.json', {
  ajvOptions: { allErrors: true },
});
const validateResult = (result) => {
  assert.equal(validate(result), true, JSON.stringify(validate.errors, null, 2));
};

const protectedRiskMap = {
  defaults: { action: 'comment_only' },
  rules: [
    { pattern: 'src/auth/**', action: 'require_human_review', reason: 'Human security review' },
  ],
};

test('current route output validates across all four modes', () => {
  const cases = [
    { changedFiles: ['docs/overview.md'], expected: 'light' },
    { changedFiles: ['src/lib/example.mjs'], expected: 'standard' },
    { changedFiles: ['schemas/review-artifact.schema.json'], expected: 'team' },
    {
      changedFiles: ['src/auth/login.mjs'],
      riskMap: protectedRiskMap,
      expected: 'human-required',
    },
  ];
  for (const { expected, ...input } of cases) {
    const result = routeReviewMode(input);
    validateResult(result);
    assert.equal(result.selectedMode, expected);
  }
});

test('schema rejects unknown fields, invalid enums, and the premature array migration', () => {
  const good = routeReviewMode({ changedFiles: ['schemas/skill.schema.json'] });
  for (const changed of [
    { ...good, selectedMode: 'auto-merge' },
    { ...good, riskAction: 'approve' },
    { ...good, recommendedReviewers: ['bug-hunter'] },
    { ...good, approved: true },
    { ...good, nextCommand: '' },
  ]) {
    assert.equal(validate(changed), false, JSON.stringify(changed));
  }
});

test('suggested reviewer mode remains separate from the real reviewer role ledger', () => {
  const files = ['schemas/skill.schema.json', 'tests/example.test.mjs'];
  const result = routeReviewMode({ changedFiles: files });
  validateResult(result);
  assert.equal(result.recommendedReviewers, 'auto');
  const roles = selectRolesAuto(classifyChangedFiles(files));
  assert.ok(roles.includes('bug-hunter'));
  assert.ok(roles.includes('security-scanner'));
  assert.ok(roles.includes('test-gap'));
  // The v1 advisory output does not claim those roles actually executed.
  assert.equal(Object.hasOwn(result, 'executedReviewers'), false);
});

test('human-required remains advisory, never an AI approval or next execution', () => {
  const result = routeReviewMode({
    changedFiles: ['src/auth/login.mjs'],
    riskMap: protectedRiskMap,
  });
  validateResult(result);
  assert.equal(result.riskAction, 'require_human_review');
  assert.equal(result.recommendedReviewers, 'none');
  assert.match(result.nextCommand, /^# No AI review recommended/);
});
