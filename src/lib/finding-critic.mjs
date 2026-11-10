/**
 * Finding Critic — deterministic skeleton of the Evidence-Grounded Adversarial
 * Review protocol (#1978 Phase 1a).
 *
 * SCOPE OF THIS MODULE
 * --------------------
 * Deterministic only. This module never calls an LLM. It parses a Critic
 * response that some caller obtained elsewhere, runs the Reviewer response
 * state machine over it, and applies the convergence and fail-safe rules.
 * The LLM boundary lives outside; Phase 1b specifies the real 3-value verdict
 * behaviour and Phase 3 would wire this into the orchestrator. Nothing here is
 * reachable from `src/cli/**` by design.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT REIMPLEMENT
 * --------------------------------------------------
 * - `verifyFinding` (src/lib/verifier.mjs) already rejects: missing evidence,
 *   evidence path absent from the diff, incoherent phase, non-actionable
 *   suggestion, unjustified severity. This module IMPORTS it and consumes its
 *   result; it does not re-derive any of those checks.
 * - `prefilterFindings` (src/lib/finding-factory.mjs:513) already suppresses
 *   low_confidence / insufficient_evidence / style_only / duplicate.
 * - `mergeFindings` (src/lib/reviewer-orchestrator.mjs) already owns dedup and
 *   `agreement` provenance.
 * - line mismatch and scope mismatch stay METADATA ONLY (#1644 Phase 1,
 *   verifier.mjs:308-309). This module never promotes them to a rejection.
 *
 * VOCABULARY NOTE (#1978 Phase 0 note § 1.2)
 * ------------------------------------------
 * The issue proposed `scope: IN_SCOPE / SCOPE_UNCERTAIN / OUT_OF_SCOPE`. The
 * key `scope` is already shipped with the value vocabulary
 * `in-diff / pre-existing`, and `normalizeScope` silently coerces an unknown
 * value to `in-diff` — an undetectable miscast, with the fail-safe pointing the
 * opposite way. This module therefore uses a distinct axis, `askRelevance`,
 * with hyphen-lowercase values matching every other finding enum.
 *
 * FAIL-SAFE INVARIANT
 * -------------------
 * No degraded path may produce a "clean" outcome. Timeout, parse failure,
 * inner-loop cap, and a Critic dismissal that contradicts the deterministic
 * verifier all keep the finding (`retainFinding: true`) and raise
 * `humanReview: true`. A silent Critic must never look like an approval.
 */

import { verifyFinding } from './verifier.mjs';

/** Protocol identifier written into artifacts and prompts. */
export const PROTOCOL_ID = 'evidence-grounded-adversarial-v1';

/** Internal module id. Chosen in Phase 0 note § 3.2; collides with no skill id. */
export const MODULE_ID = 'finding-critic';

/** Critic verdict vocabulary. Wire format is uppercase, as in the paper. */
export const CRITIC_VERDICT = Object.freeze({
  AGREE: 'AGREE',
  DISAGREE_EVIDENCE: 'DISAGREE_EVIDENCE',
  DISAGREE_CONCERN: 'DISAGREE_CONCERN',
});

/** Reviewer response vocabulary. */
export const REVIEWER_ACTION = Object.freeze({
  KEEP: 'KEEP',
  REVISE: 'REVISE',
  WITHDRAW: 'WITHDRAW',
});

/**
 * Relevance of a finding to the original ask. A separate axis from `scope`
 * (`in-diff` / `pre-existing`); the two are orthogonal.
 */
export const ASK_RELEVANCE = Object.freeze({
  IN_ASK: 'in-ask',
  UNCERTAIN: 'uncertain',
  OUT_OF_ASK: 'out-of-ask',
});

const ASK_RELEVANCE_VALUES = new Set(Object.values(ASK_RELEVANCE));

/**
 * Terminal state of one finding after validation.
 *
 * This vocabulary is written to `validation.finalStatus` — a SEPARATE key from
 * the schema's `validatedStatus` (`schemas/review-artifact.schema.json:455`).
 * The two sets only partially overlap, and nothing here is written to
 * `validatedStatus`. Do not wire one into the other without reconciling both
 * enums first.
 */
