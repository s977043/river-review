// `river promote propose` — stable CLI + content-addressed candidate id
// (#1624 / #1574 P0 contract 4).
//
// The core property under test is idempotent convergence: proposing twice from
// the same evidence must yield exactly one candidate with the same id.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempMemory } from './helpers/memory.mjs';
import { loadMemory } from '../src/lib/riverbed-memory.mjs';
import {
  CANDIDATE_POLICY_VERSION,
  buildProposedCandidate,
  computeCandidateContentHash,
  normalizeEvidence,
} from '../src/lib/promotion-candidates.mjs';

const CLUSTER = 'repository-layer-boundary::false_positive';
const NOW = '2026-07-20T00:00:00.000Z';

const feedback = (pr, fingerprint) => ({
  timestamp: `2026-07-1${pr}T00:00:00.000Z`,
  trigger: 'pr-comment',
  feedbackType: 'false_positive',
  skillId: 'repository-layer-boundary',
  findingFingerprint: fingerprint ?? null,
  evidence: `PR #${pr} の指摘は誤検出`,
  pr,
});

const ENTRIES = [feedback(1, 'a'.repeat(16)), feedback(2, 'b'.repeat(16))];

/** Seed a temp Riverbed index plus an input JSONL file. */
function seed(entries = ENTRIES) {
  const { cleanup, dir, indexPath } = createTempMemory({
    layout: 'flat',
    prefix: 'rr-cli-propose-',
  });
  const inputPath = join(dir, 'candidate-feedback.jsonl');
  writeFileSync(inputPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  return { cleanup, dir, indexPath, inputPath };
}

function proposeArgs(indexPath, inputPath, extra = []) {
  return [
    'promote',
    'propose',
    '--input',
    inputPath,
    '--cluster-key',
    CLUSTER,
    '--index',
    indexPath,
    '--output',
    'json',
    ...extra,
  ];
}

const env = { RIVER_NOW: NOW };

describe('river promote propose', () => {
  test('creates a content-addressed candidate from an explicit JSONL selection', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.created, true);
    assert.equal(out.clusterKey, CLUSTER);
    assert.equal(out.policyVersion, CANDIDATE_POLICY_VERSION);
    assert.equal(out.shadowOnly, false);
    assert.match(out.candidateId, /^RR-PC-[0-9a-f]{12}$/);
    assert.ok(out.contentHash.startsWith(out.candidateId.slice('RR-PC-'.length)));
    assert.equal(out.entry.context.promotionCandidate.promotionStatus, 'candidate');
    assert.equal(out.entry.context.promotionCandidate.recurrenceCount, 2);
    const index = loadMemory(indexPath);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0].id, out.candidateId);
  });

  test('re-running with the same evidence converges on one candidate (idempotent)', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const first = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(first.code, 0, first.stderr);
    // A later run on a different day must not mint a second candidate: the id
    // is derived from evidence, not from the date.
    const second = await runCliInProcess(proposeArgs(indexPath, inputPath), {
      env: { RIVER_NOW: '2026-09-01T00:00:00.000Z' },
    });
    assert.equal(second.code, 0, second.stderr);
    const a = JSON.parse(first.stdout);
    const b = JSON.parse(second.stdout);
    assert.equal(a.candidateId, b.candidateId);
    assert.equal(b.created, false);
    assert.equal(b.wouldCreate, false);
    assert.equal(b.existing.candidateId, a.candidateId);
    assert.equal(b.existing.promotionStatus, 'candidate');
    const index = loadMemory(indexPath);
    assert.equal(index.entries.length, 1);
  });

  test('evidence order in the input file does not change the candidate id', async (t) => {
    const first = seed(ENTRIES);
    const second = seed([...ENTRIES].reverse());
    t.after(first.cleanup);
    t.after(second.cleanup);
    const a = await runCliInProcess(proposeArgs(first.indexPath, first.inputPath), { env });
    const b = await runCliInProcess(proposeArgs(second.indexPath, second.inputPath), { env });
    assert.equal(a.code, 0, a.stderr);
    assert.equal(b.code, 0, b.stderr);
    assert.equal(JSON.parse(a.stdout).candidateId, JSON.parse(b.stdout).candidateId);
  });

  test('--dry-run reports the candidate without writing the index', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath, ['--dry-run']), { env });
    assert.equal(res.code, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.created, false);
    assert.equal(out.wouldCreate, true);
    assert.equal(out.dryRun, true);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('an explicit known --policy-version is accepted', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const base = await runCliInProcess(proposeArgs(indexPath, inputPath, ['--dry-run']), { env });
    const explicit = await runCliInProcess(
      proposeArgs(indexPath, inputPath, [
        '--dry-run',
        '--policy-version',
        CANDIDATE_POLICY_VERSION,
      ]),
      { env }
    );
    assert.equal(base.code, 0, base.stderr);
    assert.equal(explicit.code, 0, explicit.stderr);
    assert.equal(JSON.parse(base.stdout).candidateId, JSON.parse(explicit.stdout).candidateId);
  });

  test('fingerprint-less evidence is marked shadow-only', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([feedback(1), feedback(2)]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(JSON.parse(res.stdout).shadowOnly, true);
  });

  test('text output prints the candidate summary', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      ['promote', 'propose', '--input', inputPath, '--cluster-key', CLUSTER, '--index', indexPath],
      { env }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /Created promotion candidate RR-PC-[0-9a-f]{12}\./);
    assert.match(res.stdout, /clusterKey:\s+repository-layer-boundary::false_positive/);
  });
});

