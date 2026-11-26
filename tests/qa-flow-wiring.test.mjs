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
const TASK_FLOW = JSON.parse(
  readFileSync(new URL('../flows/task-completion-review.flow.json', import.meta.url), 'utf8')
);

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

async function runTaskFlow(capability) {
  const inputs = Object.fromEntries(TASK_FLOW.inputs.map((input) => [input.name, 'x']));
  const result = await executeFlow({
    document: TASK_FLOW,
    inputs,
    capabilities: { 'evaluate-completion': capability },
  });
  return result.steps.find((record) => record.id === 'evaluate-completion');
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
      scope: 'task',
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
      scope: 'task',
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
    scope: 'task',
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
        scope: 'task',
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
      scope: 'task',
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
      scope: 'final',
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
      make: async () => ({
        ...(await evaluateQaEvidence({
          evidence: JSON.stringify(BASE.evidence),
          population: BASE.context.population,
          observed: BASE.context.observed,
          roots: ROOTS,
          independence: 'known',
          trustedSourceIds: BASE.context.trustedSourceIds,
        })),
        skillFindings: [],
      }),
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
        scope: 'task',
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
