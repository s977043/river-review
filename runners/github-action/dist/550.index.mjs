export const id = 550;
export const ids = [550];
export const modules = {

/***/ 5550:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   executeFlow: () => (/* binding */ executeFlow)
/* harmony export */ });
/* unused harmony exports STEP_OUTCOMES, FLOW_RUN_MODES, ON_UNSATISFIED_OUTCOMES, REVIEWER_CAPABILITY_KEY, RESERVED_PRIMITIVES, STOP_REASON_MISSING_INPUT, STOP_REASON_NOT_EXECUTED, FlowRunnerError */
/* harmony import */ var _gate_decision_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2773);
/* harmony import */ var _flow_loader_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4357);
/* harmony import */ var _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(3077);
// Flow runner skeleton (Epic #2011 AC7, P1 of 5).
//
// Walks the `steps[]` of one Flow document in index order and records, for
// every step, what a conforming runtime does with it. P1 is the skeleton:
// it decides the order, the `when` gating and the stop / skip / degrade
// bookkeeping, and it dispatches to a capability only when the caller has
// injected one. Nothing here reviews, selects, verifies or gates.
//
// Boundaries (ADR-009 D3, RA-1..RA-4):
//   - this module never reads the Flow assets from disk. The document arrives
//     already loaded and validated as `resolveFlowEntry().document`
//     (src/lib/flow-loader.mjs); the observe-mode scan in
//     tests/flow-definitions.test.mjs keeps flow-loader the ONLY reader;
//   - this module holds no judgment vocabulary. No severity, no gate, no
//     threshold, no decision. `derive-gate` and `human-escalation` are
//     reserved primitives that P1 records as `not-implemented` even when a
//     capability is injected under their name, so a Flow cannot reach a gate
//     or a human through this module yet. Human authority is unchanged
//     (`canApproveMerge: false` in agents/contracts/*.agent.json, pinned by
//     tests/flow-runner.test.mjs);
//   - the only reason codes it emits are imported from the existing gate
//     vocabulary (`GATE_REASON_CODES`, src/lib/gate-decision.mjs). There is no
//     second reason-code system.
//
// Contract:
//   executeFlow({ document, capabilities = {}, inputs = {}, judgment = {},
//                 inputSources?, unboundInputNames?, mode = 'observe' })
//     -> { steps: StepOutcome[], stopped: boolean, stopReason?: GateReasonCode,
//          missingInputs: string[], mode }
//
//   StepOutcome = { index, id, kind: 'primitive' | 'reviewer', parallel,
//                   parallelRun: number | null, outcome, reason?, result? }
//   outcome is one of STEP_OUTCOMES (closed set):
//     executed         an injected capability ran for this step
//     skipped          the step was not run and `onUnsatisfied: "skip"`
//     degraded         the step ran in reduced form (or could not run) and
//                      `onUnsatisfied: "degrade"`
//     stopped          the step could not run and `onUnsatisfied` is absent
//                      or "stop"; the walk ends here
//     not-implemented  observe mode only: no capability injected for the
//                      step, or a reserved primitive; recorded, walk continues
//
//   Three events make a step "unsatisfied" (schema `$defs/onUnsatisfied`):
//   its `when` clause does not hold, its capability is not injected, or the
//   capability throws. All three are handled by the step's `onUnsatisfied`
//   (absent means `stop`, the safe side) — except that in observe mode a
//   missing capability is `not-implemented` instead: observe mode exists to
//   record what WOULD run for every step, so it must not stop on the very
//   thing it is observing. Transition table (event x onUnsatisfied):
//
//     event                | stop     | skip     | degrade
//     ---------------------+----------+----------+------------------------------
//     when unsatisfied     | stopped  | skipped  | degraded (capability called
//                          |          |          |   with `degraded: true`)
//     capability missing   | stopped* | skipped* | degraded*
//     capability throws    | stopped  | skipped  | degraded (not re-called)
//       * execute mode; observe mode records `not-implemented` and continues.
//
//   Stop reasons: `DETERMINISTIC_UNRUNNABLE` for a missing input (required
//   input before the first step, or a `when` that must stop);
//   `NOT_EXECUTED` for a capability that is missing or threw.
//
//   A required input (`document.inputs[].required === true`) missing from
//   `inputs` stops the Flow before the first step (`stopped: true`,
//   `missingInputs` lists them). Execute mode returns `steps: []`; observe
//   mode still enumerates EVERY step in Flow order, each `stopped` with
//   reason `required input missing: <names>`, so `steps.length` always
//   equals `document.steps.length` in observe mode.
//
//   Capabilities are addressed by the primitive name for `use` steps and by
//   the key `reviewer` for `reviewer` steps (keys and input names are NFC
//   normalised before lookup, own properties only). A capability is a
//   function `(context) => unknown | Promise<unknown>` receiving
//   `{ step, index, inputs, document, degraded, reason }`; `degraded` is true
//   only when the step is dispatched in reduced form (`when` unsatisfied +
//   `onUnsatisfied: "degrade"`), with `reason` saying why. The return value
//   is stored verbatim as `result`.
//
//   `judgment` is the connection point through which a gate is derived (P4).
//   `derive-gate` dispatches only when `judgment.deriveGate` is injected —
//   never through `capabilities`, so a caller cannot smuggle a gate in as an
//   ordinary capability. Without the injection it stays `not-implemented`,
//   and `human-escalation` is always record-only whatever is injected.
//
//   **This module builds no argument for the gate.** `deriveGate` is called
//   with the same `context` every other step receives, and the injector is
//   expected to close over whatever the decision needs. The reason is that
//   `deriveGateDecision` (`src/lib/gate-decision.mjs`) takes 18 named inputs
//   that live outside the Flow vocabulary — artifact findings, risk-map
//   digests, `strictBlock`, `deterministicUnrunnable`. Both existing callers
//   already assemble those themselves before calling it
//   (`src/lib/review-plan.mjs`, `src/lib/run-gate.mjs`); notably each counts
//   `blockingFindings` from its own artifact. Having the runner assemble them
//   instead would drag severity vocabulary into a module that deliberately
//   holds none, and would route this run's own results back into the
//   judgment (RA-1).
//
//   Steps marked `parallel: true` form contiguous runs (schema `steps`
//   description). P1 does not run them concurrently; it walks them in index
//   order (each capability awaited before the next) and tags each member
//   with its `parallelRun` ordinal, so the outcome array is always in `steps`
//   order and two calls with the same input are deepEqual.





