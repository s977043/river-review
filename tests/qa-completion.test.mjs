// Completion capability for QA evidence (src/lib/qa-completion.mjs) against
// docs/development/qa-evidence-contract.md §8 and schemas/completion-assessment.schema.json.
// Audit results come from the validator itself (src/lib/qa-evidence.mjs) on
// tests/fixtures/qa-evidence/base.json; the documents are checked with the test-side validator.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeFlow } from '../src/lib/flow-runner.mjs';
import {
  auditQaEvidence,
  checkQaEvidence,
  determineAcPopulation,
  judgeQaEvidence,
} from '../src/lib/qa-evidence.mjs';
import { projectQaEvidence } from '../src/lib/qa-evidence-projection.mjs';
import {
  QA_COMPLETION_OUTCOMES,
  buildQaCompletionAssessment,
  classifyQaAudit,
  createQaCompletionCapability,
  serializeQaArtifact,
  validateCompletionAssessment,
} from '../src/lib/qa-completion.mjs';
import { compileCompletionAssessmentValidator } from './helpers/schema-validator.mjs';

const FIXTURES = new URL('./fixtures/qa-evidence/', import.meta.url);
const BASE = JSON.parse(readFileSync(new URL('base.json', FIXTURES), 'utf8'));
const ROOTS = Object.fromEntries(
  Object.entries(BASE.context.roots).map(([name, dir]) => [
    name,
    fileURLToPath(new URL(dir, FIXTURES)),
  ])
);
const FLOWS = new URL('../flows/', import.meta.url);
const readFlow = (name) => JSON.parse(readFileSync(new URL(name, FLOWS), 'utf8'));

const validateAssessment = compileCompletionAssessmentValidator();

function fixtureResolutions(refs) {
  const resolutions = new Map();
  for (const ref of refs) {
    const content = readFileSync(join(ROOTS[ref.root], ref.path));
    const sha256 = createHash('sha256').update(content).digest('hex');
    resolutions.set(ref.id, { state: 'ok', sha256, size: content.length });
  }
  return resolutions;
}

// Stages 0-5 with fixture hashes in place of the platform-dependent reader.
function judge({ evidence, population = BASE.context.population, independence = 'known' }) {
  const settled = determineAcPopulation(population);
  const checked = checkQaEvidence(
    typeof evidence === 'string' ? evidence : JSON.stringify(evidence),
    { population: settled }
  );
  return judgeQaEvidence({
    checked,
    population: settled,
    observed: BASE.context.observed,
    artifactResolutions: checked.accepted
      ? fixtureResolutions(checked.evidence.artifacts.refs)
      : new Map(),
    independence,
    trustedSourceIds: BASE.context.trustedSourceIds,
  });
}

function failed(result, acId = result.acId) {
  return {
    ...structuredClone(result),
    acId,
    status: 'FAIL',
    attempts: [
      {
        ...structuredClone(result.attempts[0]),
        status: 'FAIL',
        logRef: 'log-fail',
        assertions: { total: 3, passed: 2 },
        exitCode: 1,
      },
    ],
  };
}

// AC-1 as given (PASS) and AC-2 as a reported FAIL.
function twoCriteria({ firstBasis = 'verified' } = {}) {
  const evidence = structuredClone(BASE.evidence);
  evidence.verification[0].basis = firstBasis;
  evidence.target.acceptanceCriteria.push({
    id: 'AC-2',
    expected: { value: 'returns 404', source: 'sourced', sourceRef: 'spec-ac-1' },
  });
  evidence.verification.push(failed(evidence.verification[0], 'AC-2'));
  evidence.verification[1].basis = 'verified';
  const population = structuredClone(BASE.context.population);
  population.criteria.push({ id: 'AC-2', required: true, expected: 'returns 404' });
  return { evidence, population };
}

function oneFailed() {
  const evidence = structuredClone(BASE.evidence);
  evidence.verification[0] = failed(evidence.verification[0]);
  return { evidence };
}

const AUDITS = {
  'evidence-absent': () => null,
  'evidence-rejected': () => judge({ evidence: '{' }),
  'population-undetermined': () =>
    judge({ evidence: BASE.evidence, population: { ...BASE.context.population, trusted: false } }),
  'all-verified': () => judge({ evidence: BASE.evidence }),
  'unconfirmed-only': () => judge({ evidence: BASE.evidence, independence: 'unknown' }),
  'failed-only': () => judge(oneFailed()),
  mixed: () => judge(twoCriteria({ firstBasis: 'explore' })),
};

