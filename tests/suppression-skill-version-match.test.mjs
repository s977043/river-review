// #2202 Phase 1 — skill-scoped criterion invalidation, strictly opt-in.
// Calendar expiry and the project-rules gate are separate predicates.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  applySuppressions,
  isSuppressionSkillVersionMatchEnabled,
} from '../src/lib/suppression-apply.mjs';
import {
  createSuppression,
  evaluateSuppressionSkillVersionMatch,
  formatSkillVersionMismatchWarning,
} from '../src/lib/suppression.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { loadSkills } from '../runners/core/skill-loader.mjs';
import { createRepoWithSilentCatchChange } from './helpers/temp-repo.mjs';
import { memoryConfigSchema } from '../src/config/schema.mjs';

const ON = { memory: { suppressionRequireSkillVersionMatch: true } };
const FP = 'a'.repeat(16);

function entry(context = {}) {
  return {
    id: 'suppression-skill-phase1',
    context: {
      active: true,
      fingerprint: FP,
      scope: 'file',
      feedbackType: 'false_positive',
      ...context,
    },
  };
}

function finding(id = 'finding-a') {
  return { id, fingerprint: FP, severity: 'minor', file: 'a.js' };
}

function apply(s, options = {}, findings = [finding()]) {
  const warnings = [];
  const result = applySuppressions(
    findings,
    { suppressions: [s] },
    { ...options, warn: (message) => warnings.push(message) }
  );
  return { ...result, warnings };
}

test('skill criterion matching only decides when both versions and skillId are known', () => {
  const s = entry({ skillId: 'skill-a', skillVersion: '1.0.0' });
  assert.deepEqual(
    evaluateSuppressionSkillVersionMatch(s, new Map([['skill-a', '1.0.0']])),
    { status: 'match' }
  );
  assert.deepEqual(
    evaluateSuppressionSkillVersionMatch(s, new Map([['skill-a', '2.0.0']])),
    { status: 'mismatch' }
  );
  for (const unknown of [
    entry(),
    entry({ skillId: 'skill-a' }),
    entry({ skillVersion: '1.0.0' }),
    entry({ skillId: 'skill-a', skillVersion: '' }),
  ]) {
    assert.equal(
      evaluateSuppressionSkillVersionMatch(unknown, new Map([['skill-a', '2.0.0']])).status,
      'undetermined'
    );
  }
  for (const versions of [
    undefined,
    new Map(),
    new Map([['skill-b', '2.0.0']]),
    new Map([['skill-a', '']]),
  ]) {
    assert.equal(evaluateSuppressionSkillVersionMatch(s, versions).status, 'undetermined');
  }
});

test('skill-version opt-in requires exact true; default and near-miss stay off', () => {
  for (const config of [
    undefined,
    {},
    { memory: {} },
    { memory: { suppressionRequireSkillVersionMatch: false } },
    { memory: { suppressionRequireSkillVersionMatch: 'true' } },
    { memory: { suppressionRequireSkillVersionMatch: 1 } },
  ]) {
    assert.equal(isSuppressionSkillVersionMatchEnabled(config), false);
    const run = apply(
      entry({ skillId: 'skill-a', skillVersion: '1.0.0' }),
      { config, skillVersions: new Map([['skill-a', '2.0.0']]) }
    );
    assert.equal(run.suppressedFindings.length, 1);
    assert.equal(run.warnings.length, 0);
  }
  assert.equal(isSuppressionSkillVersionMatchEnabled(ON), true);
  assert.deepEqual(
    memoryConfigSchema.parse({ suppressionRequireSkillVersionMatch: true }),
    { suppressionRequireSkillVersionMatch: true }
  );
});

test('known mismatch resurfaces findings once, but unrelated skill changes do not', () => {
  const s = entry({ skillId: 'skill-a', skillVersion: '1.0.0' });
  const same = apply(s, {
    config: ON,
    skillVersions: new Map([['skill-a', '1.0.0'], ['skill-b', '3.0.0']]),
  });
  assert.equal(same.suppressedFindings.length, 1);

  const changeElsewhere = apply(s, {
    config: ON,
    skillVersions: new Map([['skill-a', '1.0.0'], ['skill-b', '9.0.0']]),
  });
  assert.deepEqual(changeElsewhere, same);

  const mismatched = apply(
    s,
    { config: ON, skillVersions: new Map([['skill-a', '2.0.0']]) },
    [finding('a'), finding('b')]
  );
  assert.equal(mismatched.keptFindings.length, 2);
  assert.equal(mismatched.suppressedFindings.length, 0);
  assert.deepEqual(
    mismatched.applied.map((a) => a.reason),
    ['skill-version-mismatch', 'skill-version-mismatch']
  );
  assert.deepEqual(mismatched.warnings, [formatSkillVersionMismatchWarning({ id: s.id })]);
});

