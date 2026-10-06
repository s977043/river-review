#!/usr/bin/env node
// Skill version-bump check (#2202 Phase 3).
//
// Fails when a change edits a skill's review criteria but leaves its frontmatter
// `version` where it was. Phase 1 of #2202 will expire suppressions whose
// recorded `skillVersion` differs from the current one, so a criteria change
// without a bump would silently keep suppressions issued under the old criteria.
//
// "Criteria" follows the #2202 comment ("skill の instruction / prompt / 判定基準"):
//   - instruction: the SKILL.md body (what buildSystemPrompt injects) and a
//     frontmatter `instruction`
//   - prompt: the frontmatter `prompt` and every file under the package's
//     `prompt/` or `prompts/` directory, plus files `prompt.system` / `prompt.user`
//     point at inside the package
//   - judgment criteria: the frontmatter `severity` and `rules`, and
//     `references/viewpoints.yaml` (review-viewpoint-stage.mjs adds it to the
//     prompt as obligations), compared as parsed YAML
// Everything else (fixtures/, golden/, eval/, other references/, README.md, applyTo,
// tags, description, ...) does not count. A skill added or removed by the change
// is not checked: there is no version on the other side to compare.
//
// Comparison rules:
//   - Markdown (body and prompt files) is compared after formatting with the
//     repo's Prettier config, so a formatter-only rewrite does not count.
//   - The body is compared per level-2 section; sections and paragraphs matched
//     by EXCLUDED_SECTION_HEADINGS / EXCLUDED_PARAGRAPH_PATTERN are ignored.
//   - Packages under skills/agent-skills/ are skipped. They are treated as
//     routing documents for the plugin agents, and Phase 1 only expires
//     suppressions of findings a skill emitted.
//   - "Bumped" means head `version` is a valid x.y.z greater than base.
//
// Usage:
//   node scripts/check-skill-version-bump.mjs [--base <ref>] [--head <ref>]
//     --base   ref to compare against (default: origin/main). The comparison
//              starts at `git merge-base <base> <head>`.
//     --head   ref under review (default: HEAD).
// Exit codes: 0 pass, 1 criteria changed without a bump, 2 usage or git error.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';
import prettier from 'prettier';

import { parseFrontMatter } from '../runners/core/skill-loader.mjs';
import { isDirectRun } from './lib/is-direct-run.mjs';

const SKILLS_ROOT = 'skills';
const PROMPT_DIRS = ['prompt', 'prompts'];
const VIEWPOINTS_FILE = 'references/viewpoints.yaml';
const CRITERIA_FIELDS = ['instruction', 'prompt', 'severity', 'rules'];
const AGENT_SKILLS_ROOT = 'skills/agent-skills';
// Non-criteria parts of a SKILL.md body, derived from the false positives of an
// 80-commit sweep (origin/main, 2026-10-07; see the PR for #2202 Phase 3):
//   - level-2 sections whose heading is exactly one of these (provenance,
//     reading lists, and notes on when the default CI path fires the skill)
const EXCLUDED_SECTION_HEADINGS = new Set([
  'Origin / 由来',
  'References',
  '既定 CI レビューでは発火しない / Not triggered on the default CI review path',
]);
//   - paragraphs, in any section, whose first line starts with one of these
//     (external-evidence notes appended under Goal / Rule)
const EXCLUDED_PARAGRAPH_PATTERN = /^(外部実証|外部参照|External evidence)/;
const PRETTIER_CONFIG_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url));

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function showFile(ref, file, cwd) {
  try {
    return git(['show', `${ref}:${file}`], cwd).replaceAll('\r\n', '\n');
  } catch {
    return null;
  }
}

/**
 * Skill package directories at a ref: directories holding a SKILL.md, keeping
 * only the outermost one on each branch. Mirrors listSkillPackageDirs
 * (runners/core/skill-loader.mjs), which walks the file system instead of a ref.
 */
export function packageDirsFromPaths(paths) {
  const dirs = paths
    .filter((p) => path.posix.basename(p) === 'SKILL.md')
    .map((p) => path.posix.dirname(p))
    .sort();
  const outer = [];
  for (const dir of dirs) {
    if (!outer.some((o) => dir.startsWith(`${o}/`))) outer.push(dir);
  }
  return outer;
}