describe('river promote propose validation', () => {
  test('missing --input / --cluster-key is a usage error (exit 1)', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const noCluster = await runCliInProcess(
      ['promote', 'propose', '--input', inputPath, '--index', indexPath],
      { env }
    );
    assert.equal(noCluster.code, 1);
    assert.match(noCluster.stderr, /requires --input .* and --cluster-key/);
  });

  test('entries outside --cluster-key are rejected instead of filtered', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([
      ...ENTRIES,
      { ...feedback(3, 'c'.repeat(16)), skillId: 'other-skill' },
    ]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /outside --cluster-key/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('a cluster below the minimum recurrence is rejected', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([feedback(1, 'a'.repeat(16))]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /below the minimum recurrence/);
  });

  test('a malformed cluster key is rejected', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      ['promote', 'propose', '--input', inputPath, '--cluster-key', 'nope', '--index', indexPath],
      { env }
    );
    assert.equal(res.code, 1);
    assert.match(res.stderr, /--cluster-key must be/);
  });

  test('an unreadable --input is an error, not a silent empty proposal', async (t) => {
    const { cleanup, indexPath, dir } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, join(dir, 'missing.jsonl')), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Cannot read --input/);
  });
});

describe('river promote propose input validation (schema invariants)', () => {
  test('a schema-violating findingFingerprint is rejected with a line number', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2), findingFingerprint: 'NOT-A-HEX' },
    ]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 1);
    assert.match(
      res.stderr,
      /at line 2: findingFingerprint must be 16 lowercase hex chars or null/
    );
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('an unknown feedbackType in the input is rejected', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2, 'b'.repeat(16)), feedbackType: 'made_up' },
    ]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /at line 2: feedbackType "made_up" is not one of/);
  });

  test('a non-integer pr and an empty skillId are rejected', async (t) => {
    const badPr = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2, 'b'.repeat(16)), pr: 'two' },
    ]);
    const badSkill = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2, 'b'.repeat(16)), skillId: '  ' },
    ]);
    t.after(badPr.cleanup);
    t.after(badSkill.cleanup);
    const a = await runCliInProcess(proposeArgs(badPr.indexPath, badPr.inputPath), { env });
    const b = await runCliInProcess(proposeArgs(badSkill.indexPath, badSkill.inputPath), { env });
    assert.equal(a.code, 1);
    assert.match(a.stderr, /pr must be a positive integer or null/);
    assert.equal(b.code, 1);
    assert.match(b.stderr, /skillId must be a non-empty string/);
  });

  test('an over-long or control-character skillId is rejected', async (t) => {
    const tooLong = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2, 'b'.repeat(16)), skillId: 'x'.repeat(201) },
    ]);
    const control = seed([
      feedback(1, 'a'.repeat(16)),
      { ...feedback(2, 'b'.repeat(16)), skillId: 'skill\u0000id' },
    ]);
    t.after(tooLong.cleanup);
    t.after(control.cleanup);
    const a = await runCliInProcess(proposeArgs(tooLong.indexPath, tooLong.inputPath), { env });
    const b = await runCliInProcess(proposeArgs(control.indexPath, control.inputPath), { env });
    assert.equal(a.code, 1);
    assert.match(a.stderr, /skillId must be at most 200 characters/);
    assert.equal(b.code, 1);
    assert.match(b.stderr, /skillId must contain only letters/);
    assert.deepEqual(loadMemory(tooLong.indexPath).entries, []);
    assert.deepEqual(loadMemory(control.indexPath).entries, []);
  });

  test('an unknown option is rejected instead of silently ignored', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    // A typo of --dry-run must not fall through and write the index for real.
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath, ['--dry-rnu']), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /unknown option for promote: --dry-rnu/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('an unknown feedbackType in --cluster-key is rejected', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      [
        'promote',
        'propose',
        '--input',
        inputPath,
        '--cluster-key',
        'repository-layer-boundary::flase_positive',
        '--index',
        indexPath,
      ],
      { env }
    );
    assert.equal(res.code, 1);
    assert.match(res.stderr, /feedbackType "flase_positive" is unknown/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('an unknown --policy-version is rejected (no unbounded candidate minting)', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      proposeArgs(indexPath, inputPath, ['--policy-version', '99']),
      { env }
    );
    assert.equal(res.code, 1);
    assert.match(res.stderr, /--policy-version "99" is unknown/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });
});