test('legacy unknown provenance stays active, even with skill gate enabled', () => {
  const options = { config: ON, skillVersions: new Map([['skill-a', '2.0.0']]) };
  for (const context of [
    {},
    { skillId: 'skill-a' },
    { skillVersion: '1.0.0' },
    { skillId: 'skill-missing', skillVersion: '1.0.0' },
    { skillId: 'skill-a', skillVersion: null },
  ]) {
    const run = apply(entry(context), options);
    assert.equal(run.suppressedFindings.length, 1, JSON.stringify(context));
    assert.deepEqual(run.warnings, []);
  }
});

test('calendar expiry and project rules keep their existing precedence', () => {
  const s = entry({
    skillId: 'skill-a',
    skillVersion: '1.0.0',
    expiresAt: '2020-01-01T00:00:00Z',
    rulesDigest: '0'.repeat(64),
    rulesDigestAlgo: 'v2',
  });
  const both = {
    config: {
      memory: {
        suppressionRequireSkillVersionMatch: true,
        suppressionRequireRulesMatch: true,
      },
    },
    rulesText: 'new rules',
    skillVersions: new Map([['skill-a', '2.0.0']]),
    now: new Date('2026-10-12T00:00:00Z'),
  };
  assert.equal(apply(s, both).applied[0].reason, 'suppression-expired');
  const withoutExpiry = entry({ ...s.context, expiresAt: undefined });
  assert.equal(apply(withoutExpiry, both).applied[0].reason, 'rules-digest-mismatch');
});

test('runLocalReview consults actual installed skill metadata only when opted in', async (t) => {
  const { dir, cleanup } = await createRepoWithSilentCatchChange({
    prefix: 'river-skill-version-wire-',
  });
  t.after(cleanup);
  mkdirSync(path.join(dir, '.river'), { recursive: true });

  async function review(config) {
    writeFileSync(path.join(dir, '.river-review.json'), JSON.stringify(config));
    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');
    return runLocalReview({ cwd: dir, context, dryRun: true, quiet: true });
  }

  const skills = await loadSkills();
  const skill = skills.find(
    (item) =>
      typeof item?.metadata?.id === 'string' && typeof item?.metadata?.version === 'string'
  );
  assert.ok(skill, 'the installed loader must supply versioned skills');

  const baseline = await review({});
  assert.ok(baseline.findings.length > 0);
  const target = baseline.findings[0];
  createSuppression({
    indexPath: path.join(dir, '.river', 'memory', 'index.json'),
    fingerprint: target.fingerprint,
    feedbackType: 'accepted_risk',
    filePaths: [target.file],
    rationale: 'synthetic historical skill criterion',
    skillId: skill.metadata.id,
    skillVersion: '0.0.0-older-than-current',
  });
  const unguarded = await review({});
  assert.ok(
    unguarded.suppressedFindings.some((f) => f.fingerprint === target.fingerprint)
  );

  const active = await review(ON);
  assert.ok(active.findings.some((f) => f.fingerprint === target.fingerprint));
  assert.ok(
    active.reviewDebug.suppressionsApplied.some(
      (item) =>
        item.fingerprint === target.fingerprint &&
        item.reason === 'skill-version-mismatch'
    )
  );
});

// TEMP_PRETTIER_DIAGNOSTIC_REMOVE
test('temporary: capture repository Prettier normalization', async () => {
  const prettier = await import('prettier');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const filepath = fileURLToPath(import.meta.url);
  const original = readFileSync(filepath, 'utf8').split('// TEMP_PRETTIER_DIAGNOSTIC_REMOVE')[0];
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  const normalized = await prettier.format(original, { ...options, filepath });
  console.log('PRETTIER_EXPECTED_BASE64=' + Buffer.from(normalized).toString('base64'));
});
