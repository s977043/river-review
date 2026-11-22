#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import matter from 'gray-matter';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

/**
 * @typedef {'upstream' | 'midstream' | 'downstream'} PhaseEnum
 * @typedef {PhaseEnum | PhaseEnum[]} Phase
 * @typedef {'info' | 'minor' | 'major' | 'critical'} Severity
 * @typedef {'diff' | 'fullFile' | 'tests' | 'adr' | 'commitMessage' | 'repoConfig' | 'reviewSelf' | 'reviewExternal' | 'findingsPool' | 'prDescription' | 'qaEvidence'} InputContext
 * @typedef {'findings' | 'summary' | 'actions' | 'tests' | 'metrics' | 'questions' | 'review-audit'} OutputKind
 * @typedef {'cheap' | 'balanced' | 'high-accuracy'} ModelHint
 * @typedef {'code_search' | 'test_runner' | 'adr_lookup' | 'repo_metadata' | 'coverage_report' | 'tracing' | `custom:${string}`} Dependency
 *
 * @typedef {Object} SkillMetadata
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Phase} phase
 * @property {string[]} applyTo
 * @property {string[]=} files
 * @property {string[]=} tags
 * @property {Severity=} severity
 * @property {InputContext[]=} inputContext
 * @property {OutputKind[]=} outputKind
 * @property {ModelHint=} modelHint
 * @property {Dependency[]=} dependencies
 * @property {{phase?: Phase, applyTo?: string[], files?: string[]}=} trigger
 * @property {number=} priority
 *
 * @typedef {Object} SkillDefinition
 * @property {SkillMetadata} metadata
 * @property {string} body
 * @property {string} path
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = process.env.RIVER_REPO_ROOT
  ? path.resolve(process.env.RIVER_REPO_ROOT)
  : path.resolve(__dirname, '..', '..');
const defaultSkillsDir = path.join(repoRoot, 'skills');
const defaultSchemaPath = path.join(repoRoot, 'schemas', 'skill.schema.json');
const markdownExtensions = new Set(['.md', '.mdx']);
const yamlExtensions = new Set(['.yaml', '.yml']);
const allowedExtensions = new Set([...markdownExtensions, ...yamlExtensions]);
const ignoredSkillDirNames = new Set([
  'references',
  'fixtures',
  'golden',
  'eval',
  'prompt',
  'prompts',
]);
const ignoredFileNames = new Set([
  '.gitkeep',
  'README.md',
  'registry.yaml',
  'registry.yml',
  '_template.md',
]);
const legacySkillFiles = new Set(['skill.yaml', 'skill.yml']);
const streamCategories = new Set(['core', 'upstream', 'midstream', 'downstream']);
const allPhases = ['upstream', 'midstream', 'downstream'];

export const defaultPaths = {
  repoRoot,
  skillsDir: defaultSkillsDir,
  schemaPath: defaultSchemaPath,
};

export class SkillLoaderError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'SkillLoaderError';
    this.details = details;
  }
}

export async function loadSchema(schemaPath = defaultSchemaPath) {
  const raw = await fs.readFile(schemaPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new SkillLoaderError(`Failed to parse JSON schema at ${schemaPath}: ${err.message}`);
  }
}

export function createSkillValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Read and parse skills/registry.yaml exactly once. This is the single
 * read+parse entry point for the registry document; every consumer that needs
 * `packs:` / `recommendations:` / `skills:` (loadPacks / loadRecommendationSets
 * here, plus scripts/validate-skills.mjs and scripts/generate-dashboard-data.js)
 * goes through it so the file is not re-read and re-parsed per section.
 *
 * Returns a discriminated result rather than throwing, so both tolerant callers
 * (loadPacks / loadRecommendationSets treat a missing file as an empty registry)
 * and strict callers (the validate-skills gates report read vs parse failures
 * with phase-specific wording) can share one implementation:
 * - `{ ok: true, parsed, registryPath }` — `parsed` is `{}` for a null document;
 * - `{ ok: false, phase: 'read' | 'parse', message, registryPath }` on failure
 *   (a zero-byte / comment-only file is a js-yaml parse error, as before).
 *
 * @param {{ skillsDir?: string }} [options]
 * @returns {Promise<{ ok: true, parsed: unknown, registryPath: string } | { ok: false, phase: 'read' | 'parse', message: string, registryPath: string }>}
 */
