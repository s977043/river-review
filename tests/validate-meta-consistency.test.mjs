import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  checkReleaseMarkers,
  extractActionTags,
  extractLatestRelease,
  validateMeta,
} from '../scripts/validate-meta-consistency.mjs';

test('extractActionTags finds versioned tags', () => {
  const text = `
    uses: s977043/river-review/runners/github-action@v0.10.0
    uses: s977043/river-review/runners/github-action@v0.10.0
  `;
  const tags = extractActionTags(text);
  assert.deepEqual(tags, ['v0.10.0']);
});

test('extractActionTags finds multiple different tags', () => {
  const text = `
    uses: s977043/river-review/runners/github-action@v0.10.0
    uses: s977043/river-review/runners/github-action@v0.5.0
  `;
  const tags = extractActionTags(text);
  assert.equal(tags.length, 2);
  assert.ok(tags.includes('v0.10.0'));
  assert.ok(tags.includes('v0.5.0'));
});

test('extractActionTags returns empty for no matches', () => {
  assert.deepEqual(extractActionTags('no tags here'), []);
});

test('extractLatestRelease finds Japanese format', () => {
  const text = '最新リリース: [v0.10.0](https://example.com)';
  assert.equal(extractLatestRelease(text), '0.10.0');
});

test('extractLatestRelease finds English format', () => {
  const text = 'Latest release: [v0.10.0](https://example.com)';
  assert.equal(extractLatestRelease(text), '0.10.0');
});

test('extractLatestRelease returns null for no match', () => {
  assert.equal(extractLatestRelease('no release here'), null);
});

test('validateMeta passes on current repo state', async () => {
  const errors = await validateMeta();
  assert.deepEqual(errors, [], `Expected no errors but got: ${errors.join(', ')}`);
});

const START = '<!-- x-release-please-start-version -->';
const END = '<!-- x-release-please-end -->';
const RELEASE = 'Latest release: [v1.0.0](https://example.com)';

test('checkReleaseMarkers passes when release line is inside paired markers', () => {
  assert.deepEqual(checkReleaseMarkers([START, '', RELEASE, '', END].join('\n')), []);
});

test('checkReleaseMarkers reports both markers missing', () => {
  const problems = checkReleaseMarkers(RELEASE);
  assert.ok(problems.some((p) => p.includes(`missing ${START}`)));
  assert.ok(problems.some((p) => p.includes(`missing ${END}`)));
  assert.ok(problems.some((p) => p.includes('outside')));
});

test('checkReleaseMarkers reports missing end marker only', () => {
  const problems = checkReleaseMarkers([START, RELEASE].join('\n'));
  assert.ok(problems.some((p) => p.includes(`missing ${END}`)));
  assert.ok(problems.some((p) => p.includes('line 1 has no matching end')));
  assert.ok(!problems.some((p) => p.includes(`missing ${START}`)));
});

test('checkReleaseMarkers reports release line outside markers', () => {
  const problems = checkReleaseMarkers([START, END, RELEASE].join('\n'));
  assert.deepEqual(problems, [
    '"Latest release" line at line 3 is outside the release-please marker block',
  ]);
});

test('checkReleaseMarkers reports a duplicate start before end', () => {
  const problems = checkReleaseMarkers([START, START, RELEASE, END].join('\n'));
  assert.deepEqual(problems, ['start marker at line 1 has no matching end marker']);
});

test('checkReleaseMarkers reports end placed before start', () => {
  const problems = checkReleaseMarkers([END, RELEASE, START].join('\n'));
  assert.ok(problems.includes('end marker at line 1 has no matching start marker'));
  assert.ok(problems.includes('start marker at line 3 has no matching end marker'));
  assert.ok(problems.some((p) => p.includes('line 2 is outside')));
});

test('checkReleaseMarkers accepts CRLF line endings', () => {
  assert.deepEqual(checkReleaseMarkers([START, RELEASE, END, ''].join('\r\n')), []);
});

test('checkReleaseMarkers handles markers and release on the same line', () => {
  assert.deepEqual(checkReleaseMarkers(`${START} ${RELEASE} ${END}`), []);
  assert.deepEqual(checkReleaseMarkers(`${START} ${END} ${RELEASE}`), [
    '"Latest release" line at line 1 is outside the release-please marker block',
  ]);
});

test('validateMeta reports broken markers through the production path', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const readText = async (filePath) => {
    const text = await fs.readFile(path.join(root, filePath), 'utf8');
    return filePath === 'README.md' ? text.replace(END, '') : text;
  };
  const errors = await validateMeta({ readText });
  assert.ok(
    errors.some(
      (e) =>
        e.startsWith('README.md: missing <!-- x-release-please-end -->') &&
        e.includes('release-please extra-files sync is broken')
    ),
    `got: ${errors.join(', ')}`
  );
});
