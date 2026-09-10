// tests/helpers/cross-runtime-conformance.mjs
//
// Comparator for the cross-runtime conformance kit (#2020, Epic #2011 Phase 9).
//
// It answers one question about a paired observation record: did the host
// runtime (Claude Code vs Codex Plugin) change the MEANING of the review
// judgment? #2020 forbids requiring identical prose, so nothing here ever
// compares a finding message. The deterministic layer is compared for exact
// equality (it is derived by repository code from pinned inputs, so a
// host-dependent value there IS the adapter redefining judgment), and the
// agentic layer is compared on structure alone — which finding was raised
// (`semanticKey`), at what severity, with what taxonomy, and whether authority
// was handed to a human.
//
// It calls no model. Every input is a recorded observation, so the whole
// comparison runs offline and needs no LLM API key — which is what makes the
// deterministic half of the Promotion Gate evaluable in CI (see
// docs/development/cross-runtime-conformance.md).
//
// SSoT imports, deliberately NOT re-derived here:
//   - REPLAY_REQUIREMENTS / REPLAY_PINS / PROVENANCE_STATUS / REPLAY_CLASSES
//     (src/lib/execution-manifest.mjs) define what a complete manifest is;
//   - canonicalJson (src/lib/promotion-candidates.mjs) gives field comparison a
//     stable key ordering;
//   - sha256Hex (src/lib/shadow-aggregate.mjs) digests the compared field set.

import {
  REPLAY_REQUIREMENTS,
  REPLAY_PINS,
  PROVENANCE_STATUS,
  REPLAY_CLASSES,
} from '../../src/lib/execution-manifest.mjs';
import { canonicalJson } from '../../src/lib/promotion-candidates.mjs';
import { sha256Hex } from '../../src/lib/shadow-aggregate.mjs';

export { REPLAY_REQUIREMENTS, REPLAY_PINS, PROVENANCE_STATUS, REPLAY_CLASSES };

/** The two host runtimes bound in agents/contracts/adapter-map.json. */
export const RUNTIMES = Object.freeze(['claude', 'codex']);

/** Closed divergence-reason vocabulary (mirrors the schema's enum). */
export const DIVERGENCE_REASONS = Object.freeze([
  'adapter-mechanism',
  'adapter-capability',
  'model-variation',
  'dataset-defect',
  'unexplained',
]);

/** Promotion Gate conditions from #2020, in report order. */
export const GATE_CONDITIONS = Object.freeze([
  'deterministic-conformance',
  'manifest-completeness',
  'critical-regression',
  'unexplained-divergence',
  'human-authority',
]);

/**
 * Deterministic fields compared for exact equality.
 *
 * `extract` normalizes ordering where the field is conceptually a set, so a
 * different recording order is not reported as a divergence. Everything else
 * is compared verbatim.
 */
const DETERMINISTIC_FIELDS = Object.freeze([
  { field: 'deterministic.routing.entry', extract: (d) => d.routing.entry },
  { field: 'deterministic.routing.resolvedFlow', extract: (d) => d.routing.resolvedFlow },
  {
    field: 'deterministic.routing.resolvedFlowVersion',
    extract: (d) => d.routing.resolvedFlowVersion,
  },
  {
    field: 'deterministic.selectedSkills',
    extract: (d) =>
      [...d.selectedSkills]
        .map((s) => `${s.id}@${s.version}`)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  },
  {
    field: 'deterministic.referenceCoverage.required',
    extract: (d) => sortedUnique(d.referenceCoverage.required),
  },
  {
    field: 'deterministic.referenceCoverage.referenced',
    extract: (d) => sortedUnique(d.referenceCoverage.referenced),
  },
  { field: 'deterministic.manifest.replayClass', extract: (d) => d.manifest.replayClass },
  { field: 'deterministic.manifest.blocks', extract: (d) => d.manifest.blocks },
  {
    field: 'deterministic.deterministicChecks',
    extract: (d) =>
      [...d.deterministicChecks]
        .map((c) => `${c.id}:${c.status}`)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  },
  { field: 'deterministic.gate.decision', extract: (d) => d.gate.decision },
  { field: 'deterministic.gate.reasonCode', extract: (d) => d.gate.reasonCode },
  { field: 'deterministic.gate.inputsHash', extract: (d) => d.gate.inputsHash },
]);

