#!/usr/bin/env node
// Node side of the after-change observe adapter (#2275 PR-3C, Epic #2054).
//
// The host vocabulary (`PostToolUse`, the tool name, the tool payload) is
// translated in `after-change-observe.sh` and never reaches here: what this
// file reads on stdin is already neutral — a project root, a subject revision,
// and git's own record of what changed. It converts that into the neutral
// `after-change` event via `src/lib/after-change-adapter.mjs` and writes the
// resulting evidence.
//
// It never blocks: every failure prints a `not run (...)` line and exits 0. A
// checkpoint that could not run is reported as such, never as success.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAfterChangeObserveEnabled,
  parseChangedFileStatus,
  runAfterChangeCheckpoint,
} from '../../src/lib/after-change-adapter.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const fail = (reason) => {
  process.stdout.write(`[river-review:after-change] not run (${reason})\n`);
  process.exit(0);
};

// The opt-in is re-checked HERE, not only in the shell. The shell gate is the
// one a host trips over, but this file is directly executable, and a switch
// with no consumer on the path that actually runs is a declaration, not a gate.
if (!isAfterChangeObserveEnabled(process.env)) fail('not opted in');

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const raw = await readStdin();
let request;
try {
  request = JSON.parse(raw);
} catch {
  fail('unreadable adapter input');
}

const {
  projectRoot,
  subjectRevision,
  nameStatusZBase64,
  untrackedZBase64,
  trustedTree,
  selectedFile,
  outFile,
} = request ?? {};
if (typeof projectRoot !== 'string' || typeof subjectRevision !== 'string') {
  fail('adapter input is missing projectRoot or subjectRevision');
}

const decode = (value) =>
  typeof value === 'string' && value.length > 0
    ? Buffer.from(value, 'base64').toString('utf8')
    : '';

let selected = [];
if (typeof selectedFile === 'string' && selectedFile.length > 0) {
  try {
    const parsed = JSON.parse(fs.readFileSync(selectedFile, 'utf8'));
    if (!Array.isArray(parsed)) fail('selected-checks file is not a JSON array');
    // An entry that is not an object cannot carry a deterministic gate, and a
    // list of them would be silently read as "nothing selected" — the same
    // reason-less skip a broken file must not be able to produce.
    if (
      parsed.some((entry) => entry == null || typeof entry !== 'object' || Array.isArray(entry))
    ) {
      fail('selected-checks file has an entry that is not an object');
    }
    selected = parsed;
  } catch (error) {
    fail(`selected-checks file unreadable: ${error?.code ?? 'error'}`);
  }
}

const { changedFiles, deletedFiles } = parseChangedFileStatus(decode(nameStatusZBase64), {
  untrackedZ: decode(untrackedZBase64),
});

let evidence;
try {
  evidence = await runAfterChangeCheckpoint({
    registry: JSON.parse(fs.readFileSync(path.join(repoRoot, 'flows/entry-map.json'), 'utf8')),
    subjectRevision,
    changedFiles,
    deletedFiles,
    selected,
    trustedTree:
      typeof trustedTree === 'string' && trustedTree.length > 0 ? trustedTree : undefined,
    reviewSourceDir: projectRoot,
  });
} catch (error) {
  fail(`checkpoint error: ${error?.name ?? 'Error'}`);
}

if (typeof outFile === 'string' && outFile.length > 0) {
  // The evidence lands under a world-writable temp root, so the directory and
  // the file are both created defensively: private mode, and never through a
  // symlink another local user planted first. `O_EXCL` makes the file creation
  // refuse a symlink outright, and the directory is checked with `lstat`
  // because `mkdir -p` happily walks into one.
  const outDir = path.dirname(outFile);
  try {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(outDir);
    if (stat.isSymbolicLink()) {
      fail('evidence directory is a symlink');
    } else {
      fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
    }
  } catch {
    process.stdout.write('[river-review:after-change] evidence could not be written\n');
  }
}

process.stdout.write(
  `[river-review:after-change] status=${evidence.status} reason=${evidence.reasonCode} checks=${evidence.checks.length} files=${evidence.changedFiles.length}\n`
);
process.exit(0);
