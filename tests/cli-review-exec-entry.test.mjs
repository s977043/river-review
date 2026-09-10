// tests/cli-review-exec-entry.test.mjs
//
// `river review exec --entry <name>` (Epic #2011 AC7 P2, Beta, record only).
//
// What is pinned:
//
//   1. `review exec --entry` runs the pinned Flow through
//      src/lib/flow-runner.mjs (P1) and appends `steps`: the runner's step
//      records, verbatim, in document order, each outcome drawn from the
//      closed set the artifact schema declares. Measured on the 4 core
//      entries against a HAND-WRITTEN table (below), not against the runner,
//      so the test is not self-consistent with the code under test.
//   2. The inputs handed to the runner are only what plan resolution proves:
//      `diff` from `context.changedFiles`, and same-named resolved artifacts
//      (`plan`) returned from the plan execution. A Flow whose required inputs
//      cannot be proven is therefore recorded, in observe mode,
//      as every step `stopped` (DETERMINISTIC_UNRUNNABLE) — one record per
//      step, never an empty array — pinned per entry so the derivation cannot
//      widen silently into claiming inputs that were never supplied.
//   3. Record only (RA-1): `gate`, `decision`, `findings`, `plan` and
//      `suggestedLoopSignal` are identical to the run WITHOUT `--entry` on the
//      same inputs. The runner's `stopped` never reaches the gate.
//   4. Additive: without `--entry` the key set is what it was; with it the
//      keys are `…, flow, evidenceRequirements, steps` followed by the
//      trailing `executionManifest` (#2054 PR-4 pins that one last).
//   5. `review plan --entry` and `review exec --dry-run --entry` attach the
//      pin only: no `steps`, because no review ran.
//   6. The emitted artifact validates against schemas/review-artifact.schema.json.
//
// Output capture: as in tests/cli-review-plan-entry.test.mjs the artifact is
// read back from --output-file (runCliInProcess does not capture stdout).

import assert from 'node:assert/strict';
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { resolveFlowEntry } from '../src/lib/flow-loader.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, 'fixtures', 'plangate-review-artifacts');
const SCHEMA = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'schemas', 'review-artifact.schema.json'), 'utf8')
);
// Keep the expected vocabularies literal so schema changes cannot make this test self-consistent.
const OUTCOMES = new Set(['executed', 'skipped', 'degraded', 'stopped', 'not-implemented']);
const KINDS = new Set(['primitive', 'reviewer']);
const validate = compileReviewArtifactValidator();