/**
 * Deterministic fields an ADAPTER difference may legitimately explain.
 *
 * A capability gap (Codex declares no `run-command`) really can leave a
 * deterministic check unrunnable and a provenance block unresolved, so those
 * two prefixes accept an adapter reason. Routing, skill selection and gate
 * derivation do not: they are computed by repository code from pinned inputs
 * with no host involvement, so a difference there is the adapter redefining
 * judgment — the exact thing #2020's invariant forbids — and is reported
 * `unexplained` no matter what the case author declared.
 *
 * Note this only affects the divergence CLASSIFICATION. An explained
 * deterministic divergence still drops `deterministicConformance` below 1 and
 * still fails the Promotion Gate; the two metrics are independent on purpose.
 */
const ADAPTER_EXPLAINABLE_DETERMINISTIC_PREFIXES = Object.freeze([
  'deterministic.deterministicChecks',
  'deterministic.manifest',
]);

/**
 * Agentic fields a MODEL difference may legitimately explain.
 *
 * Wording, taxonomy labelling and how much of the criterion list one pass
 * happened to touch are model performance, which #2020 explicitly declines to
 * rank. The four fields NOT listed here — critical recall, completion state,
 * unsupported DONE claims and human escalation — are judgment authority. The
 * Promotion Gate requires critical regression 0 and human authority unchanged,
 * so accepting "the model varies" as an excuse on those would wave through the
 * precise failure the gate exists to catch.
 */
const MODEL_TOLERANT_AGENTIC_FIELDS = Object.freeze([
  'agentic.findings.taxonomy',
  'agentic.findings.severity',
  'agentic.findings.nonCriticalRecall',
  'agentic.criterionCoverage',
]);

const sortedUnique = (values) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const same = (a, b) => canonicalJson(a) === canonicalJson(b);

const startsWithAny = (value, prefixes) =>
  prefixes.some((p) => value === p || value.startsWith(`${p}.`));

/** Pick the observation for one runtime; throws when the pair is malformed. */
export function observationFor(caseRecord, runtime) {
  const found = caseRecord.observations.filter((o) => o.runtime === runtime);
  if (found.length !== 1) {
    throw new Error(
      `case "${caseRecord.caseId}" must carry exactly one observation for runtime "${runtime}" (found ${found.length}).`
    );
  }
  return found[0];
}

/**
 * Compare the deterministic layer field by field.
 * @returns {{compared: number, matched: number, conformance: number, mismatches: Array<{field: string, claude: unknown, codex: unknown}>, comparisonHash: string}}
 */
export function compareDeterministic(claude, codex) {
  const mismatches = [];
  const comparedValues = [];
  for (const { field, extract } of DETERMINISTIC_FIELDS) {
    const left = extract(claude.deterministic);
    const right = extract(codex.deterministic);
    comparedValues.push({ field, claude: left, codex: right });
    if (!same(left, right)) mismatches.push({ field, claude: left, codex: right });
  }
  const compared = DETERMINISTIC_FIELDS.length;
  const matched = compared - mismatches.length;
  return {
    compared,
    matched,
    conformance: compared === 0 ? 1 : matched / compared,
    mismatches,
    comparisonHash: sha256Hex(canonicalJson(comparedValues)),
  };
}

/**
 * Manifest completeness for one observation.
 *
 * A block counts as complete only when its status is `resolved` AND it carries
 * every pin REPLAY_PINS demands for it. Status alone is not enough: a manifest
 * whose hashes are all null can still report every block `resolved`, which is
 * the "manifest 欠損を replay 可能と誤認しない" failure #2015 already names.
 */
export function evaluateManifestCompleteness(observation) {
  const manifest = observation.deterministic.manifest;
  const replayClass = manifest.replayClass;
  if (!REPLAY_CLASSES.includes(replayClass)) {
    throw new Error(
      `unknown replayClass "${replayClass}"; expected one of ${REPLAY_CLASSES.join(', ')}.`
    );
  }
  const required = REPLAY_REQUIREMENTS[replayClass];
  const incomplete = [];
  for (const block of required) {
    const status = manifest.blocks?.[block] ?? 'missing';
    if (!PROVENANCE_STATUS.includes(status)) {
      throw new Error(`block "${block}" has unknown status "${status}".`);
    }
    if (status !== 'resolved') {
      incomplete.push({ block, reason: `status=${status}` });
      continue;
    }
    const pins = REPLAY_PINS[block] ?? [];
    const recorded = manifest.pins?.[block] ?? [];
    const missingPins = pins.filter((p) => !recorded.includes(p));
    if (missingPins.length > 0) {
      incomplete.push({ block, reason: `missing pins: ${missingPins.join(', ')}` });
    }
  }
  const complete = required.length - incomplete.length;
  return {
    runtime: observation.runtime,
    replayClass,
    required: [...required],
    completeness: required.length === 0 ? 1 : complete / required.length,
    incomplete,
  };
}