export const FINAL_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  WITHDRAWN_BY_REVIEWER: 'withdrawn-by-reviewer',
  DISMISSED_BY_EVIDENCE: 'dismissed-by-evidence',
  // Borrows the SPELLING of the existing `validatedStatus` value for
  // deterministic evidence rejects, so the two vocabularies stay readable
  // side by side. It is still emitted under `validation.finalStatus`.
  DISMISSED_HALLUCINATION: 'dismissed-hallucination',
  NEEDS_HUMAN_JUDGMENT: 'needs-human-judgment',
  OUT_OF_ASK: 'out-of-ask',
  CRITIC_TIMEOUT: 'critic-timeout',
});

/** Default number of Reviewer↔Critic rounds. */
export const DEFAULT_MAX_INNER_ROUNDS = 2;

/** Absolute ceiling; `maxInnerRounds` is clamped to it. */
export const HARD_CAP_INNER_ROUNDS = 5;

/** Reason codes attached to fail-safe outcomes. */
export const FAILSAFE_REASON = Object.freeze({
  CRITIC_TIMEOUT: 'critic-timeout',
  CRITIC_PARSE_FAILURE: 'critic-parse-failure',
  DETERMINISTIC_MISSING: 'deterministic-missing',
  EXCHANGES_EXHAUSTED: 'exchanges-exhausted',
  REVIEWER_PARSE_FAILURE: 'reviewer-parse-failure',
  KEEP_WITHOUT_EVIDENCE: 'keep-without-evidence',
  INNER_LOOP_CAP_REACHED: 'inner-loop-cap-reached',
  DETERMINISTIC_CONTRADICTION: 'deterministic-contradiction',
  ASK_RELEVANCE_UNCERTAIN: 'ask-relevance-uncertain',
  AGREEMENT_WITHOUT_EVIDENCE: 'agreement-without-evidence',
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the minimal `key: value` block the protocol asks a Critic to emit.
 * Supports scalars plus one `evidence:` list of `- artifact: …` items.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function parseBlock(text) {
  /** @type {Record<string, unknown>} */
  const out = {};
  /** @type {Array<Record<string, string>>} */
  const evidence = [];
  let inEvidence = false;
  /** @type {Record<string, string> | null} */
  let current = null;

  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.replace(/\s+$/u, '');
    if (line.trim() === '') continue;
    const indented = /^\s/u.test(line);
    const trimmed = line.trim();

    if (!indented && /^evidence:\s*$/iu.test(trimmed)) {
      inEvidence = true;
      current = null;
      continue;
    }
    if (!indented && /^evidence:\s*\[\s*\]$/iu.test(trimmed)) {
      inEvidence = false;
      current = null;
      continue;
    }

    if (inEvidence && trimmed.startsWith('- ')) {
      current = {};
      evidence.push(current);
      const item = trimmed.slice(2).trim();
      const m = /^([\w.-]+):\s*(.*)$/u.exec(item);
      if (m) current[m[1]] = m[2].trim();
      continue;
    }
    if (inEvidence && indented && current) {
      const m = /^([\w.-]+):\s*(.*)$/u.exec(trimmed);
      if (m) current[m[1]] = m[2].trim();
      continue;
    }

    const m = /^([\w.-]+):\s*(.*)$/u.exec(trimmed);
    if (!m) continue;
    inEvidence = false;
    current = null;
    out[m[1]] = m[2].trim();
  }

  if (evidence.length > 0) out.evidence = evidence;
  return out;
}

/**
 * Coerce a raw Critic payload (JSON string, protocol block, or object) into a
 * plain object. Returns null when nothing usable can be read.
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
function coerceToObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  }
  const block = parseBlock(text);
  return Object.keys(block).length === 0 ? null : block;
}

/**
 * Read a field under either snake_case or camelCase.
 * @param {Record<string, unknown>} obj
 * @param {string} snake
 * @param {string} camel
 * @returns {unknown}
 */
function pick(obj, snake, camel) {
  return obj[snake] !== undefined ? obj[snake] : obj[camel];
}

/**
 * Normalize a Critic evidence list into `{ artifact, lineStart, lineEnd, observation }`.
 * Entries without an artifact path are dropped: an evidence citation that
 * points at nothing cannot ground a disagreement.
 * @param {unknown} raw
 * @returns {Array<{ artifact: string, lineStart: number | null, lineEnd: number | null, observation: string }>}
 */
function normalizeEvidenceList(raw) {
  if (!Array.isArray(raw)) return [];
  const toInt = (/** @type {unknown} */ v) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { artifact: item.trim(), lineStart: null, lineEnd: null, observation: '' };
      }
      if (!item || typeof item !== 'object') return null;
      const rec = /** @type {Record<string, unknown>} */ (item);
      const artifact = String(rec.artifact ?? rec.file ?? rec.path ?? '').trim();
      return {
        artifact,
        lineStart: toInt(pick(rec, 'line_start', 'lineStart')),
        lineEnd: toInt(pick(rec, 'line_end', 'lineEnd')),
        observation: String(rec.observation ?? '').trim(),
      };
    })
    .filter((e) => e !== null && e.artifact !== '');
}

