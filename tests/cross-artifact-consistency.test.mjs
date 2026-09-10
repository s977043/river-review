// Cross-Artifact Consistency & Semantic Drift contract tests (#2018, Epic #2011 Phase 7).
//
// Cross-path discipline (CLAUDE.md "Import the SSoT, never re-derive it"): the
// load-bearing assertions here compare the new contract against the EXISTING
// production paths rather than against a copy of themselves —
// `computeReplayDrift` (#936) for the file-level drift block,
// `parseFindingMessage` + schemas/review-artifact.schema.json (#1682) for the
// two traceability edges that already ship, docs/review/rationale-traceability.md
// (#1783) for the finding taxonomy namespace and the deterministic/agentic
// split, and schemas/flow.schema.json (#2013) for the step names. A test that
// restated the new schema's own enums would stay green no matter what drifted.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSchemaFile } from './helpers/schema-validator.mjs';
import { computeReplayDrift } from '../src/lib/review-plan.mjs';
import { parseFindingMessage, REF_LABEL_NAMES } from '../src/lib/finding-factory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FIXTURES = resolve(HERE, 'fixtures', 'cross-artifact');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readRepo = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const SCHEMA_FILE = 'cross-artifact-consistency.schema.json';
const schema = readJson(resolve(REPO_ROOT, 'schemas', SCHEMA_FILE));
const validate = compileSchemaFile(SCHEMA_FILE, { ajvOptions: { allErrors: true } });

const VALID_FIXTURES = ['complete.json', 'degraded-unknown-inputs.json', 'replan-drift.json'];
const INVALID_FIXTURES = [
  'invalid-unknown-reported-as-missing.json',
  'invalid-added-section-as-drift.json',
];

// The nine v1 traceability edges, transcribed from Issue #2018 "v1 Traceability".
// Expected values live in the test (never imported from the schema under test),
// so a silent edit to the schema's enum fails here.
const ISSUE_V1_EDGES = [
  'requirement->task',
  'requirement->test',
  'design->task',
  'plan->task',
  'task->diff',
  'task->test',
  'acceptance-criterion->test',
  'finding->criterion',
  'finding->artifact',
];

// The two edges #1682 already produces end to end (producer -> schema -> renderer).
const IMPLEMENTED_EDGES = ['finding->criterion', 'finding->artifact'];

// The eight re-plan meaning axes, transcribed from Issue #2018 "Re-plan Semantic Drift".
const ISSUE_DRIFT_AXES = [
  'goal',
  'requirement',
  'scope',
  'architecture',
  'technical-approach',
  'risk',
  'test-strategy',
  'done-condition',
];

// Codes this lens adds. Every other code in the enum must already exist in #1783.
const NEW_CODES = [
  'TRACE_MISSING_COVERAGE',
  'TRACE_ORPHAN',
  'TRACE_UNKNOWN_ID',
  'TRACE_STALE_REF',
  'TRACE_UNSUPPORTED_CLAIM',
  'SEMANTIC_DRIFT',
];

/** Finding-id codes declared by the #1783 taxonomy table, read from the doc itself. */
function readRationaleTaxonomyCodes() {
  const doc = readRepo('docs/review/rationale-traceability.md');
  const section = doc.split('## 2. Finding Taxonomy')[1];
  assert.ok(section, '#1783 の Finding Taxonomy 節が見つからない（doc 構造が変わった）');
  const table = section.split('\n##')[0];
  const codes = new Set();
  for (const m of table.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/gm)) codes.add(m[1]);
  return codes;
}

describe('cross-artifact consistency schema — fixtures', () => {
  for (const name of VALID_FIXTURES) {
    it(`accepts ${name}`, () => {
      const ok = validate(readJson(resolve(FIXTURES, name)));
      assert.ok(ok, JSON.stringify(validate.errors, null, 2));
    });
  }

  // False-positive guard fixtures (#2018 AC). Both encode the two misreadings
  // that make this lens harmful: reporting an absent input as a missing link,
  // and reporting a section the baseline never had as a meaning change.
  for (const name of INVALID_FIXTURES) {
    it(`rejects ${name}`, () => {
      assert.equal(validate(readJson(resolve(FIXTURES, name))), false);
    });
  }

  it('rejects a missing edge that carries no finding code', () => {
    const doc = readJson(resolve(FIXTURES, 'complete.json'));
    const edge = doc.edges.find((e) => e.status === 'missing');
    delete edge.findingCode;
    assert.equal(validate(doc), false);
  });

  it('rejects a satisfied edge that still carries a finding code', () => {
    const doc = readJson(resolve(FIXTURES, 'complete.json'));
    const edge = doc.edges.find((e) => e.status === 'satisfied');
    edge.findingCode = 'TRACE_MISSING_COVERAGE';
    assert.equal(validate(doc), false);
  });

  it('rejects a drift axis marked changed by a deterministic judgment', () => {
    const doc = readJson(resolve(FIXTURES, 'replan-drift.json'));
    const axis = doc.semanticDrift.axes.find((a) => a.status === 'changed');
    axis.judgment = 'deterministic';
    assert.equal(validate(doc), false);
  });
});

