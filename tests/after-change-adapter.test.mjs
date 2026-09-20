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

/** `git diff -z --name-status` / `git ls-files -z` emit NUL-delimited records. */
const z = (...fields) => fields.join('\0') + '\0';

const skill = (id, command = TRUE_BIN) => ({
  id,
  metadata: { deterministicGate: { command, args: [] } },
});

// --- deletion declaration (the core of this PR) ------------------------------

test('parseChangedFileStatus declares deletions from the status letters', () => {
  const parsed = parseChangedFileStatus(
    z(
      'M',
      'src/kept.mjs',
      'A',
      'src/added.mjs',
      'D',
      'src/gone.mjs',
      'R100',
      'src/old.mjs',
      'src/new.mjs'
    )
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
});

test('B1: an untracked file is part of the change, not invisible to it', () => {
  // `git diff --name-status HEAD` reports ONLY tracked paths, so the newly
  // created file — the most common result of a Write — appears only in
  // `--others`. A checkpoint fed the tracked half alone publishes a verdict
  // about a change whose new files it never saw.
  const parsed = parseChangedFileStatus(z('M', 'tracked.txt'), {
    untrackedZ: z('brand-new.mjs', 'nested/also-new.mjs'),
  });
  assert.deepEqual(parsed.changedFiles, ['brand-new.mjs', 'nested/also-new.mjs', 'tracked.txt']);
  assert.deepEqual(parsed.deletedFiles, []);
});

test('MUTATION (d): a path that is BOTH deleted and untracked is not declared deleted', () => {
  // `git rm --cached x`, and delete-then-recreate, both produce `D x` in the
  // diff while `x` is on disk and listed in `--others`. Declaring it deleted
  // would excuse it from staging and publish a verdict that never looked at
  // it. This is the input that makes the subset guard reachable — without it
  // the guard was dead code and its test self-consistent (review M4).
  const parsed = parseChangedFileStatus(z('D', 'recreated.txt', 'D', 'really-gone.txt'), {
    untrackedZ: z('recreated.txt'),
  });
  assert.deepEqual(parsed.changedFiles, ['really-gone.txt', 'recreated.txt']);
  assert.deepEqual(parsed.deletedFiles, ['really-gone.txt']);
});

test('M1: a non-ASCII or TAB-bearing path survives verbatim', () => {
  // With `-z` git emits raw bytes; the TAB-split parser this replaces handed
  // git's `core.quotePath` spelling (`"\346\227\245..."`) straight through,
  // which made a modified file unstageable and — worse — let a DELETED one
  // excuse a path that was never really named.
  const parsed = parseChangedFileStatus(z('M', '日本語.txt', 'D', 'tab\there.txt'));
  assert.deepEqual(parsed.changedFiles, ['tab\there.txt', '日本語.txt']);
  assert.deepEqual(parsed.deletedFiles, ['tab\there.txt']);
  // A quoted spelling that still reaches the parser is decoded by the repo's
  // one decoder rather than passed through.
  const quoted = parseChangedFileStatus(
    z('M', '"\\346\\227\\245\\346\\234\\254\\350\\252\\236.txt"')
  );
  assert.deepEqual(quoted.changedFiles, ['日本語.txt']);
});

test('parseChangedFileStatus ignores records it cannot read rather than guessing', () => {
  assert.deepEqual(parseChangedFileStatus(z('D')), { changedFiles: [], deletedFiles: [] });
  assert.deepEqual(parseChangedFileStatus(z('not-a-status', 'x', 'M', 'src/a.mjs')).changedFiles, [
    'src/a.mjs',
  ]);
  assert.deepEqual(parseChangedFileStatus(undefined), { changedFiles: [], deletedFiles: [] });
});

test('a change that DELETES a file still produces a real verdict (not unrunnable)', async () => {
  const trustedTree = await makeTrustedTree();
  const reviewSourceDir = await makeTempDir('river-afterchange-src-');
  await fs.writeFile(path.join(reviewSourceDir, 'kept.txt'), 'kept', 'utf8');
  // `gone.txt` is deliberately NOT written: the change removed it.
  const { changedFiles, deletedFiles } = parseChangedFileStatus(
    z('M', 'kept.txt', 'D', 'gone.txt')
  );

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
  const { changedFiles } = parseChangedFileStatus(z('M', 'kept.txt', 'D', 'gone.txt'));

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
  // Snake_case and camelCase spellings of the same host concepts are listed
  // too: a leak arrives as `POST_TOOL_USE_TOOLS` or `toolInput` at least as
  // readily as the literal `PostToolUse`, and a pattern that only matched the
  // literal let exactly that mutation survive.
  const hostWords =
    /post[_\s]*tool[_\s]*use|tool[_\s]*input|tool[_\s]*name|toolInput|toolName|MultiEdit|CLAUDE_PROJECT_DIR|hook/i;
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
  assert.deepEqual(imports.sort(), [
    './fast-verification.mjs',
    './git.mjs',
    './trigger-resolver.mjs',
  ]);
  // `./git.mjs` is imported for `unquoteGitPath` (a pure decoder). The adapter
  // still starts no process of its own: the one command path is the #1401
  // executor reached through the checkpoint.
  assert.ok(!/execFile|spawn|execSync/.test(source), 'adapter must not launch a process');
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
