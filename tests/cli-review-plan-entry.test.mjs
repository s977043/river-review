// tests/cli-review-plan-entry.test.mjs
//
// `river review plan --entry <name>` (#2054 PR-3, Beta).
//
// What is pinned:
//
//   1. Golden: WITHOUT `--entry` the artifact is exactly what it was before the
//      flag existed. Measured here as "the artifact with `--entry`, minus the
//      two keys it adds, equals the artifact without it" (after neutralizing
//      the two fields that differ between any two runs: `timestamp` and
//      `trace.run_id`). The main-vs-branch byte comparison that establishes
//      the same thing across the revision is recorded in the PR body; a
//      committed golden of the full artifact would break on every skill
//      registry change, so the invariant is measured at runtime instead.
//   2. Additive: `--entry` appends `flow` and `evidenceRequirements` AFTER every
//      existing key and changes nothing else — no skill selection, decision or
//      gate reads them (ADR-009 D3, RA-1..RA-4).
//   3. The pin equals what src/lib/flow-loader.mjs resolves for the same entry
//      (the CLI does not derive its own).
//   4. An unreadable flows directory is a loud exit 1, never a silent artifact
//      without a pin.
//
// Since #2054 PR-4 every artifact also carries a trailing `executionManifest`
// (tests/cli-review-execution-manifest.test.mjs pins it). Its `flow` block is
// derived FROM the pin, so it legitimately differs between the two runs; the
// golden below therefore strips it on both sides and checks the pin ↔ manifest
// agreement in the dedicated test file instead.
//
// Output capture: like tests/integration/review-plan-cli.test.mjs, the artifact
// is read back from --output-file because runCliInProcess does not capture
// process.stdout.write.

