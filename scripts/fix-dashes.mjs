#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Scan all .md files (except node_modules, build, .docusaurus, and build output)
const root = process.cwd();
const excludeDirs = ['node_modules', 'build', '.docusaurus', 'dist', 'public', '.vscode', '.git'];
// Targeted directories/files: only docs folder, .github River Review checklists, and root README/AGENTS
const targetDirs = ['docs', path.join('.github', 'river-review', 'checklists')].map((p) =>
  path.join(root, p)
);
const targetFiles = [path.join(root, 'README.md'), path.join(root, 'AGENTS.md')];

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    const full = path.join(dir, name);
    // Directory entries already carry the type; resolve only symbolic links.
    const stat = entry.isSymbolicLink() ? fs.statSync(full) : entry;
    if (stat.isDirectory()) {
      if (excludeDirs.includes(name) || name.startsWith('.')) continue;
      files.push(...walkDir(full));
    } else if (stat.isFile() && /\.(md|markdown)$/.test(name)) {
      // Skip files in build-like directories
      if (
        full.includes(path.join('build', path.sep)) ||
        full.includes(path.join('.docusaurus', path.sep))
      )
        continue;
      files.push(full);
    }
  }
  return files;
}

function isDigit(c) {
  return /[0-9]/.test(c);
}

function normalizeTextSegment(line) {
  // Replace pattern: space + (en-dash|em-dash) + space -> em-dash (no spaces)
  // But skip numeric ranges where digit (or punct) is on either side
  let modified = false;
  const dashRegex = /\s([\u2013\u2014])\s/g;
  const newLine = line.replace(dashRegex, (match, dash, offset) => {
    // Keep SemVer milestone titles as-is (e.g., "v0.2.0 – Developer Experience")
    // These strings must match GitHub milestone titles exactly in docs and ops.
    const before = line.slice(0, offset);
    const left = line[offset - 1] || '';
    const right = line[offset + match.length] || '';
    if (/\bv\d+\.\d+\.\d+$/u.test(before) && /\p{L}/u.test(right)) return match;
    // skip if numeric on both sides, e.g. 0.0–1.0
    if (isDigit(left) && isDigit(right)) return match; // no change
    modified = true;
    return '—'; // em-dash with no spaces
  });
  return { newLine, modified };
}

function processMarkdownFile(filePath, { check = false } = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inCodeFence = false;
  let changed = false;
  const newLines = [];

  // detect YAML front matter region
  let inFrontMatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Code fence handling
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      newLines.push(line);
      continue;
    }
    if (inCodeFence) {
      newLines.push(line);
      continue;
    }
    // YAML front matter
    if (i === 0 && /^---\s*$/.test(line)) {
      inFrontMatter = true;
      newLines.push(line);
      continue;
    }
    if (inFrontMatter) {
      if (/^---\s*$/.test(line)) {
        inFrontMatter = false;
        newLines.push(line);
        continue;
      }
      // If YAML title key is present, adjust the value only
      const titleMatch = /^title:\s*(.*)$/u.exec(line);
      if (titleMatch) {
        const originalValue = titleMatch[1];
        const { newLine, modified } = normalizeTextSegment(originalValue);
        if (modified) {
          newLines.push(`title: ${newLine}`);
          changed = true;
          continue;
        }
      }
      newLines.push(line);
      continue;
    }

    // Skip markdown table rows. Table cells often use `—` as a placeholder
    // with padding whitespace for alignment, which the dash regex would
    // otherwise collapse. Prettier then reintroduces the padding, causing
    // fix-dashes and prettier to fight in an infinite loop.
    if (/^\s*\|/.test(line)) {
      newLines.push(line);
      continue;
    }

    // Headings: lines starting with # (one or more)
    if (/^#+\s+/.test(line)) {
      const prefix = line.match(/^#+\s+/)[0];
      const rest = line.slice(prefix.length);
      const { newLine, modified } = normalizeTextSegment(rest);
      if (modified) {
        newLines.push(prefix + newLine);
        changed = true;
        continue;
      }
    }

    // For general inline text and list items, normalize mid-sentence dashes that have spaces around
    if (!inFrontMatter && !inCodeFence && /\s[\u2013\u2014]\s/.test(line)) {
      const { newLine, modified } = normalizeTextSegment(line);
      if (modified) {
        newLines.push(newLine);
        changed = true;
        continue;
      }
    }

    newLines.push(line);
  }

  if (changed && !check) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }
  return changed;
}

function collectTargetFiles() {
  const list = new Set();
  for (const td of targetDirs) {
    if (fs.existsSync(td)) {
      listAdd(walkDir(td), list);
    }
  }
  for (const tf of targetFiles) {
    if (fs.existsSync(tf)) list.add(tf);
  }
  return Array.from(list);
}

function listAdd(arr, set) {
  for (const a of arr) set.add(a);
}

function main() {
  const check = process.argv.includes('--check');
  const files = collectTargetFiles();
  const modifiedFiles = [];
  let failed = false;
  for (const file of files) {
    try {
      const changed = processMarkdownFile(file, { check });
      if (changed) modifiedFiles.push(file);
    } catch (err) {
      failed = true;
      console.error(`Error processing ${file}:`, err.message);
    }
  }
  if (failed) process.exitCode = 1;
  if (modifiedFiles.length === 0) {
    if (failed) return;
    console.log('No heading/title dash normalizations needed.');
    process.exit(0);
  }
  if (check) {
    console.error('Files need dash normalization (run `node scripts/fix-dashes.mjs` to fix):');
    for (const f of modifiedFiles) console.error(' -', f);
    process.exit(1);
  }
  console.log('Modified files:');
  for (const f of modifiedFiles) console.log(' -', f);
}

main();
