import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const registryUrl = new URL(
  '../skills/agent-skills/river-review-security-audit/references/attack-classes.json',
  import.meta.url,
);
const schemaUrl = new URL('../schemas/security-attack-class-registry.schema.json', import.meta.url);

const registry = JSON.parse(readFileSync(registryUrl, 'utf8'));
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'));

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
