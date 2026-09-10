// Contract tests for src/lib/flow-loader.mjs (#2054 PR-3, Epic #2011).
//
// The loader is the single runtime reader of `flows/` (tests/flow-definitions
// .test.mjs pins that it is the ONLY one). What is pinned here:
//
//   - it loads every shipped asset and validates each against the schema that
//     owns it, agreeing with the test-side validators
//     (tests/helpers/schema-validator.mjs) in both directions — the shipped
//     documents pass both, and a mutated document both reject;
//   - `resolveFlowEntry` produces the SAME pin `resolveTrigger`
//     (src/lib/trigger-resolver.mjs) produces for the same entry, because both
//     go through `deriveFlowPin`. This is the cross-check CLAUDE.md "Import the
//     SSoT, never re-derive it" asks for: the loader is compared against the
//     existing production path, not against itself;
//   - a missing directory, an unreadable document or an unknown entry is a
//     loud `FlowLoaderError` — never a partial result or a silent fall-back;
//   - `RIVER_FLOWS_DIR` and the `flowsDir` argument override the default, in
//     that precedence.

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, describe } from 'node:test';

import {
  DEFAULT_FLOWS_DIR,
  ENTRY_MAP_FILENAME,
  FLOWS_DIR_ENV,
  FlowLoaderError,
  listFlowEntryNames,
  loadFlowRegistry,
  requiredInputNames,
  resolveFlowEntry,
  resolveFlowsDir,
} from '../src/lib/flow-loader.mjs';
import { deriveFlowPin } from '../src/lib/execution-manifest.mjs';
import { ARTIFACT_KIND_ENTRIES, resolveTrigger } from '../src/lib/trigger-resolver.mjs';
import {
  compileFlowEntryMapValidator,
  compileFlowValidator,
  compileReviewIntentValidator,
} from './helpers/schema-validator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FLOWS_DIR = resolve(REPO_ROOT, 'flows');

