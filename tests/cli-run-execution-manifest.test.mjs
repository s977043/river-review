// tests/cli-run-execution-manifest.test.mjs
//
// `river run --save` attaches an Execution Manifest to the persisted run record
// (#2054 PR-4, Epic #2011 AC6 "Manifest → Run 紐づけ").
//
// What is pinned:
//
//   1. Presence: a record written by this revision carries `executionManifest`
//      as its LAST top-level key, and removing that key gives back a record
//      that `attachExecutionManifest` re-extends to the same object (additive,
//      nothing else moved). Every record in the store has one — the exact
//      state AC6 measured as "run に manifest を含むもの 0 件" is what this test
//      turns red.
//   2. Cross-path (CLAUDE.md "Import the SSoT, never re-derive it"): the stored
//      `manifestKey` / `manifestHash` equal what `resolveExecutionManifestSpec`
//      → `buildExecutionManifest` produce when the TEST builds the spec from
//      the same run, using `planLocalReview` (the production planner, not the
//      producer under test) for the selected skills. A wiring that hashed a
//      different spec, or that minted its own digest, breaks this.
//   3. `river run` accepts no `--entry`, so the `flow` block is `missing` and
//      `assessReplayability` reports the run as not deterministically
//      replayable — recorded honestly, not guessed.
//   4. Tampering with one character of the stored `manifestHash` is detected by
//      `verifyExecutionManifest`; an untampered stored manifest verifies (so a
//      wiring that bypassed `attachExecutionManifest` and spread an arbitrary
//      object would be caught by the `kind` / digest checks, #2111 minor 3).
//   5. Fail-soft in the right direction (#2111 major 2): when the producer
//      THROWS — injected here through a `RIVER_REPO_ROOT` whose
//      docs/data/skill-manifest.json is present but not JSON — the record is
//      still saved, without a manifest, and the failure is a stderr warning.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import {
  assessReplayability,
  attachExecutionManifest,
  buildExecutionManifest,
  resolveExecutionManifestSpec,
  verifyExecutionManifest,
} from '../src/lib/execution-manifest.mjs';
import { planLocalReview } from '../src/lib/local-runner.mjs';
import { loadAllRunRecords, resolveStoreDir } from '../src/lib/result-store.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';
import { createTempGitRepo } from './helpers/temp-repo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const NO_CI = { GITHUB_ACTIONS: undefined, GITHUB_STEP_SUMMARY: undefined };

async function createRepo(t) {
  const repo = await createTempGitRepo({
    prefix: 'river-run-manifest-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: {
      'src/app.js': 'export const value = 2;\nexport function f(input) { return eval(input); }\n',
    },
  });
  t.after(repo.cleanup);
  return repo.dir;
}

async function saveRunRaw(dir, env = NO_CI) {
  const result = await runCliInProcess(['run', '.', '--dry-run', '--save'], { cwd: dir, env });
  assert.equal(result.code, 0, result.stderr);
  const match = /Run saved: \S+ → (\S+)/.exec(result.stderr);
  assert.ok(match, `no "Run saved:" line in stderr: ${result.stderr}`);
  return { result, record: readJson(match[1]) };
}

async function saveRun(dir) {
  return (await saveRunRaw(dir)).record;
}

/**
 * A repo root the producer cannot build a manifest from: `package.json` is the
 * real one, but the skill checksum manifest is present and NOT JSON, which
 * readJsonOrNull throws on (a non-ENOENT failure).
 *
 * No `skills` / `schemas` here: in-process, `runners/core/skill-loader.mjs`
 * fixes its root from `RIVER_REPO_ROOT` at module load, so an env override
 * set by a later test is ignored and skill loading keeps using the real repo.
 * A subprocess-path test that reuses this root would need those two symlinked.
 */
export function createBrokenRepoRoot(t) {
  const root = createTempDir({ prefix: 'river-broken-root-' });
  t.after(() => cleanupTempDir(root));
  writeFileSync(join(root, 'package.json'), readFileSync(resolve(REPO_ROOT, 'package.json')));
  mkdirSync(join(root, 'docs', 'data'), { recursive: true });
  writeFileSync(join(root, 'docs', 'data', 'skill-manifest.json'), '{ not json');
  return root;
}

