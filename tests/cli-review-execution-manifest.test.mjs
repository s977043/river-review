// tests/cli-review-execution-manifest.test.mjs
//
// `river review plan|exec` attaches an Execution Manifest to the emitted Review
// Artifact, and `review exec --plan <file>` verifies the manifest carried by the
// source plan before replaying (#2054 PR-4, Epic #2011 AC6).
//
// What is pinned:
//
//   1. `review plan --entry <name>`: the manifest's `flow` block is `resolved`
//      and equals the pin the artifact itself carries (`artifact.flow`, from
//      src/lib/flow-loader.mjs) — the manifest is derived from the Flow
//      document the loader resolved on this run, not from a second reading.
//      Without `--entry` the block is `missing`.
//   2. The manifest trails every other key and changes nothing it follows
//      (plan / decision / gate identical with and without it being verified).
//   3. Replay with a source whose `manifestHash` was edited by one character
//      prints a warning and STILL replays (exit 0, same artifact shape);
//      `debug.replay.sourceManifest` records the verdict when debug is on.
//      An intact source produces no warning. A source without a manifest
//      (pre-#2054 artifact) is neither warned about nor rejected.
//   4. Fail-soft (#2111 major 2): a producer that throws (corrupt skill
//      manifest under `RIVER_REPO_ROOT`) leaves the artifact intact and
//      manifest-less, exit 0, with a stderr warning.

import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { assessReplayability, verifyExecutionManifest } from '../src/lib/execution-manifest.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';
import { createBrokenRepoRoot } from './cli-run-execution-manifest.test.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, 'fixtures', 'plangate-review-artifacts');
const validate = compileReviewArtifactValidator();

