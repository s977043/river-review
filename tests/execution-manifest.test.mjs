// Execution Manifest contract tests (#2015, Epic #2011 Phase 4).
//
// Cross-path discipline (CLAUDE.md "Import the SSoT, never re-derive it"): the
// interesting assertions here compare the new module against the EXISTING
// production paths — `buildRunEvidence` for the review_run_id and the sha256
// helper, `buildRunRecord` for the record shape, the real
// docs/data/skill-manifest.json for checksum normalization, and `redactText`
// for the redaction contract. A test that recomputed a value with the same
// function it is testing would pass no matter what the module derived.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXECUTION_MANIFEST_ID_PREFIX,
  EXECUTION_MANIFEST_SCHEMA_VERSION,
  ExecutionManifestError,
  PROVENANCE_BLOCKS,
  REPLAY_REQUIREMENTS,
  assertNoRawContext,
  assessReplayability,
  attachExecutionManifest,
  buildExecutionManifest,
  deriveFlowPin,
  formatExecutionManifestMarkdown,
  normalizeSha256,
  resolveExecutionManifestSpec,
  verifyExecutionManifest,
} from '../src/lib/execution-manifest.mjs';
import { buildRunEvidence, deriveReviewRunId, sha256Hex } from '../src/lib/shadow-aggregate.mjs';
import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import { buildRunRecord } from '../src/lib/result-store.mjs';
import { redactText } from '../src/lib/secret-redactor.mjs';
import {
  compileSchemaFile,
  compileFlowValidator,
  compileReviewArtifactValidator,
} from './helpers/schema-validator.mjs';
import { referencesFlowsDirectory } from './helpers/flows-reference-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FIXTURES = resolve(HERE, 'fixtures', 'execution-manifest');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const COMPLETE = readJson(resolve(FIXTURES, 'complete.json'));
const PARTIAL = readJson(resolve(FIXTURES, 'partial.json'));

const FIXED_NOW = new Date('2026-09-03T00:00:00.000Z');

function completeSpec(overrides = {}) {
  return {
    reviewRunId: '2026-09-03T00-00-00-000Z-abc123',
    riverReview: { version: '1.91.0' },
    plugin: { host: 'claude-code', pluginVersion: '1.91.0' },
    flow: { id: 'final-review', version: '1', sha256: 'a'.repeat(64) },
    agents: [
      { id: 'completion-judge', version: '1', sha256: 'b'.repeat(64) },
      { id: 'finding-verifier', version: '1', sha256: 'c'.repeat(64) },
    ],
    skills: [
      { id: 'requirements-consistency', version: '1', sha256: `sha256:${'d'.repeat(64)}` },
      { id: 'a11y-accessible-name', version: '2', sha256: 'e'.repeat(64) },
    ],
    artifacts: { requirements: { sha256: 'f'.repeat(64) }, diff: { sha256: '0'.repeat(64) } },
    policy: {
      ref: 'pages/reference/review-policy.md',
      sha256: '1'.repeat(64),
      riskMapDigest: '0123456789abcdef',
    },
    runtime: { provider: 'anthropic', model: 'claude-sonnet-4', profile: 'medium' },
    config: { sha256: '2'.repeat(64) },
    ...overrides,
  };
}

describe('buildExecutionManifest — deterministic fixture (#2015 AC 5)', () => {
  it('reproduces the committed fixture byte for byte', () => {
    const built = buildExecutionManifest(completeSpec(), { now: FIXED_NOW });
    assert.deepEqual(built, COMPLETE);
  });

  it('is stable across two builds and independent of key insertion order', () => {
    const forward = buildExecutionManifest(completeSpec(), { now: FIXED_NOW });
    const spec = completeSpec();
    // Rebuild the same spec with reversed key order and reversed array order:
    // canonicalJson must absorb both, or the same run would mint two manifests.
    const shuffled = Object.fromEntries(Object.entries(spec).reverse());
    shuffled.agents = [...spec.agents].reverse();
    shuffled.skills = [...spec.skills].reverse();
    const backward = buildExecutionManifest(shuffled, { now: FIXED_NOW });
    assert.equal(backward.manifestKey, forward.manifestKey);
    assert.equal(backward.manifestHash, forward.manifestHash);
  });

  it('mints an id in its own namespace, distinct from RR-PC- and RR-EXP-', () => {
    assert.equal(EXECUTION_MANIFEST_ID_PREFIX, 'RR-EXM-');
    assert.match(COMPLETE.manifestId, /^RR-EXM-[0-9a-f]{12}$/);
    assert.equal(COMPLETE.schemaVersion, EXECUTION_MANIFEST_SCHEMA_VERSION);
    assert.equal(COMPLETE.kind, 'execution-manifest');
  });

  it('carries every provenance block #2015 enumerates', () => {
    for (const name of PROVENANCE_BLOCKS) {
      assert.ok(COMPLETE[name], `missing block: ${name}`);
      assert.ok(['resolved', 'missing', 'unavailable'].includes(COMPLETE[name].status));
    }
  });

  it('declares no write effects', () => {
    assert.deepEqual(COMPLETE.writeEffects, []);
  });
});