const indexFindings = (agentic) => {
  const byKey = new Map();
  for (const finding of agentic.findings) {
    if (byKey.has(finding.semanticKey)) {
      throw new Error(`duplicate semanticKey "${finding.semanticKey}" within one observation.`);
    }
    byKey.set(finding.semanticKey, finding);
  }
  return byKey;
};

const ratio = (agreed, total) => (total === 0 ? 1 : agreed / total);

/**
 * Compare the agentic layer as STRUCTURE.
 *
 * Findings pair by `semanticKey` — what was found, not how it was worded — so
 * two runtimes that describe the same defect in different sentences agree, and
 * two that describe different defects in the same sentence do not.
 */
export function compareAgentic(claude, codex) {
  const left = indexFindings(claude.agentic);
  const right = indexFindings(codex.agentic);
  const allKeys = sortedUnique([...left.keys(), ...right.keys()]);
  const matchedKeys = allKeys.filter((k) => left.has(k) && right.has(k));

  let severityAgreed = 0;
  let taxonomyAgreed = 0;
  const severityDisagreements = [];
  const taxonomyDisagreements = [];
  for (const key of matchedKeys) {
    if (left.get(key).severity === right.get(key).severity) severityAgreed += 1;
    else
      severityDisagreements.push({
        semanticKey: key,
        claude: left.get(key).severity,
        codex: right.get(key).severity,
      });
    if (left.get(key).taxonomy === right.get(key).taxonomy) taxonomyAgreed += 1;
    else
      taxonomyDisagreements.push({
        semanticKey: key,
        claude: left.get(key).taxonomy,
        codex: right.get(key).taxonomy,
      });
  }

  // A critical regression is a critical judgment that one runtime reaches and
  // the other does not — whether because the finding is missing entirely
  // (recall gap) or because it was downgraded (severity drift). Both make the
  // review's protection depend on which host ran it.
  const criticalRegressions = [];
  const nonCriticalRecallGaps = [];
  for (const key of allKeys) {
    const l = left.get(key) ?? null;
    const r = right.get(key) ?? null;
    const anyCritical = l?.severity === 'critical' || r?.severity === 'critical';
    const bothCritical = l?.severity === 'critical' && r?.severity === 'critical';
    if (anyCritical && !bothCritical) {
      criticalRegressions.push({
        semanticKey: key,
        claude: l?.severity ?? null,
        codex: r?.severity ?? null,
      });
    } else if (!anyCritical && (l === null || r === null)) {
      nonCriticalRecallGaps.push({
        semanticKey: key,
        claude: l?.severity ?? null,
        codex: r?.severity ?? null,
      });
    }
  }

  const criterionLeft = new Set(claude.agentic.criterionCoverage);
  const criterionRight = new Set(codex.agentic.criterionCoverage);
  const criterionUnion = sortedUnique([...criterionLeft, ...criterionRight]);
  const criterionShared = criterionUnion.filter(
    (c) => criterionLeft.has(c) && criterionRight.has(c)
  );

  return {
    findingKeyCount: allKeys.length,
    matchedKeyCount: matchedKeys.length,
    severityAgreement: ratio(severityAgreed, matchedKeys.length),
    taxonomyAgreement: ratio(taxonomyAgreed, matchedKeys.length),
    criterionCoverageAgreement: ratio(criterionShared.length, criterionUnion.length),
    severityDisagreements,
    taxonomyDisagreements,
    criticalRegressions,
    nonCriticalRecallGaps,
    completionStateAgreement: claude.agentic.completionState === codex.agentic.completionState,
    unsupportedDoneClaimAgreement:
      claude.agentic.unsupportedDoneClaim === codex.agentic.unsupportedDoneClaim,
    humanEscalationAgreement: claude.agentic.humanEscalation === codex.agentic.humanEscalation,
  };
}

