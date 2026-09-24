import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const BASELINE = '53e7a9e89139827709da90c2a37c928a582e0b0d';
const CANDIDATE = '3a03f90a2fa7827dc5b59108805687e4535efab6';

function commitExists(ref) {
  return (
    spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
      encoding: 'utf8',
    }).status === 0
  );
}

function listHaWorktrees() {
  return execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('worktree ') && line.includes('river-review-ha-'))
    .map((line) => line.slice('worktree '.length));
}

function runRunner(args, env = process.env) {
  return spawnSync(process.execPath, ['scripts/evaluate-human-attention.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

function artifactOutputDir(suffix) {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  return path.join(
    repoRoot,
    'artifacts',
    'evals',
    'human-attention',
    `test-${process.pid}-${suffix}`
  );
}

describe('#2382 actual #2370 baseline/candidate pair', () => {
  it('passes deterministic safety checks against the frozen material reference', (t) => {
    const havePair = commitExists(BASELINE) && commitExists(CANDIDATE);

    if (!havePair) {
      if (process.env.GITHUB_ACTIONS === 'true') {
        assert.fail(
          'GitHub Actions must check out full history so the frozen #2370 pair is available'
        );
      }
      t.skip('the frozen #2370 baseline/candidate pair is not available in this clone');
      return;
    }

    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    const outputDir = path.join(
      repoRoot,
      'artifacts',
      'evals',
      'human-attention',
      `test-${process.pid}-actual-pair`
    );

    try {
      const result = spawnSync(
        process.execPath,
        [
          'scripts/evaluate-human-attention.mjs',
          '--baseline',
          BASELINE,
          '--candidate',
          CANDIDATE,
          '--output',
          outputDir,
          '--measurement-mode',
          'unavailable',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: process.env,
        }
      );

      assert.strictEqual(
        result.status,
        0,
        `paired runner failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );

      const summaryPath = path.join(outputDir, 'summary.json');
      assert.ok(existsSync(summaryPath), 'summary.json must be preserved');
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

      assert.strictEqual(summary.caseCount, 10);
      assert.strictEqual(summary.deterministicStatus, 'PASS');
      assert.deepStrictEqual(summary.safetyRegressionCaseIds, []);
      assert.strictEqual(summary.humanAttentionImprovementClaimed, false);

      const manifest = JSON.parse(readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
      assert.strictEqual(manifest.baselineCommit, BASELINE);
      assert.strictEqual(manifest.candidateCommit, CANDIDATE);
      assert.strictEqual(manifest.measurementMode, 'unavailable');
      assert.ok(manifest.runnerSha256);
      assert.ok(manifest.fixtureSha256);
      assert.ok(manifest.adapterSha256);
      assert.ok(manifest.fixtureHelperSha256);
      assert.ok(manifest.rubricSha256);
      assert.ok(manifest.scorecardSha256);
      assert.strictEqual(
        manifest.conditionDependencyInstall,
        'baseline-lock/npm-ci-omit-dev-ignore-scripts'
      );
      assert.strictEqual(manifest.candidateNodeModules, 'shared-from-baseline-worktree');

      for (const caseId of [
        'HA-01-clean',
        'HA-02-critical-major',
        'HA-03-minor-info-only',
        'HA-04-human-review-required',
        'HA-05-partial-coverage',
        'HA-06-not-executed',
        'HA-07-timeout-failure',
        'HA-08-team-lead-blind-spot',
        'HA-09-mixed-risk-and-coverage',
        'HA-10-legacy-no-coverage',
      ]) {
        const caseDir = path.join(outputDir, caseId);
        assert.ok(existsSync(path.join(caseDir, 'baseline.md')), `${caseId}: baseline output`);
        assert.ok(existsSync(path.join(caseDir, 'candidate.md')), `${caseId}: candidate output`);

        const score = JSON.parse(
          readFileSync(path.join(caseDir, 'deterministic-score.json'), 'utf8')
        );
        assert.strictEqual(score.safetyRegression, false, `${caseId}: safety regression`);
        assert.deepStrictEqual(score.materialFailures, [], `${caseId}: material failures`);
      }

      // The runner must remove its detached worktrees even after evaluating
      // historical commits; otherwise repeated evaluations contaminate the repo.
      const worktreeList = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        encoding: 'utf8',
      });
      assert.doesNotMatch(worktreeList, /river-review-ha-/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects output paths outside the canonical Human Attention artifact root', (t) => {
    const havePair = commitExists(BASELINE) && commitExists(CANDIDATE);
    if (!havePair) {
      t.skip('the frozen #2370 baseline/candidate pair is not available in this clone');
      return;
    }

    const outputDir = path.join(tmpdir(), `river-review-ha-outside-${process.pid}`);
    rmSync(outputDir, { recursive: true, force: true });

    const result = spawnSync(
      process.execPath,
      [
        'scripts/evaluate-human-attention.mjs',
        '--baseline',
        BASELINE,
        '--candidate',
        CANDIDATE,
        '--output',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
      }
    );

    assert.strictEqual(result.status, 1);
    assert.match(
      result.stderr,
      /--output must be a new child directory under artifacts\/evals\/human-attention\//
    );
    assert.strictEqual(existsSync(outputDir), false);
  });

  it('rejects a baseline that is not an ancestor of the candidate as INCONCLUSIVE_SCOPE', (t) => {
    if (!(commitExists(BASELINE) && commitExists(CANDIDATE))) {
      t.skip('the frozen #2370 baseline/candidate pair is not available in this clone');
      return;
    }
    const outputDir = artifactOutputDir('not-ancestor');

    try {
      const result = runRunner([
        '--baseline',
        CANDIDATE,
        '--candidate',
        BASELINE,
        '--output',
        outputDir,
      ]);

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /^INCONCLUSIVE_SCOPE: baseline commit is not an ancestor/m);
      assert.strictEqual(existsSync(outputDir), false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects a commit/ref that does not exist as MISSING_COMMIT', () => {
    const outputDir = artifactOutputDir('missing-commit');

    try {
      const result = runRunner([
        '--baseline',
        '0000000000000000000000000000000000000000',
        '--candidate',
        'HEAD',
        '--output',
        outputDir,
      ]);

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /^MISSING_COMMIT: baseline commit\/ref not found/m);
      assert.strictEqual(existsSync(outputDir), false);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects an existing --output directory as OUTPUT_EXISTS', (t) => {
    if (!(commitExists(BASELINE) && commitExists(CANDIDATE))) {
      t.skip('the frozen #2370 baseline/candidate pair is not available in this clone');
      return;
    }
    const outputDir = artifactOutputDir('output-exists');
    mkdirSync(outputDir, { recursive: true });

    try {
      const result = runRunner([
        '--baseline',
        BASELINE,
        '--candidate',
        CANDIDATE,
        '--output',
        outputDir,
      ]);

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /^OUTPUT_EXISTS: output directory already exists/m);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('removes its temporary worktrees when evaluation fails midway', (t) => {
    if (!(commitExists(BASELINE) && commitExists(CANDIDATE))) {
      t.skip('the frozen #2370 baseline/candidate pair is not available in this clone');
      return;
    }
    const outputDir = artifactOutputDir('midway-failure');
    const emptyCache = mkdtempSync(path.join(tmpdir(), 'river-review-ha-test-cache-'));
    const worktreesBefore = new Set(listHaWorktrees());

    try {
      // An empty offline npm cache makes `npm ci` fail after both worktrees are added.
      const result = runRunner(
        ['--baseline', BASELINE, '--candidate', CANDIDATE, '--output', outputDir],
        { ...process.env, npm_config_cache: emptyCache, npm_config_offline: 'true' }
      );

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /^INCONCLUSIVE_ENVIRONMENT: npm ci failed/m);
      assert.strictEqual(existsSync(outputDir), false);

      // npm writes its debug log into the cache dir; the log names the baseline
      // worktree as cwd, proving the failure happened after worktrees were added.
      const logDir = path.join(emptyCache, '_logs');
      const npmLog = existsSync(logDir)
        ? readdirSync(logDir)
            .map((name) => readFileSync(path.join(logDir, name), 'utf8'))
            .join('\n')
        : '';
      const baselineWorktree = npmLog.match(/\/river-review-ha-[^/\s'"]+\/baseline(?=\/)/);
      assert.ok(baselineWorktree, 'npm ci must have run inside the baseline worktree');

      const leftover = listHaWorktrees().filter((p) => !worktreesBefore.has(p));
      assert.deepStrictEqual(leftover, []);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(emptyCache, { recursive: true, force: true });
    }
  });
});
