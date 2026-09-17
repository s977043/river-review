import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { describe } from 'node:test';

import {
  runReviewPlan,
  runReviewExecReplay,
  ReviewPlanError,
  resolveReviewOutputFormat,
  evaluateReviewGate,
} from '../src/lib/review-plan.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';

const validate = compileReviewArtifactValidator();

describe('evaluateReviewGate (#976)', () => {
  const art = (sevs) => ({ findings: sevs.map((s, i) => ({ id: `f${i}`, severity: s })) });

  test('no findings → pass / exit 0', () => {
    const g = evaluateReviewGate(art([]), { failOn: 'critical', warnOn: 'major' });
    assert.deepEqual([g.code, g.level], [0, 'pass']);
  });

  test('critical finding with --fail-on critical → fail / exit 1', () => {
    const g = evaluateReviewGate(art(['minor', 'critical']), {
      failOn: 'critical',
      warnOn: 'major',
    });
    assert.deepEqual([g.code, g.level, g.maxSeverity], [1, 'fail', 'critical']);
  });

  test('major finding below fail-on but at warn-on → warn / exit 2', () => {
    const g = evaluateReviewGate(art(['minor', 'major']), { failOn: 'critical', warnOn: 'major' });
    assert.deepEqual([g.code, g.level], [2, 'warn']);
  });

  test('only minor findings with defaults → pass / exit 0', () => {
    const g = evaluateReviewGate(art(['info', 'minor']), { failOn: 'critical', warnOn: 'major' });
    assert.deepEqual([g.code, g.level], [0, 'pass']);
  });

  test('--advisory-only forces exit 0 even with critical findings', () => {
    const g = evaluateReviewGate(art(['critical']), { failOn: 'critical', advisoryOnly: true });
    assert.deepEqual([g.code, g.level], [0, 'pass']);
  });

  test('lower --fail-on (major) makes a major finding fail', () => {
    const g = evaluateReviewGate(art(['major']), { failOn: 'major', warnOn: 'minor' });
    assert.equal(g.code, 1);
  });
});

describe('resolveReviewOutputFormat (#802 Phase 3 PR-2)', () => {
  test('no flags → json (backward compatible)', () => {
    assert.equal(resolveReviewOutputFormat({}), 'json');
    assert.equal(resolveReviewOutputFormat({ output: 'text' }), 'json'); // default, not explicit
  });

  test('explicit --output json / --format json → json', () => {
    assert.equal(resolveReviewOutputFormat({ output: 'json', outputExplicit: true }), 'json');
    assert.equal(resolveReviewOutputFormat({ format: 'json', formatExplicit: true }), 'json');
  });

  test('matching --output and --format → json', () => {
    assert.equal(
      resolveReviewOutputFormat({
        output: 'json',
        outputExplicit: true,
        format: 'json',
        formatExplicit: true,
      }),
      'json'
    );
  });

  test('conflicting --output and --format → ReviewPlanError', () => {
    assert.throws(
      () =>
        resolveReviewOutputFormat({
          output: 'json',
          outputExplicit: true,
          format: 'markdown',
          formatExplicit: true,
        }),
      (e) => e instanceof ReviewPlanError && /conflicts/.test(e.message)
    );
  });

  test('explicit text → ReviewPlanError (not implemented)', () => {
    assert.throws(
      () => resolveReviewOutputFormat({ output: 'text', outputExplicit: true }),
      (e) => e instanceof ReviewPlanError && /not implemented/.test(e.message)
    );
  });

  test('explicit --output markdown / --format markdown → markdown (#976)', () => {
    assert.equal(
      resolveReviewOutputFormat({ output: 'markdown', outputExplicit: true }),
      'markdown'
    );
    assert.equal(
      resolveReviewOutputFormat({ format: 'markdown', formatExplicit: true }),
      'markdown'
    );
  });

  test('explicit --output yaml → ReviewPlanError (review disallows yaml)', () => {
    assert.throws(
      () => resolveReviewOutputFormat({ output: 'yaml', outputExplicit: true }),
      (e) => e instanceof ReviewPlanError && /Unsupported output format/.test(e.message)
    );
  });
});

const fixedNow = () => '2026-05-17T00:00:00Z';
const okConfig = async () => ({});

describe('runReviewPlan — guards (#802 Phase 3)', () => {
  test('throws ReviewPlanError when --plan-only is not set', async () => {
    await assert.rejects(
      () => runReviewPlan({ planOnly: false, loadConfigImpl: okConfig }),
      ReviewPlanError
    );
  });

  test('throws ReviewPlanError on invalid phase', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          phase: 'bogus',
          loadConfigImpl: okConfig,
          resolveAllArtifactsImpl: async () => ({}),
        }),
      ReviewPlanError
    );
  });

  test('wraps config load failure as ReviewPlanError', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          loadConfigImpl: async () => {
            throw new Error('bad yaml');
          },
        }),
      (err) => err instanceof ReviewPlanError && /bad yaml/.test(err.message)
    );
  });
});

