export const id = 866;
export const ids = [866];
export const modules = {

/***/ 3896:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

module.exports = __webpack_require__.p + "293248747edf5d37944a.js?.";

/***/ }),

/***/ 9866:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   produceExecutionManifest: () => (/* binding */ produceExecutionManifest),
/* harmony export */   runRecordArtifactView: () => (/* binding */ runRecordArtifactView)
/* harmony export */ });
/* unused harmony exports SKILL_MANIFEST_RELATIVE_PATH, loadExecutionManifestSources */
/* harmony import */ var node_fs_promises__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1455);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6760);
/* harmony import */ var node_process__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(1708);
/* harmony import */ var node_url__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(3136);
/* harmony import */ var _execution_manifest_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(3055);
/* harmony import */ var _promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(3077);
// Execution Manifest producer — the ONE place the CLI turns a finished run
// into a manifest (#2054 PR-4, Epic #2011 AC6).
//
// `src/lib/execution-manifest.mjs` is the contract: it normalizes a spec,
// derives digests, verifies them, and assesses replayability. It deliberately
// reads nothing from disk. This module is the thin producer on top of it that
// knows WHERE the sources live in this repository — `package.json` for the
// river-review version, `docs/data/skill-manifest.json` for skill checksums —
// and how the two artifact shapes the CLI emits map onto the resolver's
// `artifact` input. It is shared by `river run --save` (run record) and
// `river review plan|exec` (Review Artifact) so the two paths cannot drift
// into two different derivations (CLAUDE.md "Import the SSoT, never re-derive
// it"): every hash still comes from `buildExecutionManifest`.
//
// Judgment-free by construction (ADR-009 D3, RA-1..RA-4): nothing here reads
// or writes `gate` / `decision` / `findings` / `selectedSkills` beyond copying
// the skill ids the run already chose. The manifest records what was used; it
// never decides anything.
//
// Sources that are not yet recorded stay `missing` rather than being guessed
// (docs/development/execution-manifest.md "情報源の実測"). Reading a source
// that is absent (a packaged install without docs/data) degrades the block to
// `missing` the same way — a producer that throws on a missing checksum file
// would turn an optional record into a hard failure of the review itself.









// Same resolution as runners/core/skill-loader.mjs:43-45 (its `repoRoot` is
// module-private, so the three lines are repeated rather than imported):
// `RIVER_REPO_ROOT` first, else two levels above this file. The env override
// is what the shipped GitHub Action relies on — inside the ncc bundle
// `import.meta.url` no longer points into the repository, so a producer that
// only walked up from itself read `runners/package.json` (absent) and reported
// `riverReview` / `skills` as `missing` on every Action run (#2111 review).
// Read at CALL time, not module load: the CLI test harness imports the module
// once and varies the env per invocation, and a root frozen at first import
// would silently ignore every later override.
const HERE = (0,node_url__WEBPACK_IMPORTED_MODULE_3__.fileURLToPath)(new URL(/* asset import */ __webpack_require__(3896), __webpack_require__.b));
const defaultPackageRoot = () =>
  node_process__WEBPACK_IMPORTED_MODULE_2__.env.RIVER_REPO_ROOT ? (0,node_path__WEBPACK_IMPORTED_MODULE_1__.resolve)(node_process__WEBPACK_IMPORTED_MODULE_2__.env.RIVER_REPO_ROOT) : (0,node_path__WEBPACK_IMPORTED_MODULE_1__.resolve)(HERE, '..', '..');

/** Relative location of the skill checksum manifest (`skills[].checksum`). */
const SKILL_MANIFEST_RELATIVE_PATH = 'docs/data/skill-manifest.json';

// DO NOT turn these back into string literals passed to resolve() / join()
// (#1900 / #2111). ncc's asset relocator statically evaluates
// `resolve(x, '<literal ending in a file extension>')` — a `const` holding the
// literal is folded the same way — rewrites the expression into an asset
// reference rooted at the bundle's asset directory (a path that does not exist
// at runtime), and copies every file matching the pattern under the repo into
// runners/github-action/dist/ (`**/package.json` pulled 2280 files, node_modules
// included, on the first attempt). Assembling the name at runtime from parts
// keeps it out of the relocator's static evaluation; same intent as the
// runtime-bound `fileName` in loadRunRecord (src/lib/result-store.mjs).
const PACKAGE_JSON_FILE = ['package', 'json'].join('.');
const SKILL_MANIFEST_FILE = ['docs', 'data', ['skill-manifest', 'json'].join('.')].join('/');