describe('buildExecutionManifest — cross-check against the existing production hash path', () => {
  it('derives manifestKey with the same sha256+canonicalJson pair buildRunEvidence uses', () => {
    // The production path is `buildRunEvidence`, which stamps
    // `artifact_sha256 = sha256Hex(canonicalJson(record))`. Asserting the two
    // agree on the SAME input proves this module imported that derivation
    // instead of spelling its own `createHash('sha256')`.
    const record = { runId: 'r1', findings: [], timestamp: '2026-09-03T00:00:00.000Z' };
    const evidence = buildRunEvidence(record);
    assert.equal(evidence.artifact_sha256, sha256Hex(canonicalJson(record)));

    const { manifestId, manifestKey, manifestHash, createdAt, ...conditions } = COMPLETE;
    assert.equal(manifestKey, sha256Hex(canonicalJson(conditions)));
    assert.equal(manifestId, `RR-EXM-${manifestKey.slice(0, 12)}`);
    assert.equal(
      manifestHash,
      sha256Hex(canonicalJson({ conditions, createdAt, manifestKey, manifestId }))
    );
  });

  it('resolves reviewRunId to the value the production run-record consumer resolves', () => {
    // buildRunRecord is the production producer and deriveReviewRunId (via
    // buildRunEvidence) is the production consumer. The resolver must land on
    // the same id, not a fourth derivation.
    const record = buildRunRecord(
      // Never touched: buildRunRecord only copies repoRoot into the record.
      { repoRoot: join(os.tmpdir(), 'river-exec-manifest-repo'), findings: [], changedFiles: [] },
      { phase: 'midstream', runId: 'run-2026-09-03-xyz' }
    );
    const spec = resolveExecutionManifestSpec({ runRecord: record });
    assert.equal(spec.reviewRunId, 'run-2026-09-03-xyz');
    assert.equal(spec.reviewRunId, deriveReviewRunId(record));
    assert.equal(spec.reviewRunId, buildRunEvidence(record).review_run_id);
  });
});

describe('verifyExecutionManifest — tamper detection', () => {
  it('verifies an untouched manifest', () => {
    const result = verifyExecutionManifest(COMPLETE);
    assert.equal(result.verified, true);
    assert.deepEqual(result.mismatches, []);
  });

  it('detects an edited condition', () => {
    const tampered = { ...COMPLETE, runtime: { ...COMPLETE.runtime, model: 'claude-opus-4' } };
    const result = verifyExecutionManifest(tampered);
    assert.equal(result.verified, false);
    assert.ok(result.mismatches.some((m) => m.startsWith('manifestKey:')));
  });

  it('detects an edited createdAt even when the conditions are untouched', () => {
    const tampered = { ...COMPLETE, createdAt: '2020-01-01T00:00:00.000Z' };
    const result = verifyExecutionManifest(tampered);
    assert.equal(result.verified, false);
    // The conditions did not change, so only the whole-record hash moves.
    assert.deepEqual(
      result.mismatches.map((m) => m.split(':')[0]),
      ['manifestHash']
    );
  });

  it('detects a stored digest rewritten to match an edited condition', () => {
    const forged = buildExecutionManifest(
      completeSpec({ runtime: { provider: 'x', model: 'y' } }),
      {
        now: FIXED_NOW,
      }
    );
    // Swapping in another manifest's ids is still caught: manifestHash covers
    // the ids themselves.
    const tampered = { ...forged, manifestId: COMPLETE.manifestId };
    assert.equal(verifyExecutionManifest(tampered).verified, false);
  });
});