/** Closed outcome vocabulary of one step record. */
const STEP_OUTCOMES = Object.freeze([
  'executed',
  'skipped',
  'degraded',
  'stopped',
  'not-implemented',
]);

/** Run modes. `observe` records; `execute` enforces `onUnsatisfied` fully. */
const FLOW_RUN_MODES = Object.freeze(['observe', 'execute']);

/** Schema `onUnsatisfied` value -> step outcome. Absent key means `stop`. */
const ON_UNSATISFIED_OUTCOMES = Object.freeze({
  stop: 'stopped',
  skip: 'skipped',
  degrade: 'degraded',
});

/** Capability key under which every `reviewer:` step is dispatched. */
const REVIEWER_CAPABILITY_KEY = 'reviewer';

/**
 * Primitives P1 never dispatches, whatever the caller injects. Both are the
 * points where a Flow would touch judgment (a gate) or a human; wiring them is
 * a later phase (`judgment.deriveGate`, P4) with its own review, not a
 * capability key.
 */
const RESERVED_PRIMITIVES = Object.freeze(['derive-gate', 'human-escalation']);

/**
 * Pick one reason code out of the gate vocabulary. Throws at module load if
 * the name is not in `GATE_REASON_CODES`, so this module can never carry a
 * reason the gate does not know.
 */
function gateReasonCode(name) {
  if (!_gate_decision_mjs__WEBPACK_IMPORTED_MODULE_0__/* .GATE_REASON_CODES */ .QS.includes(name)) {
    throw new Error(`flow-runner: "${name}" is not a GATE_REASON_CODES value`);
  }
  return name;
}

/** Stop reason for a missing required input or a `when` that must stop. */
const STOP_REASON_MISSING_INPUT = gateReasonCode('DETERMINISTIC_UNRUNNABLE');

/** Stop reason for a capability that is not injected or that threw (execute mode). */
const STOP_REASON_NOT_EXECUTED = gateReasonCode('NOT_EXECUTED');

class FlowRunnerError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'FlowRunnerError';
  }
}

const isPlainObject = (value) =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * Own enumerable entries of `object`, keyed by the NFC-normalised key.
 * Prototype properties (`constructor`, ...) never appear, so a Flow naming
 * one cannot reach them.
 */
