import crypto from 'node:crypto';
import {
  appendEntry,
  hasUnparseableExpiresAt,
  isExpired,
  loadMemory,
  queryMemory,
} from './riverbed-memory.mjs';
import {
  CURRENT_RULES_DIGEST_ALGO,
  RULES_DIGEST_ALGOS,
  computeRulesDigest,
  loadProjectRulesDigest,
} from './rules.mjs';
import { loadAllSkillMetadata } from '../../runners/core/skill-loader.mjs';

/**
 * Create a stable content hash from a finding's key fields.
 * @param {{ file?: string, message?: string, ruleId?: string }} finding
 * @returns {string}
 */
export function hashFinding(finding) {
  const key = [finding.file || '', finding.message || '', finding.ruleId || ''].join('::');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Extract subsystem identifier from a file path.
 * e.g. 'src/auth/handler.ts' -> 'auth', 'src/lib/utils.mjs' -> 'lib'
 * @param {string} filePath
 * @returns {string}
 */
export function inferSubsystem(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'src') return parts[1];
  if (parts.length >= 2) return parts[0];
  return '';
}

/**
 * Create a suppression record in Riverbed Memory.
 *
 * `feedbackType`, `fingerprint`, `severity`, `minSeverityToAutoSuppress`,
 * `duplicateOfFingerprint`, `sourceCommentId` are introduced in #687 PR-A as
 * the data model for auto-suppression; they default to undefined so existing
 * call sites remain compatible. The shape of the resulting `context` is
 * validated by `schemas/suppression-context.schema.json`.
 *
 * `skillId`, `skillVersion` and `rulesDigest` (#2202 Phase 0) record the
 * provenance of the review criteria at issuance time: which skill produced the
 * suppressed finding, that skill's `version`, and the digest of the project
 * rules. `isSuppressionExpired` does not read them. `rulesDigest` is read by
 * the opt-in rules-match gate (#2202 Phase 2, `evaluateSuppressionRulesMatch`),
 * which needs `rulesDigestAlgo` to know which digest version it holds.
 * Like the other optional fields, each is written only when it is a non-empty
 * string; an absent value leaves the key out entirely (no null, no ""), so an
 * entry without provenance is indistinguishable from one written before
 * #2202. `rulesDigestAlgo` is written only together with `rulesDigest`; when
 * it is left out the digest is read as `'v1'`. Use
 * `resolveSuppressionProvenance` to derive the values.
 *
 * @param {object} options
 * @returns {object} The created suppression entry
 */