// The state table, restated literally so a change to the module's table fails here.
const EXPECTED_STATE = {
  'evidence-absent': 'UNVERIFIED',
  'evidence-rejected': 'UNVERIFIED',
  'population-undetermined': 'UNVERIFIED',
  'all-verified': 'UNVERIFIED',
  'unconfirmed-only': 'UNVERIFIED',
  'failed-only': 'INCOMPLETE',
  mixed: 'INCOMPLETE',
};

const pinned = (audit) =>
  audit === null ? undefined : { path: 'qa/audit.json', sha256: serializeQaArtifact(audit).sha256 };

// The judge-side parts each scope needs. `acceptanceCriteria` is the fallback for an
// undetermined QA population and is ignored when the projection exists.
function judgeParts(scope, { tests = 'present', fallback = 1 } = {}) {
  const parts = {
    requirements: { total: 1, satisfied: 1, violated: 0, unverified: 0 },
    acceptanceCriteria: { total: fallback, verified: 0, unverified: fallback },
    evidence: [
      { kind: 'diff', state: 'present' },
      { kind: 'tests', state: tests },
    ],
  };
  if (scope === 'task') {
    parts.tasks = { total: 1, complete: 1, unsupportedClaims: 0 };
    parts.evidence.push({ kind: 'tasks', state: 'present' });
  } else {
    parts.validation = { state: 'GOAL_MET', rationale: 'judge says the goal is met' };
  }
  return parts;
}

function build(scope, audit, parts = judgeParts(scope)) {
  return buildQaCompletionAssessment({ scope, audit, qaArtifact: pinned(audit), judge: parts });
}

function assertConforms(assessment) {
  assert.ok(validateAssessment(assessment), JSON.stringify(validateAssessment.errors));
}

describe('state table', () => {
  // The absent and rejected rows also land on UNVERIFIED through the missing / unreadable
  // evidence guard, so their table entries are pinned directly.
  test('the exported table is the literal table', () => {
    assert.deepEqual({ ...QA_COMPLETION_OUTCOMES }, EXPECTED_STATE);
  });
  for (const [outcome, makeAudit] of Object.entries(AUDITS)) {
    for (const scope of ['task', 'final']) {
      test(`${outcome} at ${scope} scope: ${EXPECTED_STATE[outcome]}`, () => {
        const audit = makeAudit();
        const { assessment, qa } = build(scope, audit);
        assert.equal(qa.outcome, outcome);
        assert.equal(assessment.state, EXPECTED_STATE[outcome]);
        assert.equal(assessment.scope, scope);
        assertConforms(assessment);
      });
    }
  }

  test('confirmed failures and unconfirmed criteria are named from the audit', () => {
    assert.deepEqual(classifyQaAudit(AUDITS['failed-only']()), {
      outcome: 'failed-only',
      confirmedFailures: ['AC-1'],
      unconfirmed: [],
    });
    assert.deepEqual(classifyQaAudit(AUDITS.mixed()), {
      outcome: 'mixed',
      confirmedFailures: ['AC-2'],
      unconfirmed: ['AC-1'],
    });
  });

  test('a FAIL under unknown independence is unconfirmed, not INCOMPLETE', () => {
    const audit = judge({ ...twoCriteria(), independence: 'unknown' });
    const { assessment, qa } = build('task', audit);
    assert.equal(qa.outcome, 'unconfirmed-only');
    assert.deepEqual(qa.confirmedFailures, []);
    assert.equal(assessment.state, 'UNVERIFIED');
  });

  for (const state of ['missing', 'unreadable']) {
    for (const outcome of ['failed-only', 'mixed']) {
      test(`${outcome} with tests ${state}: UNVERIFIED, never INCOMPLETE`, () => {
        const { assessment } = build(
          'task',
          AUDITS[outcome](),
          judgeParts('task', { tests: state })
        );
        assert.equal(assessment.state, 'UNVERIFIED');
        assertConforms(assessment);
      });
    }
  }

  test('a goal that needs human judgment wins over the table', () => {
    const parts = judgeParts('final');
    parts.validation = { state: 'REQUIRES_HUMAN_JUDGMENT', rationale: 'value call' };
    parts.humanJudgment = { boundary: 'business-value', question: 'worth shipping?' };
    const { assessment } = build('final', AUDITS['failed-only'](), parts);
    assert.equal(assessment.state, 'HUMAN_JUDGMENT_REQUIRED');
    assertConforms(assessment);
  });

  test('a judge-reported blocker gives BLOCKED with blockedBy', () => {
    const parts = { ...judgeParts('task'), blockedBy: ['artifact store unreachable'] };
    const { assessment } = build('task', AUDITS['failed-only'](), parts);
    assert.equal(assessment.state, 'BLOCKED');
    assert.deepEqual(assessment.blockedBy, ['artifact store unreachable']);
    assertConforms(assessment);
  });
});