const ENV = { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' };

function setupRepo(t) {
  const dir = createTempDir({ prefix: 'rr-review-manifest-' });
  t.after(() => cleanupTempDir(dir));
  for (const f of ['plan.md', 'todo.md', 'diff.patch']) {
    copyFileSync(join(FIXTURE, f), join(dir, f));
  }
  return dir;
}

async function plan(dir, extraArgv, name, env = ENV) {
  const out = join(dir, `${name}.json`);
  const result = await runCliInProcess(
    ['review', 'plan', '--plan-only', '--phase', 'upstream', ...extraArgv, '--output-file', out],
    { cwd: dir, env }
  );
  assert.equal(result.code, 0, result.stderr);
  return { result, artifact: JSON.parse(readFileSync(out, 'utf8')), path: out };
}

async function replay(dir, planPath, extraArgv, name) {
  const out = join(dir, `${name}.json`);
  const result = await runCliInProcess(
    ['review', 'exec', '--plan', planPath, '--dry-run', ...extraArgv, '--output-file', out],
    { cwd: dir, env: ENV }
  );
  assert.equal(result.code, 0, result.stderr);
  return { result, artifact: JSON.parse(readFileSync(out, 'utf8')) };
}

describe('river review plan - execution manifest on the artifact (#2054 PR-4)', () => {
  test('--entry makes the manifest flow block resolved and equal to the artifact pin', async (t) => {
    const dir = setupRepo(t);
    const { artifact } = await plan(dir, ['--entry', 'review-task'], 'pinned');
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(Object.keys(artifact).at(-1), 'executionManifest');

    const { executionManifest: manifest, flow } = artifact;
    assert.equal(manifest.kind, 'execution-manifest');
    assert.equal(manifest.flow.status, 'resolved');
    assert.deepEqual(
      { id: manifest.flow.id, version: manifest.flow.version, sha256: manifest.flow.sha256 },
      { id: flow.id, version: flow.version, sha256: flow.sha256 }
    );
    assert.equal(manifest.reviewRunId, artifact.trace.run_id);
    assert.equal(verifyExecutionManifest(manifest).verified, true);
    // flow is pinned, but artifacts / policy / config are not yet recorded on
    // this path, so the run is still honestly reported as not replayable.
    const replayability = assessReplayability(manifest);
    assert.equal(replayability.missingBlocks.deterministic.includes('flow'), false);
    assert.equal(replayability.deterministic, false);
  });

  test('without --entry the flow block is missing, and the manifest changes nothing it follows', async (t) => {
    const dir = setupRepo(t);
    const { artifact: base } = await plan(dir, [], 'base');
    const { artifact: pinned } = await plan(dir, ['--entry', 'review-task'], 'pinned');
    assert.equal('flow' in base, false);
    assert.equal(base.executionManifest.flow.status, 'missing');
    assert.equal(validate(base), true, JSON.stringify(validate.errors));
    assert.deepEqual(pinned.plan, base.plan);
    assert.equal(pinned.decision, base.decision);
    assert.deepEqual(pinned.gate, base.gate);
  });

  test('a producer failure leaves the artifact intact and manifest-less (#2111 major 2)', async (t) => {
    const dir = setupRepo(t);
    const brokenRoot = createBrokenRepoRoot(t);
    const { result, artifact } = await plan(dir, [], 'broken', {
      ...ENV,
      RIVER_REPO_ROOT: brokenRoot,
    });
    assert.match(result.stderr, /Warning: execution manifest not attached: /);
    assert.equal('executionManifest' in artifact, false);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.ok(artifact.plan && typeof artifact.decision === 'string');
  });
});

describe('river review exec --plan - source manifest verification (#2054 PR-4)', () => {
  test('a tampered source manifest warns and still replays; debug records the verdict', async (t) => {
    const dir = setupRepo(t);
    const { artifact, path: sourcePath } = await plan(dir, [], 'source');
    const hash = artifact.executionManifest.manifestHash;
    artifact.executionManifest.manifestHash = (hash[0] === '0' ? '1' : '0') + hash.slice(1);
    const tamperedPath = join(dir, 'tampered.json');
    writeFileSync(tamperedPath, JSON.stringify(artifact, null, 2));

    const tampered = await replay(dir, tamperedPath, ['--debug'], 'replay-tampered');
    assert.match(
      tampered.result.stderr,
      /Warning: the execution manifest in --plan .* does not verify/
    );
    assert.match(tampered.result.stderr, /manifestHash: stored/);
    assert.match(tampered.result.stderr, /Replay continues/);
    assert.equal(tampered.artifact.debug.replay.sourceManifest.verified, false);
    assert.equal(tampered.artifact.debug.replay.sourceManifest.mismatches.length, 1);
    // The replayed artifact gets a fresh manifest of its own.
    assert.equal(tampered.artifact.executionManifest.kind, 'execution-manifest');
    assert.equal(verifyExecutionManifest(tampered.artifact.executionManifest).verified, true);

    const intact = await replay(dir, sourcePath, ['--debug'], 'replay-intact');
    assert.doesNotMatch(intact.result.stderr, /does not verify/);
    assert.equal(intact.artifact.debug.replay.sourceManifest.verified, true);
    // Verification never changes the replay's judgment.
    assert.equal(tampered.artifact.decision, intact.artifact.decision);
    assert.deepEqual(tampered.artifact.plan, intact.artifact.plan);
  });

  test('a source without a manifest (pre-#2054 artifact) replays without a warning', async (t) => {
    const dir = setupRepo(t);
    const { artifact, path: sourcePath } = await plan(dir, [], 'source');
    delete artifact.executionManifest;
    writeFileSync(sourcePath, JSON.stringify(artifact, null, 2));

    const { result, artifact: replayed } = await replay(
      dir,
      sourcePath,
      ['--debug'],
      'replay-legacy'
    );
    assert.doesNotMatch(result.stderr, /execution manifest/);
    assert.equal('sourceManifest' in replayed.debug.replay, false);
    assert.equal(replayed.executionManifest.kind, 'execution-manifest');
  });
});