export function createSuppression({
  indexPath,
  findingId,
  findingHash,
  fingerprint,
  fingerprintAlgo = 'v1',
  feedbackType,
  severity,
  minSeverityToAutoSuppress,
  duplicateOfFingerprint,
  filePaths,
  rationale,
  scope = 'file',
  expiresAt,
  prNumber,
  sourceCommentId,
  skillId,
  skillVersion,
  rulesDigest,
  rulesDigestAlgo,
  author = 'river-review',
}) {
  if (!rationale) throw new Error('Suppression requires a rationale');

  const idSeed = fingerprint || findingHash || hashFinding({ file: filePaths?.[0] });

  const context = {
    findingId: findingId || null,
    findingHash: findingHash || null,
    scope,
    active: true,
  };
  if (fingerprint) {
    context.fingerprint = fingerprint;
    context.fingerprintAlgo = fingerprintAlgo;
  }
  if (feedbackType) context.feedbackType = feedbackType;
  if (severity) context.severity = severity;
  if (minSeverityToAutoSuppress) context.minSeverityToAutoSuppress = minSeverityToAutoSuppress;
  if (duplicateOfFingerprint) context.duplicateOfFingerprint = duplicateOfFingerprint;
  if (expiresAt) context.expiresAt = expiresAt;
  // Reject NaN / non-integer / non-positive values so the entry stays consistent
  // with suppression-context.schema.json (`integer`, `minimum: 1`).
  if (Number.isInteger(prNumber) && prNumber > 0) context.sourcePR = prNumber;
  if (Number.isInteger(sourceCommentId) && sourceCommentId > 0) {
    context.sourceCommentId = sourceCommentId;
  }
  if (isNonEmptyString(skillId)) context.skillId = skillId;
  if (isNonEmptyString(skillVersion)) context.skillVersion = skillVersion;
  if (isNonEmptyString(rulesDigest)) {
    context.rulesDigest = rulesDigest;
    if (isNonEmptyString(rulesDigestAlgo)) context.rulesDigestAlgo = rulesDigestAlgo;
  }

  const entry = {
    id: 'suppression-' + idSeed + '-' + Date.now(),
    type: 'suppression',
    title: 'Suppress: ' + (findingId || 'finding'),
    content: rationale,
    metadata: {
      createdAt: new Date().toISOString(),
      author,
      tags: ['suppression', 'active', scope],
      relatedFiles: filePaths ?? [],
      ...(prNumber ? { links: ['PR#' + prNumber] } : {}),
    },
    context,
  };

  appendEntry(indexPath, entry);
  return entry;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Derive the review-criteria provenance that `createSuppression` records
 * (#2202 Phase 0). Every value comes from an existing SSoT:
 *
 * - `skillId` is the finding's `ruleId` — findings are built with
 *   `ruleId: c.skillId || 'unknown'` (local-runner.mjs / review-engine.mjs), so
 *   `'unknown'` is the "skill not identified" sentinel and is NOT recorded.
 * - `skillVersion` is the `version` of that skill's metadata as loaded by
 *   `loadAllSkillMetadata` (runners/core/skill-loader.mjs), or from the
 *   already-loaded `skills` list when the caller has one.
 * - `rulesDigest` is `loadProjectRulesDigest` (rules.mjs) over `repoRoot`,
 *   computed with `CURRENT_RULES_DIGEST_ALGO` (`'v2'`, normalized, #2202
 *   Phase 2) and returned together with `rulesDigestAlgo` naming that version.
 *
 * A value that cannot be determined is left out of the result (never null),
 * so spreading the result into `createSuppression` omits the key.
 *
 * @param {object} options
 * @param {string} [options.ruleId] - the suppressed finding's ruleId
 * @param {string} [options.repoRoot] - repository whose project rules apply
 * @param {Array<{ metadata?: { id?: string, version?: unknown } }>} [options.skills]
 *   already-loaded skills; loaded via `loadAllSkillMetadata` when omitted
 * @param {string} [options.skillsDir] - passed to `loadAllSkillMetadata`
 * @param {{ rulesPath?: string }} [options.rulesOptions] - passed to `loadProjectRulesDigest`
 * @returns {Promise<{ skillId?: string, skillVersion?: string, rulesDigest?: string, rulesDigestAlgo?: string }>}
 */
export async function resolveSuppressionProvenance({
  ruleId,
  repoRoot,
  skills,
  skillsDir,
  rulesOptions,
} = {}) {
  const provenance = {};
  if (isNonEmptyString(ruleId) && ruleId !== 'unknown') {
    provenance.skillId = ruleId;
    const list = Array.isArray(skills)
      ? skills
      : await loadAllSkillMetadata(skillsDir ? { skillsDir } : {});
    const version = list.find((s) => s?.metadata?.id === ruleId)?.metadata?.version;
    if (isNonEmptyString(version)) provenance.skillVersion = version;
  }
  if (isNonEmptyString(repoRoot)) {
    const digest = await loadProjectRulesDigest(repoRoot, {
      ...rulesOptions,
      algo: CURRENT_RULES_DIGEST_ALGO,
    });
    if (isNonEmptyString(digest)) {
      provenance.rulesDigest = digest;
      provenance.rulesDigestAlgo = CURRENT_RULES_DIGEST_ALGO;
    }
  }
  return provenance;
}

/**
 * Revoke a suppression by appending a resurface entry (append-only).
 * @param {string} indexPath
 * @param {string} suppressionId
 * @param {{ author?: string, reason?: string }} options
 * @returns {object} The resurface entry
 */
export function revokeSuppression(
  indexPath,
  suppressionId,
  { author = 'river-review', reason = 'revoked' } = {}
) {
  const entry = {
    id: 'resurface-' + suppressionId + '-' + Date.now(),
    type: 'resurface',
    title: 'Revoke: ' + suppressionId,
    content: reason,
    metadata: {
      createdAt: new Date().toISOString(),
      author,
      tags: ['resurface', 'revocation'],
    },
    context: {
      suppressionId,
      action: 'revoke',
    },
  };

  appendEntry(indexPath, entry);
  return entry;
}

/**
 * Check if any of the changed files match the suppression's scope.
 * Shared by findActiveSuppressions and resurface logic.
 * @param {string} scope - 'global' | 'subsystem' | 'file'
 * @param {string[]} relatedFiles - Files associated with the suppression
 * @param {string[]} changedFiles - Files in the current change set
 * @returns {boolean}
 */
export function matchesScopeFiles(scope, relatedFiles, changedFiles) {
  if (!relatedFiles.length || !changedFiles.length) return false;
  if (scope === 'global') return true;
  if (scope === 'subsystem') {
    const suppressionSubs = new Set(relatedFiles.map(inferSubsystem).filter(Boolean));
    return changedFiles.some((fp) => suppressionSubs.has(inferSubsystem(fp)));
  }
  return changedFiles.some((fp) => relatedFiles.includes(fp));
}

/**
 * Whether a suppression entry's `context.expiresAt` has passed.
 *
 * Delegates to riverbed-memory's `isExpired`, the single definition of the
 * expiry rule, instead of comparing the raw string. The former
 * `context.expiresAt < new Date().toISOString()` comparison was a LEXICAL one:
 * a value that is not an ISO timestamp (`"notadate"`, persisted by
 * `suppression add --expires notadate` before #1746 was fixed) sorted after
 * every real timestamp, so such an entry never expired. Malformed values now
 * fail safe to expired, which deactivates the suppression rather than
 * suppressing findings forever.
 *
 * `onUnparseable: 'expired'` is passed explicitly, not left to the default: this
 * is the read-side consumer for which "expired" only stops an effect, so the
 * fail-safe direction stays the safe one. The write-side consumers (#1756) ask
 * for the opposite, and no call site should depend on which one the default is.
 *
 * @param {{ context?: { expiresAt?: string } }} suppression
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isSuppressionExpired(suppression, now = new Date()) {
  return isExpired({ expiresAt: suppression?.context?.expiresAt }, now, {
    onUnparseable: 'expired',
  });
}

/**
 * Whether a suppression's `context.expiresAt` is present but is not a valid
 * `expiresAt` value.
 *
 * The validity rule is NOT re-derived here: it delegates to
 * `hasUnparseableExpiresAt` (riverbed-memory.mjs), which in turn delegates to
 * `parseExpiresAt` (expires-at.mjs, the SSoT since #1777). The only thing this
 * wrapper adds is the field the suppression data model actually uses.
 * `createSuppression` writes the deadline to `context.expiresAt` and never to
 * the top-level `entry.expiresAt`, which is why `expireEntries`' warning — it
 * reads the top-level field — structurally cannot see a suppression's value
 * (#1780).
 *
 * @param {{ context?: { expiresAt?: string } }} suppression
 * @returns {boolean}
 */
export function hasUnparseableSuppressionExpiresAt(suppression) {
  return hasUnparseableExpiresAt({ expiresAt: suppression?.context?.expiresAt });
}

/**
 * The ids of suppressions revoked by a `resurface` entry.
 *
 * Revocation is append-only: `revokeSuppression` writes a separate entry and
 * never flips the original's `context.active`, so `context.active === true` is
 * NOT sufficient to decide that a suppression is still in force. Both consumers
 * — `findActiveSuppressions` and `findUnparseableSuppressionExpiries` — go
 * through this one function rather than each filtering `type: 'resurface'`
 * themselves, so the two cannot answer differently for the same index.
 *
 * Equivalent to `queryMemory(index, { type: 'resurface', includeInactive: true })`
 * followed by the `action === 'revoke'` filter: `includeInactive: true` applies
 * no status filter, so a plain type filter over `index.entries` is the same set.
 * Keeping revocations visible regardless of status is deliberate — a once
 * revoked suppression must not reactivate when the revoking entry is superseded.
 *
 * @param {object[]} entries - all memory entries (not only suppressions)
 * @returns {Set<string>}
 */
export function collectRevokedSuppressionIds(entries) {
  const ids = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.type !== 'resurface') continue;
    if (entry?.context?.action !== 'revoke') continue;
    if (entry?.context?.suppressionId) ids.add(entry.context.suppressionId);
  }
  return ids;
}