function normalisedEntries(object) {
  const map = new Map();
  for (const key of Object.keys(object)) {
    const name = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__/* .nonEmptyNfcString */ .bS)(key);
    if (name != null) map.set(name, object[key]);
  }
  return map;
}

/** An input counts as present when the key exists and the value is not nullish. */
const isInputPresent = (inputs, name) => inputs.has(name) && inputs.get(name) != null;

/** `{ id, kind }` of a step, from its single `use` / `reviewer` key. */
function describeStep(step, index) {
  if (!isPlainObject(step)) {
    throw new FlowRunnerError(`step[${index}] is not an object.`);
  }
  const use = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__/* .nonEmptyNfcString */ .bS)(step.use);
  const reviewer = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__/* .nonEmptyNfcString */ .bS)(step.reviewer);
  if (use != null && reviewer == null) return { id: use, kind: 'primitive' };
  if (reviewer != null && use == null) return { id: reviewer, kind: 'reviewer' };
  throw new FlowRunnerError(`step[${index}] must carry exactly one of "use" or "reviewer".`);
}

/**
 * Evaluate a step's `when` clause against the inputs. Returns `null` when the
 * step has no clause or the clause holds, else the reason it does not. A
 * clause naming an input the document does not declare is a Flow author
 * error and throws.
 */
function unsatisfiedWhen(step, inputs, declaredInputs, index) {
  const when = step.when;
  if (when == null) return null;
  const name = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__/* .nonEmptyNfcString */ .bS)(when?.input);
  const state = when?.state;
  if (name == null || (state !== 'present' && state !== 'absent')) {
    throw new FlowRunnerError(`step[${index}] has an invalid "when" clause.`);
  }
  if (!declaredInputs.has(name)) {
    throw new FlowRunnerError(
      `step[${index}] "when" names input "${name}", which document.inputs does not declare.`
    );
  }
  const present = isInputPresent(inputs, name);
  if ((state === 'present') === present) return null;
  return `when: input "${name}" is ${present ? 'present' : 'absent'}, required ${state}`;
}

/** Outcome for an unsatisfied step, from `onUnsatisfied` (absent -> stop). */
function unsatisfiedOutcome(step, index) {
  const key = step.onUnsatisfied ?? 'stop';
  const outcome = ON_UNSATISFIED_OUTCOMES[key];
  if (outcome == null) {
    throw new FlowRunnerError(`step[${index}] has an unknown onUnsatisfied "${key}".`);
  }
  return outcome;
}

/** Input names the document declares (NFC), used to validate `when`. */
function declaredInputNames(document) {
  const names = new Set();
  for (const input of Array.isArray(document.inputs) ? document.inputs : []) {
    const name = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_2__/* .nonEmptyNfcString */ .bS)(input?.name);
    if (name != null) names.add(name);
  }
  return names;
}

/**
 * Execute (P1: walk) one Flow document.
 *
 * @param {object} params
 * @param {object} params.document  `resolveFlowEntry().document`
 * @param {Record<string, Function>} [params.capabilities]
 * @param {Record<string, unknown>} [params.inputs]
 * @param {object} [params.judgment]  `{ deriveGate }` is the only path through
 *   which `derive-gate` dispatches (P4). Omit it and that step stays
 *   `not-implemented`. `deriveGate` receives the ordinary step `context` and
 *   NO gate arguments: the injector closes over what the decision needs. See
 *   the `judgment` note at the top of this file for why.
 * @param {'observe'|'execute'} [params.mode]  `observe` (default) records a
 *   missing capability as `not-implemented` and continues; `execute` treats
 *   it as unsatisfied per `onUnsatisfied`.
 * @param {Record<string, {id?: string, path?: string}>} [params.inputSources]
 *   Optional CLI binding metadata, ignored when it is not a plain object. Only
 *   the artifact `id` reaches the reason text: the resolved `path` stays out of
 *   the Review Artifact, which is written to `--output-file` and echoed by the
 *   Action. When a role is both unbound and bound-but-missing, unbound wins,
 *   because that is the case the user can act on without guessing a path.
 *   When supplied with `unboundInputNames`, it
 *   makes a missing required input's user-facing reason actionable.
 * @param {string[]} [params.unboundInputNames] Optional names with no binding,
 *   ignored when it is not an array.
 * @returns {Promise<{ steps: object[], stopped: boolean, stopReason?: string, missingInputs: string[], mode: string }>}
 */
