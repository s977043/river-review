// Integration test for #692 PR-C: redaction & path-level deny wired into
// collectRepoContext. Builds a temp repo with intentionally sensitive files
// and verifies that:
//   - shouldExcludeForContext keeps `.env` etc. out of the collected sections
//   - redactText masks an inline-leaked token in a regular .ts file
//   - the wiring exposes redactionHits + excludedPaths on the result so
//     local-runner.mjs can surface them on reviewDebug.repoContextSecurity.
//   - #2033 AC3: the result also carries `redactionPatternIds`, the category
//     set the redactor searched for, so a consumer cannot read an empty hit
//     tally as "exhaustively clean".

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { collectRepoContext } from '../src/lib/repo-context.mjs';
import { REDACTION_PATTERN_IDS } from '../src/lib/secret-redactor.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';

function setupRepo() {
  const dir = createTempDir({ prefix: 'river-redact-ctx-' });

  // 1. A .env file at repo root — must be excluded by DEFAULT_DENY_GLOBS.
  writeFileSync(join(dir, '.env'), 'API_KEY=do_not_collect_this\n', 'utf8');

  // 2. A regular source file that accidentally leaks an inline GitHub PAT.
  //    Path is allowed but content must be redacted.
  mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
  // Build the token at runtime so GitHub Push Protection does not flag the
  // fixture itself as a real secret (same trick as tests/secret-redactor.test.mjs).
  const ghpat =
    'ghp_' + ['kZpL3xQ8mNvW', '5tJfRy2HcBd9', 'eAuQs7TgwY1i', 'OzMrPqXdLcVy'].join('').slice(0, 36);
  writeFileSync(
    join(dir, 'src', 'lib', 'leaky.mjs'),
    [
      'export const SOME_CONSTANT = 1;',
      '// Hardcoded token (to be redacted at collection time):',
      'export const TOKEN = "' + ghpat + '";',
      '',
    ].join('\n'),
    'utf8'
  );

  // 3. A test file that should be picked up alongside the source.
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'tests', 'leaky.test.mjs'), 'test("ok", () => {});\n', 'utf8');

  return dir;
}

test('collectRepoContext excludes .env via DEFAULT_DENY_GLOBS', async () => {
  const dir = setupRepo();
  try {
    const result = await collectRepoContext({
      changedFiles: ['.env', 'src/lib/leaky.mjs'],
      repoRoot: dir,
    });
    // No section should include the `.env` content.
    for (const sec of result.sections) {
      assert.equal(sec.content.includes('do_not_collect_this'), false, 'leaked .env content');
    }
    // The exclusion is recorded on the result.
    assert.ok(
      result.excludedPaths.some((e) => e.path === '.env'),
      JSON.stringify(result.excludedPaths)
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('collectRepoContext redacts an inline leaked token in a tracked source file', async () => {
  const dir = setupRepo();
  try {
    const result = await collectRepoContext({
      changedFiles: ['src/lib/leaky.mjs'],
      repoRoot: dir,
    });
    const fullFile = result.sections.find((s) => s.label.startsWith('Full file:'));
    assert.ok(fullFile, 'expected fullFile section');
    // The original ghp_ string must be gone.
    assert.equal(
      /ghp_[A-Za-z0-9]{36,}/.test(fullFile.content),
      false,
      'unredacted GitHub PAT in collected section: ' + fullFile.content
    );
    // The replacement marker is present.
    assert.match(fullFile.content, /<REDACTED:githubToken>/);
    // Telemetry recorded.
    assert.ok(
      result.redactionHits.some((h) => h.category === 'githubToken'),
      JSON.stringify(result.redactionHits)
    );
    // #2033 AC3: the applied pattern set travels with the tally and is the
    // module's own list, not a copy maintained here.
    assert.deepEqual(result.redactionPatternIds, [...REDACTION_PATTERN_IDS]);
  } finally {
    cleanupTempDir(dir);
  }
});

test('collectRepoContext skips redaction when security.redact.enabled is false', async () => {
  const dir = setupRepo();
  try {
    const result = await collectRepoContext({
      changedFiles: ['src/lib/leaky.mjs'],
      repoRoot: dir,
      security: { redact: { enabled: false } },
    });
    const fullFile = result.sections.find((s) => s.label.startsWith('Full file:'));
    assert.ok(fullFile);
    // With redaction disabled, the raw token survives. (Path-level deny still
    // runs — that is independent of redact.enabled.)
    assert.match(fullFile.content, /ghp_[A-Za-z0-9]{36,}/);
    assert.equal(result.redactionHits.length, 0);
    // #2033 AC3: with the redactor off, NO category was searched for. An
    // empty hit tally is indistinguishable from a clean scan, so the
    // pattern list must be empty here rather than claim full coverage.
    assert.deepEqual(result.redactionPatternIds, []);
  } finally {
    cleanupTempDir(dir);
  }
});

test('collectRepoContext honors caller denyFiles in addition to defaults', async () => {
  const dir = setupRepo();
  // Add a vendor file that is fine by default but the caller wants excluded.
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  writeFileSync(join(dir, 'vendor', 'lib.mjs'), 'export const x = 1;\n', 'utf8');
  try {
    const result = await collectRepoContext({
      changedFiles: ['vendor/lib.mjs', 'src/lib/leaky.mjs'],
      repoRoot: dir,
      security: { redact: { denyFiles: ['vendor/**'] } },
    });
    // vendor/lib.mjs should not appear as a Full file section.
    assert.equal(
      result.sections.some((s) => s.label.includes('vendor/lib.mjs')),
      false
    );
    assert.ok(
      result.excludedPaths.some((e) => e.path === 'vendor/lib.mjs'),
      JSON.stringify(result.excludedPaths)
    );
    // src/lib/leaky.mjs is unaffected.
    assert.ok(result.sections.some((s) => s.label.includes('src/lib/leaky.mjs')));
  } finally {
    cleanupTempDir(dir);
  }
});

test('#2033 AC3 redactionPatternIds is non-empty even when nothing was hit', async () => {
  const dir = createTempDir({ prefix: 'river-redact-clean-' });
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'clean.mjs'), 'export const x = 1;\n', 'utf8');
    const result = await collectRepoContext({
      changedFiles: ['src/clean.mjs'],
      repoRoot: dir,
    });
    // This is the case the bare tally cannot describe: the redactor ran and
    // found nothing. `redactionHits: []` alone reads as "no secret remains";
    // the pattern ids say which categories that statement actually covers.
    assert.equal(result.redactionHits.length, 0);
    assert.ok(result.redactionPatternIds.length > 0);
    assert.deepEqual(result.redactionPatternIds, [...REDACTION_PATTERN_IDS]);
  } finally {
    cleanupTempDir(dir);
  }
});
