// Contract tests for the four core review Flow definitions (#2016, Epic #2011).
//
// Scope note: #2016 stops at definition + wiring + observe. There is no Flow
// execution engine yet, so these tests validate the shipped assets in `flows/`
// against the schemas that #2013 and this issue own, and pin the cross-document
// constraints JSON Schema cannot express:
//
//   - every Flow's `intent.purpose` resolves to exactly one Review Intent
//   - the Review Intent's evidence list and the Flow's `inputs[]` agree, so the
//     "missing artifact stops / degrades / skips" declaration cannot drift
//   - the entry map resolves to a Flow id AND version that exists
//   - the Review Intent artifact vocabulary is a subset of the Agent Contract
//     `inputKind` vocabulary (#2014), not a parallel ledger
//   - the SKILL.md entry table stays in sync with the entry map it declares SSoT
//   - observe mode, lifted by one module (#2054 PR-3): `src/lib/flow-loader.mjs`
//     is the ONLY runtime module that loads `flows/`, so adding these documents
//     still cannot change an existing gate or decision. The scan behind that claim
//     lives in tests/helpers/flows-reference-scan.mjs and is itself pinned here
//     against both a false positive (a comment) and false negatives (a `flows`
//     path segment, a template literal).
//
// The Ajv setup is NOT re-implemented here: the compiled validators come from
// tests/helpers/schema-validator.mjs, the same factory the #2013/#2014 suites use.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { describe } from 'node:test';

import { GATE_REASON_CODES } from '../src/lib/gate-decision.mjs';
import { referencesFlowsDirectory } from './helpers/flows-reference-scan.mjs';
import {
  compileFlowValidator,
  compileFlowEntryMapValidator,
  compileReviewIntentValidator,
} from './helpers/schema-validator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FLOWS_DIR = resolve(REPO_ROOT, 'flows');
const INTENTS_DIR = resolve(FLOWS_DIR, 'intents');
const SCHEMAS_DIR = resolve(REPO_ROOT, 'schemas');
const SKILL_MD = resolve(REPO_ROOT, 'skills/agent-skills/river-review/SKILL.md');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const flowFiles = readdirSync(FLOWS_DIR)
  .filter((name) => name.endsWith('.flow.json'))
  .sort();
const intentFiles = readdirSync(INTENTS_DIR)
  .filter((name) => name.endsWith('.intent.json'))
  .sort();

const flows = flowFiles.map((name) => ({ name, doc: readJson(join(FLOWS_DIR, name)) }));
const intents = intentFiles.map((name) => ({ name, doc: readJson(join(INTENTS_DIR, name)) }));
const entryMap = readJson(join(FLOWS_DIR, 'entry-map.json'));

const intentByPurpose = new Map(intents.map(({ doc }) => [doc.purpose, doc]));
const flowById = new Map(flows.map(({ doc }) => [doc.id, doc]));

const validateFlow = compileFlowValidator();
const validateIntent = compileReviewIntentValidator();
const validateEntryMap = compileFlowEntryMapValidator();

const errorsOf = (validate) => JSON.stringify(validate.errors, null, 2);

/** The four Flows #2016 defines. Written out so a silently dropped file fails. */
const CORE_FLOW_IDS = ['final-review', 'plan-review', 'replan-review', 'task-completion-review'];

/**
 * The four upstream Flows #2017 defines.
 *
 * They carry a Review Intent document like the core four. The `stage` enum in
 * schemas/review-intent.schema.json was extended additively (existing values
 * untouched, so every Intent valid against the previous enum stays valid), which
 * is why the Intent-backed assertions below cover all eight Flows. The extra
 * `inputs[]` + `steps[]` assertions in the "#2017" suite are kept on top of that
 * rather than replaced: they pin the evidence discipline the Intent cannot state.
 */
const UPSTREAM_FLOW_IDS = [
  'design-review',
  'requirements-review',
  'research-review',
  'technical-review',
];

const EXPECTED_FLOW_IDS = [...CORE_FLOW_IDS, ...UPSTREAM_FLOW_IDS].sort();

/** Flows that must be joined to a Review Intent document: every shipped Flow. */
const intentBackedFlows = flows;
const upstreamFlows = flows.filter(({ doc }) => UPSTREAM_FLOW_IDS.includes(doc.id));

