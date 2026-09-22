// Judgment Promotion Loop Phase 2 (#1568-B / #1622): approval transition +
// PR-scaffold generation over promotion_candidate Riverbed entries.

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  applyPromotionDecision,
  decidePromotion,
  applyPromotionRetarget,
  retargetPromotion,
  listPromotionCandidates,
  isSecuritySensitive,
  buildPrScaffold,
  DECISION_STATUS,
} from '../src/lib/promotion.mjs';
import { buildPromotionCandidateEntry } from '../scripts/feedback-rule-candidates.mjs';
import { loadMemory, appendEntry } from '../src/lib/riverbed-memory.mjs';
import { createTempMemory } from './helpers/memory.mjs';
import { compileRiverbedIndexValidator } from './helpers/schema-validator.mjs';

const validate = compileRiverbedIndexValidator();
const wrapIndex = (entries) => ({ version: '1', entries });
const now = new Date('2026-07-20T00:00:00.000Z');
const decidedNow = new Date('2026-07-21T09:00:00.000Z');

const makeCandidate = (skillId, feedbackType, group) =>
  buildPromotionCandidateEntry({ skillId, feedbackType, group, now });

const fp = (pr) => ({ pr, findingFingerprint: null, feedbackType: 'false_positive' });

describe('applyPromotionDecision (pure transition)', () => {
  test('candidate -> approved records auditable approval', () => {
    const entry = makeCandidate('repository-layer-boundary', 'false_positive', [fp(1), fp(2)]);
    const { changed } = applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'alice',
      reason: 'recurred twice',
      now: decidedNow,
    });
    assert.equal(changed, true);
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'approved');
    assert.equal(entry.status, 'active');
    assert.deepEqual(entry.context.approval, {
      decision: 'approved',
      approver: 'alice',
      decidedAt: '2026-07-21T09:00:00.000Z',
      reason: 'recurred twice',
    });
    assert.equal(entry.metadata.updatedAt, '2026-07-21T09:00:00.000Z');
  });

  test('candidate -> rejected maps to archived (no rejected enum value)', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(entry, { decision: 'rejected', approver: 'bob', now: decidedNow });
    assert.equal(DECISION_STATUS.rejected, 'archived');
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'archived');
    assert.equal(entry.status, 'archived');
    assert.equal(entry.context.approval.decision, 'rejected');
  });

  test('re-deciding with the same decision is idempotent (no-op)', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(entry, { decision: 'approved', approver: 'alice', now: decidedNow });
    const later = new Date('2026-08-01T00:00:00.000Z');
    const { changed } = applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'carol',
      now: later,
    });
    assert.equal(changed, false);
    // Approver/timestamp of the original decision are preserved.
    assert.equal(entry.context.approval.approver, 'alice');
    assert.equal(entry.context.approval.decidedAt, '2026-07-21T09:00:00.000Z');
  });

  test('rejects an unknown decision and a missing approver', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    assert.throws(
      () => applyPromotionDecision(entry, { decision: 'maybe', approver: 'a' }),
      /Invalid decision/
    );
    assert.throws(
      () => applyPromotionDecision(entry, { decision: 'approved', approver: '' }),
      /approver is required/
    );
  });

  test('entry stays schema-valid after approval and after rejection', () => {
    const approved = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(approved, { decision: 'approved', approver: 'alice', now: decidedNow });
    assert.equal(validate(wrapIndex([approved])), true, JSON.stringify(validate.errors, null, 2));

    const rejected = makeCandidate('skill-b', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(rejected, { decision: 'rejected', approver: 'bob', now: decidedNow });
    assert.equal(validate(wrapIndex([rejected])), true, JSON.stringify(validate.errors, null, 2));
  });
});

