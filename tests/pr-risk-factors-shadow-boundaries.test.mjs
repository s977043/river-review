import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessPrRiskFactorsShadow as assess,
} from '../scripts/experiments/pr-risk-factors-shadow.mjs';

const HEAD = 'a'.repeat(40);
const STALE = 'b'.repeat(40);

function observation(files = ['docs/security-policy.md']) {
  return {
    subject: { headSha: HEAD },
    change: { headSha: HEAD, changedFiles: [...files] },
    route: { headSha: HEAD, selectedMode: 'light', riskAction: 'comment_only' },
    alignment: { headSha: HEAD, planRef: 'issue:2781' },
    verification: {
      headSha: HEAD,
      checks: 'passed',
      coverage: 'complete',
      checkedFiles: [...files],
      evidenceRef: 'test-run:1',
    },
    rollback: { headSha: HEAD, reversibility: 'reversible', evidenceRef: 'rollback-plan' },
    detection: { headSha: HEAD, monitoring: 'present', evidenceRef: 'monitoring-record' },
  };
}

function assertNoAuthority(result) {
  assert.equal(result.authorizesApproval, false);
  assert.equal(result.evidenceTrust, 'unverified-input');
}

test('revision identity rejects shared non-string SHAs without coercion', () => {
  for (const head of [[HEAD], new String(HEAD), Symbol('head'), null, 123n]) {
    const input = observation();
    for (const part of Object.values(input)) part.headSha = head;
    const result = assess(input);
    assertNoAuthority(result);
    assert.equal(result.assessmentStatus, 'incomplete');
    assert.equal(result.riskFloor, 'unknown');
    assert.equal(result.axes.impact, 'unknown');
    assert.equal(result.axes.verification, 'unknown');
    assert.deepEqual(result.subject, { headSha: null });
  }
});

test('revision identity is carried in output without echoing other subject data', () => {
  const input = observation();
  input.subject.note = 'untrusted information';
  const result = assess(input);
  assert.deepEqual(result.subject, { headSha: HEAD });
  assertNoAuthority(result);
});

test('route floor preserves reported human review even for documentation', () => {
  for (const route of [
    { selectedMode: 'human-required', riskAction: 'comment_only' },
    { selectedMode: 'light', riskAction: 'require_human_review' },
  ]) {
    const input = observation();
    Object.assign(input.route, route);
    const result = assess(input);
    assert.equal(result.riskFloor, 'high');
    assert.ok(result.hardFloorReasons.includes('reported-human-review-required'));
    assertNoAuthority(result);
  }
});

test('route floor preserves team and risk-map escalation without lowering source risk', () => {
  for (const route of [
    { selectedMode: 'team', riskAction: 'comment_only' },
    { selectedMode: 'light', riskAction: 'escalate' },
  ]) {
    const docs = observation();
    Object.assign(docs.route, route);
    assert.equal(assess(docs).riskFloor, 'medium');
    const auth = observation(['src/auth/login.ts']);
    Object.assign(auth.route, route);
    assert.equal(assess(auth).riskFloor, 'high');
  }
});

test('route floor treats missing, stale and invalid route evidence as incomplete', () => {
  for (const route of [undefined, null, { headSha: STALE }, { headSha: HEAD }]) {
    const input = observation();
    input.route = route;
    const result = assess(input);
    assert.equal(result.assessmentStatus, 'incomplete');
    assert.ok(result.reasonCodes.some((code) => code.endsWith('route')));
    assertNoAuthority(result);
  }
  const input = observation();
  input.route.headSha = STALE;
  input.route.selectedMode = 'human-required';
  const stale = assess(input);
  assert.equal(stale.riskFloor, 'low');
  assert.equal(stale.assessmentStatus, 'incomplete');
  assert.ok(stale.reasonCodes.includes('missing-or-stale-route'));
});

test('route floor keeps a known human requirement when another route field is invalid', () => {
  const input = observation();
  input.route.selectedMode = 'not-a-mode';
  input.route.riskAction = 'require_human_review';
  const result = assess(input);
  assert.equal(result.riskFloor, 'high');
  assert.equal(result.assessmentStatus, 'incomplete');
  assert.ok(result.reasonCodes.includes('invalid-route'));
});

test('verification scope needs both a reference and the complete changed-file manifest', () => {
  for (const field of ['evidenceRef', 'checkedFiles']) {
    const input = observation();
    delete input.verification[field];
    const result = assess(input);
    assert.equal(result.axes.verification, 'reported-incomplete');
    assert.equal(result.assessmentStatus, 'incomplete');
    assertNoAuthority(result);
  }
});

test('verification scope rejects subsets, extra files, duplicates and unsafe manifests', () => {
  for (const checkedFiles of [
    [],
    ['docs/a.md'],
    ['docs/a.md', 'docs/b.md', 'docs/c.md'],
    ['docs/a.md', 'docs/a.md'],
    ['docs/a.md', '../docs/b.md'],
    [null],
  ]) {
    const input = observation(['docs/a.md', 'docs/b.md']);
    input.verification.checkedFiles = checkedFiles;
    const result = assess(input);
    assert.equal(result.axes.verification, 'reported-incomplete');
    assert.ok(result.reasonCodes.includes('verification-scope-mismatch'));
  }
});

