#!/usr/bin/env node
// Node side of the after-change observe adapter (#2275 PR-3C, Epic #2054).
//
// The host vocabulary (`PostToolUse`, the tool name, the tool payload) is
// translated in `after-change-observe.sh` and never reaches here: what this
// file reads on stdin is already neutral — a project root, a subject revision,
// and the `git diff --name-status` text describing the change. It converts
// that into the neutral `after-change` event via `src/lib/after-change-adapter.mjs`
// and writes the resulting evidence.
//
// It never blocks: every failure is written to the evidence line and exits 0.
// A checkpoint that could not run is reported as such, never as success.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseChangedFileStatus,
  runAfterChangeCheckpoint,
} from '../../src/lib/after-change-adapter.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const fail = (reason) => {
  // Not a silent success: the reason is printed and no evidence file claims a
  // verdict was reached.
  process.stdout.write(`[river-review:after-change] not run (${reason})\n`);
  process.exit(0);
};

const raw = await readStdin();
let request;
try {
  request = JSON.parse(raw);
} catch {
  fail('unreadable adapter input');
}

const { projectRoot, subjectRevision, nameStatus, trustedTree, selectedFile, outFile } =
  request ?? {};
if (typeof projectRoot !== 'string' || typeof subjectRevision !== 'string') {
  fail('adapter input is missing projectRoot or subjectRevision');
}

let selected = [];
if (typeof selectedFile === 'string' && selectedFile.length > 0) {
  try {
    const parsed = JSON.parse(fs.readFileSync(selectedFile, 'utf8'));
    if (!Array.isArray(parsed)) fail('selected-checks file is not a JSON array');
    selected = parsed;
  } catch (error) {
    fail(`selected-checks file unreadable: ${error?.code ?? 'error'}`);
  }
}

const { changedFiles, deletedFiles } = parseChangedFileStatus(nameStatus);

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
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  } catch {
    process.stdout.write('[river-review:after-change] evidence could not be written\n');
  }
}

process.stdout.write(
  `[river-review:after-change] status=${evidence.status} reason=${evidence.reasonCode} checks=${evidence.checks.length} files=${evidence.changedFiles.length}\n`
);
process.exit(0);