describe('decidePromotion (persisting wrapper)', () => {
  test('persists the transition to the index', () => {
    const { cleanup, indexPath } = createTempMemory({ layout: 'flat', prefix: 'rr-promote-' });
    try {
      const entry = makeCandidate('repository-layer-boundary', 'false_positive', [fp(1), fp(2)]);
      appendEntry(indexPath, entry);
      const { changed } = decidePromotion({
        indexPath,
        id: entry.id,
        decision: 'approved',
        approver: 'alice',
        now: decidedNow,
      });
      assert.equal(changed, true);
      const reloaded = loadMemory(indexPath).entries.find((e) => e.id === entry.id);
      assert.equal(reloaded.context.promotionCandidate.promotionStatus, 'approved');
      assert.equal(reloaded.context.approval.approver, 'alice');
    } finally {
      cleanup();
    }
  });

  test('a second identical decision does not rewrite the record', () => {
    const { cleanup, indexPath } = createTempMemory({ layout: 'flat', prefix: 'rr-promote-' });
    try {
      const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
      appendEntry(indexPath, entry);
      decidePromotion({
        indexPath,
        id: entry.id,
        decision: 'approved',
        approver: 'alice',
        now: decidedNow,
      });
      const second = decidePromotion({
        indexPath,
        id: entry.id,
        decision: 'approved',
        approver: 'bob',
        now: new Date('2026-09-01T00:00:00.000Z'),
      });
      assert.equal(second.changed, false);
      const reloaded = loadMemory(indexPath).entries.find((e) => e.id === entry.id);
      assert.equal(reloaded.context.approval.approver, 'alice');
    } finally {
      cleanup();
    }
  });

  test('throws for an unknown id', () => {
    const { cleanup, indexPath } = createTempMemory({ layout: 'flat', prefix: 'rr-promote-' });
    try {
      assert.throws(
        () => decidePromotion({ indexPath, id: 'nope', decision: 'approved', approver: 'a' }),
        /No promotion_candidate entry/
      );
    } finally {
      cleanup();
    }
  });
});

