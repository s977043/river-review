/**
 * Gate-decision derivation (Epic #1347 S2 / #1349).
 *
 * Derives the machine-readable gate signal a loop-running host consumes:
 * GO | GO_WITH_OBSERVATION | NO_GO | ESCALATE. River Review DERIVES the
 * decision; EXECUTION (continuing, stopping, notifying, expiring an
 * observation window) is the host's responsibility. This module is a pure
 * function — no I/O, no AI calls, no side effects — so hosts can verify any
 * emitted gate block by replaying `gate.inputs` through deriveGateDecision
 * and comparing the result (the authoritative integrity check; see below).
 *
 * ## Trust boundary (adversarial design review, 2026-07-02)
 *
 * Of the inputs, risk-map / config / plan text live INSIDE the reviewed
 * repository and are writable by the implementation agent under review. The
 * gate decision is therefore trustworthy only when derived OUTSIDE the
 * agent's write authority (host / CI checkout). Two in-contract mitigations:
 *
 *  - Bootstrap cliff (rule 0): any change under `.river/**` in the diff —
 *    including DELETING the risk map, which would otherwise silently degrade
 *    every file to comment_only — escalates unconditionally. The gate config
 *    cannot be used to unguard itself.
 *  - `inputs.riskMapPresent` / `inputs.riskMapDigest` expose which risk map
 *    (if any) was loaded so hosts can compare against a trusted baseline.
 *
 * Renaming files off the risk-map globs remains out of scope for S2 (tracked
 * for S3 escape-rate metrics / S4 deterministic gates).
 *
 * ## Decision rules (first match wins)
 *
 *  0. gate config changed in diff            → ESCALATE  GATE_CONFIG_CHANGED
 *  1. humanApprovalRequired                  → ESCALATE  HUMAN_APPROVAL_REQUIRED
 *  2. loopSignal ESCALATE_HUMAN              → ESCALATE  DECISION_ESCALATED
 *  3. loopSignal STOP_OSCILLATED             → ESCALATE  OSCILLATION_DETECTED
 *  4. riskAction require_human_review        → ESCALATE  RISK_MAP_HUMAN_REVIEW
 *  5. riskAction unknown (not absent)        → NO_GO     UNKNOWN_RISK_ACTION
 *  6. review did not actually execute        → NO_GO     NOT_EXECUTED
 *     (plan-only / no-changes runs must not claim CONVERGED_CLEAN: a
 *     score of [] findings is vacuous, and an agent suppressing diff
 *     resolution must not obtain a GO — escalation rules 0-4 still fire)
 *  6c. review coverage incomplete            → NO_GO     COVERAGE_INCOMPLETE
 *     (#2337, opt-in: the review ran but not over every required unit)
 *  7. loopSignal REVISE_REQUIRED             → NO_GO     BLOCKING_FINDINGS
 *  7b. no unit reached the LLM               → ESCALATE  LLM_NOT_EXECUTED
 *     (#2441, opt-in: every generateReview call skipped the LLM; placed
 *     before every rule that can emit GO / GO_WITH_OBSERVATION)
 *  8. NO_SIGNAL + human-review-recommended
 *     + zero blocking findings               → GO_WITH_OBSERVATION MINOR_FINDINGS_OBSERVE
 *  9. NO_SIGNAL (decision absent/unknown)    → NO_GO     UNDETERMINED
 * 10. CONVERGED + riskAction escalate        → GO_WITH_OBSERVATION RISK_MAP_OBSERVE
 * 11. CONVERGED                              → GO        CONVERGED_CLEAN
 * 12. anything else (unknown loopSignal)     → NO_GO     UNKNOWN_SIGNAL
 *
 * Rule 3 (STOP_OSCILLATED) is unreachable from the production wiring — the
 * artifact's suggestedLoopSignal carries only Layer-1 values. It exists for
 * host-side replay of Layer-2 (runs diff) signals through the same contract.
 *
 * Fail-safe direction: everything unknown or undetermined maps to NO_GO
 * (never GO), and rule 7 exists because `human-review-recommended` is the
 * COMMON verdict in practice (a single security-classified minor finding
 * already drops the security score below the auto-approve bar) — without it
 * most real runs would land on NO_GO and loops would never converge.
 */

import { createHash } from 'node:crypto';

