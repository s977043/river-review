// tests/cli-evolve-subcommand-dir-collision.test.mjs
//
// #1759 B1: `takeTrailingPositional` (src/cli.mjs) approximated whether a
// token written AFTER a flag was the `evolve` subcommand or a path with
// `!existsSync(token)`. The EAGER branch (the one that reads the subcommand
// word directly after `evolve`) instead checks `EVOLVE_SUBCOMMANDS` FIRST and
// only falls back to `existsSync` when the token is not a known subcommand
// word. When cwd contains a directory literally named `aggregate` (or
// `replay` / `prompt-compare`), the two branches disagreed:
//
//   river evolve aggregate --min 2   -> eager branch -> subcommand 'aggregate'
//   river evolve --min 2 aggregate   -> trailing branch (BEFORE fix) ->
//                                        existsSync('aggregate') is true, so
//                                        it fell through to the path branch
//                                        and 'aggregate' became parsed.target
//
// Both exited 0 with no error, so the same token set silently meant two
// different things depending on word order. This file pins the fix:
// `takeTrailingPositional`'s evolve branch now checks `EVOLVE_SUBCOMMANDS`
// with the same priority as the eager branch (src/cli.mjs, inside
// `takeTrailingPositional`).
//
// Why this is a SEPARATE file instead of new rows in
// tests/cli-usage-error-exit-codes.test.mjs:
//
// That file's single `before()` hook builds ONE temp git repo and runs every
// CASES/VALID_CASES row against that same fixed cwd (see its header comment
// at :114-119). None of its fixture files include directories named after
// `EVOLVE_SUBCOMMANDS` members, and the table has no per-row cwd-contents
// dimension — every row implicitly shares "the fixture repo has no directory
// named after a subcommand word". Reproducing the collision this file pins
// would require adding subcommand-named directories to that shared repo,
// which is a repo-shape change the table's other ~150 rows do not need and
// were not written to expect (mirrors the reasoning in
// tests/cli-river-phase-env-validation.test.mjs for why an env-var dimension
// got its own file instead of extending that table). A dedicated file keeps
// that table's pin scope (argv-only, fixed cwd) stable while still covering
// the cwd-collision dimension.
//
// Escape hatch verified manually while writing this fix (see PR body for the
// exact commands and exit codes): a caller who genuinely wants to review a
// directory named `aggregate` can still write `./aggregate` (a token that is
// NOT in `EVOLVE_SUBCOMMANDS`, so it falls to the `existsSync` path branch)
// or terminate options with `--` (`evolve -- aggregate`, which VALID_CASES in
// tests/cli-usage-error-exit-codes.test.mjs already pins as always reading
// the token after `--` as a path). Both are pinned below too, so this file
// also guards against the fix accidentally removing that escape hatch.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { parseArgs } from '../src/cli.mjs';
import { cleanupTempDir, createTempDir } from './helpers/temp-dir.mjs';