describe('cross-artifact consistency schema — v1 traceability edges', () => {
  it('declares exactly the nine edges of #2018 and no others', () => {
    assert.deepEqual([...schema.$defs.edgeKind.enum].sort(), [...ISSUE_V1_EDGES].sort());
  });

  it('does not mint a graph node namespace beyond the edge vocabulary', () => {
    // Graph DB non-goal: the contract has edges and statuses only. A $defs
    // entry describing persisted nodes would be the first step toward one.
    assert.deepEqual(
      Object.keys(schema.$defs).sort(),
      ['driftAxis', 'edgeKind', 'edgeStatus', 'findingCode', 'judgment'].sort()
    );
  });

  it('backs the two already-implemented edges with the real #1682 producer', () => {
    // Cross-check against the production path, not against this schema: if the
    // finding parser stopped emitting these refs, the edges would be a claim
    // with no producer.
    assert.deepEqual([...REF_LABEL_NAMES], ['CriterionRefs', 'ArtifactRefs']);
    const parsed = parseFindingMessage(
      ['Finding: example', 'CriterionRefs: AC-4, AC-5', 'ArtifactRefs: docs/plan.md'].join('\n')
    );
    assert.deepEqual(parsed.criterionRefs, ['AC-4', 'AC-5']);
    assert.deepEqual(parsed.artifactRefs, ['docs/plan.md']);

    const artifactSchema = readJson(resolve(REPO_ROOT, 'schemas', 'review-artifact.schema.json'));
    // findings[] is a $ref into $defs/finding, so resolve the ref rather than
    // assuming the properties are inlined.
    assert.equal(artifactSchema.properties.findings.items.$ref, '#/$defs/finding');
    const findingProps = artifactSchema.$defs.finding.properties;
    assert.ok(findingProps.criterionRefs, 'review-artifact schema に criterionRefs が無い');
    assert.ok(findingProps.artifactRefs, 'review-artifact schema に artifactRefs が無い');

    for (const edge of IMPLEMENTED_EDGES) {
      assert.ok(
        schema.$defs.edgeKind.description.includes(edge),
        `${edge} が実装済みである旨を edgeKind の description が説明していない`
      );
    }
  });
});

describe('cross-artifact consistency schema — #936 drift reuse', () => {
  it('mirrors the real computeReplayDrift output shape rather than re-deriving it', () => {
    const membershipValidator = compileSchemaFile(SCHEMA_FILE, {
      ajvOptions: { allErrors: true },
    });
    const drift = computeReplayDrift(['src/a.mjs', 'src/added.mjs'], {
      fileTypes: { mjs: ['src/a.mjs'] },
    });
    assert.ok(drift, 'computeReplayDrift が null を返した（前提が変わった）');
    const doc = readJson(resolve(FIXTURES, 'replan-drift.json'));
    doc.semanticDrift.fileMembership = drift;
    const ok = membershipValidator(doc);
    assert.ok(ok, JSON.stringify(membershipValidator.errors, null, 2));
  });

  it('keeps filesModified out of the contract, as #936 does', () => {
    const props = schema.properties.semanticDrift.properties.fileMembership.properties;
    assert.deepEqual(Object.keys(props).sort(), ['filesAdded', 'filesRemoved', 'summary']);
    const drift = computeReplayDrift(['src/a.mjs'], { fileTypes: { mjs: ['src/a.mjs'] } });
    assert.ok(!('filesModified' in drift));
  });

  it('allows the null that computeReplayDrift returns for a pre-snapshot plan', () => {
    assert.equal(computeReplayDrift(['src/a.mjs'], {}), null);
    const doc = readJson(resolve(FIXTURES, 'replan-drift.json'));
    doc.semanticDrift.fileMembership = null;
    const ok = validate(doc);
    assert.ok(ok, JSON.stringify(validate.errors, null, 2));
  });

  it('declares exactly the eight meaning axes of #2018', () => {
    assert.deepEqual([...schema.$defs.driftAxis.enum].sort(), [...ISSUE_DRIFT_AXES].sort());
  });
});

