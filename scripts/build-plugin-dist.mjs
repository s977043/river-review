#!/usr/bin/env node
/**
 * Build the Claude Code plugin distribution directory (#2756).
 *
 * The marketplace entry in .claude-plugin/marketplace.json points at
 * plugin-dist/river-review/ instead of the repository root. Claude Code copies
 * only that directory into its plugin cache, and because the directory has no
 * package.json, the install no longer prints the note about `overrides` that
 * the root package.json triggered.
 *
 * The originals stay where they are; this script copies them. PLUGIN_INPUTS is
 * the single list of what ships. Every run deletes and rewrites the output, so
 * a file removed from the inputs never lingers in the distribution.
 *
 * Usage:
 *   node scripts/build-plugin-dist.mjs          # regenerate plugin-dist/river-review/
 *   node scripts/build-plugin-dist.mjs --check  # exit 1 if the committed output is stale
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
export const PLUGIN_DIST_DIR = 'plugin-dist/river-review';

// Repository-relative files or directories copied to the same relative path
// under PLUGIN_DIST_DIR. Directories are copied recursively.
export const PLUGIN_INPUTS = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/assets/icon.svg',
  // Distributed commands only; repo-dev commands live in .claude/commands/.
  'commands',
  'agents/river-review.md',
  // The whole collection: commands/skill.md searches <plugin root>/skills.
  'skills',
  'hooks/hooks.json',
  'scripts/plugin-format-hook.sh',
  'scripts/plugin-task-checkpoint-hook.sh',
  // commands/skill.md runs the resolver, which imports src/lib/skill-id-resolver.mjs.
  'scripts/resolve-skill-id.mjs',
  'src/lib/skill-id-resolver.mjs',
  // commands/setup-team.md reads this template.
  '.river/rules.template.md',
  // Linked from skills/agent-skills/unknown-coverage-review/SKILL.md.
  'pages/reference/artifact-input-contract.md',
  'docs/review/output-format.md',
  'LICENSE',
  'LICENSE-CODE',
  'LICENSE-CONTENT',
];

const SKIPPED_NAMES = new Set(['.DS_Store']);

async function collectFiles(rel, out) {
  const abs = path.join(ROOT, rel);
  const stat = await fs.lstat(abs);
  if (stat.isSymbolicLink()) {
    throw new Error(`symbolic links are not copied into the plugin dist: ${rel}`);
  }
  if (stat.isDirectory()) {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (SKIPPED_NAMES.has(entry.name) || entry.name.endsWith('.bak')) continue;
      await collectFiles(path.posix.join(rel, entry.name), out);
    }
    return;
  }
  out.set(rel, { content: await fs.readFile(abs), executable: (stat.mode & 0o111) !== 0 });
}

/** Map of dist-relative path → { content, executable } that the build produces. */
export async function buildExpected() {
  const files = new Map();
  for (const input of PLUGIN_INPUTS) await collectFiles(input, files);
  if (files.has('package.json')) {
    throw new Error('package.json must not ship in the plugin dist (#2756)');
  }
  return files;
}

async function readActual(dir, rel = '', out = new Map()) {
  let entries;
  try {
    entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' && rel === '') return out;
    throw err;
  }
  for (const entry of entries) {
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await readActual(dir, childRel, out);
    } else {
      const abs = path.join(dir, childRel);
      const stat = await fs.lstat(abs);
      out.set(childRel, {
        content: entry.isSymbolicLink() ? null : await fs.readFile(abs),
        executable: (stat.mode & 0o111) !== 0,
      });
    }
  }
  return out;
}

/** Differences between the expected files and the directory on disk. */
export async function diffDist(expected, distDir = path.join(ROOT, PLUGIN_DIST_DIR)) {
  const actual = await readActual(distDir);
  const problems = [];
  for (const [rel, want] of expected) {
    const have = actual.get(rel);
    if (!have) problems.push(`missing: ${rel}`);
    else if (!have.content || !have.content.equals(want.content)) problems.push(`differs: ${rel}`);
    else if (have.executable !== want.executable) problems.push(`mode differs: ${rel}`);
  }
  for (const rel of actual.keys()) {
    if (!expected.has(rel)) problems.push(`unexpected: ${rel}`);
  }
  return problems.sort();
}

async function writeDist(expected) {
  const distDir = path.join(ROOT, PLUGIN_DIST_DIR);
  await fs.rm(distDir, { recursive: true, force: true });
  for (const [rel, file] of expected) {
    const abs = path.join(distDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.content);
    await fs.chmod(abs, file.executable ? 0o755 : 0o644);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;

if (isDirectRun) {
  try {
    const expected = await buildExpected();
    if (process.argv.includes('--check')) {
      const problems = await diffDist(expected);
      if (problems.length > 0) {
        console.error(`${PLUGIN_DIST_DIR} is stale (${problems.length} difference(s)):`);
        for (const problem of problems.slice(0, 50)) console.error(`  - ${problem}`);
        if (problems.length > 50) console.error(`  ... and ${problems.length - 50} more`);
        console.error('Run `npm run plugin:dist` and commit the result.');
        process.exitCode = 1;
      } else {
        console.log(`${PLUGIN_DIST_DIR}: up to date (${expected.size} files)`);
      }
    } else {
      await writeDist(expected);
      console.log(`${PLUGIN_DIST_DIR}: wrote ${expected.size} files`);
    }
  } catch (err) {
    console.error(`build-plugin-dist failed: ${err.message}`);
    process.exitCode = 1;
  }
}