/** Evidence the classifier checks a declared reason against. */
function buildEvidence(caseRecord, claude, codex) {
  const capsLeft = sortedUnique(claude.adapter.capabilities);
  const capsRight = sortedUnique(codex.adapter.capabilities);
  const pinnedInputMismatch = [];
  for (const observation of [claude, codex]) {
    const routing = observation.deterministic.routing;
    if (routing.entry !== caseRecord.pinned.entry)
      pinnedInputMismatch.push(`${observation.runtime}: entry ${routing.entry}`);
    if (routing.resolvedFlow !== caseRecord.pinned.flow)
      pinnedInputMismatch.push(`${observation.runtime}: flow ${routing.resolvedFlow}`);
    if (routing.resolvedFlowVersion !== caseRecord.pinned.flowVersion)
      pinnedInputMismatch.push(
        `${observation.runtime}: flowVersion ${routing.resolvedFlowVersion}`
      );
  }
  // `mechanisms` is a SET: one runtime binds five Agents and may bind them by
  // different mechanisms (adapter-map.json has claude on `native-subagent` for
  // two Agents and `skill` for three). Comparing sets is what lets an
  // `adapter-mechanism` claim be checked against the real binding instead of
  // against a single value the record could not have held.
  return {
    mechanismsDiffer: !same(
      sortedUnique(claude.adapter.mechanisms),
      sortedUnique(codex.adapter.mechanisms)
    ),
    capabilitiesDiffer: !same(capsLeft, capsRight),
    pinnedInputMismatch,
  };
}

/**
 * Re-derive the reason class of one observed divergence.
 *
 * The case author's declaration is a claim, never a verdict: an unsupported
 * claim is downgraded to `unexplained` so the Promotion Gate cannot be passed
 * by asserting an excuse. This is where MODEL variation and ADAPTER variation
 * are actually told apart — an adapter reason needs the adapter binding to
 * really differ, a model reason is confined to the agentic fields that are not
 * judgment authority.
 */
export function classifyDivergence({ field, layer, claim, evidence }) {
  const claimed = claim?.reasonClass ?? null;
  const reject = (why) => ({ field, layer, claimed, reasonClass: 'unexplained', why });
  if (claimed == null) return reject('no reason was declared for this divergence');
  if (!DIVERGENCE_REASONS.includes(claimed)) return reject(`unknown reasonClass "${claimed}"`);
  if (claimed === 'unexplained')
    return { field, layer, claimed, reasonClass: 'unexplained', why: 'declared unexplained' };

  if (claimed === 'dataset-defect') {
    return evidence.pinnedInputMismatch.length > 0
      ? {
          field,
          layer,
          claimed,
          reasonClass: 'dataset-defect',
          why: evidence.pinnedInputMismatch.join('; '),
        }
      : reject('no pinned input actually differs, so the inputs were pinned as declared');
  }

  if (claimed === 'model-variation') {
    if (layer !== 'agentic')
      return reject('a deterministic field that moves with the model is not deterministic');
    if (!MODEL_TOLERANT_AGENTIC_FIELDS.includes(field))
      return reject(`${field} is judgment authority, which model variation may not explain`);
    return {
      field,
      layer,
      claimed,
      reasonClass: 'model-variation',
      why: 'agentic field outside judgment authority',
    };
  }

  // adapter-mechanism / adapter-capability
  if (
    layer === 'deterministic' &&
    !startsWithAny(field, ADAPTER_EXPLAINABLE_DETERMINISTIC_PREFIXES)
  ) {
    return reject(`${field} is host-independent repository code, so no adapter reason applies`);
  }
  // The judgment-authority fields are closed to adapter reasons for the same
  // reason they are closed to model ones: an excuse accepted there is an
  // adapter allowed to move critical recall, completion state or the human
  // handoff — which is the invariant itself, not an explanation of it.
  if (layer === 'agentic' && !MODEL_TOLERANT_AGENTIC_FIELDS.includes(field)) {
    return reject(`${field} is judgment authority, which an adapter reason may not explain`);
  }
  if (claimed === 'adapter-mechanism') {
    return evidence.mechanismsDiffer
      ? {
          field,
          layer,
          claimed,
          reasonClass: 'adapter-mechanism',
          why: 'adapter mechanisms differ',
        }
      : reject('both runtimes bound the Agent by the same mechanism');
  }
  return evidence.capabilitiesDiffer
    ? {
        field,
        layer,
        claimed,
        reasonClass: 'adapter-capability',
        why: 'declared capabilities differ',
      }
    : reject('both runtimes declare the same capabilities');
}

/** Collect the agentic divergences as fields, so they classify like deterministic ones. */
function agenticDivergenceFields(agentic) {
  const fields = [];
  if (agentic.criticalRegressions.length > 0) fields.push('agentic.findings.criticalRecall');
  if (agentic.nonCriticalRecallGaps.length > 0) fields.push('agentic.findings.nonCriticalRecall');
  if (agentic.severityDisagreements.length > 0) fields.push('agentic.findings.severity');
  if (agentic.taxonomyDisagreements.length > 0) fields.push('agentic.findings.taxonomy');
  if (agentic.criterionCoverageAgreement < 1) fields.push('agentic.criterionCoverage');
  if (!agentic.completionStateAgreement) fields.push('agentic.completionState');
  if (!agentic.unsupportedDoneClaimAgreement) fields.push('agentic.unsupportedDoneClaim');
  if (!agentic.humanEscalationAgreement) fields.push('agentic.humanEscalation');
  return fields;
}