describe('runReviewPlan — output (#802 Phase 3)', () => {
  test('no diff artifact → schema-valid no-changes artifact (version "1")', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.version, '1');
    assert.equal(artifact.phase, 'upstream');
    assert.equal(artifact.status, 'no-changes');
    assert.deepEqual(artifact.findings, []);
    assert.equal(artifact.plan.plannerMode, 'off');
    assert.deepEqual(artifact.plan.selectedSkills, []);
    assert.equal('debug' in artifact, false);
  });

  test('emits decision + trace.run_id (#1045 A1); usage absent without LLM', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
      generateRunId: () => 'fixed-run-id-1',
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    // empty findings → clean verdict
    assert.equal(artifact.decision, 'auto-approve');
    assert.deepEqual(artifact.trace, { run_id: 'fixed-run-id-1' });
    // no LLM ran → no usage block
    assert.equal('usage' in artifact, false);
  });

  test('resolved diff artifact → deterministic skill selection (status ok), no LLM', async () => {
    let planArgs;
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/src/foo.mjs\n@@ -0,0 +1 @@\n+x\n',
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return {
          selected: [
            {
              metadata: { id: 's1', name: 'Skill One', phase: 'midstream', modelHint: 'balanced' },
            },
          ],
          skipped: [
            { skill: { metadata: { id: 's2', name: 'Skill Two' } }, reasons: ['phase mismatch'] },
          ],
        };
      },
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.plan.selectedSkills, [
      { id: 's1', name: 'Skill One', phase: 'midstream', modelHint: 'balanced' },
    ]);
    assert.deepEqual(artifact.plan.skippedSkills, [{ id: 's2', reasons: ['phase mismatch'] }]);
    assert.equal(artifact.plan.plannerMode, 'off');
    // Hard guarantee: no LLM path (planner undefined, dryRun, llm disabled).
    assert.equal(planArgs.planner, undefined);
    assert.equal(planArgs.dryRun, true);
    assert.equal(planArgs.llmEnabled, false);
    assert.equal(planArgs.plannerMode, 'off');
    assert.deepEqual(planArgs.changedFiles, ['src/foo.mjs']);
  });

  test('forwards skillIds to buildExecutionPlan (--skill-set wiring #976/#1027)', async () => {
    let planArgs;
    await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      skillIds: ['requirements-acceptance'],
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/src/foo.mjs\n@@ -0,0 +1 @@\n+x\n',
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return { selected: [], skipped: [] };
      },
    });
    assert.deepEqual(planArgs.skillIds, ['requirements-acceptance']);
  });

  test('skillIds defaults to null when --skill-set is not given', async () => {
    let planArgs;
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/src/foo.mjs\n@@ -0,0 +1 @@\n+x\n',
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return { selected: [], skipped: [] };
      },
    });
    assert.equal(planArgs.skillIds, null);
  });

  test('wraps buildExecutionPlan failure as ReviewPlanError', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          loadConfigImpl: okConfig,
          resolveAllArtifactsImpl: async () => ({
            diff: {
              id: 'diff',
              path: '/repo/d.patch',
              source: 'cwd',
              exists: true,
              optional: true,
            },
          }),
          readFileImpl: async () => 'diff --git a/x b/x\n',
          buildExecutionPlanImpl: async () => {
            throw new Error('skill load boom');
          },
        }),
      (err) => err instanceof ReviewPlanError && /skill load boom/.test(err.message)
    );
  });

  test('attaches resolved artifacts under debug only when debug is set (still schema-valid)', async () => {
    const resolved = {
      plan: { id: 'plan', path: '/repo/plan.md', source: 'cli', exists: true, optional: false },
    };
    const artifact = await runReviewPlan({
      planOnly: true,
      debug: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => resolved,
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.deepEqual(artifact.debug.resolvedArtifacts, resolved);
  });

  test('passes cli artifacts and config artifacts through to the resolver', async () => {
    let received;
    await runReviewPlan({
      planOnly: true,
      cwd: '/repo',
      cliArtifacts: { plan: './plan.md' },
      artifactsDir: 'sub',
      now: fixedNow,
      loadConfigImpl: async () => ({ artifacts: { diff: './d.patch' } }),
      resolveAllArtifactsImpl: async (opts) => {
        received = opts;
        return {};
      },
    });
    assert.deepEqual(received.cliArgs, { plan: './plan.md' });
    assert.deepEqual(received.configArtifacts, { diff: './d.patch' });
    assert.equal(received.cwd, resolve('/repo', 'sub'));
  });

  test('ignores a non-object config.artifacts', async () => {
    let received;
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: async () => ({ artifacts: 'not-an-object' }),
      resolveAllArtifactsImpl: async (opts) => {
        received = opts;
        return {};
      },
    });
    assert.deepEqual(received.configArtifacts, {});
  });

  test('executionDeferred:true sets debug.executionDeferred without debug:true', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      executionDeferred: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
    });
    assert.ok(validate(artifact));
    assert.equal(artifact.debug?.executionDeferred, true);
    assert.equal(
      artifact.debug?.resolvedArtifacts,
      undefined,
      'resolvedArtifacts requires debug:true'
    );
  });

  test('executionDeferred:true coexists with debug:true (both fields present)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      executionDeferred: true,
      debug: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
    });
    assert.equal(artifact.debug.executionDeferred, true);
    assert.ok(artifact.debug.resolvedArtifacts);
  });

  test('executionDeferred:false (default) leaves debug.executionDeferred unset', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
    });
    assert.equal(artifact.debug?.executionDeferred, undefined);
  });
});

