// Judgment Promotion Loop Phase 2 (#1568-B / #1622): approval transition and
// PR-scaffold generation for promotion_candidate Riverbed entries.
//
// Phase 1 (#1621) generates promotion_candidate entries (generation only). This
// module adds the *human* approval step and turns approved candidates into PR
// scaffolds (text only — no files are changed here; a human or a follow-up
// applies them). Generation and adoption stay separated: nothing in this module
// creates candidates.
//
// promotionStatus enum (schema): candidate, pending, approved, active,
// needs_review, superseded, archived. Phase 2 maps the two human decisions onto
// existing enum values (no schema change):
//   approve -> promotionStatus: 'approved'
//   reject  -> promotionStatus: 'archived'   (no 'rejected' enum value exists;
//              the rejection is recorded via context.approval.decision)
//
// #1568 decision 5: security/compliance promotions are delegated to PlanGate.
// The proposedTarget.kind enum has no dedicated security kind, so sensitivity is
// detected deterministically from the candidate's skill / clusterKey signals.

import { loadMemory, updateEntry, isExpired, hasUnparseableExpiresAt } from './riverbed-memory.mjs';

export const PROMOTION_ENTRY_TYPE = 'promotion_candidate';

/** Human decisions and the promotionStatus they map onto. */
export const DECISION_STATUS = Object.freeze({
  approved: 'approved',
  rejected: 'archived',
});

export const VALID_DECISIONS = Object.freeze(['approved', 'rejected']);

// Deterministic substring signals that flag a candidate as security/compliance
// sensitive. Matched against the lowercased skillId + clusterKey.
const SECURITY_SIGNALS = Object.freeze([
  'security',
  'secret',
  'credential',
  'auth',
  'authn',
  'authz',
  'compliance',
  'vuln',
  'injection',
  'xss',
  'csrf',
  'crypto',
  'privacy',
  'pii',
]);

// Compiled once at module scope (building the regex is not free and the signals
// are static). Prefix match after a word boundary: the stem must start a word
// (preceded by start-of-string or a non-letter) but any suffix may follow, so
// plurals and derivations are caught — secrets, credentials, vulnerability,
// cryptography, authentication, authorization — while embedded stems are NOT
// (the "auth" inside "oauth" is preceded by a letter, so oauth-flow stays out).
const SECURITY_RE = new RegExp(`(^|[^a-z])(${SECURITY_SIGNALS.join('|')})`);

/** Slugify a value into an id-safe fragment. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Slugify proposedTarget.id for interpolation into file-path / branch templates.
 * Untrusted candidate ids (e.g. `../../etc/passwd`) are neutralised the same way
 * as clusterKey in branch names, so no path traversal leaks into the scaffold.
 *
 * @param {object} pc - a promotionCandidate body
 * @param {string} fallback - placeholder when no id is set
 */
function safeTargetId(pc, fallback) {
  const id = pc?.proposedTarget?.id;
  return id ? slugify(id) : fallback;
}

const SAFE_REFERENCE_PATH_RE = /^skills\/(?:[a-zA-Z0-9._-]+\/)*references\/[a-zA-Z0-9._-]+\.md$/;

/**
 * Resolve a reference target without allowing a candidate-controlled path to
 * escape the repository skill tree. Exact repo paths are preserved only when
 * they point to a Markdown file under a repo-owned skills/.../references/ directory;
 * otherwise we fall back to a safe
 * scaffold template using the slugified target id.
 */
function safeReferenceTargetPath(pc) {
  const id = pc?.proposedTarget?.id;
  if (!id) return 'skills/**/references/<reference>.md';
  const value = String(id).replaceAll('\\', '/');
  const segments = value.split('/');
  if (SAFE_REFERENCE_PATH_RE.test(value) && !segments.includes('.') && !segments.includes('..')) {
    return value;
  }
  return `skills/**/references/${safeTargetId(pc, '<reference>')}.md`;
}

/**
 * Read the promotionCandidate body from an entry, or null when absent.
 * @param {object} entry
 */
export function getPromotionCandidate(entry) {
  return entry?.context?.promotionCandidate ?? null;
}

/**
 * List promotion_candidate entries from a loaded index. Only active entries are
 * returned unless includeInactive is set (rejected candidates are archived).
 *
 * @param {{ entries: object[] }} index
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {object[]}
 */