describe('river run --save - execution manifest on the run record (#2054 PR-4, AC6)', () => {
  test('every saved record carries an executionManifest as its last key, additively', async (t) => {
    const dir = await createRepo(t);
    await saveRun(dir);
    await saveRun(dir);

    const records = await loadAllRunRecords(resolveStoreDir(dir));
    assert.equal(records.length, 2);
    // AC6 measured "run に manifest を含むもの 0 件"; this is the count that must
    // no longer be zero, measured over the whole store rather than one record.
    const withManifest = records.filter((r) => r.executionManifest?.kind === 'execution-manifest');
    assert.equal(withManifest.length, records.length);

    for (const record of records) {
      const keys = Object.keys(record);
      assert.equal(keys.at(-1), 'executionManifest');
      const { executionManifest, ...without } = record;
      // Additive: re-attaching to the manifest-less record reproduces it exactly.
      assert.deepEqual(attachExecutionManifest(without, executionManifest), record);
      assert.equal(executionManifest.reviewRunId, record.runId);
    }
  });

  test('the stored digests equal a manifest the test builds from the same run through the resolver', async (t) => {
    const dir = await createRepo(t);
    const record = await saveRun(dir);
    const stored = record.executionManifest;

    // Independent inputs: the production planner for the skill set, the real
    // package.json and skill manifest for the pins.
    const context = await planLocalReview({ cwd: dir, phase: record.phase, dryRun: true });
    assert.equal(context.status, 'ok');
    const selected = context.plan.selected.map((s) => ({
      id: s.metadata.id,
      version: s.metadata.version ?? null,
    }));
    assert.ok(selected.length > 0, 'the fixture diff must select at least one skill');

    const spec = resolveExecutionManifestSpec({
      artifact: {
        plan: { selectedSkills: selected, reviewMode: record.reviewMode },
        gate: record.gate,
      },
      runRecord: record,
      riverReviewVersion: readJson(resolve(REPO_ROOT, 'package.json')).version,
      skillManifest: readJson(resolve(REPO_ROOT, 'docs/data/skill-manifest.json')),
    });
    const rebuilt = buildExecutionManifest(spec, { now: new Date(stored.createdAt) });
    assert.equal(rebuilt.manifestKey, stored.manifestKey);
    assert.equal(rebuilt.manifestHash, stored.manifestHash);
    assert.equal(stored.skills.status, 'resolved');
    assert.equal(stored.riverReview.status, 'resolved');
  });

  test('without --entry the flow block is missing and the run is reported as not replayable', async (t) => {
    const dir = await createRepo(t);
    const { executionManifest } = await saveRun(dir);
    assert.equal(executionManifest.flow.status, 'missing');
    const replay = assessReplayability(executionManifest);
    assert.equal(replay.deterministic, false);
    assert.ok(replay.missingBlocks.deterministic.includes('flow'));
  });

  test('a producer failure costs the manifest, never the record (#2111 major 2)', async (t) => {
    const dir = await createRepo(t);
    const brokenRoot = createBrokenRepoRoot(t);
    const { result, record } = await saveRunRaw(dir, { ...NO_CI, RIVER_REPO_ROOT: brokenRoot });
    assert.match(result.stderr, /Warning: execution manifest not attached: /);
    assert.doesNotMatch(result.stderr, /--save failed/);
    assert.equal('executionManifest' in record, false);
    assert.ok(typeof record.decision === 'string' && record.gate, 'record body intact');
    // Same repo root, sane sources: the manifest comes back.
    const { record: healthy } = await saveRunRaw(dir);
    assert.equal(healthy.executionManifest.kind, 'execution-manifest');
  });

  test('a one-character edit to the stored manifestHash is detected', async (t) => {
    const dir = await createRepo(t);
    const { executionManifest } = await saveRun(dir);
    assert.equal(verifyExecutionManifest(executionManifest).verified, true);

    const hash = executionManifest.manifestHash;
    const flipped = (hash[0] === '0' ? '1' : '0') + hash.slice(1);
    const tampered = { ...executionManifest, manifestHash: flipped };
    const { verified, mismatches } = verifyExecutionManifest(tampered);
    assert.equal(verified, false);
    assert.equal(mismatches.length, 1);
    assert.match(mismatches[0], /^manifestHash: /);
  });
});
