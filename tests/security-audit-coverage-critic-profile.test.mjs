import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const unknownCoverageSkill = readFileSync(
  new URL('../skills/agent-skills/unknown-coverage-review/SKILL.md', import.meta.url),
  'utf8'
);
const securityAuditProfile = readFileSync(
  new URL(
    '../skills/agent-skills/unknown-coverage-review/references/SECURITY-AUDIT-PROFILE.md',
    import.meta.url
  ),
  'utf8'
);
const securityAuditSkill = readFileSync(
  new URL('../skills/agent-skills/river-review-security-audit/SKILL.md', import.meta.url),
  'utf8'
);

const sectionPattern = (label) => new RegExp(`## ${label}\\s*(?:-|—)\\s*`);

describe('unknown-coverage-review security-audit profile contract', () => {
  it('keeps generic and security-audit execution profiles explicit', () => {
    assert.match(unknownCoverageSkill, /### `generic`/);
    assert.match(unknownCoverageSkill, /### `security-audit`/);
    assert.match(
      unknownCoverageSkill,
      /Do not infer this profile from security-looking files or keywords\./
    );
  });

  it('preserves the generic diff requirement instead of broadening normal PR routing', () => {
    assert.match(unknownCoverageSkill, sectionPattern('Pre-execution Gate'));
    assert.match(unknownCoverageSkill, /generic profile/);
    assert.match(unknownCoverageSkill, /入力に少なくとも `diff` があり/);
    assert.match(
      unknownCoverageSkill,
      /Do not relax the `generic` profile's diff requirement to make Security Audit work\./
    );
  });

  it('allows diff-less review only inside the explicit security-audit profile', () => {
    assert.match(unknownCoverageSkill, /security-audit profile/);
    assert.match(unknownCoverageSkill, /A current diff is not required for this profile\./);
    assert.match(
      unknownCoverageSkill,
      /That exception is profile-local and must not alter generic routing or generic pre-execution behavior\./
    );
    assert.match(securityAuditProfile, /A current diff is \*\*not\*\* required for this profile\./);
  });

  it('keeps deterministic Phase 3 validation outside the critic responsibility', () => {
    for (const phrase of [
      'taxonomy version mismatch',
      'unknown attack-class IDs',
      'duplicate unit IDs',
      'derived counter mismatch',
      '`openUnitIds` summary mismatch',
    ]) {
      assert.ok(securityAuditProfile.includes(phrase), `missing deterministic boundary: ${phrase}`);
    }
    assert.match(securityAuditProfile, /Do not duplicate these checks:/);
  });

  it('pins the four semantic evidence-sufficiency checks', () => {
    for (const label of ['Check 1', 'Check 2', 'Check 3', 'Check 4']) {
      assert.match(securityAuditProfile, sectionPattern(label));
    }
    assert.match(securityAuditProfile, /Missing applicable semantic surface/);
    assert.match(securityAuditProfile, /Unsupported `covered` claim/);
    assert.match(securityAuditProfile, /Hidden exclusion \/ block \/ defer risk/);
    assert.match(securityAuditProfile, /Safety overclaim/);
  });

  it('does not turn every attack class into a mechanical checklist', () => {
    assert.match(securityAuditProfile, /do not mechanically require every attack class/);
    assert.match(
      securityAuditProfile,
      /attack-class applicability is supported by reconnaissance evidence/
    );
  });

  it('distinguishes a zero-findings safety claim from a neutral source-only report', () => {
    assert.match(securityAuditProfile, /zero findings plus `safe` conclusion/);
    assert.match(securityAuditProfile, /safety-overclaim residual/);
    assert.match(securityAuditProfile, /zero findings plus neutral source-only conclusion/);
    assert.match(securityAuditProfile, /zero findings without a safety claim is not a problem/);
  });

  it('wires the explicit audit flow without changing deterministic Gate behavior', () => {
    assert.match(securityAuditSkill, /unknown-coverage-review \(security-audit profile\)/);
    assert.match(
      securityAuditSkill,
      /Do not wire critic output into deterministic Gate behavior in Phase 4\./
    );
    assert.match(securityAuditSkill, /No automatic Gate behavior change\./);
  });

  it('keeps the security audit source-only and avoids critic-pass safety inference', () => {
    assert.match(securityAuditSkill, /Version 0\.4\.0 is source-only\./);
    assert.match(securityAuditSkill, /No critic `pass == safe` inference\./);
    assert.match(securityAuditSkill, /No target-controlled execution/);
  });
});
