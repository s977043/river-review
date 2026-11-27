// Host-side wiring of the QA completion capability (src/lib/qa-flow-wiring.mjs) against
// docs/development/qa-evidence-contract.md §8.3.1. Audit results come from the production entry
// point (auditQaEvidence) on tests/fixtures/qa-evidence/base.json; assessments are checked with
// the test-side validator.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeFlow } from '../src/lib/flow-runner.mjs';
import {
  completionScopeForPurpose,
  createQaCompletionCapability,
  serializeQaArtifact,
} from '../src/lib/qa-completion.mjs';
import { auditQaEvidence, evaluateQaEvidence } from '../src/lib/qa-evidence.mjs';
import { prepareQaCompletionCapability } from '../src/lib/qa-flow-wiring.mjs';
import { compileCompletionAssessmentValidator } from './helpers/schema-validator.mjs';

const FIXTURES = new URL('./fixtures/qa-evidence/', import.meta.url);
const BASE = JSON.parse(readFileSync(new URL('base.json', FIXTURES), 'utf8'));
const ROOTS = Object.fromEntries(
  Object.entries(BASE.context.roots).map(([name, dir]) => [
    name,
    fileURLToPath(new URL(dir, FIXTURES)),
  ])
);
const readFlow = (name) =>
  JSON.parse(readFileSync(new URL(`../flows/${name}`, import.meta.url), 'utf8'));
const TASK_FLOW = readFlow('task-completion-review.flow.json');
const FINAL_FLOW = readFlow('final-review.flow.json');

const validateAssessment = compileCompletionAssessmentValidator();
const workDir = mkdtempSync(join(tmpdir(), 'qa-flow-wiring-'));
after(() => rmSync(workDir, { recursive: true, force: true }));
let fileCount = 0;
const nextPath = () => join(workDir, `audit-${(fileCount += 1)}.json`);

function productionAudit(evidence = JSON.stringify(BASE.evidence)) {
  return auditQaEvidence({
    evidence,
    population: BASE.context.population,
    observed: BASE.context.observed,
    roots: ROOTS,
  });
}

// The audit as the host finalizes it after the review: skillFindings added (contract §8.4).
async function finalAudit() {
  return {
    ...(await productionAudit()),
    skillFindings: [
      {
        target: 'AC-1',
        severity: 'minor',
        confidence: 'medium',
        title: 'log is short',
        message: 'the pass log has one line',
        evidence: 'logs/pass.txt',
        suggestion: null,
      },
    ],
  };
}

// `requirements` is needed only once the projection gives AC counts (contract §8.3 table).
function taskJudge({ requirements } = {}) {
  return {
    ...(requirements ? { requirements } : {}),
    tasks: { total: 1, complete: 1, unsupportedClaims: 0 },
    evidence: [
      { kind: 'diff', state: 'present' },
      { kind: 'tests', state: 'present' },
      { kind: 'tasks', state: 'present' },
    ],
  };
}

// A writer that stores `content` with `wx` and confirms it, as the host's writer must.
function fileWriter() {
  const calls = [];
  const write = (file) => {
    calls.push(file);
    writeFileSync(file.path, file.content, { flag: 'wx' });
    return true;
  };
  return { write, calls };
}

async function runFlow(document, capability) {
  const inputs = Object.fromEntries(document.inputs.map((input) => [input.name, 'x']));
  const result = await executeFlow({
    document,
    inputs,
    capabilities: { 'evaluate-completion': capability },
  });
  return result.steps.find((record) => record.id === 'evaluate-completion');
}
const runTaskFlow = (capability) => runFlow(TASK_FLOW, capability);

// An audit with a determined QA population, so the projection gives AC counts.
async function projectedAudit() {
  return {
    ...(await evaluateQaEvidence({
      evidence: JSON.stringify(BASE.evidence),
      population: BASE.context.population,
      observed: BASE.context.observed,
      roots: ROOTS,
      independence: 'known',
      trustedSourceIds: BASE.context.trustedSourceIds,
    })),
    skillFindings: [],
  };
}