async function executeFlow({
  document,
  capabilities = {},
  inputs = {},
  judgment = {},
  inputSources,
  unboundInputNames,
  mode = 'observe',
} = {}) {
  if (!isPlainObject(document) || !Array.isArray(document.steps)) {
    throw new FlowRunnerError('executeFlow: "document" must be a Flow document with steps[].');
  }
  if (!isPlainObject(capabilities)) {
    throw new FlowRunnerError('executeFlow: "capabilities" must be an object.');
  }
  if (!isPlainObject(inputs)) {
    throw new FlowRunnerError('executeFlow: "inputs" must be an object.');
  }
  if (!isPlainObject(judgment)) {
    throw new FlowRunnerError('executeFlow: "judgment" must be an object.');
  }
  // #2011 AC7 P4-1: `deriveGate` は「注入されたら関数でなければならない」。
  // 未注入（undefined）は正常で、その場合 `derive-gate` は P3 までと同じく
  // `not-implemented` のまま動かない。**関数以外を渡す**のは呼び出し側の誤りなので
  // 例外にする。`capabilities` 側に同名を置いても効かないことは意図的で、
  // 判定の注入口を 1 つに保つための設計である（本ファイル冒頭の注記）。
  if (judgment.deriveGate !== undefined && typeof judgment.deriveGate !== 'function') {
    throw new FlowRunnerError('executeFlow: "judgment.deriveGate" must be a function.');
  }
  // These two are OPTIONAL diagnostics, not part of the execution contract: a
  // caller that passes a wrong shape gets the generic reason, not an exception.
  // Throwing here would have been a backward-compatibility break, since every
  // one of these values was an ignored extra property before this argument
  // existed (#2011 AC7 P3-3 review).
  const bindingSources = isPlainObject(inputSources) ? inputSources : undefined;
  const unboundNames = Array.isArray(unboundInputNames) ? unboundInputNames : undefined;
  if (!FLOW_RUN_MODES.includes(mode)) {
    throw new FlowRunnerError(
      `executeFlow: unknown mode "${mode}" (expected ${FLOW_RUN_MODES.join(' | ')}).`
    );
  }

  const inputMap = normalisedEntries(inputs);
  const inputSourceMap = bindingSources === undefined ? null : normalisedEntries(bindingSources);
  const unboundInputSet = new Set(
    (unboundNames ?? [])
      .filter((name) => typeof name === 'string')
      .map((name) => name.normalize('NFC'))
  );
  const capabilityMap = normalisedEntries(capabilities);
  const declaredInputs = declaredInputNames(document);
  const observe = mode === 'observe';

  const missingInputs = (0,_flow_loader_mjs__WEBPACK_IMPORTED_MODULE_1__/* .requiredInputNames */ .sp)(document).filter(
    (name) => !isInputPresent(inputMap, name)
  );
  const missingInputReason = () => {
    // The optional metadata is deliberately opt-in: direct callers that omit
    // it retain P1's exact reason text.
    if (inputSourceMap === null && unboundNames === undefined) {
      return `required input missing: ${missingInputs.join(', ')}`;
    }
    return missingInputs
      .map((name) => {
        if (unboundInputSet.has(name.normalize('NFC'))) {
          return `input not bound: ${name}; supply it with --artifact ${name}=<path>`;
        }
        const source = inputSourceMap?.get(name);
        if (source && typeof source === 'object' && typeof source.id === 'string') {
          // Report the artifact ID, never the resolved path. The Review
          // Artifact is written to `--output-file` and echoed by the Action, so
          // an absolute path here would carry the user's directory layout into
          // an externally shared document (#2011 AC7 P3-3 review).
          return `bound artifact missing: ${source.id}`;
        }
        return `required input missing: ${name}`;
      })
      .join('; ');
  };
  const steps = [];
  const stoppedResult = (stopReason) => ({ steps, stopped: true, stopReason, missingInputs, mode });
  let parallelRun = -1;
  let previousParallel = false;
  const describe = (index) => {
    const step = document.steps[index];
    const { id, kind } = describeStep(step, index);
    const parallel = step.parallel === true;
    if (parallel && !previousParallel) parallelRun += 1;
    previousParallel = parallel;
    return {
      step,
      record: { index, id, kind, parallel, parallelRun: parallel ? parallelRun : null },
    };
  };

  if (missingInputs.length > 0) {
    // Execute mode stops before the first step. Observe mode never leaves
    // `steps` empty: its purpose is the list of what WOULD have run, so every
    // step is enumerated in Flow order, each recorded as `stopped`.
    if (observe) {
      const reason = missingInputReason();
      for (let index = 0; index < document.steps.length; index += 1) {
        steps.push({ ...describe(index).record, outcome: 'stopped', reason });
      }
    }
    return stoppedResult(STOP_REASON_MISSING_INPUT);
  }

  for (let index = 0; index < document.steps.length; index += 1) {
    const { step, record } = describe(index);
    const { id, kind } = record;

    // 予約 primitive のうち **`human-escalation` は常に record-only** で、P4 でも動かない。
    // `derive-gate` だけが `judgment.deriveGate` の注入時に dispatch する（#2011 AC7 P4）。
    // 注入が無ければ P3 までと同じ `not-implemented` に留まる。
    //
    // dispatch そのものは下の共通経路へ委ねる。ここで独自に呼ぶと、`when` の評価と
    // `onUnsatisfied` の 3 値が効かない別経路になる（P4 の敵対的レビューで blocker 2 件）。
    const gateInjected = id === 'derive-gate' && typeof judgment.deriveGate === 'function';
    if (kind === 'primitive' && RESERVED_PRIMITIVES.includes(id) && !gateInjected) {
      steps.push({ ...record, outcome: 'not-implemented', reason: `reserved primitive "${id}"` });
      continue;
    }
    if (gateInjected && observe) {
      // observe は「何が動くはずか」を並べるモードで、副作用を持たせない。
      // 注入済みでも呼ばず、動く見込みであることだけを記録する。
      steps.push({
        ...record,
        outcome: 'not-implemented',
        reason: 'derive-gate: judgment injected (observe mode does not dispatch)',
      });
      continue;
    }

    const capabilityKey = kind === 'reviewer' ? REVIEWER_CAPABILITY_KEY : id;
    // `derive-gate` の実体は `judgment.deriveGate` であって `capabilities` ではない。
    // 注入口を 1 つに保つ設計（本ファイル冒頭）を守りつつ、`when` / `onUnsatisfied` /
    // 例外処理は他の step と同じ共通経路に載せるため、ここで解決だけ差し替える。
    const capability = gateInjected ? judgment.deriveGate : capabilityMap.get(capabilityKey);
    const hasCapability = typeof capability === 'function';

    // Event 1: `when` does not hold.
    const whenReason = unsatisfiedWhen(step, inputMap, declaredInputs, index);
    let degradedReason = null;
    if (whenReason != null) {
      const outcome = unsatisfiedOutcome(step, index);
      if (outcome === 'stopped') {
        steps.push({ ...record, outcome, reason: whenReason });
        return stoppedResult(STOP_REASON_MISSING_INPUT);
      }
      if (outcome === 'skipped') {
        steps.push({ ...record, outcome, reason: whenReason });
        continue;
      }
      degradedReason = whenReason;
    }

    // Event 2: no capability injected.
    if (!hasCapability) {
      const reason = `no capability "${capabilityKey}"`;
      if (observe) {
        steps.push({ ...record, outcome: 'not-implemented', reason });
        continue;
      }
      const outcome = unsatisfiedOutcome(step, index);
      steps.push({ ...record, outcome, reason: `${reason} (capability unavailable)` });
      if (outcome === 'stopped') return stoppedResult(STOP_REASON_NOT_EXECUTED);
      continue;
    }

    // Dispatch (full or degraded). Event 3: the capability throws.
    const context = {
      step,
      index,
      inputs,
      document,
      degraded: degradedReason != null,
      reason: degradedReason,
    };
    try {
      const result = await capability(context);
      steps.push({
        ...record,
        outcome: degradedReason == null ? 'executed' : 'degraded',
        ...(degradedReason == null ? {} : { reason: degradedReason }),
        result,
      });
    } catch (error) {
      const outcome = unsatisfiedOutcome(step, index);
      const reason = `capability "${capabilityKey}" failed: ${error?.message ?? error}`;
      steps.push({ ...record, outcome, reason });
      if (outcome === 'stopped') return stoppedResult(STOP_REASON_NOT_EXECUTED);
    }
  }

  return { steps, stopped: false, missingInputs, mode };
}


/***/ })

};

//# sourceMappingURL=550.index.mjs.map