export function listPromotionCandidates(index, { includeInactive = false } = {}) {
  const entries = index?.entries ?? [];
  return entries.filter((entry) => {
    if (entry?.type !== PROMOTION_ENTRY_TYPE) return false;
    if (!includeInactive && (entry.status ?? 'active') !== 'active') return false;
    return true;
  });
}

/**
 * Whether a candidate is security/compliance sensitive and must be routed
 * through PlanGate for approval (#1568 decision 5).
 *
 * @param {object} entry - a promotion_candidate entry
 * @returns {boolean}
 */
export function isSecuritySensitive(entry) {
  const pc = getPromotionCandidate(entry);
  const tags = (entry?.metadata?.tags ?? []).join(' ');
  const haystack = `${tags} ${pc?.clusterKey ?? ''}`.toLowerCase();
  return SECURITY_RE.test(haystack);
}

/**
 * Pure approval transition. Mutates and returns the entry (in place). Every
 * decision is appended to `context.approvalHistory` (an audit trail that is
 * never overwritten) and `context.approval` points at the latest record.
 *
 * Re-deciding with the SAME decision is a no-op (idempotent) ONLY when the
 * resulting promotionStatus already holds. A candidate that an effectiveness
 * review flipped to needs_review still has `approval.decision === 'approved'`,
 * so re-approving it is NOT a no-op: it transitions promotionStatus back to
 * `approved` (in effect again), appends a fresh approval record, and thereby
 * resets the effectiveness cutoff (`since`) to the new decidedAt. Re-deciding
 * with a DIFFERENT decision is an override and surfaces a `warning`; the prior
 * decisions always stay in approvalHistory.
 *
 * @param {object} entry - a promotion_candidate entry
 * @param {{ decision: 'approved'|'rejected', approver: string, reason?: string|null, now?: Date }} opts
 * @returns {{ changed: boolean, entry: object, warning: string|null, previousDecision: string|null }}
 */
export function applyPromotionDecision(
  entry,
  { decision, approver, reason = null, now = new Date() }
) {
  if (!VALID_DECISIONS.includes(decision)) {
    throw new Error(
      `Invalid decision: ${decision} (expected one of ${VALID_DECISIONS.join(', ')}).`
    );
  }
  if (!approver) {
    throw new Error('approver is required to record an auditable approval decision.');
  }
  const pc = getPromotionCandidate(entry);
  if (!pc) {
    throw new Error(
      `Entry ${entry?.id} is not a promotion_candidate (missing context.promotionCandidate).`
    );
  }
  const previousDecision = entry.context?.approval?.decision ?? null;
  const targetStatus = DECISION_STATUS[decision];
  // Idempotent only when BOTH the last decision AND the resulting promotionStatus
  // already hold. This lets a needs_review candidate (last decision 'approved'
  // but promotionStatus flipped by an effectiveness review) be re-approved back
  // into effect instead of silently no-op'ing.
  if (previousDecision === decision && pc.promotionStatus === targetStatus) {
    return { changed: false, entry, warning: null, previousDecision };
  }
  const decidedAt = now.toISOString();
  const record = { decision, approver, decidedAt, reason: reason ?? null };
  pc.promotionStatus = targetStatus;
  // Append-only audit trail; context.approval always points at the latest record.
  entry.context.approvalHistory = entry.context.approvalHistory ?? [];
  entry.context.approvalHistory.push(record);
  entry.context.approval = record;
  entry.status = decision === 'rejected' ? 'archived' : 'active';
  entry.metadata = entry.metadata ?? {};
  entry.metadata.updatedAt = decidedAt;
  const warning =
    previousDecision && previousDecision !== decision
      ? `candidate ${entry.id} was already ${previousDecision}; overriding to ${decision} (prior decisions kept in approvalHistory).`
      : null;
  return { changed: true, entry, warning, previousDecision };
}

/**
 * I/O wrapper: load the index, apply the approval decision to entry `id`, and
 * persist. Returns the changed flag and the updated entry.
 *
 * @param {{ indexPath: string, id: string, decision: 'approved'|'rejected', approver: string, reason?: string|null, now?: Date }} opts
 * @returns {{ changed: boolean, entry: object, warning: string|null, previousDecision: string|null }}
 */
