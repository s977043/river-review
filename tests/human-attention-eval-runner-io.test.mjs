import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  CANONICAL_FIXTURE_PATH,
  runEvaluation,
  withTemporaryWorktrees,
} from '../scripts/evaluate-human-attention.mjs';

const BASELINE = '53e7a9e89139827709da90c2a37c928a582e0b0d';
const CANDIDATE = '3a03f90a2fa7827dc5b59108805687e4535efab6';

function git(...args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe('#2382 Human Attention runner I/O guards', () => {
  const repoRoot = git('rev-parse', '--show-toplevel').stdout.trim();

  function repoOutput(name) {
    return path.join(
      repoRoot,
      'artifacts',
      'evals',
      'human-attention',
      `test-${process.pid}-${name}`
    );
  }
  it('rejects a missing baseline commit before producing output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'river-review-ha-missing-'));
    const output = path.join(tempRoot, 'result');

    try {
      await assert.rejects(
        () =>
          runEvaluation({
            baseline: 'definitely-not-a-commit',
            candidate: CANDIDATE,
            fixtures: CANONICAL_FIXTURE_PATH,
            output,
          }),
        /rev-parse/
      );
      assert.strictEqual(await pathExists(output), false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects output outside the canonical evaluation artifact root', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'river-review-ha-output-escape-'));
    const output = path.join(tempRoot, 'result');

    try {
      await assert.rejects(
        () =>
          runEvaluation({
            baseline: BASELINE,
            candidate: CANDIDATE,
            fixtures: CANONICAL_FIXTURE_PATH,
            output,
          }),
        /output must be a new child directory under artifacts\/evals\/human-attention/
      );
      assert.strictEqual(await pathExists(output), false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing canonical output directory', async () => {
    const output = repoOutput('existing');
    await mkdir(output, { recursive: true });

    try {
      await assert.rejects(
        () =>
          runEvaluation({
            baseline: BASELINE,
            candidate: CANDIDATE,
            fixtures: CANONICAL_FIXTURE_PATH,
            output,
          }),
        /output already exists/
      );
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it('removes temporary worktrees when the evaluation task throws', async () => {
    const tempParent = await mkdtemp(path.join(os.tmpdir(), 'river-review-ha-worktrees-'));
    let baselineDir;
    let candidateDir;

    try {
      await assert.rejects(
        () =>
          withTemporaryWorktrees({
            repoRoot,
            baseline: BASELINE,
            candidate: CANDIDATE,
            tempParent,
            task: async (paths) => {
              baselineDir = paths.baselineDir;
              candidateDir = paths.candidateDir;
              throw new Error('intentional runner failure');
            },
          }),
        /intentional runner failure/
      );

      assert.strictEqual(await pathExists(baselineDir), false);
      assert.strictEqual(await pathExists(candidateDir), false);

      const worktrees = git('worktree', 'list', '--porcelain').stdout;
      assert.strictEqual(worktrees.includes(tempParent), false);
    } finally {
      await rm(tempParent, { recursive: true, force: true });
    }
  });
});