describe('QA evidence alone never yields COMPLETE', () => {
  // The most favourable judge input: every other piece of evidence present and satisfied.
  for (const [outcome, makeAudit] of Object.entries(AUDITS)) {
    for (const scope of ['task', 'final']) {
      test(`${outcome} at ${scope} scope`, () => {
        const { assessment } = build(scope, makeAudit());
        assert.notEqual(assessment.state, 'COMPLETE');
      });
    }
  }

  const productionInputs = {
    'base evidence with a trusted-looking population': {
      evidence: JSON.stringify(BASE.evidence),
      population: BASE.context.population,
    },
    'two criteria with a reported FAIL': {
      evidence: JSON.stringify(twoCriteria().evidence),
      population: twoCriteria().population,
    },
    'whole rejection': { evidence: '{', population: BASE.context.population },
    'no population': { evidence: JSON.stringify(BASE.evidence), population: undefined },
  };
  for (const [name, input] of Object.entries(productionInputs)) {
    for (const scope of ['task', 'final']) {
      test(`production audit, ${name}, ${scope} scope: UNVERIFIED with verified 0`, async () => {
        const audit = await auditQaEvidence({
          ...input,
          observed: BASE.context.observed,
          roots: ROOTS,
        });
        const { assessment } = build(scope, audit);
        assert.equal(assessment.state, 'UNVERIFIED');
        assert.equal(assessment.verification.acceptanceCriteria.verified, 0);
        assert.ok(assessment.reasonCodes.includes('ACCEPTANCE_CRITERION_UNVERIFIED'));
        assertConforms(assessment);
      });
    }
  }
});

describe('assembly', () => {
  test('AC counts are the projection, not the judge fallback', () => {
    const audit = AUDITS.mixed();
    const { assessment } = build('final', audit, judgeParts('final', { fallback: 9 }));
    assert.deepEqual(
      assessment.verification.acceptanceCriteria,
      projectQaEvidence(audit).acceptanceCriteria
    );
  });

  test('a rejected audit with a determined population still carries its projection', () => {
    const audit = AUDITS['evidence-rejected']();
    const { assessment } = build('task', audit);
    assert.deepEqual(assessment.verification.acceptanceCriteria, {
      total: 1,
      verified: 0,
      unverified: 1,
    });
    assert.deepEqual(assessment.evidence.at(-1).state, 'unreadable');
  });

  test('acceptanceCriteria evidence state follows the audit', () => {
    const states = Object.fromEntries(
      Object.entries(AUDITS).map(([outcome, makeAudit]) => [
        outcome,
        build('task', makeAudit()).assessment.evidence.find(
          (entry) => entry.kind === 'acceptanceCriteria'
        ).state,
      ])
    );
    assert.deepEqual(states, {
      'evidence-absent': 'missing',
      'evidence-rejected': 'unreadable',
      'population-undetermined': 'partial',
      'all-verified': 'present',
      'unconfirmed-only': 'present',
      'failed-only': 'present',
      mixed: 'present',
    });
  });

  test('the projection never marks tests evidence present', () => {
    const parts = judgeParts('task');
    parts.evidence = parts.evidence.filter((entry) => entry.kind !== 'tests');
    for (const makeAudit of Object.values(AUDITS)) {
      const { assessment } = build('task', makeAudit(), parts);
      assert.equal(
        assessment.evidence.some((entry) => entry.kind === 'tests'),
        false
      );
    }
  });

  test('the pinned QA artifact is named in the acceptanceCriteria evidence', () => {
    const audit = AUDITS.mixed();
    const { sha256 } = serializeQaArtifact(audit);
    const { assessment } = build('task', audit);
    assert.match(assessment.evidence.at(-1).note, new RegExp(`qa/audit\\.json .*${sha256}`));
  });

  test('the input audit is left unchanged', () => {
    const audit = AUDITS.mixed();
    const before = structuredClone(audit);
    build('final', audit);
    assert.deepEqual(audit, before);
  });

  test('task scope without AC counts omits verification', () => {
    const parts = judgeParts('task');
    delete parts.acceptanceCriteria;
    const { assessment } = build('task', null, parts);
    assert.equal('verification' in assessment, false);
    assertConforms(assessment);
  });
});

