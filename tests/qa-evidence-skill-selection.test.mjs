import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadSkills } from '../runners/core/skill-loader.mjs';
import { buildExecutionPlan, selectSkills } from '../runners/core/review-runner.mjs';

// ADR-017 D2: the QA evidence skill is opt-in via inputContext `qaEvidence`.
// Without that context the existing missing-inputContext skip
// (runners/core/review-runner.mjs missingInputContexts / evaluateSkill) must
// leave it unselected with the reason recorded, and adding it must not change
// which existing skills are selected.

const QA_SKILL_ID = 'qa-evidence-consistency';
const QA_CONTEXT = 'qaEvidence';

const idOf = (skill) => (skill.metadata ?? skill).id;
const selectedIds = (result) => result.selected.map(idOf).sort();

const PHASES = ['upstream', 'midstream', 'downstream'];
const CHANGED_FILE_SETS = [
  ['src/app.ts'],
  ['tests/app.test.mjs', 'src/lib/app.mjs'],
  ['docs/adr/001-example.md', 'README.md'],
  ['.github/workflows/ci.yml'],
];
const CONTEXT_SETS = [
  ['diff'],
  ['diff', 'fullFile', 'tests'],
  ['diff', 'fullFile', 'tests', 'adr', 'commitMessage', 'repoConfig', 'prDescription'],
];

function scenarios() {
  const out = [];
  for (const phase of PHASES) {
    for (const changedFiles of CHANGED_FILE_SETS) {
      for (const availableContexts of CONTEXT_SETS) {
        out.push({ phase, changedFiles, availableContexts });
      }
    }
  }
  return out;
}

describe('qa-evidence-consistency skill selection (ADR-017 D2)', async () => {
  const skills = await loadSkills();
  const qaSkill = skills.find((s) => idOf(s) === QA_SKILL_ID);
  const existingSkills = skills.filter((s) => idOf(s) !== QA_SKILL_ID);

  test('the skill is loaded and declares qaEvidence as a required inputContext', () => {
    assert.ok(qaSkill, `${QA_SKILL_ID} must be loadable from skills/`);
    assert.ok(qaSkill.metadata.inputContext.includes(QA_CONTEXT));
    assert.equal(qaSkill.metadata.deterministicGate, undefined);
  });

  test('no existing skill declares qaEvidence (existing inputContext unchanged)', () => {
    const declaring = existingSkills
      .filter((s) => (s.metadata.inputContext ?? []).includes(QA_CONTEXT))
      .map(idOf);
    assert.deepEqual(declaring, []);
  });

  test('without qaEvidence the skill is skipped with the missing inputContext reason', () => {
    for (const availableContexts of CONTEXT_SETS) {
      const result = selectSkills(skills, {
        phase: 'downstream',
        changedFiles: ['src/app.ts'],
        availableContexts,
      });
      assert.ok(!selectedIds(result).includes(QA_SKILL_ID));
      const entry = result.skipped.find((s) => idOf(s.skill) === QA_SKILL_ID);
      assert.ok(entry, `skipped must contain ${QA_SKILL_ID}`);
      assert.deepEqual(entry.reasons, [`missing inputContext: ${QA_CONTEXT}`]);
    }
  });

  test('with qaEvidence the skill is selected', () => {
    const result = selectSkills(skills, {
      phase: 'downstream',
      changedFiles: ['src/app.ts'],
      availableContexts: ['diff', QA_CONTEXT],
    });
    assert.ok(selectedIds(result).includes(QA_SKILL_ID));
    assert.ok(!result.skipped.some((s) => idOf(s.skill) === QA_SKILL_ID));
  });

  test('with qaEvidence but no changed files the skill is not selected (applyTo)', () => {
    const result = selectSkills(skills, {
      phase: 'downstream',
      changedFiles: [],
      availableContexts: ['diff', QA_CONTEXT],
    });
    assert.ok(!selectedIds(result).includes(QA_SKILL_ID));
  });

  test('buildExecutionPlan keeps the skip reason in plan.skipped', async () => {
    const plan = await buildExecutionPlan({
      phase: 'downstream',
      changedFiles: ['src/app.ts'],
      availableContexts: ['diff'],
      skills,
    });
    assert.ok(!plan.selected.map(idOf).includes(QA_SKILL_ID));
    const entry = plan.skipped.find((s) => idOf(s.skill) === QA_SKILL_ID);
    assert.ok(entry);
    assert.deepEqual(entry.reasons, [`missing inputContext: ${QA_CONTEXT}`]);
  });

  test('existing skill selection is unchanged by the new skill and by qaEvidence', () => {
    for (const scenario of scenarios()) {
      const before = selectedIds(selectSkills(existingSkills, scenario));
      const withSkill = selectedIds(selectSkills(skills, scenario));
      const withContext = selectedIds(
        selectSkills(skills, {
          ...scenario,
          availableContexts: [...scenario.availableContexts, QA_CONTEXT],
        })
      ).filter((id) => id !== QA_SKILL_ID);
      const label = JSON.stringify(scenario);
      assert.deepEqual(withSkill, before, `selection changed by adding the skill: ${label}`);
      assert.deepEqual(withContext, before, `selection changed by qaEvidence: ${label}`);
    }
  });
});