describe('runReviewExecReplay (#802 Phase 3 — --plan replay contract)', () => {
  const samplePlanArtifact = {
    version: '1',
    timestamp: '2026-05-19T00:00:00Z',
    phase: 'upstream',
    status: 'ok',
    findings: [],
    plan: {
      plannerMode: 'off',
      selectedSkills: [{ id: 'rr-upstream-x', name: 'X', phase: 'upstream', modelHint: 'cheap' }],
      skippedSkills: [{ id: 'rr-upstream-y', reasons: ['phase-mismatch'] }],
    },
  };

  test('echoes a schema-valid Review Artifact from a full plan JSON', async () => {
    const artifact = await runReviewExecReplay({
      planFile: join(tmpdir(), 'plan.json'),
      now: fixedNow,
      readFileImpl: async () => JSON.stringify(samplePlanArtifact),
    });
    assert.ok(validate(artifact), `schema invalid: ${JSON.stringify(validate.errors)}`);
    assert.equal(artifact.version, '1');
    assert.equal(artifact.timestamp, '2026-05-17T00:00:00Z');
    assert.equal(artifact.phase, 'upstream', 'phase from source plan');
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.findings, []);
    assert.equal(artifact.plan.plannerMode, 'off');
    assert.deepEqual(artifact.plan.selectedSkills, samplePlanArtifact.plan.selectedSkills);
    assert.deepEqual(artifact.plan.skippedSkills, samplePlanArtifact.plan.skippedSkills);
  });

  test('accepts a bare plan object (no version/phase) → defaults to midstream', async () => {
    const bare = {
      plannerMode: 'order',
      selectedSkills: [{ id: 'rr-midstream-z', name: 'Z' }],
      skippedSkills: [],
    };
    const artifact = await runReviewExecReplay({
      planFile: join(tmpdir(), 'bare.json'),
      now: fixedNow,
      readFileImpl: async () => JSON.stringify(bare),
    });
    assert.ok(validate(artifact));
    assert.equal(artifact.phase, 'midstream');
    assert.equal(artifact.plan.plannerMode, 'order');
    assert.equal(artifact.status, 'ok');
  });

  test('empty selectedSkills → status no-changes', async () => {
    const empty = {
      version: '1',
      timestamp: '2026-05-19T00:00:00Z',
      phase: 'downstream',
      status: 'no-changes',
      findings: [],
      plan: { plannerMode: 'off', selectedSkills: [], skippedSkills: [] },
    };
    const artifact = await runReviewExecReplay({
      planFile: join(tmpdir(), 'empty.json'),
      now: fixedNow,
      readFileImpl: async () => JSON.stringify(empty),
    });
    assert.equal(artifact.status, 'no-changes');
    assert.equal(artifact.phase, 'downstream');
  });

  test('normalizes unknown plannerMode to "off"', async () => {
    const artifact = await runReviewExecReplay({
      planFile: join(tmpdir(), 'p.json'),
      now: fixedNow,
      readFileImpl: async () =>
        JSON.stringify({
          plannerMode: 'bogus',
          selectedSkills: [{ id: 'rr-x', name: 'X' }],
        }),
    });
    assert.equal(artifact.plan.plannerMode, 'off');
  });

  test('debug:true attaches replay metadata', async () => {
    const planFile = join(tmpdir(), 'dbg.json');
    const artifact = await runReviewExecReplay({
      planFile,
      debug: true,
      now: fixedNow,
      readFileImpl: async () => JSON.stringify(samplePlanArtifact),
    });
    assert.ok(artifact.debug?.replay);
    assert.equal(artifact.debug.replay.source, planFile);
    assert.equal(artifact.debug.replay.sourcePhase, 'upstream');
    assert.equal(artifact.debug.replay.sourceTimestamp, '2026-05-19T00:00:00Z');
  });

  test('throws ReviewPlanError when planFile is missing', async () => {
    await assert.rejects(() => runReviewExecReplay({}), ReviewPlanError);
  });

  test('throws ReviewPlanError when file read fails', async () => {
    await assert.rejects(
      () =>
        runReviewExecReplay({
          planFile: '/missing',
          readFileImpl: async () => {
            throw new Error('ENOENT');
          },
        }),
      (e) => e instanceof ReviewPlanError && /Failed to read/.test(e.message)
    );
  });

  test('throws ReviewPlanError when JSON is malformed', async () => {
    await assert.rejects(
      () =>
        runReviewExecReplay({
          planFile: '/bad',
          readFileImpl: async () => '{not json',
        }),
      (e) => e instanceof ReviewPlanError && /Failed to parse/.test(e.message)
    );
  });

  test('throws ReviewPlanError when selectedSkills is missing', async () => {
    await assert.rejects(
      () =>
        runReviewExecReplay({
          planFile: '/x',
          readFileImpl: async () => JSON.stringify({ plannerMode: 'off' }),
        }),
      (e) => e instanceof ReviewPlanError && /selectedSkills/.test(e.message)
    );
  });

  test('throws ReviewPlanError when a selectedSkills entry has no id', async () => {
    await assert.rejects(
      () =>
        runReviewExecReplay({
          planFile: '/x',
          readFileImpl: async () => JSON.stringify({ selectedSkills: [{ name: 'noid' }] }),
        }),
      (e) => e instanceof ReviewPlanError && /selectedSkills\[0\]\.id/.test(e.message)
    );
  });
});