describe('fail-closed inputs', () => {
  test('a QA artifact pinned to another audit is refused', () => {
    const audit = AUDITS.mixed();
    const other = serializeQaArtifact(AUDITS['failed-only']()).sha256;
    assert.throws(
      () =>
        buildQaCompletionAssessment({
          scope: 'task',
          audit,
          qaArtifact: { path: 'qa/audit.json', sha256: other },
          judge: judgeParts('task'),
        }),
      /does not match/
    );
  });

  test('QA evidence without a QA artifact is refused', () => {
    assert.throws(
      () =>
        buildQaCompletionAssessment({
          scope: 'task',
          audit: AUDITS.mixed(),
          judge: judgeParts('task'),
        }),
      /qaArtifact/
    );
  });

  test('a judge fallback that claims verified criteria is refused', () => {
    const parts = judgeParts('final');
    parts.acceptanceCriteria = { total: 1, verified: 1, unverified: 0 };
    assert.throws(() => build('final', AUDITS['population-undetermined'](), parts), /verified/);
  });

  test('the judge cannot supply the acceptanceCriteria evidence entry', () => {
    const parts = judgeParts('task');
    parts.evidence.push({ kind: 'acceptanceCriteria', state: 'present' });
    assert.throws(() => build('task', AUDITS.mixed(), parts), /belongs to the QA capability/);
  });

  test('final scope needs validation, task scope needs tasks', () => {
    const final = judgeParts('final');
    delete final.validation;
    assert.throws(() => build('final', AUDITS.mixed(), final), /failed validation/);
    const task = judgeParts('task');
    delete task.tasks;
    assert.throws(() => build('task', AUDITS.mixed(), task), /failed validation/);
  });

  test('a duplicated evidence kind is refused', () => {
    const parts = judgeParts('task');
    parts.evidence.push({ kind: 'diff', state: 'missing' });
    assert.throws(() => build('task', AUDITS.mixed(), parts), /duplicate evidence kind/);
  });
});

describe('injection through executeFlow', () => {
  const cases = {
    'task-completion-review.flow.json': 'task',
    'final-review.flow.json': 'final',
  };
  for (const [name, scope] of Object.entries(cases)) {
    test(`${name}: evaluate-completion records a ${scope} assessment`, async () => {
      const document = readFlow(name);
      const audit = AUDITS.mixed();
      const inputs = Object.fromEntries(document.inputs.map((input) => [input.name, 'x']));
      const result = await executeFlow({
        document,
        inputs,
        capabilities: {
          'evaluate-completion': createQaCompletionCapability({
            audit,
            qaArtifact: pinned(audit),
            judge: judgeParts(scope),
          }),
        },
      });
      const step = result.steps.find((record) => record.id === 'evaluate-completion');
      assert.equal(step.outcome, 'executed');
      assert.equal(step.result.assessment.scope, scope);
      assert.equal(step.result.assessment.state, 'INCOMPLETE');
      assertConforms(step.result.assessment);
      const gate = result.steps.find((record) => record.id === 'derive-gate');
      assert.equal(gate.outcome, 'not-implemented');
    });
  }

  test('a Flow without a completion intent makes the capability throw', () => {
    const capability = createQaCompletionCapability({ audit: null, judge: judgeParts('task') });
    assert.throws(
      () => capability({ document: { intent: { purpose: 'toString' } } }),
      /task-completion or final-convergence/
    );
  });
});

