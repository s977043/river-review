import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSkills } from '../runners/core/skill-loader.mjs';
import {
  buildExecutionPlan,
  rankByModelHint,
  selectSkills,
} from '../runners/core/review-runner.mjs';

test('selects skills by phase and applyTo glob', async () => {
  const skills = await loadSkills();
  const { selected } = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
  });
  const ids = selected.map((s) => s.metadata.id);
  assert.ok(ids.includes('hello-skill'), 'midstream skill should be selected');
});

test('skips when required inputContext is missing', () => {
  const skills = [
    {
      metadata: {
        id: 'ctx-required',
        name: 'Needs ADR',
        description: 'requires ADR context',
        phase: 'midstream',
        applyTo: ['src/**/*.ts'],
        inputContext: ['adr'],
      },
    },
  ];
  const { selected, skipped } = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/service.ts'],
    availableContexts: ['diff'],
  });
  assert.equal(selected.length, 0);
  assert.equal(skipped.length, 1);
  assert.ok(skipped[0].reasons.some((r) => r.includes('missing')));
});

test('skips when dependencies are not available', () => {
  const skills = [
    {
      metadata: {
        id: 'needs-deps',
        name: 'Needs test runner',
        description: 'requires test runner',
        phase: 'midstream',
        applyTo: ['src/**/*.ts'],
        dependencies: ['test_runner'],
      },
    },
  ];
  const { selected, skipped } = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/service.ts'],
    availableContexts: ['diff'],
    availableDependencies: [],
  });
  assert.equal(selected.length, 0);
  assert.equal(skipped.length, 1);
  assert.ok(skipped[0].reasons.some((r) => r.includes('missing dependencies')));
});

test('selects when dependencies are available', () => {
  const skills = [
    {
      metadata: {
        id: 'needs-deps',
        name: 'Needs test runner',
        description: 'requires test runner',
        phase: 'midstream',
        applyTo: ['src/**/*.ts'],
        dependencies: ['test_runner'],
      },
    },
  ];
  const { selected, skipped } = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/service.ts'],
    availableContexts: ['diff'],
    availableDependencies: ['test_runner'],
  });
  assert.equal(selected.length, 1);
  assert.equal(skipped.length, 0);
});

test('ranks skills using modelHint proximity', () => {
  const skills = [
    { metadata: { id: 'cheap', phase: 'midstream', applyTo: ['src/**'], modelHint: 'cheap' } },
    {
      metadata: { id: 'balanced', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' },
    },
    {
      metadata: {
        id: 'accurate',
        phase: 'midstream',
        applyTo: ['src/**'],
        modelHint: 'high-accuracy',
      },
    },
  ];
  const ordered = rankByModelHint(skills, 'high-accuracy').map((s) => s.metadata.id);
  assert.deepEqual(ordered, ['accurate', 'balanced', 'cheap']);
});

test('buildExecutionPlan returns ordered selection and skipped list', async () => {
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    preferredModelHint: 'balanced',
  });
  assert.ok(plan.selected.length >= 1);
  assert.ok(Array.isArray(plan.skipped));
});

test('buildExecutionPlan narrows candidates to skillIds when provided', async () => {
  const providedSkills = [
    { metadata: { id: 'a', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
    { metadata: { id: 'b', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
    { metadata: { id: 'c', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
  ];
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    skills: providedSkills,
    skillIds: ['a', 'c'],
  });
  const ids = plan.selected.map((s) => s.metadata.id).sort();
  assert.deepEqual(ids, ['a', 'c']);
});

test('buildExecutionPlan ignores empty skillIds (keeps all candidates)', async () => {
  const providedSkills = [
    { metadata: { id: 'a', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
    { metadata: { id: 'b', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
  ];
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    skills: providedSkills,
    skillIds: [],
  });
  assert.equal(plan.selected.length, 2);
});

test('buildExecutionPlan can use planner when provided', async () => {
  const providedSkills = [
    { metadata: { id: 'a', phase: 'midstream', applyTo: ['src/**'], modelHint: 'cheap' } },
    { metadata: { id: 'b', phase: 'midstream', applyTo: ['src/**'], modelHint: 'high-accuracy' } },
  ];
  const planner = {
    plan: async ({ skills }) => [
      { id: skills[1].id, reason: 'prefer b' },
      { id: skills[0].id, reason: 'then a' },
    ],
  };
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    planner,
    skills: providedSkills,
  });
  const ids = plan.selected.map((s) => s.metadata.id);
  assert.deepEqual(ids, ['b', 'a']);
  assert.equal(plan.plannerFallback, false);
});

test('buildExecutionPlan supports prune mode (planner-selected subset only)', async () => {
  const providedSkills = [
    { metadata: { id: 'a', phase: 'midstream', applyTo: ['src/**'], modelHint: 'cheap' } },
    { metadata: { id: 'b', phase: 'midstream', applyTo: ['src/**'], modelHint: 'high-accuracy' } },
    { metadata: { id: 'c', phase: 'midstream', applyTo: ['src/**'], modelHint: 'balanced' } },
  ];
  const planner = {
    plan: async () => [{ id: 'b', reason: 'only b' }],
  };
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    planner,
    plannerMode: 'prune',
    skills: providedSkills,
  });
  const ids = plan.selected.map((s) => s.metadata.id);
  assert.deepEqual(ids, ['b']);
  assert.equal(plan.plannerFallback, false);
  assert.equal(plan.plannerMode, 'prune');
});

test('buildExecutionPlan falls back when planner output is invalid in prune mode', async () => {
  const providedSkills = [
    { metadata: { id: 'a', phase: 'midstream', applyTo: ['src/**'], modelHint: 'cheap' } },
    { metadata: { id: 'b', phase: 'midstream', applyTo: ['src/**'], modelHint: 'high-accuracy' } },
  ];
  const planner = {
    plan: async () => [{ id: 'unknown', reason: 'bad id' }],
  };
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    planner,
    plannerMode: 'prune',
    skills: providedSkills,
  });
  const ids = plan.selected.map((s) => s.metadata.id);
  assert.deepEqual(ids, ['a', 'b']);
  assert.equal(plan.plannerFallback, true);
});

