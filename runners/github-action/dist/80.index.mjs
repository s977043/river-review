export const id = 80;
export const ids = [80];
export const modules = {

/***/ 3080:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PairedReplayError: () => (/* binding */ PairedReplayError),
/* harmony export */   XZ: () => (/* binding */ deriveCaseKey),
/* harmony export */   buildPairedReplay: () => (/* binding */ buildPairedReplay),
/* harmony export */   formatPairedReplayMarkdown: () => (/* binding */ formatPairedReplayMarkdown)
/* harmony export */ });
/* unused harmony exports PAIRED_REPLAY_SCHEMA_VERSION, PAIRED_REPLAY_COLLECTOR_VERSION, PAIRED_REPLAY_EVALUATOR_VERSION, MANIFEST_ID_PREFIX, TERMINAL_REASONS, SUPPORTED_ACCEPTANCE_METRICS, METRIC_DENOMINATORS, ACCEPTANCE_COMPARATORS, buildExperimentManifest, verifyExperimentManifest, pairFindings, evaluateAcceptance */
/* harmony import */ var _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3077);
/* harmony import */ var _shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4029);
// Paired replay (#1574 P2) — immutable Experiment Manifest + paired diffing.
//
// Takes ALREADY-PRODUCED review runs for a baseline configuration and a
// candidate configuration, pins the experiment conditions into an immutable
// Experiment Manifest (契約3), pairs the two sides' findings case by case, and
// reports the delta against per-profile acceptance criteria (契約6).
//
// Read-only by construction, and deliberately NOT an executor: this module
// never invokes a reviewer, an LLM, or a provider. Producing the two sides is
// left to the existing `river run` / CI paths, so P2 adds no way to spend money
// or mutate a repository. The only side effects a caller can observe are the
// returned plain objects.
//
// Explicit NON-GOALS (fixed by the #1574 採否コメント): automatic canary,
// automatic Keep/Rollback, and any automatic promotion. The acceptance block
// evaluates the DECLARED criteria and reports the result, but it never derives
// a decision — `decision` is always null and `applied` always false. Deciding
// is a human act, and executing the decision stays with #1568's lifecycle.
//
// Design contract compliance (docs/development/1574-p0-design-contract.md):
//   契約1 evidence provenance  → buildRunEvidence / evidenceTrustLevel (P1 の再利用・untrusted 固定)
//   契約3 Experiment Manifest  → buildExperimentManifest / verifyExperimentManifest
//   契約4 content-addressed ID → computeCandidateId (P1 経由で #1624 の実装を利用)
//   契約6 profile 別受入基準    → evaluateAcceptance



// Re-exported, not re-implemented: P2 keeps P1's trust classification verbatim.
// 契約1 の未決事項（`trusted_by` の署名・検証方式）は P2 でも解決していないため、
// trusted への昇格経路を P2 側で新設しない。


const PAIRED_REPLAY_SCHEMA_VERSION = 1;

/** Collector identity stamped on every evidence record produced here (契約1). */
const PAIRED_REPLAY_COLLECTOR_VERSION = 'river-paired-replay/1';

/** Evaluator identity pinned in the manifest (契約3 evaluator version). */
const PAIRED_REPLAY_EVALUATOR_VERSION = 'river-paired-replay-evaluator/1';

/** Prefix of the manifest id. Distinct from the `RR-PC-` candidate namespace. */
const MANIFEST_ID_PREFIX = 'RR-EXP-';

const MANIFEST_ID_HASH_LENGTH = 12;

/**
 * Normalized terminal-reason vocabulary (#1574 採否コメント / 契約3).
 *
 * The manifest pins the VOCABULARY (it is an experiment condition), while the
 * observed value lives on the result — writing an outcome back into the
 * manifest would contradict its immutability.
 */
const TERMINAL_REASONS = Object.freeze([
  'success',
  'budget_exhausted',
  'no_progress',
  'oscillation',
  'verifier_unavailable',
  'human_escalated',
]);

/** Metrics an acceptance criterion can be declared on and P2 can observe. */
const SUPPORTED_ACCEPTANCE_METRICS = Object.freeze([
  'criticalRegressionCount',
  'criticalAdditionCount',
  'removedFindingCount',
  'addedFindingCount',
  'changedFindingCount',
  'unchangedFindingCount',
  'unpairableFindingCount',
  'pairedCaseCount',
  // Cases the dataset declared that could NOT be compared (one side is
  // missing). Declarable so a profile can refuse a replay that silently lost
  // part of its dataset.
  'unpairedCaseCount',
  'sampleSize',
]);

/**
 * Unit the acceptance `sampleSize` is counted in (契約6 の必要サンプル数).
 *
 * A free-form label would let "at least 3" be read as cases while it counted
 * findings (or the other way round), so the vocabulary is closed and the
 * aggregation actually switches on it.
 */
const METRIC_DENOMINATORS = Object.freeze(['paired-finding', 'paired-case']);

/** Comparators an acceptance criterion can use. */
const ACCEPTANCE_COMPARATORS = Object.freeze(['lte', 'lt', 'gte', 'gt', 'eq']);

/** Severity ranking used to decide whether a change is a regression. */
const SEVERITY_RANK = { info: 0, minor: 1, major: 2, critical: 3 };

// Unknown severities are read as `major`, matching the fail-safe mapping in
// .claude/rules/review-core.md — an unparseable severity must never silently
// become the lowest rank and hide a regression.
const FALLBACK_SEVERITY = 'major';

class PairedReplayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PairedReplayError';
  }
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function compareStrings(a, b) {
  const left = a ?? '';
  const right = b ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}

function severityOf(finding) {
  const raw = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(finding?.severity);
  return raw && raw in SEVERITY_RANK ? raw : FALLBACK_SEVERITY;
}

function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK[FALLBACK_SEVERITY];
}

// ---------------------------------------------------------------------------
// Case identity: what makes a baseline run and a candidate run "the same input"
// ---------------------------------------------------------------------------

/**
 * Derive the case key of a saved run — the identity of the INPUT the run
 * reviewed, so a baseline run and a candidate run of the same input pair up.
 *
 * Resolution order:
 *   1. an explicit `caseId` (the escape hatch for callers that already track
 *      their dataset cases);
 *   2. `<reviewedTarget>@<mergeBase>` from the existing run record shape — the
 *      same repo at the same merge base is the same diff to review.
 *
 * A run that resolves to neither is NOT paired: guessing (e.g. by array
 * position) would silently compare two unrelated reviews and report the
 * difference as if it were caused by the candidate.
 *
 * @param {object|null|undefined} record saved run record
 * @returns {string|null}
 */
function deriveCaseKey(record) {
  const explicit = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(record?.caseId);
  if (explicit) return explicit;
  const target = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(record?.reviewedTarget);
  const mergeBase = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(record?.mergeBase);
  if (!target && !mergeBase) return null;
  return `${target ?? ''}@${mergeBase ?? ''}`;
}

// ---------------------------------------------------------------------------
// 契約3: immutable Experiment Manifest
// ---------------------------------------------------------------------------

/**
 * Split a manifest into (a) the experiment CONDITIONS and (b) the identity
 * fields derived from them. Used by both the builder and the verifier so there
 * is exactly one definition of "what the hash covers".
 */
function splitManifest(manifest) {
  const {
    manifestId = null,
    experimentKey = null,
    manifestHash = null,
    createdAt = null,
    ...conditions
  } = manifest ?? {};
  return { manifestId, experimentKey, manifestHash, createdAt, conditions };
}

/**
 * Compute the two digests of a manifest.
 *
 * - `experimentKey` hashes the experiment CONDITIONS only, so re-creating the
 *   same experiment later yields the same key (and the same `manifestId`).
 *   The creation timestamp is deliberately outside this hash: an experiment run
 *   twice under identical conditions is the same experiment.
 * - `manifestHash` additionally covers `createdAt` and the derived ids, so it
 *   is a tamper check over the WHOLE stored record — including the timestamp,
 *   which an experimentKey-only digest would leave editable unnoticed.
 */