describe('assessReplayability — a missing manifest is never read as replayable (#2015 AC 3)', () => {
  it('refuses an absent manifest loudly', () => {
    for (const absent of [null, undefined, {}, { kind: 'experiment-manifest' }]) {
      const replay = assessReplayability(absent);
      assert.equal(replay.deterministic, false);
      assert.equal(replay.judgment, false);
      assert.equal(replay.reasons.length, 1);
      assert.match(replay.reasons[0], /No execution manifest/);
    }
  });

  it('accepts a fully resolved manifest for both replay classes', () => {
    const replay = assessReplayability(COMPLETE);
    assert.equal(replay.deterministic, true);
    assert.equal(replay.judgment, true);
    assert.deepEqual(replay.missingBlocks.deterministic, []);
    assert.deepEqual(replay.missingBlocks.judgment, []);
  });

  it('names every unresolved block the partial fixture is short of', () => {
    const replay = assessReplayability(PARTIAL);
    assert.equal(replay.deterministic, false);
    assert.equal(replay.judgment, false);
    assert.deepEqual(replay.missingBlocks.deterministic, [
      'artifacts',
      'config',
      'flow',
      'policy',
      'skills',
    ]);
    assert.ok(replay.missingBlocks.judgment.includes('agents'));
    assert.ok(replay.reasons.every((r) => /deterministic|judgment/.test(r)));
  });

  it('treats a skill selection without checksums as unresolved, not resolved', () => {
    // The id alone cannot detect that the skill's text changed between run and
    // replay, so a checksum-less selection must NOT satisfy deterministic
    // replay. This is the specific misreading AC 3 exists to prevent.
    const manifest = buildExecutionManifest(
      completeSpec({ skills: [{ id: 'requirements-consistency', version: '1' }] }),
      { now: FIXED_NOW }
    );
    assert.equal(manifest.skills.status, 'missing');
    assert.equal(assessReplayability(manifest).deterministic, false);
  });

  it('keeps "declared empty" apart from "not recorded"', () => {
    const declaredEmpty = buildExecutionManifest(completeSpec({ agents: [] }), { now: FIXED_NOW });
    assert.equal(declaredEmpty.agents.status, 'unavailable');
    const notRecorded = buildExecutionManifest(completeSpec({ agents: null }), { now: FIXED_NOW });
    assert.equal(notRecorded.agents.status, 'missing');
    // Neither counts as resolved: judgment replay needs the roster either way.
    assert.equal(assessReplayability(declaredEmpty).judgment, false);
    assert.equal(assessReplayability(notRecorded).judgment, false);
  });

  it('refuses a manifest whose every required block is resolved but whose pins are null', () => {
    // The failure #2015 names verbatim: "manifest 欠損を replay 可能と誤認しない".
    // `resolved` records THAT a block was captured, not that it was pinned —
    // a flow known only by `id` and a policy backed only by the truncated
    // `riskMapDigest` both resolve. Judging replay on `status` alone therefore
    // reported `deterministic: true` for a manifest that pins neither the flow
    // definition nor the policy text, and a replay run could not detect that
    // either changed. Guarding this from the OUTSIDE (assert the pins are the
    // only thing that differ from the fully replayable spec) rather than by
    // reading REPLAY_PINS back, so re-collapsing the check into `status` fails
    // here instead of staying self-consistent.
    const unpinned = buildExecutionManifest(
      completeSpec({
        flow: { id: 'final-review', version: '1' },
        policy: { ref: 'pages/reference/review-policy.md', riskMapDigest: '0123456789abcdef' },
      }),
      { now: FIXED_NOW }
    );
    // Every required block still reaches `resolved` — that is the whole trap.
    for (const name of REPLAY_REQUIREMENTS.judgment) {
      assert.equal(unpinned[name].status, 'resolved', `${name} should still be resolved`);
    }
    assert.equal(unpinned.flow.sha256, null);
    assert.equal(unpinned.policy.sha256, null);

    const replay = assessReplayability(unpinned);
    assert.equal(replay.deterministic, false);
    assert.equal(replay.judgment, false);
    assert.deepEqual(replay.missingBlocks.deterministic, ['flow', 'policy']);
    assert.deepEqual(replay.missingBlocks.judgment, ['flow', 'policy']);
    assert.ok(replay.reasons.some((r) => r.includes('flow.sha256')));
    assert.ok(replay.reasons.some((r) => r.includes('policy.sha256')));
    // The truncated risk-map digest must not stand in for the policy hash.
    assert.equal(unpinned.policy.riskMapDigest, '0123456789abcdef');
  });

  it('accepts the policy once its own sha256 is pinned, not just the risk-map digest', () => {
    const pinned = buildExecutionManifest(
      completeSpec({
        policy: { ref: 'pages/reference/review-policy.md', sha256: '1'.repeat(64) },
      }),
      { now: FIXED_NOW }
    );
    assert.equal(pinned.policy.riskMapDigest, null);
    assert.equal(assessReplayability(pinned).deterministic, true);
  });

  it('requires the runtime only for judgment replay, not for deterministic replay', () => {
    const noRuntime = buildExecutionManifest(completeSpec({ runtime: null }), { now: FIXED_NOW });
    const replay = assessReplayability(noRuntime);
    assert.equal(replay.deterministic, true);
    assert.equal(replay.judgment, false);
    assert.ok(!REPLAY_REQUIREMENTS.deterministic.includes('runtime'));
    assert.ok(REPLAY_REQUIREMENTS.judgment.includes('runtime'));
  });
});

