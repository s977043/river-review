import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import { buildPromotionCandidateEntry } from '../scripts/feedback-rule-candidates.mjs';
import { loadMemory } from '../src/lib/riverbed-memory.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempMemory } from './helpers/memory.mjs';

const NOW = '2026-10-04T14:30:00.000Z';
const CONTENT_HASH = 'a'.repeat(64);
const EXPERIMENT_KEY = 'b'.repeat(64);
const MANIFEST_HASH = 'c'.repeat(64);

function candidate() {
  const entry = buildPromotionCandidateEntry({
    skillId: 'skill-a',
    feedbackType: 'false_positive',
    group: [
      { pr: 1, findingFingerprint: null, feedbackType: 'false_positive' },
      { pr: 2, findingFingerprint: null, feedbackType: 'false_positive' },
    ],
    now: new Date('2026-10-01T00:00:00.000Z'),
  });
  entry.id = `RR-PC-${CONTENT_HASH.slice(0, 12)}`;
  entry.context.promotionCandidate.contentHash = CONTENT_HASH;
  entry.context.promotionCandidate.promotionStatus = 'candidate';
  return entry;
}

function artifact(entry, overrides = {}) {
  return {
    schemaVersion: 1,
    mode: 'paired-replay',
    readOnly: true,
    writeEffects: [],
    promotionHandoff: {
      candidateId: entry.id,
      candidateContentHash: CONTENT_HASH,
      manifestId: `RR-EXP-${EXPERIMENT_KEY.slice(0, 12)}`,
      experimentKey: EXPERIMENT_KEY,
      manifestHash: MANIFEST_HASH,
      manifestVerified: true,
      experimentKeyMatchesInputs: true,
      activationVerified: true,
      activationReasons: [],
      pairingWarnings: [],
      acceptanceEvaluable: true,
      evaluatedOn: 'overall',
      profiles: [],
      criticalRegressionCount: 0,
      overallCriticalRegressionCount: 0,
      independentVerifierVerified: false,
      terminalReason: 'success',
      requiresHumanJudgment: true,
      writeEffects: [],
      ...overrides,
    },
  };
}

function seed() {
  const entry = candidate();
  const mem = createTempMemory({ layout: 'flat', entries: [entry], prefix: 'promote-replay-' });
  const inputPath = join(mem.dir, 'paired-replay.json');
  writeFileSync(inputPath, JSON.stringify(artifact(entry), null, 2), 'utf8');
  return { ...mem, entry, inputPath };
}

function args(entry, indexPath, inputPath, extra = []) {
  return [
    'promote',
    'attach-replay',
    entry.id,
    '--input',
    inputPath,
    '--approver',
    'alice',
    '--reason',
    'paired replay reviewed',
    '--index',
    indexPath,
    '--output',
    'json',
    ...extra,
  ];
}

describe('river promote attach-replay', () => {
  test('attaches replay evidence without approving the candidate', async (t) => {
    const seeded = seed();
    t.after(seeded.cleanup);

    const res = await runCliInProcess(args(seeded.entry, seeded.indexPath, seeded.inputPath), {
      env: { RIVER_NOW: NOW },
    });
    assert.equal(res.code, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.changed, true);
    assert.equal(out.candidateId, seeded.entry.id);
    assert.equal(out.manifestHash, MANIFEST_HASH);
    assert.equal(out.attachedBy, 'alice');

    const stored = loadMemory(seeded.indexPath).entries[0];
    assert.equal(stored.context.experimentHistory.length, 1);
    assert.equal(stored.context.promotionCandidate.promotionStatus, 'candidate');
    assert.equal(stored.context.approval, undefined);
    assert.equal(stored.context.effectiveness, undefined);
  });

  test('same replay is an idempotent no-op', async (t) => {
    const seeded = seed();
    t.after(seeded.cleanup);
    const argv = args(seeded.entry, seeded.indexPath, seeded.inputPath);

    const first = await runCliInProcess(argv, { env: { RIVER_NOW: NOW } });
    const second = await runCliInProcess(argv, {
      env: { RIVER_NOW: '2026-10-05T00:00:00.000Z' },
    });

    assert.equal(first.code, 0, first.stderr);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).changed, false);
    assert.equal(loadMemory(seeded.indexPath).entries[0].context.experimentHistory.length, 1);
  });

  test('fails closed when the replay belongs to different candidate content', async (t) => {
    const seeded = seed();
    t.after(seeded.cleanup);
    writeFileSync(
      seeded.inputPath,
      JSON.stringify(artifact(seeded.entry, { candidateContentHash: 'd'.repeat(64) }), null, 2),
      'utf8'
    );

    const res = await runCliInProcess(args(seeded.entry, seeded.indexPath, seeded.inputPath), {
      env: { RIVER_NOW: NOW },
    });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /contentHash mismatch/);
    assert.equal(loadMemory(seeded.indexPath).entries[0].context.experimentHistory, undefined);
  });

  test('requires explicit human attribution and reason', async (t) => {
    const seeded = seed();
    t.after(seeded.cleanup);
    const base = [
      'promote',
      'attach-replay',
      seeded.entry.id,
      '--input',
      seeded.inputPath,
      '--index',
      seeded.indexPath,
    ];

    const noApprover = await runCliInProcess([...base, '--reason', 'reviewed']);
    assert.equal(noApprover.code, 1);
    assert.match(noApprover.stderr, /requires --approver/);

    const noReason = await runCliInProcess([...base, '--approver', 'alice']);
    assert.equal(noReason.code, 1);
    assert.match(noReason.stderr, /requires --reason/);
  });

  test('rejects attachment after approval', async (t) => {
    const seeded = seed();
    t.after(seeded.cleanup);
    const index = loadMemory(seeded.indexPath);
    index.entries[0].context.promotionCandidate.promotionStatus = 'approved';
    writeFileSync(seeded.indexPath, JSON.stringify(index, null, 2), 'utf8');

    const res = await runCliInProcess(args(seeded.entry, seeded.indexPath, seeded.inputPath), {
      env: { RIVER_NOW: NOW },
    });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /not pre-adoption/);
  });
});
