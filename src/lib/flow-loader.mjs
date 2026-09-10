// Flow loader (#2054 PR-3, Epic #2011 Phase 2).
//
// The ONLY runtime module that reads `flows/`. #2016 pinned observe mode as
// "nothing under src/ or runners/ loads the Flow definitions"; this module is
// the explicit, single exception that tests/flow-definitions.test.mjs now
// names (`offenders` must equal exactly `['src/lib/flow-loader.mjs']`). Every
// other module that needs a Flow, an entry or an Intent asks this loader, so
// the observe-mode scan keeps rejecting a second reader.
//
// What this module does:
//   - resolves where the Flow assets live (`RIVER_FLOWS_DIR`, an explicit
//     argument, or the repository's `flows/` next to this package);
//   - reads `entry-map.json`, every `*.flow.json` and every
//     `intents/*.intent.json`, and validates each against the schema that
//     already owns it (schemas/flow-entry-map.schema.json, schemas/flow.schema.json,
//     schemas/review-intent.schema.json) with the same Ajv 2020 setup the
//     repository's other runtime validators use (src/lib/agent-skill-bridge.mjs);
//   - resolves one entry name to its Flow pin through `deriveFlowPin`
//     (src/lib/execution-manifest.mjs), never by hashing on its own.
//
// What this module does NOT do (ADR-009 D3, RA-1..RA-4): it holds no
// judgment. No severity, no gate, no skill selection, no threshold. An entry
// name goes in; a pin and the evidence the Flow declares as required come
// out. A missing directory or an invalid document is a loud `FlowLoaderError`,
// never a silent fall-back to "no Flow" — a runtime that cannot find its
// Flows must say so.
//
// Where the assets come from (#2054 PR-5, #2105 (b)): the explicit argument,
// then `RIVER_FLOWS_DIR`, then the copy shipped NEXT TO THIS MODULE (the
// GitHub Action dist bundles `flows/` and the three schemas as sibling
// directories of the bundle, see scripts/normalize-dist.mjs), then the
// repository's own `flows/` two levels up (the source / npm layout). The
// schemas follow the same sibling-first rule. `RIVER_FLOWS_DIR` remains the
// override for an npm-installed CLI that keeps `flows/` elsewhere.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { deriveFlowPin } from './execution-manifest.mjs';
import { nonEmptyNfcString as nonEmptyString } from './promotion-candidates.mjs';

/** Environment variable that overrides where the Flow assets are read from. */
export const FLOWS_DIR_ENV = 'RIVER_FLOWS_DIR';

/** File name of the entry map inside the flows directory. */
export const ENTRY_MAP_FILENAME = 'entry-map.json';

const FLOW_SUFFIX = '.flow.json';
const INTENT_SUFFIX = '.intent.json';
const INTENTS_SUBDIR = 'intents';

// The directory this module runs from. Deliberately NOT
// `new URL('.', import.meta.url)`: ncc rewrites that expression into an asset
// reference (`__nccwpck_require__(<id>)`) whose path does not exist at runtime
// in the GitHub Action dist (#1900 / #2111 / #2105). A bare `import.meta.url`
// is left alone by the bundler and points at the bundle file itself, so in the
// dist this is `runners/github-action/dist/` and in the source tree `src/lib/`.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, '..', '..');

// Names are assembled at runtime so ncc's asset relocator (which statically
// evaluates `resolve(x, '<literal>')`) never turns the directory into an asset
// reference — same reason as PACKAGE_JSON_FILE in execution-manifest-producer.mjs.
const FLOWS_DIRNAME = ['flo', 'ws'].join('');
const SCHEMAS_DIRNAME = ['sche', 'mas'].join('');

/** The schema file names this loader validates against, in compile order. */
export const FLOW_SCHEMA_FILENAMES = Object.freeze({
  entryMap: 'flow-entry-map.schema.json',
  flow: 'flow.schema.json',
  intent: 'review-intent.schema.json',
});

/**
 * Pick the first candidate directory that holds `marker`, else the last one.
 * The bundled copy (a sibling of this module) wins over the repository's own
 * directory, so the GitHub Action dist reads what it ships rather than what
 * happens to sit two levels above `runners/github-action/dist/`.
 */
function firstExisting(candidates, marker) {
  for (const dir of candidates) {
    if (existsSync(join(dir, marker))) return dir;
  }
  return candidates[candidates.length - 1];
}

