import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const SOURCE_SKILL_ROOTS = Object.freeze([
  ['agent-skills', 'agent'],
  ['core', 'review'],
  ['upstream', 'review'],
  ['midstream', 'review'],
  ['downstream', 'review'],
]);
const MAX_SCAN_DEPTH = 12;

export class SkillIdResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkillIdResolutionError';
  }
}

function assertSafeSkillId(skillId) {
  if (typeof skillId !== 'string' || !SKILL_ID_PATTERN.test(skillId) || skillId.includes('..')) {
    throw new SkillIdResolutionError(
      `Unsafe skill ID "${String(skillId)}". Expected ${SKILL_ID_PATTERN}.`
    );
  }
  return skillId;
}

async function isDirectory(targetPath) {
  try {
    return (await fs.lstat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(targetPath) {
  try {
    return (await fs.lstat(targetPath)).isFile();
  } catch {
    return false;
  }
}

async function collectSkillMdFiles(root, depth = 0) {
  if (depth > MAX_SCAN_DEPTH || !(await isDirectory(root))) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isFile() && entry.name === 'SKILL.md') return [entryPath];
      if (!entry.isDirectory()) return [];
      return collectSkillMdFiles(entryPath, depth + 1);
    })
  );
  return groups.flat();
}

async function readDeclaredSkillId(skillPath) {
  let raw;
  try {
    raw = await fs.readFile(skillPath, 'utf8');
  } catch (err) {
    throw new SkillIdResolutionError(`Failed to read ${skillPath}: ${err.message}`);
  }

  let data;
  try {
    data = matter(raw).data ?? {};
  } catch (err) {
    throw new SkillIdResolutionError(`Failed to parse frontmatter in ${skillPath}: ${err.message}`);
  }

  const declared = data.id ?? data.metadata?.rr?.id ?? null;
  return typeof declared === 'string' ? declared : null;
}

async function resolveSourceTree(root, skillId) {
  const skillsRoot = path.join(root, 'skills');
  if (!(await isDirectory(skillsRoot))) return null;

  const matches = [];
  for (const [relativeRoot, source] of SOURCE_SKILL_ROOTS) {
    const scanRoot = path.join(skillsRoot, relativeRoot);
    const skillPaths = await collectSkillMdFiles(scanRoot);
    for (const skillPath of skillPaths) {
      if ((await readDeclaredSkillId(skillPath)) === skillId) {
        matches.push({ id: skillId, path: skillPath, source });
      }
    }
  }

  if (matches.length > 1) {
    const paths = matches.map((match) => path.relative(root, match.path)).sort();
    throw new SkillIdResolutionError(
      `Ambiguous skill ID "${skillId}" resolved to multiple packages: ${paths.join(', ')}`
    );
  }

  return matches[0] ?? null;
}

async function resolveExportedPackage(root, skillId) {
  const candidate = path.join(root, skillId, 'SKILL.md');
  if (!(await isFile(candidate))) return null;

  const declared = await readDeclaredSkillId(candidate);
  if (declared !== skillId) {
    throw new SkillIdResolutionError(
      `Exported package "${skillId}" declares a different skill ID: ${declared ?? '(missing)'}`
    );
  }

  return { id: skillId, path: candidate, source: 'exported' };
}

/**
 * Resolve one exact River Review skill ID without converting it into a path.
 *
 * Supported layouts:
 * - source/full-plugin root: <root>/skills/{agent-skills,core,upstream,midstream,downstream}/...
 * - river skills export root: <root>/<skill-id>/SKILL.md
 *
 * @param {string} root
 * @param {string} skillId
 * @returns {Promise<{id:string,path:string,source:'agent'|'review'|'exported'}|null>}
 */
export async function resolveSkillId(root, skillId) {
  const safeId = assertSafeSkillId(skillId);
  const resolvedRoot = path.resolve(root);

  const sourceMatch = await resolveSourceTree(resolvedRoot, safeId);
  if (sourceMatch) return sourceMatch;

  return resolveExportedPackage(resolvedRoot, safeId);
}
