// tests/helpers/schema-validator.mjs
//
// Shared Ajv 2020 validator factory for test suites. Compiling a schema
// is non-trivial, so call these once at module scope and reuse the
// compiled validator across tests rather than recompiling per test.
//
// `ajvOptions` is intentionally per-validator: the review-artifact suite
// runs with `strict: false`, while the suppression / riverbed-index
// suites keep Ajv strict mode on so future schema typos surface. The
// named compile* helpers below pin the options each suite expects.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMAS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

const readSchema = (fileName) => JSON.parse(readFileSync(resolve(SCHEMAS_DIR, fileName), 'utf8'));

/**
 * Compile a JSON schema into an Ajv validator.
 * @param {object} schema
 * @param {object} [opts]
 * @param {object} [opts.ajvOptions] Ajv 2020 constructor options.
 * @param {Array<{schema: object, id: string}>} [opts.refs] Referenced
 *   schemas to register via ajv.addSchema before compiling (for $ref).
 * @returns {import('ajv').ValidateFunction}
 */
export function compileSchema(
  schema,
  { ajvOptions = { allErrors: true, strict: false }, refs = [] } = {}
) {
  const ajv = new Ajv2020(ajvOptions);
  addFormats(ajv);
  for (const ref of refs) ajv.addSchema(ref.schema, ref.id);
  return ajv.compile(schema);
}

/**
 * Load and compile a schema file from schemas/.
 * @param {string} fileName e.g. "review-artifact.schema.json"
 * @param {Parameters<typeof compileSchema>[1]} [opts]
 */
export function compileSchemaFile(fileName, opts) {
  return compileSchema(readSchema(fileName), opts);
}

/** Compiled validator for schemas/review-artifact.schema.json (strict: false). */
export function compileReviewArtifactValidator() {
  return compileSchemaFile('review-artifact.schema.json');
}

/** Compiled validator for schemas/suppression-context.schema.json (strict on). */
export function compileSuppressionContextValidator() {
  return compileSchemaFile('suppression-context.schema.json', { ajvOptions: { allErrors: true } });
}

/** Compiled validator for schemas/flow.schema.json (strict on). */
export function compileFlowValidator() {
  return compileSchemaFile('flow.schema.json', { ajvOptions: { allErrors: true } });
}

/**
 * Compiled validator for schemas/riverbed-index.schema.json (strict on).
 * The index schema references riverbed-entry.schema.json via a relative
 * $ref resolved against the index schema's $id, so the entry schema is
 * registered under that resolved URL before compiling.
 */
export function compileRiverbedIndexValidator() {
  const indexSchema = readSchema('riverbed-index.schema.json');
  const entrySchema = readSchema('riverbed-entry.schema.json');
  const entryRefId = new URL('./riverbed-entry.schema.json', indexSchema.$id).toString();
  return compileSchema(indexSchema, {
    ajvOptions: { allErrors: true },
    refs: [{ schema: entrySchema, id: entryRefId }],
  });
}

/** Compiled validator for schemas/review-intent.schema.json (strict on). */
export function compileReviewIntentValidator() {
  return compileSchemaFile('review-intent.schema.json', { ajvOptions: { allErrors: true } });
}

/** Compiled validator for schemas/flow-entry-map.schema.json (strict on). */
export function compileFlowEntryMapValidator() {
  return compileSchemaFile('flow-entry-map.schema.json', { ajvOptions: { allErrors: true } });
}

/** Compiled validator for schemas/agent-contract.schema.json (strict on). */
export function compileAgentContractValidator() {
  return compileSchemaFile('agent-contract.schema.json', { ajvOptions: { allErrors: true } });
}

/** Compiled validator for schemas/agent-adapter-map.schema.json (strict on). */
export function compileAgentAdapterMapValidator() {
  return compileSchemaFile('agent-adapter-map.schema.json', { ajvOptions: { allErrors: true } });
}

/** Compiled validator for schemas/completion-assessment.schema.json (strict on). */
export function compileCompletionAssessmentValidator() {
  return compileSchemaFile('completion-assessment.schema.json', {
    ajvOptions: { allErrors: true },
  });
}
