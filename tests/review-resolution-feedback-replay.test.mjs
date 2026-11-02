import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  FeedbackReplayError,
  MAX_REPLAY_BYTES,
  parseReplayInput,
  readReplayInput,
  replayResolutionFeedback,
} from '../scripts/review-resolution-feedback-replay.mjs';

const SCRIPT = fileURLToPath(
  new URL('../scripts/review-resolution-feedback-replay.mjs', import.meta.url)
);
const FP = '0123456789abcdef';
const PRIVATE = 'synthetic-private-text-do-not-print';

function revision(reviewRunId, hex) {
  return {
    reviewRunId,
    executionManifestId: `RR-EXM-${hex.repeat(12)}`,
    artifactRefs: [{ name: 'diff', sha256: hex.repeat(64) }],
  };
}

function fixture() {
  const source = revision('synthetic-source', 'a');
  const target = revision('synthetic-target', 'b');
  return {
    findingIndex: 0,
    producerInput: {
      reviewResolution: {
        schemaVersion: '1',
        kind: 'review-resolution',
        resolutionId: 'RR-RES-synthetic-replay',
        source,
        items: [
          {
            findingRef: {
              findingId: 'finding-1',
              fingerprint: FP,
              fingerprintAlgo: 'v1',
              sources: [{ findingId: 'original-1', reviewerId: 'reviewer-a' }],
            },
            systemJudgment: { disposition: 'blocking', source: 'legacy-policy' },
            authorResponse: { state: 'will_fix', rationale: PRIVATE },
            resolution: { state: 'action_submitted', target, decisionRefs: [] },
            verification: {
              state: 'verified_resolved',
              verifier: 'synthetic-verifier',
              coverageStatus: 'complete',
              evidenceRefs: [{ ref: PRIVATE, sha256: 'c'.repeat(64) }],
            },
          },
        ],
      },
      sourceFindings: [{ id: 'finding-1', fingerprint: FP }],
      skillIdByFingerprint: { [FP]: 'test/synthetic-skill' },
      currentRevision: structuredClone(target),
    },
  };
}

async function withApproval(input = fixture()) {
  const report = await replayResolutionFeedback(input);
  input.currentInput = structuredClone(input.producerInput);
  input.existingFeedback = [];
  input.approval = {
    actor: 'synthetic-actor-NOT-authenticated',
    rationale: PRIVATE,
    approvedAt: '2026-11-03T00:00:00.000Z',
    proposalDigest: report.proposalDigest,
    findingId: 'finding-1',
    findingFingerprint: FP,
    reviewRunId: 'synthetic-source',
    skillId: 'test/synthetic-skill',
    feedbackType: report.proposal.feedbackType,
  };
  return input;
}

function expectCode(code) {
  return (error) => error instanceof FeedbackReplayError && error.code === code;
}

function assertReadOnly(report) {
  assert.equal(report.mode, 'read-only');
  assert.equal(report.inputTrust, 'unverified');
  assert.equal(report.humanAuthentication, 'not_verified');
  assert.equal(report.authorizesFeedbackWrite, false);
  assert.equal(report.qualifiesDogfoodCase, false);
  const text = JSON.stringify(report);
  for (const value of [PRIVATE, 'synthetic-actor', 'feedbackEntry', 'reviewer-a']) {
    assert.equal(text.includes(value), false, value);
  }
}