describe('runReviewPlan({ executeReview }) (#802 Phase 3 A2-1)', () => {
  const diffPath = '/repo/diff.patch';
  const sampleDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('debug');
   return 42;
 }
`;

  function resolveDiff() {
    return { diff: { exists: true, path: diffPath, source: 'cwd' } };
  }

  function planWithSkill() {
    return {
      selected: [{ metadata: { id: 'rr-test-skill', name: 'Test', phase: 'midstream' } }],
      skipped: [],
    };
  }

  test('executeReview:true wires generateReview and populates schema-valid findings', async () => {
    let received;
    const artifact = await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => planWithSkill(),
      generateReviewImpl: async (opts) => {
        received = opts;
        return {
          findings: [
            {
              id: 'rr-1',
              ruleId: 'rr-test-skill',
              title: 'Avoid console.log in production',
              message: 'Use the logger instead.',
              severity: 'minor',
              file: 'src/foo.ts',
              lineStart: 2,
              lineEnd: 2,
              confidence: 'high',
              status: 'open',
              suggestion: 'Remove the debug log',
            },
          ],
          debug: { llmUsed: false, heuristicsUsed: true },
        };
      },
    });
    assert.ok(validate(artifact), `schema invalid: ${JSON.stringify(validate.errors)}`);
    assert.equal(artifact.status, 'ok');
    assert.equal(artifact.findings.length, 1);
    const f = artifact.findings[0];
    assert.equal(f.line, 2, 'lineStart must be projected as line');
    assert.equal(f.lineEnd, undefined, 'lineEnd is omitted when equal to lineStart');
    assert.equal(f.phase, 'midstream', 'phase falls back to artifact phase');
    assert.equal(f.severity, 'minor');
    assert.equal(received.diff.diffText, sampleDiff);
    assert.equal(received.dryRun, false);
    assert.equal(received.plan.selected.length, 1);
  });

  test('executeReview:true builds plan with llmEnabled:true (fixes A1 emptiness)', async () => {
    let planArgs;
    await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return planWithSkill();
      },
      generateReviewImpl: async () => ({ findings: [] }),
    });
    assert.equal(planArgs.llmEnabled, true);
    assert.equal(planArgs.dryRun, false);
  });

  test('executeReview:false (default) keeps llmEnabled:false (plan-only path)', async () => {
    let planArgs;
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return planWithSkill();
      },
      generateReviewImpl: async () => {
        throw new Error('generateReview must NOT be called when executeReview is false');
      },
    });
    assert.equal(planArgs.llmEnabled, false);
    assert.equal(planArgs.dryRun, true);
  });

  test('executeReview:true attaches debug.execution trace', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => planWithSkill(),
      generateReviewImpl: async () => ({
        findings: [],
        debug: { llmUsed: false, llmSkipped: 'API key missing', heuristicsUsed: false },
      }),
    });
    assert.equal(artifact.debug.execution.skillsExecuted, 1);
    assert.equal(artifact.debug.execution.findingsCount, 0);
    assert.equal(artifact.debug.execution.llmUsed, false);
    assert.equal(artifact.debug.execution.llmSkipped, 'API key missing');
  });

  test('throws when both executeReview and executionDeferred are true', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          executeReview: true,
          executionDeferred: true,
          now: fixedNow,
          loadConfigImpl: okConfig,
        }),
      (e) => e instanceof ReviewPlanError && /mutually exclusive/.test(e.message)
    );
  });

  test('generateReview failure surfaces as ReviewPlanError', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          executeReview: true,
          now: fixedNow,
          loadConfigImpl: okConfig,
          resolveAllArtifactsImpl: resolveDiff,
          readFileImpl: async () => sampleDiff,
          buildExecutionPlanImpl: async () => planWithSkill(),
          generateReviewImpl: async () => {
            throw new Error('LLM blew up');
          },
        }),
      (e) => e instanceof ReviewPlanError && /Failed to execute review skills/.test(e.message)
    );
  });

  test('finding with phase upstream is preserved (not overwritten by artifact phase)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      executeReview: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => planWithSkill(),
      generateReviewImpl: async () => ({
        findings: [
          {
            ruleId: 'rr-upstream-x',
            title: 'design review',
            message: 'plan mismatch',
            severity: 'major',
            phase: 'upstream',
            file: 'docs/plan.md',
            lineStart: 5,
            lineEnd: 7,
          },
        ],
      }),
    });
    assert.ok(validate(artifact));
    const f = artifact.findings[0];
    assert.equal(f.phase, 'upstream');
    assert.equal(f.line, 5);
    assert.equal(f.lineEnd, 7);
  });

  test('no-diff path returns no-changes without invoking generateReview', async () => {
    let called = false;
    const artifact = await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({ diff: { exists: false } }),
      generateReviewImpl: async () => {
        called = true;
        return { findings: [] };
      },
    });
    assert.equal(artifact.status, 'no-changes');
    assert.equal(called, false);
  });
});

describe('runReviewPlan availableContexts propagation (#802 Phase 3 A2-fix-1)', () => {
  const diffPath = '/repo/diff.patch';
  const sampleDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('debug');
   return 42;
 }
`;
  const resolveDiff = () => ({ diff: { exists: true, path: diffPath, source: 'cwd' } });

  function captureBuildExecutionPlanArgs() {
    const captured = { args: null };
    return {
      captured,
      impl: async (args) => {
        captured.args = args;
        return { selected: [], skipped: [] };
      },
    };
  }

  test('defaults to ["diff"] when a diff artifact is resolved', async () => {
    const { captured, impl } = captureBuildExecutionPlanArgs();
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: impl,
    });
    assert.deepEqual(captured.args.availableContexts, ['diff']);
  });

  test('respects an explicit availableContexts argument', async () => {
    const { captured, impl } = captureBuildExecutionPlanArgs();
    await runReviewPlan({
      planOnly: true,
      availableContexts: ['diff', 'tests', 'junit'],
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: impl,
    });
    assert.deepEqual(captured.args.availableContexts, ['diff', 'tests', 'junit']);
  });

  test('forces "diff" to remain present when CLI passes only narrower contexts', async () => {
    // Regression for Gemini PR #865 review: previously `--context tests`
    // would silently drop the diff context and re-introduce the A1
    // silent-skip failure. We now alwaysInclude: ['diff'] when running
    // in the diff-resolved branch.
    const { captured, impl } = captureBuildExecutionPlanArgs();
    await runReviewPlan({
      planOnly: true,
      availableContexts: ['tests'],
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: impl,
    });
    assert.deepEqual([...captured.args.availableContexts].sort(), ['diff', 'tests']);
  });

  test('merges RIVER_AVAILABLE_CONTEXTS into the effective set (dedup)', async () => {
    const previous = process.env.RIVER_AVAILABLE_CONTEXTS;
    process.env.RIVER_AVAILABLE_CONTEXTS = 'tests, junit';
    try {
      const { captured, impl } = captureBuildExecutionPlanArgs();
      await runReviewPlan({
        planOnly: true,
        availableContexts: ['diff'],
        now: fixedNow,
        loadConfigImpl: okConfig,
        resolveAllArtifactsImpl: resolveDiff,
        readFileImpl: async () => sampleDiff,
        buildExecutionPlanImpl: impl,
      });
      assert.deepEqual([...captured.args.availableContexts].sort(), ['diff', 'junit', 'tests']);
    } finally {
      if (previous == null) delete process.env.RIVER_AVAILABLE_CONTEXTS;
      else process.env.RIVER_AVAILABLE_CONTEXTS = previous;
    }
  });

  test('empty availableContexts falls back to the diff default', async () => {
    const { captured, impl } = captureBuildExecutionPlanArgs();
    await runReviewPlan({
      planOnly: true,
      availableContexts: [],
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: impl,
    });
    assert.deepEqual(captured.args.availableContexts, ['diff']);
  });

  test('availableContexts does not leak into the artifact (debug-only field)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      availableContexts: ['diff'],
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    assert.ok(validate(artifact), `schema invalid: ${JSON.stringify(validate.errors)}`);
    assert.equal(artifact.plan.availableContexts, undefined);
  });
});