/**
 * The `flows/` directory shipped with this package, used when nothing
 * overrides it: the sibling copy in the Action dist when present, else the
 * repository's own `flows/`.
 */
export const DEFAULT_FLOWS_DIR = firstExisting(
  [join(MODULE_DIR, FLOWS_DIRNAME), resolve(PACKAGE_ROOT, FLOWS_DIRNAME)],
  ENTRY_MAP_FILENAME
);

/** Same sibling-first rule for the schemas the loader validates against. */
export const SCHEMAS_DIR = firstExisting(
  [join(MODULE_DIR, SCHEMAS_DIRNAME), resolve(PACKAGE_ROOT, SCHEMAS_DIRNAME)],
  FLOW_SCHEMA_FILENAMES.entryMap
);

export class FlowLoaderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'FlowLoaderError';
  }
}

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const isPlainObject = (value) =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * Where the Flow assets are read from, in precedence order: the explicit
 * argument, then `RIVER_FLOWS_DIR`, then the repository's `flows/`.
 *
 * @param {object} [options]
 * @param {string|null} [options.flowsDir]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {string} absolute path
 */
export function resolveFlowsDir({ flowsDir = null, env = process.env } = {}) {
  const explicit = nonEmptyString(flowsDir);
  if (explicit != null) return resolve(explicit);
  const fromEnv = nonEmptyString(env?.[FLOWS_DIR_ENV]);
  if (fromEnv != null) return resolve(fromEnv);
  return DEFAULT_FLOWS_DIR;
}

let compiledValidators = null;

/**
 * Compile the three schemas once per process. Same Ajv 2020 options as the
 * test-side factory (tests/helpers/schema-validator.mjs): `allErrors` on and
 * strict mode left at its default, so a typo in a shipped document surfaces.
 */
function validators() {
  if (compiledValidators) return compiledValidators;
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const compile = (fileName) => {
    let schema;
    try {
      schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, fileName), 'utf8'));
    } catch (error) {
      throw new FlowLoaderError(
        `cannot read schema ${fileName} from ${SCHEMAS_DIR}: ${error?.message ?? error}`,
        { cause: error }
      );
    }
    return ajv.compile(schema);
  };
  compiledValidators = {
    entryMap: compile(FLOW_SCHEMA_FILENAMES.entryMap),
    flow: compile(FLOW_SCHEMA_FILENAMES.flow),
    intent: compile(FLOW_SCHEMA_FILENAMES.intent),
  };
  return compiledValidators;
}

const formatAjvErrors = (errors) =>
  (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

function readJsonFile(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new FlowLoaderError(`cannot read ${label} at ${path}: ${error?.message ?? error}`, {
      cause: error,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new FlowLoaderError(`${label} at ${path} is not valid JSON: ${error?.message ?? error}`, {
      cause: error,
    });
  }
}

function validateDocument(validate, document, label, path) {
  if (!validate(document)) {
    throw new FlowLoaderError(
      `${label} at ${path} does not satisfy its schema: ${formatAjvErrors(validate.errors)}`
    );
  }
}

function listFiles(dir, suffix, label) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    throw new FlowLoaderError(`cannot list ${label} in ${dir}: ${error?.message ?? error}`, {
      cause: error,
    });
  }
  return names.filter((name) => name.endsWith(suffix)).sort(compareStrings);
}

/**
 * Read and validate every Flow asset.
 *
 * @param {object} [options]
 * @param {string|null} [options.flowsDir] overrides `RIVER_FLOWS_DIR` and the default
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {{
 *   flowsDir: string,
 *   registry: object,
 *   flowDocuments: object[],
 *   intents: object[],
 * }}
 *   `registry` is the parsed entry map (`entries` + `triggers`), the shape
 *   `resolveTrigger` (src/lib/trigger-resolver.mjs) takes as `registry`;
 *   `flowDocuments` is what it takes as `flowDocuments`, sorted by file name.
 * @throws {FlowLoaderError} when the directory is missing, a document cannot
 *   be read, or a document fails its schema. Never returns a partial result.
 */