describe('redaction and raw-context refusal (#2015 AC 2)', () => {
  it('refuses a spec field that would carry raw context', () => {
    for (const key of ['prompt', 'rawLlmOutput', 'toolOutput', 'patch', 'reasoning']) {
      assert.throws(
        () => buildExecutionManifest(completeSpec({ [key]: 'anything' }), { now: FIXED_NOW }),
        ExecutionManifestError,
        `expected ${key} to be refused`
      );
    }
  });

  it('refuses a raw-context field nested inside an allowed block', () => {
    assert.throws(
      () =>
        buildExecutionManifest(
          completeSpec({ runtime: { provider: 'anthropic', model: 'm', prompt: 'leaked' } }),
          { now: FIXED_NOW }
        ),
      /runtime\.prompt is not allowed/
    );
  });

  it('still accepts "diff" as an ARTIFACT NAME, which #2015 names explicitly', () => {
    assert.doesNotThrow(() => assertNoRawContext(completeSpec()));
    const names = COMPLETE.artifacts.entries.map((e) => e.name);
    assert.deepEqual(names, ['diff', 'requirements']);
  });

  it('redacts a secret that reached an allowed string field, and records the hit', () => {
    const leaked = `sk-ant-api03-${'a'.repeat(48)}`;
    // Confirm the fixture string actually trips the shared redactor, so a
    // passing assertion below cannot be a redactor that matched nothing.
    assert.equal(redactText(leaked).hits.length, 1);
    const manifest = buildExecutionManifest(
      completeSpec({ runtime: { provider: 'anthropic', model: leaked, profile: 'medium' } }),
      { now: FIXED_NOW }
    );
    assert.ok(!JSON.stringify(manifest).includes(leaked));
    assert.equal(manifest.runtime.model, redactText(leaked).text);
    assert.deepEqual(manifest.redaction.hits, [{ category: 'anthropicKey', count: 1 }]);
  });

  it('redacts before hashing, so a redacted manifest still verifies', () => {
    const manifest = buildExecutionManifest(
      completeSpec({
        runtime: { provider: 'anthropic', model: `sk-ant-api03-${'b'.repeat(48)}`, profile: null },
      }),
      { now: FIXED_NOW }
    );
    assert.equal(verifyExecutionManifest(manifest).verified, true);
  });

  it('derives skillSetHash from the REDACTED entries, so a reader can recompute it', () => {
    // The one digest `verifyExecutionManifest` does not cover, so nothing else
    // in this file would notice it being pinned to pre-redaction values.
    const leakedId = `skill-sk-ant-api03-${'c'.repeat(48)}`;
    assert.equal(redactText(leakedId).hits.length, 1, 'fixture id must trip the redactor');
    const manifest = buildExecutionManifest(
      completeSpec({ skills: [{ id: leakedId, version: '1', sha256: 'd'.repeat(64) }] }),
      { now: FIXED_NOW }
    );

    const storedEntries = manifest.skills.entries;
    assert.equal(storedEntries[0].id, redactText(leakedId).text);
    assert.equal(manifest.skills.skillSetHash, sha256Hex(canonicalJson(storedEntries)));

    // Guard the direction of the fix: the pre-redaction derivation is a
    // DIFFERENT value here, so an implementation that hashed before redacting
    // cannot satisfy the assertion above by coincidence.
    const rawEntries = [{ id: leakedId, version: '1', sha256: 'd'.repeat(64) }];
    assert.notEqual(manifest.skills.skillSetHash, sha256Hex(canonicalJson(rawEntries)));
    assert.ok(!JSON.stringify(manifest).includes(leakedId));
  });

  it('folds separators and case before matching a forbidden key name', () => {
    // Same field, three spellings: a guard that only lowercases lets two of
    // them through. Each must be refused by NAME, before any value redaction.
    for (const key of [
      'authorization',
      'password',
      'credentials',
      'cookie',
      'accessToken',
      'access_token',
      'secret',
      'api_key',
      'API-KEY',
      'Api_Key',
    ]) {
      assert.throws(
        () => assertNoRawContext({ [key]: 'anything' }),
        ExecutionManifestError,
        `expected ${key} to be refused`
      );
    }
  });

  it('leaves sha256 digests untouched (hex never trips the entropy fallback)', () => {
    assert.deepEqual(COMPLETE.redaction.hits, []);
    assert.equal(COMPLETE.flow.sha256, 'a'.repeat(64));
    assert.equal(
      COMPLETE.skills.entries.find((s) => s.id === 'a11y-accessible-name').sha256,
      'e'.repeat(64)
    );
  });
});