/**
 * Suppressions whose `context.expiresAt` cannot be parsed, and which are
 * therefore treated as expired by `isSuppressionExpired` (fail-safe, #1746).
 *
 * The fail-safe direction stays as it is: an unreadable deadline must not keep
 * hiding findings forever. What this function exists for is the OTHER half —
 * making the stop observable. Until #1780 a suppression written by the
 * v1.72.0–v1.72.1 CLI (which accepted anything `Date.parse` liked, e.g.
 * `2027-01-01T00:00:00` without an offset) simply stopped taking effect, with
 * no error, no warning, and no visible change in `.river/memory/index.json`.
 *
 * Only entries that were still in force are reported, because the report tells
 * the operator to repair a value. Two exclusions carry that:
 * `context.active === false` (never suppressing anything), and revoked by a
 * `resurface` entry (deliberately turned off, and `revokeSuppression` leaves
 * `context.active` set to true, so `active` alone does not see it).
 *
 * The report carries the entry id and the offending value only. The rationale,
 * related file paths and fingerprint are deliberately left out: the value is
 * what has to be repaired, and a warning stream is not a place to widen the
 * exposure of the surrounding record.
 *
 * @param {object[]} entries - memory entries; non-suppression entries are used
 *   to resolve revocations and are otherwise ignored
 * @returns {Array<{ id: string, expiresAt: string }>}
 */
