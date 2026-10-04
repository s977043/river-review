#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseFrontMatter,
  listSkillPackageDirs,
  loadSchema,
  loadSkillMetadata,
  createSkillValidator,
  defaultPaths,
} from '../runners/core/skill-loader.mjs';
import { isDirectRun } from './lib/is-direct-run.mjs';
import {
  extractRoutingTargetIds,
  expandApplyTo,
  analyzeCoverage,
} from './lib/applyto-coverage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const agentSkillsDir = path.join(repoRoot, 'skills', 'agent-skills');

function isKebabCaseName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

// ---------------------------------------------------------------------------
// Naming rules (SSoT: skills/README.md § "Naming"; issue #1463 PR-3).
// The semantic Q0–Q5 import framework stays with human PR review; only the
// deterministic parts are mechanized here (repo principle #1070).
// ---------------------------------------------------------------------------

// Organizational nouns forbidden as a hyphen-delimited word in a skill name
// (skills/README.md § "Common prohibitions and consistency"). Warning-level:
// this is advisory to avoid false positives, and existing names are
// grandfathered via PROHIBITED_NOUN_EXEMPT.
export const PROHIBITED_NAME_NOUNS = ['team', 'manager', 'helper', 'util'];

// Grandfathered names exempt from the prohibited-noun warning
// (skills/README.md § "Grandfathered names").
export const PROHIBITED_NOUN_EXEMPT = new Set(['setup-team', 'review-team']);

// Anthropic-derived hard constraints (skills/README.md § "Anthropic-derived
// constraints"): max name length and reserved words. Error-level.
export const NAME_MAX_LENGTH = 64;
export const RESERVED_NAME_WORDS = ['anthropic', 'claude'];

/**
 * Advisory entrypoint context budget for Agent Skills. These are deliberately
 * warning-only: size is a review signal, not a correctness gate (#2372, #2483).
 */
export const AGENT_SKILL_CONTEXT_WARN_BYTES = 12 * 1024;
export const AGENT_SKILL_CONTEXT_WARN_LINES = 250;

/**
 * Measure deterministic entrypoint context health without pretending bytes are
 * tokens. The caller decides how to report the advisory; this helper never
 * changes validation pass/fail semantics.
 *
 * @param {unknown} content
 * @returns {{
 *   bytes: number,
 *   lines: number,
 *   exceedsBytes: boolean,
 *   exceedsLines: boolean,
 *   shouldWarn: boolean
 * }}
 */
export function assessAgentSkillContextHealth(content) {
  const text = String(content ?? '');
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  const exceedsBytes = bytes > AGENT_SKILL_CONTEXT_WARN_BYTES;
  const exceedsLines = lines > AGENT_SKILL_CONTEXT_WARN_LINES;
  return {
    bytes,
    lines,
    exceedsBytes,
    exceedsLines,
    shouldWarn: exceedsBytes || exceedsLines,
  };
}

/**
 * Return the prohibited organizational noun used as a hyphen-delimited word in
 * `name`, or null. Case-insensitive so an uppercase variant (e.g. `Foo-Team`)
 * cannot slip past the check (gemini review on PR #1468).
 */
export function findProhibitedNoun(name) {
  const words = String(name ?? '')
    .toLowerCase()
    .split('-');
  return PROHIBITED_NAME_NOUNS.find((noun) => words.includes(noun)) ?? null;
}

/**
 * True when `name` is on the grandfathered exemption list, compared
 * case-insensitively for robustness (gemini review on PR #1468).
 */
export function isProhibitedNounExempt(name) {
  return PROHIBITED_NOUN_EXEMPT.has(String(name ?? '').toLowerCase());
}

/** Return the reserved word contained in `name` (case-insensitive), or null. */
export function findReservedWord(name) {
  const lower = String(name ?? '').toLowerCase();
  return RESERVED_NAME_WORDS.find((word) => lower.includes(word)) ?? null;
}

/** Normalize a name for hyphen-variant collision detection: drop hyphens, lowercase. */
export function normalizeHyphenVariant(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/-/g, '');
}

/**
 * Given a list of names, return groups where two or more DISTINCT names share a
 * hyphen-stripped normalized form (e.g. `river-review` vs `riverreview`). A name
 * repeated verbatim is not a collision. Pure and exported for unit testing.
 *
 * @param {string[]} names
 * @returns {Array<{ normalized: string, names: string[] }>}
 */
