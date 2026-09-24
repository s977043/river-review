// Apply Riverbed Memory suppressions to a list of findings (#687 PR-B).
//
// PR-A landed the data model (suppression context schema and the new
// fingerprint / feedbackType / severity fields on createSuppression). This
// PR-B is the gate that consumes those entries: given a list of findings
// already annotated with fingerprints (see src/lib/finding-factory.mjs)
// and a memoryContext loaded by src/lib/memory-context.mjs, it splits the
// findings into kept vs suppressed and returns observability metadata.
//
// PR-C of #687 will inject one call to applySuppressions inside
// src/lib/local-runner.mjs:runLocalReview between annotateFingerprints and
// the return statement so the pipeline behavior changes there, not here.
//
// P1 guard policy (do not silently auto-suppress dangerous findings):
//   - findings of severity `major` or `critical` are kept unless the
//     suppression's feedbackType is explicitly `accepted_risk`.
//   - lower severities (`minor`, `info`) are auto-suppressed for any
//     non-expired suppression that matches the fingerprint.
//   - the per-suppression `minSeverityToAutoSuppress` (added in PR-A)
//     can RAISE the bar but never lower it; the global P1 guard wins.
//
// Expiry (#1802): a suppression whose `context.expiresAt` has passed no
// longer suppresses anything. The expiry rule is NOT re-derived here — it
// delegates to `isSuppressionExpired` (src/lib/suppression.mjs), the same
// single definition `findActiveSuppressions` applies, so the review path
// and the regression-eval / resurface paths cannot answer differently for
// the same entry. An unparseable `expiresAt` fails safe to expired and is
// reported through the `warn` sink (mirroring #1780/#1801 in
// `findActiveSuppressions`) rather than dropped silently.
//
// Fingerprint algorithms (#1797): a suppression's `context.fingerprintAlgo`
// selects which finding-side fingerprint it is matched against.
//   - 'v1' (or absent, the pre-#1797 shape): matched against
//     `finding.fingerprint` (computeFingerprint — no line, so one entry
//     suppresses every same-kind finding in the same file).
//   - 'v2': matched against `finding.fingerprintV2` (computeFingerprintV2 —
//     line-anchored, so only the occurrence at that line is suppressed;
//     the trade-off is that the suppression stops matching when the line
//     shifts).
//   - any other value: ignored (fail-safe — an unknown algorithm must not
//     accidentally gate findings under v1 semantics) AND reported through the
//     `warn` sink, so a suppression that silently stopped working is visible
//     the same way an unparseable `expiresAt` is (#1780/#1801).
//
// Project-rules match (#2202 Phase 2, opt-in): when
// `config.memory.suppressionRequireRulesMatch === true`, a suppression whose
// `context.rulesDigest` was recorded under different project rules no longer
// suppresses anything. The verdict comes from `evaluateSuppressionRulesMatch`
// (src/lib/suppression.mjs), a predicate kept apart from `isSuppressionExpired`
// because the two fail safe in opposite directions: an entry this gate cannot
// judge (no rulesDigest, no current rules, or an unknown `rulesDigestAlgo`)
// keeps suppressing. An unknown `rulesDigestAlgo` is reported through `warn`
// exactly like an unknown `fingerprintAlgo`; a mismatch is recorded in
// `applied` as `reason: 'rules-digest-mismatch'` and warned once per entry.
// With the option off (the default) the predicate is never called, so the
// result is identical to the pre-Phase-2 gate.
//
// Turned-off entries (#2425, #2430): a suppression whose `context.active` is
// present but falsy (false / 0 / null / ''), or one revoked by a `resurface`
// entry, is not in force and is dropped before fingerprint indexing, so it can
// neither gate a finding nor shadow another entry with the same fingerprint.
// An entry whose `active` is missing or undefined keeps suppressing as before
// (createSuppression always writes `active: true`, so a missing field is a
// hand-written entry, and treating it as off would silently disable it).
// Expired entries (#2430) are still indexed, so `applied` can record
// `suppression-expired` when no in-force entry exists, but an expired entry
// never replaces an in-force one with the same fingerprint, whatever the
// order. The revoked ids come from `memoryContext.revokedSuppressionIds`,
// which `loadReviewMemory` builds from the whole index with
// `collectRevokedSuppressionIds` — the revoking entry has no phase, so it never reaches the `suppressions` bucket.
// `revokeSuppression` does not flip the original's `context.active`, which is
// why both checks are needed. Entry `status` (superseded / archived) is not
// filtered, like `findActiveSuppressions`.

import { SEVERITY_RANK } from './finding-factory.mjs';
import {
  isSuppressionExpired,
  hasUnparseableSuppressionExpiresAt,
  formatUnparseableExpiresAtWarning,
  formatUnknownFingerprintAlgoWarning,
  evaluateSuppressionRulesMatch,
  formatUnknownRulesDigestAlgoWarning,
  formatRulesDigestMismatchWarning,
} from './suppression.mjs';

const HIGH_SEVERITY = new Set(['major', 'critical']);