// Judge parts that both scopes accept for a projected audit.
function bothScopesJudge() {
  return {
    ...taskJudge({ requirements: { total: 1, satisfied: 1, violated: 0, unverified: 0 } }),
    validation: { state: 'GOAL_MET', rationale: 'judge says the goal is met' },
  };
}

const pinnedSha256 = (assessment) =>
  assessment.evidence
    .find((entry) => entry.kind === 'acceptanceCriteria')
    .note.match(/\(sha256 ([0-9a-f]{64})\)$/)?.[1];

describe('the hash covers the final audit', () => {
  test('the stored bytes, with skillFindings, are what the assessment pins', async () => {
    const audit = await finalAudit();
    const path = nextPath();
    const { write } = fileWriter();
    const prepared = await prepareQaCompletionCapability({
      finalAudit: audit,
      path,
      purpose: 'task-completion',
      judge: taskJudge(),
      write,
    });
    assert.equal(prepared.ok, true, prepared.message);

    const stored = readFileSync(path);
    const storedSha256 = createHash('sha256').update(stored).digest('hex');
    assert.deepEqual(JSON.parse(stored.toString('utf8')).skillFindings, audit.skillFindings);
    assert.deepEqual(prepared.qaArtifact, { path, sha256: storedSha256 });

    const step = await runTaskFlow(prepared.capability);
    assert.equal(step.outcome, 'executed');
    assert.equal(pinnedSha256(step.result.assessment), storedSha256);
    assert.ok(step.result.assessment.evidence.some((entry) => entry.note?.includes(path)));
  });

  test('the writer is called once, with the content and hash of the final audit', async () => {
    const audit = await finalAudit();
    const { write, calls } = fileWriter();
    const path = nextPath();
    await prepareQaCompletionCapability({
      finalAudit: audit,
      path,
      purpose: 'task-completion',
      judge: taskJudge(),
      write,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, path);
    assert.equal(calls[0].content, `${JSON.stringify(audit, null, 2)}\n`);
    assert.equal(calls[0].sha256, createHash('sha256').update(calls[0].content).digest('hex'));
  });
});

test('the capability comes only after a slow writer finished storing', async () => {
  const path = nextPath();
  const prepared = await prepareQaCompletionCapability({
    finalAudit: await finalAudit(),
    path,
    purpose: 'task-completion',
    judge: taskJudge(),
    write: async (file) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      writeFileSync(file.path, file.content, { flag: 'wx' });
      return true;
    },
  });
  assert.equal(prepared.ok, true, prepared.message);
  const storedSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(prepared.qaArtifact.sha256, storedSha256);
});

describe('no capability without a confirmed store', () => {
  const cases = {
    'the writer throws': {
      write: () => {
        throw new Error('disk full');
      },
      reason: 'write-failed',
    },
    'the writer rejects': {
      write: async () => {
        throw new Error('EACCES');
      },
      reason: 'write-failed',
    },
    'the writer refuses to replace the file': { write: () => false, reason: 'write-refused' },
    'the writer resolves to a refusal': { write: async () => false, reason: 'write-refused' },
    'the writer confirms nothing': { write: () => undefined, reason: 'write-refused' },
  };
  for (const [name, { write, reason }] of Object.entries(cases)) {
    test(name, async () => {
      const prepared = await prepareQaCompletionCapability({
        finalAudit: await finalAudit(),
        path: nextPath(),
        purpose: 'task-completion',
        judge: taskJudge(),
        write,
      });
      assert.equal(prepared.ok, false);
      assert.equal(prepared.reason, reason);
      assert.equal(prepared.capability, undefined);
    });
  }
});