export function decidePromotion({
  indexPath,
  id,
  decision,
  approver,
  reason = null,
  now = new Date(),
}) {
  const index = loadMemory(indexPath);
  const target = listPromotionCandidates(index, { includeInactive: true }).find((e) => e.id === id);
  if (!target) {
    throw new Error(`No promotion_candidate entry with id: ${id}`);
  }
  // Apply the transition exactly once, inside the persist mutator. updateEntry
  // rewrites the index; on an idempotent no-op the bytes are unchanged.
  let result;
  const entry = updateEntry(indexPath, id, (live) => {
    result = applyPromotionDecision(live, { decision, approver, reason, now });
  });
  return { ...result, entry };
}

// ---------------------------------------------------------------------------
// Phase 3 (#1568-C / #1623): Retire lifecycle
//
// Two deterministic, human-triggered CLI operations over promoted candidates:
//   1. retire              — sync promotionStatus to a retired entry-level status
//                            (archived on expiresAt, superseded via supersede()).
//   2. review-effectiveness — count post-activation negative feedback
//                            (cluster-scoped recurrence + skill-scoped reversals,
//                            deduplicated by findingFingerprint) and, on
//                            threshold breach, transition to needs_review.
//
// `now` and `threshold` are always injectable (never Date.now() / hard-coded) so
// the transitions are deterministic under test.
// ---------------------------------------------------------------------------

/**
 * Default negative-feedback count that flips a promoted candidate to
 * needs_review. Overridable per call (test injection / CLI --threshold).
 */
export const DEFAULT_EFFECTIVENESS_THRESHOLD = 2;

/**
 * promotionStatus values that mean the judgment has been promoted and is in
 * effect, hence eligible for an effectiveness review. `approved` is Phase 2's
 * accept state; `active` is reserved for a judgment that has been applied.
 */
export const IN_EFFECT_PROMOTION_STATUSES = Object.freeze(['approved', 'active']);

// promotionStatus values that are already terminal — never downgraded or
// overwritten by the retire sync once reached.
const TERMINAL_PROMOTION_STATUSES = Object.freeze(['superseded', 'archived']);

// Retired entry-level status → the promotionStatus it should be synced to.
const ENTRY_STATUS_TO_PROMOTION = Object.freeze({
  archived: 'archived',
  superseded: 'superseded',
});

/**
 * Derive the source skillId from a clusterKey. Phase 1 clusterKeys are
 * `skillId::feedbackType`; a key without `::` is treated as the skillId itself.
 *
 * @param {string} clusterKey
 * @returns {string|null}
 */
export function skillIdFromClusterKey(clusterKey) {
  const value = String(clusterKey ?? '');
  const sep = value.indexOf('::');
  const skillId = sep === -1 ? value : value.slice(0, sep);
  return skillId || null;
}

/**
 * Derive the feedbackType from a clusterKey (`skillId::feedbackType`). A key
 * without `::` has no feedbackType component. This is the class the candidate was
 * clustered on, and defines which recurring feedback degrades it.
 *
 * @param {string} clusterKey
 * @returns {string|null}
 */
export function feedbackTypeFromClusterKey(clusterKey) {
  const value = String(clusterKey ?? '');
  const sep = value.indexOf('::');
  if (sep === -1) return null;
  const feedbackType = value.slice(sep + 2);
  return feedbackType || null;
}

/**
 * Whether a feedback entry is a negative effectiveness signal for a promoted
 * judgment. Two scopes, by design:
 *  - **Cluster-scoped recurrence**: feedback of the candidate's own feedbackType
 *    (`clusterFeedbackType`). A candidate promoted for `skill::missed_issue` is
 *    only degraded by recurring `missed_issue`, not by an unrelated
 *    `false_positive` on the same skill (that would be over-detection).
 *  - **Skill-scoped reversal**: any `reversedBy` feedback for the skill. A
 *    reversal means a prior disposition was overturned, which invalidates the
 *    promoted judgment regardless of which feedbackType it was filed under, so
 *    reversals deliberately cross feedbackType boundaries.
 *
 * @param {{ feedbackType?: string, reversedBy?: string }} fb
 * @param {{ clusterFeedbackType?: string|null }} [opts]
 * @returns {boolean}
 */
export function isNegativeFeedback(fb, { clusterFeedbackType = null } = {}) {
  if (!fb) return false;
  const isRecurrence = clusterFeedbackType != null && fb.feedbackType === clusterFeedbackType;
  return isRecurrence || Boolean(fb.reversedBy);
}