export async function loadRegistry({ skillsDir = defaultSkillsDir } = {}) {
  const registryPath = path.join(skillsDir, 'registry.yaml');
  let raw;
  try {
    raw = await fs.readFile(registryPath, 'utf8');
  } catch (err) {
    return { ok: false, phase: 'read', message: err.message, registryPath };
  }
  try {
    return { ok: true, parsed: yaml.load(raw) ?? {}, registryPath };
  } catch (err) {
    return { ok: false, phase: 'parse', message: err.message, registryPath };
  }
}

/**
 * Unwrap a {@link loadRegistry} result for the tolerant runtime consumers:
 * a read failure (typically a missing registry) resolves to an empty document,
 * while a parse failure throws the historical SkillLoaderError wording so
 * existing callers/tests observe the same error. Keeps the parse-error message
 * in a single place instead of duplicating it across loadPacks /
 * loadRecommendationSets.
 *
 * @param {Awaited<ReturnType<typeof loadRegistry>>} result
 * @returns {unknown} parsed registry document ({} when the file is absent)
 */
function unwrapRegistryOrEmpty(result) {
  if (result.ok) return result.parsed;
  if (result.phase === 'parse') {
    throw new SkillLoaderError(
      `Failed to parse skill registry at ${result.registryPath}: ${result.message}`
    );
  }
  return {};
}

/**
 * Project the `recommendations:` section out of a parsed registry document.
 * Pure; shared by {@link loadRecommendationSets} and the validate-skills gates
 * so both interpret the section identically.
 *
 * @param {unknown} parsed parsed registry document
 * @returns {Record<string, { description?: string, skills: string[] }>}
 */
export function selectRecommendationSets(parsed) {
  const recommendations = parsed?.recommendations;
  return recommendations && typeof recommendations === 'object' ? recommendations : {};
}

/**
 * Project the `packs:` section out of a parsed registry document, keeping only
 * well-formed entries (an object with a string `id`). Pure; shared by
 * {@link loadPacks} and the validate-skills gates.
 *
 * @param {unknown} parsed parsed registry document
 * @returns {Array<{ id: string, skills: string[] }>}
 */
export function selectPacks(parsed) {
  const packs = parsed?.packs;
  return Array.isArray(packs) ? packs.filter((p) => p && typeof p.id === 'string') : [];
}

/**
 * Read the named skill bundles declared under `recommendations:` in
 * skills/registry.yaml. These are maintainer-curated sets (basic, typescript,
 * comprehensive, ...) that `--skill-set <name>` exposes for selective runs.
 *
 * @param {{ skillsDir?: string }} [options]
 * @returns {Promise<Record<string, { description?: string, skills: string[] }>>}
 */
export async function loadRecommendationSets({ skillsDir = defaultSkillsDir } = {}) {
  return selectRecommendationSets(unwrapRegistryOrEmpty(await loadRegistry({ skillsDir })));
}

/**
 * Resolve a recommendation set name to its skill id list.
 *
 * @param {string} name
 * @param {{ skillsDir?: string }} [options]
 * @returns {Promise<string[]>} skill ids in the set
 * @throws {SkillLoaderError} when the name is not a known recommendation set
 */
