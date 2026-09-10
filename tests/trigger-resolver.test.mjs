// Trigger resolver contract tests (#2054 PR-2, Epic #2011 Phase 2).
//
// Cross-path discipline (CLAUDE.md "Import the SSoT, never re-derive it"): the
// pin assertions compare the resolver's output against the EXISTING production
// path — `resolveExecutionManifestSpec` + `buildExecutionManifest` for the same
// Flow document — rather than against `deriveFlowPin` called from the test,
// which would pass no matter what the resolver derived. The real Flow / Intent
// / entry-map documents are read HERE, on the test side, so the #2016
// observe-mode invariant (no module under src/ reads them) is untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_KIND_ENTRIES,
  INDEPENDENCE_TIERS,
  OCCURRENCE_ID_PREFIX,
  RISK_ACTIONS,
  TriggerResolverError,
  resolveTrigger,
} from '../src/lib/trigger-resolver.mjs';
import {
  ExecutionManifestError,
  buildExecutionManifest,
  resolveExecutionManifestSpec,
} from '../src/lib/execution-manifest.mjs';
import { referencesFlowsDirectory } from './helpers/flows-reference-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FLOWS_DIR = resolve(REPO_ROOT, 'flows');
const INTENTS_DIR = resolve(FLOWS_DIR, 'intents');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// Fixture registry: the `triggers` shape agreed for #2054 (PR-1 adds it to
// flows/entry-map.json). Kept as a literal so these tests do not depend on
// PR-1 landing first.
// ---------------------------------------------------------------------------

const FIXTURE_TRIGGERS = {
  'task-checkpoint': {
    entries: ['review-task'],
    requiredEvidence: ['tasks', 'diff'],
    mode: 'observe',
  },
  'artifact-ready': {
    entries: [
      'review-research',
      'review-requirements',
      'review-design',
      'review-technical',
      'review-plan',
      'review-replan',
    ],
    selectBy: 'artifactKind',
    mode: 'observe',
  },
  'before-publish': {
    entries: ['review-final'],
    requiredEvidence: ['requirements', 'diff'],
    mode: 'observe',
  },
  'before-merge': {
    entries: ['review-final'],
    requiredEvidence: ['requirements', 'diff'],
    independence: 'execution-isolated',
    mode: 'observe',
  },
  'after-change': { entries: [], profile: 'fast-verification', mode: 'observe' },
};

const flowDoc = (id, inputs, extra = {}) => ({
  id,
  version: '0.1.0',
  description: `${id} fixture`,
  inputs,
  ...extra,
});

const FIXTURE_FLOWS = [
  flowDoc('task-completion-review', [
    { name: 'tasks', required: true },
    { name: 'diff', required: true },
    { name: 'tests' },
  ]),
  flowDoc('final-review', [
    { name: 'requirements', required: true },
    { name: 'diff', required: true },
    { name: 'baseline' },
  ]),
  flowDoc('research-review', [{ name: 'artifacts', required: true }]),
  flowDoc('requirements-review', [{ name: 'requirements', required: true }]),
  flowDoc('design-review', [{ name: 'design', required: true }]),
  flowDoc('technical-review', [{ name: 'design', required: true }, { name: 'tests' }]),
  flowDoc('plan-review', [{ name: 'plan', required: true }]),
  flowDoc('replan-review', [
    { name: 'plan', required: true },
    { name: 'baseline', required: true },
  ]),
];

const FIXTURE_REGISTRY = {
  version: '0.2.0',
  entries: Object.fromEntries(
    FIXTURE_FLOWS.map((doc) => [
      `review-${doc.id.replace(/-review$/, '').replace(/^task-completion$/, 'task')}`,
      { flow: doc.id, flowVersion: '0.1.0' },
    ])
  ),
  triggers: FIXTURE_TRIGGERS,
};

const SOURCES = { registry: FIXTURE_REGISTRY, flowDocuments: FIXTURE_FLOWS };