export function findUnparseableSuppressionExpiries(entries) {
  if (!Array.isArray(entries)) return [];
  const revoked = collectRevokedSuppressionIds(entries);
  return entries
    .filter((s) => s?.type === 'suppression')
    .filter((s) => s?.context?.active && !revoked.has(s.id))
    .filter((s) => hasUnparseableSuppressionExpiresAt(s))
    .map((s) => ({ id: s.id, expiresAt: s.context.expiresAt }));
}

/**
 * The operator-facing sentence for one unparseable suppression deadline.
 * Shared so the `findActiveSuppressions` warning and the
 * `suppression-analytics` report state the same fact the same way.
 *
 * @param {{ id: string, expiresAt: string }} entry
 * @returns {string}
 */
export function formatUnparseableExpiresAtWarning({ id, expiresAt }) {
  return (
    `Warning: suppression ${id} has an unparseable context.expiresAt (${JSON.stringify(expiresAt)}); ` +
    'it is treated as expired and no longer suppresses findings. ' +
    'Repair the value to an RFC 3339 date or date-time (e.g. "2027-01-01" or "2027-01-01T00:00:00Z").'
  );
}

/**
 * The operator-facing sentence for one suppression whose
 * `context.fingerprintAlgo` is not a value this version understands (#1797).
 *
 * Same shape and same reason as `formatUnparseableExpiresAtWarning`: the
 * fail-safe direction (ignore the entry rather than gate findings under the
 * wrong algorithm) is kept, but the stop is made observable. An entry written
 * by a newer CLI, or hand-edited to a typo, otherwise just stops suppressing
 * with no error and no visible change in `.river/memory/index.json` — the
 * exact silence #1780 / #1801 removed for unparseable deadlines.
 *
 * Like that function, the message carries the entry id and the offending value
 * only; the rationale, related files and fingerprint stay out of the warning
 * stream.
 *
 * @param {{ id: string, fingerprintAlgo: unknown }} entry
 * @returns {string}
 */