/**
 * Plan (without mutating) the retire transition for a promotion_candidate entry.
 * `willExpire` is true when an active entry's expiresAt has passed; `statusSync`
 * is the promotionStatus change implied by the (possibly post-expiry) entry
 * status. Idempotent: once synced, `willChange` is false.
 *
 * `unparseableExpiresAt` reports an ACTIVE entry whose expiresAt `Date` cannot
 * parse — the one case where retiring would otherwise have archived it, which
 * for a candidate is a discard (#1756). The caller surfaces the flag as a
 * warning. A non-active entry is excluded on purpose: expiry never applied to
 * it, so calling it "skipped" would be as untrue as the `expiresAt reached`
 * audit reason this change removes.
 *
 * @param {object} entry
 * @param {{ now?: Date }} [opts]
 * @returns {{ willChange: boolean, willExpire: boolean, statusSync: {from: string, to: string}|null, unparseableExpiresAt: boolean }}
 */
export function planPromotionRetire(entry, { now = new Date() } = {}) {
  const pc = getPromotionCandidate(entry);
  if (!pc) {
    return { willChange: false, willExpire: false, statusSync: null, unparseableExpiresAt: false };
  }
  const entryStatus = entry.status ?? 'active';
  // Shares the expiry rule with expireEntries (isExpired) so the `expiresAt <= now`
  // boundary is defined once. onUnparseable is 'not-expired' because archiving a
  // candidate discards it: an unparseable expiresAt is a data defect to report,
  // not a deadline that passed.
  const unparseableExpiresAt = hasUnparseableExpiresAt(entry) && entryStatus === 'active';
  const willExpire =
    isExpired(entry, now, { onUnparseable: 'not-expired' }) && entryStatus === 'active';
  const nextEntryStatus = willExpire ? 'archived' : entryStatus;
  const target = ENTRY_STATUS_TO_PROMOTION[nextEntryStatus] ?? null;
  const needsSync =
    target != null &&
    pc.promotionStatus !== target &&
    !TERMINAL_PROMOTION_STATUSES.includes(pc.promotionStatus);
  const statusSync = needsSync ? { from: pc.promotionStatus, to: target } : null;
  return { willChange: willExpire || needsSync, willExpire, statusSync, unparseableExpiresAt };
}

/**
 * Apply the retire transition in place. Archives an entry whose expiresAt has
 * passed (mirrors expireEntries but with an injectable `now`) and syncs the
 * candidate promotionStatus to the retired entry-level status. Every transition
 * is appended to `context.lifecycleHistory` (append-only audit trail, shaped
 * like the approvalHistory records).
 *
 * The `expiresAt reached` reason is therefore only ever written for a timestamp
 * that really did pass: an unparseable expiresAt never sets `willExpire`, so the
 * append-only trail cannot record an expiry that did not happen (#1756).
 *
 * @param {object} entry - a promotion_candidate entry
 * @param {{ now?: Date }} [opts]
 * @returns {{ changed: boolean, entry: object, willExpire: boolean, statusSync: {from,to}|null, record: object|null, unparseableExpiresAt: boolean }}
 */
export function applyPromotionRetire(entry, { now = new Date() } = {}) {
  const plan = planPromotionRetire(entry, { now });
  if (!plan.willChange) {
    return {
      changed: false,
      entry,
      willExpire: false,
      statusSync: null,
      record: null,
      unparseableExpiresAt: plan.unparseableExpiresAt,
    };
  }
  const pc = getPromotionCandidate(entry);
  const retiredAt = now.toISOString();
  const changes = [];
  if (plan.willExpire) {
    entry.status = 'archived';
    changes.push('expired');
  }
  if (plan.statusSync) {
    pc.promotionStatus = plan.statusSync.to;
    changes.push(`promotionStatus:${plan.statusSync.from}->${plan.statusSync.to}`);
  }
  const record = {
    event: 'retire',
    retiredAt,
    entryStatus: entry.status,
    promotionStatus: pc.promotionStatus,
    reason: plan.willExpire ? 'expiresAt reached' : 'promotionStatus sync',
    changes,
  };
  entry.context.lifecycleHistory = entry.context.lifecycleHistory ?? [];
  entry.context.lifecycleHistory.push(record);
  entry.metadata = entry.metadata ?? {};
  entry.metadata.updatedAt = retiredAt;
  return {
    changed: true,
    entry,
    willExpire: plan.willExpire,
    statusSync: plan.statusSync,
    record,
    unparseableExpiresAt: plan.unparseableExpiresAt,
  };
}