export async function resolveRecommendationSet(name, { skillsDir = defaultSkillsDir } = {}) {
  const sets = await loadRecommendationSets({ skillsDir });
  const entry = sets[name];
  if (!entry || !Array.isArray(entry.skills)) {
    const available = Object.keys(sets).sort().join(', ') || '(none)';
    throw new SkillLoaderError(`Unknown skill set "${name}". Available sets: ${available}.`);
  }
  return entry.skills.filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * Read the pack manifests declared under `packs:` in skills/registry.yaml.
 * Packs are the distribution unit for bundled open review knowledge
 * (docs/development/skill-pack-design.md). Unlike `recommendations:` (an
 * object keyed by name), `packs:` is an array of entries with an `id` field.
 *
 * @param {{ skillsDir?: string }} [options]
 * @returns {Promise<Array<{ id: string, skills: string[] }>>}
 */
export async function loadPacks({ skillsDir = defaultSkillsDir } = {}) {
  return selectPacks(unwrapRegistryOrEmpty(await loadRegistry({ skillsDir })));
}

/**
 * Resolve one or more skill-set names (comma separated) to a deduplicated
 * skill id list. Resolution order per name: packs first, then
 * recommendations as a fallback. Multiple names are set-unioned so each
 * skill runs at most once (skill-pack-design.md §2 principle 1).
 *
 * During the packs/recommendations coexistence period a name present in
 * both resolves to the pack and emits a warning (same-id conflicts become
 * validate errors in Phase D).
 *
 * @param {string} names comma-separated pack/recommendation-set names
 * @param {{ skillsDir?: string, warn?: (msg: string) => void }} [options]
 * @returns {Promise<string[]>} deduplicated skill ids preserving first-seen order
 * @throws {SkillLoaderError} when a name matches neither a pack nor a recommendation set
 */
export async function resolveSkillSet(
  names,
  { skillsDir = defaultSkillsDir, warn = (msg) => console.warn(msg) } = {}
) {
  const requested = String(names ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (!requested.length) return [];
  const [packs, sets] = await Promise.all([
    loadPacks({ skillsDir }),
    loadRecommendationSets({ skillsDir }),
  ]);
  const resolved = [];
  for (const name of requested) {
    const pack = packs.find((p) => p.id === name);
    const recommendation = sets[name];
    if (pack && !Array.isArray(pack.skills)) {
      throw new SkillLoaderError(
        `Pack "${name}" is malformed: \`skills\` must be an array. Fix skills/registry.yaml.`
      );
    }
    if (pack) {
      if (recommendation) {
        warn(
          `⚠️  Skill set "${name}" exists as both a pack and a recommendation set; using the pack. ` +
            'Rename or remove the recommendation entry before Phase D, when this becomes an error.'
        );
      }
      resolved.push(...pack.skills);
      continue;
    }
    if (recommendation && Array.isArray(recommendation.skills)) {
      resolved.push(...recommendation.skills);
      continue;
    }
    const available =
      [...packs.map((p) => p.id), ...Object.keys(sets)].sort().join(', ') || '(none)';
    throw new SkillLoaderError(`Unknown skill set "${name}". Available sets: ${available}.`);
  }
  const seen = new Set();
  return resolved.filter((id) => {
    if (typeof id !== 'string' || !id.length || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function listSkillFiles(dir = defaultSkillsDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  const hasLegacySkillFile = entries.some(
    (entry) => !entry.isDirectory() && legacySkillFiles.has(entry.name)
  );
  if (hasLegacySkillFile) {
    const legacyEntry = entries.find(
      (entry) => !entry.isDirectory() && legacySkillFiles.has(entry.name)
    );
    if (!legacyEntry) {
      throw new Error(`skill.yaml detected but not found in ${dir}`);
    }
    files.push(path.join(dir, legacyEntry.name));
    return files.sort((a, b) => a.localeCompare(b));
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredSkillDirNames.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      const nested = await listSkillFiles(entryPath);
      files.push(...nested);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) continue;
    if (ignoredFileNames.has(entry.name)) continue;
    if (entry.name.startsWith('_')) continue;
    files.push(entryPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Recursively discover skill-package directories under `root`: directories that
 * directly contain a `SKILL.md`. Descent stops at the first `SKILL.md` found on
 * a branch, so a nested `SKILL.md` (e.g. under `fixtures/`) does not create a
 * second entry. This is the shared lower layer for the manifest generator's
 * `findSkillDirs` and the agent-skills validator's package discovery.
 *
 * Unlike {@link listSkillFiles}, the unit of discovery here is the SKILL.md
 * package directory, not individual skill definition files: it returns directory
 * paths and applies no extension or ignore-name filtering. Sibling directories
 * are explored concurrently via `Promise.all`, preserving the performance
 * profile of the original agent-skills validator implementation. Results are
 * unsorted so each caller can apply the sort its output contract requires —
 * sorting SKILL.md paths and sorting their parent directories are not
 * equivalent orderings when one sibling name is a prefix of another.
 *
 * Symlinks are followed: `Dirent.isFile()`/`isDirectory()` do NOT resolve
 * symlinks, so a `SKILL.md` reached through a symlink, or a package directory
 * that is itself a symlink, would be silently skipped. For a symlinked entry we
 * fall back to `fs.stat` (which follows the link target) to decide whether it is
 * a `SKILL.md` file or a directory to descend into — restoring the fs.stat-based
 * behavior of the former agent-skills validator. A broken symlink (stat throws)
 * resolves to neither and is ignored. Non-symlink entries keep the synchronous
 * `Dirent` fast path, so the performance profile is unchanged when no symlinks
 * are present.
 *
 * @param {string} root directory to scan
 * @param {{ includeRoot?: boolean }} [options] when false, `root` itself is not
 *   tested for a `SKILL.md`; scanning begins at its immediate child directories
 *   (the agent-skills validator's root is a container, never a package).
 * @returns {Promise<string[]>} SKILL.md-bearing directory paths, unsorted
 */
export async function listSkillPackageDirs(root, { includeRoot = true } = {}) {
  async function isFileEntry(entry, entryPath) {
    if (entry.isFile()) return true;
    if (entry.isSymbolicLink()) {
      try {
        return (await fs.stat(entryPath)).isFile();
      } catch {
        return false; // broken symlink
      }
    }
    return false;
  }
  async function walkChildren(dir, entries) {
    // Synchronous Dirent filter first: regular files never allocate a Promise.
    // Only symlinked survivors pay an fs.stat to resolve their target kind
    // (a broken or non-directory symlink descends into nothing).
    const groups = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map(async (entry) => {
          const entryPath = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) {
            let stats;
            try {
              stats = await fs.stat(entryPath);
            } catch {
              return []; // broken symlink
            }
            if (!stats.isDirectory()) return [];
          }
          return walk(entryPath);
        })
    );
    return groups.flat();
  }
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const skillMd = entries.find((entry) => entry.name === 'SKILL.md');
    if (skillMd && (await isFileEntry(skillMd, path.join(dir, 'SKILL.md')))) {
      return [dir]; // do not descend into nested skill dirs
    }
    return walkChildren(dir, entries);
  }
  if (includeRoot) {
    return walk(root);
  }
  return walkChildren(root, await fs.readdir(root, { withFileTypes: true }));
}

function normalizeStringArray(value) {
  if (!value) return undefined;
  const asArray = Array.isArray(value) ? value : [value];
  const filtered = asArray
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return filtered.length ? filtered : undefined;
}

function normalizePhaseValue(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const phases = value.filter(Boolean);
    if (phases.length === 1) return phases[0];
    return phases.length ? phases : undefined;
  }
  return value;
}

function inferCategoryFromPhase(phase) {
  if (!phase) return undefined;
  if (Array.isArray(phase)) {
    const unique = Array.from(new Set(phase));
    if (unique.length === 1 && streamCategories.has(unique[0])) {
      return unique[0];
    }
    if (unique.length > 1) {
      return 'core';
    }
    return undefined;
  }
  return streamCategories.has(phase) ? phase : undefined;
}

function inferCategoryFromPath(filePath) {
  if (!filePath) return undefined;
  const segments = path.normalize(filePath).split(path.sep);
  const skillsIndex = segments.lastIndexOf('skills');
  const candidate = skillsIndex >= 0 ? segments[skillsIndex + 1] : undefined;
  if (candidate && streamCategories.has(candidate)) {
    return candidate;
  }
  return undefined;
}

function resolveCategory(metaCategory, { phase, filePath } = {}) {
  if (typeof metaCategory === 'string' && streamCategories.has(metaCategory)) {
    return metaCategory;
  }
  return inferCategoryFromPath(filePath) ?? inferCategoryFromPhase(phase);
}

function resolvePhase(metaPhase, category) {
  if (category === 'core') {
    return [...allPhases];
  }
  // Explicit multi-phase array takes precedence over a stream category's implied
  // single phase. Allows a skill with category: upstream (organizational) to also
  // activate in midstream by declaring phase: [upstream, midstream].
  if (Array.isArray(metaPhase) && metaPhase.length > 1) {
    return normalizePhaseValue(metaPhase);
  }
  if (category && streamCategories.has(category)) {
    return category;
  }
  return normalizePhaseValue(metaPhase);
}

function normalizeMetadata(metadata, { filePath } = {}) {
  const meta = { ...metadata };

  if (meta.priority !== undefined) {
    const parsedPriority =
      typeof meta.priority === 'string' ? Number(meta.priority) : meta.priority;
    if (Number.isFinite(parsedPriority)) {
      meta.priority = parsedPriority;
    } else {
      delete meta.priority;
    }
  }

  const topLevelApplyTo =
    normalizeStringArray(meta.applyTo) ??
    normalizeStringArray(meta.files) ??
    normalizeStringArray(meta.path_patterns);
  if (topLevelApplyTo) {
    meta.applyTo = topLevelApplyTo;
  }

  const trigger =
    meta.trigger && typeof meta.trigger === 'object' && !Array.isArray(meta.trigger)
      ? meta.trigger
      : null;
  const triggerApplyTo =
    normalizeStringArray(trigger?.applyTo) ??
    normalizeStringArray(trigger?.files) ??
    normalizeStringArray(trigger?.path_patterns);

  if (!meta.phase && trigger?.phase) {
    meta.phase = trigger.phase;
  }
  if (!meta.applyTo && triggerApplyTo) {
    meta.applyTo = triggerApplyTo;
  }

  meta.category = resolveCategory(meta.category, { phase: meta.phase, filePath });
  meta.phase = resolvePhase(meta.phase, meta.category);

  // Trigger is consumed during normalization; avoid leaking nested state.
  if (trigger) {
    delete meta.trigger;
  }
  if ('path_patterns' in meta) {
    delete meta.path_patterns;
  }

  return meta;
}

export function parseFrontMatter(content, { filePath } = {}) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    throw new SkillLoaderError('Missing front matter block (---)');
  }

  let parsed;
  try {
    parsed = matter(trimmed);
  } catch (err) {
    throw new SkillLoaderError(
      `Front matter parse error${filePath ? ` (${filePath})` : ''}: ${err.message}`
    );
  }

  const metadata = parsed.data ?? {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new SkillLoaderError('Front matter must be a mapping');
  }
  if (Object.keys(metadata).length === 0) {
    throw new SkillLoaderError('Front matter is empty');
  }
  const normalized = normalizeMetadata(metadata, { filePath });
  const body = (parsed.content ?? '').trim();
  return { metadata: normalized, body };
}

export async function parseSkillFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new SkillLoaderError(`Unsupported skill file extension: ${ext}`);
  }
  const raw = await fs.readFile(filePath, 'utf8');
  if (markdownExtensions.has(ext)) {
    return parseFrontMatter(raw, { filePath });
  }

  // YAML handling
  let loaded = {};
  try {
    loaded = yaml.load(raw) ?? {};
  } catch (err) {
    throw new SkillLoaderError(`YAML parse error: ${err.message}`);
  }
  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new SkillLoaderError('Skill YAML must be a mapping');
  }

  let metadata = loaded;
  let body = '';

  // Support nested metadata block
  if (loaded.metadata && typeof loaded.metadata === 'object' && !Array.isArray(loaded.metadata)) {
    metadata = { ...loaded.metadata };
    if (typeof metadata.instruction === 'string') {
      body = metadata.instruction;
      delete metadata.instruction;
    } else if (typeof loaded.instruction === 'string') {
      body = loaded.instruction;
    }
  } else if (typeof loaded.instruction === 'string') {
    // Support flat structure with optional instruction field
    body = loaded.instruction;
    delete metadata.instruction;
  }

  metadata = normalizeMetadata(metadata, { filePath });
  return { metadata, body };
}

