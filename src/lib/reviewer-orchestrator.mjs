import { generateReview } from './review-engine.mjs';
import {
  classifyFindings,
  normalizeScope,
  normalizeSeverity,
  SEVERITY_RANK,
} from './finding-factory.mjs';
import { buildLlmDiffView, renderDiffText } from './diff-processor.mjs';
import { synthesizeTeamLeadReport } from './team-lead-synthesizer.mjs';
import { deriveReviewCoverage } from './review-coverage.mjs';

export const REVIEWER_ROLES = {
  'bug-hunter': {
    label: 'Bug Hunter',
    focusInstructions: `You are the Bug Hunter reviewer. Focus exclusively on:
- Logic errors, off-by-one mistakes, incorrect boolean conditions
- Null/undefined dereference and missing guard clauses
- Concurrent access race conditions (shared state mutated by parallel/async operations)
- Edge cases (empty collections, negative values)
- Incorrect or swallowed error handling
Report only issues in these categories. Do NOT report security vulnerabilities or style issues.`,
  },
  'security-scanner': {
    label: 'Security Scanner',
    focusInstructions: `You are the Security Scanner reviewer. Focus exclusively on:
- Injection vulnerabilities (SQL, shell command, path traversal, template injection)
- Authentication and authorization bypasses
- Sensitive data exposure (hardcoded secrets, PII in logs, tokens in URLs)
- Insecure defaults, missing input validation at trust boundaries
Report only security issues. Do NOT report logic bugs or style concerns.`,
  },
  'test-gap': {
    label: 'Test Gap Finder',
    focusInstructions: `You are the Test Gap Finder reviewer. Focus exclusively on:
- New or changed code paths that lack test coverage
- Missing edge-case tests (boundary values, error paths, empty inputs)
- Tests that are present but do not assert meaningful outcomes
Report only test coverage gaps. Do NOT report implementation bugs or style issues.`,
  },
  'dependency-reviewer': {
    label: 'Dependency Reviewer',
    focusInstructions: `You are the Dependency Reviewer. Focus exclusively on changes to package manifests and lockfiles:
- Supply-chain risk (new/unfamiliar packages, scope/owner changes, typosquatting)
- Version jumps that may carry breaking changes; missing peer dependencies
- Production vs dev dependency placement; unjustified additions
- Lockfile drift inconsistent with the manifest change
Report only dependency concerns. Do NOT report unrelated logic or style issues.`,
  },
  'frontend-reviewer': {
    label: 'Frontend Reviewer',
    focusInstructions: `You are the Frontend Reviewer. Focus exclusively on UI/component and styling changes:
- Accessibility (semantic HTML, ARIA, keyboard navigation, color contrast)
- Avoidable re-renders and client-side performance
- Responsive/layout regressions and unhandled loading/error states
Report only frontend/UX concerns. Do NOT report backend logic or security bugs.`,
  },
  'ci-cd-reviewer': {
    label: 'CI/CD Reviewer',
    focusInstructions: `You are the CI/CD Reviewer. Focus exclusively on workflow and pipeline changes:
- Unpinned/over-permissioned actions, secret exposure in logs, injection via untrusted inputs
- Missing or weakened required checks; non-deterministic or flaky steps
- Safe rollout/rollback of the pipeline itself
Report only CI/CD concerns. Do NOT report application logic or style issues.`,
  },
};

export const DEFAULT_REVIEWERS = ['bug-hunter', 'security-scanner'];

// Thresholds for diff splitting
const SPLIT_FILE_THRESHOLD = 10;
const SPLIT_LINE_THRESHOLD = 500;

// --- #1689: orchestration-layer observability (progress) and per-role timeout ---
//
// Progress goes to STDERR ONLY. stdout carries the deliverable (JSON / YAML /
// Markdown / HTML), so a progress line on stdout would corrupt the artifact for
// every downstream parser. Same split as src/cli/commands/review.mjs.
//
// The per-role timeout is DISABLED by default (unlimited), preserving the
// pre-#1689 behavior exactly — the default wait time does not change; only
// observability improves. Opt in via `RIVER_REVIEWER_TIMEOUT` (milliseconds) or
// `review.orchestrator.timeoutMs` in `.river-review.{json,yaml}`. It is
// fail-soft: a role that exceeds the limit is recorded as a failed role and the
// run continues with the other roles' findings — the existing partial-result
// path (`Promise.allSettled` + `reviewerResults`) carries it, so merging
// (connected components) and verification are untouched. A run where NO role
// survived is NOT clean: src/lib/run-gate.mjs reads `reviewerResults` and
// withholds the GO / auto-approve outcome (rule 6b NOT_EXECUTED).
//
// Scope note: the timeout ABANDONS a slow role rather than cancelling its LLM
// call — generateReview() takes no AbortSignal. The HTTP layer already has its
// own budget (LLM_TIMEOUT_MS + bounded retries in llm-pipeline.mjs), so the
// abandoned request keeps the process alive for up to that budget after the
// timeout line is printed. This limit bounds the ORCHESTRATION wait, which is
// what #1689 asks for; true cancellation needs an AbortSignal through
// generateReview() and is deliberately out of scope.