/**
 * Evaluate one paired case end to end.
 *
 * The result reports evidence only. `promotionDecision` is always null and
 * `requiresHumanApproval` always true: #2020 keeps human authority unchanged,
 * so this comparator may say what the measurements were and never that
 * promotion may proceed.
 */
export function evaluateCase(caseRecord) {
  const claude = observationFor(caseRecord, 'claude');
  const codex = observationFor(caseRecord, 'codex');

  const deterministic = compareDeterministic(claude, codex);
  const manifests = [claude, codex].map(evaluateManifestCompleteness);
  const manifestCompleteness = Math.min(...manifests.map((m) => m.completeness));
  const agentic = compareAgentic(claude, codex);
  const evidence = buildEvidence(caseRecord, claude, codex);

  const declared = new Map(
    (caseRecord.declaredDivergences ?? []).map((entry) => [entry.field, entry])
  );
  const divergences = [
    ...deterministic.mismatches.map((m) => ({ field: m.field, layer: 'deterministic' })),
    ...agenticDivergenceFields(agentic).map((field) => ({ field, layer: 'agentic' })),
  ].map(({ field, layer }) =>
    classifyDivergence({ field, layer, claim: declared.get(field) ?? null, evidence })
  );

  const unexplained = divergences.filter((d) => d.reasonClass === 'unexplained');
  const criticalRegressionCount = agentic.criticalRegressions.length;
  const humanAuthorityUnchanged =
    agentic.humanEscalationAgreement &&
    (claude.deterministic.gate.decision === 'ESCALATE') ===
      (codex.deterministic.gate.decision === 'ESCALATE');

  const failedGates = [];
  if (deterministic.conformance !== 1) failedGates.push('deterministic-conformance');
  if (manifestCompleteness !== 1) failedGates.push('manifest-completeness');
  if (criticalRegressionCount > 0) failedGates.push('critical-regression');
  if (unexplained.length > 0) failedGates.push('unexplained-divergence');
  if (!humanAuthorityUnchanged) failedGates.push('human-authority');

  return {
    caseId: caseRecord.caseId,
    caseClass: caseRecord.caseClass,
    deterministicConformance: deterministic.conformance,
    manifestCompleteness,
    criticalRegressionCount,
    unexplainedDivergenceCount: unexplained.length,
    humanAuthorityUnchanged,
    promotionGate: failedGates.length === 0 ? 'pass' : 'fail',
    failedGates: GATE_CONDITIONS.filter((c) => failedGates.includes(c)),
    detail: { deterministic, manifests, agentic, divergences, evidence },
    // Evidence, not authority. Kept explicit so a reader of the report cannot
    // mistake a green run for an approval (#2020 Human authority unchanged).
    promotionDecision: null,
    requiresHumanApproval: true,
  };
}

/** Aggregate the whole kit into the Epic's Promotion Gate view. */
export function evaluateSuite(caseRecords) {
  const cases = caseRecords.map(evaluateCase);
  const conformantIds = caseRecords
    .filter((c) => c.expectation === 'conformant')
    .map((c) => c.caseId);
  const conformant = cases.filter((c) => conformantIds.includes(c.caseId));
  const worst = (pick) => (conformant.length === 0 ? 1 : Math.min(...conformant.map(pick)));
  const failedGates = GATE_CONDITIONS.filter((condition) =>
    conformant.some((c) => c.failedGates.includes(condition))
  );
  return {
    caseCount: cases.length,
    conformantCaseCount: conformant.length,
    deterministicConformance: worst((c) => c.deterministicConformance),
    manifestCompleteness: worst((c) => c.manifestCompleteness),
    criticalRegressionCount: conformant.reduce((n, c) => n + c.criticalRegressionCount, 0),
    unexplainedDivergenceCount: conformant.reduce((n, c) => n + c.unexplainedDivergenceCount, 0),
    humanAuthorityUnchanged: conformant.every((c) => c.humanAuthorityUnchanged),
    promotionGate: failedGates.length === 0 ? 'pass' : 'fail',
    failedGates,
    cases,
    promotionDecision: null,
    requiresHumanApproval: true,
  };
}
