import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyChangedFiles } from '../src/lib/file-classifier.mjs';
import { routeReviewMode, formatRouterResultMarkdown } from '../src/lib/review-mode-router.mjs';
import { selectRolesAuto } from '../src/lib/reviewer-orchestrator.mjs';

// --- routeReviewMode ---

test('docs-only change → light mode', () => {
  const result = routeReviewMode({
    changedFiles: ['docs/guide.md', 'pages/reference/overview.md'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'light');
  assert.ok(result.matchedTriggers.includes('docsTestOnly'));
  assert.ok(result.nextCommand.includes('--depth quick'));
});

test('test-only change → light mode', () => {
  const result = routeReviewMode({
    changedFiles: ['tests/foo.test.mjs', 'tests/bar.test.mjs'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'light');
  assert.ok(result.matchedTriggers.includes('docsTestOnly'));
});

test('app code change → standard mode', () => {
  const result = routeReviewMode({
    changedFiles: ['src/lib/review-engine.mjs'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'standard');
  assert.equal(result.nextCommand, 'river review plan .');
});

test('migration file → team mode', () => {
  const result = routeReviewMode({
    changedFiles: ['db/migrations/001_add_users.sql', 'src/lib/app.mjs'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('fileType:migration'));
  assert.ok(result.nextCommand.includes('--depth thorough'));
  assert.equal(result.recommendedReviewers, 'auto');
});

test('schema file → team mode', () => {
  const result = routeReviewMode({
    changedFiles: ['schemas/skill.schema.json'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('fileType:schema'));
});

test('large fileCount → team mode', () => {
  const files = Array.from({ length: 25 }, (_, i) => `src/lib/module${i}.mjs`);
  const result = routeReviewMode({ changedFiles: files, riskMap: null });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('diffSize:fileCount'));
});

test('large changedLines → team mode', () => {
  const addedLines = Array.from({ length: 510 }, () => '+line').join('\n');
  const result = routeReviewMode({
    changedFiles: ['src/lib/big.mjs'],
    diffText: addedLines,
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('diffSize:changedLines'));
});

test('CI workflow → team mode with explicit trigger', () => {
  const result = routeReviewMode({
    changedFiles: ['.github/workflows/ci.yml'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('fileType:ci'));
  assert.equal(result.confidence, 'high');
});

test('generic infra file → standard mode', () => {
  const result = routeReviewMode({ changedFiles: ['Dockerfile'], riskMap: null });
  assert.equal(result.selectedMode, 'standard');
  assert.ok(result.matchedTriggers.includes('fileType:infra'));
});

test('generic config file → standard mode', () => {
  const result = routeReviewMode({
    changedFiles: ['tsconfig.json'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'standard');
  assert.ok(result.matchedTriggers.includes('fileType:config'));
});

test('package manifest and lockfiles → team mode', () => {
  for (const file of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    const result = routeReviewMode({ changedFiles: [file], riskMap: null });
    assert.equal(result.selectedMode, 'team', file);
    assert.ok(result.matchedTriggers.includes('fileType:dependency'), file);
    assert.equal(result.confidence, 'high');
    assert.equal(result.recommendedReviewers, 'auto');
  }
});

test('human requirement wins even with dependency trigger', () => {
  const riskMap = {
    defaults: { action: 'comment_only' },
    rules: [
      { pattern: 'package-lock.json', action: 'require_human_review', reason: 'Supply chain' },
    ],
  };
  const result = routeReviewMode({ changedFiles: ['package-lock.json'], riskMap });
  assert.equal(result.selectedMode, 'human-required');
  assert.ok(result.matchedTriggers.includes('fileType:dependency'));
});

test('risk-map require_human_review → human-required mode', () => {
  const riskMap = {
    defaults: { action: 'comment_only' },
    rules: [{ pattern: 'src/auth/**', action: 'require_human_review', reason: 'auth critical' }],
  };
  const result = routeReviewMode({
    changedFiles: ['src/auth/login.mjs'],
    riskMap,
  });
  assert.equal(result.selectedMode, 'human-required');
  assert.ok(result.matchedTriggers.includes('risk-map:require_human_review'));
  assert.ok(result.nextCommand.startsWith('#'));
});

test('risk-map escalate → team mode', () => {
  const riskMap = {
    defaults: { action: 'comment_only' },
    rules: [{ pattern: 'src/payments/**', action: 'escalate', reason: 'payments' }],
  };
  const result = routeReviewMode({
    changedFiles: ['src/payments/stripe.mjs'],
    riskMap,
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('risk-map:escalate'));
  assert.equal(result.confidence, 'high');
});

test('risk-map require_human_review beats migration trigger', () => {
  const riskMap = {
    defaults: { action: 'comment_only' },
    rules: [{ pattern: '**/*.sql', action: 'require_human_review', reason: 'DBA review required' }],
  };
  const result = routeReviewMode({
    changedFiles: ['db/migrations/002_add_index.sql'],
    riskMap,
  });
  assert.equal(result.selectedMode, 'human-required');
});

test('empty changedFiles → standard mode', () => {
  const result = routeReviewMode({ changedFiles: [], riskMap: null });
  assert.equal(result.selectedMode, 'standard');
});

test('unknown file type only → standard mode (not light)', () => {
  const result = routeReviewMode({
    changedFiles: ['src/main.rs', 'lib/utils.py'],
    riskMap: null,
  });
  assert.equal(result.selectedMode, 'standard');
});

test('no riskMap arg → standard mode for app file', () => {
  const result = routeReviewMode({ changedFiles: ['src/lib/foo.mjs'] });
  assert.equal(result.selectedMode, 'standard');
  assert.equal(result.riskAction, 'comment_only');
});

test('confidence is high for migration trigger', () => {
  const result = routeReviewMode({
    changedFiles: ['db/migrations/001.sql'],
    riskMap: null,
  });
  assert.equal(result.confidence, 'high');
});

test('confidence is high for schema trigger', () => {
  const result = routeReviewMode({
    changedFiles: ['schemas/skill.schema.json'],
    riskMap: null,
  });
  assert.equal(result.confidence, 'high');
});

test('confidence is medium for large diff trigger', () => {
  const files = Array.from({ length: 25 }, (_, i) => `src/lib/module${i}.mjs`);
  const result = routeReviewMode({ changedFiles: files, riskMap: null });
  assert.equal(result.confidence, 'medium');
});

// --- formatRouterResultMarkdown ---

test('formatRouterResultMarkdown produces markdown table', () => {
  const result = routeReviewMode({
    changedFiles: ['docs/guide.md'],
    riskMap: null,
  });
  const md = formatRouterResultMarkdown(result);
  assert.ok(md.includes('## Review Mode Router'));
  assert.ok(md.includes('`light`'));
  assert.ok(md.includes('```bash'));
  assert.ok(md.includes('river review plan . --depth quick'));
});

test('auto specialist selection aligns with dependency and CI route signals', () => {
  const scenarios = [
    { path: 'package-lock.json', specialist: 'dependency-reviewer' },
    { path: 'pnpm-lock.yaml', specialist: 'dependency-reviewer' },
    { path: '.github/workflows/ci.yml', specialist: 'ci-cd-reviewer' },
  ];
  for (const { path, specialist } of scenarios) {
    const files = [path];
    const routed = routeReviewMode({ changedFiles: files });
    assert.equal(routed.selectedMode, 'team', path);
    const roles = selectRolesAuto(classifyChangedFiles(files));
    assert.ok(roles.includes('bug-hunter'), path);
    assert.ok(roles.includes(specialist), path);
  }
});

test('sensitive auth source uses team review without a risk map or large diff', () => {
  const result = routeReviewMode({
    changedFiles: ['src/auth/login.ts'],
    diffText: '+return token;\n',
  });
  assert.equal(result.selectedMode, 'team');
  assert.equal(result.riskAction, 'comment_only');
  assert.equal(result.recommendedReviewers, 'auto');
  assert.equal(result.confidence, 'high');
  assert.ok(result.matchedTriggers.includes('fileType:sensitiveCode'));
});

test('sensitive source signal never downgrades explicit human-required risk map', () => {
  const riskMap = {
    defaults: { action: 'comment_only' },
    rules: [{ pattern: 'src/auth/**', action: 'require_human_review', reason: 'Owner review' }],
  };
  const result = routeReviewMode({ changedFiles: ['src/auth/login.ts'], riskMap });
  assert.equal(result.selectedMode, 'human-required');
  assert.equal(result.riskAction, 'require_human_review');
  assert.ok(result.matchedTriggers.includes('fileType:sensitiveCode'));
});

test('sensitive words in docs, tests and author names do not raise review depth', () => {
  const docs = routeReviewMode({ changedFiles: ['docs/auth.md', 'tests/auth.test.ts'] });
  assert.equal(docs.selectedMode, 'light');
  assert.ok(!docs.matchedTriggers.includes('fileType:sensitiveCode'));
  const ordinarySource = routeReviewMode({ changedFiles: ['src/lib/author.ts'] });
  assert.equal(ordinarySource.selectedMode, 'standard');
  assert.ok(!ordinarySource.matchedTriggers.includes('fileType:sensitiveCode'));
});

test('mixed source with Windows paths escalates while keeping the route JSON shape', () => {
  const result = routeReviewMode({
    changedFiles: ['docs/guide.md', 'src\\\\payments\\\\charge.php'],
  });
  assert.equal(result.selectedMode, 'team');
  assert.ok(result.matchedTriggers.includes('fileType:sensitiveCode'));
  assert.deepEqual(Object.keys(result), [
    'selectedMode',
    'confidence',
    'reasons',
    'matchedTriggers',
    'recommendedReviewers',
    'riskAction',
    'nextCommand',
  ]);
});