const resolveFixture = (input) => resolveTrigger(input, SOURCES);

/** The pin the existing manifest path produces for `document` — the comparison target. */
const manifestPinFor = (document, expectedVersion) => {
  const manifest = buildExecutionManifest(
    resolveExecutionManifestSpec({ flowDocument: document, expectedFlowVersion: expectedVersion }),
    { now: new Date('2026-09-05T00:00:00.000Z') }
  );
  return manifest.flow;
};

// ---------------------------------------------------------------------------
// Happy path, one per event
// ---------------------------------------------------------------------------

describe('resolveTrigger: one resolution per neutral event', () => {
  it('task-checkpoint → review-task, evidence = registry ∪ flow required inputs', () => {
    const result = resolveFixture({ event: 'task-checkpoint' });
    assert.equal(result.triggerId, 'task-checkpoint');
    assert.deepEqual(result.selectedEntries, ['review-task']);
    assert.deepEqual(
      result.flowPins.map((pin) => [pin.entry, pin.id, pin.version]),
      [['review-task', 'task-completion-review', '0.1.0']]
    );
    assert.match(result.flowPins[0].sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.evidenceRequirements, ['diff', 'tasks']);
    assert.equal(result.independence, null);
    assert.equal(result.mode, 'observe');
    assert.equal(result.profile, null);
    assert.match(result.occurrenceId, new RegExp(`^${OCCURRENCE_ID_PREFIX}[0-9a-f]{16}$`));
  });

  it('artifact-ready picks exactly one entry from artifactKind', () => {
    const expected = {
      research: ['review-research', 'research-review', ['artifacts']],
      requirements: ['review-requirements', 'requirements-review', ['requirements']],
      design: ['review-design', 'design-review', ['design']],
      technical: ['review-technical', 'technical-review', ['design']],
      plan: ['review-plan', 'plan-review', ['plan']],
      replan: ['review-replan', 'replan-review', ['baseline', 'plan']],
    };
    for (const [artifactKind, [entry, flowId, evidence]] of Object.entries(expected)) {
      const result = resolveFixture({ event: 'artifact-ready', artifactKind });
      assert.deepEqual(result.selectedEntries, [entry], artifactKind);
      assert.equal(result.flowPins.length, 1, artifactKind);
      assert.equal(result.flowPins[0].id, flowId, artifactKind);
      assert.deepEqual(result.evidenceRequirements, evidence, artifactKind);
    }
  });

  it('before-publish → review-final with no independence requirement', () => {
    const result = resolveFixture({ event: 'before-publish' });
    assert.deepEqual(result.selectedEntries, ['review-final']);
    assert.deepEqual(result.evidenceRequirements, ['diff', 'requirements']);
    assert.equal(result.independence, null);
  });

  it('before-merge → review-final carrying the declared independence tier', () => {
    const result = resolveFixture({ event: 'before-merge', riskAction: 'standard' });
    assert.deepEqual(result.selectedEntries, ['review-final']);
    assert.equal(result.independence, 'execution-isolated');
  });

  it('after-change → no entries, no pins, no evidence (fast verification only)', () => {
    const result = resolveFixture({ event: 'after-change', hostCapabilities: ['format'] });
    assert.deepEqual(result.selectedEntries, []);
    assert.deepEqual(result.flowPins, []);
    assert.deepEqual(result.evidenceRequirements, []);
    assert.equal(result.independence, null);
    assert.equal(result.profile, 'fast-verification');
  });

  it('mode is passed through, never interpreted: off still resolves', () => {
    const registry = {
      ...FIXTURE_REGISTRY,
      triggers: {
        ...FIXTURE_TRIGGERS,
        'before-publish': { entries: ['review-final'], mode: 'off' },
      },
    };
    const result = resolveTrigger(
      { event: 'before-publish' },
      { registry, flowDocuments: FIXTURE_FLOWS }
    );
    assert.equal(result.mode, 'off');
    assert.deepEqual(result.selectedEntries, ['review-final']);
    assert.equal(result.flowPins.length, 1);
    const bad = {
      ...FIXTURE_REGISTRY,
      triggers: {
        ...FIXTURE_TRIGGERS,
        'before-publish': { entries: ['review-final'], mode: 'on' },
      },
    };
    assert.throws(
      () =>
        resolveTrigger(
          { event: 'before-publish' },
          { registry: bad, flowDocuments: FIXTURE_FLOWS }
        ),
      /unknown mode "on"/
    );
  });

  it('output carries exactly the contract keys', () => {
    assert.deepEqual(Object.keys(resolveFixture({ event: 'before-publish' })).sort(), [
      'evidenceRequirements',
      'flowPins',
      'independence',
      'mode',
      'occurrenceId',
      'profile',
      'selectedEntries',
      'triggerId',
    ]);
  });
});