/**
 * Parse a Critic response.
 *
 * Fail-safe: a parse failure NEVER yields a usable verdict. The caller gets
 * `{ ok: false }` and `evaluateExchange` turns that into
 * `needs-human-judgment`, never into a clean or dismissed finding.
 *
 * `askRelevance` falls back to `uncertain` (human-review candidate) when the
 * field is missing or unrecognized — never to `in-ask`, so an unreadable
 * relevance claim cannot smuggle a finding into revision instructions.
 *
 * `DISAGREE_EVIDENCE` without a usable evidence citation is downgraded to
 * `DISAGREE_CONCERN`: an ungrounded disagreement must return the burden of
 * proof to the Reviewer rather than dismiss the finding (design principle 2).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, response: { findingId: string, verdict: string, reason: string, evidence: Array<object>, askRelevance: string, downgraded: boolean } }
 *          | { ok: false, errors: string[] }}
 */
export function parseCriticResponse(raw) {
  const obj = coerceToObject(raw);
  if (obj === null) {
    return { ok: false, errors: ['critic response is not parseable'] };
  }

  const verdictRaw = String(pick(obj, 'verdict', 'verdict') ?? '').trim();
  const verdict = verdictRaw.toUpperCase();
  if (!Object.hasOwn(CRITIC_VERDICT, verdict)) {
    return { ok: false, errors: [`unknown verdict: ${JSON.stringify(verdictRaw)}`] };
  }

  // Same separator/case normalization as `normalizeScope`
  // (src/lib/finding-factory.mjs:347-364), so `OUT_OF_ASK` and `out of ask`
  // reach the canonical `out-of-ask`. Without it every uppercase emission
  // collapsed to `uncertain` and the Scope Gate stopped discriminating.
  //
  // Deliberately NOT aliased: the issue's original `IN_SCOPE` / `OUT_OF_SCOPE`
  // spellings normalize to `in-scope` / `out-of-scope`, which are not in the
  // vocabulary and therefore land on `uncertain`. Accepting them would revive
  // the very `scope` ambiguity this axis was renamed to remove.
  const relRaw = String(pick(obj, 'ask_relevance', 'askRelevance') ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/gu, '-');
  const askRelevance = ASK_RELEVANCE_VALUES.has(relRaw) ? relRaw : ASK_RELEVANCE.UNCERTAIN;

  const evidence = normalizeEvidenceList(obj.evidence);
  let finalVerdict = verdict;
  let downgraded = false;
  if (verdict === CRITIC_VERDICT.DISAGREE_EVIDENCE && evidence.length === 0) {
    finalVerdict = CRITIC_VERDICT.DISAGREE_CONCERN;
    downgraded = true;
  }

  return {
    ok: true,
    response: {
      findingId: String(pick(obj, 'finding_id', 'findingId') ?? '').trim(),
      verdict: finalVerdict,
      reason: String(obj.reason ?? '').trim(),
      evidence,
      askRelevance,
      downgraded,
    },
  };
}

/**
 * Parse a Reviewer response. `KEEP` requires at least one evidence citation;
 * a `KEEP` without evidence is not a valid response and is reported as such.
 * @param {unknown} raw
 * @returns {{ ok: true, response: { findingId: string, action: string, evidence: Array<object>, respondTo: string } }
 *          | { ok: false, errors: string[] }}
 */
