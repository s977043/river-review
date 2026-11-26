// Host-side wiring of the QA completion capability (ADR-017 T12,
// docs/development/qa-evidence-contract.md §8.3.1).
//
// Fixes the order the contract requires: the final audit result (with `skillFindings` and any
// other later field) is serialized once, that content is stored, the store is confirmed, and only
// then is the capability built from the same audit and `{ path, sha256 }`. Serialization and the
// hash come from `serializeQaArtifact`, and the judge check is a dry run of
// `buildQaCompletionAssessment`, so neither is re-derived here. This module writes nothing itself:
// the caller supplies the writer, and owns that the stored bytes are `content`.
import {
  buildQaCompletionAssessment,
  createQaCompletionCapability,
  serializeQaArtifact,
} from './qa-completion.mjs';

const SCOPES = new Set(['task', 'final']);

/**
 * Store the final QA audit result and build the `evaluate-completion` capability for it.
 *
 * `write({ path, content, sha256 })` must store `content` whole at `path` and return (or resolve
 * to) `true` once the store is complete. Any other value means it refused to store or replace
 * the file; a throw or rejection means the store failed. The writer is not called when
 * `finalAudit` is null (no QA evidence), and no QA artifact is then pinned.
 *
 * The audit is stored before the judge parts are checked, so a run whose judge parts are
 * incomplete still keeps its audit result; it only gets no capability.
 *
 * @param {object} input
 * @param {object | null} input.finalAudit - the audit result after every later field was added
 * @param {string} input.path - the path the assessment records for the stored audit
 * @param {'task' | 'final'} input.scope - the scope the Flow's intent resolves to
 * @param {object} [input.judge] - the completion-judge parts (`tasks` for task scope, ...)
 * @param {(file: { path: string, content: string, sha256: string }) => unknown} input.write
 * @returns {Promise<
 *   | { ok: true, capability: Function, qaArtifact: { path: string, sha256: string } | undefined }
 *   | { ok: false, reason: 'write-failed' | 'write-refused' | 'judge-invalid', message: string,
 *       qaArtifact?: { path: string, sha256: string } }
 * >}
 */
export async function prepareQaCompletionCapability({
  finalAudit,
  path,
  scope,
  judge = {},
  write,
}) {
  if (!SCOPES.has(scope)) throw new TypeError(`scope must be task or final: ${scope}`);
  if (typeof write !== 'function') throw new TypeError('write must be a function');

  let qaArtifact;
  if (finalAudit !== null && finalAudit !== undefined) {
    const { content, sha256 } = serializeQaArtifact(finalAudit);
    let stored;
    try {
      stored = await write({ path, content, sha256 });
    } catch (error) {
      return { ok: false, reason: 'write-failed', message: error?.message ?? String(error) };
    }
    if (stored !== true) {
      return {
        ok: false,
        reason: 'write-refused',
        message: 'the writer did not confirm that the QA audit result was stored',
      };
    }
    qaArtifact = { path, sha256 };
  }

  try {
    buildQaCompletionAssessment({ scope, audit: finalAudit, qaArtifact, judge });
  } catch (error) {
    return { ok: false, reason: 'judge-invalid', message: error.message, qaArtifact };
  }
  return {
    ok: true,
    capability: createQaCompletionCapability({ audit: finalAudit, qaArtifact, judge }),
    qaArtifact,
  };
}
