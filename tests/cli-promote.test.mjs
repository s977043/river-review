// CLI end-to-end tests for `river promote` (Phase 2, #1568-B / #1622).
// Uses --index to point at a seeded temp Riverbed index (no git repo needed)
// and asserts stdout / exit codes.

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempMemory } from './helpers/memory.mjs';
import { buildPromotionCandidateEntry } from '../scripts/feedback-rule-candidates.mjs';
import { appendEntry, loadMemory } from '../src/lib/riverbed-memory.mjs';

const now = new Date('2026-07-20T00:00:00.000Z');
const fp = (pr) => ({ pr, findingFingerprint: null, feedbackType: 'false_positive' });

function seed() {
  const { cleanup, indexPath } = createTempMemory({ layout: 'flat', prefix: 'rr-cli-promote-' });
  const fixtureCandidate = buildPromotionCandidateEntry({
    skillId: 'repository-layer-boundary',
    feedbackType: 'false_positive',
    group: [fp(1), fp(2)],
    now,
  });
  const securityCandidate = buildPromotionCandidateEntry({
    skillId: 'secret-scanner',
    feedbackType: 'missed_issue',
    group: [fp(3), fp(4)],
    now,
  });
  appendEntry(indexPath, fixtureCandidate);
  appendEntry(indexPath, securityCandidate);
  return { cleanup, indexPath, fixtureId: fixtureCandidate.id, securityId: securityCandidate.id };
}

describe('river promote list', () => {
  test('lists seeded candidates', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(['promote', 'list', '--index', indexPath]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /Promotion candidates \(2\)/);
    assert.match(res.stdout, new RegExp(fixtureId));
    assert.match(res.stdout, /promotionStatus:\s+candidate/);
  });

  test('--output json emits machine-readable candidates', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess([
      'promote',
      'list',
      '--index',
      indexPath,
      '--output',
      'json',
    ]);
    assert.equal(res.code, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.count, 2);
  });
});

describe('river promote approve / reject', () => {
  test('approve transitions candidate -> approved and records approver', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      [
        'promote',
        'approve',
        fixtureId,
        '--index',
        indexPath,
        '--approver',
        'alice',
        '--reason',
        'recurred',
      ],
      { env: { RIVER_NOW: '2026-07-21T09:00:00.000Z' } }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /approved/);
    const entry = loadMemory(indexPath).entries.find((e) => e.id === fixtureId);
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'approved');
    assert.equal(entry.context.approval.approver, 'alice');
    assert.equal(entry.context.approval.decidedAt, '2026-07-21T09:00:00.000Z');
  });

  test('re-approve is idempotent (no change, exit 0)', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const env = { RIVER_NOW: '2026-07-21T09:00:00.000Z' };
    await runCliInProcess(
      ['promote', 'approve', fixtureId, '--index', indexPath, '--approver', 'alice'],
      { env }
    );
    const res = await runCliInProcess(
      ['promote', 'approve', fixtureId, '--index', indexPath, '--approver', 'bob'],
      { env: { RIVER_NOW: '2026-08-01T00:00:00.000Z' } }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /already approved \(no change\)/);
    const entry = loadMemory(indexPath).entries.find((e) => e.id === fixtureId);
    assert.equal(entry.context.approval.approver, 'alice');
  });

  test('reject transitions candidate -> archived', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(
      ['promote', 'reject', fixtureId, '--index', indexPath, '--approver', 'carol'],
      { env: { RIVER_NOW: '2026-07-22T00:00:00.000Z' } }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /rejected/);
    const entry = loadMemory(indexPath).entries.find((e) => e.id === fixtureId);
    assert.equal(entry.status, 'archived');
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'archived');
    assert.equal(entry.context.approval.decision, 'rejected');
  });

  test('rejecting a previously-approved candidate warns and flags orphaned scaffold', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    await runCliInProcess(
      ['promote', 'approve', fixtureId, '--index', indexPath, '--approver', 'alice'],
      {
        env: { RIVER_NOW: '2026-07-21T09:00:00.000Z' },
      }
    );
    const res = await runCliInProcess(
      ['promote', 'reject', fixtureId, '--index', indexPath, '--approver', 'bob'],
      { env: { RIVER_NOW: '2026-07-22T00:00:00.000Z' } }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stderr, /overriding to rejected/);
    assert.match(res.stdout, /PR scaffold previously generated .* is now invalid/);
    // The full audit trail is retained.
    const entry = loadMemory(indexPath).entries.find((e) => e.id === fixtureId);
    assert.equal(entry.context.approvalHistory.length, 2);
    assert.deepEqual(
      entry.context.approvalHistory.map((h) => h.decision),
      ['approved', 'rejected']
    );
  });

  test('approve without an id exits 1', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(['promote', 'approve', '--index', indexPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /requires a candidate <id>/);
  });

  test('approve with an unknown id exits 1', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(['promote', 'approve', 'nope', '--index', indexPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /No promotion_candidate entry/);
  });
});

