import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ReviewViewpointsError, loadReviewViewpoints } from '../src/lib/review-viewpoints.mjs';
import { compileSchemaFile } from './helpers/schema-validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiCompatibilityViewpointsPath = path.join(
  repoRoot,
  'skills',
  'midstream',
  'api-compatibility',
  'references',
  'viewpoints.yaml'
);

const validateViewpoints = compileSchemaFile('review-viewpoints.schema.json', {
  ajvOptions: { allErrors: true },
});

function makeValidDocument() {
  return {
    version: 1,
    skillId: 'example-skill',
    viewpoints: [
      {
        id: 'backward-compatibility',
        title: 'Backward compatibility',
        activatesOn: ['api-contract-changed'],
        question: 'Is backward compatibility preserved?',
        requiredEvidence: ['changed-contract', 'affected-consumers'],
        evidenceHints: ['contract-test'],
        falsePositiveGuards: ['new-endpoint-only'],
      },
    ],
  };
}

async function withTempViewpoints(content, fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'river-review-viewpoints-'));
  const filePath = path.join(dir, 'viewpoints.yaml');
  await writeFile(filePath, content, 'utf8');
  try {
    return await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('review-viewpoints schema', () => {
  test('accepts data-only review knowledge', () => {
    const document = makeValidDocument();
    assert.equal(validateViewpoints(document), true, JSON.stringify(validateViewpoints.errors));
  });

  test('rejects routing, policy, evaluator, and executable fields', () => {
    for (const [field, value] of [
      ['phase', 'midstream'],
      ['applyTo', ['src/**']],
      ['evaluator', 'agentic'],
      ['onUnknown', 'escalate'],
      ['command', 'true'],
    ]) {
      const document = { ...makeValidDocument(), [field]: value };
      assert.equal(validateViewpoints(document), false, `${field} must be rejected`);
    }
  });

  test('rejects executable fields inside a viewpoint', () => {
    const document = makeValidDocument();
    document.viewpoints[0].command = 'node script.mjs';
    assert.equal(validateViewpoints(document), false);
  });

  test('requires evidence and activation signals', () => {
    const noEvidence = makeValidDocument();
    noEvidence.viewpoints[0].requiredEvidence = [];
    assert.equal(validateViewpoints(noEvidence), false);

    const noSignals = makeValidDocument();
    noSignals.viewpoints[0].activatesOn = [];
    assert.equal(validateViewpoints(noSignals), false);
  });
});

describe('review-viewpoints loader', () => {
  test('loads the built-in api-compatibility knowledge', async () => {
    const document = await loadReviewViewpoints(apiCompatibilityViewpointsPath, {
      expectedSkillId: 'api-compatibility',
    });

    assert.equal(document.version, 1);
    assert.equal(document.skillId, 'api-compatibility');
    assert.deepEqual(
      document.viewpoints.map((viewpoint) => viewpoint.id),
      ['backward-compatibility', 'api-test-coverage', 'optional-field-consumer-handling']
    );
  });

  test('requires the selected Skill id before reading knowledge', async () => {
    await assert.rejects(
      () => loadReviewViewpoints(apiCompatibilityViewpointsPath),
      (error) =>
        error instanceof ReviewViewpointsError &&
        error.message.includes('expectedSkillId is required')
    );
  });

  test('rejects invalid YAML before schema validation', async () => {
    await withTempViewpoints('version: [\n', async (filePath) => {
      await assert.rejects(
        () => loadReviewViewpoints(filePath, { expectedSkillId: 'example-skill' }),
        (error) =>
          error instanceof ReviewViewpointsError &&
          error.message.includes('Failed to parse review viewpoints YAML')
      );
    });
  });

  test('rejects schema-invalid policy or executable fields', async () => {
    const yaml = `version: 1\nskillId: example-skill\nonUnknown: escalate\nviewpoints:\n  - id: example\n    title: Example\n    activatesOn: [signal-one]\n    question: Example question\n    requiredEvidence: [evidence-one]\n`;

    await withTempViewpoints(yaml, async (filePath) => {
      await assert.rejects(
        () => loadReviewViewpoints(filePath, { expectedSkillId: 'example-skill' }),
        (error) =>
          error instanceof ReviewViewpointsError &&
          error.message.includes('Invalid review viewpoints')
      );
    });
  });

  test('rejects duplicate viewpoint ids even when the JSON schema shape is valid', async () => {
    const yaml = `version: 1\nskillId: example-skill\nviewpoints:\n  - id: duplicate\n    title: First\n    activatesOn: [signal-one]\n    question: First question\n    requiredEvidence: [evidence-one]\n  - id: duplicate\n    title: Second\n    activatesOn: [signal-two]\n    question: Second question\n    requiredEvidence: [evidence-two]\n`;

    await withTempViewpoints(yaml, async (filePath) => {
      await assert.rejects(
        () => loadReviewViewpoints(filePath, { expectedSkillId: 'example-skill' }),
        (error) =>
          error instanceof ReviewViewpointsError &&
          error.message.includes('Duplicate review viewpoint id(s)') &&
          error.details?.duplicateIds?.includes('duplicate')
      );
    });
  });

  test('rejects knowledge owned by a different Skill', async () => {
    await assert.rejects(
      () =>
        loadReviewViewpoints(apiCompatibilityViewpointsPath, {
          expectedSkillId: 'different-skill',
        }),
      (error) =>
        error instanceof ReviewViewpointsError &&
        error.message.includes('skillId mismatch') &&
        error.details?.actualSkillId === 'api-compatibility'
    );
  });
});