/** Env var carrying the per-role timeout in milliseconds (mirrors RIVER_PLANNER_TIMEOUT). */
export const REVIEWER_TIMEOUT_ENV = 'RIVER_REVIEWER_TIMEOUT';

/**
 * Upper bound for the per-role timeout (1 hour). Mirrors the `.max()` in
 * `reviewerOrchestratorConfigSchema` so env and config agree.
 *
 * Above ~2^31-1 ms `setTimeout` overflows a 32-bit signed int and Node CLAMPS
 * the delay to 1 ms (emitting TimeoutOverflowWarning). Without this bound
 * `RIVER_REVIEWER_TIMEOUT=2147483648` silently timed out EVERY role after 1 ms,
 * producing a zero-finding "clean" run.
 */
export const REVIEWER_TIMEOUT_MAX_MS = 3_600_000;

/** Error thrown when a reviewer role exceeds the per-role timeout. */
export class ReviewerTimeoutError extends Error {
  constructor(role, timeoutMs) {
    super(`Reviewer role "${role}" timed out after ${timeoutMs}ms`);
    this.name = 'ReviewerTimeoutError';
    this.role = role;
    this.timeoutMs = timeoutMs;
    /** Marker read by the orchestrator to distinguish a timeout from a real failure. */
    this.timedOut = true;
  }
}

/** A usable per-role timeout: a positive integer no larger than the 1-hour cap. */
function isUsableTimeoutMs(value) {
  return Number.isInteger(value) && value > 0 && value <= REVIEWER_TIMEOUT_MAX_MS;
}

/**
 * Resolve the effective per-role timeout in milliseconds.
 *
 * Precedence (first USABLE value wins):
 *   explicit `timeoutMs` argument > `RIVER_REVIEWER_TIMEOUT` > `config.review.orchestrator.timeoutMs`
 *
 * A value that is missing, non-numeric, fractional, non-positive, or above
 * `REVIEWER_TIMEOUT_MAX_MS` is REJECTED: it emits one warning line on stderr and
 * the resolution falls through to the next source. When no source supplies a
 * usable value the result is `null`, meaning NO timeout (unlimited — the default
 * and the pre-#1689 behavior). Rejecting rather than clamping is deliberate:
 * clamping an out-of-range value to the cap would silently impose a limit the
 * operator never asked for, and Node's own 32-bit clamp turns an overly large
 * value into a 1 ms limit that fails every role.
 *
 * @param {{ timeoutMs?: number, config?: object, env?: NodeJS.ProcessEnv, warn?: (line: string) => void }} [params]
 * @returns {number | null}
 */
export function resolveReviewerTimeoutMs({
  timeoutMs,
  config,
  env = process.env,
  warn = (line) => console.error(line),
} = {}) {
  const candidates = [
    { source: 'reviewer timeout argument', raw: timeoutMs },
    { source: REVIEWER_TIMEOUT_ENV, raw: env?.[REVIEWER_TIMEOUT_ENV] },
    { source: 'review.orchestrator.timeoutMs', raw: config?.review?.orchestrator?.timeoutMs },
  ];
  for (const { source, raw } of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (isUsableTimeoutMs(value)) return value;
    warn(
      `Warning: ${source}=${raw} is not a positive integer of at most ${REVIEWER_TIMEOUT_MAX_MS} ms; ignoring it (per-role timeout stays disabled unless another source supplies one).`
    );
  }
  return null;
}

/**
 * Resolve whether per-role progress lines are emitted.
 *
 * Precedence: `quiet` (CLI `--quiet`, always wins) > explicit `progress` argument
 * > `config.review.orchestrator.progress` > enabled.
 *
 * @param {{ quiet?: boolean, progress?: boolean, config?: object }} [params]
 * @returns {boolean}
 */
export function resolveReviewerProgressEnabled({ quiet = false, progress, config } = {}) {
  if (quiet) return false;
  if (typeof progress === 'boolean') return progress;
  const fromConfig = config?.review?.orchestrator?.progress;
  if (typeof fromConfig === 'boolean') return fromConfig;
  return true;
}

/**
 * Reject with `makeError()` when `promise` has not settled within `timeoutMs`.
 * A non-positive / non-finite `timeoutMs` returns the promise untouched, so the
 * no-timeout path adds neither a timer nor an extra promise hop.
 *
 * Both branches of the race attach handlers to `promise`, so a late rejection
 * after a timeout is already handled and never surfaces as an unhandled rejection.
 */
function withReviewerTimeout(promise, timeoutMs, makeError) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(makeError()), timeoutMs);
  });
  const settled = promise.then(
    (value) => {
      clearTimeout(timer);
      return value;
    },
    (err) => {
      clearTimeout(timer);
      throw err;
    }
  );
  return Promise.race([settled, timeout]);
}

/**
 * Monotonic clock for elapsed measurements. `performance.now()` is immune to
 * wall-clock jumps (NTP steps, DST) that can make a `Date.now()` delta negative.
 */
function nowMs() {
  return performance.now();
}