describe('cross-field consistency', () => {
  const claim = { ref: 'TASK-1', claimSource: ['todo-checkbox'], missingEvidence: ['tests'] };

  test('tasks.unsupportedClaims above the listed claims is refused', () => {
    const parts = judgeParts('task');
    parts.tasks = { ...parts.tasks, unsupportedClaims: 1 };
    parts.unsupportedClaims = [];
    assert.throws(() => build('task', AUDITS.mixed(), parts), /tasks\.unsupportedClaims/);
    delete parts.unsupportedClaims;
    assert.throws(() => build('task', AUDITS.mixed(), parts), /tasks\.unsupportedClaims/);
  });

  test('tasks.unsupportedClaims below the listed claims is refused', () => {
    const parts = judgeParts('task');
    parts.unsupportedClaims = [claim];
    parts.reasonCodes = ['UNSUPPORTED_COMPLETION_CLAIM'];
    assert.throws(() => build('task', AUDITS.mixed(), parts), /tasks\.unsupportedClaims/);
  });

  test('a count that matches the list is accepted', () => {
    const parts = judgeParts('task');
    parts.tasks = { ...parts.tasks, unsupportedClaims: 1 };
    parts.unsupportedClaims = [claim];
    parts.reasonCodes = ['UNSUPPORTED_COMPLETION_CLAIM'];
    const { assessment } = build('task', AUDITS.mixed(), parts);
    assertConforms(assessment);
  });

  test('a judge reasonCode outside the completion vocabulary is refused, not dropped', () => {
    const parts = { ...judgeParts('task'), reasonCodes: ['QA_INDEPENDENCE_UNKNOWN'] };
    assert.throws(() => build('task', AUDITS.mixed(), parts), /outside the completion vocabulary/);
  });

  for (const outcome of ['unconfirmed-only', 'failed-only']) {
    test(`ALL_REQUIREMENTS_SATISFIED with ${EXPECTED_STATE[outcome]} is refused`, () => {
      const parts = { ...judgeParts('task'), reasonCodes: ['ALL_REQUIREMENTS_SATISFIED'] };
      assert.throws(() => build('task', AUDITS[outcome](), parts), /contradicts state/);
    });
  }

  test('ALL_REQUIREMENTS_SATISFIED is kept when the state is BLOCKED', () => {
    const parts = {
      ...judgeParts('task'),
      reasonCodes: ['ALL_REQUIREMENTS_SATISFIED'],
      blockedBy: ['artifact store unreachable'],
    };
    const { assessment } = build('task', AUDITS.mixed(), parts);
    assert.ok(assessment.reasonCodes.includes('ALL_REQUIREMENTS_SATISFIED'));
  });

  test('a projection whose total is not verified + unverified is refused', () => {
    const audit = AUDITS.mixed();
    audit.projection = { ...audit.projection, total: audit.projection.total + 1 };
    assert.throws(() => classifyQaAudit(audit), /not consistent/);
  });

  test('a projection whose verified count disagrees with the criteria is refused', () => {
    const audit = AUDITS['all-verified']();
    audit.projection = { ...audit.projection, verified: 0, unverified: audit.projection.total };
    assert.throws(() => classifyQaAudit(audit), /not consistent/);
    const rejected = AUDITS['evidence-rejected']();
    rejected.projection = { ...rejected.projection, verified: 1, unverified: 0 };
    assert.throws(() => classifyQaAudit(rejected), /not consistent/);
  });

  test('a judge fallback whose counts do not add up is refused', () => {
    const parts = judgeParts('final');
    for (const counts of [
      { total: 2, verified: 0, unverified: 1 },
      { total: 2, verified: 1, unverified: 2 },
    ]) {
      parts.acceptanceCriteria = counts;
      assert.throws(
        () => build('final', AUDITS['population-undetermined'](), parts),
        /unverified = total/
      );
    }
  });
});

describe('QA artifact pinning', () => {
  test('the stored form is the audit result as given, not a canonicalized copy', () => {
    const audit = AUDITS.mixed();
    const { content, sha256 } = serializeQaArtifact(audit);
    assert.equal(content, `${JSON.stringify(audit, null, 2)}\n`);
    assert.equal(sha256, createHash('sha256').update(content).digest('hex'));
  });

  test('the same audit re-serialized with another key order is refused', () => {
    const audit = AUDITS.mixed();
    const reordered = Object.fromEntries(Object.entries(audit).reverse());
    assert.deepEqual(reordered, audit);
    const sha256 = createHash('sha256')
      .update(`${JSON.stringify(reordered, null, 2)}\n`)
      .digest('hex');
    assert.throws(
      () =>
        buildQaCompletionAssessment({
          scope: 'task',
          audit,
          qaArtifact: { path: 'qa/audit.json', sha256 },
          judge: judgeParts('task'),
        }),
      /does not match/
    );
  });

  test('an upper-case sha256 is accepted and recorded in lower case', () => {
    const audit = AUDITS.mixed();
    const { sha256 } = serializeQaArtifact(audit);
    const { assessment } = buildQaCompletionAssessment({
      scope: 'task',
      audit,
      qaArtifact: { path: 'qa/audit.json', sha256: sha256.toUpperCase() },
      judge: judgeParts('task'),
    });
    assert.ok(assessment.evidence.at(-1).note.includes(`sha256 ${sha256})`));
  });

  test('a path of only whitespace is refused', () => {
    const audit = AUDITS.mixed();
    assert.throws(
      () =>
        buildQaCompletionAssessment({
          scope: 'task',
          audit,
          qaArtifact: { path: ' ', sha256: serializeQaArtifact(audit).sha256 },
          judge: judgeParts('task'),
        }),
      /qaArtifact needs a path/
    );
  });
});