// ---------------------------------------------------------------------------
// riskAction: consulted in exactly one place
// ---------------------------------------------------------------------------

describe('resolveTrigger: riskAction', () => {
  it('human-required raises before-merge independence to provider-diverse', () => {
    const result = resolveFixture({ event: 'before-merge', riskAction: 'human-required' });
    assert.equal(result.independence, 'provider-diverse');
  });

  it('human-required changes nothing but before-merge', () => {
    for (const event of ['task-checkpoint', 'artifact-ready', 'before-publish', 'after-change']) {
      const artifactKind = event === 'artifact-ready' ? 'design' : null;
      const withRisk = resolveFixture({ event, artifactKind, riskAction: 'human-required' });
      const without = resolveFixture({ event, artifactKind, riskAction: 'light' });
      assert.equal(withRisk.independence, without.independence, event);
      assert.deepEqual(withRisk.selectedEntries, without.selectedEntries, event);
      assert.deepEqual(withRisk.flowPins, without.flowPins, event);
    }
  });

  it('never lowers a declared tier', () => {
    const registry = {
      ...FIXTURE_REGISTRY,
      triggers: {
        ...FIXTURE_TRIGGERS,
        'before-merge': { entries: ['review-final'], independence: 'provider-diverse' },
      },
    };
    const result = resolveTrigger(
      { event: 'before-merge', riskAction: 'light' },
      { registry, flowDocuments: FIXTURE_FLOWS }
    );
    assert.equal(result.independence, 'provider-diverse');
  });

  it('accepts exactly the Router mode vocabulary', async () => {
    // Pinned against the Router's own source rather than re-typed: the
    // resolver must not import the Router, so the two lists live apart.
    const routerSource = readFileSync(resolve(REPO_ROOT, 'src/lib/review-mode-router.mjs'), 'utf8');
    const typedef = routerSource.match(/@typedef \{([^}]+)\} ReviewRouterMode/)?.[1];
    assert.ok(typedef, 'ReviewRouterMode typedef not found');
    const routerModes = [...typedef.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...RISK_ACTIONS], routerModes);
    assert.throws(
      () => resolveFixture({ event: 'before-merge', riskAction: 'comment_only' }),
      TriggerResolverError
    );
  });

  it('accepts exactly the independence vocabulary the entry-map schema declares', () => {
    // Range review v1.100.0 minor: the resolver's INDEPENDENCE_TIERS and the
    // schema's `independence.enum` had no cross-pin. `self` (index 0) is the
    // default tier a registry entry can never declare — the schema enum starts
    // one step above it — so the comparison skips it.
    const schema = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'schemas/flow-entry-map.schema.json'), 'utf8')
    );
    const schemaTiers = schema.$defs.trigger.properties.independence.enum;
    assert.equal(INDEPENDENCE_TIERS[0], 'self');
    assert.deepEqual(INDEPENDENCE_TIERS.slice(1), schemaTiers);
  });
});

