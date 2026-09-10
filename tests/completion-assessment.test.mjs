// Contract tests for schemas/completion-assessment.schema.json (#2019, Epic #2011 Phase 8).
//
// #2019 stops at the contract: there is no completion engine yet, so the
// positive cases validate fixtures rather than the output of a production
// function. The point of the suite is the SEPARATION Epic #2011 invariant I6
// demands -- `Completion != Gate`. The gate ledger is therefore IMPORTED from
// src/lib/gate-decision.mjs and pinned against this schema instead of being
// restated here, so a future edit that merges the two vocabularies (in either
// direction) fails a test rather than passing review.
//
// Several #2019 acceptance criteria are cross-field constraints JSON Schema
// cannot express (`tasks.unsupportedClaims` equalling the array length, "the
// counters add up"). Those are enforced here, which is why the schema
// descriptions delegate to this file by name.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { GATE_DECISIONS, GATE_REASON_CODES } from '../src/lib/gate-decision.mjs';
import { compileCompletionAssessmentValidator } from './helpers/schema-validator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCHEMA_PATH = resolve(ROOT, 'schemas', 'completion-assessment.schema.json');
const FIXTURES_DIR = resolve(HERE, 'fixtures', 'completion');
const FLOWS_DIR = resolve(ROOT, 'flows');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readFixture = (name) => readJson(resolve(FIXTURES_DIR, name));

// Compiled once at module scope (ajv compile is expensive, the schema is
// static). Strict mode stays on so future schema typos surface here.
const validate = compileCompletionAssessmentValidator();
const schema = readJson(SCHEMA_PATH);
const schemaText = readFileSync(SCHEMA_PATH, 'utf8');

const COMPLETION_STATES = schema.$defs.completionState.enum;
const COMPLETION_REASON_CODES = schema.$defs.completionReasonCode.enum;
const VALIDATION_STATES = schema.$defs.validationState.enum;

/** Deep clone of a fixture, so each negative case mutates in isolation. */
const clone = (name) => structuredClone(readFixture(name));
const errorsOf = () => JSON.stringify(validate.errors, null, 2);

describe('completion-assessment.schema.json — shape', () => {
  test('schema declares draft 2020-12 and a closed document', () => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);

    const doc = clone('minimal-happy.json');
    doc.gate = 'GO';
    assert.equal(validate(doc), false, 'an extra top-level property must be rejected');
  });

  test('the task-scope and final-scope happy fixtures conform', () => {
    for (const name of ['minimal-happy.json', 'final-happy.json']) {
      assert.equal(validate(readFixture(name)), true, `${name}: ${errorsOf()}`);
    }
  });

  test('the non-COMPLETE fixtures conform', () => {
    for (const name of [
      'evidence-missing-unverified.json',
      'human-judgment.json',
      'blocked.json',
    ]) {
      assert.equal(validate(readFixture(name)), true, `${name}: ${errorsOf()}`);
    }
  });

  test('required fields are enforced', () => {
    for (const field of ['schemaVersion', 'scope', 'mode', 'state', 'reasonCodes', 'evidence']) {
      const doc = clone('minimal-happy.json');
      delete doc[field];
      assert.equal(validate(doc), false, `missing ${field} must be rejected`);
    }
  });

  test('the five #2019 completion states are exactly the declared vocabulary', () => {
    assert.deepEqual(COMPLETION_STATES, [
      'COMPLETE',
      'INCOMPLETE',
      'UNVERIFIED',
      'BLOCKED',
      'HUMAN_JUDGMENT_REQUIRED',
    ]);
    const doc = clone('minimal-happy.json');
    doc.state = 'DONE';
    assert.equal(validate(doc), false, 'an unknown state must be rejected, not tolerated');
  });
});