test('selectSkills skips LLM-only skills when llmEnabled is false', () => {
  const skills = [
    {
      metadata: {
        id: 'security-basic', // Known heuristic skill
        phase: 'midstream',
        applyTo: ['src/**'],
      },
    },
    {
      metadata: {
        id: 'llm-only-skill',
        phase: 'midstream',
        applyTo: ['src/**'],
      },
    },
  ];

  const { selected, skipped } = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    llmEnabled: false,
  });

  const ids = selected.map((s) => s.metadata.id);
  assert.equal(ids.length, 1);
  assert.ok(ids.includes('security-basic'), 'heuristic skill should be selected');
  assert.ok(!ids.includes('llm-only-skill'), 'LLM skill should be skipped');

  const llmSkip = skipped.find((s) => s.skill.metadata.id === 'llm-only-skill');
  assert.ok(llmSkip, 'LLM skill should be in skipped list');
  assert.ok(llmSkip.reasons[0].includes('LLM disabled'), 'Reason should be LLM disabled');
});

test('buildExecutionPlan includes fileTypes in result', async () => {
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/review-engine.mjs', 'tests/verifier.test.mjs', 'package.json'],
    availableContexts: ['diff'],
    dryRun: true,
  });
  assert.ok(plan.fileTypes);
  assert.ok(Array.isArray(plan.fileTypes.app));
  assert.ok(Array.isArray(plan.fileTypes.test));
  assert.ok(Array.isArray(plan.fileTypes.config));
});

test('buildExecutionPlan exposes testImpact with high risk for untested app changes', async () => {
  // #1255: app code changed with no accompanying test files => riskLevel 'high'.
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/review-engine.mjs'],
    availableContexts: ['diff'],
    dryRun: true,
  });
  assert.ok(plan.testImpact, 'plan exposes testImpact');
  assert.equal(plan.testImpact.riskLevel, 'high');
  assert.equal(plan.testImpact.appFilesChanged, 1);
  assert.equal(plan.testImpact.testFilesChanged, 0);
  // carry-over snapshot mirrors the signal for --plan replay consumers.
  assert.equal(plan.snapshot.testImpact.riskLevel, 'high');
});

test('buildExecutionPlan reports low test-impact risk when tests accompany changes', async () => {
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/review-engine.mjs', 'tests/review-engine.test.mjs'],
    availableContexts: ['diff'],
    dryRun: true,
  });
  assert.ok(plan.testImpact);
  assert.equal(plan.testImpact.riskLevel, 'low');
});

const ESCALATION_IDS = ['test-existence', 'coverage-gap'];

test('buildExecutionPlan does not escalate test skills by default (flag off)', async () => {
  // #1255 approach D: default off — high-risk midstream diff must NOT pull in
  // the downstream test skills (baseline behavior unchanged).
  delete process.env.RIVER_ESCALATE_TEST_SKILLS;
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/review-engine.mjs'],
    availableContexts: ['diff'],
  });
  assert.equal(plan.testImpact.riskLevel, 'high');
  const selectedIds = plan.selected.map((s) => (s.metadata ?? s).id);
  for (const id of ESCALATION_IDS) {
    assert.ok(!selectedIds.includes(id), `${id} should not be selected when flag is off`);
  }
});