// ---------------------------------------------------------------------------
// Fail loudly
// ---------------------------------------------------------------------------

describe('resolveTrigger: rejects instead of degrading', () => {
  const CASES = [
    ['unknown event', { event: 'post-tool-use' }, /unknown event "post-tool-use"/],
    ['empty event', { event: '' }, /event must be a non-empty string/],
    [
      'unknown artifactKind',
      { event: 'artifact-ready', artifactKind: 'diff' },
      /unknown artifactKind "diff"/,
    ],
    ['missing artifactKind', { event: 'artifact-ready' }, /requires artifactKind/],
    [
      'artifactKind on an entries trigger',
      { event: 'before-publish', artifactKind: 'design' },
      /does not select by artifactKind/,
    ],
    ['unknown riskAction', { event: 'before-merge', riskAction: 'critical' }, /unknown riskAction/],
    ['blank subjectRevision', { event: 'before-merge', subjectRevision: ' ' }, /subjectRevision/],
    [
      'non-array hostCapabilities',
      { event: 'after-change', hostCapabilities: 'format' },
      /hostCapabilities/,
    ],
  ];
  for (const [label, input, pattern] of CASES) {
    it(`${label} → throws`, () => {
      assert.throws(
        () => resolveFixture(input),
        (error) => {
          assert.ok(error instanceof TriggerResolverError, `${label}: ${error.name}`);
          assert.match(error.message, pattern);
          return true;
        }
      );
    });
  }

  it('registry without triggers → throws', () => {
    assert.throws(
      () =>
        resolveTrigger(
          { event: 'before-publish' },
          { registry: { entries: {} }, flowDocuments: [] }
        ),
      /triggers/
    );
  });

  it('entry whose Flow document is not supplied → throws', () => {
    assert.throws(
      () =>
        resolveTrigger(
          { event: 'before-publish' },
          { registry: FIXTURE_REGISTRY, flowDocuments: [] }
        ),
      /flow "final-review", which was not supplied/
    );
  });

  it('entry pinning a version the document does not carry → throws (deriveFlowPin)', () => {
    const registry = {
      ...FIXTURE_REGISTRY,
      entries: {
        ...FIXTURE_REGISTRY.entries,
        'review-final': { flow: 'final-review', flowVersion: '9.9.9' },
      },
    };
    assert.throws(
      () => resolveTrigger({ event: 'before-publish' }, { registry, flowDocuments: FIXTURE_FLOWS }),
      (error) => {
        assert.ok(error instanceof TriggerResolverError, error.name);
        assert.match(error.message, /is version 0\.1\.0, but the caller resolved 9\.9\.9/);
        assert.ok(
          error.cause instanceof ExecutionManifestError,
          'cause must be the original error'
        );
        return true;
      }
    );
  });

  it('artifactKind that selects an entry the trigger does not declare → throws', () => {
    const registry = {
      ...FIXTURE_REGISTRY,
      triggers: {
        ...FIXTURE_TRIGGERS,
        'artifact-ready': { entries: ['review-design'], selectBy: 'artifactKind' },
      },
    };
    assert.throws(
      () =>
        resolveTrigger(
          { event: 'artifact-ready', artifactKind: 'plan' },
          { registry, flowDocuments: FIXTURE_FLOWS }
        ),
      /selects "review-plan", which trigger "artifact-ready" does not declare/
    );
  });
});

// ---------------------------------------------------------------------------
// Pins are bound to entries and equal the production manifest path
// ---------------------------------------------------------------------------