function computeManifestDigests({ conditions, createdAt }) {
  const experimentKey = (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .sha256Hex */ .fg)((0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(conditions));
  const manifestId = `${MANIFEST_ID_PREFIX}${experimentKey.slice(0, MANIFEST_ID_HASH_LENGTH)}`;
  const manifestHash = (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .sha256Hex */ .fg)(
    (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)({ conditions, createdAt, experimentKey, manifestId })
  );
  return { experimentKey, manifestId, manifestHash };
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PairedReplayError(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  const str = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(value);
  if (!str) throw new PairedReplayError(`${label} must be a non-empty string.`);
  return str;
}

/**
 * Validate the metrics denominator (W5).
 *
 * The value is not a label: `sampleSize` is aggregated in this unit, so an
 * unknown string would silently keep counting findings while the reader
 * believes it declared cases.
 */
function normalizeDenominator(value) {
  const denominator = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(value) ?? 'paired-finding';
  if (!METRIC_DENOMINATORS.includes(denominator)) {
    throw new PairedReplayError(
      `metrics.denominator "${denominator}" is unknown. Expected one of: ${METRIC_DENOMINATORS.join(', ')}.`
    );
  }
  return denominator;
}

function normalizeTemperature(value, label) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PairedReplayError(`${label} must be a finite number or null.`);
  }
  return value;
}

// A source commit sha is compared case-insensitively, and an abbreviated sha is
// accepted as the same commit as the full one it prefixes. `git rev-parse HEAD`
// writes 40-hex lowercase, but a record can be hand-written or copied from an
// abbreviated `git log` line, and treating `A1B2C3D` and its 40-hex form as two
// different commits would refuse an experiment that is in fact consistent.
const SHA_HEX_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Resolve the distinct observed source commit shas of one group of runs into a
 * single commit, or report the group as mixed.
 *
 * Equivalence is prefix-based on purpose: the longest value is taken as the
 * representative and every other value must be that value, or a hex prefix of
 * it at least 7 characters long (the abbreviation git itself considers
 * unambiguous). Values that are not hex (a placeholder, a tag name) only match
 * by exact equality, so a typo is still reported as mixed rather than silently
 * absorbed.
 *
 * @param {string[]} lowercased distinct, non-null, already lowercased shas
 * @returns {{ sha: string|null, mixed: boolean }}
 */
function resolveObservedSha(lowercased) {
  if (lowercased.length === 0) return { sha: null, mixed: false };
  const ordered = [...lowercased].sort((a, b) => b.length - a.length || compareStrings(a, b));
  const longest = ordered[0];
  const consistent = ordered.every(
    (sha) =>
      sha === longest ||
      (SHA_HEX_PATTERN.test(sha) && SHA_HEX_PATTERN.test(longest) && longest.startsWith(sha))
  );
  return consistent ? { sha: longest, mixed: false } : { sha: null, mixed: true };
}

function lowercaseSha(sha) {
  return typeof sha === 'string' ? sha.toLowerCase() : null;
}

/**
 * Summarize what one side's own evidence says about the commit its runs were
 * taken at, and collect the internal contradictions (#1719).
 *
 * This is deliberately NOT a check against `side.commitSha`. The two values
 * live in different namespaces: `source_commit_sha` is the HEAD of the REVIEWED
 * repository (`getHeadSha`, so the same case yields the same sha on both
 * sides), while `side.commitSha` is a CONFIGURATION identifier that
 * `configurationDiffers` compares alongside provider / model / temperature and
 * is expected to differ between baseline and candidate. Requiring them to be
 * equal would either refuse every real dataset or force both sides to declare
 * one sha, which kills the commit dimension of the activation check.
 *
 * What the contract does require is that the evidence be internally coherent:
 * the runs of ONE case under ONE configuration are repeats of the same input,
 * so they must report the same reviewed commit. A mixture means the findings
 * being pooled came from different code, and the case's diff is then not a
 * property of the configuration.
 *
 * The check is per (side, case), NOT per side: a dataset legitimately spans
 * cases collected at different times and repositories, so requiring one sha
 * across the whole side would reject essentially every real `.river/runs`
 * dataset. Runs whose case key cannot be derived are excluded — without a case
 * identity there is no "same input" claim to violate.
 *
 * A run with NO `source_commit_sha` is 未取得, not a contradiction: records
 * written before #1715 carry none, and reading the absence as a mismatch would
 * reject every pre-existing dataset.
 *
 * `dirty` (#1718) never relaxes anything here. A dirty run's sha is the HEAD
 * the review sat on top of, so it can agree with its neighbours while the
 * reviewed lines exist only in a working tree. The counts are recorded so the
 * weakness is visible (#1682 F2 / #1697).
 *
 * @param {string} label side label used in error messages
 * @param {object[]} runs the saved run records
 * @param {object[]} evidence 契約1 evidence records, in the same order as `runs`
 * @returns {{ provenance: object, violations: object[] }}
 */
function summarizeSideProvenance(label, runs, evidence) {
  const byCase = new Map();
  runs.forEach((record, index) => {
    const caseKey = deriveCaseKey(record);
    if (caseKey == null) return;
    const sha = lowercaseSha(evidence[index].source_commit_sha);
    if (sha == null) return;
    if (!byCase.has(caseKey)) byCase.set(caseKey, new Map());
    const shas = byCase.get(caseKey);
    if (!shas.has(sha)) shas.set(sha, []);
    shas.get(sha).push(evidence[index].review_run_id ?? '(run id 未取得)');
  });
  const violations = [];
  for (const caseKey of [...byCase.keys()].sort(compareStrings)) {
    const shas = byCase.get(caseKey);
    if (!resolveObservedSha([...shas.keys()]).mixed) continue;
    violations.push({
      side: label,
      caseKey,
      // Sorted so the message is byte-identical for the same input.
      observed: [...shas.entries()]
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([sha, runIds]) => ({ sha, runIds: [...runIds].sort(compareStrings) })),
    });
  }
  const allShas = [
    ...new Set(evidence.map((e) => lowercaseSha(e.source_commit_sha)).filter((sha) => sha != null)),
  ];
  const dirtyFlags = runs.map((record) => record?.provenance?.dirty);
  return {
    provenance: {
      // DERIVED from the evidence, never the declaration: null when the runs
      // span several commits (a multi-case dataset) or report none at all.
      sourceCommitSha: resolveObservedSha(allShas).sha,
      sourceCommitShaUnknownRunCount: evidence.filter((e) => e.source_commit_sha == null).length,
      dirtyRunCount: dirtyFlags.filter((flag) => flag === true).length,
      // `null` (unknown) is counted apart from `false` (observed clean): a record
      // that never recorded the flag must not read as a clean working tree.
      dirtyUnknownRunCount: dirtyFlags.filter((flag) => typeof flag !== 'boolean').length,
    },
    violations,
  };
}

/**
 * Render every internal source-commit contradiction as ONE error, so a caller
 * fixing a dataset sees all of them instead of one per attempt.
 */
function formatSourceShaViolations(violations) {
  const detail = violations
    .slice(0, 3)
    .map(
      (v) =>
        `${v.side} case "${v.caseKey}": ` +
        v.observed
          .slice(0, 4)
          .map(({ sha, runIds }) => `${sha} (run ${runIds.slice(0, 3).join(', ')})`)
          .join(' vs ')
    )
    .join('; ');
  const more = violations.length > 3 ? ` (+${violations.length - 3} more)` : '';
  return (
    `Runs of the same case under one configuration report several source_commit_sha values: ${detail}${more}. ` +
    'The findings pooled for that case were produced from different code, so the experiment is refused (契約3 / #1719). ' +
    'Re-collect the runs at one commit, or give the differing runs distinct caseId values.'
  );
}

function normalizeSide(side, label, { collectorVersion }) {
  requireObject(side, label);
  const runs = Array.isArray(side.runs) ? side.runs : null;
  if (!runs || runs.length === 0) {
    throw new PairedReplayError(`${label}.runs must be a non-empty array of saved run records.`);
  }
  // Kept in input order for the per-run cross-check below; the manifest gets a
  // sorted copy so the pinned conditions stay independent of input order.
  const evidenceByRun = runs.map((record) => (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .buildRunEvidence */ .L5)(record, { collectorVersion }));
  const evidence = [...evidenceByRun].sort(
    (a, b) =>
      compareStrings(a.review_run_id, b.review_run_id) ||
      compareStrings(a.artifact_sha256, b.artifact_sha256)
  );
  const caseKeys = [...new Set(runs.map(deriveCaseKey).filter(Boolean))].sort(compareStrings);
  const summary = summarizeSideProvenance(label, runs, evidenceByRun);
  return {
    manifest: {
      commitSha: requireString(side.commitSha, `${label}.commitSha`),
      skillRegistryCommit: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(side.skillRegistryCommit),
      provider: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(side.provider),
      model: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(side.model),
      temperature: normalizeTemperature(side.temperature, `${label}.temperature`),
      configId: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(side.configId),
      runCount: runs.length,
      reviewRunIds: [...new Set(runs.map(_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .deriveReviewRunId */ .Kh).filter(Boolean))].sort(compareStrings),
      caseKeys,
      unkeyedRunCount: runs.filter((record) => deriveCaseKey(record) == null).length,
      provenance: summary.provenance,
      evidence,
    },
    runs,
    violations: summary.violations,
  };
}

