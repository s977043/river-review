export const id = 560;
export const ids = [560];
export const modules = {

/***/ 4560:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildRunProvenance: () => (/* binding */ buildRunProvenance),
/* harmony export */   buildRunRecord: () => (/* binding */ buildRunRecord),
/* harmony export */   computeDashboard: () => (/* binding */ computeDashboard),
/* harmony export */   formatDashboard: () => (/* binding */ formatDashboard),
/* harmony export */   listRunRecords: () => (/* binding */ listRunRecords),
/* harmony export */   loadAllRunRecords: () => (/* binding */ loadAllRunRecords),
/* harmony export */   loadRunRecord: () => (/* binding */ loadRunRecord),
/* harmony export */   resolveStoreDir: () => (/* binding */ resolveStoreDir),
/* harmony export */   saveRunRecord: () => (/* binding */ saveRunRecord)
/* harmony export */ });
/* harmony import */ var node_fs_promises__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1455);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6760);
/* harmony import */ var node_os__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8161);
/* harmony import */ var node_crypto__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(7598);
/* harmony import */ var _shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(198);
/* harmony import */ var _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(1121);
/* harmony import */ var _finding_factory_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(7563);




// #1715: the 契約1 vocabulary and the string normalizer are imported, never
// re-declared. `EVIDENCE_SOURCES` is owned by the consumer that reads the field
// back (`buildRunEvidence`), and `nonEmptyNfcString` is the one trim/NFC
// implementation the aggregate and the candidate hashes already share.


// #1857: the retired reason code is imported, never re-typed here, so the
// legacy-record counter below cannot drift from the constant it looks for.


const STORE_DIR_NAME = '.river/runs';
const GLOBAL_STORE_DIR = node_path__WEBPACK_IMPORTED_MODULE_1__.join(node_os__WEBPACK_IMPORTED_MODULE_2__.homedir(), '.river', 'runs');

/** Compute the default store path from repoRoot (no override). */
function defaultStoreDir(repoRoot) {
  if (repoRoot) return node_path__WEBPACK_IMPORTED_MODULE_1__.join(repoRoot, STORE_DIR_NAME);
  return GLOBAL_STORE_DIR;
}

/** Resolve the store directory for a project. Prefers project-local, falls back to global. */
function resolveStoreDir(repoRoot, { storeDir } = {}) {
  return storeDir ?? defaultStoreDir(repoRoot);
}

/** Generate a unique run ID from timestamp + short hash. */
function generateRunId() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = (0,node_crypto__WEBPACK_IMPORTED_MODULE_3__.createHash)('sha256').update(String(Math.random())).digest('hex').slice(0, 6);
  return `${ts}-${rand}`;
}

/**
 * Pick one member of the 契約1 evidence-source vocabulary.
 *
 * The vocabulary lives in `EVIDENCE_SOURCES` (src/lib/shadow-aggregate.mjs) and
 * is imported rather than re-listed, so a source this producer names but the
 * consumer no longer knows fails loudly here instead of being silently rewritten
 * to `local` inside `buildRunEvidence`.
 *
 * @param {string} name
 * @returns {string}
 */
function assertEvidenceSource(name) {
  if (!_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_4__/* .EVIDENCE_SOURCES */ .lY.includes(name)) {
    throw new Error(
      `Unknown evidence source "${name}". 契約1 vocabulary: ${_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_4__/* .EVIDENCE_SOURCES */ .lY.join(', ')}`
    );
  }
  return name;
}

/**
 * Build the 契約1 `provenance` block for a run record (#1715).
 *
 * Everything here is SELF-REPORTED: the producer runs inside the reviewed
 * repository (see the trust-boundary note below), so writing this block adds an
 * observation, never verifiability. `river evolve aggregate` reproduces the
 * claim while pinning `provenance_verified: false` and `trust_level:
 * 'untrusted'` — recording an unverified claim as unverified is the point.
 *
 * `trustedBy` is fixed at null and takes no input. `'github-actions'` would be
 * an attestation this process cannot make, and the verification mechanism for
 * `trusted_by` (CI attestation / signed record) is still an open 契約1 item.
 * `evidenceSource: 'CI'` likewise says only WHERE the run happened — a repo
 * under review can set GITHUB_ACTIONS itself.
 *
 * `sourceCommitSha` is the HEAD the review was taken AGAINST. It is not a
 * promise that the commit contains the reviewed lines: the local runner diffs
 * the working tree, so on a dirty tree the reviewed change exists only there.
 * `dirty` records which case this was — treating `sourceCommitSha` as
 * reproducible is only sound when `dirty === false` (#1715 W1).
 *
 * NOTE — `assertEvidenceSource` throws, and the only production call site
 * (src/cli/commands/run.mjs `--save`) wraps this in a try/catch that degrades
 * to a `Warning: --save failed` line. A vocabulary drift here therefore costs
 * the WHOLE record, not just its provenance. That is deliberate (a record
 * claiming a source the consumer cannot read is worse than a loud failure),
 * but it is the reason the vocabulary check lives here rather than downstream.
 *
 * @param {{ commitSha?: string|null, dirty?: boolean|null, env?: Record<string, string|undefined> }} [options]
 * @returns {{ evidenceSource: string, sourceCommitSha: string|null, dirty: boolean|null, trustedBy: null, generatedByCandidate: boolean }}
 */