describe('resolveTrigger: flowPins', () => {
  it('equal the flow block buildExecutionManifest derives for the same document', () => {
    for (const event of ['task-checkpoint', 'before-publish']) {
      const result = resolveFixture({ event });
      for (const pin of result.flowPins) {
        const document = FIXTURE_FLOWS.find((doc) => doc.id === pin.id);
        const expected = manifestPinFor(document, FIXTURE_REGISTRY.entries[pin.entry].flowVersion);
        assert.equal(expected.status, 'resolved');
        assert.deepEqual(
          { id: pin.id, version: pin.version, sha256: pin.sha256 },
          { id: expected.id, version: expected.version, sha256: expected.sha256 }
        );
      }
    }
  });

  it('swapping the selected entry swaps the pin', () => {
    const publish = resolveFixture({ event: 'before-publish' });
    const task = resolveFixture({ event: 'task-checkpoint' });
    assert.notDeepEqual(publish.flowPins, task.flowPins);
    assert.notEqual(publish.flowPins[0].sha256, task.flowPins[0].sha256);
    const registry = {
      ...FIXTURE_REGISTRY,
      triggers: { ...FIXTURE_TRIGGERS, 'before-publish': { entries: ['review-task'] } },
    };
    const swapped = resolveTrigger(
      { event: 'before-publish' },
      { registry, flowDocuments: FIXTURE_FLOWS }
    );
    assert.deepEqual(swapped.flowPins, task.flowPins);
    assert.notDeepEqual(swapped.flowPins, publish.flowPins);
  });

  it('a multi-entry trigger pins each entry to its own Flow, in entry order', () => {
    const registry = {
      ...FIXTURE_REGISTRY,
      triggers: {
        ...FIXTURE_TRIGGERS,
        'before-publish': { entries: ['review-task', 'review-final'] },
      },
    };
    const result = resolveTrigger(
      { event: 'before-publish' },
      { registry, flowDocuments: FIXTURE_FLOWS }
    );
    assert.deepEqual(
      result.flowPins.map((pin) => [pin.entry, pin.id]),
      [
        ['review-task', 'task-completion-review'],
        ['review-final', 'final-review'],
      ]
    );
    assert.notEqual(result.flowPins[0].sha256, result.flowPins[1].sha256);
    assert.deepEqual(result.evidenceRequirements, ['diff', 'requirements', 'tasks']);
  });

  it('a changed document byte changes the pin', () => {
    const edited = FIXTURE_FLOWS.map((doc) =>
      doc.id === 'final-review' ? { ...doc, description: 'edited' } : doc
    );
    const before = resolveFixture({ event: 'before-publish' });
    const after = resolveTrigger(
      { event: 'before-publish' },
      { registry: FIXTURE_REGISTRY, flowDocuments: edited }
    );
    assert.notEqual(before.flowPins[0].sha256, after.flowPins[0].sha256);
    assert.notEqual(before.occurrenceId, after.occurrenceId);
  });
});

// ---------------------------------------------------------------------------
// occurrenceId determinism
// ---------------------------------------------------------------------------

describe('resolveTrigger: occurrenceId', () => {
  const base = {
    event: 'before-merge',
    riskAction: 'team',
    hostCapabilities: ['ci', 'format'],
    subjectRevision: 'abc123',
  };

  it('same input twice → same id; capability order does not matter', () => {
    const a = resolveFixture(base);
    const b = resolveFixture({ ...base, hostCapabilities: ['format', 'ci'] });
    assert.equal(a.occurrenceId, b.occurrenceId);
    assert.equal(a.occurrenceId, 'RR-TRG-' + a.occurrenceId.slice('RR-TRG-'.length));
  });

  it('each single-field change → different id', () => {
    const a = resolveFixture(base).occurrenceId;
    const variants = [
      { ...base, event: 'before-publish' },
      { ...base, riskAction: 'light' },
      { ...base, hostCapabilities: ['ci'] },
      { ...base, subjectRevision: 'abc124' },
      { ...base, subjectRevision: null },
    ];
    const ids = variants.map((input) => resolveFixture(input).occurrenceId);
    for (const [index, id] of ids.entries()) {
      assert.notEqual(id, a, `variant ${index}`);
    }
    assert.equal(new Set(ids).size, ids.length, 'variants collide with each other');
  });
});