describe('promotion retarget', () => {
  test('retargets to reference, appends audit history, and stays schema-valid', () => {
    const entry = makeCandidate('skill-a', 'unclear', [fp(1), fp(2)]);
    const evidenceBefore = structuredClone(entry.context.promotionCandidate.evidence);
    const result = applyPromotionRetarget(entry, {
      kind: 'reference',
      targetId: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
      approver: 'alice',
      reason: 'experience knowledge belongs in a reference',
      now: decidedNow,
    });

    assert.equal(result.changed, true);
    assert.equal(entry.context.promotionCandidate.proposedTarget.kind, 'reference');
    assert.equal(entry.context.promotionCandidate.targetHistory.length, 1);
    assert.deepEqual(entry.context.promotionCandidate.evidence, evidenceBefore);
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'candidate');
    assert.equal(validate(wrapIndex([entry])), true, JSON.stringify(validate.errors, null, 2));
  });

  test('retargeting an approved candidate invalidates the old approval', () => {
    const entry = makeCandidate('skill-a', 'unclear', [fp(1), fp(2)]);
    applyPromotionDecision(entry, { decision: 'approved', approver: 'alice', now: decidedNow });

    const result = applyPromotionRetarget(entry, {
      kind: 'reference',
      targetId: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
      approver: 'bob',
      reason: 'move detail out of the skill contract',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    assert.equal(result.approvalReset, true);
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'candidate');
    assert.equal(entry.context.approval, undefined);
    assert.equal(entry.context.approvalHistory.length, 1);
    assert.equal(entry.context.promotionCandidate.targetHistory[0].previousPromotionStatus, 'approved');
    assert.equal(buildPrScaffold(entry).eligible, false);
  });

  test('same target is idempotent and does not grow targetHistory', () => {
    const entry = makeCandidate('skill-a', 'unclear', [fp(1), fp(2)]);
    entry.context.promotionCandidate.proposedTarget = {
      kind: 'reference',
      id: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
    };
    const result = applyPromotionRetarget(entry, {
      kind: 'reference',
      targetId: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
      approver: 'alice',
      reason: 'same target',
      now: decidedNow,
    });

    assert.equal(result.changed, false);
    assert.equal(entry.context.promotionCandidate.targetHistory, undefined);
  });

  test('rejects traversal-like reference targets and terminal candidates', () => {
    const entry = makeCandidate('skill-a', 'unclear', [fp(1), fp(2)]);
    assert.throws(
      () =>
        applyPromotionRetarget(entry, {
          kind: 'reference',
          targetId: '../../etc/passwd',
          approver: 'alice',
          reason: 'bad path',
          now: decidedNow,
        }),
      /reference target|unsafe/
    );

    applyPromotionDecision(entry, { decision: 'rejected', approver: 'alice', now: decidedNow });
    assert.throws(
      () =>
        applyPromotionRetarget(entry, {
          kind: 'skill',
          targetId: 'river-review-code',
          approver: 'alice',
          reason: 'terminal',
          now: decidedNow,
        }),
      /terminal/
    );
  });

  test('persisting wrapper updates the index', () => {
    const { cleanup, indexPath } = createTempMemory({ layout: 'flat', prefix: 'rr-retarget-' });
    try {
      const entry = makeCandidate('skill-a', 'unclear', [fp(1), fp(2)]);
      appendEntry(indexPath, entry);
      retargetPromotion({
        indexPath,
        id: entry.id,
        kind: 'reference',
        targetId: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
        approver: 'alice',
        reason: 'promote experience knowledge',
        now: decidedNow,
      });
      const reloaded = loadMemory(indexPath).entries.find((e) => e.id === entry.id);
      assert.equal(reloaded.context.promotionCandidate.proposedTarget.kind, 'reference');
      assert.equal(reloaded.context.promotionCandidate.targetHistory.length, 1);
    } finally {
      cleanup();
    }
  });

  test('security candidate still delegates to PlanGate after retarget and re-approval', () => {
    const entry = makeCandidate('secret-scanner', 'missed_issue', [fp(1), fp(2)]);
    applyPromotionRetarget(entry, {
      kind: 'reference',
      targetId: 'skills/agent-skills/river-review-security/references/SECRET-SCANNING.md',
      approver: 'alice',
      reason: 'capture recurring operational detail',
      now: decidedNow,
    });
    applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'alice',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    assert.equal(buildPrScaffold(entry).requiresPlanGate, true);
  });
});