/** @typedef {'GO' | 'GO_WITH_OBSERVATION' | 'NO_GO' | 'ESCALATE'} GateDecisionValue */
/** @typedef {'cliff' | 'hill' | 'field'} GateTier */

/** Files whose change forces rule 0 — the gate config must not unguard itself. */
const GATE_CONFIG_PREFIX = '.river/';

export const GATE_DECISIONS = /** @type {const} */ ([
  'GO',
  'GO_WITH_OBSERVATION',
  'NO_GO',
  'ESCALATE',
]);

export const GATE_REASON_CODES = /** @type {const} */ ([
  'GATE_CONFIG_CHANGED',
  'HUMAN_APPROVAL_REQUIRED',
  'DECISION_ESCALATED',
  'OSCILLATION_DETECTED',
  'RISK_MAP_HUMAN_REVIEW',
  'UNKNOWN_RISK_ACTION',
  'STRICT_BLOCK',
  'DETERMINISTIC_UNRUNNABLE',
  'SKIPPED_BY_POLICY',
  'NOT_EXECUTED',
  'COVERAGE_INCOMPLETE',
  'LLM_NOT_EXECUTED',
  'BLOCKING_FINDINGS',
  'MINOR_FINDINGS_OBSERVE',
  'UNDETERMINED',
  'RISK_MAP_OBSERVE',
  'CONVERGED_CLEAN',
  'UNKNOWN_SIGNAL',
]);

const KNOWN_RISK_ACTIONS = new Set(['comment_only', 'escalate', 'require_human_review']);

const DECISION_TO_TIER = {
  ESCALATE: 'cliff',
  GO_WITH_OBSERVATION: 'hill',
  GO: 'field',
  NO_GO: 'field', // NO_GO is "revise", not a supervision tier; field keeps the enum total
};

const DEFAULT_OBSERVATION_EXPIRES_IN_HOURS = 72;
const DEFAULT_MAX_CONSECUTIVE_AUTO_GO = 5;

/**
 * True when the diff touches the gate's own configuration (rule 0).
 * @param {string[]} changedFiles
 * @returns {boolean}
 */
export function gateConfigChanged(changedFiles) {
  return (Array.isArray(changedFiles) ? changedFiles : []).some(
    (f) => typeof f === 'string' && f.replace(/\\/g, '/').startsWith(GATE_CONFIG_PREFIX)
  );
}

/**
 * Canonical hash of the gate inputs (sha256, first 16 hex chars).
 *
 * Canonicalization: the FIXED field list below, keys in lexicographic order,
 * undefined normalized to null, JSON.stringify of that object. This is a
 * lightweight summary for S3 "same inputs, different decision" regression
 * comparison — it is NOT a tamper-proof / security control (anyone can
 * recompute it). The authoritative integrity check is replaying
 * `gate.inputs` through deriveGateDecision.
 *
 * @param {object} inputs
 * @returns {string}
 */