describe('cross-artifact consistency schema — #1783 taxonomy integration', () => {
  const existingCodes = readRationaleTaxonomyCodes();

  it('reads a non-empty taxonomy table from the #1783 doc', () => {
    assert.equal(existingCodes.size, 13);
  });

  it('adds no code that duplicates an existing finding-id', () => {
    for (const code of NEW_CODES) {
      assert.ok(!existingCodes.has(code), `${code} は #1783 に既にある（並立させない）`);
    }
  });

  it('reuses existing codes for the overlapping #2018 candidates', () => {
    const enumCodes = new Set(schema.$defs.findingCode.enum);
    const reused = [...enumCodes].filter((c) => !NEW_CODES.includes(c));
    assert.ok(reused.length > 0, '既存 taxonomy を 1 つも再利用していない');
    for (const code of reused) {
      assert.ok(existingCodes.has(code), `${code} は #1783 の 13 コードに存在しない`);
    }
    // The four candidates the issue lists that already have a home.
    for (const code of [
      'RATIONALE_CONTRADICTED',
      'WHY_NOT_STALE',
      'WHY_MISSING',
      'WHY_DIFF_MISMATCH',
    ]) {
      assert.ok(enumCodes.has(code), `${code} を再利用先として宣言していない`);
    }
  });

  it('introduces no new severity vocabulary', () => {
    const severities = schema.properties.findings.items.properties.severity.enum;
    assert.deepEqual([...severities], ['blocker', 'warning', 'nit']);
  });
});

describe('cross-artifact consistency schema — judgment placement is referenced, not redefined', () => {
  it('points the deterministic/agentic split at the #1783 definition', () => {
    assert.match(schema.$defs.judgment.description, /rationale-traceability\.md section 7/);
    const doc = readRepo('docs/review/rationale-traceability.md');
    assert.match(doc, /^## 7\. 決定論チェックと意味的レビューの分界$/m);
  });

  it('does not restate the split as its own enum of check names', () => {
    // Only the two-value outcome vocabulary is allowed here; a per-check
    // ledger would be a second SSoT for the boundary.
    assert.deepEqual([...schema.$defs.judgment.enum], ['deterministic', 'agentic']);
  });
});

describe('cross-artifact consistency schema — Flow wiring', () => {
  const flowSchema = readJson(resolve(REPO_ROOT, 'schemas', 'flow.schema.json'));
  const primitives = new Set(flowSchema.$defs.stepPrimitive.enum);

  it('names only step primitives that already exist in the Flow contract', () => {
    for (const step of schema.properties.degradations.items.properties.step.enum) {
      assert.ok(primitives.has(step), `${step} は flow.schema.json の step 語彙に無い`);
    }
  });

  it('reuses the Flow onMissing/onUnsatisfied effect vocabulary', () => {
    const effects = schema.properties.degradations.items.properties.effect.enum;
    assert.deepEqual([...effects].sort(), ['degrade', 'skip', 'stop']);
  });

  it('is reachable from the re-plan Flow that consumes it', () => {
    const replan = readJson(resolve(REPO_ROOT, 'flows', 'replan-review.flow.json'));
    const uses = replan.steps.map((s) => s.use);
    assert.ok(uses.includes('cross-artifact-review'));
    assert.ok(uses.includes('detect-semantic-drift'));
  });

  // `unknown` is defined as "the artifacts this edge needs never reached the
  // review". The schema already forces `inputsPresent: false` => `unknown`;
  // without the reverse a report could claim it HAD the inputs and still refuse
  // to evaluate the edge, which reads as "we looked and found nothing" while
  // nothing was looked at. That is the false claim this contract exists to stop.
  it('rejects an unknown edge that claims its inputs were present', () => {
    const doc = readJson(resolve(FIXTURES, 'complete.json'));
    doc.edges[0].status = 'unknown';
    doc.edges[0].inputsPresent = true;
    delete doc.edges[0].findingCode;
    assert.equal(validate(doc), false, 'status=unknown with inputsPresent=true must not validate');
  });

  it('still accepts an unknown edge whose inputs were absent', () => {
    const doc = readJson(resolve(FIXTURES, 'complete.json'));
    doc.edges[0].status = 'unknown';
    doc.edges[0].inputsPresent = false;
    delete doc.edges[0].findingCode;
    assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
  });
});
