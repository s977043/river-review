#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const ROOT_ALLOWLIST = new Set([
  'AGENTS.md',
  'AGENT_LEARNINGS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'README.en.md',
  'ROADMAP.md',
]);

async function checkDocPlacement() {
  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  const rootMdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  let violations = 0;
  const communityFiles = [
    'CODE_OF_CONDUCT.md',
    'CONTRIBUTING.md',
    'CONTRIBUTING.en.md',
    'SECURITY.md',
  ];
  for (const file of communityFiles) {
    try {
      await fs.access(path.join(repoRoot, '.github', file));
    } catch {
      console.error(`❌ .github/${file}: missing GitHub community document`);
      violations++;
    }
  }

  for (const file of rootMdFiles) {
    if (ROOT_ALLOWLIST.has(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.error(`❌ ${file}: not in root allowlist (move to docs/ or pages/)`);
      violations++;
    }
  }

  console.log('');
  console.log(
    `📊 Root .md files: ${rootMdFiles.length} total, ${rootMdFiles.length - violations} in allowlist, ${violations} violation(s)`
  );

  if (violations > 0) {
    console.error('');
    console.error('Allowed root .md files: ' + [...ROOT_ALLOWLIST].sort().join(', '));
    console.error('See docs/policy/DOCUMENTATION.md for placement policy.');
    return false;
  }
  return true;
}

const ok = await checkDocPlacement();
if (!ok) {
  process.exitCode = 1;
}
