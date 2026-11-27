// Host-side wiring of the QA completion capability (ADR-017 T12,
// docs/development/qa-evidence-contract.md §8.3.1).
//
// Fixes the order the contract requires: the final audit result (with `skillFindings` and any
// other later field) is serialized once, that content is stored, the store is confirmed, and only
// then is the capability built from the same audit and `{ path, sha256 }`. Serialization and the
// hash come from `serializeQaArtifact`, the scope from `completionScopeForPurpose`, and the judge
// check is a dry run of `buildQaCompletionAssessment`, so none of them is re-derived here. This
// module writes nothing itself: the caller supplies the writer, and owns that the stored bytes are
// `content`.
import {
  buildQaCompletionAssessment,
  classifyQaAudit,
  completionScopeForPurpose,
  createQaCompletionCapability,
  serializeQaArtifact,
  validateCompletionAssessment,
} from './qa-completion.mjs';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/**
 * Store the final QA audit result and build the `evaluate-completion` capability for it.
 *
 * `write({ path, content, sha256 })` must store `content` whole at `path` and return (or resolve
 * to) `true` once the store is complete. Any other value means it refused to store or replace
 * the file; a throw or rejection means the store failed. The writer is not called when
 * `finalAudit` is null (no QA evidence), and no QA artifact is then pinned.
 *
 * The audit is stored before the judge parts are checked, so a run whose judge parts are
 * incomplete still keeps its audit result; it only gets no capability. The judge is copied and
 * frozen before the check, and the capability uses that copy, so a later change to `judge` cannot
 * reach a capability that was checked against the earlier value. The capability runs only in a
 * Flow whose intent is `purpose`, the one the check used.
 *
 * Throws, instead of returning `judge-invalid`, when the failure does not come from the judge:
 * an unknown `purpose`, an audit whose projection disagrees with its criteria, or a completion
 * schema that cannot be read or compiled. All three throw before the writer is called, so nothing
 * is stored.
 *
 * @param {object} input
 * @param {object | null} input.finalAudit - the audit result after every later field was added
 * @param {string} input.path - the path the assessment records for the stored audit
 * @param {string} input.purpose - the Flow's `intent.purpose` (task-completion or final-convergence)
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
  purpose,
  judge = {},
  write,
}) {
  const scope = completionScopeForPurpose(purpose);
  if (scope === undefined) {
    throw new TypeError(`purpose must be task-completion or final-convergence: ${purpose}`);
  }
  if (typeof write !== 'function') throw new TypeError('write must be a function');
  // The checks that do not depend on the judge run before the store and throw, so an
  // inconsistent audit is not stored and whatever the dry run below throws comes from the judge.
  classifyQaAudit(finalAudit);
  validateCompletionAssessment({});

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

  let checkedJudge;
  try {
    checkedJudge = deepFreeze(structuredClone(judge));
    buildQaCompletionAssessment({ scope, audit: finalAudit, qaArtifact, judge: checkedJudge });
  } catch (error) {
    return { ok: false, reason: 'judge-invalid', message: error.message, qaArtifact };
  }
  const evaluate = createQaCompletionCapability({
    audit: finalAudit,
    qaArtifact,
    judge: checkedJudge,
  });
  return {
    ok: true,
    capability: (context) => {
      const flowPurpose = context?.document?.intent?.purpose;
      if (flowPurpose !== purpose) {
        throw new Error(
          `evaluate-completion was prepared for a ${purpose} Flow, not ${flowPurpose}`
        );
      }
      return evaluate(context);
    },
    qaArtifact,
  };
}