describe('resolveExecutionManifestSpec — sources this repository actually has', () => {
  it('normalizes every checksum in the real skill manifest', () => {
    // Cross-check against production DATA rather than a hand-written fixture:
    // the `sha256:` prefix is exactly the form docs/data/skill-manifest.json
    // stores, and a resolver that failed to strip it would null every skill
    // hash and silently degrade every manifest to `missing`.
    const manifest = readJson(resolve(REPO_ROOT, 'docs/data/skill-manifest.json'));
    assert.ok(manifest.skills.length > 0);
    for (const skill of manifest.skills) {
      assert.match(normalizeSha256(skill.checksum) ?? '', /^[0-9a-f]{64}$/, skill.id);
    }
  });

  it('joins selected skills to their checksums and reports an unknown skill as unhashed', () => {
    const artifact = {
      trace: { run_id: 'run-1' },
      plan: { selectedSkills: [{ id: 'known' }, { id: 'unknown' }], reviewMode: 'deep' },
      usage: { provider: 'anthropic', model: 'claude-sonnet-4' },
      gate: { inputs: { riskMapDigest: '0123456789abcdef' } },
    };
    const spec = resolveExecutionManifestSpec({
      artifact,
      skillManifest: { skills: [{ id: 'known', checksum: `sha256:${'a'.repeat(64)}` }] },
      riverReviewVersion: '1.91.0',
    });
    assert.deepEqual(
      spec.skills.map((s) => [s.id, s.sha256]),
      [
        ['known', 'a'.repeat(64)],
        ['unknown', null],
      ]
    );
    assert.equal(spec.runtime.provider, 'anthropic');
    assert.equal(spec.runtime.profile, 'deep');
    assert.equal(spec.policy.riskMapDigest, '0123456789abcdef');
    // A skill it could not hash must degrade the whole block, not silently
    // shorten the list.
    const manifest = buildExecutionManifest(spec, { now: FIXED_NOW });
    assert.equal(manifest.skills.status, 'missing');
    assert.equal(manifest.skills.entries.length, 2);
  });

  it('produces missing blocks — never fabricated values — for sources that do not exist yet', () => {
    // The Flow (#2016) and agent (#2014) instance documents now exist, but the
    // resolver reads no file: a caller that supplies neither the document nor
    // a derived pin gets `missing`, never a fabricated value. The supplied
    // route is pinned in "flow pin derivation (#2037)" below.
    const spec = resolveExecutionManifestSpec({ artifact: { trace: { run_id: 'r' } } });
    const manifest = buildExecutionManifest(spec, { now: FIXED_NOW });
    assert.equal(manifest.flow.status, 'missing');
    assert.equal(manifest.flow.id, null);
    assert.equal(manifest.agents.status, 'missing');
    assert.equal(manifest.config.status, 'missing');
    assert.equal(assessReplayability(manifest).deterministic, false);
  });
});