describe('completion-assessment.schema.json — Completion is not Gate', () => {
  test('no completion value collides with the imported gate vocabulary', () => {
    // Epic #2011 invariant I6. The gate ledger spells its values UPPER_SNAKE and
    // so does this one, but a copy could still be re-spelled (`no-go`,
    // `converged clean`), so the comparison is case- and separator-insensitive.
    const normalize = (value) => value.toLowerCase().replaceAll(/[-_\s]/gu, '');
    const gateWords = new Set([...GATE_DECISIONS, ...GATE_REASON_CODES].map(normalize));

    const enumEntries = Object.entries(schema.$defs)
      .flatMap(([name, def]) => (def.enum ?? []).map((value) => [value, `$defs.${name}`]))
      .concat(
        schema.properties.mode.enum.map((value) => [value, 'properties.mode']),
        schema.properties.humanJudgment.properties.boundary.enum.map((value) => [
          value,
          'properties.humanJudgment.boundary',
        ])
      );
    assert.ok(enumEntries.length > 0, 'the scan must not be vacuous');

    for (const [value, location] of enumEntries) {
      assert.equal(
        gateWords.has(normalize(value)),
        false,
        `${location} re-declares gate vocabulary as "${value}"`
      );
    }
  });

  test('a gate decision or gate reason code is rejected as a completion value', () => {
    assert.equal(validate(readFixture('gate-vocabulary-guard.json')), false);
    for (const decision of GATE_DECISIONS) {
      const doc = clone('minimal-happy.json');
      doc.state = decision;
      assert.equal(validate(doc), false, `state: ${decision} must be rejected`);
      assert.equal(COMPLETION_STATES.includes(decision), false);
    }
    for (const code of GATE_REASON_CODES) {
      const doc = clone('minimal-happy.json');
      doc.reasonCodes = [code];
      assert.equal(validate(doc), false, `reasonCodes: ${code} must be rejected`);
      assert.equal(COMPLETION_REASON_CODES.includes(code), false);
    }
  });

  test('the schema does not copy the gate ledger as literal text', () => {
    // Importing the SSoT instead of re-deriving it: the gate values must live
    // in src/lib/gate-decision.mjs only. Prose may NAME the module and the two
    // ledger constants (that is the pointer to the SSoT), so those two
    // identifiers are the documented exceptions.
    const NAMED_LEDGERS = new Set(['GATE_DECISIONS', 'GATE_REASON_CODES']);
    for (const value of [...GATE_DECISIONS, ...GATE_REASON_CODES]) {
      if (NAMED_LEDGERS.has(value)) continue;
      assert.equal(
        schemaText.includes(`"${value}"`),
        false,
        `schema declares the gate value ${value} as a JSON string`
      );
    }
    assert.ok(
      schemaText.includes('src/lib/gate-decision.mjs'),
      'the schema must point at the gate SSoT rather than silently diverging from it'
    );
  });

  test('the document carries no merge, release or approval authority', () => {
    // #2019: a completion result must never be wired to merge authority.
    assert.equal(validate(readFixture('merge-authority-guard.json')), false);
    const forbidden = ['merge', 'release', 'approve', 'approval', 'autoMerge', 'decision'];
    const declaredKeys = new Set();
    const walkKeys = (node) => {
      if (Array.isArray(node)) return node.forEach(walkKeys);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        declaredKeys.add(key);
        walkKeys(value);
      }
    };
    walkKeys(schema.properties);
    for (const key of declaredKeys) {
      for (const word of forbidden) {
        assert.equal(
          key.toLowerCase().includes(word.toLowerCase()),
          false,
          `property "${key}" looks like ${word} authority; completion must not carry it`
        );
      }
    }
  });

  test('observe mode is the only mode, so an assessment cannot change a decision', () => {
    assert.deepEqual(schema.properties.mode.enum, ['observe']);
    const doc = clone('minimal-happy.json');
    doc.mode = 'enforce';
    assert.equal(validate(doc), false, 'an enforcing mode must be a schema change, not a field');
  });
});

describe('completion-assessment.schema.json — task vs final semantics', () => {
  test('the two scopes match the two Flows that emit a completion output', () => {
    // The scope vocabulary must stay tied to the Flows (#2016) that declare
    // `completion` as an output, otherwise a third semantic could appear here
    // with nothing producing it.
    assert.deepEqual(schema.$defs.completionScope.enum, ['task', 'final']);
    const emittingFlows = readdirSync(FLOWS_DIR)
      .filter((name) => name.endsWith('.flow.json'))
      .map((name) => readJson(resolve(FLOWS_DIR, name)))
      .filter((flow) => (flow.outputs ?? []).includes('completion'))
      .map((flow) => flow.intent.purpose)
      .sort();
    assert.deepEqual(emittingFlows, ['final-convergence', 'task-completion']);
  });

  test('a task-scope assessment cannot validate the goal', () => {
    // Task Completion asks "is there evidence to call THIS task done"; only
    // Final Convergence asks "was the goal achieved". Allowing `validation` at
    // task scope would collapse the two questions into one.
    assert.equal(validate(readFixture('task-scope-validation-guard.json')), false);
    const doc = clone('minimal-happy.json');
    doc.validation = { state: 'GOAL_MET', rationale: 'x' };
    assert.equal(validate(doc), false);
  });

  test('a task-scope assessment must carry task records', () => {
    const doc = clone('minimal-happy.json');
    delete doc.tasks;
    assert.equal(validate(doc), false);
  });

  test('a final-scope assessment must carry both requirements and a goal validation', () => {
    for (const field of ['validation', 'verification']) {
      const doc = clone('final-happy.json');
      delete doc[field];
      assert.equal(validate(doc), false, `final scope without ${field} must be rejected`);
    }
  });

  test('a final-scope assessment does NOT require task records', () => {
    // Tasks are supporting evidence at final scope, not the criterion.
    const doc = clone('final-happy.json');
    delete doc.tasks;
    assert.equal(validate(doc), true, errorsOf());
  });

  test('closing every task does not by itself make the final run COMPLETE', () => {
    // #2019 acceptance criterion: "Final must not become COMPLETE from task
    // exhaustion alone". The fixture has 8-of-8 tasks complete and still fails.
    const fixture = readFixture('false-complete-task-exhaustion-guard.json');
    assert.equal(fixture.tasks.total, fixture.tasks.complete);
    assert.equal(validate(fixture), false);

    // Isolate the goal half of the rule: even with every counter clean, a goal
    // that was never validated cannot yield COMPLETE.
    const notAssessed = clone('final-happy.json');
    notAssessed.validation.state = 'NOT_ASSESSED';
    assert.equal(validate(notAssessed), false);
  });
});