export function parseReviewerResponse(raw) {
  const obj = coerceToObject(raw);
  if (obj === null) return { ok: false, errors: ['reviewer response is not parseable'] };

  const action = String(obj.action ?? '')
    .trim()
    .toUpperCase();
  if (!Object.hasOwn(REVIEWER_ACTION, action)) {
    return { ok: false, errors: [`unknown action: ${JSON.stringify(obj.action ?? '')}`] };
  }

  const evidence = normalizeEvidenceList(obj.evidence);
  if (action === REVIEWER_ACTION.KEEP && evidence.length === 0) {
    return { ok: false, errors: ['KEEP requires evidence'] };
  }

  return {
    ok: true,
    response: {
      findingId: String(pick(obj, 'finding_id', 'findingId') ?? '').trim(),
      action,
      evidence,
      respondTo: String(pick(obj, 'response_to', 'responseTo') ?? '').trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic pre-verification bridge
// ---------------------------------------------------------------------------

/**
 * Run the existing deterministic verifier and decide whether the finding is
 * worth an LLM Critic call at all.
 *
 * This is a thin adapter over `verifyFinding`; every check it reports comes
 * from `src/lib/verifier.mjs`. Nothing is re-derived here.
 *
 * @param {{ finding: object, diff?: string, skill?: object, fileTypes?: object, diffFiles?: string[], deterministicSource?: boolean }} input
 * @returns {{ verified: boolean, sendToCritic: boolean, status: string | null, reasons: string[], checks: Record<string, boolean> }}
 */
export function preVerifyFinding({
  finding,
  diff,
  skill,
  fileTypes,
  diffFiles,
  deterministicSource = false,
}) {
  const result = verifyFinding({ finding, diff, skill, fileTypes, diffFiles, deterministicSource });
  if (result.verified) {
    return {
      verified: true,
      sendToCritic: true,
      status: null,
      reasons: [],
      checks: result.checks,
    };
  }
  const hallucinatedEvidence =
    result.checks.evidenceExists === false || result.checks.evidenceInDiff === false;
  return {
    verified: false,
    sendToCritic: false,
    status: hallucinatedEvidence
      ? FINAL_STATUS.DISMISSED_HALLUCINATION
      : FINAL_STATUS.DISMISSED_BY_EVIDENCE,
    reasons: result.reasons,
    checks: result.checks,
  };
}

/**
 * Shape of a citable file reference. Mirrors `RE_FILE_REF` in verifier.mjs but
 * anchored, because here the whole `artifact` field must BE a path — not merely
 * contain one somewhere in prose.
 */
const RE_ARTIFACT_PATH = /^[\w/-]+(?:\.[\w]+)+$/u;

/**
 * Is at least one artifact the Critic cited actually present in the diff?
 *
 * Two gates, in this order:
 *
 * 1. SHAPE (here). The `artifact` field must itself be a file path. This gate
 *    exists because `verifyFinding`'s `evidenceInDiff` is deliberately LENIENT:
 *    `verifier.mjs:100-102` returns true when the evidence cites no file at
 *    all, and its `RE_EVIDENCE` needs 5+ characters before it matches. Borrowing
 *    that check alone answers "does this contradict the diff?", which fails
 *    OPEN — `nowhere`, `a.js`, and `the login handler` all came back grounded.
 *    Grounding must fail CLOSED, so anything that is not a path is not grounded.
 * 2. MEMBERSHIP (delegated). Whether the path appears in the diff stays with
 *    `verifyFinding`; that remains the single source of truth and is not
 *    re-derived here. The probe message is padded so the citation always clears
 *    `RE_EVIDENCE`'s minimum length.
 *
 * @param {Array<{ artifact: string }>} evidence
 * @param {string} diff
 * @returns {boolean}
 */
export function isCriticEvidenceGrounded(evidence, diff) {
  if (!Array.isArray(evidence) || evidence.length === 0) return false;
  return evidence.some((entry) => {
    const artifact = String(entry?.artifact ?? '').trim();
    if (!RE_ARTIFACT_PATH.test(artifact)) return false;
    const probe = verifyFinding({
      finding: { message: `Evidence: critic cited ${artifact}` },
      diff,
    });
    return probe.checks.evidenceInDiff === true;
  });
}

// ---------------------------------------------------------------------------
// Outcome helpers
// ---------------------------------------------------------------------------

/**
 * @param {{ status: string, terminal?: boolean, humanReview?: boolean, retainFinding?: boolean, reasons?: string[], rounds?: number, askRelevance?: string }} init
 */
function outcome(init) {
  return {
    protocol: PROTOCOL_ID,
    status: init.status,
    terminal: init.terminal !== false,
    humanReview: init.humanReview === true,
    retainFinding: init.retainFinding === true,
    reasons: init.reasons ?? [],
    rounds: init.rounds ?? 0,
    askRelevance: init.askRelevance ?? ASK_RELEVANCE.UNCERTAIN,
  };
}

/**
 * A "clean" outcome is one where the finding disappears and no human is
 * asked to look. Every fail-safe path must be false here.
 * @param {{ retainFinding: boolean, humanReview: boolean }} result
 * @returns {boolean}
 */
export function isCleanOutcome(result) {
  return result.retainFinding === false && result.humanReview === false;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Evaluate one Reviewer↔Critic exchange.
 *
 * @param {object} input
 * @param {{ kind?: string, payload?: unknown }} input.critic - `{ kind: 'timeout' | 'error' }`
 *   for a degraded call, otherwise `{ payload }` carrying the raw Critic output.
 * @param {unknown} [input.reviewer] - raw Reviewer response, when one exists.
 * @param {{ verified: boolean }} input.deterministic - result of `preVerifyFinding`.
 *   REQUIRED. Omitting it used to make `verified` false, which disabled the
 *   contradiction fail-safe and let a Critic dismiss a finding that had never
 *   been checked deterministically. A missing value now escalates instead.
 * @param {string} [input.diff] - diff text, used to ground Critic evidence.
 * @param {number} [input.round] - 1-based round index.
 * @returns {{ protocol: string, status: string, terminal: boolean, humanReview: boolean, retainFinding: boolean, reasons: string[], rounds: number, askRelevance: string }}
 */
export function evaluateExchange({ critic, reviewer, deterministic, diff = '', round = 1 }) {
  // Fail-safe 0: the caller skipped deterministic pre-verification. Nothing
  // downstream can be trusted, so nothing downstream runs.
  if (!deterministic || typeof deterministic.verified !== 'boolean') {
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      humanReview: true,
      retainFinding: true,
      reasons: [FAILSAFE_REASON.DETERMINISTIC_MISSING],
      rounds: round,
    });
  }

  // `kind` is normalized: a Critic runner reporting `TIMEOUT` must not fall
  // through to the parse-failure branch and mislabel the reason.
  const kind = String(critic?.kind ?? 'response')
    .trim()
    .toLowerCase();

  // Fail-safe 1: the Critic never answered. Keep the finding, ask a human.
  if (kind === 'timeout' || kind === 'error') {
    return outcome({
      status: FINAL_STATUS.CRITIC_TIMEOUT,
      humanReview: true,
      retainFinding: true,
      reasons: [FAILSAFE_REASON.CRITIC_TIMEOUT],
      rounds: round,
    });
  }

  // Fail-safe 2: the Critic answered something unreadable. Not a clean pass.
  const parsedCritic = parseCriticResponse(critic?.payload);
  if (!parsedCritic.ok) {
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      humanReview: true,
      retainFinding: true,
      reasons: [FAILSAFE_REASON.CRITIC_PARSE_FAILURE, ...parsedCritic.errors],
      rounds: round,
    });
  }

  const { verdict, askRelevance, evidence } = parsedCritic.response;

  // Ask-relevance gate: out-of-ask never reaches revision instructions.
  //
  // KNOWN LIMITATION (Phase 1a): this terminates on the Critic's sole judgment.
  // No evidence is required, the Reviewer gets no chance to object, and no
  // human is notified — a deterministically verified `critical` finding can be
  // parked in `followUpNotes`. The finding is retained rather than dropped, so
  // this is not a silent clean, but it IS a single-actor kill switch. Severity
  // is not plumbed into this function; escalating high severities is deferred
  // to Phase 1b, where the Critic's real classification accuracy is measurable.
  if (askRelevance === ASK_RELEVANCE.OUT_OF_ASK) {
    return outcome({
      status: FINAL_STATUS.OUT_OF_ASK,
      humanReview: false,
      retainFinding: true,
      reasons: ['critic classified the finding as outside the original ask'],
      rounds: round,
      askRelevance,
    });
  }

  const verified = deterministic?.verified === true;

  // Fail-safe 3: the Critic dismisses on evidence, but the deterministic
  // verifier confirmed the finding and the Critic's own citation is not in the
  // diff. Two authorities disagree; a human decides, and the finding stays.
  if (
    verdict === CRITIC_VERDICT.DISAGREE_EVIDENCE &&
    verified &&
    !isCriticEvidenceGrounded(evidence, diff)
  ) {
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      humanReview: true,
      retainFinding: true,
      reasons: [FAILSAFE_REASON.DETERMINISTIC_CONTRADICTION],
      rounds: round,
      askRelevance,
    });
  }

  if (verdict === CRITIC_VERDICT.AGREE) {
    // Consensus is not correctness: agreement without deterministic evidence
    // does not confirm anything.
    if (!verified) {
      return outcome({
        status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
        humanReview: true,
        retainFinding: true,
        reasons: [FAILSAFE_REASON.AGREEMENT_WITHOUT_EVIDENCE],
        rounds: round,
        askRelevance,
      });
    }
    return outcome({
      status: FINAL_STATUS.CONFIRMED,
      humanReview: askRelevance === ASK_RELEVANCE.UNCERTAIN,
      retainFinding: true,
      reasons:
        askRelevance === ASK_RELEVANCE.UNCERTAIN ? [FAILSAFE_REASON.ASK_RELEVANCE_UNCERTAIN] : [],
      rounds: round,
      askRelevance,
    });
  }

  // Both DISAGREE_* verdicts need a Reviewer response before anything resolves.
  if (reviewer === undefined || reviewer === null) {
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      terminal: false,
      humanReview: false,
      retainFinding: true,
      reasons: ['awaiting reviewer response'],
      rounds: round,
      askRelevance,
    });
  }

  const parsedReviewer = parseReviewerResponse(reviewer);
  if (!parsedReviewer.ok) {
    const keepWithoutEvidence = parsedReviewer.errors.includes('KEEP requires evidence');
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      humanReview: true,
      retainFinding: true,
      reasons: [
        keepWithoutEvidence
          ? FAILSAFE_REASON.KEEP_WITHOUT_EVIDENCE
          : FAILSAFE_REASON.REVIEWER_PARSE_FAILURE,
        ...parsedReviewer.errors,
      ],
      rounds: round,
      askRelevance,
    });
  }

  const { action } = parsedReviewer.response;

  if (action === REVIEWER_ACTION.WITHDRAW) {
    return outcome({
      status:
        verdict === CRITIC_VERDICT.DISAGREE_EVIDENCE
          ? FINAL_STATUS.DISMISSED_BY_EVIDENCE
          : FINAL_STATUS.WITHDRAWN_BY_REVIEWER,
      humanReview: false,
      retainFinding: false,
      reasons: [],
      rounds: round,
      askRelevance,
    });
  }

  if (action === REVIEWER_ACTION.KEEP) {
    // KEEP is only reachable with evidence (parseReviewerResponse enforces it).
    if (verdict === CRITIC_VERDICT.DISAGREE_CONCERN) {
      return outcome({
        status: FINAL_STATUS.CONFIRMED,
        humanReview: askRelevance === ASK_RELEVANCE.UNCERTAIN,
        retainFinding: true,
        reasons: [],
        rounds: round,
        askRelevance,
      });
    }
    // DISAGREE_EVIDENCE vs an evidence-backed KEEP: unresolved, run another round.
    return outcome({
      status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
      terminal: false,
      humanReview: false,
      retainFinding: true,
      reasons: ['evidence contested'],
      rounds: round,
      askRelevance,
    });
  }

  // REVISE: the finding changed shape; it must be re-examined next round.
  return outcome({
    status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
    terminal: false,
    humanReview: false,
    retainFinding: true,
    reasons: ['finding revised'],
    rounds: round,
    askRelevance,
  });
}