describe('only reported failures count as confirmed', () => {
  // Independence is known in both, so the AC's reasonCodes are only the ones named here.
  test('a PASS with failed assertions is unconfirmed, not a confirmed FAIL', () => {
    const evidence = structuredClone(BASE.evidence);
    evidence.verification[0].attempts[0].assertions = { total: 3, passed: 2 };
    const audit = judge({ evidence });
    assert.deepEqual(audit.criteria[0].reasonCodes, ['QA_VERIFICATION_ASSERTIONS_MISSING']);
    assert.deepEqual(classifyQaAudit(audit), {
      outcome: 'unconfirmed-only',
      confirmedFailures: [],
      unconfirmed: ['AC-1'],
    });
    assert.equal(build('task', audit).assessment.state, 'UNVERIFIED');
  });

  test('a SKIP is unconfirmed, not a confirmed FAIL', () => {
    const evidence = structuredClone(BASE.evidence);
    Object.assign(evidence.verification[0], {
      status: 'SKIP',
      attempts: [],
      notRunReason: 'out-of-scope',
    });
    const audit = judge({ evidence });
    assert.deepEqual(audit.criteria[0].reasonCodes, ['QA_VERIFICATION_NOT_PASS']);
    assert.deepEqual(classifyQaAudit(audit), {
      outcome: 'unconfirmed-only',
      confirmedFailures: [],
      unconfirmed: ['AC-1'],
    });
    assert.equal(build('task', audit).assessment.state, 'UNVERIFIED');
  });
});

describe('precedence and reason codes', () => {
  test('human judgment wins over a judge-reported blocker', () => {
    const parts = judgeParts('final');
    parts.validation = { state: 'REQUIRES_HUMAN_JUDGMENT', rationale: 'value call' };
    parts.humanJudgment = { boundary: 'business-value', question: 'worth shipping?' };
    parts.blockedBy = ['artifact store unreachable'];
    const { assessment } = build('final', AUDITS.mixed(), parts);
    assert.equal(assessment.state, 'HUMAN_JUDGMENT_REQUIRED');
    assert.equal('blockedBy' in assessment, false);
  });

  const expectedCodes = {
    'evidence-absent': ['ACCEPTANCE_CRITERION_UNVERIFIED', 'EVIDENCE_SOURCE_UNAVAILABLE'],
    'population-undetermined': ['ACCEPTANCE_CRITERION_UNVERIFIED', 'EVIDENCE_SOURCE_UNAVAILABLE'],
    'all-verified': ['EVIDENCE_SOURCE_UNAVAILABLE'],
    mixed: ['ACCEPTANCE_CRITERION_UNVERIFIED'],
  };
  for (const [outcome, codes] of Object.entries(expectedCodes)) {
    test(`${outcome}: reasonCodes in schema order`, () => {
      assert.deepEqual(build('task', AUDITS[outcome]()).assessment.reasonCodes, codes);
    });
  }

  test('judge codes merge in schema order', () => {
    const parts = judgeParts('task');
    parts.tasks = { ...parts.tasks, unsupportedClaims: 1 };
    parts.unsupportedClaims = [
      { ref: 'TASK-1', claimSource: ['todo-checkbox'], missingEvidence: ['tests'] },
    ];
    parts.reasonCodes = ['UNSUPPORTED_COMPLETION_CLAIM'];
    assert.deepEqual(build('task', AUDITS.mixed(), parts).assessment.reasonCodes, [
      'ACCEPTANCE_CRITERION_UNVERIFIED',
      'UNSUPPORTED_COMPLETION_CLAIM',
    ]);
  });

  test('an audit missing one of its criteria is refused', () => {
    const audit = AUDITS.mixed();
    audit.criteria = audit.criteria.filter((criterion) => criterion.acId !== 'AC-2');
    assert.throws(() => classifyQaAudit(audit), /disagree with its projection/);
  });
});

