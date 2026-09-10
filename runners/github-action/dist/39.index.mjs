export const id = 39;
export const ids = [39];
export const modules = {

/***/ 1039:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolveGateExitCode: () => (/* binding */ resolveGateExitCode)
/* harmony export */ });
/* unused harmony exports gateDecisionExitCode, combineExitCodes */
/**
 * Gate → CLI exit-code mapping (Epic #1347 S4 PR-C, #1351).
 *
 * `--gate` turns the machine-readable gate decision into a process exit code so
 * a CI job / autonomous loop can enforce it. The escalation tier gets a
 * DEDICATED code (3) so an exit-code-only consumer cannot mistake a "cliff"
 * (human approval required) for a normal revise/fail — keeping the Epic's
 * "崖 = HITL preserved" invariant at the CI boundary.
 *
 *   GO | GO_WITH_OBSERVATION → 0   (proceed; hill tier still proceeds)
 *   NO_GO                    → 1   (revise / fail — same as --fail-on)
 *   ESCALATE                 → 3   (human approval required; unused by run)
 *   unknown / undefined      → 1   (fail-safe: an underived gate never exits 0)
 *
 * Pure / side-effect-free.
 */

/**
 * @param {string|undefined} decision - gate.decision
 * @returns {0|1|3}
 */
function gateDecisionExitCode(decision) {
  switch (decision) {
    case 'GO':
    case 'GO_WITH_OBSERVATION':
      return 0;
    case 'ESCALATE':
      return 3;
    case 'NO_GO':
      return 1;
    default:
      return 1; // fail-safe — never exit 0 on an unknown/underived gate
  }
}

// Exit-code severity precedence (NOT numeric order): a warn (2) must never mask
// a hard fail (1) or an escalation (3). Higher rank wins.
const EXIT_SEVERITY_RANK = { 0: 0, 2: 1, 1: 2, 3: 3 };

/**
 * Combine exit codes by severity precedence: escalate(3) > fail(1) > warn(2) >
 * pass(0). Used when `--gate` runs alongside `--fail-on`/`--warn-on` so the
 * stricter outcome wins — numeric `Math.max` would wrongly let warn(2) beat
 * fail(1).
 *
 * @param {...number} codes
 * @returns {number}
 */
function combineExitCodes(...codes) {
  let best = 0;
  let bestRank = 0;
  for (const c of codes) {
    const rank = EXIT_SEVERITY_RANK[c] ?? EXIT_SEVERITY_RANK[1]; // unknown → fail rank
    // Track bestRank explicitly: re-deriving it as EXIT_SEVERITY_RANK[best]
    // would yield undefined→0 for an unknown `best` and let a lower-rank code
    // (e.g. warn) overwrite it (gemini #1404).
    if (rank > bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Resolve the opt-in review-gate exit code shared by `river review` (plan/exec)
 * and `river run`. Extracted verbatim from the two identical CLI blocks so the
 * severity-gate + decision-gate combination stays in one place (#1452 refactor).
 *
 * Behavior is byte-identical to the inlined blocks: the FAIL/WARN and
 * `Gate: … → exit N` lines, their order, and the returned code are unchanged.
 * The two call sites differ only in HOW they source (a) the object passed to
 * `evaluateReviewGate` and (b) the `{ decision, reasonCode }` gate object, so
 * both are supplied as thunks and invoked lazily — `getGateInput` only when a
 * severity flag is set, `getGateObject` only when `--gate` is set — to preserve
 * the original blocks' lazy computation (e.g. `deriveRunGate` / `formatJsonOutput`
 * are not called unless their branch runs).
 *
 * @param {object} params
 * @param {string|undefined} params.failOn
 * @param {string|undefined} params.warnOn
 * @param {boolean|undefined} params.advisoryOnly
 * @param {boolean|undefined} params.gate
 * @param {() => object} params.getGateInput - object passed to evaluateReviewGate
 * @param {() => ({ decision?: string, reasonCode?: string } | undefined)} params.getGateObject
 * @returns {Promise<number>}
 */
async function resolveGateExitCode({
  failOn,
  warnOn,
  advisoryOnly,
  gate,
  getGateInput,
  getGateObject,
}) {
  let severityCode = 0;
  if (failOn || warnOn || advisoryOnly) {
    const { evaluateReviewGate } = await __webpack_require__.e(/* import() */ 209).then(__webpack_require__.bind(__webpack_require__, 9209));
    const result = evaluateReviewGate(getGateInput(), {
      failOn: failOn ?? 'critical',
      warnOn: warnOn ?? 'major',
      advisoryOnly,
    });
    if (result.level === 'fail') {
      console.error(`Review gate: FAIL (max severity: ${result.maxSeverity}).`);
    } else if (result.level === 'warn') {
      console.error(`Review gate: WARN (max severity: ${result.maxSeverity}).`);
    }
    severityCode = result.code;
  }
  // Epic #1347 S4 (#1351): --gate maps the gate DECISION to an exit code
  // (GO→0 / NO_GO→1 / ESCALATE→3). When combined with a severity gate the
  // stricter outcome wins.
  if (gate) {
    const gateObject = getGateObject();
    const decision = gateObject?.decision;
    const gateCode = gateDecisionExitCode(decision);
    console.error(
      `Gate: ${decision ?? 'UNKNOWN'} (${gateObject?.reasonCode ?? 'n/a'}) → exit ${gateCode}.`
    );
    return combineExitCodes(severityCode, gateCode);
  }
  return severityCode;
}


/***/ })

};

//# sourceMappingURL=39.index.mjs.map