describe('listPromotionCandidates', () => {
  test('returns only active promotion_candidate entries by default', () => {
    const a = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    const b = makeCandidate('skill-b', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(b, { decision: 'rejected', approver: 'bob', now: decidedNow });
    const other = {
      id: 'r1',
      type: 'review',
      content: 'x',
      metadata: { createdAt: now.toISOString(), author: 't' },
    };
    const index = wrapIndex([a, b, other]);
    assert.deepEqual(
      listPromotionCandidates(index).map((e) => e.id),
      [a.id]
    );
    assert.equal(listPromotionCandidates(index, { includeInactive: true }).length, 2);
  });
});

describe('isSecuritySensitive', () => {
  const sensitive = (skillId) =>
    isSecuritySensitive(makeCandidate(skillId, 'false_positive', [fp(1), fp(2)]));

  test('flags security/compliance signals in skill/clusterKey', () => {
    assert.equal(
      isSecuritySensitive(makeCandidate('secret-scanner', 'missed_issue', [fp(1), fp(2)])),
      true
    );
    assert.equal(sensitive('auth-guard'), true);
    assert.equal(sensitive('repository-layer-boundary'), false);
  });

  // Canary: plural / derivational forms MUST be caught. A stem that only matched
  // when followed by a word boundary silently skipped these (the warning-1 bug).
  test('canary: plurals and derivations are caught (warning-1 regression guard)', () => {
    for (const skillId of [
      'authentication-review',
      'authorization-check',
      'secrets-detector',
      'credentials-scanner',
      'vulnerability-audit',
      'cryptography-review',
      'injection-guard',
      'compliance-gate',
    ]) {
      assert.equal(sensitive(skillId), true, `${skillId} should be security-sensitive`);
    }
  });

  // Canary: benign words whose embedded stem must NOT over-match. `oauth-flow`
  // contains "auth" but preceded by a letter, so it stays out (no over-detection).
  test('canary: embedded / benign stems do not over-match', () => {
    for (const skillId of [
      'oauth-flow-review',
      'repository-layer-boundary',
      'readability-check',
      'markdown-linter',
    ]) {
      assert.equal(sensitive(skillId), false, `${skillId} should NOT be security-sensitive`);
    }
  });
});

describe('approval audit trail', () => {
  test('approve -> reject -> approve keeps every decision in approvalHistory', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    const r1 = applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'alice',
      now: decidedNow,
    });
    assert.equal(r1.warning, null);
    assert.equal(r1.previousDecision, null);
    const r2 = applyPromotionDecision(entry, {
      decision: 'rejected',
      approver: 'bob',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    assert.equal(r2.previousDecision, 'approved');
    assert.match(r2.warning, /overriding to rejected/);
    const r3 = applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'carol',
      now: new Date('2026-07-23T00:00:00.000Z'),
    });
    assert.equal(r3.previousDecision, 'rejected');
    assert.equal(entry.context.approvalHistory.length, 3);
    assert.deepEqual(
      entry.context.approvalHistory.map((h) => `${h.decision}:${h.approver}`),
      ['approved:alice', 'rejected:bob', 'approved:carol']
    );
    // context.approval points at the latest decision.
    assert.equal(entry.context.approval.approver, 'carol');
    assert.equal(entry.context.promotionCandidate.promotionStatus, 'approved');
    assert.equal(validate(wrapIndex([entry])), true, JSON.stringify(validate.errors, null, 2));
  });

  test('idempotent same-decision re-apply does not grow the history', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(entry, { decision: 'approved', approver: 'alice', now: decidedNow });
    applyPromotionDecision(entry, { decision: 'approved', approver: 'bob', now: decidedNow });
    assert.equal(entry.context.approvalHistory.length, 1);
  });
});

