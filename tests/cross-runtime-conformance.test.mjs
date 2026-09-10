/**
 * Cross-runtime conformance kit (#2020, Epic #2011 Phase 9).
 *
 * The kit answers whether the host runtime changed the MEANING of a review
 * judgment. Each fixture under tests/fixtures/cross-runtime/ is one paired
 * observation of the same pinned Flow execution on Claude Code and on the
 * Codex Plugin, and this suite keeps both the dataset and the comparator
 * honest:
 *
 *  1. every fixture validates against schemas/cross-runtime-conformance.schema.json,
 *  2. the dataset covers every class #2020 "Dataset" lists,
 *  3. the comparator reproduces each fixture's hand-authored `expected` block,
 *  4. positive fixtures pass the Promotion Gate and negative ones fail it,
 *  5. the suite-level Promotion Gate is evaluated over the positive fixtures.
 *
 * `expected` is authored by hand from the scenario, never copied from a
 * comparator run: a fixture whose expectation came out of the code under test
 * would agree with any behaviour that code has, which is the self-consistency
 * trap #1656 already paid for.
 *
 * Nothing here calls a model. The fixtures are recorded observations, so the
 * whole suite runs offline with no LLM API key — the repository keeps LLM eval
 * optional, and a conformance gate that needed a key could not be a gate.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSchemaFile } from './helpers/schema-validator.mjs';
import {
  RUNTIMES,
  GATE_CONDITIONS,
  DIVERGENCE_REASONS,
  classifyDivergence,
  evaluateCase,
  evaluateSuite,
} from './helpers/cross-runtime-conformance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, 'fixtures', 'cross-runtime');
const SCHEMA_FILE = 'cross-runtime-conformance.schema.json';
const ADAPTER_MAP_FILE = path.join(HERE, '..', 'agents', 'contracts', 'adapter-map.json');

const adapterMap = JSON.parse(fs.readFileSync(ADAPTER_MAP_FILE, 'utf8'));

const sorted = (values) => [...new Set(values)].sort();

/** Collect one binding field over every Agent adapter-map.json binds for a runtime. */
const bindingValues = (runtime, key) =>
  sorted(
    Object.values(adapterMap.agents)
      .map((bindings) => bindings[runtime]?.[key])
      .filter((value) => value != null)
  );

const validate = compileSchemaFile(SCHEMA_FILE, { ajvOptions: { allErrors: true } });
const schema = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'schemas', SCHEMA_FILE), 'utf8'));

const files = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const fixtures = files.map((file) => ({
  file,
  record: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')),
}));