export function findHyphenVariantCollisions(names) {
  const byNorm = new Map();
  for (const name of names) {
    const norm = normalizeHyphenVariant(name);
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, new Set());
    byNorm.get(norm).add(name);
  }
  const collisions = [];
  for (const [normalized, set] of byNorm) {
    if (set.size > 1) collisions.push({ normalized, names: [...set].sort() });
  }
  return collisions;
}

// ---------------------------------------------------------------------------
// Entry `applyTo` containment check (issue #1508).
//
// An entry skill (agent-skills router) must give every diff its routing-target
// registry skills care about a path to reach the entry — i.e. the entry's
// `applyTo` must cover the union of the routed targets' `applyTo`. Two incidents
// (#1494, #1500) slipped past CI because nothing checked this. Per repo
// principle #1070 this is mechanized here; genuinely-intentional exclusions are
// declared in the entry frontmatter `applyToExemptions` array so the exclusion
// (and its reason) sits next to the `applyTo` block a reviewer audits.
// ---------------------------------------------------------------------------

const MAX_UNCOVERED_REPORTED = 6;

/**
 * Parse the frontmatter `applyToExemptions` value into validated entries and
 * structural errors. Each exemption must be an object with a non-empty `skill`
 * ID and a non-empty `reason`.
 *
 * @param {unknown} value
 * @returns {{ valid: Array<{skill: string, reason: string}>, errors: string[] }}
 */
export function parseExemptions(value) {
  if (value == null) return { valid: [], errors: [] };
  if (!Array.isArray(value)) {
    return { valid: [], errors: ['must be an array of { skill, reason } objects'] };
  }
  const valid = [];
  const errors = [];
  value.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`entry ${i} must be an object with { skill, reason }`);
      return;
    }
    const skill = item.skill;
    const reason = item.reason;
    if (typeof skill !== 'string' || !skill.trim()) {
      errors.push(`entry ${i} is missing a non-empty "skill"`);
      return;
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      errors.push(`entry ${i} ("${skill}") is missing a non-empty "reason"`);
      return;
    }
    valid.push({ skill, reason });
  });
  return { valid, errors };
}

/**
 * Build an index of every skill package in `skills/`, keyed by directory name
 * (the skill ID). Records the raw `applyTo`, repo-relative path, and whether the
 * package lives under `agent-skills/` (i.e. is itself an entry/router, not a
 * routable registry leaf).
 *
 * @returns {Promise<Map<string, { applyTo: unknown, relPath: string, isAgentSkill: boolean }>>}
 */
async function buildSkillIndex() {
  const skillsRoot = path.join(repoRoot, 'skills');
  const index = new Map();

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
      const skillPath = path.join(dir, 'SKILL.md');
      const id = path.basename(dir);
      if (!index.has(id)) {
        const relPath = path.relative(repoRoot, skillPath);
        let applyTo;
        try {
          applyTo = parseFrontMatter(await fs.readFile(skillPath, 'utf8')).metadata?.applyTo;
        } catch {
          applyTo = undefined;
        }
        const isAgentSkill = relPath.split(path.sep).includes('agent-skills');
        index.set(id, { applyTo, relPath, isAgentSkill });
      }
    }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(dir, e.name));
    }
  }

  await walk(skillsRoot);
  return index;
}

/**
 * Check that each agent-skills entry's `applyTo` covers the union of its routed
 * registry skills' `applyTo`. Returns false when any error was reported.
 *
 * @param {string[]} packages SKILL.md paths under skills/agent-skills
 * @returns {Promise<boolean>}
 */