/**
 * I/O wrapper: load the index, retire every promotion_candidate whose lifecycle
 * needs it (expiry archive + promotionStatus sync), and persist. Idempotent — a
 * second run finds nothing to change.
 *
 * `warnings` lists ACTIVE candidates whose expiresAt cannot be parsed — the ones
 * an expiry would otherwise have archived. They are left alone on purpose
 * (#1756), and the warning is what keeps that skip from being silent. Candidates
 * that were already archived or superseded are not listed: expiry did not apply
 * to them, so calling them skipped would be inaccurate.
 *
 * @param {{ indexPath: string, now?: Date }} opts
 * @returns {{ count: number, results: Array<{ id: string, willExpire: boolean, statusSync: object|null }>, warnings: string[] }}
 */
export function retirePromotions({ indexPath, now = new Date() }) {
  const index = loadMemory(indexPath);
  const results = [];
  const warnings = [];
  for (const entry of listPromotionCandidates(index, { includeInactive: true })) {
    const plan = planPromotionRetire(entry, { now });
    if (plan.unparseableExpiresAt) {
      warnings.push(
        // No "re-issue the candidate" advice: proposePromotionCandidate is
        // idempotent on the content-hash id (promotion-candidates.mjs:674-731),
        // so a re-run converges on this same entry and never rewrites its
        // expiresAt. Repairing the stored value is the only available action.
        `${entry.id}: expiresAt ${JSON.stringify(entry.expiresAt)} is not a parseable timestamp; the expiry archive was skipped. Repair the value in the index — re-running \`promote propose\` converges on the existing id and leaves expiresAt untouched.`
      );
    }
    if (!plan.willChange) continue;
    let applied;
    updateEntry(indexPath, entry.id, (live) => {
      applied = applyPromotionRetire(live, { now });
    });
    results.push({ id: entry.id, willExpire: applied.willExpire, statusSync: applied.statusSync });
  }
  return { count: results.length, results, warnings };
}

/**
 * Deterministically measure the post-activation effectiveness of a promoted
 * candidate against a feedback set. Feedback must (a) belong to the same skill
 * (the clusterKey's skillId) and (b) be strictly newer than `since`. A negative
 * signal is a cluster-scoped recurrence (feedback of the candidate's own
 * feedbackType) or a skill-scoped reversal — see isNegativeFeedback for the
 * scope rationale.
 *
 * `negativeCount` is DEDUPLICATED by findingFingerprint: multiple feedback rows
 * that share one fingerprint count as a single distinct finding, so a single
 * re-litigated finding cannot inflate the threshold. Rows with a null fingerprint
 * (Phase 1 allows null, #1568 decision 2) fall back to per-entry counting.
 * `clusterRecurrenceCount` and `reversalCount` are the raw (non-deduplicated)
 * component tallies surfaced for #1545 (Reviewer Lens Effectiveness).
 *
 * @param {object} entry - a promotion_candidate entry
 * @param {Array<object>} feedbackEntries - feedback records (feedback.mjs shape)
 * @param {{ since?: string|null }} [opts] - ISO activation timestamp cutoff
 * @returns {{ skillId: string|null, feedbackType: string|null, since: string|null, related: number, clusterRecurrenceCount: number, reversalCount: number, negativeCount: number }}
 */
export function computeEffectivenessMetrics(entry, feedbackEntries, { since = null } = {}) {
  const pc = getPromotionCandidate(entry);
  const skillId = skillIdFromClusterKey(pc?.clusterKey);
  const feedbackType = feedbackTypeFromClusterKey(pc?.clusterKey);
  const sinceMs = since ? new Date(since).getTime() : null;
  let related = 0;
  let clusterRecurrenceCount = 0;
  let reversalCount = 0;
  // Distinct-negative accounting: a finding counts once regardless of how many
  // feedback rows share its fingerprint; null-fingerprint rows count per entry.
  const seenFingerprints = new Set();
  let nullFingerprintNegatives = 0;
  for (const fb of feedbackEntries ?? []) {
    if (skillId && fb?.skillId !== skillId) continue; // skill scope
    if (sinceMs != null) {
      const ts = new Date(fb?.timestamp ?? 0).getTime();
      if (!(ts > sinceMs)) continue; // strictly after activation
    }
    related++;
    if (feedbackType != null && fb.feedbackType === feedbackType) clusterRecurrenceCount++;
    if (fb.reversedBy) reversalCount++;
    if (isNegativeFeedback(fb, { clusterFeedbackType: feedbackType })) {
      const fingerprint = fb.findingFingerprint ?? null;
      if (fingerprint) seenFingerprints.add(fingerprint);
      else nullFingerprintNegatives++;
    }
  }
  const negativeCount = seenFingerprints.size + nullFingerprintNegatives;
  return {
    skillId,
    feedbackType,
    since: since ?? null,
    related,
    clusterRecurrenceCount,
    reversalCount,
    negativeCount,
  };
}