describe('river promote propose recurrence counting', () => {
  test('duplicated evidence rows do not satisfy the minimum recurrence', async (t) => {
    const duplicated = feedback(1, 'a'.repeat(16));
    const { cleanup, indexPath, inputPath } = seed([duplicated, { ...duplicated }]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /1 unique evidence item \(2 input rows, 1 duplicate removed\)/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('recurrenceCount and stored evidence use the deduplicated set', async (t) => {
    const { cleanup, indexPath, inputPath } = seed([
      feedback(1, 'a'.repeat(16)),
      feedback(1, 'a'.repeat(16)),
      feedback(2, 'b'.repeat(16)),
    ]);
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.evidenceCount, 2);
    assert.equal(out.duplicatesRemoved, 1);
    assert.equal(out.entry.context.promotionCandidate.recurrenceCount, 2);
    assert.equal(out.entry.context.promotionCandidate.evidence.length, 2);
    assert.match(res.stderr, /1 duplicate evidence row/);
  });

  test('a non-numeric --threshold suffix is rejected, not silently truncated', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    // parseInt('2garbage') === 2, which would silently apply a threshold the
    // caller never typed.
    const res = await runCliInProcess(
      proposeArgs(indexPath, inputPath, ['--threshold', '2garbage']),
      {
        env,
      }
    );
    // Invalid flag values route to help with an explanatory stderr line, the
    // same behavior as --approver/--reason (see cli-promote-retire.test.mjs).
    assert.match(res.stderr, /--threshold option requires a positive integer/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });

  test('--threshold overrides the minimum recurrence instead of being ignored', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath, ['--threshold', '3']), {
      env,
    });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /below the minimum recurrence of 3/);
    assert.deepEqual(loadMemory(indexPath).entries, []);
  });
});

describe('river promote propose convergence audit', () => {
  test('contentHash and policyVersion are persisted on the entry', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(res.code, 0, res.stderr);
    const stored = loadMemory(indexPath).entries[0].context.promotionCandidate;
    assert.equal(stored.contentHash, JSON.parse(res.stdout).contentHash);
    assert.equal(stored.policyVersion, CANDIDATE_POLICY_VERSION);
    assert.equal(`RR-PC-${stored.contentHash.slice(0, 12)}`, loadMemory(indexPath).entries[0].id);
  });

  test('a stored entry with a colliding id but different contentHash is fatal', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const first = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(first.code, 0, first.stderr);
    // Simulate a 12-hex truncation collision: same id, different full hash.
    const index = loadMemory(indexPath);
    index.entries[0].context.promotionCandidate.contentHash = 'f'.repeat(64);
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
    const second = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(second.code, 1);
    assert.match(second.stderr, /already exists with a different contentHash/);
    assert.equal(loadMemory(indexPath).entries.length, 1);
  });

  test('converging on an entry with a differing recurrenceCount is reported', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const first = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(first.code, 0, first.stderr);
    const index = loadMemory(indexPath);
    index.entries[0].context.promotionCandidate.recurrenceCount = 5;
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
    const second = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stderr, /input had 2 evidence, stored has 5 — not updated/);
    assert.equal(JSON.parse(second.stdout).created, false);
  });

  test('an unrelated entry sharing the id is not treated as the candidate', async (t) => {
    const { cleanup, indexPath, inputPath } = seed();
    t.after(cleanup);
    const dry = await runCliInProcess(proposeArgs(indexPath, inputPath, ['--dry-run']), { env });
    const candidateId = JSON.parse(dry.stdout).candidateId;
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          version: '1',
          entries: [
            {
              id: candidateId,
              type: 'suppression',
              content: 'unrelated',
              status: 'active',
              metadata: { createdAt: NOW, author: 'test' },
            },
          ],
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    const res = await runCliInProcess(proposeArgs(indexPath, inputPath), { env });
    // The id matches but the type does not, so propose still creates the
    // candidate (and appendEntry surfaces the real id clash as an error).
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Cannot write candidate .*Duplicate entry ID/);
  });
});