/**
 * Run the inner loop over a pre-collected list of exchanges.
 *
 * The artifact is frozen for the whole loop: this function reads exchanges and
 * returns a state, and never edits code, diff, or finding text.
 *
 * Convergence: at most `maxInnerRounds` rounds, itself clamped to
 * `HARD_CAP_INNER_ROUNDS`. Reaching the cap without a terminal state is a
 * fail-safe, not an approval — the finding is retained and escalated.
 *
 * @param {object} input
 * @param {Array<{ critic: object, reviewer?: unknown }>} input.exchanges
 * @param {{ verified: boolean }} [input.deterministic]
 * @param {string} [input.diff]
 * @param {number} [input.maxInnerRounds]
 * @param {number} [input.hardCap]
 * @returns {{ protocol: string, status: string, terminal: boolean, humanReview: boolean, retainFinding: boolean, reasons: string[], rounds: number, askRelevance: string }}
 */
export function runValidationLoop({
  exchanges,
  deterministic,
  diff = '',
  maxInnerRounds = DEFAULT_MAX_INNER_ROUNDS,
  hardCap = HARD_CAP_INNER_ROUNDS,
}) {
  // Double clamp. `hardCap` is a caller-supplied argument, so on its own it can
  // be raised past the protocol ceiling; `HARD_CAP_INNER_ROUNDS` is the ceiling
  // #1978 Step 6 fixes at 5 and no caller may exceed it.
  const cap = Math.max(
    1,
    Math.min(Number(maxInnerRounds) || 1, Number(hardCap) || 1, HARD_CAP_INNER_ROUNDS)
  );
  const list = Array.isArray(exchanges) ? exchanges : [];
  let last = null;
  let round = 0;

  for (const exchange of list) {
    if (round >= cap) break;
    round += 1;
    last = evaluateExchange({
      critic: exchange.critic,
      reviewer: exchange.reviewer,
      deterministic,
      diff,
      round,
    });
    if (last.terminal) return last;
  }

  // Fail-safe 4: the loop ended without converging. The two ways that happens
  // carry different operational meaning, so they carry different reason codes:
  // hitting the cap means the exchange kept oscillating, while running out of
  // exchanges early means the caller stopped feeding the loop.
  return outcome({
    status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
    humanReview: true,
    retainFinding: true,
    reasons: [
      round >= cap ? FAILSAFE_REASON.INNER_LOOP_CAP_REACHED : FAILSAFE_REASON.EXCHANGES_EXHAUSTED,
    ],
    rounds: round,
    askRelevance: last?.askRelevance ?? ASK_RELEVANCE.UNCERTAIN,
  });
}