function normalizeCriterion(criterion, profileLabel, index) {
  requireObject(criterion, `${profileLabel}.criteria[${index}]`);
  const metric = requireString(criterion.metric, `${profileLabel}.criteria[${index}].metric`);
  const comparator = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(criterion.comparator) ?? 'lte';
  if (!ACCEPTANCE_COMPARATORS.includes(comparator)) {
    throw new PairedReplayError(
      `${profileLabel}.criteria[${index}].comparator "${comparator}" is unknown. Expected one of: ${ACCEPTANCE_COMPARATORS.join(', ')}.`
    );
  }
  if (typeof criterion.threshold !== 'number' || !Number.isFinite(criterion.threshold)) {
    throw new PairedReplayError(
      `${profileLabel}.criteria[${index}].threshold must be a finite number.`
    );
  }
  return {
    metric,
    comparator,
    threshold: criterion.threshold,
    required: criterion.required !== false,
    // `declared` = written by the caller; `contract-6` = injected below.
    source: 'declared',
  };
}

/**
 * Normalize the acceptance profiles (契約6).
 *
 * The profile unit is left to the caller (reviewMode, repo×phase, …): 契約6
 * leaves it 未決 and P2 only requires that a profile has a name.
 *
 * The CONTRACT is the SSoT for critical regression, not the declaration: 契約6
 * fixes "critical regression 0 は P2 paired replay の必須条件", so the floor is
 * injected into every profile unconditionally and a declaration can only make
 * it STRICTER. `threshold: 5` or `required: false` would otherwise let the spec
 * author opt out of the one condition the contract makes mandatory, which is
 * exactly the failure mode a declarative gate must not have.
 */
function normalizeProfiles(acceptance) {
  const profiles = acceptance?.profiles;
  if (profiles == null) return [];
  if (!Array.isArray(profiles)) {
    throw new PairedReplayError('acceptance.profiles must be an array.');
  }
  const normalized = profiles.map((profile, i) => {
    const label = `acceptance.profiles[${i}]`;
    requireObject(profile, label);
    const name = requireString(profile.profile ?? profile.name, `${label}.profile`);
    const declared = Array.isArray(profile.criteria)
      ? profile.criteria.map((c, j) => normalizeCriterion(c, label, j))
      : [];
    // The contract floor always wins; a declaration on the same metric is
    // folded into it and can only lower the threshold (i.e. be stricter).
    const declaredCritical = declared.filter((c) => c.metric === 'criticalRegressionCount');
    // Clamped at 0 in BOTH directions: a declaration can only be stricter, and
    // "stricter than 0" does not exist for a count. Without the lower clamp a
    // `threshold: -3` declaration became the floor and produced a required
    // criterion (`criticalRegressionCount lte -3`) that no run can ever
    // satisfy — the doc said 0 でクランプ, the code did not.
    const floorThreshold = Math.max(
      declaredCritical.reduce((acc, c) => Math.min(acc, c.threshold), 0),
      0
    );
    const criteria = [
      {
        metric: 'criticalRegressionCount',
        comparator: 'lte',
        threshold: floorThreshold,
        required: true,
        source: 'contract-6',
      },
      ...declared.filter((c) => c.metric !== 'criticalRegressionCount'),
    ];
    const minSampleSize = profile.minSampleSize ?? null;
    if (minSampleSize != null && !(Number.isInteger(minSampleSize) && minSampleSize >= 0)) {
      throw new PairedReplayError(`${label}.minSampleSize must be a non-negative integer or null.`);
    }
    return {
      profile: name,
      // 契約6: 「代表10件」は smoke test の最低条件であり統計的十分性ではない。
      // 既定値を置くと「満たした」と読まれるため、宣言がなければ null のままにする。
      minSampleSize,
      criteria: [...criteria].sort(
        (a, b) => compareStrings(a.metric, b.metric) || compareStrings(a.comparator, b.comparator)
      ),
    };
  });
  const names = normalized.map((p) => p.profile);
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  if (duplicate) {
    throw new PairedReplayError(`acceptance.profiles contains duplicate profile "${duplicate}".`);
  }
  return normalized.sort((a, b) => compareStrings(a.profile, b.profile));
}

function normalizeImprovementCandidate(spec, policyVersion) {
  const candidate = spec?.improvementCandidate;
  if (candidate == null) return null;
  requireObject(candidate, 'improvementCandidate');
  requireString(candidate.clusterKey, 'improvementCandidate.clusterKey');
  // Normalized by the SAME function `river promote propose` uses. Normalizing
  // only the whole string here (trim + NFC) made `"skill ::false_positive"`
  // hash as `"skill ::false_positive"` on this side and as
  // `"skill::false_positive"` on the propose side, so one candidate got two
  // ids; a key without `::` was accepted here while propose cannot produce one
  // at all.
  let cluster;
  try {
    cluster = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .normalizeClusterKey */ .xG)(candidate.clusterKey, {
      label: 'improvementCandidate.clusterKey',
    });
  } catch (err) {
    throw new PairedReplayError(err.message);
  }
  const clusterKey = cluster.clusterKey;
  const evidence = candidate.sourceFeedbackRefs ?? candidate.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new PairedReplayError(
      'improvementCandidate.sourceFeedbackRefs must be a non-empty array (the evidence the candidate id is derived from).'
    );
  }
  // Same validation `river promote propose` applies to its `--input`: an
  // experiment must not mint an id from material propose would refuse, or the
  // experiment refers to a candidate that can never be persisted.
  evidence.forEach((ref, i) => {
    const label = `improvementCandidate.sourceFeedbackRefs[${i}]`;
    requireObject(ref, label);
    const problem = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .validateFeedbackEntryShape */ .jR)(ref);
    if (problem) throw new PairedReplayError(`${label} is invalid: ${problem}`);
    if (`${ref.skillId}::${ref.feedbackType}` !== clusterKey) {
      throw new PairedReplayError(
        `${label} (${ref.skillId}::${ref.feedbackType}) is outside improvementCandidate.clusterKey ${clusterKey}.`
      );
    }
  });
  const candidatePolicyVersion = String(candidate.policyVersion ?? policyVersion);
  if (!_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .KNOWN_POLICY_VERSIONS */ .d.includes(candidatePolicyVersion)) {
    // Checked here (not only inside computeCandidateId) so the failure is a
    // PairedReplayError the CLI reports as a usage error rather than a stack.
    throw new PairedReplayError(
      `improvementCandidate.policyVersion "${candidatePolicyVersion}" is unknown. Expected one of: ${_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .KNOWN_POLICY_VERSIONS */ .d.join(', ')}.`
    );
  }
  // The id is NOT re-invented here: it comes from the #1624 derivation via P1's
  // adapter, so the experiment refers to the same candidate the shadow
  // aggregate observed and `river promote propose` persists.
  let derived;
  try {
    derived = (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .computeCandidateId */ .Mc)({
      policyVersion: candidatePolicyVersion,
      clusterKey,
      evidence,
    });
  } catch (err) {
    // Upstream throws plain Errors / PromotionProposalError; the CLI's usage
    // contract is PairedReplayError, so a malformed evidence row must not
    // escape as an unhandled exception.
    throw new PairedReplayError(`improvementCandidate evidence is invalid: ${err.message}`);
  }
  const claimed = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(candidate.candidateId);
  if (claimed && claimed !== derived.candidateId) {
    // A manifest that pins a candidate id which its own evidence does not
    // produce would make the whole experiment unattributable.
    throw new PairedReplayError(
      `improvementCandidate.candidateId ${claimed} does not match the id derived from its evidence (${derived.candidateId}).`
    );
  }
  return {
    candidateId: derived.candidateId,
    contentHash: derived.contentHash,
    uniqueEvidenceCount: derived.evidenceCount,
    clusterKey,
    policyVersion: candidatePolicyVersion,
    hypothesis: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(candidate.hypothesis) ?? (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec?.hypothesis),
  };
}

/**
 * Build the immutable Experiment Manifest for one paired replay (契約3).
 *
 * Every condition the contract enumerates is pinned here: baseline / candidate
 * commit SHA, dataset hash and held-out hash, evaluator and collector version,
 * provider / model / temperature, Skill Registry commit, trial id and count,
 * activation evidence, environment snapshot, metrics denominator and the
 * terminal-reason vocabulary. Each side also pins the provenance summary DERIVED
 * from its own evidence (`provenance`, #1719); runs of one case that disagree
 * about the reviewed commit refuse the experiment.
 *
 * Immutability is content-addressed, not enforced by file permissions: the
 * caller stores the manifest as-is, and any later reader re-derives
 * `experimentKey` / `manifestHash` with verifyExperimentManifest() to detect a
 * rewrite. Nothing in this module ever mutates a manifest it was handed.
 *
 * @param {object} spec experiment specification (see docs/development/1574-p2-paired-replay.md)
 * @param {{ now?: Date }} [options]
 * @returns {{ manifest: object, baselineRuns: object[], candidateRuns: object[] }}
 */