describe('core review Flow definitions (#2016)', () => {
  test('the expected Flows ship, one file per Flow', () => {
    assert.deepEqual([...flowById.keys()].sort(), EXPECTED_FLOW_IDS);
    assert.equal(flows.length, EXPECTED_FLOW_IDS.length);
    for (const { name, doc } of flows) {
      assert.equal(name, `${doc.id}.flow.json`, `${name}: filename must match the Flow id`);
    }
  });

  test('every Flow validates against schemas/flow.schema.json', () => {
    for (const { name, doc } of flows) {
      assert.equal(validateFlow(doc), true, `${name}: ${errorsOf(validateFlow)}`);
    }
  });

  test('every Review Intent validates against schemas/review-intent.schema.json', () => {
    for (const { name, doc } of intents) {
      assert.equal(validateIntent(doc), true, `${name}: ${errorsOf(validateIntent)}`);
      assert.equal(name, `${doc.purpose}.intent.json`, `${name}: filename must match the purpose`);
    }
  });

  test('every purpose is unique across all Flows', () => {
    const flowPurposes = flows.map(({ doc }) => doc.intent.purpose);
    assert.equal(new Set(flowPurposes).size, flowPurposes.length, 'purposes must be unique');
  });

  test('every intent-backed Flow purpose resolves to one Review Intent, and vice versa', () => {
    const flowPurposes = intentBackedFlows.map(({ doc }) => doc.intent.purpose).sort();
    assert.deepEqual(flowPurposes, [...intentByPurpose.keys()].sort());
  });

  test('every upstream Flow is Intent-backed too', () => {
    // The upstream four shipped without an Intent while the `stage` enum was
    // closed to the four core stages. The enum was extended additively, so this
    // is the assertion that stops the gap from reopening.
    for (const { name, doc } of upstreamFlows) {
      assert.ok(
        intentByPurpose.has(doc.intent.purpose),
        `${name}: no Review Intent for purpose "${doc.intent.purpose}"`
      );
    }
  });

  test('each Review Intent declares a distinct stage', () => {
    const stages = intents.map(({ doc }) => doc.stage).sort();
    assert.deepEqual(stages, [
      'design',
      'final',
      'plan',
      'replan',
      'requirements',
      'research',
      'task-completion',
      'technical',
    ]);
  });

  test('every upstream Review Intent sits in the upstream skill-selection phase', () => {
    // `stage` and `phase` are different axes: four distinct stages share one
    // phase value, which is why neither can be derived from the other.
    const upstreamPurposes = new Set(upstreamFlows.map(({ doc }) => doc.intent.purpose));
    const phases = new Set(
      intents.filter(({ doc }) => upstreamPurposes.has(doc.purpose)).map(({ doc }) => doc.phase)
    );
    assert.deepEqual([...phases], ['upstream']);
    assert.equal(upstreamPurposes.size, 4);
  });

  // The #2016 acceptance criterion "missing artifact は degrade/stop が明示される"
  // lives in two documents (the Intent declares the requirement, the Flow declares
  // the step outcome). These assertions are what stop them from drifting apart.
  test('Flow inputs and Review Intent evidence name the same artifacts', () => {
    for (const { name, doc } of intentBackedFlows) {
      const intent = intentByPurpose.get(doc.intent.purpose);
      const inputNames = (doc.inputs ?? []).map((input) => input.name).sort();
      const evidenceArtifacts = intent.evidence.map((entry) => entry.artifact).sort();
      assert.deepEqual(inputNames, evidenceArtifacts, `${name}: inputs vs evidence`);
    }
  });

  test('required evidence is a required Flow input, and optional evidence is not', () => {
    for (const { name, doc } of intentBackedFlows) {
      const intent = intentByPurpose.get(doc.intent.purpose);
      const inputByName = new Map((doc.inputs ?? []).map((input) => [input.name, input]));
      for (const entry of intent.evidence) {
        const input = inputByName.get(entry.artifact);
        const required = input.required === true;
        assert.equal(
          required,
          entry.requirement === 'required',
          `${name}: input "${entry.artifact}" required=${required} vs evidence ${entry.requirement}`
        );
      }
    }
  });

  test('required evidence always stops: no required artifact degrades or skips', () => {
    for (const { name, doc } of intents) {
      for (const entry of doc.evidence) {
        if (entry.requirement !== 'required') continue;
        assert.equal(entry.onMissing, 'stop', `${name}: required "${entry.artifact}"`);
      }
    }
  });

  test('a Flow that can stop on a missing artifact declares the stop condition', () => {
    for (const { name, doc } of intentBackedFlows) {
      const intent = intentByPurpose.get(doc.intent.purpose);
      const canStop = intent.evidence.some((entry) => entry.onMissing === 'stop');
      if (!canStop) continue;
      assert.ok(
        (doc.stopConditions ?? []).includes('DETERMINISTIC_UNRUNNABLE'),
        `${name}: declares a stop-on-missing artifact but no DETERMINISTIC_UNRUNNABLE stop condition`
      );
    }
  });

  test('every declared onMissing outcome is realized by a step outcome', () => {
    for (const { name, doc } of intentBackedFlows) {
      const intent = intentByPurpose.get(doc.intent.purpose);
      // `stop` is the schema default for a step with no onUnsatisfied, so only
      // the two opt-in outcomes need a step that spells them out.
      const stepOutcomes = new Set(
        doc.steps.map((step) => step.onUnsatisfied).filter((value) => value !== undefined)
      );
      for (const outcome of new Set(intent.evidence.map((entry) => entry.onMissing))) {
        if (outcome === 'stop') continue;
        assert.ok(
          stepOutcomes.has(outcome),
          `${name}: evidence declares onMissing "${outcome}" but no step declares it`
        );
      }
    }
  });

  test('every when.input is a declared, optional input', () => {
    for (const { name, doc } of flows) {
      const inputByName = new Map((doc.inputs ?? []).map((input) => [input.name, input]));
      for (const step of doc.steps) {
        if (!step.when) continue;
        const input = inputByName.get(step.when.input);
        assert.ok(input, `${name}: when.input "${step.when.input}" is not declared`);
        assert.notEqual(
          input.required,
          true,
          `${name}: conditioning on required input "${input.name}" is meaningless`
        );
      }
    }
  });

  test('a step conditioned on a present input skips rather than stops when absent', () => {
    for (const { name, doc } of flows) {
      for (const step of doc.steps) {
        if (step.when?.state !== 'present') continue;
        assert.equal(
          step.onUnsatisfied,
          'skip',
          `${name}: step gated on "${step.when.input}" must declare onUnsatisfied: skip`
        );
      }
    }
  });

  test('stop conditions reuse GATE_REASON_CODES, never a parallel vocabulary', () => {
    for (const { name, doc } of flows) {
      for (const code of doc.stopConditions ?? []) {
        assert.ok(GATE_REASON_CODES.includes(code), `${name}: unknown stop condition ${code}`);
      }
    }
  });

  test('Review Intent phase reuses the skill phase vocabulary', () => {
    const skillSchema = readJson(join(SCHEMAS_DIR, 'skill.schema.json'));
    const intentSchema = readJson(join(SCHEMAS_DIR, 'review-intent.schema.json'));
    assert.deepEqual(intentSchema.properties.phase.enum, skillSchema.$defs.phase.enum);
  });

  test('Review Intent artifact kinds are a subset of Agent Contract inputKind', () => {
    // #2014 owns the artifact-kind ledger. A Review Intent may narrow it; it may
    // not mint a kind no Agent can declare as an input.
    const agentSchema = readJson(join(SCHEMAS_DIR, 'agent-contract.schema.json'));
    const intentSchema = readJson(join(SCHEMAS_DIR, 'review-intent.schema.json'));
    const inputKinds = new Set(agentSchema.$defs.inputKind.enum);
    for (const kind of intentSchema.$defs.artifactKind.enum) {
      assert.ok(inputKinds.has(kind), `artifactKind "${kind}" is not an Agent Contract inputKind`);
    }
  });

  // Flow -> Agent -> Skill. The last hop is NOT re-declared anywhere in flows/:
  // each Agent Contract already carries its allowed skill ids (#2014), so the
  // Flows reach existing skills through the Agent axis instead of a new map.
  // This test pins the first hop, which is the only one #2016 adds.
  test('every judgment step primitive is owned by exactly one Agent Contract', () => {
    const STEP_TO_RESPONSIBILITY = {
      'resolve-intent': 'resolve-intent',
      'select-skills': 'plan-execution',
      'select-agents': 'select-agents',
      'parallel-review': 'generate-candidate-findings',
      'cross-artifact-review': 'judge-cross-artifact-consistency',
      'verify-findings': 'verify-findings',
      'evaluate-completion': 'evaluate-completion',
    };
    const contractsDir = resolve(REPO_ROOT, 'agents', 'contracts');
    const contracts = readdirSync(contractsDir)
      .filter((name) => name.endsWith('.agent.json'))
      .map((name) => readJson(join(contractsDir, name)));

    const usedPrimitives = new Set(
      flows.flatMap(({ doc }) => doc.steps.map((step) => step.use).filter(Boolean))
    );
    for (const primitive of usedPrimitives) {
      const responsibility = STEP_TO_RESPONSIBILITY[primitive];
      if (!responsibility) continue; // mechanical step (resolve-artifacts, derive-gate, ...)
      const owners = contracts.filter((contract) =>
        contract.responsibilities.includes(responsibility)
      );
      assert.equal(
        owners.length,
        1,
        `${primitive} -> ${responsibility}: ${owners.length} Agent Contracts claim it`
      );
    }
  });

  test('a reviewer lens step is owned by the per-role Agent, not by a new Agent', () => {
    const contractsDir = resolve(REPO_ROOT, 'agents', 'contracts');
    const specialist = readJson(join(contractsDir, 'specialist-reviewer.agent.json'));
    assert.equal(specialist.instantiatedPer, 'reviewer-role');
    assert.ok(specialist.skills.length > 0, 'the lens skills are declared on the Agent Contract');
    const lensSteps = flows.flatMap(({ doc }) =>
      doc.steps.map((step) => step.reviewer).filter(Boolean)
    );
    assert.ok(lensSteps.length > 0, 'the Flows use reviewer lens steps');
  });

  test('no Flow document names a skill: selection stays in Review Judgment', () => {
    // ADR-009 D3: which skill is selected is Review Judgment and must not be
    // duplicated into a Flow, an Intent, or the entry map.
    for (const { name, doc } of [...flows, ...intents, { name: 'entry-map.json', doc: entryMap }]) {
      const text = JSON.stringify(doc);
      for (const forbidden of ['"skills"', '"skill"', '"applyTo"']) {
        assert.equal(text.includes(forbidden), false, `${name} carries ${forbidden}`);
      }
    }
  });
});