describe('river promote retarget', () => {
  test('retargets a candidate to a reference and records targetHistory', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const target = 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md';
    const res = await runCliInProcess(
      [
        'promote',
        'retarget',
        fixtureId,
        '--index',
        indexPath,
        '--target-kind',
        'reference',
        '--target-id',
        target,
        '--approver',
        'alice',
        '--reason',
        'capture recurring experience knowledge',
      ],
      { env: { RIVER_NOW: '2026-07-21T09:00:00.000Z' } }
    );

    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /retargeted/);
    const entry = loadMemory(indexPath).entries.find((e) => e.id === fixtureId);
    assert.deepEqual(entry.context.promotionCandidate.proposedTarget, {
      kind: 'reference',
      id: target,
    });
    assert.equal(entry.context.promotionCandidate.targetHistory.length, 1);
  });

  test('retargeting an approved candidate resets approval before template generation', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    await runCliInProcess(
      ['promote', 'approve', fixtureId, '--index', indexPath, '--approver', 'alice'],
      { env: { RIVER_NOW: '2026-07-21T09:00:00.000Z' } }
    );
    const res = await runCliInProcess(
      [
        'promote',
        'retarget',
        fixtureId,
        '--index',
        indexPath,
        '--target-kind',
        'reference',
        '--target-id',
        'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
        '--approver',
        'bob',
        '--reason',
        'target changed after approval',
      ],
      { env: { RIVER_NOW: '2026-07-22T00:00:00.000Z' } }
    );

    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /must be approved again/);
    const template = await runCliInProcess(['promote', 'template', fixtureId, '--index', indexPath]);
    assert.equal(template.code, 0, template.stderr);
    assert.match(template.stdout, /not approved/);
  });

  test('requires a reason and rejects unsafe reference paths', async (t) => {
    const { cleanup, indexPath, fixtureId } = seed();
    t.after(cleanup);
    const missingReason = await runCliInProcess([
      'promote',
      'retarget',
      fixtureId,
      '--index',
      indexPath,
      '--target-kind',
      'reference',
      '--target-id',
      'skills/agent-skills/x/references/X.md',
      '--approver',
      'alice',
    ]);
    assert.equal(missingReason.code, 1);
    assert.match(missingReason.stderr, /requires --reason/);

    const unsafe = await runCliInProcess([
      'promote',
      'retarget',
      fixtureId,
      '--index',
      indexPath,
      '--target-kind',
      'reference',
      '--target-id',
      '../../etc/passwd',
      '--approver',
      'alice',
      '--reason',
      'bad',
    ]);
    assert.equal(unsafe.code, 1);
    assert.match(unsafe.stderr, /unsafe|reference target/);
  });
});

describe('river promote retarget option scope', () => {
  test('retarget-only options fail on other promote subcommands', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess([
      'promote',
      'list',
      '--index',
      indexPath,
      '--target-kind',
      'reference',
    ]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /unknown option for promote: --target-kind/);
  });
});

describe('river promote template', () => {
  test('scaffolds only approved candidates; rejected are excluded', async (t) => {
    const { cleanup, indexPath, fixtureId, securityId } = seed();
    t.after(cleanup);
    const env = { RIVER_NOW: '2026-07-21T09:00:00.000Z' };
    await runCliInProcess(
      ['promote', 'approve', fixtureId, '--index', indexPath, '--approver', 'alice'],
      { env }
    );
    await runCliInProcess(
      ['promote', 'reject', securityId, '--index', indexPath, '--approver', 'bob'],
      { env }
    );

    const res = await runCliInProcess([
      'promote',
      'template',
      '--index',
      indexPath,
      '--output',
      'json',
    ]);
    assert.equal(res.code, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.scaffolds[0].id, fixtureId);
    assert.equal(parsed.scaffolds[0].kind, 'fixture');
    assert.match(parsed.scaffolds[0].branchName, /^promote\/fixture\//);
  });

  test('security/compliance candidate is routed to PlanGate', async (t) => {
    const { cleanup, indexPath, securityId } = seed();
    t.after(cleanup);
    await runCliInProcess(
      ['promote', 'approve', securityId, '--index', indexPath, '--approver', 'alice'],
      { env: { RIVER_NOW: '2026-07-21T09:00:00.000Z' } }
    );
    const res = await runCliInProcess(['promote', 'template', securityId, '--index', indexPath]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /PlanGate/);
    assert.match(res.stdout, /promote\/plangate\//);
  });

  test('no approved candidates prints a friendly message', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(['promote', 'template', '--index', indexPath]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /No approved promotion candidates/);
  });
});

describe('river promote (routing)', () => {
  test('unknown subcommand exits 1 with usage', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    const res = await runCliInProcess(['promote', 'bogus', '--index', indexPath]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /usage: river promote/);
  });

  test('--approver without a value does not swallow the next flag', async (t) => {
    const { cleanup, indexPath } = seed();
    t.after(cleanup);
    // `--approver --index <path>` must not consume `--index` as the approver.
    const res = await runCliInProcess([
      'promote',
      'approve',
      'x',
      '--approver',
      '--index',
      indexPath,
    ]);
    assert.match(res.stderr, /--approver option requires a value/);
  });
});