describe('a capability failure inside executeFlow', () => {
  test('a mismatched QA artifact degrades the step without a result', async () => {
    const document = readFlow('task-completion-review.flow.json');
    const audit = AUDITS.mixed();
    const result = await executeFlow({
      document,
      inputs: Object.fromEntries(document.inputs.map((input) => [input.name, 'x'])),
      capabilities: {
        'evaluate-completion': createQaCompletionCapability({
          audit,
          qaArtifact: { path: 'qa/audit.json', sha256: '0'.repeat(64) },
          judge: judgeParts('task'),
        }),
      },
    });
    const step = result.steps.find((record) => record.id === 'evaluate-completion');
    assert.equal(step.outcome, 'degraded');
    assert.equal(
      step.reason,
      'capability "evaluate-completion" failed: qaArtifact.sha256 does not match the audit result'
    );
    assert.equal('result' in step, false);
    assert.equal(result.stopped, false);
  });
});

describe('which refusals the schema itself makes', () => {
  // `schema`: the test-side validator of schemas/completion-assessment.schema.json.
  // `module`: validateCompletionAssessment. Builder-only checks (vocabulary contradictions, count
  // consistency, QA artifact pinning) never reach a document and are not listed.
  const base = () => build('task', AUDITS.mixed()).assessment;
  const finalBase = () => build('final', AUDITS.mixed()).assessment;
  const cases = {
    'tasks.unsupportedClaims differs from the list': {
      doc: () => ({ ...base(), tasks: { ...base().tasks, unsupportedClaims: 1 } }),
      schema: true,
      module: false,
    },
    'duplicate evidence kind': {
      doc: () => ({
        ...base(),
        evidence: [...base().evidence, { kind: 'diff', state: 'present' }],
      }),
      schema: true,
      module: false,
    },
    'reasonCode outside the vocabulary': {
      doc: () => ({ ...base(), reasonCodes: ['QA_INDEPENDENCE_UNKNOWN'] }),
      schema: false,
      module: false,
    },
    'task scope without tasks': {
      doc: () => {
        const doc = base();
        delete doc.tasks;
        return doc;
      },
      schema: false,
      module: false,
    },
    'final scope without validation': {
      doc: () => {
        const doc = finalBase();
        delete doc.validation;
        return doc;
      },
      schema: false,
      module: false,
    },
    'INCOMPLETE with missing evidence': {
      doc: () => ({
        ...base(),
        evidence: base().evidence.map((entry) =>
          entry.kind === 'tests' ? { ...entry, state: 'missing' } : entry
        ),
      }),
      schema: false,
      module: false,
    },
    'goal needing human judgment recorded as BLOCKED': {
      doc: () => ({
        ...finalBase(),
        state: 'BLOCKED',
        blockedBy: ['x'],
        validation: { state: 'REQUIRES_HUMAN_JUDGMENT', rationale: 'value call' },
      }),
      schema: false,
      module: false,
    },
    'BLOCKED without blockedBy': {
      doc: () => ({ ...base(), state: 'BLOCKED' }),
      schema: false,
      module: false,
    },
  };
  for (const [name, { doc, schema, module }] of Object.entries(cases)) {
    test(name, () => {
      const document = doc();
      assert.equal(validateAssessment(document), schema, 'schema');
      assert.equal(validateCompletionAssessment(document).valid, module, 'module');
    });
  }
});

// ncc rewrites path expressions it evaluates at module load (src/lib/flow-loader.mjs), so the
// schema is read on first validation, not on import.
test('importing the module reads no schema; the first validation reads it once', async () => {
  const reads = [];
  const original = fs.readFileSync;
  fs.readFileSync = (path, ...rest) => {
    if (String(path).endsWith('completion-assessment.schema.json')) reads.push(String(path));
    return original(path, ...rest);
  };
  syncBuiltinESMExports();
  try {
    const fresh = await import('../src/lib/qa-completion.mjs?lazy-schema');
    assert.equal(reads.length, 0, 'import');
    fresh.validateCompletionAssessment({});
    fresh.validateCompletionAssessment({});
    assert.equal(reads.length, 1, 'validation');
  } finally {
    fs.readFileSync = original;
    syncBuiltinESMExports();
  }
});