function buildRunProvenance({ commitSha = null, dirty = null, env = process.env } = {}) {
  return {
    evidenceSource:
      env?.GITHUB_ACTIONS === 'true' ? assertEvidenceSource('CI') : assertEvidenceSource('local'),
    sourceCommitSha: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(commitSha),
    // Tri-state: null means "could not determine", never "clean".
    dirty: typeof dirty === 'boolean' ? dirty : null,
    trustedBy: null,
    generatedByCandidate: false,
  };
}

/**
 * Normalize a caller-supplied provenance block before it is persisted.
 *
 * Returns null — i.e. the record simply omits `provenance` — when the block is
 * absent or names a source outside the 契約1 vocabulary. Persisting an unknown
 * source would leave a record that reads differently from what it says, since
 * `buildRunEvidence` rewrites unknown sources to `local`; the top-level
 * `commitSha` still carries the sha through the documented fallback.
 *
 * The rejection is announced on stderr rather than dropped silently: an audit
 * reading the record cannot otherwise distinguish "no producer wrote
 * provenance" from "provenance was written and thrown away" (#1715 W3).
 *
 * `trustedBy` is re-pinned to null here as well, so no call site can widen the
 * trust boundary by passing a value through.
 */
function normalizeProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return null;
  if (!_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_4__/* .EVIDENCE_SOURCES */ .lY.includes(provenance.evidenceSource)) {
    console.warn(
      `⚠️  run record provenance dropped: unknown evidenceSource ${JSON.stringify(
        provenance.evidenceSource
      )} (契約1 vocabulary: ${_shadow_aggregate_mjs__WEBPACK_IMPORTED_MODULE_4__/* .EVIDENCE_SOURCES */ .lY.join(', ')}). commitSha is still recorded.`
    );
    return null;
  }
  return {
    evidenceSource: provenance.evidenceSource,
    sourceCommitSha: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(provenance.sourceCommitSha),
    dirty: typeof provenance.dirty === 'boolean' ? provenance.dirty : null,
    trustedBy: null,
    generatedByCandidate: provenance.generatedByCandidate === true,
  };
}

/**
 * Build a ReviewRun record from a runLocalReview result.
 *
 * @param {object} result — return value of runLocalReview
 * @param {{ phase?: string, runId?: string, gate?: object, decision?: string, provenance?: object }} [opts]
 * @returns {object} run record ready for persistence
 */
/**
 * Trust-boundary note (Epic #1347 S3, adversarial design review): the run
 * store lives at `.river/runs/` INSIDE the reviewed repository, writable by
 * the agent under review, and runtime tampering is invisible to the gate's
 * rule 0 (which only sees diffs). Records here are a convenience audit
 * reference, NOT tamper-evident evidence — append-only storage, signing, or
 * off-repo persistence is host/CI responsibility (S4). The optional
 * `override` field is host-attested and always rendered as UNVERIFIED by
 * `river runs digest`.
 */