function validateMetadata(metadata, validate) {
  const metaCopy = JSON.parse(JSON.stringify(metadata ?? {}));
  const ok = validate(metaCopy);
  if (!ok) {
    const details = (validate.errors ?? [])
      .map((err) => `${err.instancePath || '/'} ${err.message}`)
      .join('; ');
    throw new SkillLoaderError(`Validation failed: ${details}`, validate.errors);
  }
  return metaCopy;
}

function relativeToRepo(filePath) {
  return filePath.startsWith(repoRoot) ? path.relative(repoRoot, filePath) : filePath;
}

function logSkillLoadError(filePath, err) {
  const location = relativeToRepo(filePath);
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`⚠️  Failed to load skill ${location}: ${reason}`);
  if (err?.details && Array.isArray(err.details)) {
    for (const detail of err.details) {
      const instance = detail.instancePath || '/';
      console.error(`   - ${instance}: ${detail.message}`);
    }
  }
}

function logDuplicateSkill(id, filePath, originalPath) {
  const location = relativeToRepo(filePath);
  const first = relativeToRepo(originalPath);
  console.warn(
    `⚠️  Duplicate skill id "${id}" in ${location}; already loaded from ${first}. Skipping.`
  );
}

function hasExcludedTag(metadata, excludedTags) {
  if (!excludedTags?.length) return false;
  const tags = metadata?.tags ?? [];
  return tags.some((tag) => excludedTags.includes(tag));
}