describe('flow entry map (#2016)', () => {
  test('validates against schemas/flow-entry-map.schema.json', () => {
    assert.equal(validateEntryMap(entryMap), true, errorsOf(validateEntryMap));
  });

  test('the user-facing entry names from #2016 and #2017 are present', () => {
    assert.deepEqual(Object.keys(entryMap.entries).sort(), [
      'review-design',
      'review-final',
      'review-plan',
      'review-replan',
      'review-requirements',
      'review-research',
      'review-task',
      'review-technical',
    ]);
  });

  test('every entry resolves to a shipped Flow id at the version it pins', () => {
    for (const [entryName, entry] of Object.entries(entryMap.entries)) {
      const flow = flowById.get(entry.flow);
      assert.ok(flow, `${entryName}: no Flow with id "${entry.flow}"`);
      assert.equal(
        entry.flowVersion,
        flow.version,
        `${entryName}: pinned ${entry.flowVersion} but the Flow is ${flow.version}`
      );
    }
  });

  test('every Flow is reachable from exactly one entry name', () => {
    const targets = Object.values(entryMap.entries)
      .map((entry) => entry.flow)
      .sort();
    assert.deepEqual(targets, EXPECTED_FLOW_IDS);
  });

  test('the entry map carries no runtime discriminator', () => {
    // AC "Claude / Codex で同一 Flow ID が使われる": the map cannot branch on a
    // runtime, so there is nothing for the two hosts to disagree about.
    //
    // Scope: key names, entry names and the resolved `flow` / `flowVersion`
    // values — i.e. everything a resolver reads. Prose in `description` is NOT
    // checked: a sentence such as "runtime に依存しない" carries no branch, and
    // forbidding the word there would fail on documentation alone.
    const offenders = [];
    const check = (label, value) => {
      for (const forbidden of ['claude', 'codex', 'runtime', 'model']) {
        if (String(value).toLowerCase().includes(forbidden)) {
          offenders.push(`${label} = ${value} (contains "${forbidden}")`);
        }
      }
    };
    for (const key of Object.keys(entryMap)) check('top-level key', key);
    for (const [entryName, entry] of Object.entries(entryMap.entries)) {
      check('entry name', entryName);
      for (const key of Object.keys(entry)) check(`entries.${entryName} key`, key);
      check(`entries.${entryName}.flow`, entry.flow);
      check(`entries.${entryName}.flowVersion`, entry.flowVersion);
    }
    assert.deepEqual(offenders, []);
  });

  test('the SKILL.md entry table matches entry-map.json (SSoT sync)', () => {
    // skills/agent-skills/river-review/SKILL.md declares entry-map.json as the
    // SSoT and carries a copy of the table. Without this assertion the copy
    // silently goes stale whenever the map changes.
    const skillText = readFileSync(SKILL_MD, 'utf8');
    const section = skillText.split(/^## /m).find((part) => part.startsWith('Flow Entry'));
    assert.ok(section, 'SKILL.md has no "## Flow Entry" section');

    const table = {};
    for (const line of section.split('\n')) {
      const row = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line);
      if (row) table[row[1]] = row[2];
    }

    const expected = Object.fromEntries(
      Object.entries(entryMap.entries).map(([name, entry]) => [name, entry.flow])
    );
    assert.deepEqual(table, expected);
  });
});