test('verification scope comparison is order-independent but still unverified', () => {
  const input = observation(['docs/a.md', 'docs/b.md']);
  input.verification.checkedFiles.reverse();
  const result = assess(input);
  assert.equal(result.axes.verification, 'reported-complete');
  assert.equal(result.assessmentStatus, 'reported');
  assertNoAuthority(result);
});

test('verification scope cannot qualify a stale change manifest', () => {
  const input = observation();
  input.change.headSha = STALE;
  const result = assess(input);
  assert.equal(result.axes.verification, 'reported-incomplete');
  assert.ok(result.reasonCodes.includes('verification-scope-mismatch'));
});

test('verification scope missing never erases a reported failed check', () => {
  const input = observation();
  input.verification.checks = 'failed';
  delete input.verification.checkedFiles;
  delete input.verification.evidenceRef;
  const result = assess(input);
  assert.equal(result.riskFloor, 'high');
  assert.equal(result.axes.verification, 'reported-failed');
  assert.equal(result.assessmentStatus, 'incomplete');
  assertNoAuthority(result);
});

test('policy boundaries include supported YAML config and repository review rules', () => {
  for (const file of ['.river-review.yaml', '.river-review.yml', '.river/rules.md']) {
    const result = assess(observation([file]));
    assert.equal(result.riskFloor, 'high', file);
    assert.ok(result.hardFloorReasons.includes('review-policy-change'), file);
  }
});

test('policy boundaries do not match examples or similarly named documents', () => {
  const files = ['docs/.river-review.yaml.md', 'examples/.river-review.yml', 'docs/rules.md'];
  for (const file of files) {
    const result = assess(observation([file]));
    assert.ok(!result.hardFloorReasons.includes('review-policy-change'), file);
    assert.notEqual(result.riskFloor, 'high', file);
    assertNoAuthority(result);
  }
});

test('path boundaries reject control characters, oversized strings and sparse arrays', () => {
  const cases = [new Array(1), ['x'.repeat(4097)]];
  for (const control of ['\n', '\r', '\t', '\u0000', '\u007f']) {
    cases.push([`docs/a${control}.md`]);
  }
  for (const changedFiles of cases) {
    const input = observation();
    input.change.changedFiles = changedFiles;
    const result = assess(input);
    assert.equal(result.assessmentStatus, 'incomplete');
    assert.equal(result.axes.impact, 'unknown');
    assert.ok(result.reasonCodes.includes('invalid-change-manifest'));
    assertNoAuthority(result);
  }
});

test('path boundaries retain valid Unicode filenames', () => {
  const result = assess(observation(['docs/認証の説明.md']));
  assert.equal(result.riskFloor, 'low');
  assert.equal(result.assessmentStatus, 'reported');
});

test('final invariants: 360 combinations never lower known risk floors or grant authority', () => {
  const rank = { low: 0, medium: 1, high: 2 };
  const cases = [
    ['docs/guide.md', 'low'],
    ['src/service/api.mjs', 'medium'],
    ['src/auth/login.ts', 'high'],
    ['db/migrations/001.sql', 'high'],
    ['.river/rules.md', 'high'],
  ];
  let count = 0;
  for (const [file, pathFloor] of cases) {
    for (const mode of ['light', 'standard', 'team', 'human-required']) {
      for (const action of ['comment_only', 'escalate', 'require_human_review']) {
        for (const checks of ['passed', 'pending', 'failed']) {
          for (const reversibility of ['reversible', 'irreversible']) {
            const input = observation([file]);
            input.route.selectedMode = mode;
            input.route.riskAction = action;
            input.verification.checks = checks;
            input.rollback.reversibility = reversibility;
            const before = structuredClone(input);
            const result = assess(input);
            assert.ok(rank[result.riskFloor] >= rank[pathFloor]);
            if (mode === 'human-required' || action === 'require_human_review') {
              assert.equal(result.riskFloor, 'high');
            }
            if (mode === 'team' || action === 'escalate') {
              assert.ok(rank[result.riskFloor] >= rank.medium);
            }
            if (checks === 'failed' || reversibility === 'irreversible') {
              assert.equal(result.riskFloor, 'high');
            }
            assertNoAuthority(result);
            assert.deepEqual(input, before);
            assert.deepEqual(assess(input), result);
            count += 1;
          }
        }
      }
    }
  }
  assert.equal(count, 360);
});

test('final invariants: skipped, neutral and missing checks are not completed verification', () => {
  for (const checks of ['skipped', 'neutral', 'cancelled', 'action_required', undefined]) {
    const input = observation();
    input.verification.checks = checks;
    const result = assess(input);
    assert.notEqual(result.axes.verification, 'reported-complete');
    assert.equal(result.assessmentStatus, 'incomplete');
    assertNoAuthority(result);
  }
});

test('final invariants: blank evidence reference cannot complete verification', () => {
  const input = observation();
  input.verification.evidenceRef = '  \t\n';
  const result = assess(input);
  assert.equal(result.axes.verification, 'reported-incomplete');
  assert.ok(result.reasonCodes.includes('missing-verification-evidence'));
});

test('final invariants: the documented 500-file limit is inclusive', () => {
  const allowed = Array.from({ length: 500 }, (_, index) => `docs/${index}.md`);
  assert.equal(assess(observation(allowed)).assessmentStatus, 'reported');
  const oversized = [...allowed, 'docs/extra.md'];
  assert.equal(assess(observation(oversized)).assessmentStatus, 'incomplete');
});