/**
 * Human-readable elapsed time for a progress line. Sub-100 ms durations render
 * as whole milliseconds because `0.0s` reads as "no measurement taken".
 */
function formatElapsed(ms) {
  if (ms < 100) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function resolveReviewerRoles(reviewers, { fileTypes, riskAssessment, signals } = {}) {
  // 'auto' keyword: derive roles from diff content
  if (reviewers?.length === 1 && reviewers[0] === 'auto') {
    const autoSelection = computeAutoSelection(fileTypes, riskAssessment, signals);
    return { valid: autoSelection.roles, invalid: [], autoSelection };
  }
  const names = reviewers ?? DEFAULT_REVIEWERS;
  // A reviewer role is an identity, not an execution multiplicity. Normalize
  // explicit duplicate names here so role aggregation and Review Unit IDs stay
  // one-to-one while preserving the caller's first-seen order.
  const uniqueNames = [...new Set(names)];
  const valid = uniqueNames.filter((n) => REVIEWER_ROLES[n]);
  const invalid = uniqueNames.filter((n) => !REVIEWER_ROLES[n]);
  return { valid, invalid };
}

/**
 * Automatically select reviewer roles based on diff content signals.
 * Always includes bug-hunter; adds security-scanner and test-gap when relevant.
 *
 * @param {object} [fileTypes] coarse file-classifier buckets (config/app/infra/…)
 * @param {object} [riskAssessment] humanReviewFiles / escalatedFiles counts
 * @param {object} [signals] optional formalized stage/risk/artifact signals (#1545 P1)
 * @returns {string[]} selected reviewer role names
 */
export function selectRolesAuto(fileTypes, riskAssessment, signals) {
  return computeAutoSelection(fileTypes, riskAssessment, signals).roles;
}

/**
 * Stage → existing reviewer roles. Maps the Issue #1545 §E stage table onto the
 * existing REVIEWER_ROLES only (no new roles are introduced; Lenses without a
 * dedicated role stay documented Gaps in reviewer-lens-taxonomy).
 */
const STAGE_ROLE_MAP = {
  requirements: [],
  plan: ['security-scanner', 'test-gap'],
  design: ['frontend-reviewer'],
  exec: ['security-scanner'],
  verify: ['test-gap'],
  release: ['security-scanner'],
};

/**
 * Semantic diff signals → existing reviewer roles (Issue #1545 §E routing). Only
 * signals whose Lens maps to an existing role appear here; devex-only signals
 * (changesPublicApi / changesCliInterface / changesInstallation) intentionally
 * map to nothing and remain documented Gaps.
 */
const SIGNAL_ROLE_MAP = {
  touchesAuth: 'security-scanner',
  changesPermissions: 'security-scanner',
  handlesSensitiveData: 'security-scanner',
  databaseMigration: 'security-scanner',
  breakingChange: 'security-scanner',
  changesUi: 'frontend-reviewer',
  changesUserFlow: 'frontend-reviewer',
  deploymentChange: 'ci-cd-reviewer',
};

/**
 * Compute the auto reviewer selection together with an explainable rationale.
 *
 * Backward compatible: with no `signals` argument the selected role set (and its
 * order) is identical to the pre-#1545 behavior — bug-hunter first, then the
 * file/risk heuristics in their original order. New signals are strictly
 * additive and only ever ADD roles.
 *
 * @returns {{ roles: string[], reasons: Record<string, string[]>, required: string[], skipped: string[] }}
 */
function computeAutoSelection(fileTypes, riskAssessment, signals) {
  /** @type {Map<string, string[]>} role → reasons (insertion order = role order) */
  const reasons = new Map();
  const add = (role, reason) => {
    if (!REVIEWER_ROLES[role]) return; // never select a non-existent role
    if (!reasons.has(role)) reasons.set(role, []);
    const list = reasons.get(role);
    if (!list.includes(reason)) list.push(reason);
  };

  // Fail-safe baseline: bug-hunter always runs.
  add('bug-hunter', 'always-on');

  // --- Existing file/risk heuristics (behavior unchanged) ---
  const riskyFiles =
    (riskAssessment?.humanReviewFiles?.length ?? 0) + (riskAssessment?.escalatedFiles?.length ?? 0);
  const infraFiles =
    (fileTypes?.config?.length ?? 0) +
    (fileTypes?.schema?.length ?? 0) +
    (fileTypes?.migration?.length ?? 0) +
    (fileTypes?.infra?.length ?? 0);
  if (riskyFiles > 0 || infraFiles > 0) {
    add('security-scanner', 'files:risk-or-infra');
  }

  const testFiles = fileTypes?.test?.length ?? 0;
  const appFiles = fileTypes?.app?.length ?? 0;
  if (testFiles > 0 || appFiles > 2) {
    add('test-gap', 'files:tests-or-many-app');
  }

  const configList = fileTypes?.config ?? [];
  if (configList.some((f) => RE_DEPENDENCY_FILE.test(basenameOf(f)))) {
    add('dependency-reviewer', 'files:manifest-or-lockfile');
  }

  const appList = fileTypes?.app ?? [];
  if (appList.some((f) => RE_FRONTEND_FILE.test(normalizePath(f)))) {
    add('frontend-reviewer', 'files:ui-or-styling');
  }

  const infraList = fileTypes?.infra ?? [];
  if (infraList.some((f) => RE_CI_WORKFLOW.test(normalizePath(f)))) {
    add('ci-cd-reviewer', 'files:workflow');
  }

  // --- Formalized stage/risk/artifact signals (#1545 P1, optional & additive) ---
  if (signals && typeof signals === 'object') {
    const stage = typeof signals.stage === 'string' ? signals.stage : null;
    if (stage && STAGE_ROLE_MAP[stage]) {
      for (const role of STAGE_ROLE_MAP[stage]) add(role, `stage:${stage}`);
    }
    for (const [key, role] of Object.entries(SIGNAL_ROLE_MAP)) {
      if (signals[key]) add(role, `signal:${key}`);
    }
  }

  const roles = [...reasons.keys()];
  const skipped = Object.keys(REVIEWER_ROLES).filter((r) => !reasons.has(r));
  return { roles, reasons: Object.fromEntries(reasons), required: ['bug-hunter'], skipped };
}

// Sub-classification patterns for auto role selection (#1196 S3). These refine
// the coarse file-classifier buckets (config/app/infra) without changing them.
const RE_DEPENDENCY_FILE = /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const RE_FRONTEND_FILE = /\.(?:tsx|jsx|css|scss|sass|less|vue|svelte)$/;
const RE_CI_WORKFLOW = /\.github\/workflows\//;

// Null-safe path helpers: list elements may be non-strings in malformed input.
function normalizePath(f) {
  return typeof f === 'string' ? f.replaceAll('\\', '/') : '';
}
function basenameOf(f) {
  return normalizePath(f).split('/').pop() ?? '';
}

/**
 * Split diff files into groups for parallel chunk execution.
 * Groups by directory prefix to keep related files together.
 */
export function splitDiffIntoChunks(diff) {
  const files = diff.files ?? [];
  const totalLines = files.reduce(
    (sum, f) => sum + (f.hunks ?? []).reduce((s, h) => s + (h.lines?.length ?? 0), 0),
    0
  );

  if (files.length <= SPLIT_FILE_THRESHOLD && totalLines <= SPLIT_LINE_THRESHOLD) {
    return null; // No split needed
  }

  // Group files by top-level directory
  const groups = new Map();
  for (const file of files) {
    const dir = file.path.split('/')[0] ?? '_root';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }

  // Merge small groups to avoid excessive chunks (target: 2–4 chunks)
  const targetChunks = Math.min(4, Math.ceil(files.length / SPLIT_FILE_THRESHOLD));
  const buckets = [];
  for (const groupFiles of groups.values()) {
    if (buckets.length < targetChunks) {
      buckets.push([...groupFiles]);
    } else {
      // Append to smallest bucket
      buckets.sort((a, b) => a.length - b.length);
      buckets[0].push(...groupFiles);
    }
  }

  return buckets
    .filter((b) => b.length > 0)
    .map((chunkFiles) => ({
      ...diff,
      files: chunkFiles,
      filesForReview: chunkFiles,
      diffText: renderDiffText(chunkFiles),
      _chunkLabel: chunkFiles
        .map((f) => f.path)
        .join(', ')
        .slice(0, 60),
    }));
}

/**
 * Compute consensusLevel from an agreement array.
 * Used as display-only metadata; MUST NOT influence severity decisions.
 * @param {string[]} agreement
 * @returns {'consensus' | 'multi' | 'single'}
 */
function computeConsensusLevel(agreement) {
  const count = Array.isArray(agreement) ? agreement.length : 0;
  if (count >= 3) return 'consensus';
  if (count >= 2) return 'multi';
  return 'single';
}

function maxSeverity(a, b) {
  const na = normalizeSeverity(a);
  const nb = normalizeSeverity(b);
  return SEVERITY_RANK[na] >= SEVERITY_RANK[nb] ? na : nb;
}

/**
 * Composition rule for `scope` across a merge cluster (#1644 残件4).
 *
 * Same shape as `maxSeverity`: the cluster keeps the value that does NOT
 * weaken the finding. For scope the non-weakening value is `in-diff`, because
 * `finding-factory.mjs` declares (see DEFAULT_FINDING_SCOPE, :19-24):
 *
 *   "Fail-safe default scope. Unknown/absent scope MUST NOT demote a finding,
 *    so the default is the non-demoting value (`in-diff`) […]"
 *
 * Without this, the cluster inherited the scope of `findings[indices[0]]`
 * alone, so a `pre-existing` head silently demoted a co-clustered role's
 * `in-diff` verdict — the exact demotion the fail-safe forbids.
 *
 * Every member is passed through `normalizeScope` (the SSoT normalizer), so a
 * member that carries no scope, or an out-of-vocabulary one, counts as
 * `in-diff` rather than being ignored: ignoring it would let an unclassified
 * finding be demoted by a classified neighbour.
 *
 * @param {object[]} members findings of one cluster
 * @returns {'in-diff'|'pre-existing'}
 */
function mergeScope(members) {
  return members.some((m) => normalizeScope(m?.scope) === 'in-diff') ? 'in-diff' : 'pre-existing';
}

/**
 * Line positions a merge cluster absorbed (#1823 残件1).
 *
 * `findingsOverlap` clusters findings whose `lineStart` differs by up to 2, and
 * the cluster then keeps ONE representative — so the other members' lines stop
 * being reachable from the merged finding. That loss is what makes a v2
 * (line-anchored) suppression leak: `filterSuppressedComments` recomputes the
 * v2 hex from each comment's OWN line, so the comment anchored at a
 * merged-away line hashes to a different value than the representative and
 * survives the suppression (reproduced on #1823: representative at line 100,
 * comment at 101 kept).
 *
 * Recording the member lines on the representative is what lets the comment
 * filter sweep them. The list is de-duplicated and ascending, and it includes
 * the representative's own line so a consumer needs no second source.
 *
 * A member that already carries `mergedLineStarts` (a second `mergeFindings`
 * pass over merged output — see the ADV-6 idempotency pin in
 * tests/reviewer-orchestrator.test.mjs) contributes its whole list, so the
 * absorbed lines are never dropped by re-merging.
 *
 * @param {object[]} members findings of one cluster
 * @returns {number[]} ascending, de-duplicated line numbers
 */
function collectMergedLineStarts(members) {
  const lines = new Set();
  for (const m of members) {
    for (const l of Array.isArray(m?.mergedLineStarts) ? m.mergedLineStarts : []) {
      if (Number.isInteger(l) && l >= 1) lines.add(l);
    }
    const own = m?.lineStart ?? m?.line;
    if (Number.isInteger(own) && own >= 1) lines.add(own);
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * Predicate: returns true when two findings are considered duplicates.
 * Criteria: same file, line positions within ±2, and message edit-distance ≤ 10
 * (compared on the first 80 chars, lower-cased).
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function findingsOverlap(a, b) {
  if (a.file !== b.file) return false;
  const lineOverlap = Math.abs((a.lineStart ?? a.line ?? 0) - (b.lineStart ?? b.line ?? 0)) <= 2;
  if (!lineOverlap) return false;
  const msgA = (a.message ?? a.title ?? '').slice(0, 80).toLowerCase();
  const msgB = (b.message ?? b.title ?? '').slice(0, 80).toLowerCase();
  return editDistance(msgA, msgB) <= 10;
}

/**
 * Merge findings across reviewers using connected-components clustering.
 *
 * Two findings that are mutually overlapping (per findingsOverlap) are placed
 * in the same component. Because the graph may form A–B–C chains where A and C
 * are NOT directly overlapping, a union-find (path-compressed) is used so that
 * all transitively connected findings collapse into one cluster regardless of
 * input order.
 *
 * Each cluster produces ONE canonical finding (the first member) with:
 *   - severity = max of cluster (after normalization of blocker/warning/nit)
 *   - evidence = deduplicated union of all evidence arrays
 *   - agreement = array of all reviewerRole values in the cluster
 *   - scope = `in-diff` when any member is in-diff, else `pre-existing`
 *     (mergeScope; omitted when no member carried a scope)
 *   - mergedLineStarts = every line the cluster absorbed, ascending and
 *     de-duplicated (collectMergedLineStarts; omitted when the cluster spans a
 *     single line). INTERNAL field: `formatJsonOutput` maps findings to
 *     `issues` through an explicit allowlist (src/cli/render.mjs), so this does
 *     not reach the `$defs.issue` artifact and needs no schema change.
 * Non-duplicate findings pass through unchanged, with agreement = [their reviewerRole] if set.
 */
export function mergeFindings(findings) {
  const n = findings.length;
  if (n === 0) return [];

  // Union-Find with path halving
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  }
  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[ry] = rx;
  }

  // Build adjacency: O(n²) — acceptable for typical review finding counts
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (findingsOverlap(findings[i], findings[j])) {
        union(i, j);
      }
    }
  }

  // Group indices by root representative, preserving insertion order
  const clusterMap = new Map(); // root → [indices]
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(i);
  }

  return [...clusterMap.values()].map((indices) => {
    const canonical = { ...findings[indices[0]] };
    if (indices.length === 1) {
      // Passthrough: attach agreement with own role, preserving existing
      const role = canonical.reviewerRole;
      const existingAgreement = Array.isArray(canonical.agreement) ? canonical.agreement : [];
      const agreementSet = new Set(existingAgreement);
      if (role) agreementSet.add(role);
      const passthroughAgreement = [...agreementSet];
      return {
        ...canonical,
        severity: normalizeSeverity(canonical.severity),
        agreement: passthroughAgreement,
        consensusLevel: computeConsensusLevel(passthroughAgreement),
      };
    }

    // Merge cluster: max severity, union evidence, collect agreement
    let mergedSeverity = canonical.severity;
    const evidenceSet = new Set(Array.isArray(canonical.evidence) ? canonical.evidence : []);
    const agreementSet = new Set(Array.isArray(canonical.agreement) ? canonical.agreement : []);
    if (canonical.reviewerRole) agreementSet.add(canonical.reviewerRole);

    for (const idx of indices.slice(1)) {
      const m = findings[idx];
      mergedSeverity = maxSeverity(mergedSeverity, m.severity);
      for (const e of Array.isArray(m.evidence) ? m.evidence : []) evidenceSet.add(e);
      for (const a of Array.isArray(m.agreement) ? m.agreement : []) agreementSet.add(a);
      if (m.reviewerRole) agreementSet.add(m.reviewerRole);
    }

    const mergedAgreement = [...agreementSet];
    const members = indices.map((idx) => findings[idx]);
    const mergedLineStarts = collectMergedLineStarts(members);
    return {
      ...canonical,
      severity: mergedSeverity,
      evidence: [...evidenceSet],
      agreement: mergedAgreement,
      consensusLevel: computeConsensusLevel(mergedAgreement),
      // Only materialise `scope` when at least one member carried it. A cluster
      // where nobody classified the scope stays without the field — schema
      // readers already treat an absent scope as `in-diff`
      // (schemas/output.schema.json, issues[].scope), so adding it there would
      // change the payload without changing its meaning.
      ...(members.some((m) => m?.scope !== undefined) ? { scope: mergeScope(members) } : {}),
      // #1823 残件1: only materialised when the cluster spans MORE THAN ONE
      // line. A single distinct line is already carried by `lineStart`, so the
      // field would repeat it without adding a sweep target — same emission
      // rule as `scope` above. Single-member clusters therefore never gain the
      // field on the passthrough branch either; a representative that inherited
      // one from an earlier pass keeps it through the `...canonical` spread.
      ...(mergedLineStarts.length > 1 ? { mergedLineStarts } : {}),
    };
  });
}