// ---------------------------------------------------------------------------
// Post-validation routing
// ---------------------------------------------------------------------------

/**
 * Build the validated finding record.
 *
 * Severity is copied through unchanged. `agreement` is carried as provenance
 * only: this function takes no vote count and exposes no path by which the
 * number of agreeing reviewers could raise or lower severity.
 *
 * @param {{ id?: string, severity?: string, agreement?: unknown[] }} finding
 * @param {{ status: string, humanReview: boolean, retainFinding: boolean, reasons: string[], rounds: number, askRelevance: string }} result
 * @returns {object}
 */
export function buildValidatedFinding(finding, result) {
  const agreement = Array.isArray(finding?.agreement) ? [...finding.agreement] : [];
  return {
    id: finding?.id ?? null,
    severity: finding?.severity ?? null,
    agreement,
    agreementCount: agreement.length,
    validation: {
      protocol: PROTOCOL_ID,
      rounds: result.rounds,
      finalStatus: result.status,
      askRelevance: result.askRelevance,
      humanReview: result.humanReview,
      reasons: result.reasons,
    },
  };
}

/**
 * Route validated findings.
 *
 * - `out-of-ask` never reaches revision instructions; it becomes a follow-up note.
 * - `uncertain` never reaches revision instructions; it becomes a human-review candidate.
 * - Anything flagged `humanReview` becomes a human-review candidate regardless of status.
 *
 * @param {Array<{ finding: object, result: object }>} entries
 * @returns {{ revisionInstructions: object[], humanReviewCandidates: object[], followUpNotes: object[], dropped: object[] }}
 */
export function partitionByAskRelevance(entries) {
  const revisionInstructions = [];
  const humanReviewCandidates = [];
  const followUpNotes = [];
  const dropped = [];

  for (const { finding, result } of Array.isArray(entries) ? entries : []) {
    const record = buildValidatedFinding(finding, result);
    if (result.status === FINAL_STATUS.OUT_OF_ASK) {
      followUpNotes.push(record);
      continue;
    }
    if (result.humanReview === true || result.askRelevance === ASK_RELEVANCE.UNCERTAIN) {
      humanReviewCandidates.push(record);
      continue;
    }
    if (result.retainFinding === false) {
      dropped.push(record);
      continue;
    }
    revisionInstructions.push(record);
  }

  return { revisionInstructions, humanReviewCandidates, followUpNotes, dropped };
}
