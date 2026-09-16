import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const unknownCoverageSkill = read('skills/agent-skills/unknown-coverage-review/SKILL.md');
const profileReference = read(
  'skills/agent-skills/unknown-coverage-review/references/SECURITY-AUDIT-PROFILE.md'
);
const auditSkill = read('skills/agent-skills/river-review-security-audit/SKILL.md');
const fixtures = JSON.parse(
  read(
    'skills/agent-skills/unknown-coverage-review/references/security-audit-profile-fixtures.json'
  )
);

const EXPECTED_FIXTURES = new Map([
  ['missing-applicable-surface', 'raise_unknown'],
  ['covered-evidence-too-narrow', 'raise_unknown'],
  ['legitimate-out-of-scope', 'no_finding'],
  ['suspicious-mass-exclusion', 'raise_unknown'],
  ['zero-findings-safe-claim', 'raise_unknown'],
  ['zero-findings-neutral-claim', 'no_finding'],
  ['generic-profile-regression-guard', 'no_review'],
  ['gate-behavior-regression-guard', 'report_only'],
]);

test('unknown coverage review exposes generic and security-audit profiles', () => {
  assert.match(unknownCoverageSkill, /profile: generic \| security-audit/);
  assert.match(unknownCoverageSkill, /generic.*diff-oriented Pre-execution Gate/is);
  assert.match(unknownCoverageSkill, /security-audit.*does not require.*diff/is);
});

test('security-audit profile stays semantic and does not duplicate deterministic validation', () => {
  assert.match(profileReference, /validateSecurityAuditCoverageSemantics\(\)/);
  assert.match(profileReference, /semantic evidence sufficiency/i);
  assert.match(profileReference, /Do not feed this profile directly into Gate behavior/i);
  assert.match(profileReference, /zero findings means safe or secure/i);
  assert.match(profileReference, /never require every attack class mechanically/i);
});

test('security audit entry invokes coverage critic after the observe-only ledger', () => {
  assert.match(
    auditSkill,
    /observe-only SecurityAuditCoverage ledger\s*\n\s*-> unknown-coverage-review \(security-audit profile\)\s*\n\s*-> existing verification path/is
  );
  assert.match(auditSkill, /Gate behavior.*unchanged/i);
});

test('Phase 4 fixtures pin positive and false-positive guards', () => {
  assert.equal(fixtures.kind, 'SecurityAuditCoverageCriticFixtures');
  assert.equal(fixtures.profile, 'security-audit');
  assert.equal(fixtures.fixtures.length, EXPECTED_FIXTURES.size);

  for (const fixture of fixtures.fixtures) {
    assert.equal(
      fixture.expected.criticAction,
      EXPECTED_FIXTURES.get(fixture.id),
      `unexpected critic action for ${fixture.id}`
    );
    assert.ok(
      fixture.expected.reason.length > 0,
      `${fixture.id} must explain the expected behavior`
    );
  }

  assert.deepEqual(
    new Set(fixtures.fixtures.map(({ id }) => id)),
    new Set(EXPECTED_FIXTURES.keys())
  );
});
