import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function read(rel) {
  return readFile(path.join(repoRoot, rel), 'utf8');
}

test('skill command searches the full skill collection and prefers exact IDs', async () => {
  const text = await read('commands/skill.md');
  assert.match(text, /SKILL_ROOT=.*\/skills/);
  assert.doesNotMatch(text, /SKILL_ROOT=.*\/skills\/agent-skills/);
  assert.match(text, /exact frontmatter ID first/);
  assert.match(text, /rg -l -F/);
  assert.match(text, /skippedSkills/);
});

test('skill-id-resolver rejects path-like IDs and preserves owner knowledge', async () => {
  const text = await read('skills/agent-skills/skill-id-resolver/SKILL.md');
  assert.match(text, /\^\[a-z0-9\]\[a-z0-9\._-\]\*\$/);
  assert.match(text, /slash、backslash、`\.\.`/);
  assert.match(text, /sanitize して別 ID に変換してはいけない/);
  assert.match(text, /Agent entry skill の `references\/` へ同じ内容を手書きコピーしない/);
  assert.match(text, /source hash/);
});

test('resolver documents source-plugin and exported layouts', async () => {
  const text = await read('skills/agent-skills/skill-id-resolver/SKILL.md');
  assert.match(text, /agent-skills\/<skill-id>\/SKILL\.md/);
  assert.match(text, /midstream\/\*\*\/<skill-id>\/SKILL\.md/);
  assert.match(text, /<export-root>\/<skill-id>\/SKILL\.md/);
});