describe('candidate content hash', () => {
  test('normalizeEvidence sorts, deduplicates and flags missing fingerprints', () => {
    const withFp = normalizeEvidence([feedback(2, 'b'.repeat(16)), feedback(1, 'a'.repeat(16))]);
    assert.equal(withFp.fingerprintless, false);
    assert.deepEqual(
      withFp.evidence.map((e) => e.findingFingerprint),
      ['a'.repeat(16), 'b'.repeat(16)]
    );
    const duplicated = normalizeEvidence([
      feedback(1, 'a'.repeat(16)),
      feedback(1, 'a'.repeat(16)),
    ]);
    assert.equal(duplicated.evidence.length, 1);
    assert.equal(normalizeEvidence([feedback(1)]).fingerprintless, true);
  });

  test('the hash ignores wall-clock time but tracks the evidence set', () => {
    const build = (now, entries = ENTRIES) =>
      buildProposedCandidate({ entries, clusterKey: CLUSTER, now: new Date(now) });
    assert.equal(
      build('2026-07-20T00:00:00.000Z').candidateId,
      build('2027-01-01T12:34:56.000Z').candidateId
    );
    assert.notEqual(
      build('2026-07-20T00:00:00.000Z').candidateId,
      build('2026-07-20T00:00:00.000Z', [...ENTRIES, feedback(3, 'c'.repeat(16))]).candidateId
    );
  });

  test('computeCandidateContentHash is stable for the fixed canonical triple', () => {
    const { evidence } = normalizeEvidence(ENTRIES);
    const first = computeCandidateContentHash({ clusterKey: CLUSTER, evidence });
    const second = computeCandidateContentHash({ clusterKey: CLUSTER, evidence });
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(first.candidateId, `RR-PC-${first.contentHash.slice(0, 12)}`);
    // policyVersion participates in the hash (the CLI restricts which versions
    // may be requested, but the derivation itself is version-sensitive).
    assert.notEqual(
      first.contentHash,
      computeCandidateContentHash({ clusterKey: CLUSTER, evidence, policyVersion: '2' }).contentHash
    );
  });

  test('NFC and NFD spellings of the same evidence hash identically', () => {
    const nfd = ENTRIES.map((e) => ({ ...e, timestamp: e.timestamp.normalize('NFD') }));
    assert.equal(
      buildProposedCandidate({ entries: ENTRIES, clusterKey: CLUSTER, now: new Date(NOW) })
        .candidateId,
      buildProposedCandidate({ entries: nfd, clusterKey: CLUSTER, now: new Date(NOW) }).candidateId
    );
  });

  test('the hash does not depend on key insertion order (canonical JSON)', () => {
    const { evidence } = normalizeEvidence(ENTRIES);
    // Same data, keys inserted in reverse order.
    const shuffled = evidence.map((item) => Object.fromEntries(Object.entries(item).reverse()));
    assert.equal(
      computeCandidateContentHash({ clusterKey: CLUSTER, evidence }).contentHash,
      computeCandidateContentHash({ clusterKey: CLUSTER, evidence: shuffled }).contentHash
    );
  });
});

describe('candidate contentHash round-trip (re-derivable from the stored entry)', () => {
  /** Re-derive the hash from what the entry actually persists. */
  const rederive = (built) =>
    computeCandidateContentHash({
      clusterKey: built.clusterKey,
      evidence: built.entry.context.promotionCandidate.evidence,
      policyVersion: built.entry.context.promotionCandidate.policyVersion,
    });

  test('fingerprinted evidence: stored evidence re-derives the same contentHash', () => {
    const built = buildProposedCandidate({
      entries: ENTRIES,
      clusterKey: CLUSTER,
      now: new Date(NOW),
    });
    const again = rederive(built);
    assert.equal(again.contentHash, built.contentHash);
    assert.equal(again.candidateId, built.candidateId);
    assert.equal(again.candidateId, built.entry.id);
  });

  test('fingerprintless evidence: timestamps survive so the hash still re-derives', () => {
    const entries = [feedback(1), feedback(2)];
    const built = buildProposedCandidate({
      entries,
      clusterKey: CLUSTER,
      now: new Date(NOW),
    });
    const stored = built.entry.context.promotionCandidate;
    assert.equal(built.shadowOnly, true);
    // Two rows must stay two: without the timestamp they would collapse into a
    // single duplicate and contradict recurrenceCount.
    assert.equal(stored.evidence.length, 2);
    assert.equal(stored.recurrenceCount, 2);
    assert.deepEqual(
      stored.evidence.map((e) => e.timestamp),
      entries.map((e) => e.timestamp).sort()
    );
    assert.equal(rederive(built).contentHash, built.contentHash);
  });

  test('a non-string timestamp on fingerprintless evidence is rejected', () => {
    assert.throws(
      () =>
        buildProposedCandidate({
          entries: [feedback(1), { ...feedback(2), timestamp: { year: 2026 } }],
          clusterKey: CLUSTER,
          now: new Date(NOW),
        }),
      /must carry a string timestamp/
    );
  });
});
