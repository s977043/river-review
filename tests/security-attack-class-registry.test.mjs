import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import matter from 'gray-matter';
import { globSync } from 'glob';
import { REVIEWER_ROLES } from '../src/lib/reviewer-orchestrator.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const registryUrl = new URL(
  '../skills/agent-skills/river-review-security-audit/references/attack-classes.json',
  import.meta.url,
);
const schemaUrl = new URL('../schemas/security-attack-class-registry.schema.json', import.meta.url);

const registry = JSON.parse(readFileSync(registryUrl, 'utf8'));
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'));
const skillIds = new Set(
  globSync('skills/**/SKILL.md', { cwd: repoRoot, absolute: true })
    .map((path) => matter(readFileSync(path, 'utf8')).data.id)
    .filter(Boolean),
);

const EXPECTED_EVIDENCE_FIELDS = [
  'principal',
  'inputOrAction',
  'control',
  'boundary',
  'affectedResourceOrPrincipal',
  'securityOutcome',
];

const EXPECTED_ATTACK_CLASS_IDS = [
  'injection',
  'authn-authz',
  'tenant-isolation',
  'data-lifecycle',
  'supply-chain',
  'cloud-deployment',
  'rpc-messaging',
  'resource-exhaustion',
  'browser-client',
  'ai-agent-security',
];

test('security attack class registry satisfies its schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  assert.equal(validate(registry), true, JSON.stringify(validate.errors, null, 2));
});

test('security attack class registry keeps the Phase 2 evidence contract stable', () => {
  assert.deepEqual(registry.evidenceContract.required, EXPECTED_EVIDENCE_FIELDS);
});

test('security attack class registry pins the initial Phase 2 taxonomy', () => {
  const ids = registry.classes.map(({ id }) => id);

  assert.equal(new Set(ids).size, ids.length, 'attack class ids must be unique');
  assert.deepEqual(ids, EXPECTED_ATTACK_CLASS_IDS);
});

test('security attack class registry references existing skills and reviewer roles', () => {
  for (const attackClass of registry.classes) {
    for (const skillId of attackClass.skillHints) {
      assert.ok(skillIds.has(skillId), `${attackClass.id} references unknown skill: ${skillId}`);
    }
    for (const reviewerId of attackClass.reviewerHints) {
      assert.ok(
        reviewerId in REVIEWER_ROLES,
        `${attackClass.id} references unknown reviewer role: ${reviewerId}`,
      );
    }
  }
});
