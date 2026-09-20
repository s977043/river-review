// after-change adapter (#2275 PR-3C). These tests drive the PRODUCTION wiring:
// `runAfterChangeCheckpoint` exposes no injection point, the trusted allowlist
// is a real file, and the command that runs is a real `/usr/bin/true`, so
// nothing here is a stub standing in for the path that actually runs (PR #2304
// review: every test injecting `runGatesImpl` left the default unpinned).
//
// Scope of the #2275 "Security / adversarial tests" list covered here: 6
// (prerequisite miss is never a pass), 8 (duplicate occurrence), 9 (no model
// invocation), 10 (no gate/decision/merge authority). Items 1-5 and 7 are
// executor / sandbox / core invariants pinned in
// tests/deterministic-command-*.test.mjs and tests/fast-verification.test.mjs.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AFTER_CHANGE_EVENT,
  AFTER_CHANGE_OPT_IN_ENV,
  AfterChangeAdapterError,
  isAfterChangeObserveEnabled,
  parseChangedFileStatus,
  runAfterChangeCheckpoint,
} from '../src/lib/after-change-adapter.mjs';
import { ALLOWLIST_RELATIVE_PATH } from '../src/lib/deterministic-command-orchestrator.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SUBJECT = 'b'.repeat(40);
/** A real, argument-free, always-succeeding binary present on macOS and Linux. */
const TRUE_BIN = '/usr/bin/true';

const tempDirs = [];
after(async () => {
  for (const dir of tempDirs) await fs.rm(dir, { recursive: true, force: true });
});