// #2017 Phase 6. The upstream Flows are Intent-backed like the core four (the
// `stage` enum was extended additively), so the assertions here are the ones a
// Review Intent cannot state: the evidence discipline that keeps an
// unverifiable claim from reaching `derive-gate` as a verdict, re-derived from
// `inputs[]` + `steps[]`.
describe('upstream review Flow definitions (#2017)', () => {
  const FLOW_FIXTURES_DIR = resolve(REPO_ROOT, 'tests', 'fixtures', 'flow');

  /**
   * The #2017 evidence discipline, as a predicate over a Flow document.
   *
   * Two of the four upstream Flows judge things the issue forbids asserting as
   * facts: research freshness / source availability (there is no built-in web
   * search — a Non-goal of #2017) and technical viability (which is "Evidence
   * required"). The discipline is that neither may reach `derive-gate` without
   * passing `verify-findings` first, and that a question the supplied artifacts
   * cannot settle leaves through `human-escalation` as an open question rather
   * than as a verdict — which is only meaningful if the Flow can actually stop
   * on it, hence the two stop conditions.
   *
   * @param {object} doc a Flow document
   * @returns {string[]} the reasons the document fails the discipline, empty when it holds
   */
  const evidenceDisciplineViolations = (doc) => {
    const reasons = [];
    const indexOf = (primitive) => doc.steps.findIndex((step) => step.use === primitive);
    const gate = indexOf('derive-gate');
    if (gate === -1) reasons.push('no derive-gate step');
    for (const primitive of ['verify-findings', 'human-escalation']) {
      const at = indexOf(primitive);
      if (at === -1) reasons.push(`no ${primitive} step`);
      else if (gate !== -1 && at > gate) reasons.push(`${primitive} runs after derive-gate`);
    }
    for (const code of ['HUMAN_APPROVAL_REQUIRED', 'UNDETERMINED']) {
      if (!(doc.stopConditions ?? []).includes(code)) reasons.push(`no ${code} stop condition`);
    }
    return reasons;
  };

  test('the four upstream Flows ship, one file per Flow', () => {
    assert.deepEqual(
      upstreamFlows.map(({ doc }) => doc.id).sort(),
      UPSTREAM_FLOW_IDS,
      'a silently dropped or renamed upstream Flow file must fail here'
    );
  });

  test('every upstream Flow declares exactly one required input', () => {
    // The subject of the judgment. Without it the question has nothing to be
    // about, which is why the absence is a stop rather than a degrade.
    for (const { name, doc } of upstreamFlows) {
      const required = (doc.inputs ?? []).filter((input) => input.required === true);
      assert.equal(required.length, 1, `${name}: required inputs = ${required.length}`);
    }
  });

  test('an upstream Flow with a required input declares DETERMINISTIC_UNRUNNABLE', () => {
    for (const { name, doc } of upstreamFlows) {
      assert.ok(
        (doc.stopConditions ?? []).includes('DETERMINISTIC_UNRUNNABLE'),
        `${name}: a missing required input must be able to stop the run`
      );
    }
  });

  test('every optional input is either gated by a skip step or covered by a degrade step', () => {
    // The #2016 acceptance criterion "missing artifact は degrade/stop が明示される",
    // stated on the Flow document alone: an optional input may not be silently
    // ignored, so it either gates a `skip` step or the Flow declares a `degrade`.
    for (const { name, doc } of upstreamFlows) {
      const gatedInputs = new Set(
        doc.steps.filter((step) => step.when?.state === 'present').map((step) => step.when.input)
      );
      const hasDegrade = doc.steps.some((step) => step.onUnsatisfied === 'degrade');
      for (const input of doc.inputs ?? []) {
        if (input.required === true) continue;
        assert.ok(
          gatedInputs.has(input.name) || hasDegrade,
          `${name}: optional input "${input.name}" has neither a skip gate nor a degrade step`
        );
      }
    }
  });

  test('every upstream Flow verifies findings before deriving a gate', () => {
    for (const { name, doc } of upstreamFlows) {
      const verify = doc.steps.findIndex((step) => step.use === 'verify-findings');
      const gate = doc.steps.findIndex((step) => step.use === 'derive-gate');
      assert.ok(verify !== -1, `${name}: no verify-findings step`);
      assert.ok(gate !== -1 && verify < gate, `${name}: verify-findings must precede derive-gate`);
    }
  });

  test('research-review and technical-review hold the #2017 evidence discipline', () => {
    for (const id of ['research-review', 'technical-review']) {
      assert.deepEqual(evidenceDisciplineViolations(flowById.get(id)), [], id);
    }
  });

  test('positive fixture: a research Flow that routes freshness through evidence', () => {
    const fixture = readJson(join(FLOW_FIXTURES_DIR, 'research-review-evidence-happy.json'));
    assert.equal(validateFlow(fixture), true, errorsOf(validateFlow));
    assert.deepEqual(evidenceDisciplineViolations(fixture), []);
  });

  test('negative fixture: a research Flow that asserts freshness straight to the gate', () => {
    // Schema-valid on purpose: the schema cannot see that an unverifiable
    // freshness claim reaches `derive-gate` unfiltered. A pass here would mean
    // the #2017 acceptance criterion stopped being enforced by anything.
    const fixture = readJson(join(FLOW_FIXTURES_DIR, 'research-review-asserts-freshness.json'));
    assert.equal(validateFlow(fixture), true, errorsOf(validateFlow));
    assert.deepEqual(evidenceDisciplineViolations(fixture), [
      'no verify-findings step',
      'no human-escalation step',
      'no UNDETERMINED stop condition',
    ]);
  });

  test('no upstream Flow bundles judgment into a single all-in-one step', () => {
    // Non-goal of #2017: an all-in-one upstream mega-judgment. A Flow that
    // reached the gate with no cross-artifact or reviewer step would be exactly
    // that, hiding the whole judgment inside one selection.
    for (const { name, doc } of upstreamFlows) {
      const judgmentSteps = doc.steps.filter(
        (step) =>
          step.reviewer !== undefined ||
          step.use === 'cross-artifact-review' ||
          step.use === 'parallel-review'
      );
      assert.ok(judgmentSteps.length >= 2, `${name}: only ${judgmentSteps.length} judgment steps`);
    }
  });
});