describe('cross-runtime conformance kit (#2020)', () => {
  test('the kit is not empty and every fixture is schema-valid', () => {
    assert.ok(fixtures.length > 0, 'no fixtures found');
    for (const { file, record } of fixtures) {
      assert.ok(validate(record), `${file}: ${JSON.stringify(validate.errors)}`);
    }
  });

  test('the kit covers every dataset class named in #2020', () => {
    const covered = new Set(fixtures.map((f) => f.record.caseClass));
    for (const cls of schema.properties.caseClass.enum) {
      assert.ok(covered.has(cls), `dataset class "${cls}" has no fixture`);
    }
  });

  test('the kit carries both positive and negative fixtures', () => {
    const byExpectation = (value) => fixtures.filter((f) => f.record.expectation === value).length;
    assert.ok(byExpectation('conformant') > 0, 'no positive fixture');
    assert.ok(byExpectation('non-conformant') > 0, 'no negative fixture');
  });

  test('case ids are unique and each pair names both runtimes exactly once', () => {
    const ids = fixtures.map((f) => f.record.caseId);
    assert.equal(new Set(ids).size, ids.length, 'duplicate caseId');
    for (const { file, record } of fixtures) {
      const runtimes = record.observations.map((o) => o.runtime).sort();
      assert.deepEqual(
        runtimes,
        [...RUNTIMES].sort(),
        `${file}: runtimes must be exactly ${RUNTIMES}`
      );
    }
  });

  for (const { file, record } of fixtures) {
    test(`${file}: the comparator reproduces the hand-authored expectation`, () => {
      const result = evaluateCase(record);
      assert.equal(result.deterministicConformance, record.expected.deterministicConformance);
      assert.equal(result.manifestCompleteness, record.expected.manifestCompleteness);
      assert.equal(result.criticalRegressionCount, record.expected.criticalRegressionCount);
      assert.equal(result.unexplainedDivergenceCount, record.expected.unexplainedDivergenceCount);
      assert.equal(result.humanAuthorityUnchanged, record.expected.humanAuthorityUnchanged);
      assert.equal(result.promotionGate, record.expected.promotionGate);
      assert.deepEqual(result.failedGates, record.expected.failedGates ?? []);
    });

    test(`${file}: the expectation agrees with the fixture's declared role`, () => {
      const expectPass = record.expectation === 'conformant';
      assert.equal(
        record.expected.promotionGate,
        expectPass ? 'pass' : 'fail',
        'a positive fixture must pass the gate and a negative one must fail it'
      );
      assert.equal((record.expected.failedGates ?? []).length === 0, expectPass);
    });

    test(`${file}: the comparator never returns a promotion decision`, () => {
      const result = evaluateCase(record);
      assert.equal(result.promotionDecision, null);
      assert.equal(result.requiresHumanApproval, true);
    });
  }

  test('every negative fixture fails a gate condition the kit actually distinguishes', () => {
    const failed = new Set(
      fixtures
        .filter((f) => f.record.expectation === 'non-conformant')
        .flatMap((f) => f.record.expected.failedGates ?? [])
    );
    for (const condition of GATE_CONDITIONS) {
      assert.ok(failed.has(condition), `no negative fixture exercises gate "${condition}"`);
    }
  });

  test('the suite-level Promotion Gate passes over the positive fixtures', () => {
    const suite = evaluateSuite(fixtures.map((f) => f.record));
    assert.equal(suite.deterministicConformance, 1);
    assert.equal(suite.manifestCompleteness, 1);
    assert.equal(suite.criticalRegressionCount, 0);
    assert.equal(suite.unexplainedDivergenceCount, 0);
    assert.equal(suite.humanAuthorityUnchanged, true);
    assert.equal(suite.promotionGate, 'pass');
    assert.deepEqual(suite.failedGates, []);
    // Evidence, never authority: a green suite is not an approval to promote.
    assert.equal(suite.promotionDecision, null);
    assert.equal(suite.requiresHumanApproval, true);
  });

  // RUNTIMES and the adapter vocabulary in the schema are MIRRORS of
  // agents/contracts/adapter-map.json (#2014), not independent lists. Nothing
  // stopped them drifting: adding a runtime or a mechanism there would leave
  // this kit silently measuring the old world. JSON Schema cannot reach across
  // documents, so the mirror is pinned here.
  describe('the kit mirrors agents/contracts/adapter-map.json', () => {
    test('RUNTIMES and the runtime enum are the runtimes adapter-map.json binds', () => {
      const declared = sorted(Object.keys(adapterMap.runtimes));
      assert.deepEqual(sorted(RUNTIMES), declared);
      assert.deepEqual(sorted(schema.$defs.observation.properties.runtime.enum), declared);
    });

    test('every agent binding names only runtimes adapter-map.json declares', () => {
      const declared = new Set(Object.keys(adapterMap.runtimes));
      for (const [agent, bindings] of Object.entries(adapterMap.agents)) {
        assert.deepEqual(
          sorted(Object.keys(bindings)),
          sorted([...declared]),
          `${agent} must bind exactly the declared runtimes`
        );
      }
    });

    test('the adapter vocabulary in the schema is the vocabulary adapter-map.json uses', () => {
      const adapter = schema.$defs.observation.properties.adapter.properties;
      const across = (key) => sorted(RUNTIMES.flatMap((runtime) => bindingValues(runtime, key)));
      assert.deepEqual(sorted(adapter.mechanisms.items.enum), across('mechanism'));
      assert.deepEqual(sorted(adapter.fallbacks.items.enum), across('fallback'));
      assert.deepEqual(
        sorted(adapter.capabilities.items.enum),
        sorted(RUNTIMES.flatMap((runtime) => adapterMap.runtimes[runtime].capabilities))
      );
    });

    test('no observation claims a binding adapter-map.json does not record', () => {
      for (const { file, record } of fixtures) {
        for (const observation of record.observations) {
          const runtime = observation.runtime;
          const allowed = {
            mechanisms: bindingValues(runtime, 'mechanism'),
            surfaces: bindingValues(runtime, 'surface'),
            fallbacks: bindingValues(runtime, 'fallback'),
            capabilities: sorted(adapterMap.runtimes[runtime].capabilities),
          };
          // Subset, not equality: a fixture may deliberately record a
          // counterfactual binding (neg-unsupported-adapter-claim gives Claude
          // the Codex-shaped binding so an adapter excuse has nothing to stand
          // on). What it may never do is invent a binding the runtime does not
          // have — that would make the evidence the comparator checks fictional.
          for (const [key, values] of Object.entries(allowed)) {
            for (const value of observation.adapter[key] ?? []) {
              assert.ok(
                values.includes(value),
                `${file}: ${runtime} adapter.${key} claims "${value}", which adapter-map.json does not record`
              );
            }
          }
        }
      }
    });
  });

  test('the schema and the comparator share one divergence vocabulary', () => {
    assert.deepEqual(
      [...schema.$defs.declaredDivergence.properties.reasonClass.enum].sort(),
      [...DIVERGENCE_REASONS].sort()
    );
    assert.deepEqual(
      [...schema.$defs.expected.properties.failedGates.items.enum].sort(),
      [...GATE_CONDITIONS].sort()
    );
  });
});