describe('no capability without the judge parts', () => {
  test('task scope without tasks', async () => {
    const judge = taskJudge();
    delete judge.tasks;
    const { write, calls } = fileWriter();
    const path = nextPath();
    const prepared = await prepareQaCompletionCapability({
      finalAudit: await finalAudit(),
      path,
      purpose: 'task-completion',
      judge,
      write,
    });
    assert.equal(prepared.ok, false);
    assert.equal(prepared.reason, 'judge-invalid');
    assert.equal(prepared.capability, undefined);
    // The audit result is still stored: only the capability is withheld.
    assert.equal(calls.length, 1);
    assert.equal(prepared.qaArtifact.sha256, calls[0].sha256);
  });

  test('final scope without validation and requirements', async () => {
    const prepared = await prepareQaCompletionCapability({
      finalAudit: await finalAudit(),
      path: nextPath(),
      purpose: 'final-convergence',
      judge: taskJudge(),
      write: fileWriter().write,
    });
    assert.equal(prepared.ok, false);
    assert.equal(prepared.reason, 'judge-invalid');
    assert.equal(prepared.capability, undefined);
  });
});

describe('the assessment conforms and is never COMPLETE', () => {
  const requirements = { total: 1, satisfied: 1, violated: 0, unverified: 0 };
  const audits = {
    'production (population undetermined)': { make: () => finalAudit() },
    'rejected evidence': { make: () => productionAudit('{') },
    'every AC verified (independence known, population trusted)': {
      make: projectedAudit,
      judge: { requirements },
    },
    'no QA evidence': { make: () => null },
  };
  for (const [name, { make, judge }] of Object.entries(audits)) {
    test(name, async () => {
      const audit = await make();
      const { write, calls } = fileWriter();
      const prepared = await prepareQaCompletionCapability({
        finalAudit: audit,
        path: nextPath(),
        purpose: 'task-completion',
        judge: taskJudge(judge),
        write,
      });
      assert.equal(prepared.ok, true, prepared.message);
      assert.equal(calls.length, audit === null ? 0 : 1);
      const step = await runTaskFlow(prepared.capability);
      assert.equal(step.outcome, 'executed');
      const { assessment } = step.result;
      assert.ok(validateAssessment(assessment), JSON.stringify(validateAssessment.errors));
      assert.notEqual(assessment.state, 'COMPLETE');
      assert.equal(assessment.scope, 'task');
    });
  }
});

describe('the scope comes from the Flow purpose, as the capability resolves it', () => {
  // Restated literally, as $defs/completionScope pairs them, so a swapped table fails here.
  test('task-completion resolves to task and final-convergence to final', () => {
    assert.equal(completionScopeForPurpose('task-completion'), 'task');
    assert.equal(completionScopeForPurpose('final-convergence'), 'final');
  });

  for (const document of [TASK_FLOW, FINAL_FLOW]) {
    const { purpose } = document.intent;
    test(`${purpose}: the prepared capability assesses the scope createQaCompletionCapability uses`, async () => {
      const audit = await projectedAudit();
      const reference = await runFlow(
        document,
        createQaCompletionCapability({
          audit,
          qaArtifact: {
            path: 'qa/audit.json',
            sha256: serializeQaArtifact(audit).sha256,
          },
          judge: bothScopesJudge(),
        })
      );
      assert.equal(reference.outcome, 'executed', reference.reason);

      const prepared = await prepareQaCompletionCapability({
        finalAudit: audit,
        path: nextPath(),
        purpose,
        judge: bothScopesJudge(),
        write: fileWriter().write,
      });
      assert.equal(prepared.ok, true, prepared.message);
      const step = await runFlow(document, prepared.capability);
      assert.equal(step.outcome, 'executed', step.reason);
      assert.equal(step.result.assessment.scope, reference.result.assessment.scope);
      assert.equal(step.result.assessment.scope, completionScopeForPurpose(purpose));
    });
  }

  test('the dry run checks the scope of the purpose it was given', async () => {
    const judge = taskJudge({
      requirements: { total: 1, satisfied: 1, violated: 0, unverified: 0 },
    });
    const prepare = (purpose) =>
      prepareQaCompletionCapability({
        finalAudit: null,
        path: nextPath(),
        purpose,
        judge: {
          ...judge,
          acceptanceCriteria: { total: 1, verified: 0, unverified: 1 },
        },
        write: fileWriter().write,
      });
    assert.equal((await prepare('task-completion')).ok, true);
    // final scope needs judge.validation, which this judge lacks.
    assert.equal((await prepare('final-convergence')).reason, 'judge-invalid');
  });

  const mismatches = [
    ['task-completion', FINAL_FLOW],
    ['final-convergence', TASK_FLOW],
  ];
  for (const [purpose, document] of mismatches) {
    test(`a capability prepared for ${purpose} refuses a ${document.intent.purpose} Flow`, async () => {
      const prepared = await prepareQaCompletionCapability({
        finalAudit: await projectedAudit(),
        path: nextPath(),
        purpose,
        judge: bothScopesJudge(),
        write: fileWriter().write,
      });
      assert.equal(prepared.ok, true, prepared.message);
      const step = await runFlow(document, prepared.capability);
      assert.equal(step.outcome, 'degraded');
      assert.equal(step.result, undefined);
      assert.match(step.reason, new RegExp(`prepared for a ${purpose} Flow`));
    });
  }

  for (const purpose of [undefined, 'task', 'final', 'toString', 'plan-review']) {
    test(`purpose ${String(purpose)} throws before anything is written`, async () => {
      const { write, calls } = fileWriter();
      await assert.rejects(
        prepareQaCompletionCapability({
          finalAudit: await finalAudit(),
          path: nextPath(),
          purpose,
          judge: taskJudge(),
          write,
        }),
        {
          name: 'TypeError',
          message: /purpose must be task-completion or final-convergence/,
        }
      );
      assert.equal(calls.length, 0);
    });
  }
});