describe('completion-assessment.schema.json — verification vs validation', () => {
  test('verification and validation are separate properties, not one scale', () => {
    assert.ok(schema.properties.verification, 'verification (requirements) must exist');
    assert.ok(schema.properties.validation, 'validation (goal) must exist');
    assert.deepEqual(Object.keys(schema.properties.verification.properties).sort(), [
      'acceptanceCriteria',
      'requirements',
    ]);
    assert.deepEqual(VALIDATION_STATES, [
      'GOAL_MET',
      'GOAL_NOT_MET',
      'NOT_ASSESSED',
      'REQUIRES_HUMAN_JUDGMENT',
    ]);
    // The goal vocabulary must not leak into the DONE vocabulary or vice versa.
    for (const value of VALIDATION_STATES) {
      assert.equal(COMPLETION_STATES.includes(value), false);
    }
  });

  test('requirements can be fully satisfied while the goal is still open', () => {
    // The reason the two axes exist: Verification passing does not imply
    // Validation passing.
    const fixture = readFixture('human-judgment.json');
    assert.equal(fixture.verification.requirements.unverified, 0);
    assert.equal(fixture.verification.requirements.violated, 0);
    assert.equal(fixture.validation.state, 'REQUIRES_HUMAN_JUDGMENT');
    assert.equal(fixture.state, 'HUMAN_JUDGMENT_REQUIRED');
    assert.equal(validate(fixture), true, errorsOf());
  });

  test('unverified requirements or acceptance criteria forbid COMPLETE', () => {
    for (const mutate of [
      (doc) => (doc.verification.requirements.unverified = 1),
      (doc) => (doc.verification.requirements.violated = 1),
      (doc) => (doc.verification.acceptanceCriteria.unverified = 1),
      (doc) => (doc.unresolvedRefs = ['REQ-7']),
    ]) {
      const doc = clone('final-happy.json');
      mutate(doc);
      assert.equal(validate(doc), false);
    }
  });
});

describe('completion-assessment.schema.json — human judgment boundary', () => {
  test('a goal needing human judgment forces the state and names the boundary', () => {
    const missingBoundary = clone('human-judgment.json');
    delete missingBoundary.humanJudgment;
    assert.equal(validate(missingBoundary), false);

    const wrongState = clone('human-judgment.json');
    wrongState.state = 'INCOMPLETE';
    assert.equal(
      validate(wrongState),
      false,
      'a business-value question must not be silently recorded as INCOMPLETE'
    );
  });

  test('the boundary vocabulary is the set River Review refuses to decide', () => {
    assert.deepEqual(schema.properties.humanJudgment.properties.boundary.enum, [
      'business-value',
      'product-scope',
      'risk-acceptance',
      'policy-exception',
    ]);
  });

  test('BLOCKED must say what blocked it', () => {
    const doc = clone('blocked.json');
    delete doc.blockedBy;
    assert.equal(validate(doc), false);
  });
});