import assert from 'node:assert/strict';
import { copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { FLOWS_DIR_ENV, resolveFlowEntry } from '../src/lib/flow-loader.mjs';
import { parseArgs } from '../src/cli.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, 'fixtures', 'plangate-review-artifacts');
const validate = compileReviewArtifactValidator();

const ENV = { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' };

function setupRepo(t) {
  const dir = createTempDir({ prefix: 'rr-review-plan-entry-' });
  t.after(() => cleanupTempDir(dir));
  for (const f of ['plan.md', 'todo.md', 'diff.patch']) {
    copyFileSync(join(FIXTURE, f), join(dir, f));
  }
  return dir;
}

async function plan(dir, extraArgv, env = ENV) {
  const out = join(dir, `artifact-${extraArgv.length}.json`);
  const result = await runCliInProcess(
    ['review', 'plan', '--plan-only', '--phase', 'upstream', ...extraArgv, '--output-file', out],
    { cwd: dir, env }
  );
  return { result, text: result.code === 0 ? readFileSync(out, 'utf8') : null };
}

/** The two fields that differ between any two runs, and nothing else. */
const neutralize = (artifact) => {
  const copy = JSON.parse(JSON.stringify(artifact));
  copy.timestamp = '<timestamp>';
  if (copy.trace) copy.trace.run_id = '<run_id>';
  return copy;
};

/** Drop the manifest (#2054 PR-4): it pins the flow, so it differs by design. */
const withoutManifest = ({ executionManifest, ...rest }) => rest;

describe('river review plan --entry (#2054 PR-3)', () => {
  test('without --entry the artifact is unchanged: no flow key, schema-valid, same shape as with --entry minus the additions', async (t) => {
    const dir = setupRepo(t);
    const without = await plan(dir, []);
    const withEntry = await plan(dir, ['--entry', 'review-plan']);
    assert.equal(without.result.code, 0, without.result.stderr);
    assert.equal(withEntry.result.code, 0, withEntry.result.stderr);

    const full = JSON.parse(without.text);
    assert.equal(validate(full), true, JSON.stringify(validate.errors));
    const base = withoutManifest(full);
    // The strip removes exactly one key. Widening `withoutManifest` would strip
    // the same key from both sides and hide a lost field; pin the set here.
    assert.deepEqual(Object.keys(full), [...Object.keys(base), 'executionManifest']);
    const pinned = withoutManifest(JSON.parse(withEntry.text));
    assert.equal('flow' in base, false);
    assert.equal('evidenceRequirements' in base, false);

    // Additive and appended: the existing keys, in their existing order, then
    // exactly the two new ones (the manifest, stripped above, trails both).
    const baseKeys = Object.keys(base);
    assert.deepEqual(Object.keys(pinned), [...baseKeys, 'flow', 'evidenceRequirements']);

    const { flow, evidenceRequirements, ...rest } = pinned;
    assert.deepEqual(neutralize(rest), neutralize(base));

    // Byte-level: serializing the pinned artifact without its two additions
    // reproduces the base text (after neutralizing timestamp / run_id and
    // dropping the manifest from the base text the same way).
    const strip = (text) =>
      text
        .replace(/"timestamp": "[^"]*"/, '"timestamp": "<timestamp>"')
        .replace(/"run_id": "[^"]*"/, '"run_id": "<run_id>"');
    assert.equal(
      strip(JSON.stringify(neutralize(rest), null, 2) + '\n'),
      strip(JSON.stringify(base, null, 2) + '\n')
    );
    assert.ok(flow && evidenceRequirements);
  });

  test('--entry attaches the pin the Flow loader resolves, and the Flow-declared required inputs', async (t) => {
    const dir = setupRepo(t);
    const { result, text } = await plan(dir, ['--entry', 'review-task']);
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(text);
    const expected = resolveFlowEntry('review-task');
    assert.deepEqual(artifact.flow, expected.flow);
    assert.deepEqual(artifact.flow, {
      entry: 'review-task',
      id: 'task-completion-review',
      version: expected.flow.version,
      sha256: expected.flow.sha256,
    });
    assert.match(artifact.flow.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(artifact.evidenceRequirements, expected.evidenceRequirements);
    // The pin changes nothing the review already decided.
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.findings, []);
  });

  test('--entry does not change skill selection, decision or gate', async (t) => {
    const dir = setupRepo(t);
    const without = JSON.parse((await plan(dir, [])).text);
    const pinned = JSON.parse((await plan(dir, ['--entry', 'review-final'])).text);
    assert.deepEqual(pinned.plan, without.plan);
    assert.equal(pinned.decision, without.decision);
    assert.deepEqual(pinned.gate, without.gate);
    assert.equal(pinned.suggestedLoopSignal, without.suggestedLoopSignal);
  });

  test('an unreadable flows directory is a loud exit 1 with the env override named, not a silent artifact', async (t) => {
    const dir = setupRepo(t);
    const missing = join(tmpdir(), 'river-no-such-flows-dir');
    const { result } = await plan(dir, ['--entry', 'review-plan'], {
      ...ENV,
      [FLOWS_DIR_ENV]: missing,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /flows directory not found/);
    assert.ok(result.stderr.includes(FLOWS_DIR_ENV));
  });

  test('parse layer falls through when the Flow assets cannot be loaded: no usageError, entry kept, exit 1 comes from the handler (#2106)', () => {
    // `src/cli.mjs` only validates the entry name when `listFlowEntryNames()`
    // succeeds; a loader failure is swallowed there and reported by the
    // review handler. Pin the fall-through so a future "validate at parse"
    // change cannot silently turn this into a usage error (exit 1 either way).
    const saved = process.env[FLOWS_DIR_ENV];
    process.env[FLOWS_DIR_ENV] = join(tmpdir(), 'river-no-such-flows-dir');
    try {
      const parsed = parseArgs(['review', 'plan', '--plan-only', '--entry', 'review-plan']);
      assert.notEqual(parsed.usageError, true);
      assert.equal(parsed.entry, 'review-plan');
    } finally {
      if (saved === undefined) delete process.env[FLOWS_DIR_ENV];
      else process.env[FLOWS_DIR_ENV] = saved;
    }
  });

  test('RIVER_FLOWS_DIR pointing at the shipped flows/ is accepted (the override path works end to end)', async (t) => {
    const dir = setupRepo(t);
    const { result, text } = await plan(dir, ['--entry', 'review-plan'], {
      ...ENV,
      [FLOWS_DIR_ENV]: resolve(__dirname, '..', 'flows'),
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(text).flow.entry, 'review-plan');
  });
});