function buildExperimentManifest(spec, { now = new Date() } = {}) {
  requireObject(spec, 'spec');
  const policyVersion = String(spec.policyVersion ?? _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .CANDIDATE_POLICY_VERSION */ .e1);
  if (!_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .KNOWN_POLICY_VERSIONS */ .d.includes(policyVersion)) {
    throw new PairedReplayError(
      `policyVersion "${policyVersion}" is unknown. Expected one of: ${_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .KNOWN_POLICY_VERSIONS */ .d.join(', ')}.`
    );
  }
  const collectorVersion =
    (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.evaluator?.collectorVersion) ?? PAIRED_REPLAY_COLLECTOR_VERSION;
  const baseline = normalizeSide(spec.baseline, 'baseline', { collectorVersion });
  const candidate = normalizeSide(spec.candidate, 'candidate', { collectorVersion });
  // Both sides are reported in ONE error: fixing a dataset one message at a
  // time costs a full re-run per contradiction.
  const sourceShaViolations = [...baseline.violations, ...candidate.violations];
  if (sourceShaViolations.length) {
    throw new PairedReplayError(formatSourceShaViolations(sourceShaViolations));
  }

  const caseKeys = [
    ...new Set([...baseline.manifest.caseKeys, ...candidate.manifest.caseKeys]),
  ].sort(compareStrings);
  const heldOutDeclared = spec.dataset?.heldOutCaseKeys;
  if (heldOutDeclared != null && !Array.isArray(heldOutDeclared)) {
    throw new PairedReplayError('dataset.heldOutCaseKeys must be an array of case keys.');
  }
  const heldOutCaseKeys = [
    ...new Set((heldOutDeclared ?? []).map((k) => (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(k)).filter(Boolean)),
  ].sort(compareStrings);
  // Validated against the INTERSECTION, not the union: a key present on only
  // one side passes a union check but produces zero paired cases, so every
  // acceptance metric would be 0 and the mandatory conditions would look
  // satisfied on an empty set (a vacuous pass).
  const pairableCaseKeys = baseline.manifest.caseKeys.filter((key) =>
    candidate.manifest.caseKeys.includes(key)
  );
  const unknownHeldOut = heldOutCaseKeys.filter((key) => !pairableCaseKeys.includes(key));
  if (unknownHeldOut.length) {
    const oneSided = unknownHeldOut.filter((key) => caseKeys.includes(key));
    const detail = oneSided.length
      ? ` (${oneSided.slice(0, 3).join(', ')} exist on only one side, so they can never be paired)`
      : '';
    throw new PairedReplayError(
      `dataset.heldOutCaseKeys contains ${unknownHeldOut.length} key(s) that no PAIRED case covers: ${unknownHeldOut.slice(0, 3).join(', ')}${detail}.`
    );
  }

  const trialCount = spec.trials?.trialCount ?? 1;
  if (!Number.isInteger(trialCount) || trialCount < 1) {
    throw new PairedReplayError('trials.trialCount must be a positive integer.');
  }

  const conditions = {
    schemaVersion: PAIRED_REPLAY_SCHEMA_VERSION,
    kind: 'experiment-manifest',
    policyVersion,
    hypothesis: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.hypothesis),
    improvementCandidate: normalizeImprovementCandidate(spec, policyVersion),
    baseline: baseline.manifest,
    candidate: candidate.manifest,
    dataset: {
      caseKeys,
      caseCount: caseKeys.length,
      // Pins the exact artifacts the experiment ran on: a re-run against edited
      // run records produces a different datasetHash and therefore a different
      // experimentKey.
      datasetHash: (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .sha256Hex */ .fg)(
        (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)({
          caseKeys,
          baseline: baseline.manifest.evidence.map((e) => e.artifact_sha256).sort(compareStrings),
          candidate: candidate.manifest.evidence.map((e) => e.artifact_sha256).sort(compareStrings),
        })
      ),
      heldOutCaseKeys,
      heldOutHash: heldOutCaseKeys.length ? (0,_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .sha256Hex */ .fg)((0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(heldOutCaseKeys)) : null,
    },
    evaluator: {
      evaluatorVersion:
        (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.evaluator?.evaluatorVersion) ?? PAIRED_REPLAY_EVALUATOR_VERSION,
      collectorVersion,
    },
    trials: {
      trialId: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.trials?.trialId),
      trialCount,
    },
    verifier: {
      // Claimed only. P2 has no attestation mechanism (契約1 未決事項), so the
      // claim is recorded and `verified` stays false — see the trust block on
      // the result.
      independent: spec.verifier?.independent === true,
      verifierId: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.verifier?.verifierId),
      runBy: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.verifier?.runBy),
    },
    activation: {
      expectedSignal: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(spec.activation?.expectedSignal),
      declaredEvidence: Array.isArray(spec.activation?.declaredEvidence)
        ? [...spec.activation.declaredEvidence].map((e) => String(e)).sort(compareStrings)
        : [],
    },
    environment: spec.environment == null ? {} : requireObject(spec.environment, 'environment'),
    metrics: {
      denominator: normalizeDenominator(spec.metrics?.denominator),
    },
    // The OBSERVED terminal reason lives on the result, not here: writing an
    // outcome into the manifest would break its immutability.
    terminalReasonVocabulary: [...TERMINAL_REASONS],
    acceptance: { profiles: normalizeProfiles(spec.acceptance) },
    // Machine-checkable statement that building a manifest writes nothing.
    writeEffects: [],
  };

  const createdAt = now.toISOString();
  const digests = computeManifestDigests({ conditions, createdAt });
  return {
    manifest: {
      manifestId: digests.manifestId,
      experimentKey: digests.experimentKey,
      manifestHash: digests.manifestHash,
      createdAt,
      ...conditions,
    },
    baselineRuns: baseline.runs,
    candidateRuns: candidate.runs,
  };
}

/**
 * Re-derive a manifest's digests and report whether the stored ones match.
 *
 * This is the immutability check: the manifest is a plain JSON document, so
 * nothing prevents someone from editing it — what the contract guarantees is
 * that the edit is DETECTABLE. `manifestHash` covers `createdAt` and the
 * derived ids too, so changing any field at all breaks it.
 *
 * @param {object} manifest
 * @returns {{ verified: boolean, mismatches: string[], expected: object, actual: object }}
 */
function verifyExperimentManifest(manifest) {
  const split = splitManifest(manifest);
  const expected = computeManifestDigests({
    conditions: split.conditions,
    createdAt: split.createdAt,
  });
  const actual = {
    experimentKey: split.experimentKey,
    manifestId: split.manifestId,
    manifestHash: split.manifestHash,
  };
  const mismatches = [];
  for (const field of ['experimentKey', 'manifestId', 'manifestHash']) {
    if (actual[field] !== expected[field]) {
      mismatches.push(
        `${field}: stored ${actual[field] ?? '(none)'}, recomputed ${expected[field]}`
      );
    }
  }
  return { verified: mismatches.length === 0, mismatches, expected, actual };
}

// ---------------------------------------------------------------------------
// Paired finding diff
// ---------------------------------------------------------------------------

function projectFinding(finding) {
  return {
    fingerprint: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(finding?.fingerprint),
    severity: severityOf(finding),
    file: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(finding?.file),
    ruleId: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(finding?.ruleId),
    title: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .nonEmptyNfcString */ .bS)(finding?.title),
  };
}

/**
 * Index one side's findings by fingerprint.
 *
 * Findings WITHOUT a fingerprint are not indexed: they cannot be matched to the
 * other side, and pairing them by file/title would invent a correspondence the
 * data does not support (契約5 already excludes fingerprint-less evidence from
 * experiments). They are counted and returned so the gap stays visible.
 */