describe('observe mode (#2016)', () => {
  // The scan is pinned in both directions before it is used, because the first
  // version of this check was a raw-text regexp that reported a JSDoc comment
  // as an offender and missed `join(ROOT, 'flows', ...)` entirely.
  const SCAN_CASES = [
    [
      'a JSDoc comment that merely writes `flows/`',
      '/**\n * - flow → no `flows/` directory\n */\n',
      false,
    ],
    [
      'a line comment that writes flows/',
      '// reads flows/entry-map.json one day\nconst a = 1;\n',
      false,
    ],
    ['a static import', "import map from '../flows/entry-map.json' with { type: 'json' };\n", true],
    ['a bare relative path', "readFileSync('flows/entry-map.json', 'utf8');\n", true],
    [
      'join() with flows as its own segment',
      "readFileSync(join(ROOT, 'flows', 'entry-map.json'));\n",
      true,
    ],
    ['resolve() with a bare flows segment', "const dir = resolve(REPO_ROOT, 'flows');\n", true],
    ['a template literal built from a variable', 'readFileSync(`${dir}/entry-map.json`);\n', true],
    ['a flow document filename', "readFileSync(join(dir, 'plan-review.flow.json'));\n", true],
    [
      'an unrelated skills/ path',
      "const dir = path.join(REPO_ROOT, 'skills');\nreadFileSync('skills/x.md');\n",
      false,
    ],
    ['a regexp literal containing quotes', 'const re = /[\'"`]flows\\//;\nconst x = 1;\n', false],
  ];

  for (const [label, source, expected] of SCAN_CASES) {
    test(`referencesFlowsDirectory: ${label} → ${expected}`, () => {
      assert.equal(referencesFlowsDirectory(source), expected);
    });
  }

  test('src/lib/flow-loader.mjs is the only runtime module that loads flows/', () => {
    // #2016 pinned observe mode as "no runtime module reads flows/". #2054 PR-3
    // lifted it by exactly one module: src/lib/flow-loader.mjs is the single
    // reader, and every other module that needs a Flow, an entry or an Intent
    // goes through it. The scan therefore keeps rejecting a second reader
    // (anything else under src/ or runners/ that names a flows/ path or a
    // flow asset filename fails here), which is what still makes "the Flow
    // documents cannot alter an existing gate, decision or finding" provable:
    // only the loader sees them, and the loader holds no judgment
    // (tests/flow-loader.test.mjs pins its contract).
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(mjs|js|cjs|ts)$/.test(entry.name)) continue;
        if (referencesFlowsDirectory(readFileSync(full, 'utf8'))) offenders.push(full);
      }
    };
    walk(resolve(REPO_ROOT, 'src'));
    walk(resolve(REPO_ROOT, 'runners'));
    const relativeOffenders = offenders.map((full) => relative(REPO_ROOT, full)).sort();
    assert.deepEqual(
      relativeOffenders,
      ['src/lib/flow-loader.mjs'],
      `modules referencing flows/: ${relativeOffenders.join(', ')}`
    );
  });

  // `uniqueItems` on `evidence` only rejects fully identical entries. Two
  // entries naming the same artifact with a different `onMissing` would pass
  // the schema and leave one artifact carrying contradictory outcomes
  // (`stop` and `skip` at once). draft 2020-12 cannot express uniqueness by a
  // single property, so the schema description delegates it here.
  test('each Intent names every evidence artifact at most once', () => {
    for (const file of readdirSync(INTENTS_DIR).filter((n) => n.endsWith('.intent.json'))) {
      const intent = readJson(join(INTENTS_DIR, file));
      const artifacts = (intent.evidence ?? []).map((entry) => entry.artifact);
      assert.deepEqual(
        [...new Set(artifacts)].sort(),
        [...artifacts].sort(),
        `${file}: evidence names an artifact more than once (${artifacts.join(', ')})`
      );
    }
  });
});