describe('completion-assessment.schema.json — unsupported completion claims', () => {
  test('a checked box alone is an unsupported claim and cannot reach COMPLETE', () => {
    // #2019 acceptance criterion: "Task DONE must not depend on a todo
    // checkbox alone". The fixture is otherwise perfect -- every counter clean,
    // diff and tests present -- and is rejected only because one claim is
    // unsupported.
    const fixture = readFixture('unsupported-claim-guard.json');
    assert.deepEqual(fixture.unsupportedClaims[0].claimSource, ['todo-checkbox']);
    assert.equal(validate(fixture), false);

    const cleared = structuredClone(fixture);
    cleared.unsupportedClaims = [];
    cleared.tasks.unsupportedClaims = 0;
    cleared.reasonCodes = ['ALL_REQUIREMENTS_SATISFIED'];
    assert.equal(
      validate(cleared),
      true,
      `clearing the claim must be the only difference: ${errorsOf()}`
    );
  });

  test('an unsupported claim must be reported in reasonCodes', () => {
    const doc = clone('unsupported-claim-guard.json');
    doc.state = 'INCOMPLETE';
    doc.reasonCodes = ['REQUIREMENT_UNSATISFIED'];
    assert.equal(validate(doc), false, 'an unsupported claim must not be silently dropped');
    doc.reasonCodes = ['UNSUPPORTED_COMPLETION_CLAIM'];
    assert.equal(validate(doc), true, errorsOf());
  });

  test('every claimSource names a declaration, never a piece of evidence', () => {
    const claimSources =
      schema.properties.unsupportedClaims.items.properties.claimSource.items.enum;
    const evidenceKinds = new Set(schema.$defs.evidenceKind.enum);
    assert.ok(claimSources.length > 0);
    for (const source of claimSources) {
      assert.equal(
        evidenceKinds.has(source),
        false,
        `${source} is both a claim source and an evidence kind: the distinction would collapse`
      );
    }
  });

  test('the unsupportedClaims counter matches the list', () => {
    // Cross-field constraint JSON Schema cannot express, so it is checked over
    // the shipped fixtures here.
    for (const name of readdirSync(FIXTURES_DIR)) {
      const doc = readFixture(name);
      if (!doc.tasks || doc.unsupportedClaims === undefined) continue;
      assert.equal(
        doc.tasks.unsupportedClaims,
        doc.unsupportedClaims.length,
        `${name}: tasks.unsupportedClaims disagrees with unsupportedClaims.length`
      );
    }
  });
});

describe('completion-assessment.schema.json — evidence', () => {
  test('missing evidence forbids COMPLETE and lands on UNVERIFIED', () => {
    // "evidence missing -> UNVERIFIED": missing evidence is recorded, and
    // COMPLETE becomes unreachable while it is.
    const fixture = readFixture('evidence-missing-unverified.json');
    assert.equal(fixture.state, 'UNVERIFIED');
    assert.equal(validate(fixture), true, errorsOf());

    const claimed = structuredClone(fixture);
    claimed.state = 'COMPLETE';
    assert.equal(validate(claimed), false);

    const doc = clone('minimal-happy.json');
    doc.evidence = doc.evidence.map((entry) =>
      entry.kind === 'tests' ? { ...entry, state: 'missing' } : entry
    );
    assert.equal(validate(doc), false, 'COMPLETE without test evidence must be rejected');
  });

  test('COMPLETE requires diff and test evidence to be present', () => {
    for (const kind of ['diff', 'tests']) {
      const doc = clone('minimal-happy.json');
      doc.evidence = doc.evidence.filter((entry) => entry.kind !== kind);
      assert.equal(validate(doc), false, `COMPLETE without ${kind} evidence must be rejected`);
    }
  });

  test('an unknown evidence kind or state is rejected', () => {
    const unknownKind = clone('minimal-happy.json');
    unknownKind.evidence[0].kind = 'vibes';
    assert.equal(validate(unknownKind), false);

    const unknownState = clone('minimal-happy.json');
    unknownState.evidence[0].state = 'probably-there';
    assert.equal(validate(unknownState), false);
  });

  test('refuses to call a missing-evidence assessment INCOMPLETE', () => {
    // #2019 AC「Evidence 欠損は UNVERIFIED」。`INCOMPLETE` は「調べた結果
    // 満たしていない」で、`missing` は「調べられなかった」なので別物。
    // 同じ状態で表すと、未検証を検証済みの否定として読ませてしまう。
    const doc = readFixture('evidence-missing-unverified.json');
    doc.state = 'INCOMPLETE';
    assert.equal(validate(doc), false, 'missing evidence must not be reported as INCOMPLETE');
  });

  test('keeps UNVERIFIED valid for the same missing evidence', () => {
    const doc = readFixture('evidence-missing-unverified.json');
    doc.state = 'UNVERIFIED';
    assert.equal(validate(doc), true, errorsOf());
  });

  test('every fixture names each evidence kind at most once', () => {
    // `evidence` の description は "one entry per kind" と宣言しているが、
    // draft 2020-12 は「あるプロパティでの一意性」を表現できない。宣言だけ
    // 置いて誰も強制しない状態を避けるため、ここが強制する。
    for (const name of readdirSync(FIXTURES_DIR).filter((n) => n.endsWith('.json'))) {
      const doc = readJson(resolve(FIXTURES_DIR, name));
      const kinds = (doc.evidence ?? []).map((entry) => entry.kind);
      assert.deepEqual(
        [...new Set(kinds)].sort(),
        [...kinds].sort(),
        `${name}: evidence names a kind more than once (${kinds.join(', ')})`
      );
    }
  });
});