describe('divergence reason classification (#2020: adapter vs model)', () => {
  const evidence = {
    mechanismsDiffer: true,
    capabilitiesDiffer: true,
    pinnedInputMismatch: [],
  };
  const claim = (reasonClass) => ({ reasonClass, evidence: 'fixture' });

  test('an undeclared divergence is unexplained', () => {
    const out = classifyDivergence({
      field: 'agentic.findings.taxonomy',
      layer: 'agentic',
      claim: null,
      evidence,
    });
    assert.equal(out.reasonClass, 'unexplained');
  });

  test('model variation may not explain a deterministic field', () => {
    const out = classifyDivergence({
      field: 'deterministic.gate.decision',
      layer: 'deterministic',
      claim: claim('model-variation'),
      evidence,
    });
    assert.equal(out.reasonClass, 'unexplained');
  });

  test('model variation may not explain critical recall', () => {
    const out = classifyDivergence({
      field: 'agentic.findings.criticalRecall',
      layer: 'agentic',
      claim: claim('model-variation'),
      evidence,
    });
    assert.equal(out.reasonClass, 'unexplained');
  });

  test('model variation explains taxonomy labelling', () => {
    const out = classifyDivergence({
      field: 'agentic.findings.taxonomy',
      layer: 'agentic',
      claim: claim('model-variation'),
      evidence,
    });
    assert.equal(out.reasonClass, 'model-variation');
  });

  test('an adapter reason may not explain gate derivation', () => {
    for (const reason of ['adapter-mechanism', 'adapter-capability']) {
      const out = classifyDivergence({
        field: 'deterministic.gate.decision',
        layer: 'deterministic',
        claim: claim(reason),
        evidence,
      });
      assert.equal(out.reasonClass, 'unexplained', reason);
    }
  });

  test('an adapter reason may not explain the human handoff', () => {
    const out = classifyDivergence({
      field: 'agentic.humanEscalation',
      layer: 'agentic',
      claim: claim('adapter-capability'),
      evidence,
    });
    assert.equal(out.reasonClass, 'unexplained');
  });

  test('an adapter reason explains an unrunnable deterministic check', () => {
    const out = classifyDivergence({
      field: 'deterministic.deterministicChecks',
      layer: 'deterministic',
      claim: claim('adapter-capability'),
      evidence,
    });
    assert.equal(out.reasonClass, 'adapter-capability');
  });

  test('an adapter claim without an adapter difference is rejected', () => {
    const flat = { mechanismsDiffer: false, capabilitiesDiffer: false, pinnedInputMismatch: [] };
    for (const reason of ['adapter-mechanism', 'adapter-capability']) {
      const out = classifyDivergence({
        field: 'deterministic.manifest.blocks',
        layer: 'deterministic',
        claim: claim(reason),
        evidence: flat,
      });
      assert.equal(out.reasonClass, 'unexplained', reason);
    }
  });

  test('a dataset-defect claim needs a pinned input that really differs', () => {
    const rejected = classifyDivergence({
      field: 'deterministic.routing.resolvedFlow',
      layer: 'deterministic',
      claim: claim('dataset-defect'),
      evidence,
    });
    assert.equal(rejected.reasonClass, 'unexplained');
    const accepted = classifyDivergence({
      field: 'deterministic.routing.resolvedFlow',
      layer: 'deterministic',
      claim: claim('dataset-defect'),
      evidence: { ...evidence, pinnedInputMismatch: ['codex: flow design-review'] },
    });
    assert.equal(accepted.reasonClass, 'dataset-defect');
  });
});