function indexSide(findings) {
  const projected = (findings ?? []).map(projectFinding);
  const unpairable = projected
    .filter((f) => f.fingerprint == null)
    .sort((a, b) => compareStrings((0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(a), (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(b)));
  const byFingerprint = new Map();
  let duplicatesRemoved = 0;
  let severityConflicts = 0;
  const withFingerprint = projected
    .filter((f) => f.fingerprint != null)
    // Sorted before insertion so "first wins" is a property of the DATA, not of
    // the order the findings happened to be listed in.
    .sort((a, b) => compareStrings((0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(a), (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)(b)));
  for (const finding of withFingerprint) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing) {
      byFingerprint.set(finding.fingerprint, finding);
      continue;
    }
    duplicatesRemoved += 1;
    if (existing.severity === finding.severity) continue;
    severityConflicts += 1;
    // Fail-safe on severity, the same rule the unknown-severity fallback
    // applies: the winner of a duplicate is decided by canonical-JSON order,
    // which is effectively the FILE name — letting a `minor` duplicate hide a
    // `critical` one would erase a regression. Other fields keep first-wins.
    if (severityRank(finding.severity) > severityRank(existing.severity)) {
      byFingerprint.set(finding.fingerprint, { ...existing, severity: finding.severity });
    }
  }
  return { byFingerprint, unpairable, duplicatesRemoved, severityConflicts };
}

/**
 * Pair a baseline finding set against a candidate finding set by fingerprint.
 *
 * Status vocabulary:
 * - `unchanged`: present on both sides with the same severity;
 * - `changed`: present on both sides with a different severity;
 * - `removed`: baseline only (the candidate stopped reporting it);
 * - `added`: candidate only (the candidate started reporting it).
 *
 * Only severity is compared — message wording differs between runs of a
 * non-deterministic reviewer, so treating it as a change would report noise as
 * signal.
 *
 * Order-independent: the result is derived from fingerprint-keyed maps and
 * sorted, so shuffling either input array yields a byte-identical result.
 *
 * @param {object[]} baselineFindings
 * @param {object[]} candidateFindings
 */
function pairFindings(baselineFindings, candidateFindings) {
  const base = indexSide(baselineFindings);
  const cand = indexSide(candidateFindings);
  const fingerprints = [
    ...new Set([...base.byFingerprint.keys(), ...cand.byFingerprint.keys()]),
  ].sort(compareStrings);
  const pairs = fingerprints.map((fingerprint) => {
    const b = base.byFingerprint.get(fingerprint) ?? null;
    const c = cand.byFingerprint.get(fingerprint) ?? null;
    let status;
    if (b && c) status = b.severity === c.severity ? 'unchanged' : 'changed';
    else if (b) status = 'removed';
    else status = 'added';
    return {
      fingerprint,
      status,
      baseline: b,
      candidate: c,
      severityChange:
        b && c && b.severity !== c.severity ? { from: b.severity, to: c.severity } : null,
    };
  });

  const counts = {
    unchanged: pairs.filter((p) => p.status === 'unchanged').length,
    changed: pairs.filter((p) => p.status === 'changed').length,
    removed: pairs.filter((p) => p.status === 'removed').length,
    added: pairs.filter((p) => p.status === 'added').length,
    unpairableBaseline: base.unpairable.length,
    unpairableCandidate: cand.unpairable.length,
    duplicatesRemovedBaseline: base.duplicatesRemoved,
    duplicatesRemovedCandidate: cand.duplicatesRemoved,
    // Duplicates that disagreed on severity. Surfaced separately because the
    // collapse used the highest severity and a reader should know it happened.
    severityConflictsBaseline: base.severityConflicts,
    severityConflictsCandidate: cand.severityConflicts,
  };

  // Regression = the candidate LOST or DOWNGRADED a critical baseline finding.
  // A new critical finding is counted separately: it may be a genuine catch or
  // a new false positive, and only a human can tell the two apart.
  const criticalRegressions = pairs.filter(
    (p) =>
      p.baseline?.severity === 'critical' &&
      (p.status === 'removed' ||
        (p.status === 'changed' && severityRank(p.candidate.severity) < severityRank('critical')))
  );
  const criticalAdditions = pairs.filter(
    (p) =>
      p.candidate?.severity === 'critical' &&
      (p.status === 'added' ||
        (p.status === 'changed' && severityRank(p.baseline.severity) < severityRank('critical')))
  );

  return {
    pairs,
    unpairable: { baseline: base.unpairable, candidate: cand.unpairable },
    counts,
    criticalRegressions: criticalRegressions.map((p) => p.fingerprint),
    criticalAdditions: criticalAdditions.map((p) => p.fingerprint),
  };
}

// ---------------------------------------------------------------------------
// Case-level pairing over run sets
// ---------------------------------------------------------------------------

function groupRunsByCase(runs) {
  const byCase = new Map();
  const unkeyed = [];
  for (const record of runs ?? []) {
    const caseKey = deriveCaseKey(record);
    if (!caseKey) {
      unkeyed.push(record);
      continue;
    }
    if (!byCase.has(caseKey)) byCase.set(caseKey, []);
    byCase.get(caseKey).push(record);
  }
  return { byCase, unkeyed };
}

function findingsOf(records) {
  // Several runs of one case on one side are merged: the union of what that
  // configuration reported for that input. Dedup happens in indexSide().
  return records.flatMap((record) => record?.findings ?? []);
}

function emptyMetrics(denominator, { datasetCaseCount = 0, unpairedCaseCount = 0 } = {}) {
  return {
    // NOTE: there is deliberately no `caseCount` here. It was always equal to
    // `pairedCaseCount` while only the latter is declarable as a criterion
    // (SUPPORTED_ACCEPTANCE_METRICS), so two names for one number invited a
    // profile to declare the one the evaluator ignores.
    sampleSize: 0,
    unchangedFindingCount: 0,
    changedFindingCount: 0,
    removedFindingCount: 0,
    addedFindingCount: 0,
    criticalRegressionCount: 0,
    criticalAdditionCount: 0,
    unpairableFindingCount: 0,
    pairedCaseCount: 0,
    // Dataset-wide, identical in every scope: a case the manifest declared but
    // that could not be compared is a hole in the material regardless of which
    // subset acceptance is judged on.
    datasetCaseCount,
    unpairedCaseCount,
    denominator,
  };
}

function accumulateMetrics(cases, denominator, dataset) {
  const metrics = emptyMetrics(denominator, dataset);
  for (const entry of cases) {
    metrics.pairedCaseCount += 1;
    metrics.unchangedFindingCount += entry.counts.unchanged;
    metrics.changedFindingCount += entry.counts.changed;
    metrics.removedFindingCount += entry.counts.removed;
    metrics.addedFindingCount += entry.counts.added;
    metrics.criticalRegressionCount += entry.criticalRegressions.length;
    metrics.criticalAdditionCount += entry.criticalAdditions.length;
    metrics.unpairableFindingCount +=
      entry.counts.unpairableBaseline + entry.counts.unpairableCandidate;
  }
  // The unit actually switches on the declared denominator (W5): a profile that
  // declared "at least 3 paired cases" must not be satisfied by 3 findings
  // found in a single case.
  metrics.sampleSize =
    denominator === 'paired-case'
      ? metrics.pairedCaseCount
      : metrics.unchangedFindingCount +
        metrics.changedFindingCount +
        metrics.removedFindingCount +
        metrics.addedFindingCount;
  return metrics;
}

// ---------------------------------------------------------------------------
// 契約6: profile-specific acceptance (evaluated, never applied)
// ---------------------------------------------------------------------------

function compare(observed, comparator, threshold) {
  switch (comparator) {
    case 'lte':
      return observed <= threshold;
    case 'lt':
      return observed < threshold;
    case 'gte':
      return observed >= threshold;
    case 'gt':
      return observed > threshold;
    case 'eq':
      return observed === threshold;
    default:
      return null;
  }
}

/**
 * Evaluate the declared acceptance criteria against the observed metrics.
 *
 * NON-GOAL, enforced here: this never decides anything. It reports, per
 * criterion, what was declared and what was observed; `decision` stays null and
 * `applied` stays false no matter how the criteria come out. Automatic
 * canary / Keep / Rollback are 保留 per the #1574 採否コメント, so P2 produces
 * the material a human judges with — nothing more.
 *
 * Metrics that a paired replay cannot observe (precision / recall / cost /
 * reversal need labelled outcomes, which this input does not carry) are
 * reported as `evaluable: false` with `satisfied: null` instead of being
 * silently treated as satisfied.
 *
 * A scope with ZERO paired cases evaluates NOTHING: every metric would read 0
 * and each `lte` criterion would report satisfied on an empty set. That vacuous
 * pass is the most dangerous output this module could produce, so such a scope
 * marks every criterion `evaluable: false` / `satisfied: null` instead.
 *
 * @param {{ profiles: object[], metrics: object, evaluatedOn: string }} input
 */
function evaluateAcceptance({ profiles, metrics, evaluatedOn }) {
  const scopeEvaluable = (metrics.pairedCaseCount ?? 0) > 0;
  return profiles.map((profile) => {
    const criteria = profile.criteria.map((criterion) => {
      const metricSupported = SUPPORTED_ACCEPTANCE_METRICS.includes(criterion.metric);
      const evaluable = metricSupported && scopeEvaluable;
      const observed = evaluable ? (metrics[criterion.metric] ?? 0) : null;
      let note = null;
      if (!metricSupported) {
        note = `metric "${criterion.metric}" は paired replay の入力からは観測できない（precision / recall / cost はラベル付き評価が必要）`;
      } else if (!scopeEvaluable) {
        note = `評価対象（${evaluatedOn}）の paired case が 0 件のため観測できない。0 件を充足と読むと空集合での vacuous pass になる`;
      }
      return {
        ...criterion,
        observed,
        evaluable,
        satisfied: evaluable ? compare(observed, criterion.comparator, criterion.threshold) : null,
        note,
      };
    });
    const failed = criteria.filter((c) => c.satisfied === false);
    const unevaluable = criteria.filter((c) => c.satisfied === null);
    return {
      profile: profile.profile,
      evaluatedOn,
      sampleSize: metrics.sampleSize,
      minSampleSize: profile.minSampleSize,
      // null (未宣言) is reported as null, not as a pass: 契約6 は必要サンプル数の
      // 決定方法を持つことを求めており、既定値で満たしたことにはできない。
      sampleSizeSatisfied:
        profile.minSampleSize == null || !scopeEvaluable
          ? null
          : metrics.sampleSize >= profile.minSampleSize,
      criteria,
      criteriaMet: criteria.filter((c) => c.satisfied === true).length,
      criteriaFailed: failed.length,
      criteriaUnevaluable: unevaluable.length,
      // "全 required 基準を観測できて満たした" という観測事実。採否ではない。
      allRequiredSatisfied: criteria.filter((c) => c.required).every((c) => c.satisfied === true),
      failedMetrics: failed.map((c) => c.metric).sort(compareStrings),
    };
  });
}

// ---------------------------------------------------------------------------
// Top-level assembly
// ---------------------------------------------------------------------------

/**
 * Build the paired replay result for one experiment specification.
 *
 * Pure function: no I/O, no clock of its own (`now` is injected), stable
 * ordering everywhere. The same spec always produces a byte-identical result,
 * and shuffling the runs or the findings inside the spec does not change it.
 *
 * @param {object} spec experiment specification
 * @param {{ now?: Date, manifest?: object }} [options] `manifest` re-verifies a
 *   previously created manifest instead of trusting the freshly built one.
 */
function buildPairedReplay(spec, { now = new Date(), manifest: providedManifest } = {}) {
  const built = buildExperimentManifest(spec, { now });
  const manifest = providedManifest ?? built.manifest;
  const manifestVerification = verifyExperimentManifest(manifest);
  // When a previously stored manifest is supplied, it must describe THIS
  // experiment: a mismatching experimentKey means the conditions drifted, and
  // comparing under a stale manifest would misattribute the difference.
  const experimentKeyMatchesInputs = manifest.experimentKey === built.manifest.experimentKey;

  const baseline = groupRunsByCase(built.baselineRuns);
  const candidate = groupRunsByCase(built.candidateRuns);
  const heldOut = new Set(built.manifest.dataset.heldOutCaseKeys);

  const pairedKeys = [...baseline.byCase.keys()]
    .filter((key) => candidate.byCase.has(key))
    .sort(compareStrings);
  const cases = pairedKeys.map((caseKey) => {
    const baseRuns = baseline.byCase.get(caseKey);
    const candRuns = candidate.byCase.get(caseKey);
    const diff = pairFindings(findingsOf(baseRuns), findingsOf(candRuns));
    return {
      caseKey,
      heldOut: heldOut.has(caseKey),
      baselineRunIds: [...new Set(baseRuns.map(_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .deriveReviewRunId */ .Kh).filter(Boolean))].sort(
        compareStrings
      ),
      candidateRunIds: [...new Set(candRuns.map(_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_1__/* .deriveReviewRunId */ .Kh).filter(Boolean))].sort(
        compareStrings
      ),
      counts: diff.counts,
      criticalRegressions: diff.criticalRegressions,
      criticalAdditions: diff.criticalAdditions,
      findings: diff.pairs,
      unpairable: diff.unpairable,
    };
  });

  const baselineOnly = [...baseline.byCase.keys()]
    .filter((k) => !candidate.byCase.has(k))
    .sort(compareStrings);
  const candidateOnly = [...candidate.byCase.keys()]
    .filter((k) => !baseline.byCase.has(k))
    .sort(compareStrings);
  const datasetCaseCount = built.manifest.dataset.caseCount;
  const dataset = {
    datasetCaseCount,
    unpairedCaseCount: baselineOnly.length + candidateOnly.length,
  };

  const denominator = built.manifest.metrics.denominator;
  const overall = accumulateMetrics(cases, denominator, dataset);
  const heldOutCases = cases.filter((c) => c.heldOut);
  const heldOutMetrics = heldOut.size
    ? accumulateMetrics(heldOutCases, denominator, dataset)
    : null;
  // Acceptance is judged on the held-out set when one is declared: evaluating
  // on the same cases the candidate was derived from would be self-confirming.
  const evaluatedOn = heldOutMetrics ? 'heldOut' : 'overall';
  const acceptanceMetrics = heldOutMetrics ?? overall;
  const acceptanceEvaluable = acceptanceMetrics.pairedCaseCount > 0;

  // A dataset case that lost one side never reaches the diff, so it must be
  // stated explicitly: "no regression" over 1 of 3 cases is not the same claim
  // as "no regression" over the dataset.
  const pairingWarnings = [];
  if (overall.pairedCaseCount < datasetCaseCount) {
    pairingWarnings.push(
      `dataset の ${datasetCaseCount} case のうち対にできたのは ${overall.pairedCaseCount} case のみ。残りは片側の run が欠けており比較していない`
    );
  }
  if (baseline.unkeyed.length || candidate.unkeyed.length) {
    pairingWarnings.push(
      `case key を導出できない run が baseline ${baseline.unkeyed.length} 件 / candidate ${candidate.unkeyed.length} 件あり、比較対象から外れている`
    );
  }
  if (!acceptanceEvaluable) {
    pairingWarnings.push(
      `受入評価の対象（${evaluatedOn}）に paired case が 0 件のため、全 criterion を観測不可として扱う`
    );
  }

  const profiles = built.manifest.acceptance.profiles;
  const evaluations = evaluateAcceptance({
    profiles,
    metrics: acceptanceMetrics,
    evaluatedOn,
  });

  // Activation (DoD 4): did the candidate configuration actually differ, and did
  // that difference show up in the output? Neither answer promotes anything —
  // a replay whose configuration is identical is reported as not activated so a
  // "no regression" result is not misread as evidence about the candidate.
  const configurationDiffers =
    (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)({
      commitSha: built.manifest.baseline.commitSha,
      configId: built.manifest.baseline.configId,
      model: built.manifest.baseline.model,
      provider: built.manifest.baseline.provider,
      skillRegistryCommit: built.manifest.baseline.skillRegistryCommit,
      temperature: built.manifest.baseline.temperature,
    }) !==
    (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_0__/* .canonicalJson */ .dj)({
      commitSha: built.manifest.candidate.commitSha,
      configId: built.manifest.candidate.configId,
      model: built.manifest.candidate.model,
      provider: built.manifest.candidate.provider,
      skillRegistryCommit: built.manifest.candidate.skillRegistryCommit,
      temperature: built.manifest.candidate.temperature,
    });
  const observedDifference =
    overall.changedFindingCount + overall.removedFindingCount + overall.addedFindingCount > 0;
  // How much of the dataset can actually say WHICH code was reviewed (#1719)?
  // Silence here is what hid the problem before: a side made entirely of
  // pre-#1715 records reports nothing at all about its reviewed commits, and a
  // reader has no way to tell that from a fully provenanced dataset.
  const baselineProvenance = built.manifest.baseline.provenance;
  const candidateProvenance = built.manifest.candidate.provenance;
  const totalRunCount = built.manifest.baseline.runCount + built.manifest.candidate.runCount;
  const unknownShaRunCount =
    baselineProvenance.sourceCommitShaUnknownRunCount +
    candidateProvenance.sourceCommitShaUnknownRunCount;
  const sourceCommitShaCoverage = {
    runCount: totalRunCount,
    knownRunCount: totalRunCount - unknownShaRunCount,
    unknownRunCount: unknownShaRunCount,
  };
  // Cross-side comparison of the DERIVED source commits (#1724). #1720 only
  // checks one side against itself, so a candidate whose runs were re-collected
  // at a different commit than the baseline passes every existing check while
  // the two sides reviewed different code.
  //
  // REPORTED, never refused: re-collecting one side later is a legitimate way to
  // run an experiment, and failing closed here would break it (#1720 declined
  // for exactly this reason). The values are already lowercased and
  // prefix-resolved by summarizeSideProvenance, and the comparison reuses
  // resolveObservedSha so an abbreviated sha is judged the same way it is
  // within a side — no second normalization is written here.
  //
  // `differs` is null, not false, when either side has no derived sha: 未取得 is
  // not agreement, and a side spanning several cases derives null too.
  const crossSideShas = [baselineProvenance.sourceCommitSha, candidateProvenance.sourceCommitSha];
  const crossSideComparable = crossSideShas.every((sha) => sha != null);
  const crossSideSourceCommitSha = {
    baseline: baselineProvenance.sourceCommitSha,
    candidate: candidateProvenance.sourceCommitSha,
    comparable: crossSideComparable,
    differs: crossSideComparable ? resolveObservedSha(crossSideShas).mixed : null,
  };
  const activationReasons = [];
  if (!configurationDiffers) {
    activationReasons.push(
      'baseline と candidate の構成識別子（commit / provider / model / temperature / Skill Registry commit）が同一で、変更経路が存在しない'
    );
  }
  if (!observedDifference) {
    activationReasons.push('paired diff に差分がなく、変更経路が発火した証跡を観測できない');
  }
  if (unknownShaRunCount > 0) {
    activationReasons.push(
      `source_commit_sha を持たない run が baseline ${baselineProvenance.sourceCommitShaUnknownRunCount} 件 / candidate ${candidateProvenance.sourceCommitShaUnknownRunCount} 件あり、どのコードをレビューした結果か追跡できない（#1715 以前の記録）`
    );
  }
  if (crossSideSourceCommitSha.differs === true) {
    activationReasons.push(
      `baseline と candidate の source_commit_sha が異なる（baseline ${crossSideSourceCommitSha.baseline} / candidate ${crossSideSourceCommitSha.candidate}）。両側が別のコードをレビューしており、diff の差は candidate 構成ではなく被レビューコードの差に由来しうる（#1724）`
    );
  }
  if (baselineProvenance.dirtyRunCount + candidateProvenance.dirtyRunCount > 0) {
    activationReasons.push(
      `dirty な working tree で収集した run が baseline ${baselineProvenance.dirtyRunCount} 件 / candidate ${candidateProvenance.dirtyRunCount} 件あり、その source_commit_sha はレビュー対象の変更を含まないベースラインを指す（#1718 W1）`
    );
  }
  if (baselineProvenance.dirtyUnknownRunCount + candidateProvenance.dirtyUnknownRunCount > 0) {
    activationReasons.push(
      `dirty フラグを持たない run が baseline ${baselineProvenance.dirtyUnknownRunCount} 件 / candidate ${candidateProvenance.dirtyUnknownRunCount} 件あり、working tree が clean だったとは断定できない`
    );
  }

  const allEvidence = [...built.manifest.baseline.evidence, ...built.manifest.candidate.evidence];
  const trustReasons = [
    'saved run の provenance は被レビュー側が書き換え可能で未検証のため、すべて untrusted 扱い（契約1）',
    'P2 は判断材料の生成までで、canary / Keep / Rollback へは進まない（自動 canary は保留）',
  ];
  if (built.manifest.verifier.independent && !manifestVerification.verified) {
    trustReasons.push('manifest の改変が検出されたため、この結果は判断材料として使えない');
  }
  if (built.manifest.verifier.independent) {
    trustReasons.push(
      'independent verifier は自己申告であり、検証機構（CI attestation / 署名）は契約1 の未決事項として P2 でも未実装'
    );
  }

  const terminalReason = cases.length === 0 ? 'no_progress' : 'success';
  // G1 (#2408): bridge PRE-adoption paired replay evidence to the existing
  // #1568 promotion lifecycle without writing into it. This is deliberately a
  // factual handoff, not a verdict: profile observations stay per-profile and
  // no aggregate pass/fail/keep/rollback decision is invented here.
  const independentVerifierVerified = false;
  // A handoff is only meaningful when the supplied/stored manifest both
  // verifies and describes these exact replay inputs. Otherwise pairing the
  // freshly-derived candidateId with another experiment's manifest would
  // create a machine-readable false association even though the mismatch flags
  // are visible elsewhere in the result.
  const promotionHandoffEligible =
    built.manifest.improvementCandidate != null &&
    manifestVerification.verified &&
    experimentKeyMatchesInputs;
  const promotionHandoff = promotionHandoffEligible
    ? {
        candidateId: built.manifest.improvementCandidate.candidateId,
        manifestId: manifest.manifestId,
        experimentKey: manifest.experimentKey,
        manifestHash: manifest.manifestHash,
        manifestVerified: manifestVerification.verified,
        experimentKeyMatchesInputs,
        activationVerified: configurationDiffers && observedDifference,
        acceptanceEvaluable,
        evaluatedOn,
        profiles: evaluations.map((evaluation) => ({
          profile: evaluation.profile,
          allRequiredSatisfied: evaluation.allRequiredSatisfied,
          sampleSizeSatisfied: evaluation.sampleSizeSatisfied,
          failedMetrics: [...evaluation.failedMetrics],
        })),
        criticalRegressionCount: acceptanceEvaluable
          ? acceptanceMetrics.criticalRegressionCount
          : null,
        // Never let a clean held-out scope hide a critical regression observed
        // elsewhere in the paired dataset. This mirrors acceptance.contract6.
        overallCriticalRegressionCount: overall.criticalRegressionCount,
        independentVerifierVerified,
        terminalReason,
        requiresHumanJudgment: true,
        writeEffects: [],
      }
    : null;

  return {
    schemaVersion: PAIRED_REPLAY_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    mode: 'paired-replay',
    readOnly: true,
    policyVersion: built.manifest.policyVersion,
    collectorVersion: built.manifest.evaluator.collectorVersion,
    manifest,
    manifestVerification: {
      verified: manifestVerification.verified,
      mismatches: manifestVerification.mismatches,
      experimentKeyMatchesInputs,
      recomputedExperimentKey: built.manifest.experimentKey,
    },
    pairing: {
      cases,
      datasetCaseCount,
      pairedCaseCount: overall.pairedCaseCount,
      unpairedCases: { baselineOnly, candidateOnly },
      unkeyedRunCount: {
        baseline: baseline.unkeyed.length,
        candidate: candidate.unkeyed.length,
      },
      warnings: pairingWarnings,
    },
    metrics: {
      overall,
      heldOut: heldOutMetrics,
    },
    activationCheck: {
      configurationDiffers,
      observedDifference,
      // Unchanged definition (#1719). `sourceCommitShaCoverage` is REPORTED,
      // never folded into `verified`: it measures the evidence's ability to name
      // the reviewed code, which is a different question from whether the
      // CONFIGURATION differed. The provenance gaps it counts are surfaced as
      // reasons so they cannot pass unnoticed.
      verified: configurationDiffers && observedDifference,
      sourceCommitShaCoverage,
      // Same standing as sourceCommitShaCoverage: reported and surfaced as a
      // reason, never folded into `verified` (#1724).
      crossSideSourceCommitSha,
      expectedSignal: built.manifest.activation.expectedSignal,
      declaredEvidence: built.manifest.activation.declaredEvidence,
      reasons: activationReasons,
    },
    acceptance: {
      declaredProfileCount: profiles.length,
      evaluatedOn,
      // False when the evaluated scope has no paired case: every criterion is
      // then reported as unobserved rather than satisfied (no vacuous pass).
      evaluable: acceptanceEvaluable,
      evaluations,
      contract6: {
        criticalRegressionCount: acceptanceEvaluable
          ? acceptanceMetrics.criticalRegressionCount
          : null,
        // null, not true: with no paired case there is no evidence either way.
        criticalRegressionZero: acceptanceEvaluable
          ? acceptanceMetrics.criticalRegressionCount === 0
          : null,
        overallCriticalRegressionCount: overall.criticalRegressionCount,
        note: 'critical regression 0 は P2 の必須条件（契約6）。宣言でしきい値を緩められない floor として常に評価するが、採否の自動適用は行わない。',
      },
      // NON-GOALS, asserted in the artifact so a downstream consumer cannot
      // mistake this report for a verdict.
      decision: null,
      applied: false,
      autoPromotion: false,
      requiresHumanJudgment: true,
      note:
        profiles.length === 0
          ? 'profile が宣言されていないため受入判定の材料は揃わない。acceptance.profiles を宣言すること（契約6）。'
          : '宣言された基準に対する観測結果のみを報告する。しきい値の自動適用による昇格判定は行わない（契約6）。',
    },
    verification: {
      independentVerifierClaimed: built.manifest.verifier.independent,
      independentVerifierVerified,
      trustedEvidenceCount: allEvidence.filter((e) => e.trust_level === 'trusted').length,
      untrustedEvidenceCount: allEvidence.filter((e) => e.trust_level !== 'trusted').length,
      canaryEligible: false,
      reasons: trustReasons,
    },
    promotionHandoff,
    terminalReason,
    requiresHumanApproval: true,
    autoActions: ['observe'],
    // Machine-checkable statement that P2 mutates nothing.
    writeEffects: [],
  };
}

/**
 * Render a tri-state satisfaction flag. `null` (not observable) MUST NOT look
 * like `false` (observed and failed) — or like a pass.
 */
function tick(value) {
  if (value === true) return '✔';
  if (value === false) return '✘';
  return '—(観測不可)';
}

/**
 * Render the paired replay result as Markdown for human review (`--output text`).
 */
function formatPairedReplayMarkdown(result) {
  const m = result.metrics.overall;
  const lines = ['## Paired replay (read-only)', ''];
  lines.push('| Item | Value |');
  lines.push('|---|---|');
  lines.push(`| Manifest | \`${result.manifest.manifestId}\` |`);
  lines.push(
    `| Manifest verified | ${result.manifestVerification.verified ? 'yes' : 'NO (改変検出)'} |`
  );
  lines.push(`| Generated at | ${result.generatedAt} |`);
  lines.push(
    `| Paired cases | ${m.pairedCaseCount} / ${result.pairing.datasetCaseCount} (dataset) |`
  );
  lines.push(`| Unpaired cases | ${m.unpairedCaseCount} |`);
  lines.push(`| Held-out cases | ${result.manifest.dataset.heldOutCaseKeys.length} |`);
  lines.push(`| Sample size (${m.denominator}) | ${m.sampleSize} |`);
  lines.push(`| Unchanged / Changed | ${m.unchangedFindingCount} / ${m.changedFindingCount} |`);
  lines.push(`| Removed / Added | ${m.removedFindingCount} / ${m.addedFindingCount} |`);
  lines.push(`| Critical regressions | ${m.criticalRegressionCount} |`);
  lines.push(`| Critical additions | ${m.criticalAdditionCount} |`);
  lines.push(`| Activation verified | ${result.activationCheck.verified ? 'yes' : 'no'} |`);
  lines.push(`| Terminal reason | ${result.terminalReason} |`);
  lines.push('');

  if (!result.manifestVerification.verified) {
    lines.push('⚠️ Experiment Manifest の再計算値が一致しません（改変または別実験の manifest）:');
    for (const mismatch of result.manifestVerification.mismatches) lines.push(`  - ${mismatch}`);
    lines.push('');
  }

  // Always rendered, including the "nothing was lost" case: the reader must be
  // able to tell "0 case dropped" from "the report did not say".
  lines.push('### Dataset coverage');
  lines.push(
    `- paired ${result.pairing.pairedCaseCount} / dataset ${result.pairing.datasetCaseCount} case`
  );
  lines.push(
    `- baseline only: ${result.pairing.unpairedCases.baselineOnly.length ? result.pairing.unpairedCases.baselineOnly.map((k) => `\`${k}\``).join(', ') : 'なし'}`
  );
  lines.push(
    `- candidate only: ${result.pairing.unpairedCases.candidateOnly.length ? result.pairing.unpairedCases.candidateOnly.map((k) => `\`${k}\``).join(', ') : 'なし'}`
  );
  lines.push(
    `- case key を導出できない run: baseline ${result.pairing.unkeyedRunCount.baseline} / candidate ${result.pairing.unkeyedRunCount.candidate}`
  );
  for (const warning of result.pairing.warnings) lines.push(`- ⚠️ ${warning}`);
  lines.push('');

  if (result.activationCheck.reasons.length) {
    lines.push('### Activation');
    for (const reason of result.activationCheck.reasons) lines.push(`- ${reason}`);
    lines.push('');
  }

  if (result.pairing.cases.length) {
    lines.push('### Cases');
    for (const entry of result.pairing.cases) {
      lines.push(
        `- \`${entry.caseKey}\`${entry.heldOut ? ' (held-out)' : ''}: unchanged ${entry.counts.unchanged} / changed ${entry.counts.changed} / removed ${entry.counts.removed} / added ${entry.counts.added}`
      );
    }
    lines.push('');
  } else {
    lines.push('対にできた case がありません（baseline と candidate の case key が一致しない）。');
    lines.push('');
  }

  lines.push('### Acceptance (契約6・観測のみ)');
  lines.push(
    `- evaluatedOn: ${result.acceptance.evaluatedOn}${result.acceptance.evaluable ? '' : '（対象 case 0 件のため評価不可）'}`
  );
  lines.push(
    `- critical regression: ${tick(result.acceptance.contract6.criticalRegressionZero)} ${result.acceptance.contract6.criticalRegressionCount ?? '(観測不可)'}（0 が必須条件・全体では ${result.acceptance.contract6.overallCriticalRegressionCount}）`
  );
  if (result.acceptance.evaluations.length === 0) {
    lines.push(`- ${result.acceptance.note}`);
  }
  for (const evaluation of result.acceptance.evaluations) {
    lines.push(
      `- profile \`${evaluation.profile}\`: allRequiredSatisfied ${tick(evaluation.allRequiredSatisfied)} / sampleSize ${evaluation.sampleSize}${evaluation.minSampleSize == null ? '（minSampleSize 未宣言）' : ` >= ${evaluation.minSampleSize} ${tick(evaluation.sampleSizeSatisfied)}`} / met ${evaluation.criteriaMet} / failed ${evaluation.criteriaFailed} / unevaluable ${evaluation.criteriaUnevaluable}`
    );
    for (const criterion of evaluation.criteria) {
      const observed = criterion.evaluable ? criterion.observed : '(観測不可)';
      lines.push(
        `  - ${tick(criterion.satisfied)} ${criterion.metric} ${criterion.comparator} ${criterion.threshold} → ${observed}${criterion.source === 'contract-6' ? '（契約6 の floor・宣言では緩められない）' : ''}`
      );
    }
  }
  lines.push('');
  if (result.promotionHandoff) {
    const handoff = result.promotionHandoff;
    lines.push('### Promotion handoff (read-only)');
    lines.push(`- candidate: \`${handoff.candidateId}\``);
    lines.push(`- manifest: \`${handoff.manifestId}\``);
    lines.push(
      `- manifest integrity: verified ${handoff.manifestVerified ? 'yes' : 'NO'} / matches current inputs ${handoff.experimentKeyMatchesInputs ? 'yes' : 'NO'}`
    );
    lines.push(`- activation verified: ${handoff.activationVerified ? 'yes' : 'no'}`);
    lines.push(`- acceptance evaluated on: ${handoff.evaluatedOn}`);
    lines.push(
      `- critical regressions: ${handoff.criticalRegressionCount ?? '観測不可'} (evaluated scope) / ${handoff.overallCriticalRegressionCount} (overall)`
    );
    if (handoff.profiles.length === 0) {
      lines.push('- acceptance profiles: none declared');
    } else {
      for (const profile of handoff.profiles) {
        lines.push(
          `- profile \`${profile.profile}\`: allRequiredSatisfied ${tick(profile.allRequiredSatisfied)} / sampleSizeSatisfied ${tick(profile.sampleSizeSatisfied)} / failedMetrics ${profile.failedMetrics.length ? profile.failedMetrics.join(', ') : 'なし'}`
        );
      }
    }
    lines.push(
      `- independent verifier verified: ${handoff.independentVerifierVerified ? 'yes' : 'no'}`
    );
    lines.push('- Human judgment required; this handoff applies no promotion decision.');
    lines.push('');
  } else if (result.manifest.improvementCandidate) {
    lines.push('### Promotion handoff (read-only)');
    lines.push(
      '- unavailable: Experiment Manifest の integrity 検証または current inputs との一致確認に失敗したため、candidate と実験証拠を機械可読に結合しない。'
    );
    lines.push('');
  }
  lines.push(
    'このコマンドは読み取り専用で、レビューの再実行も採否の適用も行いません。decision は常に null です。'
  );
  return lines.join('\n');
}


/***/ })

};

//# sourceMappingURL=80.index.mjs.map