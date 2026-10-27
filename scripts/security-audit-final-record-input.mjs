/**
 * Phase 8 input preflight for an explicit, source-only security audit (#2751).
 *
 * This does not execute a verifier or establish correctness, independence,
 * authenticity, source freshness, or safety. Only a trusted host may select
 * the expected target and subsequently observe a verifier execution.
 * The canonical run record and existing finding states remain authoritative.
 */
import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import { sha256Hex } from '../src/lib/shadow-aggregate.mjs';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOURCE_ANCHOR = 'source';

function isRepositoryRelativePath(path) {
  return (
    nonEmpty(path) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !/^[a-zA-Z]:/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSourceAnchor(reference) {
  return (
    reference !== null &&
    typeof reference === 'object' &&
    !Array.isArray(reference) &&
    reference.kind === SOURCE_ANCHOR &&
    isRepositoryRelativePath(reference.path) &&
    Number.isSafeInteger(reference.lineStart) &&
    reference.lineStart > 0 &&
    Number.isSafeInteger(reference.lineEnd) &&
    reference.lineEnd >= reference.lineStart
  );
}

/**
 * Check whether an existing record can be handed to a fresh source verifier.
 *
 * Input readiness means only that the frozen, producer-supplied inputs passed
 * these structural checks. The caller must independently resolve every source
 * path/line at frozenTarget.revision, validate the complete record schema,
 * observe the verifier actually run, and judge the claims separately.
 *
 * @param {unknown} record Existing SecurityAuditRunRecord
 * @param {unknown} frozenTarget Host-selected {repository, revision}
 * @returns {{inputReady: boolean, blockers: string[]}}
 */
export function inspectSecurityAuditFinalRecordInput(record, frozenTarget) {
  const blockers = [];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { inputReady: false, blockers: ['record_missing'] };
  }

  if (
    record.kind !== 'SecurityAuditRunRecord' ||
    record.schemaVersion !== '1' ||
    record.status !== 'experimental' ||
    record.executionPolicy !== 'source-only'
  ) {
    blockers.push('unsupported_record_contract');
  }

  if (
    !nonEmpty(frozenTarget?.repository) ||
    !nonEmpty(frozenTarget?.revision) ||
    record.target?.repository !== frozenTarget.repository ||
    record.target?.revision !== frozenTarget.revision
  ) {
    blockers.push('target_revision_mismatch');
  }

  const { recordDigest, ...payload } = record;
  let digestMatches = false;
  if (typeof recordDigest === 'string' && SHA256_HEX.test(recordDigest)) {
    try {
      digestMatches = sha256Hex(canonicalJson(payload)) === recordDigest;
    } catch {
      // Reject malformed/non-JSON producer input rather than throwing from preflight.
    }
  }
  if (!digestMatches) blockers.push('record_digest_mismatch');

  if (!Array.isArray(record.findings)) {
    blockers.push('findings_missing');
  } else {
    for (const finding of record.findings) {
      if (finding?.evidenceState !== 'established') continue;
      if (!Array.isArray(finding.evidenceRefs) || !finding.evidenceRefs.some(hasSourceAnchor)) {
        blockers.push('established_source_anchor_missing');
        break;
      }
    }
  }

  return { inputReady: blockers.length === 0, blockers };
}