describe('Review Artifact linkage is additive (#2015 AC 4)', () => {
  const validate = compileReviewArtifactValidator();

  const baseArtifact = () => ({
    version: '1',
    timestamp: '2026-09-03T00:00:00.000Z',
    phase: 'midstream',
    status: 'ok',
  });

  it('leaves the artifact untouched when there is no manifest', () => {
    const artifact = baseArtifact();
    const out = attachExecutionManifest(artifact, null);
    assert.deepEqual(Object.keys(out), Object.keys(artifact));
    assert.equal(validate(out), true, JSON.stringify(validate.errors));
  });

  it('attaches without mutating the input artifact', () => {
    const artifact = baseArtifact();
    const out = attachExecutionManifest(artifact, COMPLETE);
    assert.equal(out.executionManifest.manifestId, COMPLETE.manifestId);
    assert.equal('executionManifest' in artifact, false);
  });

  it('validates against schemas/review-artifact.schema.json with the manifest attached', () => {
    const out = attachExecutionManifest(baseArtifact(), COMPLETE);
    assert.equal(validate(out), true, JSON.stringify(validate.errors));
  });

  it('rejects a non-manifest document at the linkage boundary', () => {
    assert.throws(
      () => attachExecutionManifest(baseArtifact(), { kind: 'experiment-manifest' }),
      ExecutionManifestError
    );
  });

  it('artifacts without the field stay valid (older artifacts keep validating)', () => {
    assert.equal(validate(baseArtifact()), true, JSON.stringify(validate.errors));
  });
});

describe('schemas/execution-manifest.schema.json', () => {
  const validate = compileSchemaFile('execution-manifest.schema.json', {
    ajvOptions: { allErrors: true },
  });

  it('accepts both committed fixtures', () => {
    assert.equal(validate(COMPLETE), true, JSON.stringify(validate.errors));
    assert.equal(validate(PARTIAL), true, JSON.stringify(validate.errors));
  });

  it('rejects an unknown top-level field (the document is closed)', () => {
    assert.equal(validate({ ...COMPLETE, prompt: 'leaked' }), false);
  });

  it('rejects a non-empty writeEffects', () => {
    assert.equal(validate({ ...COMPLETE, writeEffects: ['wrote a file'] }), false);
  });

  it('rejects a riskMapDigest of sha256 length (it is a 16-hex truncation)', () => {
    const bad = { ...COMPLETE, policy: { ...COMPLETE.policy, riskMapDigest: 'a'.repeat(64) } };
    assert.equal(validate(bad), false);
  });
});

describe('formatExecutionManifestMarkdown — debug renderer', () => {
  it('states the replay verdict before the block table', () => {
    const md = formatExecutionManifestMarkdown(PARTIAL);
    assert.ok(md.indexOf('Deterministic replay') < md.indexOf('| Block | Status |'));
    assert.match(md, /Deterministic replay: NOT possible/);
    for (const name of PROVENANCE_BLOCKS) assert.ok(md.includes(`| ${name} |`), name);
  });

  it('says a run with no manifest is not replayable', () => {
    assert.match(formatExecutionManifestMarkdown(null), /absent.*NOT replayable/);
  });

  it('surfaces a tampered manifest as a mismatch', () => {
    const tampered = { ...COMPLETE, createdAt: '2020-01-01T00:00:00.000Z' };
    assert.match(formatExecutionManifestMarkdown(tampered), /Integrity: MISMATCH/);
  });
});

