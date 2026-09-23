import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  computeRulesDigest,
  loadProjectRules,
  loadProjectRulesDigest,
  normalizeRulesTextV2,
} from '../src/lib/rules.mjs';
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

// --- #2202 Phase 2: digest versions ---

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

test('computeRulesDigest defaults to v1 and v1 stays the unnormalized sha256 (#2202 Phase 2)', () => {
  const text = '- a rule  \r\n- b rule\t';
  // The Phase 0 digest is not changed by Phase 2: the default and an explicit
  // 'v1' both hash the text as-is, so already-recorded digests keep matching.
  assert.equal(computeRulesDigest(text), sha256(text));
  assert.equal(computeRulesDigest(text, { algo: 'v1' }), sha256(text));
});

test('computeRulesDigest v2 hashes LF-unified text with per-line trailing whitespace removed (#2202 Phase 2)', () => {
  // Expected value derived independently: the normalized text written by hand.
  const expected = sha256('- a rule\n- b rule\n\n## x.md\n\n- c');
  const variants = [
    '- a rule\n- b rule\n\n## x.md\n\n- c',
    '- a rule\r\n- b rule\r\n\r\n## x.md\r\n\r\n- c', // CRLF
    '- a rule\r- b rule\r\r## x.md\r\r- c', // lone CR
    '- a rule   \n- b rule\t\n  \n## x.md \n\n- c  ', // trailing whitespace
    '- a rule \r\n- b rule\t\r\n\n## x.md\n\n- c', // both, mixed
  ];
  for (const text of variants) {
    assert.equal(computeRulesDigest(text, { algo: 'v2' }), expected, JSON.stringify(text));
  }
  // Content changes still change the v2 digest, including leading whitespace
  // and the rules.d file header (headers are kept by the normalization).
  assert.notEqual(computeRulesDigest('- a rule changed', { algo: 'v2' }), expected);
  assert.notEqual(
    computeRulesDigest('  - a rule\n- b rule\n\n## x.md\n\n- c', { algo: 'v2' }),
    expected
  );
  assert.notEqual(
    computeRulesDigest('- a rule\n- b rule\n\n## y.md\n\n- c', { algo: 'v2' }),
    expected
  );
  assert.equal(normalizeRulesTextV2('a \r\nb\t'), 'a\nb');
});

test('computeRulesDigest v2 returns null for no rules, and an unknown algo throws (#2202 Phase 2)', () => {
  for (const empty of [null, undefined, '']) {
    assert.equal(computeRulesDigest(empty, { algo: 'v2' }), null);
  }
  assert.throws(() => computeRulesDigest('- a', { algo: 'v3' }), TypeError);
  assert.throws(() => computeRulesDigest('- a', { algo: '' }), TypeError);
});

test('loadProjectRulesDigest passes algo to the digest and the rest to loadProjectRules (#2202 Phase 2)', async () => {
  await withTempDir(
    async (dir) => {
      await mkdir(path.join(dir, '.river', 'rules.d'), { recursive: true });
      writeFileSync(path.join(dir, '.river', 'rules.md'), '- base rule  \r\n- second\r\n');
      writeFileSync(path.join(dir, '.river', 'rules.d', 'a.md'), '- extra');
      const { rulesText } = await loadProjectRules(dir);
      assert.equal(await loadProjectRulesDigest(dir), sha256(rulesText));
      assert.equal(await loadProjectRulesDigest(dir, { algo: 'v1' }), sha256(rulesText));
      assert.equal(
        await loadProjectRulesDigest(dir, { algo: 'v2' }),
        sha256('- base rule\n- second\n\n## a.md\n\n- extra')
      );
      // rulesPath still reaches loadProjectRules alongside algo.
      writeFileSync(path.join(dir, 'custom.md'), '- custom\r\n');
      assert.equal(
        await loadProjectRulesDigest(dir, { rulesPath: 'custom.md', algo: 'v2' }),
        sha256('- custom')
      );
    },
    { prefix: 'river-rules-digest-v2-' }
  );
});