// #2054 PR-1 (Phase 1 of the Review Placement & Trigger Contract). The
// registry is a declaration only: it resolves a neutral engineering event to
// entry names already declared above it, and nothing under src/ or runners/
// reads it (the observe-mode test above stays the pin for that). What is
// asserted here is what JSON Schema cannot state on its own — that every
// resolved entry exists, that the evidence a trigger demands is the selected
// Flow's own required input set, that the SKILL.md copy of the trigger column
// stays in sync — plus the schema rejections the registry relies on, each
// exercised by mutating a clone rather than by trusting the schema text.
describe('trigger registry (#2054 PR-1)', () => {
  const TRIGGER_NAMES = [
    'after-change',
    'artifact-ready',
    'before-merge',
    'before-publish',
    'task-checkpoint',
  ];
  const triggers = entryMap.triggers;

  const validateClone = (mutate) => {
    const clone = structuredClone(entryMap);
    mutate(clone);
    return validateEntryMap(clone);
  };

  test('the entry map with triggers validates against schemas/flow-entry-map.schema.json', () => {
    assert.ok(validateEntryMap(entryMap), errorsOf(validateEntryMap));
  });

  test('exactly the five neutral trigger names ship', () => {
    assert.deepEqual(Object.keys(triggers).sort(), TRIGGER_NAMES);
  });

  test('every trigger resolves only to declared entry names', () => {
    const declared = Object.keys(entryMap.entries);
    for (const [name, trigger] of Object.entries(triggers)) {
      for (const entry of trigger.entries) {
        assert.ok(declared.includes(entry), `${name} resolves to undeclared entry ${entry}`);
      }
    }
  });

  test('the resolution table is the one #2054 declares', () => {
    const resolved = Object.fromEntries(
      Object.entries(triggers).map(([name, trigger]) => [name, [...trigger.entries].sort()])
    );
    assert.deepEqual(resolved, {
      'after-change': [],
      'artifact-ready': [
        'review-design',
        'review-plan',
        'review-replan',
        'review-requirements',
        'review-research',
        'review-technical',
      ],
      'before-merge': ['review-final'],
      'before-publish': ['review-final'],
      'task-checkpoint': ['review-task'],
    });
  });

  test('after-change starts no Flow: empty entries and the fast-verification profile', () => {
    assert.deepEqual(triggers['after-change'].entries, []);
    assert.equal(triggers['after-change'].profile, 'fast-verification');
    assert.equal(triggers['after-change'].requiredEvidence, undefined);
  });

  test('a multi-entry trigger declares a selector, a single-entry trigger does not', () => {
    for (const [name, trigger] of Object.entries(triggers)) {
      if (trigger.entries.length > 1) {
        assert.equal(
          trigger.selectBy,
          'artifactKind',
          `${name} lists several entries without selectBy`
        );
      } else {
        assert.equal(
          trigger.selectBy,
          undefined,
          `${name} carries selectBy with ${trigger.entries.length} entries`
        );
      }
    }
  });

  test('requiredEvidence is exactly the required input set of the selected Flow', () => {
    // The evidence a trigger demands is not a second vocabulary: it must equal
    // the `inputs[].required` set of the one Flow the entry resolves to.
    for (const [name, trigger] of Object.entries(triggers)) {
      if (!trigger.requiredEvidence) continue;
      assert.equal(trigger.entries.length, 1, `${name} fixes evidence without fixing the entry`);
      const flow = flowById.get(entryMap.entries[trigger.entries[0]].flow);
      const required = flow.inputs.filter((input) => input.required).map((input) => input.name);
      assert.deepEqual([...trigger.requiredEvidence].sort(), required.sort(), name);
    }
    assert.deepEqual(triggers['task-checkpoint'].requiredEvidence, ['tasks', 'diff']);
    assert.deepEqual(triggers['before-publish'].requiredEvidence, ['requirements', 'diff']);
  });

  test('before-merge demands an execution-isolated run; no other trigger sets a tier', () => {
    assert.equal(triggers['before-merge'].independence, 'execution-isolated');
    for (const name of TRIGGER_NAMES.filter((n) => n !== 'before-merge')) {
      assert.equal(triggers[name].independence, undefined, name);
    }
  });

  test('every trigger is in observe mode', () => {
    for (const name of TRIGGER_NAMES) assert.equal(triggers[name].mode, 'observe', name);
  });

  test('the trigger registry carries no runtime discriminator', () => {
    // Same scope as the entry-map test above: keys and resolver-read values,
    // not the prose in `description` (which the schema polices separately).
    const offenders = [];
    const check = (label, value) => {
      for (const forbidden of ['claude', 'codex', 'github', 'runtime', 'model']) {
        if (String(value).toLowerCase().includes(forbidden)) {
          offenders.push(`${label} = ${value} (contains "${forbidden}")`);
        }
      }
    };
    for (const [name, trigger] of Object.entries(triggers)) {
      check('trigger name', name);
      for (const [key, value] of Object.entries(trigger)) {
        check(`triggers.${name} key`, key);
        if (key === 'description') continue;
        for (const item of [].concat(value)) check(`triggers.${name}.${key}`, item);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('schema rejects a sixth trigger name', () => {
    assert.equal(
      validateClone((doc) => {
        doc.triggers['on-save'] = { entries: [], mode: 'observe' };
      }),
      false
    );
  });

  test('schema rejects a host discriminator key on a trigger', () => {
    assert.equal(
      validateClone((doc) => {
        doc.triggers['task-checkpoint'].host = 'claude';
      }),
      false
    );
    assert.equal(
      validateClone((doc) => {
        doc.triggers['after-change'].command = 'bash scripts/plugin-format-hook.sh';
      }),
      false
    );
  });

  test('schema rejects severity and gate vocabulary in trigger values', () => {
    const rejected = [
      (doc) => {
        doc.triggers['task-checkpoint'].mode = 'blocker';
      },
      (doc) => {
        doc.triggers['before-merge'].independence = 'critical';
      },
      (doc) => {
        doc.triggers['after-change'].profile = 'pass';
      },
      (doc) => {
        doc.triggers['task-checkpoint'].requiredEvidence = ['severity'];
      },
      (doc) => {
        doc.triggers['artifact-ready'].selectBy = 'severity';
      },
    ];
    for (const [index, mutate] of rejected.entries()) {
      assert.equal(validateClone(mutate), false, `mutation #${index} was accepted`);
    }
  });

  test('schema rejects host, hook, shell, severity and verdict words in trigger prose', () => {
    // Round-2 review (#2093): hyphen / underscore joins, ALL-CAPS spellings,
    // further hosts and inflected verdicts all slipped through the first
    // pattern, so each is pinned here as a literal.
    const words = [
      'Claude',
      'codex',
      'GitHub',
      'Claude-Code',
      'GitHub_Actions',
      'CLAUDE',
      'GITHUB',
      'CODEX',
      'Gemini',
      'Copilot',
      'PostToolUse',
      'git hook',
      'bash',
      'shells',
      'blocker',
      'critical',
      'major',
      'minor',
      'pass',
      'passing',
      'failed',
      'failure',
      'approve',
      'approves',
      'auto-merge',
    ];
    for (const word of words) {
      assert.equal(
        validateClone((doc) => {
          doc.triggers['task-checkpoint'].description = `Fires on ${word} events.`;
        }),
        false,
        `"${word}" was accepted in description`
      );
    }
    // Word-bounded: the status vocabulary #2054 keeps and the trigger's own
    // name are not collateral damage.
    for (const legal of [
      'Records unrunnable, skipped and bypassed checks before-merge.',
      'The merge decision stays with the platform; capability gaps are manual-required.',
    ]) {
      assert.equal(
        validateClone((doc) => {
          doc.triggers['before-merge'].description = legal;
        }),
        true,
        `"${legal}" was rejected`
      );
    }
  });

  test('schema applies the same prose rule to entry and top-level descriptions', () => {
    assert.equal(
      validateClone((doc) => {
        doc.entries['review-task'].description = 'Claude host.';
      }),
      false
    );
    assert.equal(
      validateClone((doc) => {
        doc.description = 'Claude host.';
      }),
      false
    );
  });

  test('schema keeps a map without triggers valid (additive)', () => {
    assert.equal(
      validateClone((doc) => {
        delete doc.triggers;
      }),
      true
    );
  });

  test('the SKILL.md trigger column matches entry-map.json triggers (SSoT sync)', () => {
    const skillText = readFileSync(SKILL_MD, 'utf8');
    const section = skillText.split(/^## /m).find((part) => part.startsWith('Flow Entry'));
    assert.ok(section, 'SKILL.md has no "## Flow Entry" section');

    const table = {};
    for (const line of section.split('\n')) {
      const row = /^\|\s*`([^`]+)`\s*\|\s*`[^`]+`\s*\|[^|]*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
      if (!row) continue;
      table[row[1]] = [...row[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort();
    }

    const expected = {};
    for (const entryName of Object.keys(entryMap.entries)) expected[entryName] = [];
    for (const [name, trigger] of Object.entries(triggers)) {
      for (const entry of trigger.entries) expected[entry].push(name);
    }
    for (const entryName of Object.keys(expected)) expected[entryName].sort();
    assert.deepEqual(table, expected);
  });
});
