import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import {
  applyPromotionReplayAttachment,
  attachPromotionReplayEvidence,
} from '../src/lib/promotion.mjs';
import { buildPromotionCandidateEntry } from '../src/lib/promotion-candidates.mjs';
import { loadMemory } from '../src/lib/riverbed-memory.mjs';
import { compileRiverbedIndexValidator } from './helpers/schema-validator.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempMemory } from './helpers/memory.mjs';

const validate = compileRiverbedIndexValidator();
const CONTENT_HASH = 'a'.repeat(64);
const EXPERIMENT_KEY = 'b'.repeat(64);
const MANIFEST_HASH = 'c'.repeat(64);
const MANIFEST_ID = `RR-EXP-${EXPERIMENT_KEY.slice(0, 12)}`;
const CANDIDATE_ID = `RR-PC-${CONTENT_HASH.slice(0, 12)}`;
const ATTACHED_AT = new Date('2026-10-04T14:20:00.000Z');

function makeCandidate() {
  const entry = buildPromotionCandidateEntry({
    skillId: 'river-review-code',
    feedbackType: 'false_positive',
    group: [
      { pr: 1, findingFingerprint: '0123456789abcdef', feedbackType: 'false_positive' },
      { pr: 2, findingFingerprint: 'fedcba9876543210', feedbackType: 'false_positive' },
    ],
    id: CANDIDATE_ID,
    now: new Date('2026-10-04T13:00:00.000Z'),
  });
  entry.context.promotionCandidate.contentHash = CONTENT_HASH;
  entry.context.promotionCandidate.policyVersion = 'test';
  return entry;
}

function makeReplay(overrides = {}) {
  const replay = {
    schemaVersion: 1,
    mode: 'paired-replay',
    readOnly: true,
    manifest: {
      manifestId: MANIFEST_ID,
      experimentKey: EXPERIMENT_KEY,
      manifestHash: MANIFEST_HASH,
    },
    manifestVerification: {
      verified: true,
      experimentKeyMatchesInputs: true,
    },
    activationCheck: { verified: true },
    acceptance: {
      evaluable: true,
      decision: null,
      applied: false,
      autoPromotion: false,
    },
    metrics: {
      overall: { criticalRegressionCount: 0 },
    },
    promotionHandoff: {
      candidateId: CANDIDATE_ID,
      candidateContentHash: CONTENT_HASH,
      manifestId: MANIFEST_ID,
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
    },
    terminalReason: 'success',
    requiresHumanApproval: true,
    writeEffects: [],
  };
  return { ...replay, ...overrides };
}

describe('applyPromotionReplayAttachment', () => {
  test('attaches pre-adoption replay evidence without changing judgment state', () => {
    const entry = makeCandidate();
    const beforeStatus = entry.context.promotionCandidate.promotionStatus;

    const result = applyPromotionReplayAttachment(entry, {
      replay: makeReplay(),
      approver: 'alice',
      reason: 'paired replay reviewed',
      now: ATTACHED_AT,
    });

    assert.equal(result.changed, true);
    assert.equal(entry.context.promotionCandidate.promotionStatus, beforeStatus);
    assert.equal(entry.context.approval, undefined);
    assert.equal(entry.context.effectiveness, undefined);
    assert.equal(entry.context.experimentHistory.length, 1);
    assert.deepEqual(result.record.candidateTargetAtAttachment, {
      kind: entry.context.promotionCandidate.proposedTarget.kind,
      id: entry.context.promotionCandidate.proposedTarget.id ?? null,
    });
    assert.equal(result.record.handoff.manifestHash, MANIFEST_HASH);
    assert.equal(entry.metadata.updatedAt, ATTACHED_AT.toISOString());
    assert.equal(
      validate({ version: '1', entries: [entry] }),
      true,
      JSON.stringify(validate.errors, null, 2)
    );
  });

  test('same manifestHash is idempotent', () => {
    const entry = makeCandidate();
    const opts = {
      replay: makeReplay(),
      approver: 'alice',
      reason: 'paired replay reviewed',
      now: ATTACHED_AT,
    };
    const first = applyPromotionReplayAttachment(entry, opts);
    const second = applyPromotionReplayAttachment(entry, {
      ...opts,
      approver: 'bob',
      reason: 'duplicate invocation',
      now: new Date('2026-10-04T15:00:00.000Z'),
    });

    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(entry.context.experimentHistory.length, 1);
    assert.equal(second.record.attachedBy, 'alice');
  });

  test('rejects candidate id and content hash mismatches', () => {
    const entry = makeCandidate();
    assert.throws(
      () =>
        applyPromotionReplayAttachment(entry, {
          replay: makeReplay({
            promotionHandoff: {
              ...makeReplay().promotionHandoff,
              candidateId: 'RR-PC-deadbeefdead',
            },
          }),
          approver: 'alice',
          reason: 'x',
        }),
      /candidateId mismatch/
    );

    assert.throws(
      () =>
        applyPromotionReplayAttachment(entry, {
          replay: makeReplay({
            promotionHandoff: {
              ...makeReplay().promotionHandoff,
              candidateContentHash: 'd'.repeat(64),
            },
          }),
          approver: 'alice',
          reason: 'x',
        }),
      /candidateContentHash/
    );
  });

  test('rejects legacy candidates and null handoffs', () => {
    const legacy = makeCandidate();
    delete legacy.context.promotionCandidate.contentHash;
    assert.throws(
      () =>
        applyPromotionReplayAttachment(legacy, {
          replay: makeReplay(),
          approver: 'alice',
          reason: 'x',
        }),
      /legacy candidates/
    );

    const entry = makeCandidate();
    assert.throws(
      () =>
        applyPromotionReplayAttachment(entry, {
          replay: makeReplay({ promotionHandoff: null }),
          approver: 'alice',
          reason: 'x',
        }),
      /no usable promotionHandoff/
    );
  });

  test('rejects attachment after approval and other non-pre-adoption states', () => {
    for (const status of ['approved', 'active', 'needs_review', 'superseded', 'archived']) {
      const entry = makeCandidate();
      entry.context.promotionCandidate.promotionStatus = status;
      if (status === 'superseded' || status === 'archived') entry.status = status;
      assert.throws(
        () =>
          applyPromotionReplayAttachment(entry, {
            replay: makeReplay(),
            approver: 'alice',
            reason: 'x',
          }),
        /not in a pre-adoption state/,
        status
      );
    }
  });

  test('rejects a handoff that disagrees with its replay artifact', () => {
    const entry = makeCandidate();
    assert.throws(
      () =>
        applyPromotionReplayAttachment(entry, {
          replay: makeReplay({
            manifest: {
              manifestId: MANIFEST_ID,
              experimentKey: EXPERIMENT_KEY,
              manifestHash: 'd'.repeat(64),
            },
          }),
          approver: 'alice',
          reason: 'x',
        }),
      /manifestHash does not match/
    );
  });
});