export async function loadSkillFile(filePath, options = {}) {
  const { validator, schemaPath = defaultSchemaPath } = options;
  const compiledValidator = validator ?? createSkillValidator(await loadSchema(schemaPath));
  const parsed = await parseSkillFile(filePath);
  const metadata = validateMetadata(parsed.metadata, compiledValidator);
  return {
    metadata,
    body: parsed.body,
    path: filePath,
  };
}

/**
 * Shared loader loop used by {@link loadSkills} and {@link loadAllSkillMetadata}.
 * Differs only in the per-file loader function (`loaderFn`), so the skill-discovery
 * semantics (schema validation, excluded tags, duplicate-id handling) stay in sync
 * across the two public entry points.
 *
 * @param {(filePath: string, options: { validator: Function }) => Promise<{ metadata: SkillMetadata, path: string }>} loaderFn
 * @param {object} options
 */
async function _loadFromDir(loaderFn, options = {}) {
  const {
    skillsDir = defaultSkillsDir,
    schemaPath = defaultSchemaPath,
    validator: providedValidator,
    excludedTags = ['agent'],
  } = options;
  const schema = providedValidator ? null : await loadSchema(schemaPath);
  const validator = providedValidator ?? createSkillValidator(schema);
  const files = await listSkillFiles(skillsDir);
  const skillsById = new Map();

  for (const filePath of files) {
    try {
      const skill = await loaderFn(filePath, { validator });
      const id = skill?.metadata?.id;
      if (!id) {
        logSkillLoadError(filePath, new SkillLoaderError('Missing id in skill metadata'));
        continue;
      }
      if (hasExcludedTag(skill.metadata, excludedTags)) {
        continue;
      }
      if (skillsById.has(id)) {
        logDuplicateSkill(id, filePath, skillsById.get(id).path);
        continue;
      }
      skillsById.set(id, skill);
    } catch (err) {
      logSkillLoadError(filePath, err);
    }
  }

  return Array.from(skillsById.values());
}