function buildRunRecord(result, { phase, runId, gate, decision, provenance } = {}) {
  const id = runId ?? generateRunId();
  const findings = result.findings ?? [];
  const suppressed = result.classified?.suppressed ?? [];
  // #1857 / ADR-007: findings that fell off the overview cap used to arrive
  // inside `suppressed` carrying `covered_by_higher_level_finding`. They are now
  // a separate ranking outcome, so they are persisted separately — the record
  // keeps the same total, with the two events no longer summed into one count.
  const overflow = result.classified?.overflow ?? [];
  const overview = result.classified?.overview ?? [];
  const commitSha = (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(result.commitSha);
  const provenanceBlock = normalizeProvenance(provenance);

  return {
    runId: id,
    timestamp: new Date().toISOString(),
    reviewedTarget: result.repoRoot ?? null,
    phase: phase ?? result.plan?.phase ?? 'midstream',
    reviewMode: result.reviewMode ?? result.plan?.reviewMode ?? 'medium',
    mergeBase: result.mergeBase ?? null,
    defaultBranch: result.defaultBranch ?? null,
    // #1715 (契約1): the HEAD this review was taken against, and the
    // self-reported provenance around it. `commitSha` is the baseline, not a
    // guarantee that the commit contains the reviewed lines — see
    // `buildRunProvenance` and `provenance.dirty`. Both use the same
    // conditional spread as gate / decision below, so a record produced without
    // them keeps the exact key set it had before this field existed and
    // `buildRunEvidence` reads pre-#1715 records unchanged
    // (`record?.provenance ?? {}`).
    ...(commitSha ? { commitSha } : {}),
    ...(provenanceBlock ? { provenance: provenanceBlock } : {}),
    changedFiles: result.changedFiles ?? [],
    // Epic #1347 S3: persist the same gate/decision the consumer saw so the
    // digest can aggregate them (see trust-boundary note above).
    ...(decision !== undefined ? { decision } : {}),
    ...(gate ? { gate } : {}),
    // #1600: persist the calibration debug telemetry (verifierStats,
    // verifierAllRejected, findingFormat.recommendedGaps, etc.) so it
    // survives past process memory and can be inspected from the CI
    // artifact. `result.reviewDebug` is already redacted at the source
    // (review-engine.mjs redacts promptPreview and rawLlmOutput before
    // attaching them to `debug`), so no additional redaction is needed here.
    ...(result.reviewDebug ? { debug: result.reviewDebug } : {}),
    findings,
    suppressedFindings: suppressed,
    // Same conditional spread as commitSha / provenance above: a record with no
    // overflow keeps the exact key set it had before this field existed.
    // Like `suppressedFindings`, these entries carry NO `fingerprint` — join
    // them to `findings` by `id` within this record (see rankFindingsForOutput).
    ...(overflow.length > 0 ? { overflowFindings: overflow } : {}),
    finalSummary: {
      findingsCount: findings.length,
      suppressedCount: suppressed.length,
      overflowCount: overflow.length,
      overviewCount: overview.length,
      changedFilesCount: (result.changedFiles ?? []).length,
      tokenEstimate: result.tokenEstimate ?? null,
    },
  };
}

/**
 * Load ALL full run records (shared by `runs digest` / `runs summary` and the
 * GitHub Actions job-summary path — the digest needs full records; the light
 * listRunRecords metadata has no gate/findings and would silently produce an
 * empty digest, #1372 review C1).
 * @param {string} storeDir
 * @returns {Promise<Array<object>>}
 */
async function loadAllRunRecords(storeDir) {
  const runs = await listRunRecords(storeDir);
  const full = await Promise.all(
    runs.map((r) => loadRunRecord(storeDir, r.runId).catch(() => null))
  );
  return full.filter(Boolean);
}

/**
 * Persist a run record to the store directory.
 * @returns {string} path to saved file
 */
async function saveRunRecord(runRecord, { storeDir } = {}) {
  const dir = resolveStoreDir(runRecord.reviewedTarget, { storeDir });
  await node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.mkdir(dir, { recursive: true });
  const filePath = node_path__WEBPACK_IMPORTED_MODULE_1__.join(dir, `${runRecord.runId}.json`);
  await node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.writeFile(filePath, JSON.stringify(runRecord, null, 2), 'utf8');
  return filePath;
}

/**
 * List all stored runs in a store directory, sorted newest first.
 * Sorting is lexicographic by filename — relies on runId having a timestamp prefix
 * (e.g. `2026-01-01T12-00-00-abc123`) so that lexicographic order equals chronological order.
 * Custom runIds without a timestamp prefix will sort unpredictably.
 * @returns {object[]} array of { runId, timestamp, phase, reviewedTarget, findingsCount,
 *   suppressedCount, overflowCount, overviewCount, changedFilesCount }
 */
async function listRunRecords(storeDir) {
  try {
    const entries = await node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.readdir(storeDir);
    const jsonFiles = entries
      .filter((e) => e.endsWith('.json'))
      .sort()
      .reverse();
    const metas = await Promise.allSettled(
      jsonFiles.map(async (name) => {
        const raw = await node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.readFile(node_path__WEBPACK_IMPORTED_MODULE_1__.join(storeDir, name), 'utf8');
        const rec = JSON.parse(raw);
        return {
          runId: rec.runId,
          timestamp: rec.timestamp,
          phase: rec.phase,
          reviewedTarget: rec.reviewedTarget,
          findingsCount: rec.finalSummary?.findingsCount ?? 0,
          suppressedCount: rec.finalSummary?.suppressedCount ?? 0,
          // #1857: without this, `river runs list` prints a `suppressed=` that
          // silently means one thing for pre-split records (dispositions plus
          // cap overflow) and another for post-split ones (dispositions only),
          // with nothing on screen to tell the two apart.
          overflowCount: rec.finalSummary?.overflowCount ?? 0,
          overviewCount: rec.finalSummary?.overviewCount ?? 0,
          changedFilesCount: rec.finalSummary?.changedFilesCount ?? 0,
        };
      })
    );
    return metas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  } catch {
    return [];
  }
}

/**
 * Load a full run record by runId from the store directory.
 * Validates that the resolved path stays within storeDir (path traversal guard).
 */
async function loadRunRecord(storeDir, runId) {
  const base = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(storeDir);
  // DO NOT inline `fileName` back into the path.resolve() call (#1900).
  // ncc's asset relocator statically matches `path.resolve(x, <template or
  // concat expression ending in a file extension>)` and rewrites the whole
  // expression into an asset reference rooted at the bundle's asset base
  // directory. That broke the shipped GitHub Action twice over: `resolved` no
  // longer started with `base`, so the traversal guard below threw on EVERY
  // call (independent of `runId`, swallowed by the `.catch(() => null)` in
  // loadAllRunRecords — the job-summary digest silently reported 0 runs), and
  // the relocator copied every *.json under the repo into
  // runners/github-action/dist/. Binding the last argument to a variable first
  // is enough to stop the rewrite while keeping path.resolve() semantics
  // (absolute runIds still escape `base` and are caught by the guard).
  // Verified against ncc 0.45.0; `path.join` would also avoid the rewrite but
  // changes how absolute runIds are handled, weakening the guard.
  const fileName = `${runId}.json`;
  const resolved = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(base, fileName);
  if (!resolved.startsWith(base + node_path__WEBPACK_IMPORTED_MODULE_1__.sep) && resolved !== base) {
    throw new Error(`Invalid runId: path traversal detected`);
  }
  const raw = await node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.readFile(resolved, 'utf8');
  return JSON.parse(raw);
}

/**
 * Compute aggregate dashboard metrics across a list of run records.
 *
 * #1857 / ADR-007 — reading a store that spans the split. `.river/runs/` is
 * append-only, so records written before `overflowFindings` existed sit next to
 * records written after it, and this function sums both into one dashboard.
 * Pre-split records folded the overview-cap overflow INTO `suppressedFindings`
 * under `covered_by_higher_level_finding`; post-split records keep it out. Three
 * separate counters make that visible instead of hiding it:
 *
 * - `totalSuppressed` / `suppressRate` count `suppressedFindings` exactly as
 *   each record stored them. They are not retro-corrected.
 * - `totalOverflow` counts `overflowFindings`, which only post-split records
 *   have.
 * - `legacyCoveredByHigherLevel` counts the suppressions still carrying the
 *   retired reason code, i.e. the rows whose two events cannot be told apart.
 *
 * Reinterpreting the legacy code as overflow was considered and rejected: the
 * pre-split value ALSO covered genuine duplicate dispositions
 * (`rankFindingsForOutput`'s repeated-ruleId branch wrote the same string), so
 * moving all of it would trade a known discontinuity for an unmeasurable
 * misattribution in the other direction. Making the mixed population countable
 * is what lets a reader tell a real trend from the split.
 */
function computeDashboard(runRecords) {
  if (!runRecords.length) {
    return {
      totalRuns: 0,
      totalFindings: 0,
      totalSuppressed: 0,
      totalOverflow: 0,
      legacyCoveredByHigherLevel: 0,
      suppressRate: null,
      severityDistribution: {},
      confidenceDistribution: {},
      reviewerRoleDistribution: {},
      avgFindingsPerRun: null,
    };
  }

  const allFindings = runRecords.flatMap((r) => r.findings ?? []);
  const allSuppressed = runRecords.flatMap((r) => r.suppressedFindings ?? []);
  const allOverflow = runRecords.flatMap((r) => r.overflowFindings ?? []);
  const legacyCovered = allSuppressed.filter(
    (f) => f?.suppressReason === _finding_factory_mjs__WEBPACK_IMPORTED_MODULE_6__/* .SUPPRESS_REASONS */ ._0.COVERED_BY_HIGHER_LEVEL
  ).length;

  const severityDist = {};
  const confidenceDist = {};
  const roleDist = {};

  for (const f of allFindings) {
    const sev = f.severity ?? 'unknown';
    severityDist[sev] = (severityDist[sev] ?? 0) + 1;
    const conf = f.confidence ?? 'unknown';
    confidenceDist[conf] = (confidenceDist[conf] ?? 0) + 1;
    if (f.reviewerRole) {
      roleDist[f.reviewerRole] = (roleDist[f.reviewerRole] ?? 0) + 1;
    }
  }

  const total = allFindings.length;
  const suppTotal = allSuppressed.length;

  return {
    totalRuns: runRecords.length,
    totalFindings: total,
    totalSuppressed: suppTotal,
    totalOverflow: allOverflow.length,
    legacyCoveredByHigherLevel: legacyCovered,
    suppressRate: total + suppTotal > 0 ? suppTotal / (total + suppTotal) : null,
    severityDistribution: severityDist,
    confidenceDistribution: confidenceDist,
    reviewerRoleDistribution: roleDist,
    avgFindingsPerRun: total / runRecords.length,
  };
}

/**
 * Format dashboard as a Markdown string.
 */
function formatDashboard(dashboard) {
  const lines = ['## River Review Dashboard', ''];

  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Total runs | ${dashboard.totalRuns} |`);
  lines.push(`| Total findings | ${dashboard.totalFindings} |`);
  lines.push(`| Total suppressed | ${dashboard.totalSuppressed} |`);
  // #1857 / ADR-007: a separate row, because the overview-cap overflow is a
  // ranking outcome and must not be read as a suppression.
  lines.push(`| Total overflow (overview cap) | ${dashboard.totalOverflow ?? 0} |`);
  // Only shown when the store still holds pre-split records. Their suppression
  // count mixes duplicates with the cap overflow, so a Suppress rate compared
  // across that boundary is not comparing like with like.
  if (dashboard.legacyCoveredByHigherLevel > 0) {
    lines.push(
      `| Legacy pre-#1857 suppressions (${_finding_factory_mjs__WEBPACK_IMPORTED_MODULE_6__/* .SUPPRESS_REASONS */ ._0.COVERED_BY_HIGHER_LEVEL}) | ${dashboard.legacyCoveredByHigherLevel} |`
    );
  }
  const suppPct =
    dashboard.suppressRate !== null ? `${(dashboard.suppressRate * 100).toFixed(1)}%` : 'N/A';
  lines.push(`| Suppress rate | ${suppPct} |`);
  const avgF =
    dashboard.avgFindingsPerRun !== null ? dashboard.avgFindingsPerRun.toFixed(1) : 'N/A';
  lines.push(`| Avg findings/run | ${avgF} |`);
  lines.push('');

  if (Object.keys(dashboard.severityDistribution).length) {
    lines.push('### Severity Distribution');
    lines.push('| Severity | Count |');
    lines.push('|---|---|');
    for (const [sev, cnt] of Object.entries(dashboard.severityDistribution).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`| ${sev} | ${cnt} |`);
    }
    lines.push('');
  }

  if (Object.keys(dashboard.confidenceDistribution).length) {
    lines.push('### Confidence Distribution');
    lines.push('| Confidence | Count |');
    lines.push('|---|---|');
    for (const [conf, cnt] of Object.entries(dashboard.confidenceDistribution).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`| ${conf} | ${cnt} |`);
    }
    lines.push('');
  }

  if (Object.keys(dashboard.reviewerRoleDistribution).length) {
    lines.push('### Reviewer Role Distribution');
    lines.push('| Role | Count |');
    lines.push('|---|---|');
    for (const [role, cnt] of Object.entries(dashboard.reviewerRoleDistribution).sort(
      (a, b) => b[1] - a[1]
    )) {
      lines.push(`| ${role} | ${cnt} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}


/***/ })

};

//# sourceMappingURL=560.index.mjs.map