/**
 * Read a JSON source. An ABSENT file is `null` (the block degrades to
 * `missing`: a packaged install may legitimately ship without docs/data).
 * Any other failure — unreadable, or present but not JSON — is thrown: a
 * source that exists and cannot be trusted must not be silently recorded as
 * "not recorded". The CLI callers catch that throw and keep the record /
 * artifact without a manifest, so the review itself never fails on it.
 */
async function readJsonOrNull(path) {
  let raw;
  try {
    raw = await (0,node_fs_promises__WEBPACK_IMPORTED_MODULE_0__.readFile)(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Read the two repository-level sources a manifest pins.
 *
 * An absent source yields `null`, which the resolver turns into a `missing`
 * block; a present-but-broken source throws (see readJsonOrNull). Nothing is
 * fabricated either way.
 *
 * @param {{ packageRoot?: string }} [options]
 * @returns {Promise<{ riverReviewVersion: string|null, skillManifest: object|null }>}
 */
async function loadExecutionManifestSources({ packageRoot = defaultPackageRoot() } = {}) {
  const [pkg, skillManifest] = await Promise.all([
    readJsonOrNull((0,node_path__WEBPACK_IMPORTED_MODULE_1__.join)(packageRoot, PACKAGE_JSON_FILE)),
    readJsonOrNull((0,node_path__WEBPACK_IMPORTED_MODULE_1__.join)(packageRoot, SKILL_MANIFEST_FILE)),
  ]);
  return {
    riverReviewVersion: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(pkg?.version) ?? null,
    skillManifest:
      skillManifest && typeof skillManifest === 'object' && Array.isArray(skillManifest.skills)
        ? skillManifest
        : null,
  };
}

/**
 * Project a `river run` result + its run record onto the resolver's `artifact`
 * input shape.
 *
 * `runLocalReview` reports the chosen skills as loaded skill objects
 * (`{ metadata, body, path }` from runners/core/skill-loader.mjs) under
 * `plan.selected`, while the resolver reads Review-Artifact-shaped
 * `plan.selectedSkills[].id`. Only the id and version are copied; the body and
 * path never enter the spec. `usage` is absent on this path (the local runner
 * does not report provider / model), so `runtime` stays `missing` rather than
 * being guessed from config.
 *
 * @param {object} result runLocalReview() result
 * @param {object} record buildRunRecord() output
 * @returns {object} an artifact-shaped view for resolveExecutionManifestSpec
 */
function runRecordArtifactView(result, record) {
  const selected = Array.isArray(result?.plan?.selected) ? result.plan.selected : [];
  return {
    plan: {
      selectedSkills: selected.map((skill) => ({
        id: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(skill?.metadata?.id ?? skill?.id) ?? null,
        version: (0,_promotion_candidates_mjs__WEBPACK_IMPORTED_MODULE_5__/* .nonEmptyNfcString */ .bS)(skill?.metadata?.version ?? skill?.version) ?? null,
      })),
      reviewMode: record?.reviewMode ?? result?.reviewMode ?? null,
    },
    ...(record?.gate ? { gate: record.gate } : {}),
  };
}

/**
 * Build the manifest for one finished run.
 *
 * `artifact` is the Review Artifact (review plan / exec paths) or the view
 * `runRecordArtifactView` produces (run path). `runRecord` supplies the run id
 * when the artifact carries no `trace.run_id`. `flowDocument` /
 * `expectedFlowVersion` are forwarded untouched so the `flow` block can only be
 * `resolved` by a caller that actually resolved a Flow entry (#2037: this
 * module reads no `flows/` directory either).
 *
 * @param {object} input
 * @param {object} [input.artifact]
 * @param {object} [input.runRecord]
 * @param {object|null} [input.flowDocument]
 * @param {string|null} [input.expectedFlowVersion]
 * @param {Date} [input.now]
 * @param {{ riverReviewVersion: string|null, skillManifest: object|null }} [input.sources]
 *   pre-loaded sources (tests); loaded from the package root when omitted.
 * @returns {Promise<object>} the execution manifest document
 */
async function produceExecutionManifest({
  artifact = null,
  runRecord = null,
  flowDocument = null,
  expectedFlowVersion = null,
  now = new Date(),
  sources = null,
} = {}) {
  const { riverReviewVersion, skillManifest } = sources ?? (await loadExecutionManifestSources());
  const spec = (0,_execution_manifest_mjs__WEBPACK_IMPORTED_MODULE_4__/* .resolveExecutionManifestSpec */ .Vo)({
    artifact,
    runRecord,
    riverReviewVersion,
    skillManifest,
    flowDocument,
    expectedFlowVersion,
  });
  return (0,_execution_manifest_mjs__WEBPACK_IMPORTED_MODULE_4__/* .buildExecutionManifest */ .eD)(spec, { now });
}


/***/ })

};

//# sourceMappingURL=866.index.mjs.map