function packageOf(file, dirs) {
  return dirs.find((d) => file.startsWith(`${d}/`)) ?? null;
}

function listTree(ref, cwd) {
  return git(['ls-tree', '-r', '--name-only', '-z', ref, '--', SKILLS_ROOT], cwd)
    .split('\0')
    .filter(Boolean);
}

/**
 * Canonical form of a Markdown text for comparison: formatted with the repo's
 * Prettier config (so a formatter-only rewrite, e.g. a Prettier upgrade, does
 * not count), then trailing whitespace removed and blank-line runs collapsed.
 * Text Prettier cannot parse is compared after the whitespace step only.
 */
export async function normalizeMarkdown(text) {
  if (typeof text !== 'string') return text;
  let formatted = text;
  try {
    const config = (await prettier.resolveConfig(PRETTIER_CONFIG_ANCHOR)) ?? {};
    formatted = await prettier.format(text, { ...config, parser: 'markdown' });
  } catch {
    // fall through with the raw text
  }
  return formatted
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function dropExcludedParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .filter((block) => !EXCLUDED_PARAGRAPH_PATTERN.test(block.trim()))
    .join('\n\n')
    .trim();
}

/**
 * Split a SKILL.md body into its level-2 sections, ignoring headings inside
 * fenced code blocks. Text before the first `## ` heading is keyed '(preamble)';
 * a repeated heading gets a ' #2', ' #3', ... suffix so neither copy is lost.
 */