const tempDirs = [];
const copyFlows = () => {
  const dir = mkdtempSync(join(tmpdir(), 'river-flows-'));
  cpSync(FLOWS_DIR, dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('flow-loader: where the assets come from', () => {
  test('the default is the repository flows/ directory', () => {
    assert.equal(DEFAULT_FLOWS_DIR, FLOWS_DIR);
    assert.equal(resolveFlowsDir({ env: {} }), FLOWS_DIR);
  });

  test('RIVER_FLOWS_DIR overrides the default and an explicit argument overrides both', () => {
    assert.equal(resolveFlowsDir({ env: { [FLOWS_DIR_ENV]: '/from/env' } }), resolve('/from/env'));
    assert.equal(
      resolveFlowsDir({ flowsDir: '/explicit', env: { [FLOWS_DIR_ENV]: '/from/env' } }),
      resolve('/explicit')
    );
    // Blank means "not set", the same reading `nonEmptyNfcString` gives --base.
    assert.equal(resolveFlowsDir({ flowsDir: '   ', env: { [FLOWS_DIR_ENV]: '' } }), FLOWS_DIR);
  });

  test('a missing directory is a loud FlowLoaderError that names the env override', () => {
    assert.throws(
      () => loadFlowRegistry({ flowsDir: join(tmpdir(), 'river-no-such-flows-dir'), env: {} }),
      (error) =>
        error instanceof FlowLoaderError &&
        /flows directory not found/.test(error.message) &&
        error.message.includes(FLOWS_DIR_ENV)
    );
  });
});

describe('flow-loader: loading and validating the shipped assets', () => {
  const loaded = loadFlowRegistry({ env: {} });

  test('loads the entry map, every Flow document and every Review Intent', () => {
    assert.equal(loaded.flowsDir, FLOWS_DIR);
    assert.equal(Object.keys(loaded.registry.entries).length, 8);
    assert.ok(loaded.registry.triggers, 'the PR-1 triggers block is passed through');
    assert.equal(loaded.flowDocuments.length, 8);
    assert.equal(loaded.intents.length, 8);
  });

  test('agrees with the test-side validators on every shipped document', () => {
    const validateEntryMap = compileFlowEntryMapValidator();
    const validateFlow = compileFlowValidator();
    const validateIntent = compileReviewIntentValidator();
    assert.equal(validateEntryMap(loaded.registry), true);
    for (const document of loaded.flowDocuments) assert.equal(validateFlow(document), true);
    for (const intent of loaded.intents) assert.equal(validateIntent(intent), true);
  });

  test('listFlowEntryNames is the sorted key set of entries', () => {
    assert.deepEqual(listFlowEntryNames({ env: {} }), Object.keys(loaded.registry.entries).sort());
  });

  test('a Flow document that fails its schema is rejected — by the loader AND the test validator', () => {
    const dir = copyFlows();
    const path = join(dir, 'plan-review.flow.json');
    const document = JSON.parse(readFileSync(path, 'utf8'));
    delete document.version; // `version` is required by schemas/flow.schema.json
    writeFileSync(path, JSON.stringify(document));
    assert.equal(compileFlowValidator()(document), false, 'the mutation must be a real violation');
    assert.throws(
      () => loadFlowRegistry({ flowsDir: dir, env: {} }),
      (error) =>
        error instanceof FlowLoaderError &&
        error.message.includes('plan-review.flow.json') &&
        /does not satisfy its schema/.test(error.message)
    );
  });

  test('an entry map that fails its schema is rejected the same way', () => {
    const dir = copyFlows();
    const path = join(dir, ENTRY_MAP_FILENAME);
    const registry = JSON.parse(readFileSync(path, 'utf8'));
    registry.entries['review-plan'].flowVersion = 'not-a-semver';
    writeFileSync(path, JSON.stringify(registry));
    assert.equal(compileFlowEntryMapValidator()(registry), false);
    assert.throws(
      () => loadFlowRegistry({ flowsDir: dir, env: {} }),
      (error) => error instanceof FlowLoaderError && error.message.includes(ENTRY_MAP_FILENAME)
    );
  });

  test('a document that is not JSON is rejected with its path', () => {
    const dir = copyFlows();
    writeFileSync(join(dir, 'intents', 'plan-readiness.intent.json'), '{ not json');
    assert.throws(
      () => loadFlowRegistry({ flowsDir: dir, env: {} }),
      (error) =>
        error instanceof FlowLoaderError &&
        /is not valid JSON/.test(error.message) &&
        error.message.includes('plan-readiness.intent.json')
    );
  });
});

describe('flow-loader: resolveFlowEntry against the existing production path', () => {
  const { registry, flowDocuments } = loadFlowRegistry({ env: {} });

  for (const [artifactKind, entryName] of Object.entries(ARTIFACT_KIND_ENTRIES)) {
    test(`${entryName}: the pin and evidence equal what resolveTrigger(artifact-ready) yields`, () => {
      const resolved = resolveFlowEntry(entryName, { env: {} });
      const viaTrigger = resolveTrigger(
        { event: 'artifact-ready', artifactKind },
        { registry, flowDocuments }
      );
      assert.deepEqual(viaTrigger.selectedEntries, [entryName]);
      assert.deepEqual(resolved.flow, viaTrigger.flowPins[0]);
      // `artifact-ready` adds no trigger-level evidence, so the two lists are
      // the Flow's own required inputs in both cases.
      assert.deepEqual(resolved.evidenceRequirements, viaTrigger.evidenceRequirements);
    });
  }

  test('every entry pins through deriveFlowPin with the entry-declared version', () => {
    for (const [entryName, entry] of Object.entries(registry.entries)) {
      const resolved = resolveFlowEntry(entryName, { env: {} });
      const document = flowDocuments.find((candidate) => candidate.id === entry.flow);
      assert.deepEqual(resolved.flow, {
        entry: entryName,
        ...deriveFlowPin(document, { expectedVersion: entry.flowVersion }),
      });
      assert.deepEqual(resolved.evidenceRequirements, requiredInputNames(document));
      assert.equal(resolved.intent?.purpose, document.intent.purpose);
    }
  });

  test("a directly named entry carries only the Flow inputs, not a trigger's extra evidence", () => {
    // `task-checkpoint` declares `requiredEvidence: ["tasks", "diff"]` on top
    // of the Flow's inputs. An entry named directly has no trigger, so the
    // loader must not invent one — its list is the Flow's inputs alone.
    const resolved = resolveFlowEntry('review-task', { env: {} });
    const document = flowDocuments.find((candidate) => candidate.id === 'task-completion-review');
    assert.deepEqual(resolved.evidenceRequirements, requiredInputNames(document));
  });

  test('an unknown entry is a FlowLoaderError that lists the accepted names', () => {
    assert.throws(
      () => resolveFlowEntry('nosuch', { env: {} }),
      (error) =>
        error instanceof FlowLoaderError &&
        error.message.includes('unknown entry "nosuch"') &&
        error.message.includes(Object.keys(registry.entries).sort().join(', '))
    );
    assert.throws(() => resolveFlowEntry('', { env: {} }), FlowLoaderError);
    assert.throws(() => resolveFlowEntry(null, { env: {} }), FlowLoaderError);
  });

  test('an entry/document version mismatch is rejected, not pinned under the wrong version', () => {
    const dir = copyFlows();
    const path = join(dir, ENTRY_MAP_FILENAME);
    const mutated = JSON.parse(readFileSync(path, 'utf8'));
    mutated.entries['review-plan'].flowVersion = '9.9.9';
    writeFileSync(path, JSON.stringify(mutated));
    assert.throws(
      () => resolveFlowEntry('review-plan', { flowsDir: dir, env: {} }),
      (error) => error instanceof FlowLoaderError && /cannot be pinned/.test(error.message)
    );
  });

  test('the loader holds no judgment: the resolved shape is pin + evidence + documents only', () => {
    const resolved = resolveFlowEntry('review-final', { env: {} });
    assert.deepEqual(Object.keys(resolved).sort(), [
      'document',
      'evidenceRequirements',
      'flow',
      'intent',
    ]);
    assert.deepEqual(Object.keys(resolved.flow).sort(), ['entry', 'id', 'sha256', 'version']);
    for (const key of ['severity', 'gate', 'decision', 'skills']) {
      assert.equal(key in resolved, false, `${key} must not be produced by the loader`);
    }
  });
});