/**
 * Deduplicate findings across parallel runs.
 * Two findings are considered duplicates if findingsOverlap returns true.
 */
export function deduplicateFindings(findings) {
  const seen = [];
  const result = [];

  for (const f of findings) {
    const isDuplicate = seen.some((s) => findingsOverlap(s, f));

    if (!isDuplicate) {
      seen.push(f);
      result.push(f);
    }
  }

  return result;
}

function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Only compute if strings are similar enough to be worth comparing
  if (Math.abs(m - n) > 15) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Subjects MUST describe what the reviewer actually saw, which is the LLM diff
// view — not the raw chunk array (#2233). `splitDiffIntoChunks` aliases the raw
// files into BOTH `files` and `filesForReview`, so reading those directly made a
// chunked run report lockfiles / dist artifacts as covered subjects while the
// same `reviewCoverage.fileScope.excluded` listed them as `diff_optimization`.
// `buildLlmDiffView` is the single source of truth for that view (it re-optimizes
// the raw chunk alias, #2230), so routing through it keeps the ledger's
// `excluded` and `units[].subjects` sets disjoint by construction.
function reviewUnitSubjects(chunkDiff) {
  const hadInputFiles =
    (Array.isArray(chunkDiff?.filesForReview) && chunkDiff.filesForReview.length > 0) ||
    (Array.isArray(chunkDiff?.files) && chunkDiff.files.length > 0);
  const filePaths = (buildLlmDiffView(chunkDiff).files ?? [])
    .map((file) => file?.path)
    .filter((value) => typeof value === 'string');
  // Only fall back to `changedFiles` when the chunk carried no file objects at
  // all. When every file of a chunk was dropped by the optimizer, falling back
  // would re-introduce exactly the excluded paths this function must not claim.
  const changedFiles =
    hadInputFiles || !Array.isArray(chunkDiff?.changedFiles)
      ? []
      : chunkDiff.changedFiles.filter((value) => typeof value === 'string');
  const subjects = [...new Set(filePaths.length > 0 ? filePaths : changedFiles)];
  // Orchestration normally only runs when there are reviewable files. Keep the
  // contract schema-valid if a malformed/custom diff reaches this layer while
  // making the missing subject explicit instead of pretending the unit covered
  // a real path.
  return subjects.length > 0 ? subjects : ['<unknown-diff>'];
}