async function validateApplyToCoverage(packages) {
  const index = await buildSkillIndex();
  const agentSkillIds = new Set(packages.map((p) => path.basename(path.dirname(p))));
  let success = true;

  // Phase 1 — gather, per entry, the coverage result for each resolved routing
  // target, and structural warnings/errors.
  const results = []; // { relPath, entryId, id, targetRel, reachable, uncovered, undecidable }
  // target id -> whether some routing entry can provably reach it. An entry that
  // routes to a target but cannot reach it is only an error when NO entry can
  // reach the target (the skill is globally orphaned); otherwise it is a warning
  // (this entry references a skill executed via another entry).
  const globallyReachable = new Map();

  for (const skillPath of packages) {
    const dir = path.dirname(skillPath);
    const entryId = path.basename(dir);
    const relPath = path.relative(repoRoot, skillPath);

    let skillText;
    let metadata;
    try {
      skillText = await fs.readFile(skillPath, 'utf8');
      metadata = parseFrontMatter(skillText).metadata ?? {};
    } catch {
      continue; // per-skill validation already reported the parse failure
    }

    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    let routingText = '';
    let hasRouting = false;
    try {
      routingText = await fs.readFile(path.join(dir, 'references', 'ROUTING.md'), 'utf8');
      hasRouting = true;
    } catch {
      hasRouting = false;
    }

    const isEntry = hasRouting || tags.includes('entry') || tags.includes('routing');
    if (!isEntry) continue;

    // Candidate routing targets: backtick kebab IDs on routing lines of the
    // ROUTING.md and the SKILL.md routing table (issue #1508 tolerant parser).
    const candidateIds = new Set([
      ...extractRoutingTargetIds(routingText),
      ...extractRoutingTargetIds(skillText),
    ]);
    candidateIds.delete(entryId);

    const { valid: exemptions, errors: exemptionErrors } = parseExemptions(
      metadata.applyToExemptions
    );
    for (const err of exemptionErrors) {
      console.error(`❌ ${relPath}: applyToExemptions ${err}`);
      success = false;
    }
    const exemptSet = new Set(exemptions.map((e) => e.skill));
    for (const ex of exemptions) {
      if (!candidateIds.has(ex.skill)) {
        console.warn(
          `⚠️  ${relPath}: applyToExemptions lists "${ex.skill}" which is not a routing target ` +
            'of this entry (stale exemption?)'
        );
      }
    }

    const entryPatterns = expandApplyTo(metadata.applyTo);

    let resolvedCount = 0;
    const unresolvedIds = [];
    for (const id of candidateIds) {
      if (exemptSet.has(id)) continue; // intentional exclusion — silent
      if (agentSkillIds.has(id)) continue; // routes to another entry — out of scope
      const target = index.get(id);
      if (!target || target.isAgentSkill) {
        unresolvedIds.push(id);
        continue;
      }
      const targetPatterns = expandApplyTo(target.applyTo);
      if (!targetPatterns.length) continue; // nothing to cover
      resolvedCount += 1;

      const { reachable, disjoint, undecidable } = analyzeCoverage(entryPatterns, targetPatterns);
      results.push({
        relPath,
        id,
        targetRel: target.relPath,
        reachable,
        disjoint,
        undecidable,
      });
      globallyReachable.set(id, (globallyReachable.get(id) ?? false) || reachable);
    }

    // Only surface unresolved candidate IDs for entries that actually route to
    // registry skills. An entry whose candidates NONE resolve (e.g. review-team,
    // whose backtick tokens name perspective roles, not registry skills) is not
    // doing applyTo-based routing, so its tokens are not phantom targets.
    if (resolvedCount > 0) {
      for (const id of unresolvedIds) {
        console.warn(
          `⚠️  ${relPath}: routing target "${id}" does not resolve to a registry skill ` +
            '(unresolved — skipped)'
        );
      }
    }
  }

  // Phase 2 — report. A target unreachable via its entry is an error only when
  // no routing entry can reach it; otherwise it is a warning.
  const orphanReported = new Set();
  for (const r of results) {
    if (!r.reachable) {
      if (globallyReachable.get(r.id)) {
        console.warn(
          `⚠️  ${r.relPath}: routing target "${r.id}" is not reachable via this entry's applyTo, ` +
            'but is reachable via another entry (referenced here, executed elsewhere). ' +
            'Add an applyToExemptions entry to document the deferral if intentional.'
        );
      } else if (!orphanReported.has(r.id)) {
        orphanReported.add(r.id);
        console.error(
          `❌ ${r.relPath}: routing target "${r.id}" is unreachable — none of its applyTo ` +
            `patterns overlap any routing entry's applyTo (${r.targetRel})`
        );
        success = false;
      }
    } else if (r.disjoint.length) {
      const shown = r.disjoint.slice(0, MAX_UNCOVERED_REPORTED).join(', ');
      const more =
        r.disjoint.length > MAX_UNCOVERED_REPORTED
          ? ` (+${r.disjoint.length - MAX_UNCOVERED_REPORTED} more)`
          : '';
      console.warn(
        `⚠️  ${r.relPath}: routing target "${r.id}" has applyTo pattern(s) the entry never ` +
          `fires on — ${shown}${more}. Widen this entry's applyTo to reach them, or declare ` +
          'an applyToExemptions entry if the exclusion is intentional.'
      );
    } else if (r.undecidable) {
      // Reachability leaned on an undecidable comparison (unsupported glob
      // grammar treated as overlapping, fail-safe). Non-blocking visibility so
      // the fallback is auditable rather than silent.
      console.warn(
        `ℹ️  ${r.relPath}: routing target "${r.id}" treated as reachable via an undecidable ` +
          'glob comparison (unsupported grammar assumed to overlap, fail-safe)'
      );
    }
  }

  return success;
}

