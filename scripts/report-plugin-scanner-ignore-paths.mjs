#!/usr/bin/env node
/**
 * Report changes to .plugin-scanner.toml ignore_paths as Markdown.
 *
 * Usage:
 *   node scripts/report-plugin-scanner-ignore-paths.mjs --before <toml> --after <toml>
 *   node scripts/report-plugin-scanner-ignore-paths.mjs --before <toml> --after <toml> --max-files 20
 *
 * Exit codes:
 *   0 — report emitted
 *   2 — invalid arguments or unreadable input
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_FILES = 20;

export function parseIgnorePaths(toml) {
  const match = /(^|\n)\s*ignore_paths\s*=\s*\[/m.exec(toml);
  if (!match) return [];

  const entries = [];
  const start = match.index + match[0].length;
  let values = '';
  let quote = null;
  let escaped = false;
  let inComment = false;
  for (let i = start; i < toml.length; i++) {
    const char = toml[i];
    if (inComment) {
      if (char === '\n') {
        inComment = false;
        values += char;
      }
      continue;
    }
    if (quote) {
      values += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      values += char;
    } else if (char === '#') {
      inComment = true;
    } else if (char === ']') {
      break;
    } else {
      values += char;
    }
  }
  const quoted = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  for (const value of values.matchAll(quoted)) {
    const raw = value[1] ?? value[2];
    entries.push(raw.replace(/\\([\\"'])/g, '$1'));
  }
  return entries;
}

export function globToRegExp(pattern) {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) source += '\\[';
      else {
        const body = pattern.slice(i + 1, close);
        source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        i = close;
      }
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

export function matchingFiles(pattern, files) {
  const expression = globToRegExp(pattern);
  return files.filter((file) => expression.test(file));
}

export function compareIgnorePaths(beforeToml, afterToml, files) {
  const before = new Set(parseIgnorePaths(beforeToml));
  const after = new Set(parseIgnorePaths(afterToml));
  const added = [...after].filter((path) => !before.has(path));
  const removed = [...before].filter((path) => !after.has(path));
  return {
    added: added.map((pattern) => ({ pattern, files: matchingFiles(pattern, files) })),
    removed: removed.map((pattern) => ({ pattern, files: matchingFiles(pattern, files) })),
  };
}

function formatChange(heading, changes, maxFiles) {
  const lines = [`#### ${heading}`, ''];
  if (changes.length === 0) return [...lines, 'なし', ''];
  for (const { pattern, files } of changes) {
    lines.push(`- \`${pattern}\` — ${files.length} 件`);
    for (const file of files.slice(0, maxFiles)) lines.push(`  - \`${file}\``);
    if (files.length > maxFiles) lines.push(`  - ほか ${files.length - maxFiles} 件`);
  }
  lines.push('');
  return lines;
}

export function formatReport(report, maxFiles = DEFAULT_MAX_FILES) {
  return [
    '### Plugin scanner の除外対象変更',
    '',
    'この通知は注意喚起のみであり、マージをブロックしません。',
    '',
    ...formatChange(
      '追加された `ignore_paths`（新たに検査対象外になるファイル）',
      report.added,
      maxFiles
    ),
    ...formatChange(
      '削除された `ignore_paths`（検査対象に戻るファイル）',
      report.removed,
      maxFiles
    ),
  ].join('\n');
}

function parseArgs(argv) {
  const args = { before: null, after: null, maxFiles: DEFAULT_MAX_FILES };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--before') args.before = argv[++i] ?? null;
    else if (argv[i] === '--after') args.after = argv[++i] ?? null;
    else if (argv[i] === '--max-files') args.maxFiles = Number(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.before || !args.after || !Number.isInteger(args.maxFiles) || args.maxFiles < 1) {
    throw new Error('usage: --before <toml> --after <toml> [--max-files <positive integer>]');
  }
  return args;
}

export function trackedFiles(run = execFileSync) {
  return run('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

export function main(argv = process.argv.slice(2), run = execFileSync) {
  const args = parseArgs(argv);
  const report = compareIgnorePaths(
    readFileSync(args.before, 'utf8'),
    readFileSync(args.after, 'utf8'),
    trackedFiles(run)
  );
  process.stdout.write(`${formatReport(report, args.maxFiles)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`plugin scanner ignore-path report failed: ${error.message}`);
    process.exitCode = 2;
  }
}
