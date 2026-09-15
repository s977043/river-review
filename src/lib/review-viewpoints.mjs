import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

export const defaultReviewViewpointsSchemaPath = path.join(
  repoRoot,
  'schemas',
  'review-viewpoints.schema.json'
);

export class ReviewViewpointsError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ReviewViewpointsError';
    this.details = details;
  }
}

let defaultValidatorPromise;

function formatValidationErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
    .join('; ');
}

export async function loadReviewViewpointsSchema(
  schemaPath = defaultReviewViewpointsSchemaPath
) {
  let raw;
  try {
    raw = await fs.readFile(schemaPath, 'utf8');
  } catch (error) {
    throw new ReviewViewpointsError(`Failed to read review viewpoints schema: ${schemaPath}`, {
      cause: error,
      schemaPath,
    });
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ReviewViewpointsError(`Failed to parse review viewpoints schema: ${schemaPath}`, {
      cause: error,
      schemaPath,
    });
  }
}

export function createReviewViewpointsValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

async function getDefaultValidator() {
  defaultValidatorPromise ??= loadReviewViewpointsSchema().then(createReviewViewpointsValidator);
  return defaultValidatorPromise;
}

export function findDuplicateViewpointIds(viewpoints = []) {
  const seen = new Set();
  const duplicates = new Set();

  for (const viewpoint of viewpoints) {
    const id = viewpoint?.id;
    if (typeof id !== 'string') continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  return [...duplicates].sort();
}

/**
 * Load and validate the data-only viewpoints owned by a Skill.
 *
 * This loader intentionally does not perform Skill routing, evaluator selection,
 * policy decisions, gate derivation, or arbitrary command/expression execution.
 *
 * @param {string} viewpointsPath
 * @param {object} [options]
 * @param {string} [options.expectedSkillId] Optional owning Skill id assertion.
 * @param {import('ajv').ValidateFunction} [options.validator] Test/custom validator override.
 * @returns {Promise<object>}
 */
export async function loadReviewViewpoints(
  viewpointsPath,
  { expectedSkillId, validator } = {}
) {
  let raw;
  try {
    raw = await fs.readFile(viewpointsPath, 'utf8');
  } catch (error) {
    throw new ReviewViewpointsError(`Failed to read review viewpoints: ${viewpointsPath}`, {
      cause: error,
      viewpointsPath,
    });
  }

  let document;
  try {
    document = yaml.load(raw);
  } catch (error) {
    throw new ReviewViewpointsError(`Failed to parse review viewpoints YAML: ${viewpointsPath}`, {
      cause: error,
      viewpointsPath,
    });
  }

  const validate = validator ?? (await getDefaultValidator());
  if (!validate(document)) {
    throw new ReviewViewpointsError(
      `Invalid review viewpoints at ${viewpointsPath}: ${formatValidationErrors(validate.errors)}`,
      { errors: validate.errors ?? [], viewpointsPath }
    );
  }

  const duplicateIds = findDuplicateViewpointIds(document.viewpoints);
  if (duplicateIds.length > 0) {
    throw new ReviewViewpointsError(
      `Duplicate review viewpoint id(s) at ${viewpointsPath}: ${duplicateIds.join(', ')}`,
      { duplicateIds, viewpointsPath }
    );
  }

  if (expectedSkillId !== undefined && document.skillId !== expectedSkillId) {
    throw new ReviewViewpointsError(
      `Review viewpoints skillId mismatch at ${viewpointsPath}: expected ${expectedSkillId}, got ${document.skillId}`,
      { actualSkillId: document.skillId, expectedSkillId, viewpointsPath }
    );
  }

  return document;
}