export async function runReviewerOrchestration({
  diff,
  plan,
  phase,
  dryRun = false,
  model,
  apiKey,
  projectRules,
  riskAssessment,
  memoryContext,
  repoContext,
  fileTypes,
  relatedADRs,
  reviewMode,
  config,
  reviewers,
  prBody,
  signals,
  // #1689: observability knobs. `quiet` comes from the CLI `--quiet` flag;
  // `timeoutMs` / `progress` are explicit overrides above env and config.
  // `env` is injectable so a stray RIVER_REVIEWER_TIMEOUT in the developer's
  // shell cannot change test outcomes. `progressSink` and `generateReviewImpl`
  // are injection points for tests (same `*Impl` convention as
  // llm-pipeline.mjs / deterministic-command-orchestrator.mjs).
  quiet = false,
  timeoutMs,
  progress,
  progressSink,
  env = process.env,
  generateReviewImpl = generateReview,
} = {}) {
  const {
    valid: roles,
    invalid,
    autoSelection = null,
  } = resolveReviewerRoles(reviewers, { fileTypes, riskAssessment, signals });

  if (!roles.length) {
    throw new Error(
      `No valid reviewer roles. Got: [${(reviewers ?? []).join(', ')}]. Valid: [${Object.keys(REVIEWER_ROLES).join(', ')}]`
    );
  }

  // Attempt diff splitting for large PRs
  const diffChunks = splitDiffIntoChunks(diff);
  const chunked = diffChunks !== null;
  const diffsToProcess = chunked ? diffChunks : [diff];

  const generateArgs = {
    plan,
    phase,
    dryRun,
    model,
    apiKey,
    riskAssessment,
    memoryContext,
    repoContext,
    fileTypes,
    relatedADRs,
    reviewMode,
    config,
    prBody,
  };

  // #1689: resolve observability settings once per run.
  // stderr ONLY — never process.stdout, which carries the review artifact.
  const emit =
    typeof progressSink === 'function'
      ? (line) => progressSink(line)
      : (line) => console.error(line);
  // An invalid-timeout warning must surface even under --quiet: silently
  // ignoring a misconfigured limit is exactly the failure #1689's review found.
  const effectiveTimeoutMs = resolveReviewerTimeoutMs({ timeoutMs, config, env, warn: emit });
  const progressEnabled = resolveReviewerProgressEnabled({ quiet, progress, config });
  const logProgress = progressEnabled ? emit : () => {};

  // One descriptor per unit of work (role × chunk). Keeping the descriptors
  // alongside the promises lets the per-role summary index into `settled`
  // directly instead of recomputing the role-per-task mapping.
  const taskDescriptors = roles.flatMap((roleName) =>
    diffsToProcess.map((chunkDiff, chunkIdx) => ({ roleName, chunkDiff, chunkIdx }))
  );
  /** Per-task outcome, filled in by the progress handlers before allSettled resolves. */
  const taskOutcomes = taskDescriptors.map(() => ({ durationMs: null, timedOut: false }));

  const chunkSuffix = (chunkIdx) =>
    chunked ? ` [chunk ${chunkIdx + 1}/${diffsToProcess.length}]` : '';

  const orchestrationStartedAt = nowMs();

  // Fan out: each role × each diff chunk runs in parallel
  const tasks = taskDescriptors.map(({ roleName, chunkDiff, chunkIdx }, taskIdx) => {
    const role = REVIEWER_ROLES[roleName];
    const roleRules = [role.focusInstructions, projectRules].filter(Boolean).join('\n\n');
    const taskStartedAt = nowMs();
    logProgress(`Reviewer ${roleName}: start${chunkSuffix(chunkIdx)}`);
    const run = generateReviewImpl({
      ...generateArgs,
      diff: chunkDiff,
      projectRules: roleRules,
    }).then((result) => ({
      ...result,
      reviewerRole: roleName,
      chunkIdx: chunked ? chunkIdx : null,
      chunkLabel: chunked ? (chunkDiff._chunkLabel ?? `chunk-${chunkIdx}`) : null,
    }));
    return withReviewerTimeout(
      run,
      effectiveTimeoutMs,
      () => new ReviewerTimeoutError(roleName, effectiveTimeoutMs)
    ).then(
      (value) => {
        const durationMs = Math.round(nowMs() - taskStartedAt);
        taskOutcomes[taskIdx].durationMs = durationMs;
        logProgress(
          `Reviewer ${roleName}: done in ${formatElapsed(durationMs)} (${value.findings?.length ?? 0} findings)${chunkSuffix(chunkIdx)}`
        );
        return value;
      },
      (err) => {
        const durationMs = Math.round(nowMs() - taskStartedAt);
        taskOutcomes[taskIdx].durationMs = durationMs;
        taskOutcomes[taskIdx].timedOut = err?.timedOut === true;
        logProgress(
          err?.timedOut === true
            ? `Reviewer ${roleName}: timeout after ${formatElapsed(durationMs)} (other chunks/roles continue)${chunkSuffix(chunkIdx)}`
            : `Reviewer ${roleName}: failed after ${formatElapsed(durationMs)} (${err?.message ?? 'unknown error'})${chunkSuffix(chunkIdx)}`
        );
        throw err;
      }
    );
  });

  // Run each role in parallel; partial failure is tolerated
  const settled = await Promise.allSettled(tasks);
  const orchestrationDurationMs = Math.round(nowMs() - orchestrationStartedAt);

  const succeeded = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = settled.filter((r) => r.status === 'rejected');

  const requiredRoles = new Set(autoSelection ? (autoSelection.required ?? []) : roles);
  const reviewUnits = taskDescriptors.map(({ roleName, chunkDiff, chunkIdx }, taskIdx) => {
    const task = settled[taskIdx];
    const timedOut = taskOutcomes[taskIdx]?.timedOut === true;
    const status = task?.status === 'fulfilled' ? 'completed' : timedOut ? 'timed_out' : 'failed';
    return {
      id: `reviewer:${roleName}/chunk:${chunkIdx + 1}`,
      kind: 'diff-chunk',
      subjects: reviewUnitSubjects(chunkDiff),
      reviewerRole: roleName,
      required: requiredRoles.has(roleName),
      status,
      reasonCode:
        status === 'completed'
          ? null
          : status === 'timed_out'
            ? 'reviewer_timeout'
            : 'reviewer_error',
      findingsCount: task?.status === 'fulfilled' ? (task.value?.findings?.length ?? 0) : 0,
    };
  });
  const reviewCoverage = deriveReviewCoverage(reviewUnits);

  // Merge findings, deduplicate across chunks/roles, then assign stable IDs
  let nextId = 1;
  const rawFindings = succeeded.flatMap((r) =>
    (r.findings ?? []).map((f) => ({
      ...f,
      reviewerRole: r.reviewerRole,
      chunkLabel: r.chunkLabel ?? null,
    }))
  );
  const deduped = mergeFindings(rawFindings);
  const allFindings = deduped.map((f) => ({ ...f, id: `rr-${nextId++}` }));

  const allComments = succeeded.flatMap((r) => r.comments ?? []);
  const classified = classifyFindings(allFindings, { reviewMode: reviewMode ?? 'medium' });

  // Summarise per-role results (aggregate across chunks)
  const reviewerResults = roles.map((name) => {
    const roleIndices = taskDescriptors
      .map((d, i) => (d.roleName === name ? i : -1))
      .filter((i) => i >= 0);
    const roleSettled = roleIndices.map((i) => settled[i]);
    const roleSucceeded = roleSettled.filter((r) => r.status === 'fulfilled');
    const roleOutcomes = roleIndices.map((i) => taskOutcomes[i]);
    const roleDurations = roleOutcomes
      .map((o) => o.durationMs)
      .filter((d) => typeof d === 'number');
    return {
      role: name,
      label: REVIEWER_ROLES[name].label,
      status: roleSucceeded.length > 0 ? 'fulfilled' : 'rejected',
      findingsCount: roleSucceeded.reduce((sum, r) => sum + (r.value?.findings?.length ?? 0), 0),
      chunksRun: chunked ? diffsToProcess.length : null,
      // #1545 P1: why this role was auto-selected (only present in auto mode).
      selectionReasons: autoSelection ? (autoSelection.reasons[name] ?? []) : null,
      // #1689: true when at least one unit of work for this role hit the
      // per-role timeout. With chunking the role can still be 'fulfilled' —
      // the surviving chunks' findings are kept (fail-soft).
      timedOut: roleOutcomes.some((o) => o.timedOut),
      durationMs: roleDurations.length ? Math.max(...roleDurations) : null,
      error:
        roleSucceeded.length === 0 ? String(roleSettled[0]?.reason?.message ?? 'unknown') : null,
    };
  });

  // #1689 W4: counted in ROLES (not role×chunk tasks) so this agrees with the
  // "N/M roles succeeded" figure. A role whose surviving chunks produced
  // findings stays `fulfilled` yet still appears here, so the timed-out roles
  // are listed by name rather than folded into the failure count — "0 failed
  // (1 timed out)" read as a contradiction.
  const timedOutRoles = reviewerResults.filter((r) => r.timedOut).map((r) => r.role);
  const failedRoleCount = reviewerResults.filter((r) => r.status === 'rejected').length;
  const succeededRoleCount = reviewerResults.length - failedRoleCount;
  logProgress(
    `Reviewers: ${succeededRoleCount}/${reviewerResults.length} roles succeeded, ${failedRoleCount} failed, ` +
      `${formatElapsed(orchestrationDurationMs)} total` +
      (timedOutRoles.length > 0 ? ` (timed out: ${timedOutRoles.join(', ')})` : '')
  );

  const teamLeadReport = synthesizeTeamLeadReport({
    findings: allFindings,
    reviewerResults,
  });

  return {
    comments: allComments,
    findings: allFindings,
    classified,
    reviewerResults,
    reviewCoverage,
    invalidRoles: invalid,
    autoSelectedRoles: reviewers?.length === 1 && reviewers[0] === 'auto' ? roles : null,
    // #1545 P1: explainable auto-selection — reasons per role, the always-on
    // required set, and the roles skipped this run. null when not in auto mode.
    autoSelection,
    teamLeadReport,
    chunked,
    chunkCount: chunked ? diffsToProcess.length : null,
    prompt: succeeded[0]?.prompt ?? null,
    promptTruncated: succeeded.some((r) => r.promptTruncated),
    llmModel: succeeded[0]?.llmModel ?? null,
    debug: {
      succeededReviewers: succeeded.length,
      failedReviewers: failed.length,
      deduplicatedCount: rawFindings.length - allFindings.length,
      // #1689: the timeout is also recorded in the machine-readable result, not
      // only on stderr, so a CI consumer can tell "no findings" apart from
      // "the role never returned". `timeoutMs` is null when disabled (default).
      // Reachable from the CLI as `reviewDebug` in the run record and as the
      // top-level `timedOutRoles` field of the JSON output (src/cli/render.mjs).
      timeoutMs: effectiveTimeoutMs,
      timedOutRoles,
      durationMs: orchestrationDurationMs,
    },
  };
}