/**
 * Review a promoted candidate's effectiveness. When negative signals reach the
 * threshold the candidate transitions to needs_review; the metrics and decision
 * are appended to `context.effectivenessHistory` (append-only) and
 * `context.effectiveness` points at the latest record.
 *
 * Idempotent: only an in-effect candidate (approved/active) is reviewed, and a
 * breach flips it out of that set, so a second run is a no-op. Non-breach
 * (retained) reviews do not mutate the entry — the metrics are surfaced only in
 * the return value, so repeated runs never grow the history. Per #1545 the
 * metrics are surfaced, not fed back into any judgment.
 *
 * @param {object} entry - a promotion_candidate entry
 * @param {Array<object>} feedbackEntries
 * @param {{ now?: Date, threshold?: number, reviewer?: string|null }} [opts]
 * @returns {{ changed: boolean, eligible: boolean, breached: boolean, metrics: object, record: object|null, note: string|null }}
 */
export function applyEffectivenessReview(
  entry,
  feedbackEntries,
  { now = new Date(), threshold = DEFAULT_EFFECTIVENESS_THRESHOLD, reviewer = null } = {}
) {
  const pc = getPromotionCandidate(entry);
  if (!pc) {
    throw new Error(`Entry ${entry?.id} is not a promotion_candidate.`);
  }
  const metrics = computeEffectivenessMetrics(entry, feedbackEntries, {
    since: entry.context?.approval?.decidedAt ?? null,
  });
  if (!IN_EFFECT_PROMOTION_STATUSES.includes(pc.promotionStatus)) {
    return {
      changed: false,
      eligible: false,
      breached: false,
      metrics,
      record: null,
      note: `not in effect (promotionStatus=${pc.promotionStatus}); only ${IN_EFFECT_PROMOTION_STATUSES.join('/')} are reviewed`,
    };
  }
  const breached = metrics.negativeCount >= threshold;
  const reviewedAt = now.toISOString();
  const record = {
    reviewedAt,
    threshold,
    reviewer: reviewer ?? null,
    from: pc.promotionStatus,
    decision: breached ? 'needs_review' : 'retained',
    metrics,
  };
  if (!breached) {
    return { changed: false, eligible: true, breached: false, metrics, record, note: null };
  }
  pc.promotionStatus = 'needs_review';
  entry.context.effectivenessHistory = entry.context.effectivenessHistory ?? [];
  entry.context.effectivenessHistory.push(record);
  entry.context.effectiveness = record;
  entry.metadata = entry.metadata ?? {};
  entry.metadata.updatedAt = reviewedAt;
  return { changed: true, eligible: true, breached: true, metrics, record, note: null };
}

/**
 * I/O wrapper: load the index, review promoted candidates against a feedback
 * set, and persist any that flip to needs_review. When `id` is given only that
 * candidate is reviewed. Idempotent (see applyEffectivenessReview).
 *
 * @param {{ indexPath: string, feedbackEntries: Array<object>, now?: Date, threshold?: number, reviewer?: string|null, id?: string|null }} opts
 * @returns {{ count: number, flagged: number, results: Array<{ id: string, changed: boolean, breached: boolean, eligible: boolean, metrics: object, note: string|null }> }}
 */