describe('attachPromotionReplayEvidence', () => {
  test('persists once and returns no-op on duplicate attachment', (t) => {
    const entry = makeCandidate();
    const { indexPath, cleanup } = createTempMemory({ layout: 'flat', entries: [entry] });
    t.after(cleanup);

    const opts = {
      indexPath,
      id: entry.id,
      replay: makeReplay(),
      approver: 'alice',
      reason: 'paired replay reviewed',
      now: ATTACHED_AT,
    };
    assert.equal(attachPromotionReplayEvidence(opts).changed, true);
    assert.equal(attachPromotionReplayEvidence(opts).changed, false);

    const stored = loadMemory(indexPath).entries[0];
    assert.equal(stored.context.experimentHistory.length, 1);
    assert.equal(stored.context.promotionCandidate.promotionStatus, 'candidate');
  });
});

describe('river promote attach-replay', () => {
  test('attaches replay evidence through the CLI without approving the candidate', async (t) => {
    const entry = makeCandidate();
    const { dir, indexPath, cleanup } = createTempMemory({ layout: 'flat', entries: [entry] });
    t.after(cleanup);
    const replayPath = join(dir, 'paired-replay.json');
    writeFileSync(replayPath, JSON.stringify(makeReplay()), 'utf8');

    const result = await runCliInProcess(
      [
        'promote',
        'attach-replay',
        entry.id,
        '--input',
        replayPath,
        '--index',
        indexPath,
        '--approver',
        'alice',
        '--reason',
        'reviewed experiment evidence',
        '--output',
        'json',
      ],
      { cwd: dir, env: { RIVER_NOW: ATTACHED_AT.toISOString() } }
    );

    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.changed, true);
    assert.equal(output.promotionStatus, 'candidate');

    const stored = loadMemory(indexPath).entries[0];
    assert.equal(stored.context.experimentHistory.length, 1);
    assert.equal(stored.context.approval, undefined);
    assert.equal(stored.context.effectiveness, undefined);
  });

  test('requires explicit human audit fields', async (t) => {
    const entry = makeCandidate();
    const { dir, indexPath, cleanup } = createTempMemory({ layout: 'flat', entries: [entry] });
    t.after(cleanup);
    const replayPath = join(dir, 'paired-replay.json');
    writeFileSync(replayPath, JSON.stringify(makeReplay()), 'utf8');

    const result = await runCliInProcess(
      ['promote', 'attach-replay', entry.id, '--input', replayPath, '--index', indexPath],
      { cwd: dir }
    );
    assert.equal(result.code, 1);
    assert.match(result.stderr, /requires --approver/);
  });
});