test('buildExecutionPlan escalates downstream test skills when flag on and risk high', async () => {
  // #1255 approach D: opt-in flag injects the test skills cross-phase.
  process.env.RIVER_ESCALATE_TEST_SKILLS = '1';
  try {
    const plan = await buildExecutionPlan({
      phase: 'midstream',
      changedFiles: ['src/lib/review-engine.mjs'],
      availableContexts: ['diff'],
    });
    assert.equal(plan.testImpact.riskLevel, 'high');
    const selectedIds = plan.selected.map((s) => (s.metadata ?? s).id);
    for (const id of ESCALATION_IDS) {
      assert.ok(selectedIds.includes(id), `${id} should be escalated into the plan`);
      // escalated skills must not also remain in the skipped list.
      const stillSkipped = plan.skipped.some(
        (entry) => (entry.skill.metadata ?? entry.skill).id === id
      );
      assert.ok(!stillSkipped, `${id} should be removed from skipped when escalated`);
    }
  } finally {
    delete process.env.RIVER_ESCALATE_TEST_SKILLS;
  }
});

test('buildExecutionPlan does not escalate when flag on but risk not high', async () => {
  process.env.RIVER_ESCALATE_TEST_SKILLS = '1';
  try {
    const plan = await buildExecutionPlan({
      phase: 'midstream',
      changedFiles: ['src/lib/review-engine.mjs', 'tests/review-engine.test.mjs'],
      availableContexts: ['diff'],
    });
    assert.equal(plan.testImpact.riskLevel, 'low');
    const selectedIds = plan.selected.map((s) => (s.metadata ?? s).id);
    for (const id of ESCALATION_IDS) {
      assert.ok(!selectedIds.includes(id), `${id} should not be escalated when risk is low`);
    }
  } finally {
    delete process.env.RIVER_ESCALATE_TEST_SKILLS;
  }
});

const STATE_TRANSITION_IDS = ['river-review-testing', 'unknown-coverage-review'];
const STATE_TRANSITION_DIFF = [
  'diff --git a/src/lib/job-runner.mjs b/src/lib/job-runner.mjs',
  '--- a/src/lib/job-runner.mjs',
  '+++ b/src/lib/job-runner.mjs',
  '@@ -1,1 +1,12 @@',
  ' export async function run(job) {',
  '+  try {',
  '+    job.status = "running";',
  '+    await job.execute();',
  '+    job.status = "done";',
  '+  } catch (err) {',
  '+    job.status = "failed";',
  '+    await resumeFromCheckpoint(job);',
  '+  } finally {',
  '+    job.phase = "idle";',
  '+  }',
  '+  if (job.retryCount < 3) await retry(job);',
  ' }',
  '',
].join('\n');

test('buildExecutionPlan force-selects testing and unknown-coverage skills for state-transition-dense diffs', async () => {
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/lib/job-runner.mjs'],
    availableContexts: ['diff'],
    diffText: STATE_TRANSITION_DIFF,
  });
  const selectedIds = plan.selected.map((s) => (s.metadata ?? s).id);
  for (const id of STATE_TRANSITION_IDS) {
    assert.ok(selectedIds.includes(id), `${id} should be force-selected`);
    const stillSkipped = plan.skipped.some(
      (entry) => (entry.skill.metadata ?? entry.skill).id === id
    );
    assert.ok(!stillSkipped, `${id} should be removed from skipped`);
  }
});

test('buildExecutionPlan selection is unchanged when the state-transition signal does not fire', async () => {
  const sparseDiff = [
    'diff --git a/src/lib/job-runner.mjs b/src/lib/job-runner.mjs',
    '--- a/src/lib/job-runner.mjs',
    '+++ b/src/lib/job-runner.mjs',
    '@@ -1,1 +1,3 @@',
    ' export function run(job) {',
    '+  job.status = "running";',
    '+  return job.execute();',
    ' }',
    '',
  ].join('\n');
  const options = {
    phase: 'midstream',
    changedFiles: ['src/lib/job-runner.mjs'],
    availableContexts: ['diff'],
  };
  const baseline = await buildExecutionPlan(options);
  const withDiff = await buildExecutionPlan({ ...options, diffText: sparseDiff });
  const ids = (plan) => plan.selected.map((s) => (s.metadata ?? s).id);
  assert.deepEqual(ids(withDiff), ids(baseline));
  for (const id of STATE_TRANSITION_IDS) {
    assert.ok(!ids(withDiff).includes(id), `${id} should not be force-selected`);
  }
});

test('buildExecutionPlan propagates llmEnabled: false to selectSkills', async () => {
  const skills = [
    {
      metadata: { id: 'security-basic', phase: 'midstream', applyTo: ['src/**'] },
    },
    { metadata: { id: 'llm-only-skill', phase: 'midstream', applyTo: ['src/**'] } },
  ];

  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff'],
    skills,
    llmEnabled: false,
  });

  const selectedIds = plan.selected.map((s) => s.metadata.id);
  assert.ok(selectedIds.includes('security-basic'));
  assert.ok(!selectedIds.includes('llm-only-skill'));

  const skippedIds = plan.skipped.map((s) => s.skill.metadata.id);
  assert.ok(skippedIds.includes('llm-only-skill'));
});