describe('buildPrScaffold', () => {
  const approve = (entry) =>
    applyPromotionDecision(entry, {
      decision: 'approved',
      approver: 'alice',
      reason: 'r',
      now: decidedNow,
    });

  test('is not eligible until approved', () => {
    const entry = makeCandidate('repository-layer-boundary', 'false_positive', [fp(1), fp(2)]);
    const s = buildPrScaffold(entry);
    assert.equal(s.eligible, false);
    assert.match(s.note, /not approved/);
    assert.equal(s.branchName, null);
  });

  test('rejected candidates are not eligible', () => {
    const entry = makeCandidate('skill-a', 'false_positive', [fp(1), fp(2)]);
    applyPromotionDecision(entry, { decision: 'rejected', approver: 'bob', now: decidedNow });
    assert.equal(buildPrScaffold(entry).eligible, false);
  });

  test('proposedTarget.id is slugified into paths (no traversal leakage)', () => {
    const entry = makeCandidate('skill-x', 'false_positive', [fp(1), fp(2)]);
    // Simulate a malicious / unsanitised candidate id.
    entry.context.promotionCandidate.proposedTarget = { kind: 'fixture', id: '../../etc/passwd' };
    approve(entry);
    const s = buildPrScaffold(entry);
    for (const p of s.targetPaths) {
      assert.ok(!p.includes('..'), `path must not contain traversal: ${p}`);
      assert.match(p, /skills\/\*\*\/fixtures\/etc-passwd\.md/);
    }
  });

  test('reference target is schema-valid and produces an exact safe reference path', () => {
    const entry = makeCandidate('skill-x', 'unclear', [fp(1), fp(2)]);
    entry.context.promotionCandidate.proposedTarget = {
      kind: 'reference',
      id: 'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
    };
    approve(entry);

    assert.equal(validate(wrapIndex([entry])), true, JSON.stringify(validate.errors, null, 2));

    const s = buildPrScaffold(entry);
    assert.equal(s.eligible, true);
    assert.equal(s.kind, 'reference');
    assert.match(s.branchName, /^promote\/reference\//);
    assert.match(s.prTitle, /^docs\(reference\):/);
    assert.deepEqual(s.targetPaths, [
      'skills/agent-skills/river-review-code/references/ERROR-HANDLING.md',
    ]);
    assert.match(s.prBody, /kind: reference/);
  });

  test('reference target falls back to a safe scaffold path on traversal-like ids', () => {
    const entry = makeCandidate('skill-x', 'unclear', [fp(1), fp(2)]);
    entry.context.promotionCandidate.proposedTarget = {
      kind: 'reference',
      id: '../../etc/passwd',
    };
    approve(entry);

    const s = buildPrScaffold(entry);
    assert.deepEqual(s.targetPaths, ['skills/**/references/etc-passwd.md']);
    assert.ok(!s.targetPaths[0].includes('..'));
  });

  test('each proposedTarget.kind produces a branch, title and paths', () => {
    const cases = [
      {
        skillId: 'repository-layer-boundary',
        feedbackType: 'false_positive',
        kind: 'fixture',
        branch: /^promote\/fixture\//,
      },
      {
        skillId: 'skill-x',
        feedbackType: 'missed_issue',
        kind: 'fixture',
        branch: /^promote\/fixture\//,
      },
      {
        skillId: 'skill-x',
        feedbackType: 'accepted_risk',
        kind: 'rule',
        branch: /^promote\/rule\//,
      },
      {
        skillId: 'skill-x',
        feedbackType: 'not_actionable',
        kind: 'skill',
        branch: /^promote\/skill\//,
      },
      { skillId: 'skill-x', feedbackType: 'unclear', kind: 'skill', branch: /^promote\/skill\// },
      {
        skillId: 'skill-x',
        feedbackType: 'duplicate',
        kind: 'routing',
        branch: /^promote\/routing\//,
      },
      {
        skillId: 'skill-x',
        feedbackType: 'out_of_scope',
        kind: 'riverbed',
        branch: /^promote\/riverbed\//,
      },
    ];
    for (const c of cases) {
      const entry = makeCandidate(c.skillId, c.feedbackType, [fp(1), fp(2)]);
      approve(entry);
      const s = buildPrScaffold(entry);
      assert.equal(s.eligible, true, `${c.kind} should be eligible`);
      assert.equal(s.requiresPlanGate, false, `${c.kind} is not security-sensitive`);
      assert.equal(s.kind, c.kind);
      assert.match(s.branchName, c.branch);
      assert.ok(s.prTitle && s.prTitle.length > 0);
      assert.ok(s.targetPaths.length > 0);
      assert.match(s.prBody, /## Approval/);
      assert.match(s.prBody, /approver: alice/);
    }
  });

  test('security/compliance kind delegates to PlanGate instead of a merge scaffold', () => {
    const entry = makeCandidate('secret-scanner', 'missed_issue', [fp(1), fp(2)]);
    approve(entry);
    const s = buildPrScaffold(entry);
    assert.equal(s.eligible, true);
    assert.equal(s.requiresPlanGate, true);
    assert.match(s.branchName, /^promote\/plangate\//);
    assert.match(s.prBody, /PlanGate/);
    assert.match(s.note, /PlanGate approval required/);
  });

  test('human_judgment kind yields no mergeable scaffold', () => {
    // A feedbackType with no decision-tree mapping falls back to human_judgment.
    const entry = makeCandidate('skill-x', 'some_unmapped_type', [fp(1), fp(2)]);
    approve(entry);
    const s = buildPrScaffold(entry);
    assert.equal(s.kind, 'human_judgment');
    assert.equal(s.eligible, true);
    assert.equal(s.branchName, null);
    assert.match(s.note, /human_judgment/);
  });
});