/**
 * Whether the opt-in project-rules match gate (#2202 Phase 2) is on. Checked
 * strictly (`=== true`) so no near-miss value turns off suppressions that are
 * in force today; the default (absent) is off.
 *
 * @param {object | undefined} config effective config
 * @returns {boolean}
 */
export function isSuppressionRulesMatchEnabled(config) {
  return config?.memory?.suppressionRequireRulesMatch === true;
}

function severityOf(finding) {
  return String(finding.severity || 'info').toLowerCase();
}

/**
 * Apply matching suppressions to findings.
 *
 * @param {Array<object>} findings  Findings already annotated with `.fingerprint`
 *   by `annotateFingerprints` (src/lib/finding-factory.mjs).
 * @param {object} memoryContext    Bucketed memory from `loadReviewMemory`.
 *   `memoryContext.suppressions` is consulted, and
 *   `memoryContext.revokedSuppressionIds` (string[], optional) names the
 *   suppressions to skip as revoked (#2425).
 * @param {object} [opts]
 * @param {object} [opts.config]    Effective config; `config.memory.suppressionEnabled === false`
 *   bypasses suppression entirely (returns all findings as-is).
 * @param {(msg: string) => void} [opts.warn]  Sink for the warnings this gate
 *   emits: an unparseable `expiresAt` (#1801) and an unsupported
 *   `fingerprintAlgo` (#1797). Both name a suppression that stopped taking
 *   effect for a repairable reason. Injectable for tests, defaults to
 *   `console.warn` — the same contract as `findActiveSuppressions`.
 * @param {Date} [opts.now]         Reference instant for the expiry decision.
 *   Injectable for tests, defaults to `new Date()`.
 * @param {string | null} [opts.rulesText] Current project rules text
 *   (`loadProjectRules(...).rulesText`). Read only when
 *   `config.memory.suppressionRequireRulesMatch === true` (#2202 Phase 2);
 *   absent or null means the rules cannot be compared, and no entry is stopped
 *   on that axis.
 * @returns {{ keptFindings: Array<object>, suppressedFindings: Array<object>, applied: Array<object> }}
 *   `applied` is the observability log. Each entry: `{ fingerprint, suppressionId,
 *   feedbackType, severity, action: 'suppressed' | 'skipped', reason? }`. Findings
 *   moved to `suppressedFindings` carry a `status: 'suppressed'` flag and a
 *   `suppressionRef` pointing back at the suppression entry id.
 */