export function computeGateInputsHash(inputs) {
  const FIELDS = [
    'artifactStatus',
    'blockingFindings',
    'decision',
    'gateConfigChanged',
    'humanApprovalMode',
    'humanApprovalRequired',
    'loopSignal',
    'reviewExecuted',
    'riskAction',
    'riskMapDigest',
    'riskMapPresent',
  ];
  const canonical = {};
  for (const key of FIELDS) {
    canonical[key] = inputs?.[key] === undefined ? null : inputs[key];
  }
  // Epic #1347 S4: strictBlock joins the hashed inputs, but only when true, so
  // every pre-S4 gate (strictBlock absent/false) keeps its exact recorded hash
  // — no conformance-fixture churn. A true value produces a distinct hash so
  // the S3 "same inputs, different decision" regression check stays sound.
  if (inputs?.strictBlock === true) canonical.strictBlock = true;
  // #1401 §11.5: same "only when true" scheme so pre-#1401 gates keep their hash.
  if (inputs?.deterministicUnrunnable === true) canonical.deterministicUnrunnable = true;
  // #2337: same "only when true" scheme. The coverage gate is opt-in and OFF by
  // default, so every gate recorded before it (and every gate derived with the
  // opt-in off) keeps its exact recorded hash — a host replaying an old
  // `gate.inputs` object, which has no `coverageIncomplete` key at all, still
  // reproduces both the decision and the hash. A true value produces a distinct
  // hash so the S3 "same inputs, different decision" regression check stays sound.
  if (inputs?.coverageIncomplete === true) canonical.coverageIncomplete = true;
  // #2441: same "only when true" scheme; the opt-in is OFF by default.
  if (inputs?.llmNotExecuted === true) canonical.llmNotExecuted = true;
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

/**
 * Coverage-gate opt-in predicate (#2337) — the SINGLE source of truth, so the
 * two wiring sites (`deriveRunGate` and `review-plan`'s gateContext) cannot
 * drift apart (the P2 #1434 lesson). Pure: the env object is an argument, never
 * read from `process` here, so `deriveGateDecision` and everything it depends on
 * stays replayable.
 *
 * Checked strictly (exactly the string `'1'`) so no near-miss value (`'true'`,
 * `'0'`, `' 1'`, `''`) flips a merge-blocking gate on by accident.
 *
 * @param {Record<string, string | undefined> | undefined} env process.env-like object
 * @returns {boolean}
 */
export function isCoverageGateEnabled(env) {
  return env?.RIVER_GATE_COVERAGE === '1';
}

/**
 * Reduce a Review Coverage object to the gate's `coverageIncomplete` input
 * (#2337). Returns false unless the host opted in AND the coverage object
 * actually reports an incomplete status — an ABSENT or malformed coverage
 * object is NOT read as incomplete, because "no observation" and "observed a
 * gap" are different facts and only the second one should block a merge.
 *
 * @param {{status?: string} | null | undefined} reviewCoverage
 * @param {Record<string, string | undefined> | undefined} env
 * @returns {boolean}
 */
export function coverageIncompleteForGate(reviewCoverage, env) {
  if (!isCoverageGateEnabled(env)) return false;
  const status = reviewCoverage?.status;
  return status === 'partial' || status === 'not_executed';
}

/**
 * Require-LLM gate opt-in predicate (#2441). Same strict `'1'` check and the
 * same purity as isCoverageGateEnabled.
 *
 * @param {Record<string, string | undefined> | undefined} env process.env-like object
 * @returns {boolean}
 */
export function isRequireLlmGateEnabled(env) {
  return env?.RIVER_GATE_REQUIRE_LLM === '1';
}

/**
 * Reduce the run's "no unit reached the LLM" fact (`allLlmAttemptsSkipped` in
 * review-coverage.mjs) to the gate's `llmNotExecuted` input (#2441). False
 * unless the host opted in, so the default gate is unchanged.
 *
 * @param {boolean | undefined} llmNotExecuted
 * @param {Record<string, string | undefined> | undefined} env
 * @returns {boolean}
 */
export function llmNotExecutedForGate(llmNotExecuted, env) {
  return isRequireLlmGateEnabled(env) && llmNotExecuted === true;
}

/**
 * Derive the gate decision for a finalized review artifact.
 *
 * Pure and deterministic: LLM output can only have contributed in the
 * escalation direction upstream (via humanApprovalRequired /
 * blocking findings); nothing here lets it push a decision toward GO.
 *
 * @param {object} opts
 * @param {string} [opts.loopSignal] - artifact.suggestedLoopSignal (Layer 1/2 value)
 * @param {string} [opts.decision] - artifact.decision (verdict)
 * @param {boolean} [opts.humanApprovalRequired]
 * @param {string} [opts.humanApprovalMode] - audit: regex-only | llm-adjudicated | llm-skipped | regex-fallback
 * @param {string} [opts.riskAction] - risk-map aggregateAction; absent → comment_only
 * @param {number} [opts.blockingFindings] - count of critical/major findings
 * @param {string[]} [opts.changedFiles]
 * @param {boolean} [opts.gateConfigChanged] - explicit override so a host can
 *   replay a recorded `gate.inputs` object verbatim (rule 0 is derived from
 *   changedFiles when this is omitted)
 * @param {boolean} [opts.reviewExecuted] - true only when skills actually ran
 *   against a resolved diff (executeReview path, status ok). Fail-safe: when
 *   false, non-escalated outcomes are NO_GO NOT_EXECUTED — a vacuous perfect
 *   score over zero executed findings must not read as CONVERGED_CLEAN.
 * @param {string} [opts.artifactStatus] - artifact.status echo (ok | no-changes)
 *   so hosts can distinguish "nothing to review" from "review suppressed".
 * @param {boolean} [opts.riskMapPresent]
 * @param {string|null} [opts.riskMapDigest]
 * @param {boolean} [opts.strictBlock] - Epic #1347 S4: a deterministic skill
 *   (evaluationType 'deterministic') with deterministicGate.failSeverity
 *   'strict_block' produced a finding. Forces an UNCONDITIONAL NO_GO
 *   (reasonCode STRICT_BLOCK) — it blocks even below the critical/major
 *   severity floor that blockingFindings counts, and cannot be waived by a
 *   label-skip or a dry-run. The escalation cliffs (rules 0-4) still win, as
 *   ESCALATE is more conservative than NO_GO.
 * @param {boolean} [opts.deterministicUnrunnable] - Epic #1347 §11.5 (#1401): a
 *   deterministic-gate command could not produce a verdict ABOUT ITS SUBJECT.
 *   Two ways that happens: the command itself could not be run (spawn failure /
 *   timeout / signal kill / invalid entry), or — since #2320 — it ran but its
 *   subject files never reached the sandbox, so its exit code describes
 *   something other than the change under review. Forces ESCALATE (reasonCode
 *   DETERMINISTIC_UNRUNNABLE) — a "cannot judge" state, not a violation. Placed
 *   AFTER strictBlock so a confirmed NO_GO is never softened to ESCALATE by an
 *   induced-unrunnable elsewhere. The staging half is opt-in and OFF by default
 *   (`RIVER_GATE_STAGING_UNRUNNABLE=1`, read in the orchestrator, never here —
 *   this function stays pure).
 * @param {boolean} [opts.coverageIncomplete] - #2337: the review executed but
 *   did not cover every REQUIRED review unit (`reviewCoverage.status` is
 *   `partial` or `not_executed`). An INDEPENDENT gate input, deliberately not a
 *   `loopSignal` downgrade: routing it through the signal makes the outcome
 *   depend on `decision` (`auto-approve` lands on rule 9 NO_GO/UNDETERMINED but
 *   `human-review-recommended` lands on rule 8 GO_WITH_OBSERVATION, exit 0), so
 *   the signal route does not give a UNIFORM fail-safe. As its own rule (6c) it
 *   precedes both and every verdict lands on NO_GO. Opt-in and OFF by default:
 *   the caller sets it only when the host opted in, so the default gate output
 *   is unchanged bit for bit.
 * @param {boolean} [opts.llmNotExecuted] - #2441: every generateReview call
 *   intentionally skipped the LLM (missing key / offline / unsupported
 *   provider), so no semantic review ran. Forces ESCALATE (LLM_NOT_EXECUTED).
 *   Placed as rule 7b: after 6b / 6c / 7 so an existing NO_GO wins, and
 *   before rules 8-11 so the run can never reach GO / GO_WITH_OBSERVATION.
 *   Opt-in and OFF by default: the caller sets it only when the host opted in.
 * @param {object} [opts.config] - effective config; gate.observation / gate.circuitBreaker read here
 * @returns {{ decision: GateDecisionValue, reasonCode: string, tier: GateTier,
 *   inputs: object, inputsHash: string, configSnapshot: object, observation?: object,
 *   schemaVersion: '1' }}
 */
export function deriveGateDecision({
  loopSignal,
  decision,
  humanApprovalRequired = false,
  humanApprovalMode,
  riskAction,
  blockingFindings = 0,
  changedFiles = [],
  gateConfigChanged: gateConfigChangedOverride,
  reviewExecuted = false,
  artifactStatus = null,
  riskMapPresent = false,
  riskMapDigest = null,
  strictBlock = false,
  deterministicUnrunnable = false,
  coverageIncomplete = false,
  llmNotExecuted = false,
  config = {},
} = {}) {
  const configChanged =
    typeof gateConfigChangedOverride === 'boolean'
      ? gateConfigChangedOverride
      : gateConfigChanged(changedFiles);
  const effectiveRiskAction = riskAction ?? 'comment_only';

  const inputs = {
    loopSignal: loopSignal ?? null,
    decision: decision ?? null,
    humanApprovalRequired: humanApprovalRequired === true,
    humanApprovalMode: humanApprovalMode ?? null,
    riskAction: effectiveRiskAction,
    blockingFindings: Number.isFinite(blockingFindings) ? blockingFindings : 0,
    gateConfigChanged: configChanged,
    reviewExecuted: reviewExecuted === true,
    artifactStatus: artifactStatus ?? null,
    riskMapPresent: riskMapPresent === true,
    riskMapDigest: riskMapDigest ?? null,
    strictBlock: strictBlock === true,
    deterministicUnrunnable: deterministicUnrunnable === true,
  };
  // #2337: echoed ONLY when true, matching the canonical-hash scheme above.
  // The coverage gate is opt-in and OFF by default, and an always-present
  // `coverageIncomplete: false` would change the emitted `gate.inputs` object
  // for every existing consumer and every recorded conformance fixture. Absent
  // means "the coverage gate did not fire", which is exactly what a pre-#2337
  // artifact means by having no such key — so replay is total in both directions.
  if (coverageIncomplete === true) inputs.coverageIncomplete = true;
  // #2441: echoed only when true, for the same reason.
  if (llmNotExecuted === true) inputs.llmNotExecuted = true;

  const expiresInHours =
    config?.gate?.observation?.expiresInHours ?? DEFAULT_OBSERVATION_EXPIRES_IN_HOURS;
  const maxConsecutiveAutoGo =
    config?.gate?.circuitBreaker?.maxConsecutiveAutoGo ?? DEFAULT_MAX_CONSECUTIVE_AUTO_GO;
  const configSnapshot = { expiresInHours, maxConsecutiveAutoGo };

  const decide = () => {
    // 0. Bootstrap cliff: the gate config must not unguard itself.
    if (configChanged) return ['ESCALATE', 'GATE_CONFIG_CHANGED'];
    // 1. Plan-review cliff (regex floor + escalation-only LLM upstream).
    if (inputs.humanApprovalRequired) return ['ESCALATE', 'HUMAN_APPROVAL_REQUIRED'];
    // 2-3. Loop-signal escalations.
    if (loopSignal === 'ESCALATE_HUMAN') return ['ESCALATE', 'DECISION_ESCALATED'];
    if (loopSignal === 'STOP_OSCILLATED') return ['ESCALATE', 'OSCILLATION_DETECTED'];
    // 4. Risk-map cliff.
    if (effectiveRiskAction === 'require_human_review')
      return ['ESCALATE', 'RISK_MAP_HUMAN_REVIEW'];
    // 5. Unknown risk action never falls through to GO (fail-safe).
    if (!KNOWN_RISK_ACTIONS.has(effectiveRiskAction)) return ['NO_GO', 'UNKNOWN_RISK_ACTION'];
    // 5b. Deterministic strict_block (Epic #1347 S4, #1351): a deterministic
    // skill (evaluationType 'deterministic', failSeverity 'strict_block')
    // produced a finding. Unconditional NO_GO — deterministic detectors are
    // authoritative (see .claude/rules/review-core.md §#1070), so this blocks
    // even below the critical/major floor and cannot be waived by a label-skip
    // or dry-run. Placed AFTER the escalation cliffs (0-4) — ESCALATE is more
    // conservative than NO_GO — and BEFORE the skip/not-executed exemptions so
    // a bypass attempt cannot suppress a deterministic block.
    if (inputs.strictBlock) return ['NO_GO', 'STRICT_BLOCK'];
    // 5c. Deterministic command unrunnable (Epic #1347 §11.5, #1401): a
    // deterministic-gate command could not produce a verdict (spawn failure /
    // timeout / signal kill / invalid entry). Not a confirmed violation but a
    // "cannot judge" state → ESCALATE (human looks). Placed AFTER strictBlock
    // (5b): a CONFIRMED violation (NO_GO) must not be softened to human-approval
    // by a weak "another command was unrunnable" signal — that would let an
    // attacker escape strict_block by inducing an unrunnable elsewhere (§11.5.2).
    // The cliffs (0-4) still precede both. Nothing produces this input yet — the
    // executor wiring lands with §11.8(c2)/(d); this is the gate contract only.
    if (inputs.deterministicUnrunnable) return ['ESCALATE', 'DETERMINISTIC_UNRUNNABLE'];
    // 6a. Team-labeled skip (#1350 PR-C): the decision stays NO_GO (a label
    // must not become a gate bypass — the conservative call from the S2
    // design review), but the reasonCode tells hosts this was an explicit
    // policy skip rather than a suppressed/unresolved review.
    if (inputs.artifactStatus === 'skipped-by-label') return ['NO_GO', 'SKIPPED_BY_POLICY'];
    // 6b. Review must have actually executed for any GO-family outcome:
    // plan-only / no-changes runs score [] findings as a vacuous perfect
    // verdict, and suppressed diff resolution must not earn a GO.
    if (!inputs.reviewExecuted) return ['NO_GO', 'NOT_EXECUTED'];
    // 6c. Coverage incomplete (#2337, opt-in): the review executed, but not over
    // every REQUIRED unit. "Some of the change was never looked at" is the same
    // family of fact as 6b ("nothing was looked at"), so it sits next to it and
    // BEFORE rules 7-11 — that placement is what makes the fail-safe UNIFORM.
    // Routing the same fact through a loopSignal downgrade instead would make
    // the outcome depend on `decision`: CONVERGED→NO_SIGNAL lands a
    // human-review-recommended run on rule 8 (GO_WITH_OBSERVATION, exit 0) while
    // an auto-approve run lands on rule 9 (NO_GO). The cliffs (0-4) plus
    // strictBlock (5b) keep precedence — a confirmed NO_GO or an ESCALATE is
    // never traded for this weaker one — and 6a/6b keep it too, since "nothing
    // ran" is a more specific absence than "not everything ran".
    //
    // Being AHEAD of rule 7 is a deliberate loss of diagnostic detail, not a
    // free win: when a run has blocking findings AND incomplete coverage the
    // reasonCode reads COVERAGE_INCOMPLETE, hiding the more actionable
    // BLOCKING_FINDINGS. `decision` is NO_GO either way, so nothing about merge
    // authority changes. The order is this way round because the coverage fact
    // qualifies the finding list itself: a partial review's "these are the
    // blocking findings" is not a complete statement, so naming the incomplete
    // coverage first describes the run more honestly than naming a finding
    // count derived from it. Pinned in tests/gate-incompleteness-optin.test.mjs.
    if (inputs.coverageIncomplete) return ['NO_GO', 'COVERAGE_INCOMPLETE'];
    // 7. Blocking findings → revise.
    if (loopSignal === 'REVISE_REQUIRED') return ['NO_GO', 'BLOCKING_FINDINGS'];
    // 7b. No unit reached the LLM (#2441, opt-in). The host asked for a
    // semantic review, and none ran, so a human decides. After 6b and 7 so a
    // confirmed NO_GO (dry-run NOT_EXECUTED, BLOCKING_FINDINGS) is never traded
    // for it; before 8-11 so it can never yield GO / GO_WITH_OBSERVATION.
    if (inputs.llmNotExecuted) return ['ESCALATE', 'LLM_NOT_EXECUTED'];
    // 8-9. NO_SIGNAL: the common "warn" verdict observes; true unknowns stop.
    if (loopSignal === 'NO_SIGNAL') {
      if (decision === 'human-review-recommended' && inputs.blockingFindings === 0) {
        return ['GO_WITH_OBSERVATION', 'MINOR_FINDINGS_OBSERVE'];
      }
      return ['NO_GO', 'UNDETERMINED'];
    }
    // 10-11. Converged: hill when the risk map asks for observation, else field.
    if (loopSignal === 'CONVERGED') {
      if (effectiveRiskAction === 'escalate') return ['GO_WITH_OBSERVATION', 'RISK_MAP_OBSERVE'];
      return ['GO', 'CONVERGED_CLEAN'];
    }
    // 12. Forward-compatible fail-safe.
    return ['NO_GO', 'UNKNOWN_SIGNAL'];
  };

  const [gateDecision, reasonCode] = decide();

  const result = {
    decision: gateDecision,
    reasonCode,
    tier: DECISION_TO_TIER[gateDecision],
    inputs,
    inputsHash: computeGateInputsHash(inputs),
    configSnapshot,
    schemaVersion: '1',
  };

  if (gateDecision === 'GO_WITH_OBSERVATION') {
    // Execution semantics (host responsibility): on expiry the host stops the
    // loop AND treats changes originating from `files` as unreviewed
    // (re-review required). "stop" is the only permitted value in S2;
    // "promote" lands with the S4 enforcement implementation.
    result.observation = {
      expiresInHours,
      onExpiry: 'stop',
      files: Array.isArray(changedFiles) ? changedFiles.slice(0, 100) : [],
    };
  }

  return result;
}
