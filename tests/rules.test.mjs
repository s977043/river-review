import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { computeRulesDigest, loadProjectRules, loadProjectRulesDigest } from '../src/lib/rules.mjs';
import { withTempDir } from './helpers/temp-dir.mjs';

test('loadProjectRules returns null when rules file is absent', async () => {
  await withTempDir(
    async (dir) => {
      const { rulesText } = await loadProjectRules(dir);
      assert.equal(rulesText, null);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules loads content when rules file exists', async () => {
  await withTempDir(
    async (dir) => {
      const rulesDir = path.join(dir, '.river');
      await mkdir(rulesDir, { recursive: true });
      const rulesPath = path.join(rulesDir, 'rules.md');
      writeFileSync(rulesPath, '- Follow project guide');

      const { rulesText, path: resolvedPath } = await loadProjectRules(dir);
      assert.equal(rulesText, '- Follow project guide');
      assert.equal(resolvedPath, rulesPath);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules returns null when rules file is empty or whitespace', async () => {
  await withTempDir(
    async (dir) => {
      const rulesDir = path.join(dir, '.river');
      await mkdir(rulesDir, { recursive: true });
      const rulesPath = path.join(rulesDir, 'rules.md');
      writeFileSync(rulesPath, '   \n  ');

      const { rulesText } = await loadProjectRules(dir);
      assert.equal(rulesText, null);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules appends .river/rules.d/*.md in alphabetical order', async () => {
  await withTempDir(
    async (dir) => {
      const riverDir = path.join(dir, '.river');
      const rulesDDir = path.join(riverDir, 'rules.d');
      await mkdir(rulesDDir, { recursive: true });
      writeFileSync(path.join(riverDir, 'rules.md'), '- base rule');
      writeFileSync(path.join(rulesDDir, 'domain.md'), '- domain rule');
      writeFileSync(path.join(rulesDDir, 'incidents.md'), '- incident rule');

      const { rulesText, extraPaths } = await loadProjectRules(dir);
      assert.match(rulesText, /- base rule/);
      assert.match(rulesText, /## domain\.md\n\n- domain rule/);
      assert.match(rulesText, /## incidents\.md\n\n- incident rule/);
      // base first, then domain before incidents (alphabetical)
      assert.ok(rulesText.indexOf('base rule') < rulesText.indexOf('domain rule'));
      assert.ok(rulesText.indexOf('domain rule') < rulesText.indexOf('incident rule'));
      assert.equal(extraPaths.length, 2);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules skips a directory named like a rule file (EISDIR) without crashing', async () => {
  await withTempDir(
    async (dir) => {
      const rulesDDir = path.join(dir, '.river', 'rules.d');
      await mkdir(path.join(rulesDDir, 'nested.md'), { recursive: true }); // a dir ending in .md
      writeFileSync(path.join(rulesDDir, 'real.md'), '- real rule');

      const { rulesText } = await loadProjectRules(dir);
      assert.match(rulesText, /- real rule/);
      assert.doesNotMatch(rulesText, /nested\.md/);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules scans rules.d when the default path is passed explicitly', async () => {
  await withTempDir(
    async (dir) => {
      const rulesDDir = path.join(dir, '.river', 'rules.d');
      await mkdir(rulesDDir, { recursive: true });
      writeFileSync(path.join(rulesDDir, 'domain.md'), '- domain rule');

      const { rulesText } = await loadProjectRules(dir, { rulesPath: '.river/rules.md' });
      assert.match(rulesText, /- domain rule/);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules uses rules.d even when base rules.md is absent', async () => {
  await withTempDir(
    async (dir) => {
      const rulesDDir = path.join(dir, '.river', 'rules.d');
      await mkdir(rulesDDir, { recursive: true });
      writeFileSync(path.join(rulesDDir, 'glossary.md'), '- term: meaning');

      const { rulesText } = await loadProjectRules(dir);
      assert.match(rulesText, /## glossary\.md\n\n- term: meaning/);
    },
    { prefix: 'river-rules-' }
  );
});

test('loadProjectRules ignores non-md files in rules.d and custom path skips rules.d', async () => {
  await withTempDir(
    async (dir) => {
      const riverDir = path.join(dir, '.river');
      const rulesDDir = path.join(riverDir, 'rules.d');
      await mkdir(rulesDDir, { recursive: true });
      writeFileSync(path.join(riverDir, 'rules.md'), '- base');
      writeFileSync(path.join(rulesDDir, 'notes.txt'), 'ignored');
      writeFileSync(path.join(dir, 'custom-rules.md'), '- custom only');

      const def = await loadProjectRules(dir);
      assert.equal(def.rulesText, '- base'); // .txt ignored, no rules.d/*.md

      const custom = await loadProjectRules(dir, { rulesPath: 'custom-rules.md' });
      assert.equal(custom.rulesText, '- custom only'); // custom path does not scan rules.d
      assert.equal(custom.extraPaths.length, 0);
    },
    { prefix: 'river-rules-' }
  );
});

// --- #2202 Phase 0: rules digest ---

test('computeRulesDigest is null for no rules and a sha256 hex of rulesText otherwise', () => {
  assert.equal(computeRulesDigest(null), null);
  assert.equal(computeRulesDigest(undefined), null);
  assert.equal(computeRulesDigest(''), null);
  const expected = crypto.createHash('sha256').update('- a rule').digest('hex');
  assert.equal(computeRulesDigest('- a rule'), expected);
  assert.match(computeRulesDigest('- a rule'), /^[0-9a-f]{64}$/);
});

test('loadProjectRulesDigest is deterministic and changes when rules.md or rules.d changes', async () => {
  await withTempDir(
    async (dir) => {
      assert.equal(await loadProjectRulesDigest(dir), null); // no rules

      const riverDir = path.join(dir, '.river');
      const rulesDDir = path.join(riverDir, 'rules.d');
      await mkdir(rulesDDir, { recursive: true });
      writeFileSync(path.join(riverDir, 'rules.md'), '- base');
      const d1 = await loadProjectRulesDigest(dir);
      assert.equal(await loadProjectRulesDigest(dir), d1); // same content, same digest
      assert.equal(d1, computeRulesDigest((await loadProjectRules(dir)).rulesText));

      writeFileSync(path.join(riverDir, 'rules.md'), '- base changed');
      const d2 = await loadProjectRulesDigest(dir);
      assert.notEqual(d2, d1);

      writeFileSync(path.join(rulesDDir, 'domain.md'), '- domain');
      const d3 = await loadProjectRulesDigest(dir);
      assert.notEqual(d3, d2);

      writeFileSync(path.join(riverDir, 'rules.md'), '- base');
      await unlink(path.join(rulesDDir, 'domain.md'));
      assert.equal(await loadProjectRulesDigest(dir), d1); // back to original content
    },
    { prefix: 'river-rules-' }
  );
});