async function hasReferencesDir(dirPath) {
  try {
    const stat = await fs.stat(path.join(dirPath, 'references'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * List every `SKILL.md` under `dirPath`, sorted. The root itself is a container
 * (never a package), so discovery starts at its child directories — hence
 * `includeRoot: false`. Delegates the SKILL.md-non-descent walk to the shared
 * {@link listSkillPackageDirs} (skill-loader) and sorts the resulting SKILL.md
 * paths (sorting the paths, not their parent dirs, preserves the original order
 * when a sibling name is a prefix of another).
 */
async function listSkillPackages(dirPath) {
  const dirs = await listSkillPackageDirs(dirPath, { includeRoot: false });
  return dirs.map((dir) => path.join(dir, 'SKILL.md')).sort();
}

async function validateSkill(skillPath) {
  const relativePath = path.relative(repoRoot, skillPath);
  const dirName = path.basename(path.dirname(skillPath));
  const errors = [];

  let metadata;
  let content = '';
  try {
    content = await fs.readFile(skillPath, 'utf8');
    const parsed = parseFrontMatter(content);
    metadata = parsed.metadata ?? {};
  } catch (err) {
    errors.push(`frontmatter parse failed: ${err.message}`);
  }

  // Imported agent skills have metadata.source === 'agent' and may use a
  // generated id (e.g. as-<name>) as directory name while preserving the
  // original name field. Skip kebab-case and name-match checks for those.
  const isImported = metadata?.metadata?.source === 'agent';

  if (!isImported && !isKebabCaseName(dirName)) {
    errors.push('dir name must be lowercase kebab-case');
  }

  if (!metadata?.name || typeof metadata.name !== 'string') {
    errors.push('missing metadata.name');
  } else if (!isImported && metadata.name !== dirName) {
    errors.push(`metadata.name must match directory name (${dirName})`);
  }

  if (!metadata?.description || typeof metadata.description !== 'string') {
    errors.push('missing metadata.description');
  }

  // Anthropic-derived hard constraints on the name (error-level; applies to all
  // skills including imported ones, since these are platform limits). See
  // skills/README.md § "Anthropic-derived constraints".
  const name = typeof metadata?.name === 'string' ? metadata.name : null;
  if (name) {
    if (name.length > NAME_MAX_LENGTH) {
      errors.push(`name exceeds ${NAME_MAX_LENGTH} characters (${name.length})`);
    }
    const reserved = findReservedWord(name);
    if (reserved) {
      errors.push(`name must not contain the reserved word "${reserved}" (Anthropic constraint)`);
    }
  }

  if (errors.length) {
    console.error(`❌ ${relativePath}`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    return false;
  }

  // Warn about missing recommended fields (non-blocking).
  const missingRecommended = [];
  if (!metadata?.version) missingRecommended.push('version');
  if (!metadata?.tags) missingRecommended.push('tags');
  if (!metadata?.severity && !metadata?.outputKind)
    missingRecommended.push('severity or outputKind');
  if (missingRecommended.length) {
    console.warn(
      `⚠  ${relativePath} — missing recommended fields: ${missingRecommended.join(', ')}`
    );
  }

  // Advisory: organizational noun in the name (warning-level, grandfathered
  // names exempt). See skills/README.md § "Common prohibitions and consistency".
  const nounTarget = name ?? dirName;
  if (!isProhibitedNounExempt(nounTarget) && !isProhibitedNounExempt(dirName)) {
    const noun = findProhibitedNoun(nounTarget);
    if (noun) {
      console.warn(
        `⚠️  ${relativePath}: name contains organizational noun "${noun}" — ` +
          'prefer a name that states the value (skills/README.md § Naming)'
      );
    }
  }

  console.log(`✅ ${relativePath}`);
  const hasRefs = await hasReferencesDir(path.dirname(skillPath));
  if (!hasRefs) {
    console.warn(`⚠️  ${relativePath}: references/ directory is missing`);
  }

  const contextHealth = assessAgentSkillContextHealth(content);
  if (contextHealth.shouldWarn) {
    const splitHint = hasRefs
      ? 'Move optional examples, troubleshooting, rationale, or provider-specific detail into references/.'
      : 'Add references/ and move optional examples, troubleshooting, rationale, or provider-specific detail there.';
    console.warn(
      `⚠️  ${relativePath}: context-health advisory — ${contextHealth.bytes} UTF-8 bytes / ` +
        `${contextHealth.lines} lines exceeds the advisory entrypoint budget of ` +
        `${AGENT_SKILL_CONTEXT_WARN_BYTES} bytes / ${AGENT_SKILL_CONTEXT_WARN_LINES} lines. ` +
        `${splitHint} Keep activation, responsibility, routing, hard guards, and output contract in SKILL.md. ` +
        'Warning only; this does not fail validation (#2372, #2483).'
    );
  }
  return true;
}

async function validateAgentSkills() {
  try {
    await fs.access(agentSkillsDir);
  } catch {
    console.warn('⚠️  No skills/agent-skills directory found.');
    return true;
  }

  const packages = await listSkillPackages(agentSkillsDir);
  if (!packages.length) {
    console.warn('⚠️  No Agent Skills packages found under skills/agent-skills/.');
    return true;
  }

  let success = true;
  for (const skillPath of packages) {
    const ok = await validateSkill(skillPath);
    if (!ok) success = false;
  }

  // Cross-skill: two agent-skill directory names that differ only by
  // hyphenation collide when resolved (skills/README.md § "Common prohibitions
  // and consistency"). Error-level.
  const dirNames = packages.map((p) => path.basename(path.dirname(p)));
  for (const { normalized, names } of findHyphenVariantCollisions(dirNames)) {
    console.error(
      `❌ agent-skill names differ only by hyphenation: ${names.join(', ')} ` +
        `(both normalize to "${normalized}")`
    );
    success = false;
  }

  // Entry `applyTo` must cover the union of routed registry skills' `applyTo`
  // (issue #1508).
  const coverageOk = await validateApplyToCoverage(packages);
  if (!coverageOk) success = false;

  // Loose→strict drift guard (blocking) — see the validateStrictSchemaDrift JSDoc.
  const strictOk = await validateStrictSchemaDrift(packages);
  if (!strictOk) success = false;

  return success;
}

/**
 * Validate each agent-skill through the same loader path the runtime uses:
 * {@link loadSkillMetadata} with the strict schema (schemas/skill.schema.json),
 * i.e. the per-file step of loadAllSkillMetadata(). Reusing the loader (rather
 * than re-implementing parse → normalize → ajv here) keeps this guard aligned
 * with future loader-side normalization changes by construction. Error-level
 * (blocking): a skill that passes the loose checks but fails this path is
 * silently dropped by the runtime loader — the exact bug class PR #1559 fixed —
 * so drift must fail CI, not merely warn. If a field is genuinely needed, the
 * correct move is to define it in schemas/skill.schema.json (as
 * applyToExemptions was); a loose-only field failing this guard is by design.
 *
 * Skills tagged `agent` are skipped: the runtime drops them intentionally via
 * `excludedTags: ['agent']` (a tag-reason drop, not a schema-drift drop), so
 * flagging them here would misattribute the drop to schema drift.
 *
 * @param {string[]} packages absolute SKILL.md paths
 * @returns {Promise<boolean>} false when any skill fails the strict loader path
 *   or the schema itself fails to load/compile
 */
export async function validateStrictSchemaDrift(packages) {
  let strictValidator;
  try {
    strictValidator = createSkillValidator(await loadSchema(defaultPaths.schemaPath));
  } catch (err) {
    console.error(`❌ failed to load strict schema (${defaultPaths.schemaPath}): ${err.message}`);
    return false;
  }
  let success = true;
  for (const skillPath of packages) {
    const relPath = path.relative(repoRoot, skillPath);
    let metadata;
    try {
      const content = await fs.readFile(skillPath, 'utf8');
      metadata = parseFrontMatter(content, { filePath: skillPath }).metadata ?? {};
    } catch {
      continue; // per-skill validation already reported the parse failure
    }
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    if (tags.includes('agent')) {
      console.log(
        `ℹ️  ${relPath}: tagged "agent" — intentionally dropped by the runtime loader ` +
          `(excludedTags), skipping the strict-schema drift check`
      );
      continue;
    }
    try {
      await loadSkillMetadata(skillPath, { validator: strictValidator });
    } catch (err) {
      console.error(
        `❌ ${relPath}: passes the loose agent-skill checks but FAILS the strict runtime ` +
          `loader path (loadSkillMetadata / schemas/skill.schema.json) — ` +
          `loadAllSkillMetadata() would silently drop this skill: ${err.message}`
      );
      success = false;
    }
  }
  return success;
}

if (isDirectRun(import.meta.url)) {
  const ok = await validateAgentSkills();
  if (!ok) {
    process.exitCode = 1;
  }
}