export function formatUnknownFingerprintAlgoWarning({ id, fingerprintAlgo }) {
  return (
    `Warning: suppression ${id} declares an unsupported context.fingerprintAlgo ` +
    `(${JSON.stringify(fingerprintAlgo)}); it is ignored and no longer suppresses findings. ` +
    'Repair the value to "v1" (line-independent) or "v2" (line-anchored).'
  );
}

/**
 * The operator-facing sentence for one suppression whose
 * `context.rulesDigestAlgo` is not a value this version understands
 * (#2202 Phase 2). Same shape as `formatUnknownFingerprintAlgoWarning`, but
 * the consequence is the opposite direction: an unknown digest version makes
 * the rules-match gate unable to judge the entry, so the entry is NOT judged
 * on that axis and keeps suppressing. The warning is what keeps that silent
 * pass-through visible.
 *
 * @param {{ id: string, rulesDigestAlgo: unknown }} entry
 * @returns {string}
 */
export function formatUnknownRulesDigestAlgoWarning({ id, rulesDigestAlgo }) {
  return (
    `Warning: suppression ${id} declares an unsupported context.rulesDigestAlgo ` +
    `(${JSON.stringify(rulesDigestAlgo)}); its rulesDigest is not compared with the current project rules. ` +
    'Repair the value to "v1" (unnormalized) or "v2" (line endings and trailing whitespace normalized).'
  );
}

/**
 * The operator-facing sentence for one suppression that the opt-in rules-match
 * gate stopped (#2202 Phase 2): its `context.rulesDigest` was recorded under
 * project rules that differ from the current ones. Like the other suppression
 * warnings it carries the entry id only; the digests themselves are not
 * repairable values and stay out of the warning stream.
 *
 * @param {{ id: string }} entry
 * @returns {string}
 */
export function formatRulesDigestMismatchWarning({ id }) {
  return (
    `Warning: suppression ${id} was issued under different project rules ` +
    '(context.rulesDigest does not match the current .river/rules.md and .river/rules.d/); ' +
    'it no longer suppresses findings because memory.suppressionRequireRulesMatch is enabled. ' +
    'Re-issue the suppression if it still applies under the current rules.'
  );
}

/**
 * Whether a suppression's recorded `context.rulesDigest` matches the current
 * project rules (#2202 Phase 2). This is a SEPARATE predicate from
 * `isSuppressionExpired` on purpose: the expiry rule fails safe to "expired"
 * on an unreadable value, which is the safe direction for a calendar deadline
 * but the destructive one here (#1756 has the same shape). Every case this
 * function cannot decide therefore answers `'undetermined'`, never
 * `'mismatch'`:
 *
 * - no `rulesDigest` on the entry (written before #2202, or in a repo without
 *   rules): `'undetermined'` — no provenance is not a stale provenance;
 * - an unknown `rulesDigestAlgo`: `'unknown-algo'` — the caller reports it and
 *   treats it as undetermined (the `fingerprintAlgo` precedent, #1797);
 * - no current rules text (no `.river/rules.md`, or the caller has none):
 *   `'undetermined'`.
 *
 * The comparison uses the entry's own version: an absent `rulesDigestAlgo` is
 * `'v1'`, so a digest recorded before Phase 2 is compared against the current
 * rules hashed the Phase-0 way, and `'v2'` against the normalized digest.
 *
 * @param {{ id?: string, context?: { rulesDigest?: unknown, rulesDigestAlgo?: unknown } }} suppression
 * @param {string | null | undefined} rulesText current rules text, as returned
 *   by `loadProjectRules` (`rulesText`)
 * @param {{ digests?: Map<string, string | null> }} [options] per-call memo of
 *   the current digest by algorithm, so a batch hashes the rules once per version
 * @returns {{ status: 'match' | 'mismatch' | 'undetermined' | 'unknown-algo', rulesDigestAlgo?: unknown }}
 */