// ---------------------------------------------------------------------------
// Real documents (read on the test side only)
// ---------------------------------------------------------------------------

describe('resolveTrigger: against the real Flow / Intent / entry-map documents', () => {
  const realFlows = readdirSync(FLOWS_DIR)
    .filter((name) => name.endsWith('.flow.json'))
    .map((name) => readJson(join(FLOWS_DIR, name)));
  const realIntents = readdirSync(INTENTS_DIR)
    .filter((name) => name.endsWith('.intent.json'))
    .map((name) => readJson(join(INTENTS_DIR, name)));
  const realEntryMap = readJson(join(FLOWS_DIR, 'entry-map.json'));
  // Until PR-1 lands `triggers` in the entry map, the fixture block stands in.
  const registry = realEntryMap.triggers
    ? realEntryMap
    : { ...realEntryMap, triggers: FIXTURE_TRIGGERS };
  const sources = { registry, flowDocuments: realFlows };

  it('every event resolves, and every pin equals the production manifest pin', () => {
    const cases = [
      { event: 'task-checkpoint' },
      { event: 'artifact-ready', artifactKind: 'design' },
      { event: 'before-publish' },
      { event: 'before-merge', riskAction: 'human-required' },
      { event: 'after-change' },
    ];
    for (const input of cases) {
      const result = resolveTrigger(input, sources);
      for (const pin of result.flowPins) {
        const document = realFlows.find((doc) => doc.id === pin.id);
        const expected = manifestPinFor(document, registry.entries[pin.entry].flowVersion);
        assert.equal(expected.status, 'resolved', input.event);
        assert.deepEqual(
          { id: pin.id, version: pin.version, sha256: pin.sha256 },
          { id: expected.id, version: expected.version, sha256: expected.sha256 },
          input.event
        );
      }
    }
    const task = resolveTrigger({ event: 'task-checkpoint' }, sources);
    assert.deepEqual(task.evidenceRequirements, ['diff', 'tasks']);
  });

  it('ARTIFACT_KIND_ENTRIES matches Intent stage → Flow purpose → entry', () => {
    // stage (schema enum, upstream Intents) → the Flow whose intent.purpose is
    // that Intent → the entry whose flow it is. The resolver's table must say
    // the same thing, or it has minted a mapping the documents do not carry.
    const expected = {};
    for (const intent of realIntents.filter((doc) => doc.phase === 'upstream')) {
      const flow = realFlows.find((doc) => doc.intent?.purpose === intent.purpose);
      assert.ok(flow, `no Flow for Intent ${intent.purpose}`);
      const [entryName] = Object.entries(registry.entries).find(
        ([, entry]) => entry.flow === flow.id
      );
      expected[intent.stage] = entryName;
    }
    assert.deepEqual({ ...ARTIFACT_KIND_ENTRIES }, expected);
    assert.deepEqual(
      Object.values(ARTIFACT_KIND_ENTRIES).sort(),
      [...registry.triggers['artifact-ready'].entries].sort()
    );
  });

  it('every trigger entry exists in the entry map', () => {
    for (const [triggerId, trigger] of Object.entries(registry.triggers)) {
      for (const entry of trigger.entries) {
        assert.ok(registry.entries[entry], `${triggerId} names unknown entry ${entry}`);
      }
    }
  });

  it('independence tiers match the #2054 routing table order', () => {
    assert.deepEqual(
      [...INDEPENDENCE_TIERS],
      ['self', 'context-isolated', 'execution-isolated', 'provider-diverse']
    );
  });

  it('the resolver module itself does not reference flows/ (observe mode)', () => {
    const source = readFileSync(resolve(REPO_ROOT, 'src/lib/trigger-resolver.mjs'), 'utf8');
    assert.equal(referencesFlowsDirectory(source), false);
    assert.doesNotMatch(source, /readFileSync|readdirSync|node:fs/);
  });
});