export async function loadSkills(options = {}) {
  return _loadFromDir(loadSkillFile, options);
}

/**
 * Load only skill metadata (Stage 1 of Progressive Disclosure).
 * Returns metadata and path without the body, suitable for filtering
 * and routing before full skill loading.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {Function} [options.validator]
 * @param {string} [options.schemaPath]
 * @returns {Promise<{metadata: SkillMetadata, path: string}>}
 */
export async function loadSkillMetadata(filePath, options = {}) {
  const { validator, schemaPath = defaultSchemaPath } = options;
  const compiledValidator = validator ?? createSkillValidator(await loadSchema(schemaPath));
  const parsed = await parseSkillFile(filePath);
  const metadata = validateMetadata(parsed.metadata, compiledValidator);
  return {
    metadata,
    path: filePath,
  };
}

/**
 * Load metadata for all skills (Stage 1 of Progressive Disclosure).
 * Returns an array of {metadata, path} objects without skill bodies.
 *
 * @param {object} [options]
 * @param {string} [options.skillsDir]
 * @param {string} [options.schemaPath]
 * @param {Function} [options.validator]
 * @param {string[]} [options.excludedTags]
 * @returns {Promise<Array<{metadata: SkillMetadata, path: string}>>}
 */
export async function loadAllSkillMetadata(options = {}) {
  return _loadFromDir(loadSkillMetadata, options);
}