export function applySuppressions(findings, memoryContext, opts = {}) {
  const list = Array.isArray(findings) ? findings : [];
  const result = { keptFindings: list, suppressedFindings: [], applied: [] };

  if (opts?.config?.memory?.suppressionEnabled === false) return result;

  const suppressions = memoryContext?.suppressions;
  if (!Array.isArray(suppressions) || suppressions.length === 0) return result;
  if (list.length === 0) return result;

  // Index suppressions by canonical fingerprint, split by algorithm (#1797).
  // Entries that lack a fingerprint (pre-#687 PR-A) are intentionally
  // ignored — they cannot gate findings safely without reintroducing the old
  // hashFinding / computeFingerprint mismatch that PR-A documented as tech
  // debt. Entries with an unknown fingerprintAlgo are ignored for the same
  // fail-safe reason.
  const warn = opts?.warn ?? ((m) => console.warn(m));
  const byFingerprintV1 = new Map();
  const byFingerprintV2 = new Map();
  // #2202 Phase 2: rules-match verdicts, filled only when the gate is opted in.
  // With the gate off this stays null and nothing below reads the rules.
  const rulesMismatched = isSuppressionRulesMatchEnabled(opts?.config) ? new Set() : null;
  const rulesDigests = new Map();
  const now = opts?.now ?? new Date();
  const revokedIds = new Set(
    Array.isArray(memoryContext?.revokedSuppressionIds) ? memoryContext.revokedSuppressionIds : []
  );
  for (const s of suppressions) {
    // #2425: turned off explicitly, or revoked by a resurface entry.
    const active = s?.context?.active;
    if ((active !== undefined && !active) || revokedIds.has(s?.id)) continue;
    const fp = s?.context?.fingerprint;
    if (typeof fp !== 'string' || fp.length !== 16) continue;
    const algo = s?.context?.fingerprintAlgo ?? 'v1';
    let target;
    if (algo === 'v1') target = byFingerprintV1;
    else if (algo === 'v2') target = byFingerprintV2;
    else {
      // The entry is otherwise usable (it carries a canonical fingerprint) and
      // stops taking effect only because of the algo value. Report it through
      // the same `warn` sink as the expiry stop (#1780/#1801) rather than
      // dropping it in silence; the value is repairable.
      warn(formatUnknownFingerprintAlgoWarning({ id: s.id, fingerprintAlgo: algo }));
      continue;
    }
    if (rulesMismatched) {
      const verdict = evaluateSuppressionRulesMatch(s, opts?.rulesText, { digests: rulesDigests });
      if (verdict.status === 'mismatch') rulesMismatched.add(s);
      // Unknown digest version: not judged on this axis (the entry keeps
      // suppressing), reported through the same sink as an unknown
      // fingerprintAlgo so the pass-through is visible.
      else if (verdict.status === 'unknown-algo') {
        warn(
          formatUnknownRulesDigestAlgoWarning({
            id: s.id,
            rulesDigestAlgo: verdict.rulesDigestAlgo,
          })
        );
      }
    }
    const prev = target.get(fp);
    if (!prev || !isSuppressionExpired(s, now) || isSuppressionExpired(prev, now)) {
      target.set(fp, s);
    }
  }
  if (byFingerprintV1.size === 0 && byFingerprintV2.size === 0) return result;

  const kept = [];
  const suppressed = [];
  const applied = [];
  const warnedIds = new Set();
  const rulesWarnedIds = new Set();

  for (const finding of list) {
    // v2 (line-anchored) is consulted first: it is the more specific claim.
    // When no v2 entry matches, fall back to v1. `fp` is the fingerprint the
    // matching entry stores, so `applied` records the value that actually
    // gated the finding (v2 hex for a v2 match).
    const fpV2 = finding?.fingerprintV2;
    const matchV2 = fpV2 ? byFingerprintV2.get(fpV2) : undefined;
    const fpV1 = finding?.fingerprint;
    const match = matchV2 ?? (fpV1 ? byFingerprintV1.get(fpV1) : undefined);
    const fp = matchV2 ? fpV2 : fpV1;
    const matchedAlgo = matchV2 ? 'v2' : 'v1';
    if (!match) {
      kept.push(finding);
      continue;
    }

    const sev = severityOf(finding);
    const feedbackType = match.context?.feedbackType ?? null;
    const minSeverity = match.context?.minSeverityToAutoSuppress;

    // Expiry gate (#1802): an expired suppression is not in force, whatever
    // its other fields say. Evaluated BEFORE the severity gates so `applied`
    // records the real reason the entry did nothing. `isSuppressionExpired`
    // fails safe to expired on an unparseable deadline (#1746); that stop is
    // made observable through `warn`, once per suppression, matching the
    // findActiveSuppressions warning path (#1801).
    if (isSuppressionExpired(match, now)) {
      kept.push(finding);
      applied.push({
        fingerprint: fp,
        suppressionId: match.id,
        fingerprintAlgo: matchedAlgo,
        feedbackType,
        severity: sev,
        action: 'skipped',
        reason: 'suppression-expired',
      });
      if (hasUnparseableSuppressionExpiresAt(match) && !warnedIds.has(match.id)) {
        warnedIds.add(match.id);
        warn(
          formatUnparseableExpiresAtWarning({ id: match.id, expiresAt: match.context.expiresAt })
        );
      }
      continue;
    }

    // Project-rules gate (#2202 Phase 2, opt-in). After the expiry gate so an
    // expired entry keeps its pre-Phase-2 `applied` record; before the
    // severity gates so `applied` names the reason the entry did nothing.
    if (rulesMismatched?.has(match)) {
      kept.push(finding);
      applied.push({
        fingerprint: fp,
        suppressionId: match.id,
        fingerprintAlgo: matchedAlgo,
        feedbackType,
        severity: sev,
        action: 'skipped',
        reason: 'rules-digest-mismatch',
      });
      if (!rulesWarnedIds.has(match.id)) {
        rulesWarnedIds.add(match.id);
        warn(formatRulesDigestMismatchWarning({ id: match.id }));
      }
      continue;
    }

    // Per-suppression cap: `minSeverityToAutoSuppress` is the highest
    // severity this entry is allowed to auto-suppress. A finding above
    // that rank stays.
    if (minSeverity && SEVERITY_RANK[sev] > SEVERITY_RANK[String(minSeverity).toLowerCase()]) {
      kept.push(finding);
      applied.push({
        fingerprint: fp,
        suppressionId: match.id,
        fingerprintAlgo: matchedAlgo,
        feedbackType,
        severity: sev,
        action: 'skipped',
        reason: 'severity-above-min-severity-cap',
      });
      continue;
    }

    // Global P1 guard: never auto-suppress major/critical without
    // accepted_risk. Other feedbackTypes (false_positive, wont_fix, ...)
    // require manual handling for high-severity findings.
    if (HIGH_SEVERITY.has(sev) && feedbackType !== 'accepted_risk') {
      kept.push(finding);
      applied.push({
        fingerprint: fp,
        suppressionId: match.id,
        fingerprintAlgo: matchedAlgo,
        feedbackType,
        severity: sev,
        action: 'skipped',
        reason: 'high-severity-requires-accepted-risk',
      });
      continue;
    }

    suppressed.push({
      ...finding,
      status: 'suppressed',
      suppressionRef: match.id,
      // Which algorithm gated this finding (#1797). Consumed by
      // local-runner.mjs to filter the matching PR comment with the SAME
      // granularity: a v2 (line-anchored) suppression must not drop every
      // same-kind comment in the file.
      suppressionAlgo: matchedAlgo,
    });
    applied.push({
      fingerprint: fp,
      suppressionId: match.id,
      fingerprintAlgo: matchedAlgo,
      feedbackType,
      severity: sev,
      action: 'suppressed',
    });
  }

  return { keptFindings: kept, suppressedFindings: suppressed, applied };
}