describe('runReviewPlan availableDependencies propagation (#802 Phase 3 A2-fix-2)', () => {
  const sampleDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('debug');
   return 42;
 }
`;
  const resolveDiff = () => ({ diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' } });

  function captureArgs() {
    const captured = { args: null };
    return {
      captured,
      impl: async (args) => {
        captured.args = args;
        return { selected: [], skipped: [] };
      },
    };
  }

  test('defaults to null when no dependencies are configured (skipping disabled)', async () => {
    const previousEnvDeps = process.env.RIVER_AVAILABLE_DEPENDENCIES;
    const previousStubs = process.env.RIVER_DEPENDENCY_STUBS;
    delete process.env.RIVER_AVAILABLE_DEPENDENCIES;
    delete process.env.RIVER_DEPENDENCY_STUBS;
    try {
      const { captured, impl } = captureArgs();
      await runReviewPlan({
        planOnly: true,
        now: fixedNow,
        loadConfigImpl: okConfig,
        resolveAllArtifactsImpl: resolveDiff,
        readFileImpl: async () => sampleDiff,
        buildExecutionPlanImpl: impl,
      });
      assert.equal(captured.args.availableDependencies, null);
    } finally {
      if (previousEnvDeps != null) process.env.RIVER_AVAILABLE_DEPENDENCIES = previousEnvDeps;
      if (previousStubs != null) process.env.RIVER_DEPENDENCY_STUBS = previousStubs;
    }
  });

  test('forwards an explicit availableDependencies argument', async () => {
    const { captured, impl } = captureArgs();
    await runReviewPlan({
      planOnly: true,
      availableDependencies: ['code_search', 'test_runner'],
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: impl,
    });
    assert.deepEqual(captured.args.availableDependencies, ['code_search', 'test_runner']);
  });

  test('RIVER_DEPENDENCY_STUBS=1 enables the default stub set', async () => {
    const previousStubs = process.env.RIVER_DEPENDENCY_STUBS;
    process.env.RIVER_DEPENDENCY_STUBS = '1';
    try {
      const { captured, impl } = captureArgs();
      await runReviewPlan({
        planOnly: true,
        now: fixedNow,
        loadConfigImpl: okConfig,
        resolveAllArtifactsImpl: resolveDiff,
        readFileImpl: async () => sampleDiff,
        buildExecutionPlanImpl: impl,
      });
      assert.ok(Array.isArray(captured.args.availableDependencies));
      assert.ok(captured.args.availableDependencies.includes('code_search'));
      assert.ok(captured.args.availableDependencies.includes('test_runner'));
    } finally {
      if (previousStubs == null) delete process.env.RIVER_DEPENDENCY_STUBS;
      else process.env.RIVER_DEPENDENCY_STUBS = previousStubs;
    }
  });

  test('RIVER_AVAILABLE_DEPENDENCIES env var is honored when no arg is passed', async () => {
    const previousEnvDeps = process.env.RIVER_AVAILABLE_DEPENDENCIES;
    process.env.RIVER_AVAILABLE_DEPENDENCIES = 'code_search, adr_lookup';
    try {
      const { captured, impl } = captureArgs();
      await runReviewPlan({
        planOnly: true,
        now: fixedNow,
        loadConfigImpl: okConfig,
        resolveAllArtifactsImpl: resolveDiff,
        readFileImpl: async () => sampleDiff,
        buildExecutionPlanImpl: impl,
      });
      assert.deepEqual([...captured.args.availableDependencies].sort(), [
        'adr_lookup',
        'code_search',
      ]);
    } finally {
      if (previousEnvDeps == null) delete process.env.RIVER_AVAILABLE_DEPENDENCIES;
      else process.env.RIVER_AVAILABLE_DEPENDENCIES = previousEnvDeps;
    }
  });
});

describe('runReviewPlan analysis context propagation (#802 Phase 3 A2-fix-3)', () => {
  const sampleDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('debug');
   return 42;
 }
`;
  const resolveDiff = () => ({ diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' } });
  const planWithAnalysisContext = () => ({
    selected: [{ metadata: { id: 'rr-test-skill', name: 'Test', phase: 'midstream' } }],
    skipped: [],
    fileTypes: { 'src/foo.ts': 'code' },
    relatedADRs: [{ id: 'ADR-001', title: 'Logging policy' }],
    reviewMode: 'medium',
  });

  test('forwards fileTypes / relatedADRs / reviewMode from plan to generateReview', async () => {
    let received;
    await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => planWithAnalysisContext(),
      generateReviewImpl: async (opts) => {
        received = opts;
        return { findings: [], debug: { heuristicsUsed: false } };
      },
    });
    assert.deepEqual(received.fileTypes, { 'src/foo.ts': 'code' });
    assert.deepEqual(received.relatedADRs, [{ id: 'ADR-001', title: 'Logging policy' }]);
    assert.equal(received.reviewMode, 'medium');
  });

  test('analysis context fields stay undefined when buildExecutionPlan omits them', async () => {
    let received;
    await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      // The minimal plan shape used by older tests does NOT include
      // fileTypes/relatedADRs/reviewMode. Passing undefined keeps the
      // generateReview call backwards-compatible.
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
      generateReviewImpl: async (opts) => {
        received = opts;
        return { findings: [] };
      },
    });
    assert.equal(received.fileTypes, undefined);
    assert.equal(received.relatedADRs, undefined);
    assert.equal(received.reviewMode, undefined);
  });
});