function cli(input, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('transport: accepts JSON records, rejects malformed or non-record inputs', () => {
  assert.deepEqual(parseReplayInput('{"findingIndex":0}'), { findingIndex: 0 });
  for (const text of ['', '{', PRIVATE]) {
    assert.throws(() => parseReplayInput(text), expectCode('invalid_json'));
  }
  for (const text of ['null', '[]', '0', '"text"']) {
    assert.throws(() => parseReplayInput(text), expectCode('invalid_input'));
  }
});

test('transport: enforces UTF-8 byte limit rather than string length', () => {
  const text = JSON.stringify({ note: 'あ'.repeat(MAX_REPLAY_BYTES / 2) });
  assert.ok(text.length < MAX_REPLAY_BYTES);
  assert.throws(() => parseReplayInput(text), expectCode('input_too_large'));
});

test('transport: requires an explicit valid selected finding', async () => {
  for (const findingIndex of [undefined, -1, 1, 0.5, '0']) {
    const input = fixture();
    input.findingIndex = findingIndex;
    await assert.rejects(replayResolutionFeedback(input), expectCode('invalid_finding_index'));
  }
});

test('transport: approval requires current input and duplicate-check snapshot', async () => {
  const input = fixture();
  input.approval = null;
  await assert.rejects(replayResolutionFeedback(input), expectCode('invalid_producer_input'));
  input.currentInput = structuredClone(input.producerInput);
  for (const existing of [undefined, null, {}, 'empty']) {
    input.existingFeedback = existing;
    await assert.rejects(
      replayResolutionFeedback(input),
      expectCode('existing_feedback_snapshot_required')
    );
  }
});

test('transport: bounds source findings and resolution items', async () => {
  const input = fixture();
  input.producerInput.sourceFindings = Array(1001).fill({});
  await assert.rejects(replayResolutionFeedback(input), expectCode('invalid_source_findings'));
  input.producerInput.sourceFindings = [];
  input.producerInput.reviewResolution.items = Array(101).fill({});
  await assert.rejects(replayResolutionFeedback(input), expectCode('too_many_resolution_items'));
});

test('runtime: actual candidate observation does not manufacture an approval', async () => {
  const report = await replayResolutionFeedback(fixture());
  assert.equal(report.proposal.status, 'candidate');
  assert.match(report.proposalDigest, /^[a-f0-9]{64}$/);
  assert.equal(report.approval.status, 'not_supplied');
  assertReadOnly(report);
});

test('runtime: explicit recorded approval is replayed but never authenticated', async () => {
  const input = await withApproval();
  input.hostAuthenticated = true;
  input.qualifiesDogfoodCase = true;
  const report = await replayResolutionFeedback(input);
  assert.equal(report.approval.status, 'ready');
  assertReadOnly(report);
});

test('runtime: stale evidence and current source loss cannot reuse approval', async () => {
  const changes = [
    (input) => {
      input.currentInput.reviewResolution.items[0].verification.evidenceRefs[0].ref = 'changed';
    },
    (input) => {
      input.currentInput.currentRevision.artifactRefs[0].sha256 = 'd'.repeat(64);
    },
    (input) => {
      input.currentInput.sourceFindings = [];
    },
    (input) => {
      input.currentInput.skillIdByFingerprint[FP] = 'other/skill';
    },
  ];
  for (const change of changes) {
    const input = await withApproval();
    change(input);
    const report = await replayResolutionFeedback(input);
    assert.equal(report.approval.status, 'rejected');
    assertReadOnly(report);
  }
});

test('runtime: held and unexecuted observations are not approvable', async () => {
  for (const mode of ['source-missing', 'partial', 'not-executed']) {
    const input = fixture();
    const item = input.producerInput.reviewResolution.items[0];
    if (mode === 'source-missing') input.producerInput.sourceFindings = [];
    else {
      item.verification.state = mode === 'partial' ? 'inconclusive' : 'pending';
      item.verification.coverageStatus = mode === 'partial' ? 'partial' : 'not_executed';
    }
    const report = await replayResolutionFeedback(input);
    assert.ok(['needs_human', 'no_proposal'].includes(report.proposal.status));
    assert.equal(report.proposalDigest, null);
    assertReadOnly(report);
  }
});

test('runtime: duplicate replay returns no canonical entry or audit payload', async () => {
  const input = await withApproval();
  input.existingFeedback = [
    {
      review_run_id: 'synthetic-source',
      findingFingerprint: FP,
      feedbackType: 'accepted',
      skillId: 'test/synthetic-skill',
    },
  ];
  const report = await replayResolutionFeedback(input);
  assert.equal(report.approval.status, 'duplicate');
  assertReadOnly(report);
});

test('runtime: malformed source exceptions are sanitized', async () => {
  const input = fixture();
  input.producerInput.reviewResolution.items[0].authorResponse.state = PRIVATE;
  await assert.rejects(replayResolutionFeedback(input), expectCode('invalid_contract_input'));
});

test('runtime: risk acceptance is bound to the reviewed source revision', async () => {
  const input = fixture();
  const item = input.producerInput.reviewResolution.items[0];
  item.authorResponse.state = 'accepts_risk';
  item.resolution = { state: 'risk_accepted', target: null };
  item.verification = {
    state: 'not_requested',
    verifier: null,
    coverageStatus: 'unknown',
    evidenceRefs: [],
  };
  input.producerInput.currentRevision = structuredClone(
    input.producerInput.reviewResolution.source
  );
  await withApproval(input);
  assert.equal((await replayResolutionFeedback(input)).approval.status, 'ready');
  input.currentInput.currentRevision = revision('other-source', 'd');
  const stale = await replayResolutionFeedback(input);
  assert.equal(stale.approval.status, 'rejected');
  assert.equal(stale.approval.reasonCode, 'stale_or_unknown_revision');
});

test('runtime: frozen inputs and JSON round-trip give deterministic replay', async () => {
  const input = await withApproval();
  const before = JSON.stringify(input);
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(input);
  const first = await replayResolutionFeedback(input);
  assert.deepEqual(await replayResolutionFeedback(JSON.parse(before)), first);
  assert.equal(JSON.stringify(input), before);
  assertReadOnly(first);
});

test('resource: bounded stdin rejects oversized input without echoing it', async () => {
  await assert.rejects(
    readReplayInput(Readable.from([Buffer.alloc(MAX_REPLAY_BYTES + 1)])),
    expectCode('input_too_large')
  );
});

test('resource: stdin handles split UTF-8 and rejects invalid encoding', async () => {
  const bytes = Buffer.from('{"message":"あ"}');
  const text = await readReplayInput(Readable.from([bytes.subarray(0, 13), bytes.subarray(13)]));
  assert.deepEqual(JSON.parse(text), { message: 'あ' });
  await assert.rejects(
    readReplayInput(Readable.from([Buffer.from([0xff])])),
    expectCode('invalid_utf8')
  );
});

test('resource: stdin timeout and stream failure are finite and sanitized', async () => {
  const stream = new PassThrough();
  try {
    await assert.rejects(readReplayInput(stream, { timeoutMs: 20 }), expectCode('input_timeout'));
    assert.equal(stream.listenerCount('data'), 0);
  } finally {
    stream.destroy();
  }
  const failed = new PassThrough();
  const pending = readReplayInput(failed);
  failed.destroy(new Error(PRIVATE));
  await assert.rejects(pending, expectCode('input_read_failed'));
});

test('CLI: help is read-only; malformed input and arguments fail without data leakage', () => {
  const help = cli('', ['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /NOT authenticated approval/);
  for (const result of [cli(PRIVATE), cli('{}'), cli('', ['--input', PRIVATE])]) {
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(PRIVATE), false);
    assert.ok(JSON.parse(result.stderr).error);
  }
});

test('runtime CLI: replay uses the shipped contracts and distinguishes no outcome', async () => {
  const observe = cli(fixture());
  assert.equal(observe.status, 3, observe.stderr);
  assert.equal(JSON.parse(observe.stdout).approval.status, 'not_supplied');
  const input = await withApproval();
  const ready = cli(input);
  assert.equal(ready.status, 0, ready.stderr);
  assertReadOnly(JSON.parse(ready.stdout));
  input.currentInput.sourceFindings = [];
  const held = cli(input);
  assert.equal(held.status, 3, held.stderr);
  assert.equal(JSON.parse(held.stdout).approval.status, 'rejected');
  assertReadOnly(JSON.parse(held.stdout));
});

test('transport: deeply nested input is rejected before production recursion', () => {
  let nested = { value: 'leaf' };
  for (let i = 0; i < 70; i++) nested = { child: nested };
  assert.throws(() => parseReplayInput(JSON.stringify(nested)), expectCode('input_too_deep'));
  assert.deepEqual(parseReplayInput('{"a":{"b":[1,2]}}'), { a: { b: [1, 2] } });
});

test('runtime: current selection is matched by identity rather than array position', async () => {
  const input = await withApproval();
  const other = structuredClone(input.currentInput.reviewResolution.items[0]);
  other.findingRef.findingId = 'finding-2';
  other.findingRef.fingerprint = 'fedcba9876543210';
  input.currentInput.reviewResolution.items.unshift(other);
  input.currentInput.sourceFindings.push({ id: 'finding-2', fingerprint: 'fedcba9876543210' });
  input.currentInput.skillIdByFingerprint.fedcba9876543210 = 'test/other-skill';
  const report = await replayResolutionFeedback(input);
  assert.equal(report.approval.status, 'ready');
  assertReadOnly(report);
});

test('runtime: missing current finding cannot approve a different finding', async () => {
  const input = await withApproval();
  input.currentInput.reviewResolution.items[0].findingRef.findingId = 'other-finding';
  const report = await replayResolutionFeedback(input);
  assert.equal(report.approval.status, 'rejected');
  assert.equal(report.approval.reasonCode, 'current_finding_not_unique');
});

test('runtime: malformed recorded approval and changed digest fail closed', async () => {
  const input = await withApproval();
  input.approval.proposalDigest = '0'.repeat(64);
  const stale = await replayResolutionFeedback(input);
  assert.equal(stale.approval.reasonCode, 'approval_digest_mismatch');
  input.approval = null;
  const missing = await replayResolutionFeedback(input);
  assert.equal(missing.approval.reasonCode, 'invalid_human_approval');
  assertReadOnly(missing);
});

test('transport: CLI never prints invalid input, including caller authority flags', () => {
  const input = { producerInput: PRIVATE, findingIndex: 0, authorizesFeedbackWrite: true };
  const result = cli(input);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes(PRIVATE), false);
  assert.deepEqual(JSON.parse(result.stderr), { error: 'invalid_producer_input' });
});
