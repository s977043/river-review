import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSecurityAuditCoverageSemantics } from '../src/lib/security-audit-coverage.mjs';
import { compileSecurityAuditCoverageValidator } from './helpers/schema-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = resolve(ROOT, 'skills', 'agent-skills', 'unknown-coverage-review', 'fixtures');
const REGISTRY_PATH = resolve(
  ROOT,
  'skills',
  'agent-skills',
  'river-review-security-audit',
  'references',
  'attack-classes.json'
);

const fixtureNames = [
  '04-security-audit-missing-surface.md',
  '05-security-audit-unsupported-covered.md',
  '06-security-audit-legitimate-out-of-scope.md',
  '07-security-audit-hidden-exclusion-defer.md',
  '08-security-audit-zero-findings-safe-overclaim.md',
  '09-security-audit-zero-findings-neutral.md',
];

const validateCoverage = compileSecurityAuditCoverageValidator();
const attackRegistry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

function readFixture(name) {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
}

function coverageFromFixture(name) {
  const fixture = readFixture(name);
  const match = fixture.match(/```json\n([\s\S]*?)\n```/u);
  assert.ok(match, `${name} must contain a JSON SecurityAuditCoverage block`);
  return JSON.parse(match[1]);
}

for (const fixtureName of fixtureNames) {
  test(`${fixtureName} is valid Phase 3 coverage input`, () => {
    const coverage = coverageFromFixture(fixtureName);

    assert.equal(
      validateCoverage(coverage),
      true,
      `${fixtureName}: ${JSON.stringify(validateCoverage.errors)}`
    );
    assert.deepEqual(
      validateSecurityAuditCoverageSemantics(coverage, attackRegistry),
      [],
      `${fixtureName} must reach the Phase 4 critic without deterministic Phase 3 errors`
    );
  });
}

test('missing-surface fixture uses an independent reconnaissance scope', () => {
  const fixture = readFixture('04-security-audit-missing-surface.md');
  assert.match(fixture, /Reconnaissance expected scope/u);
  assert.match(fixture, /payments × api-to-payment-service × authn-authz/u);
  assert.match(fixture, /Do not interpret empty `openUnitIds` as complete semantic coverage/u);
});

test('unsupported-covered fixture is schema-valid by construction but documents claim/evidence mismatch', () => {
  const fixture = readFixture('05-security-audit-unsupported-covered.md');
  assert.match(fixture, /Phase 3 validator accepts the ledger/u);
  assert.match(fixture, /documentation-only evidence/u);
  assert.match(fixture, /claim-to-evidence mismatch/u);
});

test('legitimate exclusion and suspicious exclusion are separate false-positive cases', () => {
  const legitimate = readFixture('06-security-audit-legitimate-out-of-scope.md');
  const suspicious = readFixture('07-security-audit-hidden-exclusion-defer.md');

  assert.match(
    legitimate,
    /Do not report a coverage gap merely because the unit is `out_of_scope`/u
  );
  assert.match(suspicious, /conflict with repository-wide scope and reconnaissance evidence/u);
  assert.match(
    suspicious,
    /Do not convert these coverage states directly into vulnerability findings/u
  );
});

test('zero-findings fixtures distinguish safety overclaim from neutral source-only reporting', () => {
  const overclaim = readFixture('08-security-audit-zero-findings-safe-overclaim.md');
  const neutral = readFixture('09-security-audit-zero-findings-neutral.md');

  assert.match(overclaim, /Therefore this subsystem is secure and has no vulnerabilities/u);
  assert.match(overclaim, /Report a safety-overclaim residual/u);
  assert.match(neutral, /does not establish the absence of vulnerabilities/u);
  assert.match(neutral, /Do not report a safety-overclaim residual/u);
});