export function loadFlowRegistry({ flowsDir = null, env = process.env } = {}) {
  const dir = resolveFlowsDir({ flowsDir, env });
  let stat;
  try {
    stat = statSync(dir);
  } catch (error) {
    throw new FlowLoaderError(
      `flows directory not found: ${dir}. ` +
        `The package ships flows/ next to its schemas (the GitHub Action dist bundles both); ` +
        `${FLOWS_DIR_ENV} may point at a directory that holds ${ENTRY_MAP_FILENAME} ` +
        `when flows/ is kept elsewhere.`,
      { cause: error }
    );
  }
  if (!stat.isDirectory()) {
    throw new FlowLoaderError(`flows path is not a directory: ${dir}`);
  }
  const { entryMap, flow, intent } = validators();

  const entryMapPath = join(dir, ENTRY_MAP_FILENAME);
  const registry = readJsonFile(entryMapPath, 'entry map');
  validateDocument(entryMap, registry, 'entry map', entryMapPath);

  const flowDocuments = listFiles(dir, FLOW_SUFFIX, 'Flow documents').map((name) => {
    const path = join(dir, name);
    const document = readJsonFile(path, 'Flow document');
    validateDocument(flow, document, 'Flow document', path);
    return document;
  });

  const intentsDir = join(dir, INTENTS_SUBDIR);
  const intents = listFiles(intentsDir, INTENT_SUFFIX, 'Review Intents').map((name) => {
    const path = join(intentsDir, name);
    const document = readJsonFile(path, 'Review Intent');
    validateDocument(intent, document, 'Review Intent', path);
    return document;
  });

  return { flowsDir: dir, registry, flowDocuments, intents };
}

/**
 * The entry names a caller may pass to `--entry`, sorted.
 *
 * @param {Parameters<typeof loadFlowRegistry>[0]} [options]
 * @returns {string[]}
 */
export function listFlowEntryNames(options) {
  const { registry } = loadFlowRegistry(options);
  return Object.keys(registry.entries).sort(compareStrings);
}

/**
 * The input names a Flow document declares as `required: true`, sorted and
 * de-duplicated. The same reading `resolveTrigger` applies to a selected
 * entry's Flow; tests/flow-loader.test.mjs cross-checks the two.
 *
 * @param {object} document
 * @returns {string[]}
 */
export function requiredInputNames(document) {
  const names = new Set();
  for (const input of Array.isArray(document?.inputs) ? document.inputs : []) {
    const name = nonEmptyString(input?.name);
    if (input?.required === true && name != null) names.add(name);
  }
  return [...names].sort(compareStrings);
}

/**
 * Resolve one entry name to its pinned Flow.
 *
 * @param {string} entryName a key of the entry map's `entries`
 * @param {Parameters<typeof loadFlowRegistry>[0]} [options]
 * @returns {{
 *   flow: { entry: string, id: string, version: string, sha256: string },
 *   evidenceRequirements: string[],
 *   document: object,
 *   intent: object|null,
 * }}
 *   `flow` has the shape of one `flowPins[]` element of `resolveTrigger`;
 *   `evidenceRequirements` is the Flow's own required inputs (an entry named
 *   directly has no trigger to add to them).
 * @throws {FlowLoaderError} for an unknown entry (the message lists the
 *   accepted names), a Flow the entry points at that is not shipped, or a
 *   version mismatch between the entry and the document.
 */
export function resolveFlowEntry(entryName, options) {
  const { registry, flowDocuments, intents } = loadFlowRegistry(options);
  const name = nonEmptyString(entryName);
  const known = Object.keys(registry.entries).sort(compareStrings);
  if (name == null || !Object.hasOwn(registry.entries, name)) {
    throw new FlowLoaderError(`unknown entry "${entryName ?? ''}" (known: ${known.join(', ')}).`);
  }
  const entry = registry.entries[name];
  const flowId = nonEmptyString(entry?.flow);
  if (!isPlainObject(entry) || flowId == null) {
    throw new FlowLoaderError(`entry "${name}" names no flow.`);
  }
  const document = flowDocuments.find((candidate) => candidate?.id === flowId) ?? null;
  if (document == null) {
    throw new FlowLoaderError(
      `entry "${name}" resolves to flow "${flowId}", which is not among the shipped Flow documents.`
    );
  }
  let pin;
  try {
    pin = deriveFlowPin(document, { expectedVersion: entry.flowVersion ?? null });
  } catch (error) {
    throw new FlowLoaderError(`entry "${name}" cannot be pinned: ${error?.message ?? error}`, {
      cause: error,
    });
  }
  const purpose = nonEmptyString(document?.intent?.purpose);
  const intent =
    purpose == null ? null : (intents.find((candidate) => candidate?.purpose === purpose) ?? null);
  return {
    flow: { entry: name, ...pin },
    evidenceRequirements: requiredInputNames(document),
    document,
    intent,
  };
}