describe('a failure outside the judge parts is not judge-invalid', () => {
  test('an audit whose projection disagrees with its criteria throws before it is stored', async () => {
    const audit = await projectedAudit();
    audit.projection.total += 1;
    const { write, calls } = fileWriter();
    await assert.rejects(
      prepareQaCompletionCapability({
        finalAudit: audit,
        path: nextPath(),
        purpose: 'task-completion',
        judge: bothScopesJudge(),
        write,
      }),
      /projection is not consistent with its criteria/
    );
    assert.equal(calls.length, 0);
  });

  test('a judge that cannot be copied is judge-invalid', async () => {
    const prepared = await prepareQaCompletionCapability({
      finalAudit: await finalAudit(),
      path: nextPath(),
      purpose: 'task-completion',
      judge: { ...taskJudge(), tasks: () => ({ total: 1 }) },
      write: fileWriter().write,
    });
    assert.equal(prepared.ok, false);
    assert.equal(prepared.reason, 'judge-invalid');
  });
});

describe('the capability uses the judge as it was checked', () => {
  test('changing the judge after prepare does not reach the capability', async () => {
    const judge = taskJudge();
    const prepared = await prepareQaCompletionCapability({
      finalAudit: await finalAudit(),
      path: nextPath(),
      purpose: 'task-completion',
      judge,
      write: fileWriter().write,
    });
    assert.equal(prepared.ok, true, prepared.message);

    // Each change alone would make the assessment invalid or different.
    judge.tasks.unsupportedClaims = 3;
    judge.evidence.push({ kind: 'diff', state: 'missing' });
    judge.reasonCodes = ['NOT_A_REASON_CODE'];

    const step = await runTaskFlow(prepared.capability);
    assert.equal(step.outcome, 'executed', step.reason);
    const { assessment } = step.result;
    assert.ok(validateAssessment(assessment), JSON.stringify(validateAssessment.errors));
    assert.deepEqual(assessment.tasks, taskJudge().tasks);
    assert.deepEqual(
      assessment.evidence.map((entry) => entry.kind),
      ['diff', 'tests', 'tasks', 'acceptanceCriteria']
    );
  });

  test('the checked judge cannot be changed through an assessment', async () => {
    const prepared = await prepareQaCompletionCapability({
      finalAudit: await finalAudit(),
      path: nextPath(),
      purpose: 'task-completion',
      judge: taskJudge(),
      write: fileWriter().write,
    });
    const first = await runTaskFlow(prepared.capability);
    assert.throws(() => {
      first.result.assessment.tasks.unsupportedClaims = 3;
    }, TypeError);
    const second = await runTaskFlow(prepared.capability);
    assert.equal(second.outcome, 'executed', second.reason);
    assert.deepEqual(second.result.assessment.tasks, taskJudge().tasks);
  });
});