export function evaluateSuppressionRulesMatch(suppression, rulesText, { digests } = {}) {
  const recorded = suppression?.context?.rulesDigest;
  if (!isNonEmptyString(recorded)) return { status: 'undetermined' };
  const algo = suppression?.context?.rulesDigestAlgo ?? 'v1';
  if (!RULES_DIGEST_ALGOS.includes(algo)) {
    return { status: 'unknown-algo', rulesDigestAlgo: algo };
  }
  let current;
  if (digests?.has(algo)) {
    current = digests.get(algo);
  } else {
    current = computeRulesDigest(rulesText, { algo });
    digests?.set(algo, current);
  }
  if (!isNonEmptyString(current)) return { status: 'undetermined' };
  return { status: current === recorded ? 'match' : 'mismatch' };
}

/**
 * Find active suppressions that overlap with the given file paths.
 * Filters out expired and revoked suppressions.
 *
 * A suppression dropped because its `context.expiresAt` cannot be parsed is
 * reported through `warn` rather than dropped silently (#1780). The `warn` sink
 * mirrors `expireEntries` (riverbed-memory.mjs): injectable for tests, defaults
 * to `console.warn`. Only in-scope, non-revoked suppressions are warned about —
 * the ones this function would otherwise have returned for these file paths.
 *
 * Scope note: this function is NOT on the review path. Its only caller in the
 * repository is `regression-eval.mjs:110`; `resurface.mjs` imports the name but
 * never calls it. `runLocalReview` gates findings through `loadReviewMemory`
 * and `applySuppressions` (`suppression-apply.mjs`), which since #1802 applies
 * the same `isSuppressionExpired` rule and mirrors this warning through its
 * own `warn` sink. This warning here still reaches regression-eval and,
 * through `findUnparseableSuppressionExpiries`,
 * `scripts/suppression-analytics.mjs` only.
 *
 * @param {{ entries: object[] }} index - Loaded memory index
 * @param {string[]} filePaths
 * @param {{ warn?: (msg: string) => void }} [opts] - warning sink
 * @returns {object[]}
 */
export function findActiveSuppressions(index, filePaths, { warn = (m) => console.warn(m) } = {}) {
  // includeInactive: true preserves pre-lifecycle behavior. Revocations via
  // resurface must survive supersession so that a once-revoked suppression
  // does not silently reactivate when the revoking entry is superseded.
  const suppressions = queryMemory(index, { type: 'suppression', includeInactive: true });
  const revocations = collectRevokedSuppressionIds(index?.entries ?? []);

  const now = new Date();

  return suppressions.filter((s) => {
    if (!s.context?.active) return false;
    if (revocations.has(s.id)) return false;

    const related = s.metadata?.relatedFiles ?? [];
    const scope = s.context?.scope || 'file';
    const inScope = matchesScopeFiles(scope, related, filePaths);

    if (isSuppressionExpired(s, now)) {
      // Scope is evaluated BEFORE the warning so an unparseable deadline on a
      // suppression that does not cover this change set stays quiet: it was
      // not going to suppress anything here, and reporting it on every review
      // of every unrelated file would train operators to ignore the line.
      if (inScope && hasUnparseableSuppressionExpiresAt(s)) {
        warn(formatUnparseableExpiresAtWarning({ id: s.id, expiresAt: s.context.expiresAt }));
      }
      return false;
    }

    return inScope;
  });
}