export function reviewPromotionEffectiveness({
  indexPath,
  feedbackEntries,
  now = new Date(),
  threshold = DEFAULT_EFFECTIVENESS_THRESHOLD,
  reviewer = null,
  id = null,
}) {
  const index = loadMemory(indexPath);
  const all = listPromotionCandidates(index, { includeInactive: true });
  const targets = id ? all.filter((e) => e.id === id) : all;
  if (id && !targets.length) {
    throw new Error(`No promotion_candidate entry with id: ${id}`);
  }
  const results = [];
  let flagged = 0;
  for (const entry of targets) {
    // Preview on a clone so we only persist entries that actually transition
    // (keeps the write idempotent — unchanged bytes are never rewritten).
    const preview = applyEffectivenessReview(structuredClone(entry), feedbackEntries, {
      now,
      threshold,
      reviewer,
    });
    if (preview.changed) {
      updateEntry(indexPath, entry.id, (live) =>
        applyEffectivenessReview(live, feedbackEntries, { now, threshold, reviewer })
      );
      flagged++;
    }
    results.push({
      id: entry.id,
      changed: preview.changed,
      breached: preview.breached,
      eligible: preview.eligible,
      metrics: preview.metrics,
      note: preview.note,
    });
  }
  return { count: results.length, flagged, results };
}

// Per-kind PR scaffold shape. `paths(pc)` yields the changed-file path templates;
// `title(clusterKey)` builds the conventional-commit PR title.
const KIND_TEMPLATE = Object.freeze({
  fixture: {
    branchPrefix: 'promote/fixture',
    title: (k) => `test(fixture): codify ${k} as a guard fixture`,
    paths: (pc) => [`skills/**/fixtures/${safeTargetId(pc, '<fixture-id>')}.md`],
  },
  test: {
    branchPrefix: 'promote/test',
    title: (k) => `test: add regression coverage for ${k}`,
    paths: () => ['tests/<area>.test.mjs'],
  },
  skill: {
    branchPrefix: 'promote/skill',
    title: (k) => `docs(skill): refine ${k} skill contract`,
    paths: (pc) => [`skills/**/${safeTargetId(pc, '<skill-id>')}/SKILL.md`],
  },
  reference: {
    branchPrefix: 'promote/reference',
    title: (k) => `docs(reference): codify ${k} experience knowledge`,
    paths: (pc) => [safeReferenceTargetPath(pc)],
  },
  rule: {
    branchPrefix: 'promote/rule',
    title: (k) => `chore(rules): promote ${k} to project rules`,
    paths: () => ['.river/rules.md'],
  },
  routing: {
    branchPrefix: 'promote/routing',
    title: (k) => `fix(routing): clarify owner skill for ${k}`,
    paths: () => ['skills/registry.yaml'],
  },
  riverbed: {
    branchPrefix: 'promote/riverbed',
    title: (k) => `chore(riverbed): record ${k} as durable memory`,
    paths: () => ['.river/memory/index.json'],
  },
  docs: {
    branchPrefix: 'promote/docs',
    title: (k) => `docs: document ${k}`,
    paths: () => ['docs/<area>.md'],
  },
  linter: {
    branchPrefix: 'promote/linter',
    title: (k) => `feat(linter): add deterministic check for ${k}`,
    paths: () => ['scripts/<linter>.mjs'],
  },
});

function renderBody({ pc, entry, kind, targetPaths }) {
  const evidence = (pc.evidence ?? []).map((e) => {
    const pr = e.pr ? `#${e.pr}` : '(pr unknown)';
    const fp = e.findingFingerprint ? ` fingerprint=${e.findingFingerprint}` : '';
    return `- ${pr} (${e.feedbackType})${fp}`;
  });
  const approval = entry.context?.approval;
  const lines = [
    `## Summary`,
    ``,
    `Promote the recurring judgment \`${pc.clusterKey}\` (recurrence: ${pc.recurrenceCount}) into a versioned asset.`,
    ``,
    `Rationale: ${pc.rationale}`,
    ``,
    `## Proposed target`,
    ``,
    `- kind: ${kind}`,
    `- id: ${pc.proposedTarget?.id ?? '(none)'}`,
    `- changed-file templates:`,
    ...targetPaths.map((p) => `  - \`${p}\``),
    ``,
    `## Scope`,
    ``,
    pc.scope?.paths?.length
      ? pc.scope.paths.map((p) => `- \`${p}\``).join('\n')
      : '- (none yet — narrow the scope before merging)',
    ``,
    `## Exceptions`,
    ``,
    pc.exceptions?.length ? pc.exceptions.map((e) => `- ${e}`).join('\n') : '- (none)',
    ``,
    `## Evidence`,
    ``,
    ...(evidence.length ? evidence : ['- (no source PRs recorded)']),
    ``,
    `## Approval`,
    ``,
    `- decision: ${approval?.decision ?? '(pending)'}`,
    `- approver: ${approval?.approver ?? '(unknown)'}`,
    `- decidedAt: ${approval?.decidedAt ?? '(unknown)'}`,
    ...(approval?.reason ? [`- reason: ${approval.reason}`] : []),
    ``,
    `## Checklist`,
    ``,
    `- [ ] Narrow \`scope.paths\` to the minimal set`,
    `- [ ] Fill in the actual change for the target above`,
    `- [ ] Confirm the recurrence is still valid`,
    ``,
    `_Generated by \`river promote template\` (candidate ${entry.id}). No files were changed._`,
  ];
  return lines.join('\n');
}

