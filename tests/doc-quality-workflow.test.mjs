import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const checker = path.join(repoRoot, 'scripts/check-bilingual-pairs.mjs');
const workflow = path.join(repoRoot, '.github/workflows/doc-quality.yml');

function runChecker(t, fileNames, strict = true) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'river-doc-quality-'));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  mkdirSync(path.join(temporaryRoot, 'scripts'));
  mkdirSync(path.join(temporaryRoot, 'pages'));
  copyFileSync(checker, path.join(temporaryRoot, 'scripts/check-bilingual-pairs.mjs'));
  for (const name of fileNames) {
    writeFileSync(path.join(temporaryRoot, 'pages', name), '# Test document\n');
  }
  return spawnSync(
    process.execPath,
    [path.join(temporaryRoot, 'scripts/check-bilingual-pairs.mjs'), ...(strict ? ['--strict'] : [])],
    { cwd: temporaryRoot, encoding: 'utf8' }
  );
}

test('strict bilingual check accepts complete Japanese and English pair', (t) => {
  const result = runChecker(t, ['guide.md', 'guide.en.md']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 paired, 0 missing/);
});

test('strict bilingual check rejects a Japanese page without an English pair', (t) => {
  const result = runChecker(t, ['guide.md']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Strict mode: bilingual pair issues found/);
});

test('strict bilingual check rejects an orphaned English page', (t) => {
  const result = runChecker(t, ['guide.en.md']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /1 orphaned/);
});

test('non-strict mode is still advisory for local use', (t) => {
  const result = runChecker(t, ['guide.md'], false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Run with --strict/);
});

test('doc-quality CI uses strict mode and fails for either check', () => {
  const content = readFileSync(workflow, 'utf8');
  assert.match(content, /npm run check:bilingual -- --strict \| tee bilingual\.log/);
  const gate = content.split('      - name: Fail if document quality check failed')[1];
  assert.ok(gate, 'missing final document-quality failure gate');
  assert.match(gate, /steps\.bilingual\.outcome == 'failure'/);
  assert.match(gate, /steps\.placement\.outcome == 'failure'/);
  assert.match(gate, /exit 1/);
});