export function splitSections(body) {
  const sections = new Map();
  const seen = new Map();
  let key = '(preamble)';
  let lines = [];
  let fence = null;
  const flush = () => sections.set(key, dropExcludedParagraphs(lines.join('\n')));
  for (const line of body.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
    }
    const heading = fence === null ? /^##\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (heading) {
      flush();
      const text = heading[1].trim();
      const n = (seen.get(text) ?? 0) + 1;
      seen.set(text, n);
      key = n === 1 ? text : `${text} #${n}`;
      lines = [];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Canonical form of a YAML text: the parsed value as JSON, so comments and
 * layout do not count. Unparseable text falls back to whitespace-trimmed lines.
 */
export function normalizeYaml(text) {
  if (typeof text !== 'string') return text;
  try {
    return JSON.stringify(yaml.load(text));
  } catch {
    return text
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }
}

/** True when a level-2 heading names a non-criteria section (see EXCLUDED_SECTION_HEADINGS). */
export function isExcludedSection(heading) {
  const text = heading.replace(/ #\d+$/, '');
  return EXCLUDED_SECTION_HEADINGS.has(text);
}

/** True when the package is a routing agent-skill (see AGENT_SKILLS_ROOT). */
export function isRoutingAgentSkill(dir) {
  return dir.startsWith(`${AGENT_SKILLS_ROOT}/`);
}

/** Collect the criteria of one skill package at a ref. */
export async function readCriteria(ref, dir, tree, cwd) {
  const raw = showFile(ref, `${dir}/SKILL.md`, cwd);
  if (raw === null) return null;
  const { metadata, body } = parseFrontMatter(raw, { filePath: `${dir}/SKILL.md` });
  const promptFiles = new Set(
    tree.filter((f) => PROMPT_DIRS.some((p) => f.startsWith(`${dir}/${p}/`)))
  );
  for (const key of ['system', 'user']) {
    const promptPath = metadata.prompt?.[key];
    if (typeof promptPath !== 'string') continue;
    const resolved = path.posix.normalize(`${dir}/${promptPath}`);
    if (resolved.startsWith(`${dir}/`)) promptFiles.add(resolved);
  }
  const files = {};
  for (const f of [...promptFiles].sort()) {
    files[f.slice(dir.length + 1)] = await normalizeMarkdown(showFile(ref, f, cwd));
  }
  files[VIEWPOINTS_FILE] = normalizeYaml(showFile(ref, `${dir}/${VIEWPOINTS_FILE}`, cwd));
  const fields = {};
  for (const key of CRITERIA_FIELDS) fields[key] = metadata[key] ?? null;
  return {
    id: metadata.id ?? path.posix.basename(dir),
    version: metadata.version == null ? null : String(metadata.version),
    sections: splitSections(await normalizeMarkdown(body)),
    fields,
    files,
  };
}

/** Names of the criteria components that differ between two snapshots. */
export function diffCriteria(base, head) {
  const changed = [];
  const headings = new Set([...base.sections.keys(), ...head.sections.keys()]);
  for (const heading of headings) {
    if (isExcludedSection(heading)) continue;
    if ((base.sections.get(heading) ?? null) !== (head.sections.get(heading) ?? null)) {
      changed.push(`instruction § ${heading}`);
    }
  }
  for (const key of CRITERIA_FIELDS) {
    if (JSON.stringify(base.fields[key]) !== JSON.stringify(head.fields[key])) {
      changed.push(`frontmatter ${key}`);
    }
  }
  const names = new Set([...Object.keys(base.files), ...Object.keys(head.files)]);
  for (const name of [...names].sort()) {
    if ((base.files[name] ?? null) !== (head.files[name] ?? null)) changed.push(name);
  }
  return changed;
}

function parseSemver(v) {
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim()) : null;
  return m ? m.slice(1).map(Number) : null;
}

/** True when `head` is a valid x.y.z strictly greater than `base` (or base has none). */
export function isVersionBumped(base, head) {
  const h = parseSemver(head);
  if (!h) return false;
  const b = parseSemver(base);
  if (!b) return true;
  for (let i = 0; i < 3; i += 1) {
    if (h[i] !== b[i]) return h[i] > b[i];
  }
  return false;
}

export async function checkSkillVersionBump({ base = 'origin/main', head = 'HEAD', cwd } = {}) {
  const mergeBase = git(['merge-base', base, head], cwd).trim();
  const changedFiles = git(
    ['diff', '--name-only', '--no-renames', '-z', mergeBase, head, '--', SKILLS_ROOT],
    cwd
  )
    .split('\0')
    .filter(Boolean);
  const baseTree = listTree(mergeBase, cwd);
  const headTree = listTree(head, cwd);
  const baseDirs = packageDirsFromPaths(baseTree);
  const headDirs = packageDirsFromPaths(headTree);

  const touched = new Set();
  for (const file of changedFiles) {
    const dir = packageOf(file, headDirs) ?? packageOf(file, baseDirs);
    if (dir) touched.add(dir);
  }

  const violations = [];
  const checked = [];
  for (const dir of [...touched].sort()) {
    if (!baseDirs.includes(dir) || !headDirs.includes(dir)) continue;
    if (isRoutingAgentSkill(dir)) continue;
    const before = await readCriteria(mergeBase, dir, baseTree, cwd);
    const after = await readCriteria(head, dir, headTree, cwd);
    const changed = diffCriteria(before, after);
    checked.push(dir);
    if (changed.length > 0 && !isVersionBumped(before.version, after.version)) {
      violations.push({
        id: after.id,
        dir,
        changed,
        baseVersion: before.version,
        headVersion: after.version,
      });
    }
  }
  return { mergeBase, checked, violations };
}

export function formatViolation(v) {
  return [
    `✖ ${v.id} (${v.dir}): review criteria changed but version was not bumped ` +
      `(base ${v.baseVersion ?? 'none'} → head ${v.headVersion ?? 'none'}).`,
    `    changed: ${v.changed.join(', ')}`,
    `    fix: raise \`version\` in ${v.dir}/SKILL.md (x.y.z, greater than ${v.baseVersion ?? 'none'}).`,
  ].join('\n');
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base' || arg === '--head') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a ref`);
      opts[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  let result;
  try {
    result = await checkSkillVersionBump(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`check-skill-version-bump: ${err.message}`);
    return 2;
  }
  if (result.violations.length > 0) {
    for (const v of result.violations) console.error(formatViolation(v));
    console.error(
      `\n${result.violations.length} skill(s) changed review criteria without a version bump ` +
        `(base ${result.mergeBase.slice(0, 12)}). See #2202.`
    );
    return 1;
  }
  console.log(
    `skill version bump check passed: ${result.checked.length} existing skill(s) touched, ` +
      `none changed criteria without a bump (base ${result.mergeBase.slice(0, 12)}).`
  );
  return 0;
}

if (isDirectRun(import.meta.url)) {
  main().then((code) => process.exit(code));
}