async function makeTempDir(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const readRegistry = async () =>
  JSON.parse(await fs.readFile(path.join(repoRoot, 'flows/entry-map.json'), 'utf8'));

async function makeTrustedTree() {
  const dir = await makeTempDir('river-afterchange-trusted-');
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  await fs.writeFile(
    allowlistPath,
    ['version: 1', 'commands:', `  - command: ${TRUE_BIN}`, '    selfContained: true'].join('\n'),
    'utf8'
  );
  return dir;
}

const skill = (id, command = TRUE_BIN) => ({
  id,
  metadata: { deterministicGate: { command, args: [] } },
});

// --- deletion declaration (the core of this PR) ------------------------------

test('parseChangedFileStatus declares deletions from the status letters', () => {
  const parsed = parseChangedFileStatus(
    [
      'M\tsrc/kept.mjs',
      'A\tsrc/added.mjs',
      'D\tsrc/gone.mjs',
      'R100\tsrc/old.mjs\tsrc/new.mjs',
    ].join('\n')
  );
  assert.deepEqual(parsed.changedFiles, [
    'src/added.mjs',
    'src/gone.mjs',
    'src/kept.mjs',
    'src/new.mjs',
    'src/old.mjs',
  ]);
  // A rename removes the old path, so it is declared deleted alongside `D`.
  assert.deepEqual(parsed.deletedFiles, ['src/gone.mjs', 'src/old.mjs']);
  // Every declared deletion is in scope: the core drops any that is not, and a
  // deletion it drops stops excusing its file from being staged.
  for (const file of parsed.deletedFiles) assert.ok(parsed.changedFiles.includes(file));
});

test('parseChangedFileStatus ignores lines it cannot read rather than guessing', () => {
  const parsed = parseChangedFileStatus('D\n\nM\tsrc/a.mjs\nR100\tonly-one-field\n');
  assert.deepEqual(parsed.changedFiles, ['src/a.mjs']);
  assert.deepEqual(parsed.deletedFiles, []);
  assert.deepEqual(parseChangedFileStatus(undefined), { changedFiles: [], deletedFiles: [] });
});

test('a change that DELETES a file still produces a real verdict (not unrunnable)', async () => {
  const trustedTree = await makeTrustedTree();
  const reviewSourceDir = await makeTempDir('river-afterchange-src-');
  await fs.writeFile(path.join(reviewSourceDir, 'kept.txt'), 'kept', 'utf8');
  // `gone.txt` is deliberately NOT written: the change removed it.
  const { changedFiles, deletedFiles } = parseChangedFileStatus('M\tkept.txt\nD\tgone.txt');

  const evidence = await runAfterChangeCheckpoint({
    registry: await readRegistry(),
    subjectRevision: SUBJECT,
    changedFiles,
    deletedFiles,
    selected: [skill('skill-true')],
    trustedTree,
    reviewSourceDir,
  });

  assert.equal(evidence.status, 'pass', JSON.stringify(evidence.checks));
  const [check] = evidence.checks;
  assert.equal(check.status, 'pass');
  assert.equal(check.staging.complete, true);
  assert.deepEqual(check.staging.deleted, ['gone.txt']);
  assert.equal(check.staging.requested, 1);
});

test('MUTATION (a): withholding deletedFiles makes the same change unrunnable', async () => {
  const trustedTree = await makeTrustedTree();
  const reviewSourceDir = await makeTempDir('river-afterchange-src-nodel-');
  await fs.writeFile(path.join(reviewSourceDir, 'kept.txt'), 'kept', 'utf8');
  const { changedFiles } = parseChangedFileStatus('M\tkept.txt\nD\tgone.txt');

  const evidence = await runAfterChangeCheckpoint({
    registry: await readRegistry(),
    subjectRevision: SUBJECT,
    changedFiles,
    // deletedFiles deliberately omitted — the mutation this PR exists to block.
    selected: [skill('skill-true')],
    trustedTree,
    reviewSourceDir,
  });

  assert.equal(evidence.status, 'unrunnable');
  assert.equal(evidence.checks[0].status, 'unrunnable');
  assert.equal(evidence.checks[0].supersededStatus, 'pass');
});

// --- host neutrality ---------------------------------------------------------

test('MUTATION (b): no host vocabulary reaches the adapter module or the core', async () => {
  const hostWords = /PostToolUse|tool_input|tool_name|MultiEdit|CLAUDE_PROJECT_DIR|hook/i;
  for (const file of ['src/lib/after-change-adapter.mjs', 'src/lib/fast-verification.mjs']) {
    const source = await fs.readFile(path.join(repoRoot, file), 'utf8');
    // Comments explain the boundary; the CODE must not name the host. Strip
    // comment lines and block comments, then assert on what is left.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!hostWords.test(code), `${file} names host vocabulary in code`);
  }
  // The host vocabulary does live somewhere: the shell boundary.
  const shell = await fs.readFile(
    path.join(repoRoot, '.claude/hooks/after-change-observe.sh'),
    'utf8'
  );
  assert.match(shell, /tool_name/);
});

test('the adapter imports no model, network or host module', async () => {
  const source = await fs.readFile(path.join(repoRoot, 'src/lib/after-change-adapter.mjs'), 'utf8');
  const imports = [...source.matchAll(/^import[^;]*from\s+'([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./fast-verification.mjs', './trigger-resolver.mjs']);
});

// --- opt-in / no authority ---------------------------------------------------

test('MUTATION (c): observe is off unless the environment says exactly 1', () => {
  assert.equal(isAfterChangeObserveEnabled(undefined), false);
  assert.equal(isAfterChangeObserveEnabled({}), false);
  for (const value of ['', '0', 'true', 'yes', 'on', '1 ', ' 1']) {
    assert.equal(
      isAfterChangeObserveEnabled({ [AFTER_CHANGE_OPT_IN_ENV]: value }),
      false,
      `"${value}" must not enable the checkpoint`
    );
  }
  assert.equal(isAfterChangeObserveEnabled({ [AFTER_CHANGE_OPT_IN_ENV]: '1' }), true);
});

test('the checkpoint is observe-only and carries no gate or merge authority', async () => {
  const evidence = await runAfterChangeCheckpoint({
    registry: await readRegistry(),
    subjectRevision: SUBJECT,
    changedFiles: ['a.txt'],
    selected: [],
  });
  assert.equal(evidence.mode, 'observe');
  assert.equal(evidence.triggerId, AFTER_CHANGE_EVENT);
  // Adversarial item 6: no check selected is `skipped` with a reason, not pass.
  assert.equal(evidence.status, 'skipped');
  assert.equal(evidence.reasonCode, 'no-deterministic-check-selected');
  for (const field of ['strictBlock', 'blocking', 'decision', 'merge', 'verdict']) {
    assert.equal(
      Object.hasOwn(evidence, field),
      false,
      `evidence must not carry a ${field} authority field`
    );
  }
});

test('adversarial item 6: a missing trusted allowlist is bypassed, never pass', async () => {
  const evidence = await runAfterChangeCheckpoint({
    registry: await readRegistry(),
    subjectRevision: SUBJECT,
    changedFiles: ['a.txt'],
    selected: [skill('skill-true')],
    trustedTree: path.join(await makeTempDir('river-afterchange-notrust-'), 'absent'),
  });
  assert.equal(evidence.status, 'bypassed');
  assert.equal(evidence.reasonCode, 'trusted-allowlist-absent');
});

test('adversarial item 8: the same occurrence on the same revision is skipped', async () => {
  const reviewSourceDir = await makeTempDir('river-afterchange-src-dup-');
  await fs.writeFile(path.join(reviewSourceDir, 'a.txt'), 'a', 'utf8');
  const args = {
    registry: await readRegistry(),
    subjectRevision: SUBJECT,
    changedFiles: ['a.txt'],
    selected: [skill('skill-true')],
    trustedTree: await makeTrustedTree(),
    reviewSourceDir,
  };
  const first = await runAfterChangeCheckpoint(args);
  const second = await runAfterChangeCheckpoint({
    ...args,
    seenOccurrences: [first.occurrenceKey],
  });
  assert.equal(second.status, 'skipped');
  assert.equal(second.reasonCode, 'duplicate-occurrence');
});

test('a registry that is not an object is refused, not defaulted', async () => {
  await assert.rejects(
    () => runAfterChangeCheckpoint({ subjectRevision: SUBJECT }),
    AfterChangeAdapterError
  );
});