describe('runReviewPlan riskAssessment propagation (#802 Phase 3 A2-fix-4)', () => {
  const sampleDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('debug');
   return 42;
 }
`;
  const resolveDiff = () => ({ diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' } });

  test('loads risk map and forwards it to buildExecutionPlan', async () => {
    const sampleRiskMap = { version: 1, rules: [] };
    let planArgs;
    let loadedRoot;
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async (root) => {
        loadedRoot = root;
        return sampleRiskMap;
      },
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return { selected: [], skipped: [] };
      },
    });
    assert.ok(loadedRoot, 'loadRiskMap must receive the repo root');
    assert.deepEqual(planArgs.riskMap, sampleRiskMap);
  });

  test('null risk map (missing file) preserves the backward-compatible undefined sentinel', async () => {
    let planArgs;
    await runReviewPlan({
      planOnly: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async (args) => {
        planArgs = args;
        return { selected: [], skipped: [] };
      },
    });
    assert.equal(planArgs.riskMap, null);
  });

  test('riskMap load failure surfaces as ReviewPlanError', async () => {
    await assert.rejects(
      () =>
        runReviewPlan({
          planOnly: true,
          now: fixedNow,
          loadConfigImpl: okConfig,
          loadRiskMapImpl: async () => {
            throw new Error('YAML parse boom');
          },
        }),
      (e) => e instanceof ReviewPlanError && /Failed to load risk map/.test(e.message)
    );
  });

  test('plan.riskAssessment is forwarded to generateReview when execution runs', async () => {
    let received;
    const riskAssessment = {
      aggregateAction: 'escalate',
      escalatedFiles: ['src/foo.ts'],
      humanReviewFiles: [],
      fileRisks: [{ file: 'src/foo.ts', action: 'escalate' }],
    };
    await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => ({ version: 1, rules: [] }),
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => ({
        selected: [{ metadata: { id: 'rr-test-skill', name: 'Test', phase: 'midstream' } }],
        skipped: [],
        riskAssessment,
      }),
      generateReviewImpl: async (opts) => {
        received = opts;
        return { findings: [] };
      },
    });
    assert.deepEqual(received.riskAssessment, riskAssessment);
  });

  test('riskAssessment stays undefined when buildExecutionPlan omits it', async () => {
    let received;
    await runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      resolveAllArtifactsImpl: resolveDiff,
      readFileImpl: async () => sampleDiff,
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
      generateReviewImpl: async (opts) => {
        received = opts;
        return { findings: [] };
      },
    });
    assert.equal(received.riskAssessment, undefined);
  });
});

describe('runReviewPlan — human approval triggers (S4)', () => {
  const fixedRunId = () => 'fixed-run-id-approval';

  test('pbi-input with deployment trigger → info finding + human-review-required decision', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/pbi-input.md') return 'Deploy to production using rm -rf /tmp/old';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.ok(infoFinding, 'info finding should be present');
    assert.equal(infoFinding.severity, 'info');
    assert.ok(/deployment/.test(infoFinding.message), 'message should mention trigger name');
    assert.equal(infoFinding.file, '/repo/pbi-input.md');
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('no triggers in plan text → no info finding, decision unchanged (backward compat)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/pbi-input.md') return 'Add a new feature to the dashboard component.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.equal(infoFinding, undefined, 'no info finding expected without triggers');
    assert.equal(artifact.decision, 'auto-approve');
  });

  test('plan-only/executeReview=false with triggers → info finding present, decision is human-review-required', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      executeReview: false,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        plan: {
          id: 'plan',
          path: '/repo/plan.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/plan.md') return 'This plan modifies user data and billing records.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.ok(infoFinding, 'info finding should be present even in plan-only mode');
    assert.equal(infoFinding.severity, 'info');
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('plan trigger only → finding.file is plan path, not pbi-input', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
        plan: {
          id: 'plan',
          path: '/repo/plan.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/pbi-input.md') return 'Add a new feature to the dashboard.';
        if (p === '/repo/plan.md') return 'Update billing records on the production server.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const findings = artifact.findings.filter((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.equal(findings.length, 1, 'only one finding — triggered by plan.md');
    assert.equal(findings[0].file, '/repo/plan.md', 'file should point to plan.md');
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('both pbi-input and plan have triggers → two separate findings with correct file paths', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
        plan: {
          id: 'plan',
          path: '/repo/plan.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        // Both files must contain HIGH-confidence triggers so the scan emits
        // a finding for each file after the tier-split (#1171 item1).
        if (p === '/repo/pbi-input.md') return 'Update the user data export for GDPR.';
        if (p === '/repo/plan.md') return 'Run database migration on billing records.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const findings = artifact.findings.filter((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.equal(findings.length, 2, 'two findings — one per triggering file');
    const files = findings.map((f) => f.file);
    assert.ok(files.includes('/repo/pbi-input.md'), 'pbi-input.md finding present');
    assert.ok(files.includes('/repo/plan.md'), 'plan.md finding present');
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('trigger at end of file without trailing newline → still detected (no word-boundary miss)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      // No trailing newline — previously concatenation could miss \b if second
      // file started immediately after. Use a HIGH-confidence trigger so the
      // scan emits a finding after the tier-split (#1171 item1).
      readFileImpl: async (p) => {
        if (p === '/repo/pbi-input.md') return 'Export user data for compliance';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.ok(infoFinding, 'trigger at end of file without trailing newline should be detected');
    assert.equal(infoFinding.file, '/repo/pbi-input.md');
    assert.equal(artifact.decision, 'human-review-required');
  });
});

// ---------------------------------------------------------------------------
// F5: stable finding ID + cross-file dedup (#1170 F5)
// ---------------------------------------------------------------------------
describe('runReviewPlan — human approval F5: stable id + dedup', () => {
  const fixedNow = () => '2026-01-01T00:00:00.000Z';
  const fixedRunId = () => 'test-run-id';
  const okConfig = async () => ({});

  test('human-approval finding has stable id matching /^rr-/', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        plan: {
          id: 'plan',
          path: '/repo/plan.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/plan.md') return 'Run billing migration.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const findings = artifact.findings.filter((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.ok(findings.length > 0, 'expected at least one human-approval finding');
    for (const f of findings) {
      assert.ok(
        typeof f.id === 'string' && /^rr-/.test(f.id),
        `finding.id should match /^rr-/ but got: "${f.id}"`
      );
    }
  });

  test('same trigger in both pbi and plan → only one finding emitted (cross-file dedup)', async () => {
    // Both files contain the 'billing' trigger (HIGH confidence).
    // The dedup logic should emit only one finding for this trigger.
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      loadRiskMapImpl: async () => null,
      generateRunId: fixedRunId,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi-input.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
        plan: {
          id: 'plan',
          path: '/repo/plan.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async (p) => {
        if (p === '/repo/pbi-input.md') return 'Update billing subscription.';
        if (p === '/repo/plan.md') return 'Migrate billing records to new schema.';
        return '';
      },
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    const findings = artifact.findings.filter((f) => f.ruleId === 'rr-plan-review-human-approval');
    // Exactly one finding because the same 'billing' trigger fires in both files
    // and the cross-file dedup coalesces them into a single finding.
    assert.equal(
      findings.length,
      1,
      `expected 1 deduplicated finding but got ${findings.length}: ${JSON.stringify(findings.map((f) => f.id))}`
    );
    assert.ok(/^rr-/.test(findings[0].id), 'deduplicated finding should have stable id');
    assert.equal(artifact.decision, 'human-review-required');
  });
});

describe('runReviewPlan — LLM adjudicator wiring (#1348 S1)', () => {
  const fixedNow = () => '2026-07-02T00:00:00.000Z';
  const okConfig = async () => ({});
  const fixedRunId = () => 'fixed-run-id-adjudicator';
  // LOW-confidence-only plan text: cron + webhook, no HIGH keyword
  const lowOnlyPlan = 'Register a cron entry that calls the customer webhook nightly.';

  const baseOpts = (overrides = {}) => ({
    planOnly: true,
    phase: 'upstream',
    now: fixedNow,
    loadConfigImpl: okConfig,
    loadRiskMapImpl: async () => null,
    generateRunId: fixedRunId,
    resolveAllArtifactsImpl: async () => ({
      plan: { id: 'plan', path: '/repo/plan.md', source: 'cwd', exists: true, optional: true },
    }),
    readFileImpl: async (p) => (p === '/repo/plan.md' ? lowOnlyPlan : ''),
    buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    ...overrides,
  });

  test('injected adjudicator escalates LOW-only candidates → human-review-required', async () => {
    let received = null;
    const artifact = await runReviewPlan(
      baseOpts({
        humanApprovalAdjudicator: async (candidates, text, artifactKind) => {
          received = { candidates, text, artifactKind };
          return true;
        },
      })
    );
    assert.ok(received, 'adjudicator should be invoked');
    assert.equal(received.artifactKind, 'plan');
    assert.ok(
      received.candidates.some((c) => c.confidence === 'low'),
      'adjudicator should receive the LOW candidates'
    );
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.ok(infoFinding, 'escalated verdict should emit the info finding');
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('adjudicator returning false keeps LOW-only plan at auto-approve', async () => {
    const artifact = await runReviewPlan(baseOpts({ humanApprovalAdjudicator: async () => false }));
    const infoFinding = artifact.findings.find((f) => f.ruleId === 'rr-plan-review-human-approval');
    assert.equal(infoFinding, undefined);
    assert.equal(artifact.decision, 'auto-approve');
  });

  test('adjudicator can NOT loosen a HIGH-confidence regex verdict (asymmetric escalation)', async () => {
    const artifact = await runReviewPlan(
      baseOpts({
        readFileImpl: async (p) => (p === '/repo/plan.md' ? 'Run rm -rf /data as cleanup' : ''),
        humanApprovalAdjudicator: async () => false, // lenient LLM must be ignored
      })
    );
    assert.equal(artifact.decision, 'human-review-required');
  });

  test('adjudicator failure degrades to the regex verdict (fail-safe, no throw)', async () => {
    const artifact = await runReviewPlan(
      baseOpts({
        debug: true,
        humanApprovalAdjudicator: async () => {
          throw new Error('LLM down');
        },
      })
    );
    assert.equal(artifact.decision, 'auto-approve');
    assert.equal(artifact.debug.humanApproval?.[0]?.mode, 'regex-fallback');
  });

  test('default plan-only path stays regex-only (documented no-LLM contract)', async () => {
    // humanApprovalAdjudicator omitted + executeReview=false → no adjudicator
    const artifact = await runReviewPlan(baseOpts({ debug: true }));
    assert.equal(artifact.decision, 'auto-approve');
    assert.equal(artifact.debug.humanApproval?.[0]?.mode, 'regex-only');
    assert.equal(artifact.debug.humanApproval?.[0]?.required, false);
  });

  test('debug audit trail records mode + candidate count per file', async () => {
    const artifact = await runReviewPlan(
      baseOpts({ debug: true, humanApprovalAdjudicator: async () => true })
    );
    const audit = artifact.debug.humanApproval;
    assert.ok(Array.isArray(audit) && audit.length === 1, 'one scanned file with candidates');
    assert.equal(audit[0].file, '/repo/plan.md');
    assert.equal(audit[0].mode, 'llm-adjudicated');
    assert.ok(audit[0].candidates >= 2, 'cron + external-posting candidates expected');
    assert.equal(audit[0].required, true);
  });
});

// ---------------------------------------------------------------------------
// Epic #1347 S2 (#1349) — gate block wiring
// ---------------------------------------------------------------------------
describe('runReviewPlan — gate block (Epic #1347 S2)', () => {
  test('a plan-only / no-changes run gates as NO_GO NOT_EXECUTED (fail-safe M1)', async () => {
    // A vacuous perfect score over zero executed findings must not read as
    // CONVERGED_CLEAN — and an agent suppressing diff resolution must not
    // obtain a GO.
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({}),
      generateRunId: () => 'gate-run-1',
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.ok(artifact.gate, 'gate block must be attached on the exec/plan path');
    assert.equal(artifact.gate.decision, 'NO_GO');
    assert.equal(artifact.gate.reasonCode, 'NOT_EXECUTED');
    assert.equal(artifact.gate.inputs.reviewExecuted, false);
    assert.equal(artifact.gate.inputs.artifactStatus, 'no-changes');
    assert.equal(artifact.gate.inputs.riskMapPresent, false);
    assert.match(artifact.gate.inputsHash, /^[0-9a-f]{16}$/);
    assert.equal(artifact.gate.schemaVersion, '1');
  });

  test('plan.executionOrder / estimatedCost flow into the artifact (S2 PR-2)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/src/foo.mjs\n@@ -0,0 +1 @@\n+x\n',
      buildExecutionPlanImpl: async () => ({
        selected: [],
        skipped: [],
        executionOrder: ['heuristic', 'llm'],
        estimatedCost: { tokens: 12, source: 'token-estimator' },
      }),
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.deepEqual(artifact.plan.executionOrder, ['heuristic', 'llm']);
    assert.deepEqual(artifact.plan.estimatedCost, { tokens: 12, source: 'token-estimator' });
  });

  test('risk-map require_human_review reaches the gate as RISK_MAP_HUMAN_REVIEW (C1 wiring)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/src/db/migrate.mjs\n@@ -0,0 +1 @@\n+x\n',
      loadRiskMapImpl: async () => ({
        version: '1',
        rules: [{ match: 'src/db/**', action: 'require_human_review' }],
      }),
      buildExecutionPlanImpl: async (args) => ({
        selected: [],
        skipped: [],
        // Same shape review-runner returns since #877: riskAssessment rides
        // on the plan result, NOT on artifact.plan (the C1 regression).
        riskAssessment: {
          fileRisks: [{ file: 'src/db/migrate.mjs', action: 'require_human_review' }],
          aggregateAction: 'require_human_review',
          escalatedFiles: [],
          humanReviewFiles: ['src/db/migrate.mjs'],
        },
      }),
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.gate.decision, 'ESCALATE');
    assert.equal(artifact.gate.reasonCode, 'RISK_MAP_HUMAN_REVIEW');
    assert.equal(artifact.gate.inputs.riskAction, 'require_human_review');
    assert.equal(artifact.gate.inputs.riskMapPresent, true);
    assert.match(artifact.gate.inputs.riskMapDigest, /^[0-9a-f]{16}$/);
  });

  test('a diff touching .river/ escalates via the bootstrap cliff (rule 0)', async () => {
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'midstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        diff: { id: 'diff', path: '/repo/d.patch', source: 'cwd', exists: true, optional: true },
      }),
      readFileImpl: async () => '--- /dev/null\n+++ b/.river/risk-map.yaml\n@@ -0,0 +1 @@\n+x\n',
      buildExecutionPlanImpl: async () => ({ selected: [], skipped: [] }),
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(artifact.gate.decision, 'ESCALATE');
    assert.equal(artifact.gate.reasonCode, 'GATE_CONFIG_CHANGED');
    assert.equal(artifact.gate.tier, 'cliff');
    assert.equal(artifact.gate.inputs.gateConfigChanged, true);
  });

  test('llm-skipped end-to-end: HIGH plan trigger skips the adjudicator and gates as cliff', async () => {
    let adjudicatorCalls = 0;
    const artifact = await runReviewPlan({
      planOnly: true,
      phase: 'upstream',
      now: fixedNow,
      loadConfigImpl: okConfig,
      resolveAllArtifactsImpl: async () => ({
        'pbi-input': {
          id: 'pbi-input',
          path: '/repo/pbi.md',
          source: 'cwd',
          exists: true,
          optional: true,
        },
      }),
      readFileImpl: async () => 'このプランは rm -rf /data を実行する',
      humanApprovalAdjudicator: async () => {
        adjudicatorCalls += 1;
        return false; // even a lenient LLM must never be consulted here
      },
    });
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors));
    assert.equal(adjudicatorCalls, 0, 'HIGH match must skip the adjudicator (llm-skipped)');
    assert.equal(artifact.gate.decision, 'ESCALATE');
    assert.equal(artifact.gate.reasonCode, 'HUMAN_APPROVAL_REQUIRED');
    assert.equal(artifact.gate.inputs.humanApprovalMode, 'llm-skipped');
  });
});