describe('flow pin derivation (#2037)', () => {
  // Route chosen: the CALLER passes the parsed Flow document, the resolver
  // hashes it. The rejected alternative — `resolveExecutionManifestSpec`
  // reading the flow directory itself — would break the #2016 observe-mode
  // guarantee pinned in tests/flow-definitions.test.mjs ("no runtime module
  // loads flows/, so no gate or decision changes"), which is what proves that
  // landing the Flow documents cannot move an existing gate. This test file is
  // free to read that directory; only `src/` and `runners/` are scanned.
  const FLOW_DOC = readJson(resolve(FIXTURES, 'flow-document.json'));
  const UNVERSIONED = readJson(resolve(FIXTURES, 'flow-document-unversioned.json'));
  const FLOWS_DIR = resolve(REPO_ROOT, 'flows');
  const ENTRY_MAP = readJson(join(FLOWS_DIR, 'entry-map.json'));

  // Golden, not self-consistent: the digest is written out here, so a change
  // to WHAT is hashed (file bytes instead of canonicalJson, a different
  // helper, an added field) fails even though the module stays internally
  // coherent.
  const GOLDEN_SHA256 = 'c334b807d6bab496c785bd6c21a9f7662ce08a6d3dc616996efdc76ff504ea57';

  it('pins a real Flow document by id, version and canonical-JSON digest', () => {
    const validateFlow = compileFlowValidator();
    assert.ok(validateFlow(FLOW_DOC), JSON.stringify(validateFlow.errors));
    assert.deepEqual(deriveFlowPin(FLOW_DOC), {
      id: 'fixture-review',
      version: '0.1.0',
      sha256: GOLDEN_SHA256,
    });
    // Cross-check against the SSoT derivation itself (CLAUDE.md "Import the
    // SSoT, never re-derive it"): a private sha256 or a private serializer in
    // execution-manifest.mjs would diverge from these two imports.
    assert.equal(deriveFlowPin(FLOW_DOC).sha256, sha256Hex(canonicalJson(FLOW_DOC)));
    assert.notEqual(deriveFlowPin(FLOW_DOC).sha256, sha256Hex(JSON.stringify(FLOW_DOC)));
  });

  it('is insensitive to key order and whitespace, so re-formatting keeps the pin', () => {
    const reordered = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(FLOW_DOC).reverse()), null, 4)
    );
    assert.notDeepEqual(Object.keys(reordered), Object.keys(FLOW_DOC));
    assert.equal(deriveFlowPin(reordered).sha256, GOLDEN_SHA256);
  });

  it('pins every Flow document this repository ships, agreeing with the entry map', () => {
    const files = readdirSync(FLOWS_DIR).filter((name) => name.endsWith('.flow.json'));
    assert.ok(files.length > 0, 'no flow definitions found');
    const byId = new Map();
    for (const file of files) {
      const pin = deriveFlowPin(readJson(join(FLOWS_DIR, file)));
      assert.match(pin.sha256, /^[0-9a-f]{64}$/);
      // Checked BEFORE the insert: `Map.set` overwrites on a repeated key, so
      // a duplicate id would shrink `byId` and every later count would compare
      // against the already-deduplicated total — the test would keep passing
      // while silently covering fewer documents than it claims.
      assert.ok(
        !byId.has(pin.id),
        `${file}: flow id "${pin.id}" is already used by another document`
      );
      byId.set(pin.id, pin);
    }
    // Every document this repository ships is now represented, one per id.
    assert.equal(byId.size, files.length);
    // Two documents must not collide onto one digest, or a pin cannot say
    // which Flow ran.
    assert.equal(new Set([...byId.values()].map((p) => p.sha256)).size, files.length);
    for (const [entryName, entry] of Object.entries(ENTRY_MAP.entries)) {
      const pin = byId.get(entry.flow);
      assert.ok(pin, `${entryName}: no document for flow ${entry.flow}`);
      // The run-time half of the flowVersion check: what the entry pinned is
      // what `deriveFlowPin` accepts as `expectedVersion`.
      assert.deepEqual(
        deriveFlowPin(readJson(join(FLOWS_DIR, `${entry.flow}.flow.json`)), {
          expectedVersion: entry.flowVersion,
        }),
        pin
      );
    }
  });

  it('refuses a document it cannot pin instead of pinning a null', () => {
    const validateFlow = compileFlowValidator();
    // The negative fixture is invalid against the Flow schema too — the two
    // rejections are independent, and neither may be the only one.
    assert.equal(validateFlow(UNVERSIONED), false);
    assert.throws(() => deriveFlowPin(UNVERSIONED), ExecutionManifestError);
    assert.throws(() => deriveFlowPin({ version: '1' }), ExecutionManifestError);
    assert.throws(() => deriveFlowPin(null), ExecutionManifestError);
    assert.throws(() => deriveFlowPin([FLOW_DOC]), ExecutionManifestError);
    assert.throws(() => deriveFlowPin({ id: ' ', version: '1' }), ExecutionManifestError);
  });

  it('rejects a document whose version disagrees with the one the caller resolved', () => {
    assert.equal(deriveFlowPin(FLOW_DOC, { expectedVersion: '0.1.0' }).version, '0.1.0');
    assert.throws(
      () => deriveFlowPin(FLOW_DOC, { expectedVersion: '0.2.0' }),
      /is version 0\.1\.0, but the caller resolved 0\.2\.0/
    );
    // An absent expectation is not an assertion that any version will do — it
    // is the caller declining to state one.
    assert.equal(deriveFlowPin(FLOW_DOC, { expectedVersion: null }).sha256, GOLDEN_SHA256);
    assert.equal(deriveFlowPin(FLOW_DOC, { expectedVersion: undefined }).sha256, GOLDEN_SHA256);
  });

  it('refuses an expectation it cannot compare instead of dropping it', () => {
    // The fail-open shape this guards: `nonEmptyString` answers null for a
    // number, an empty string and a blank string alike, so folding those into
    // the "no expectation" branch made `expectedVersion: 2` pin a document of
    // any version without complaint. Each of these states an expectation, so
    // each must be rejected rather than discarded.
    for (const bad of [2, '', '   ', true, {}, ['0.1.0']]) {
      assert.throws(
        () => deriveFlowPin(FLOW_DOC, { expectedVersion: bad }),
        /expectedVersion must be a non-empty string/,
        `expectedVersion: ${JSON.stringify(bad)} was accepted`
      );
    }
    // The equivalent asymmetry one level up: an expectation with nothing to
    // check it against (a pre-derived pin, or no flow input at all).
    assert.throws(
      () =>
        resolveExecutionManifestSpec({
          flow: { id: 'p', version: '1', sha256: 'a'.repeat(64) },
          expectedFlowVersion: '9',
        }),
      /expectedFlowVersion requires flowDocument/
    );
    assert.throws(
      () => resolveExecutionManifestSpec({ expectedFlowVersion: '9' }),
      /expectedFlowVersion requires flowDocument/
    );
  });

  it('refuses a spec that carries both a derived pin and a document', () => {
    assert.throws(
      () =>
        resolveExecutionManifestSpec({
          flow: { id: 'x', version: '1', sha256: 'a'.repeat(64) },
          flowDocument: FLOW_DOC,
        }),
      /either flow or flowDocument/
    );
  });

  it('reaches deterministic replay once the caller supplies the Flow document (AC 3)', () => {
    const artifact = {
      trace: { run_id: '2026-09-04T00-00-00-000Z-abc123' },
      plan: { selectedSkills: [{ id: 'known', version: '1' }], reviewMode: 'deep' },
      usage: { provider: 'anthropic', model: 'claude-sonnet-4' },
      gate: { inputs: { riskMapDigest: '0123456789abcdef' } },
    };
    const common = {
      artifact,
      riverReviewVersion: '1.93.0',
      plugin: { host: 'claude-code', pluginVersion: '1.93.0' },
      skillManifest: { skills: [{ id: 'known', checksum: `sha256:${'a'.repeat(64)}` }] },
      artifacts: { plan: { sha256: 'b'.repeat(64) } },
      policy: { ref: 'pages/reference/review-policy.md', sha256: 'c'.repeat(64) },
      configSha256: 'd'.repeat(64),
    };

    // Negative: the same run WITHOUT the document is exactly what #2037
    // reports — every run stuck at deterministic: false.
    const withoutFlow = buildExecutionManifest(resolveExecutionManifestSpec(common), {
      now: FIXED_NOW,
    });
    assert.equal(withoutFlow.flow.status, 'missing');
    assert.equal(withoutFlow.flow.sha256, null);
    assert.equal(assessReplayability(withoutFlow).deterministic, false);

    // Positive: one added argument, and the run is deterministically
    // replayable. The document is the real one this repository ships, so the
    // route is exercised end to end rather than on a hand-made object.
    const realFlow = readJson(join(FLOWS_DIR, 'plan-review.flow.json'));
    const withFlow = buildExecutionManifest(
      resolveExecutionManifestSpec({
        ...common,
        flowDocument: realFlow,
        expectedFlowVersion: ENTRY_MAP.entries['review-plan'].flowVersion,
      }),
      { now: FIXED_NOW }
    );
    assert.equal(withFlow.flow.status, 'resolved');
    assert.equal(withFlow.flow.id, 'plan-review');
    assert.equal(withFlow.flow.version, realFlow.version);
    assert.match(withFlow.flow.sha256, /^[0-9a-f]{64}$/);
    const replay = assessReplayability(withFlow);
    assert.equal(replay.deterministic, true);
    assert.deepEqual(replay.missingBlocks.deterministic, []);
    // Judgment replay is a strictly larger requirement and this run records no
    // agent roster, so it stays false — the flow pin fixes deterministic
    // replay only, which is what #2037 is about.
    assert.equal(replay.judgment, false);
    assert.deepEqual(replay.missingBlocks.judgment, ['agents']);
    assert.equal(verifyExecutionManifest(withFlow).verified, true);
  });

  it('keeps the #2016 observe-mode guarantee: the resolver never loads the directory', () => {
    // Measured with the same scanner #2016 pins, not with a fresh regexp: the
    // chosen route is only valid while this stays false.
    const source = readFileSync(resolve(REPO_ROOT, 'src', 'lib', 'execution-manifest.mjs'), 'utf8');
    assert.equal(referencesFlowsDirectory(source), false);
  });
});
