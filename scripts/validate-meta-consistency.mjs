import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isDirectRun } from './lib/is-direct-run.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

async function readJson(filePath) {
  const raw = await fs.readFile(path.join(ROOT, filePath), 'utf8');
  return JSON.parse(raw);
}

async function readText(filePath) {
  return fs.readFile(path.join(ROOT, filePath), 'utf8');
}

/**
 * Extract all @vX.Y.Z action tag references from text.
 */
export function extractActionTags(text) {
  const matches = text.match(/river-review\/runners\/github-action@v[\d.]+/g) || [];
  return [...new Set(matches.map((m) => m.split('@')[1]))];
}

/**
 * Extract "Latest release: [vX.Y.Z]" version from text.
 */
export function extractLatestRelease(text) {
  const match = text.match(/(?:最新リリース|Latest release):\s*\[v([\d.]+)\]/);
  return match ? match[1] : null;
}

const MARKER_START = '<!-- x-release-please-start-version -->';
const MARKER_END = '<!-- x-release-please-end -->';
const LATEST_RELEASE_LINE = /(?:最新リリース|Latest release):\s*\[v[\d.]+\]/;

/**
 * Check that release-please start/end markers pair up 1:1 and that the
 * "Latest release" line sits inside a marker block.
 * Returns array of problem descriptions (empty = pass).
 */
export function checkReleaseMarkers(text) {
  const problems = [];
  let openLine = null;
  let releaseInside = false;
  let releaseFound = false;
  text.split('\n').forEach((line, i) => {
    const lineNo = i + 1;
    if (line.includes(MARKER_START)) {
      if (openLine !== null) {
        problems.push(`start marker at line ${openLine} has no matching end marker`);
      }
      openLine = lineNo;
    } else if (line.includes(MARKER_END)) {
      if (openLine === null) {
        problems.push(`end marker at line ${lineNo} has no matching start marker`);
      }
      openLine = null;
    } else if (LATEST_RELEASE_LINE.test(line)) {
      releaseFound = true;
      if (openLine !== null) releaseInside = true;
    }
  });
  if (openLine !== null) {
    problems.push(`start marker at line ${openLine} has no matching end marker`);
  }
  if (!text.includes(MARKER_START)) problems.push(`missing ${MARKER_START}`);
  if (!text.includes(MARKER_END)) problems.push(`missing ${MARKER_END}`);
  if (releaseFound && !releaseInside) {
    problems.push('"Latest release" line is outside the release-please marker block');
  }
  return problems;
}

/**
 * Validate meta-consistency across README and package.json.
 * Returns array of error strings (empty = pass).
 */
export async function validateMeta() {
  const errors = [];

  const pkg = await readJson('package.json');
  const expectedVersion = pkg.version; // e.g. "0.10.0"

  // README / README.en.md は release-please の extra-files で "Latest release" 行のみ
  // 自動更新される（#592）。action tag 例はチュートリアル用途で pinned だが、
  // ファイル内での一貫性（全 tag 参照が同じバージョン）は引き続き検証する。
  const releaseTrackedFiles = ['README.md', 'README.en.md'];
  for (const readmePath of releaseTrackedFiles) {
    const text = await readText(readmePath);

    // Check "Latest release" matches package.json.
    // Null = 行が見つからない（マーカー削除や regex 不一致）= release-please
    // 自動同期が効かなくなる前兆のため明示エラー化する。
    const releaseVersion = extractLatestRelease(text);
    if (releaseVersion === null) {
      errors.push(
        `${readmePath}: "Latest release" line not found; release-please extra-files sync is broken`
      );
    } else if (releaseVersion !== expectedVersion) {
      errors.push(
        `${readmePath}: "Latest release" says v${releaseVersion}, expected v${expectedVersion}`
      );
    }

    for (const problem of checkReleaseMarkers(text)) {
      errors.push(`${readmePath}: ${problem}; release-please extra-files sync is broken`);
    }

    // Check all action tag references within the file are internally consistent
    const tags = extractActionTags(text);
    if (tags.length > 1) {
      errors.push(`${readmePath}: action tag references are inconsistent: ${tags.join(', ')}`);
    }
  }

  // docs/use-cases/github-actions.md はチュートリアル資料のため、
  // ファイル内 tag 一貫性のみ検証する（package.json との一致は不要）。
  const tutorialFiles = ['docs/use-cases/github-actions.md'];
  for (const tutorialPath of tutorialFiles) {
    const text = await readText(tutorialPath);
    const tags = extractActionTags(text);
    if (tags.length > 1) {
      errors.push(`${tutorialPath}: action tag references are inconsistent: ${tags.join(', ')}`);
    }
  }

  // Check homepage URL
  const homepage = pkg.homepage || '';
  if (!homepage.startsWith('https://river-review.the3396.com')) {
    errors.push(
      `package.json: homepage "${homepage}" should point to https://river-review.the3396.com`
    );
  }

  return errors;
}

// CLI entry point
if (isDirectRun(import.meta.url)) {
  validateMeta()
    .then((errors) => {
      if (errors.length === 0) {
        console.log('Meta consistency: OK');
        return 0;
      }
      console.error(`Meta consistency: ${errors.length} error(s) found`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      return 1;
    })
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Meta consistency check failed: ${err.message}`);
      process.exitCode = 1;
    });
}