// The fixture repo supplies plan.md, todo.md, pbi-input.md and diff.patch.
// What the artifact can prove as Flow inputs: `diff` always
// (context.changedFiles), `plan` from same-named resolution, and `tasks` /
// `requirements` from the CLI-side default binding table. `baseline` remains
// unbound because its meaning differs by Flow.
//
// `steps` = the Flow document's step count (always equals steps.length, in
// observe mode even when a required input is missing). `plain` / `debug` =
// the outcome tally expected without / with --debug. A missing required
// input yields every step `stopped`; review-plan has its one required input
// (`plan`) proven with and without --debug, so its steps are walked.
const CORE_ENTRIES = [
  {
    entry: 'review-plan',
    required: ['plan'],
    steps: 11,
    plain: { 'not-implemented': 10, skipped: 1 },
    debug: { 'not-implemented': 10, skipped: 1 },
  },
  {
    entry: 'review-replan',
    required: ['baseline', 'plan'],
    steps: 11,
    plain: { stopped: 11 },
    debug: { stopped: 11 },
  },
  {
    entry: 'review-task',
    required: ['diff', 'tasks'],
    steps: 12,
    // `tasks` is required and has no default binding on purpose, so the fixture
    // repo's `todo.md` must NOT satisfy it (#2011 AC7 P3-2 review).
    plain: { stopped: 12 },
    debug: { stopped: 12 },
  },
  {
    entry: 'review-final',
    required: ['diff', 'requirements'],
    steps: 14,
    // Same reasoning as review-task: `pbi-input.md` must not satisfy the
    // required `requirements` input.
    plain: { stopped: 14 },
    debug: { stopped: 14 },
  },
];
const ENV = { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' };

function setupRepo(t) {
  const dir = createTempDir({ prefix: 'rr-review-exec-entry-' });
  t.after(() => cleanupTempDir(dir));
  for (const f of ['plan.md', 'todo.md', 'pbi-input.md', 'diff.patch']) {
    copyFileSync(join(FIXTURE, f), join(dir, f));
  }
  return dir;
}

let counter = 0;
async function run(dir, argv) {
  const out = join(dir, `artifact-${counter++}.json`);
  const result = await runCliInProcess(
    ['review', ...argv, '--phase', 'upstream', '--output-file', out],
    { cwd: dir, env: ENV }
  );
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(readFileSync(out, 'utf8'));
}

/** Drop the manifest (#2054 PR-4): it pins the flow, so it differs by design. */
const withoutManifest = ({ executionManifest, ...rest }) => rest;

function tally(steps) {
  const out = {};
  for (const s of steps) out[s.outcome] = (out[s.outcome] ?? 0) + 1;
  return out;
}

function assertStepRecords(artifact, entry, expectedCount, expectedTally) {
  const { document } = resolveFlowEntry(entry);
  assert.ok(Array.isArray(artifact.steps), 'steps must be an array');
  assert.equal(artifact.steps.length, expectedCount, `${entry}: step record count`);
  assert.equal(artifact.steps.length, document.steps.length, `${entry}: one record per Flow step`);
  assert.deepEqual(tally(artifact.steps), expectedTally, `${entry}: outcome tally`);
  artifact.steps.forEach((step, i) => {
    assert.equal(step.index, i);
    assert.equal(step.id, document.steps[i].use ?? document.steps[i].reviewer);
    assert.equal(step.kind, 'use' in document.steps[i] ? 'primitive' : 'reviewer');
    assert.ok(KINDS.has(step.kind), `unknown kind ${step.kind}`);
    assert.ok(OUTCOMES.has(step.outcome), `unknown outcome ${step.outcome}`);
  });
  // P2 wires no capability: nothing may claim to have executed.
  assert.equal(
    artifact.steps.some((s) => s.outcome === 'executed'),
    false,
    'no capability is wired in P2, so no step can be executed'
  );
}

describe('river review exec --entry (Epic #2011 AC7 P2)', () => {
  test('required unbound roles name the required --artifact supply', async (t) => {
    const dir = setupRepo(t);
    for (const entry of ['review-design', 'review-task']) {
      const artifact = await run(dir, ['exec', '--entry', entry]);
      const missing = entry === 'review-design' ? 'design' : 'tasks';
      for (const step of artifact.steps) {
        assert.equal(
          step.reason,
          `input not bound: ${missing}; supply it with --artifact ${missing}=<path>`
        );
      }
    }
  });

  // Wiring pin: `executeFlow` distinguishes "never bound" from "bound to an
  // artifact that is absent" only when the CLI hands it `inputSources`. Every
  // other case here is satisfied by `inputs` + `unboundInputNames` alone, so
  // dropping the `inputSources` argument at the call site left this file green.
  // This case fails the moment that argument stops being passed.
  test('an explicit --artifact naming an absent file reports the bound id', async (t) => {
    const dir = setupRepo(t);
    const artifact = await run(dir, [
      'exec',
      '--entry',
      'review-design',
      '--artifact',
      'design=does-not-exist.md',
    ]);
    assert.ok(artifact.steps.length > 0, 'the entry must record steps');
    for (const step of artifact.steps) {
      assert.equal(step.outcome, 'stopped');
      assert.equal(step.reason, 'bound artifact missing: design');
    }
  });

  test('step record vocabularies exactly match the artifact schema', () => {
    const schemaStep = SCHEMA.properties.steps.items.properties;
    assert.deepEqual([...schemaStep.outcome.enum].sort(), [...OUTCOMES].sort());
    assert.deepEqual([...schemaStep.kind.enum].sort(), [...KINDS].sort());
  });

  // The generic loop over resolver IDs (`names.has(id)`) is what supplies every
  // input other than `diff` -- `plan` today, and `tasks` / `requirements` /
  // `baseline` once bindings land (P3-2). Pinning only `review-plan` let a
  // mutation to `id === 'plan'` pass, so the entries whose required inputs are
  // NOT `plan` are pinned here by supplying them through `--artifact`.
  const SUPPLIED_ENTRIES = [
    { entry: 'review-replan', supply: ['baseline=plan.md'], steps: 11 },
    { entry: 'review-task', supply: ['tasks=todo.md'], steps: 12 },
    { entry: 'review-final', supply: ['requirements=plan.md'], steps: 14 },
  ];

  for (const { entry, supply, steps } of SUPPLIED_ENTRIES) {
    test(`${entry}: required inputs supplied via --artifact walk every step`, async (t) => {
      const dir = setupRepo(t);
      const argv = ['exec', '--entry', entry];
      for (const pair of supply) argv.push('--artifact', pair);

      const walked = await run(dir, argv);
      assert.equal(validate(walked), true, JSON.stringify(validate.errors));
      assert.equal(walked.steps.length, steps);
      // Every step is reached: no `stopped` record survives once the required
      // inputs are proven. The exact split between not-implemented and skipped
      // is the Flow's business, not this test's.
      assert.equal(
        walked.steps.filter((step) => step.outcome === 'stopped').length,
        0,
        JSON.stringify(tally(walked.steps))
      );
    });
  }

  for (const { entry, required, steps, plain: plainTally, debug: debugTally } of CORE_ENTRIES) {
    test(`${entry}: schema-valid, step records per the expectation table, gate untouched`, async (t) => {
      const dir = setupRepo(t);
      // The table's `required` column is what the Flow declares; pin it so a
      // Flow edit that changes required inputs surfaces here, not as a silent
      // change of the expected record count.
      assert.deepEqual(resolveFlowEntry(entry).evidenceRequirements, required);

      const without = await run(dir, ['exec']);
      const plain = await run(dir, ['exec', '--entry', entry]);
      const debug = await run(dir, ['exec', '--entry', entry, '--debug']);
      assert.equal(validate(plain), true, JSON.stringify(validate.errors));
      assert.equal(validate(debug), true, JSON.stringify(validate.errors));

      assertStepRecords(plain, entry, steps, plainTally);
      assertStepRecords(debug, entry, steps, debugTally);

      // RA-1: the runner's result does not feed the judgment.
      assert.deepEqual(plain.gate, without.gate);
      assert.equal(plain.decision, without.decision);
      assert.deepEqual(plain.findings, without.findings);
      assert.deepEqual(plain.plan, without.plan);
      assert.equal(plain.suggestedLoopSignal, without.suggestedLoopSignal);
    });
  }

  test('review-plan with and without --debug: every record is not-implemented or skipped, in document order', async (t) => {
    const dir = setupRepo(t);
    const plain = await run(dir, ['exec', '--entry', 'review-plan']);
    const debug = await run(dir, ['exec', '--entry', 'review-plan', '--debug']);
    const outcomes = plain.steps.map((s) => s.outcome);
    // plan-review.flow.json: 11 steps; the `when: design present` step is
    // skipped (design is not an artifact the fixture supplies), the rest have
    // no capability. derive-gate is a reserved primitive (also not-implemented).
    assert.deepEqual(outcomes, [
      'not-implemented',
      'not-implemented',
      'not-implemented',
      'not-implemented',
      'not-implemented',
      'skipped',
      'not-implemented',
      'not-implemented',
      'not-implemented',
      'not-implemented',
      'not-implemented',
    ]);
    assert.deepEqual(debug.steps, plain.steps, '--debug must not affect runner input resolution');
    assert.equal(plain.steps[5].id, 'cross-artifact-review');
    assert.match(plain.steps[5].reason, /design/);
    // Parallel run tagging survives the copy: the two reviewer steps share run 0.
    assert.deepEqual(
      plain.steps.filter((s) => s.parallel).map((s) => [s.id, s.parallelRun]),
      [
        ['security-scanner', 0],
        ['test-gap', 0],
      ]
    );
  });

  test('additive: keys are the base keys, then flow / evidenceRequirements / steps, then the manifest', async (t) => {
    const dir = setupRepo(t);
    const without = await run(dir, ['exec']);
    const withEntry = await run(dir, ['exec', '--entry', 'review-plan']);
    assert.equal('steps' in without, false);
    assert.equal('flow' in without, false);
    const baseKeys = Object.keys(withoutManifest(without));
    assert.deepEqual(Object.keys(withoutManifest(withEntry)), [
      ...baseKeys,
      'flow',
      'evidenceRequirements',
      'steps',
    ]);
    assert.deepEqual(Object.keys(withEntry).slice(-1), ['executionManifest']);
  });

  test('plan --entry and exec --dry-run --entry carry the pin but no steps (no review ran)', async (t) => {
    const dir = setupRepo(t);
    const plan = await run(dir, ['plan', '--plan-only', '--entry', 'review-plan']);
    assert.ok(plan.flow);
    assert.equal('steps' in plan, false);
    const dry = await run(dir, ['exec', '--dry-run', '--entry', 'review-plan']);
    assert.ok(dry.flow);
    assert.equal('steps' in dry, false);
  });

  test('the schema rejects a step with an unknown outcome, an unknown kind, or an extra key', async (t) => {
    const dir = setupRepo(t);
    const artifact = await run(dir, ['exec', '--entry', 'review-plan', '--debug']);
    assert.ok(artifact.steps.length > 0);
    const badOutcome = structuredClone(artifact);
    badOutcome.steps[0].outcome = 'nope';
    assert.equal(validate(badOutcome), false);
    const badKind = structuredClone(artifact);
    badKind.steps[0].kind = 'use';
    assert.equal(validate(badKind), false);
    const extraKey = structuredClone(artifact);
    extraKey.steps[0].verdict = 'GO';
    assert.equal(validate(extraKey), false);
  });
});