describe('#1759 B1: evolve subcommand word wins over a same-named directory', () => {
  let dir = null;
  let originalCwd = null;

  before(() => {
    dir = createTempDir({ prefix: 'river-evolve-dir-collision-' });
    // Directories named after EVERY EVOLVE_SUBCOMMANDS member (src/cli.mjs),
    // so the fix is pinned for the full vocabulary, not just `aggregate`.
    mkdirSync(join(dir, 'aggregate'));
    mkdirSync(join(dir, 'replay'));
    mkdirSync(join(dir, 'verify-replay'));
    mkdirSync(join(dir, 'prompt-compare'));
    mkdirSync(join(dir, 'prompt-ab'));
    originalCwd = process.cwd();
    process.chdir(dir);
  });

  after(() => {
    if (originalCwd) process.chdir(originalCwd);
    cleanupTempDir(dir);
  });

  // `parsed.target` defaults to '.' (src/cli.mjs:1098) regardless of whether
  // any positional was actually consumed, so a bare '.' below means "the
  // token was NOT read as a path" — not "the target is unset".
  const DEFAULT_TARGET = '.';

  test('`evolve aggregate --min 2` reads aggregate as the subcommand', () => {
    const parsed = parseArgs(['evolve', 'aggregate', '--min', '2']);
    assert.equal(parsed.usageError, false);
    assert.equal(parsed.evolveSubcommand, 'aggregate');
    assert.equal(parsed.target, DEFAULT_TARGET);
  });

  test('`evolve --min 2 aggregate` agrees with the flag-first order despite the directory', () => {
    const parsed = parseArgs(['evolve', '--min', '2', 'aggregate']);
    assert.equal(parsed.usageError, false);
    assert.equal(parsed.evolveSubcommand, 'aggregate');
    assert.equal(
      parsed.target,
      DEFAULT_TARGET,
      '`aggregate` must resolve as the subcommand, not as parsed.target (the ./aggregate directory)'
    );
  });

  test('`evolve replay --spec x.json` (path-form) and `evolve --spec x.json replay` agree', () => {
    const pathFirst = parseArgs(['evolve', 'replay', '--spec', 'x.json']);
    const flagFirst = parseArgs(['evolve', '--spec', 'x.json', 'replay']);
    assert.equal(pathFirst.usageError, false);
    assert.equal(flagFirst.usageError, false);
    assert.equal(pathFirst.evolveSubcommand, 'replay');
    assert.equal(flagFirst.evolveSubcommand, 'replay');
    assert.equal(pathFirst.target, DEFAULT_TARGET);
    assert.equal(flagFirst.target, DEFAULT_TARGET);
  });

  test('verify-replay stays a subcommand even when a same-named directory exists', () => {
    const parsed = parseArgs([
      'evolve',
      '--replay',
      'replay.json',
      '--attestation',
      'attestation.json',
      '--trusted-key',
      'verifier.pem',
      'verify-replay',
    ]);
    assert.equal(parsed.usageError, false);
    assert.equal(parsed.evolveSubcommand, 'verify-replay');
    assert.equal(parsed.target, DEFAULT_TARGET);
  });

  test('`evolve prompt-compare .` and `evolve --output json prompt-compare` agree', () => {
    const pathFirst = parseArgs(['evolve', 'prompt-compare', '.']);
    const flagFirst = parseArgs(['evolve', '--output', 'json', 'prompt-compare']);
    assert.equal(pathFirst.usageError, false);
    assert.equal(flagFirst.usageError, false);
    assert.equal(pathFirst.evolveSubcommand, 'prompt-compare');
    assert.equal(flagFirst.evolveSubcommand, 'prompt-compare');
  });

  test('`evolve prompt-ab .` and `evolve --output json prompt-ab` agree (#1880)', () => {
    const pathFirst = parseArgs(['evolve', 'prompt-ab', '.']);
    const flagFirst = parseArgs(['evolve', '--output', 'json', 'prompt-ab']);
    assert.equal(pathFirst.usageError, false);
    assert.equal(flagFirst.usageError, false);
    assert.equal(pathFirst.evolveSubcommand, 'prompt-ab');
    assert.equal(flagFirst.evolveSubcommand, 'prompt-ab');
  });

  test('escape hatch: `./aggregate` still resolves as a path, not a subcommand', () => {
    const parsed = parseArgs(['evolve', '--min', '2', './aggregate']);
    assert.equal(parsed.usageError, false);
    assert.equal(parsed.evolveSubcommand, null);
    assert.equal(parsed.target, './aggregate');
  });

  test('escape hatch: `evolve -- aggregate` (POSIX terminator) still resolves as a path', () => {
    const parsed = parseArgs(['evolve', '--', 'aggregate']);
    assert.equal(parsed.usageError, false);
    assert.equal(parsed.evolveSubcommand, null);
    assert.equal(parsed.target, 'aggregate');
  });

  test('a typo (`agregate`) is still rejected as an unknown subcommand, not swallowed as a path', () => {
    // `agregate` is neither a known EVOLVE_SUBCOMMANDS word nor an existing
    // directory, so it must still fall to the mistyped-subcommand branch
    // (the handler rejects it with exit 1) rather than resolve as a path.
    const parsed = parseArgs(['evolve', '--output', 'json', 'agregate']);
    assert.equal(parsed.evolveSubcommand, 'agregate');
    assert.equal(parsed.target, DEFAULT_TARGET);
  });
});
