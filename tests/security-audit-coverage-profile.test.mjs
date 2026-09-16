import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSecurityAuditCoverageSemantics } from '../src/lib/security-audit-coverage.mjs';
import { compileSecurityAuditCoverageValidator } from './helpers/schema-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_DIR = resolve(ROOT, 'skills', 'agent-skills', 'unknown-coverage-review');
const AUDIT_REGISTRY_PATH = resolve(
  ROOT,
  'skills',
  'agent-skills',
  'river-review-security-audit',
  'references',
  'attack-classes.json'
);

const profileFixtureNames = [
  '04-security-audit-open-units.md',
  '05-security-audit-covered-zero-findings.md',
  '06-security-audit-missing-expected-unit.md',
  '07-security-audit-scope-universe-unknown.md',
];

const validateCoverage = compileSecurityAuditCoverageValidator();
const attackRegistry = JSON.parse(readFileSync(AUDIT_REGISTRY_PATH, 'utf8'));

function coverageFromFixture(name) {
  const fixture = readFileSync(resolve(PROFILE_DIR, 'fixtures', name), 'utf8');
  const match = fixture.match(/```json\n([\s\S]*?)\n```/u);
  assert.ok(match, `${name} must contain a JSON coverage fixture`);
  return JSON.parse(match[1]);
}

for (const fixtureName of profileFixtureNames) {
  test(`${fixtureName} carries schema-valid, semantically consistent coverage`, () => {
    const coverage = coverageFromFixture(fixtureName);

    assert.equal(
      validateCoverage(coverage),
      true,
      `${fixtureName}: ${JSON.stringify(validateCoverage.errors)}`
    );
    assert.deepEqual(validateSecurityAuditCoverageSemantics(coverage, attackRegistry), []);
  });
}

test('Security Audit profile keeps Gate integration and safety inference out of Phase 4', () => {
  const skill = readFileSync(resolve(PROFILE_DIR, 'SKILL.md'), 'utf8');
  const profile = readFileSync(resolve(PROFILE_DIR, 'references', 'SECURITY-AUDIT-PROFILE.md'), 'utf8');

  assert.match(skill, /Security Audit profile Gate override/u);
  assert.match(profile, /Gate override for this profile/u);
  assert.match(profile, /Gate integration is reserved for #2267 Phase 12/u);
  assert.match(profile, /do not manufacture missing units from the attack-class registry alone/u);
  assert.match(profile, /coveredUnits === applicableUnits/u);
  assert.match(profile, /zero candidate or established findings/u);
});