function renderPlanGateBody({ pc, entry }) {
  return [
    `## PlanGate delegation required`,
    ``,
    `Candidate \`${pc.clusterKey}\` (recurrence: ${pc.recurrenceCount}) is security/compliance`,
    `sensitive. Per #1568 decision 5, its promotion approval is delegated to PlanGate`,
    `rather than approved through the normal PR scaffold.`,
    ``,
    `Do not open a direct merge PR from this template. Route the promotion through`,
    `PlanGate's approval flow, then apply the resulting change.`,
    ``,
    `- proposedTarget.kind: ${pc.proposedTarget?.kind ?? '(unknown)'}`,
    `- rationale: ${pc.rationale}`,
    ``,
    `_Generated by \`river promote template\` (candidate ${entry.id})._`,
  ].join('\n');
}

/**
 * Build a PR scaffold for an approved promotion_candidate entry. Returns a
 * text-only description (branch name, PR title, PR body, changed-file path
 * templates). No files are changed.
 *
 * Rules:
 *  - Only approved candidates are eligible (`eligible: false` otherwise).
 *  - Security/compliance-sensitive candidates set `requiresPlanGate: true` and
 *    emit a delegation notice instead of a mergeable scaffold (#1568 decision 5).
 *  - `human_judgment` kind produces no mergeable scaffold (needs a person).
 *
 * @param {object} entry - a promotion_candidate entry
 * @returns {{
 *   id: string, clusterKey: string, kind: string, eligible: boolean,
 *   requiresPlanGate: boolean, branchName: string|null, prTitle: string|null,
 *   prBody: string|null, targetPaths: string[], note: string|null,
 * }}
 */
export function buildPrScaffold(entry) {
  const pc = getPromotionCandidate(entry);
  if (!pc) {
    throw new Error(`Entry ${entry?.id} is not a promotion_candidate.`);
  }
  const kind = pc.proposedTarget?.kind ?? 'human_judgment';
  const clusterKey = pc.clusterKey;
  const base = {
    id: entry.id,
    clusterKey,
    kind,
    eligible: false,
    requiresPlanGate: false,
    branchName: null,
    prTitle: null,
    prBody: null,
    targetPaths: [],
    note: null,
  };

  if (pc.promotionStatus !== 'approved') {
    return {
      ...base,
      note: `not approved (promotionStatus=${pc.promotionStatus}); approve it first`,
    };
  }

  if (isSecuritySensitive(entry)) {
    return {
      ...base,
      eligible: true,
      requiresPlanGate: true,
      branchName: `promote/plangate/${slugify(clusterKey)}`,
      prTitle: `chore(plangate): route ${clusterKey} promotion through PlanGate`,
      prBody: renderPlanGateBody({ pc, entry }),
      note: 'security/compliance promotion — PlanGate approval required (#1568 decision 5)',
    };
  }

  if (kind === 'human_judgment') {
    return {
      ...base,
      eligible: true,
      note: 'kind=human_judgment: no mergeable asset — decide and act manually',
    };
  }

  const template = KIND_TEMPLATE[kind];
  if (!template) {
    return {
      ...base,
      eligible: true,
      note: `unknown proposedTarget.kind=${kind}; no scaffold template`,
    };
  }

  const targetPaths = template.paths(pc);
  return {
    ...base,
    eligible: true,
    branchName: `${template.branchPrefix}/${slugify(clusterKey)}`,
    prTitle: template.title(clusterKey),
    prBody: renderBody({ pc, entry, kind, targetPaths }),
    targetPaths,
  };
}
