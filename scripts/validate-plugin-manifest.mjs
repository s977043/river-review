import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { normalizeSeverity } from '../src/lib/finding-factory.mjs';
import { GATE_DECISIONS } from '../src/lib/gate-decision.mjs';
import { isDirectRun } from './lib/is-direct-run.mjs';
import { classifyTrackedTarget, listTrackedPaths } from './lib/tracked-file-targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

async function readJson(filePath) {
  const raw = await fs.readFile(path.join(ROOT, filePath), 'utf8');
  return JSON.parse(raw);
}

async function pathExists(relPath) {
  try {
    await fs.access(path.join(ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function fileExists(relPath) {
  try {
    const stat = await fs.stat(path.join(ROOT, relPath));
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Normalize a plugin-manifest path reference (e.g. "./.claude/commands/pr.md")
 * to a repo-relative path.
 */
function normalizeRef(ref) {
  return ref.replace(/^\.\//, '');
}

/**
 * List top-level `*.md` files (not recursing into subdirectories) under a
 * repo-relative directory. Returns basenames (e.g. "pr.md"). Missing dir → [].
 *
 * Exported so scripts/check-doc-enumerations.mjs reuses this listing instead of
 * re-deriving it (CLAUDE.md "Import the SSoT, never re-derive it").
 */
export async function listMarkdownFiles(dir) {
  try {
    const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Distribution-bundle field allowlist for .codex-plugin/plugin.json (#1250).
 *
 * The external `awesome-codex-plugins` fork carries a bundle copy of this
 * manifest that cannot be reached from this repo, so parity with the fork is
 * enforced indirectly: every field the bundle may carry must be declared here.
 * A field present in the manifest but absent from this allowlist fails
 * `npm run plugin:validate`, forcing the mirror rule in CLAUDE.md
 * ("Plugin bundle mirror") to be applied consciously instead of drifting
 * silently.
 */
export const CODEX_BUNDLE_ALLOWED_FIELDS = [
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'skills',
  'interface',
];

/** Fields awesome-codex-plugins listing requires in the bundle manifest. */
export const CODEX_BUNDLE_REQUIRED_FIELDS = [
  'name',
  'version',
  'description',
  'repository',
  'license',
];

export const CODEX_INTERFACE_ALLOWED_FIELDS = [
  'displayName',
  'shortDescription',
  'longDescription',
  'developerName',
  'category',
  'capabilities',
  'websiteURL',
  'composerIcon',
];

/**
 * Check that the .codex-plugin manifest (the in-repo mirror of the
 * distribution bundle) only carries allowlisted fields and carries every
 * field the external listing requires.
 *
 * Pure function; returns array of error strings (empty = pass).
 */
export function checkBundleFieldAllowlist(codexManifest) {
  const errors = [];

  for (const field of Object.keys(codexManifest)) {
    if (!CODEX_BUNDLE_ALLOWED_FIELDS.includes(field)) {
      errors.push(
        `.codex-plugin/plugin.json: field "${field}" is not in the bundle allowlist — ` +
          `add it to CODEX_BUNDLE_ALLOWED_FIELDS in scripts/validate-plugin-manifest.mjs ` +
          `and mirror it to the distribution bundle in the same PR (#1250)`
      );
    }
  }

  for (const field of CODEX_BUNDLE_REQUIRED_FIELDS) {
    if (
      codexManifest[field] === undefined ||
      codexManifest[field] === null ||
      codexManifest[field] === ''
    ) {
      errors.push(
        `.codex-plugin/plugin.json: required bundle field "${field}" is missing or empty ` +
          `(required by the awesome-codex-plugins listing)`
      );
    }
  }

  const iface = codexManifest.interface;
  if (iface && typeof iface === 'object') {
    for (const field of Object.keys(iface)) {
      if (!CODEX_INTERFACE_ALLOWED_FIELDS.includes(field)) {
        errors.push(
          `.codex-plugin/plugin.json: interface field "${field}" is not in the bundle allowlist — ` +
            `add it to CODEX_INTERFACE_ALLOWED_FIELDS in scripts/validate-plugin-manifest.mjs ` +
            `and mirror it to the distribution bundle in the same PR (#1250)`
        );
      }
    }
  }

  return errors;
}

/**
 * Check parity of fields shared between the two canonical manifests that are
 * NOT owned by `npm run plugin:sync` (which only syncs keywords/homepage/
 * author/license from package.json). These pairs previously drifted silently
 * (#1250: composerIcon updated in the bundle only).
 *
 * Not compared: description/version (intentionally differ or release-please
 * owned), keywords/homepage/author/license (plugin:sync owns them).
 *
 * Pure function; returns array of error strings (empty = pass).
 */
export function checkCrossManifestParity(ccManifest, codexManifest) {
  const errors = [];
  const iface =
    codexManifest.interface && typeof codexManifest.interface === 'object'
      ? codexManifest.interface
      : {};

  const pairs = [
    ['repository', ccManifest.repository, 'repository', codexManifest.repository],
    ['skills', ccManifest.skills, 'skills', codexManifest.skills],
    ['displayName', ccManifest.displayName, 'interface.displayName', iface.displayName],
    ['composerIcon', ccManifest.composerIcon, 'interface.composerIcon', iface.composerIcon],
    ['homepage', ccManifest.homepage, 'interface.websiteURL', iface.websiteURL],
    ['author.name', ccManifest.author?.name, 'interface.developerName', iface.developerName],
  ];

  for (const [ccField, ccVal, codexField, codexVal] of pairs) {
    if (JSON.stringify(ccVal) !== JSON.stringify(codexVal)) {
      errors.push(
        `manifest parity: .claude-plugin "${ccField}" (${JSON.stringify(ccVal)}) !== ` +
          `.codex-plugin "${codexField}" (${JSON.stringify(codexVal)})`
      );
    }
  }

  return errors;
}

/**
 * Reverse-drift check: every distributed command/agent file on disk must be
 * registered in the .claude-plugin manifest. `validatePluginManifest` only
 * checks the forward direction (manifest refs exist), so a newly added
 * `commands/<name>.md` or `agents/<name>.md` that the author forgot to list is
 * silently unshipped. This closes that gap (plugin asset registration
 * checklist: docs/development/plugin-asset-registration-checklist.md).
 *
 * `commandFiles` / `agentFiles` are injected basename lists (e.g. "pr.md") to
 * keep this pure and testable; the caller supplies the real directory listing.
 * `README.md` is never a distributed asset and is excluded.
 *
 * Pure function; returns array of error strings (empty = pass).
 */
export function checkAssetRegistration(ccManifest, { commandFiles = [], agentFiles = [] } = {}) {
  const errors = [];

  // Defensive: ccManifest is normally a $schema-validated manifest object, but
  // this is an exported entry point that may receive arbitrary input. Treat a
  // non-array `commands` / non-string-or-array `agents`, and any non-string
  // array element, as "nothing registered" rather than throwing on .map.
  const manifest = ccManifest && typeof ccManifest === 'object' ? ccManifest : {};
  const toRefSet = (value) => {
    const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    return new Set(list.filter((ref) => typeof ref === 'string').map(normalizeRef));
  };

  const registeredCommands = toRefSet(manifest.commands);
  for (const file of commandFiles) {
    if (file === 'README.md') continue;
    if (!registeredCommands.has(`commands/${file}`)) {
      errors.push(
        `.claude-plugin/plugin.json: commands/${file} exists but is not registered in "commands[]" — ` +
          `add "./commands/${file}" (see docs/development/plugin-asset-registration-checklist.md)`
      );
    }
  }

  const registeredAgents = toRefSet(manifest.agents);
  for (const file of agentFiles) {
    if (file === 'README.md') continue;
    if (!registeredAgents.has(`agents/${file}`)) {
      errors.push(
        `.claude-plugin/plugin.json: agents/${file} exists but is not referenced by "agents" — ` +
          `add "./agents/${file}" (see docs/development/plugin-asset-registration-checklist.md)`
      );
    }
  }

  return errors;
}

/**
 * Extract the distributed-command names listed in CLAUDE.md's
 * `Details: distributed commands (...)` sentence. Returns basenames without the
 * leading slash (e.g. "check", "review-team"). Only the tokens inside the first
 * parenthesized group are read, so the trailing repo-dev command list is
 * ignored. Pure and exported for unit testing.
 *
 * @param {string} claudeMd
 * @returns {string[]}
 */
export function parseClaudeMdDistributedCommands(claudeMd) {
  const line = String(claudeMd ?? '')
    .split('\n')
    .find((l) => l.includes('Details: distributed commands'));
  if (!line) return [];
  const open = line.indexOf('(');
  const close = line.indexOf(')', open);
  if (open < 0 || close < 0) return [];
  const group = line.slice(open + 1, close);
  return [...group.matchAll(/`\/([a-z0-9-]+)`/g)].map((m) => m[1]);
}

/**
 * Parity check between the distributed commands enumerated in CLAUDE.md's prose
 * ("Details: distributed commands (...)") and the commands[] registered in
 * .claude-plugin/plugin.json. The two sets must be identical; a command present
 * in one but not the other means the manual sync (#1451) drifted. Mechanizes
 * the CLAUDE.md ↔ plugin.json command-table sync (#1463 carry-over).
 *
 * Pure function; returns array of error strings (empty = pass).
 *
 * @param {string} claudeMd
 * @param {object} ccManifest
 * @returns {string[]}
 */
export function checkClaudeMdCommandParity(claudeMd, ccManifest) {
  const errors = [];
  const claudeCmds = new Set(parseClaudeMdDistributedCommands(claudeMd));
  if (claudeCmds.size === 0) {
    errors.push(
      'CLAUDE.md: could not find the "Details: distributed commands (...)" list to verify ' +
        'against .claude-plugin/plugin.json commands[]'
    );
    return errors;
  }

  const manifest = ccManifest && typeof ccManifest === 'object' ? ccManifest : {};
  const commandList = Array.isArray(manifest.commands) ? manifest.commands : [];
  const manifestCmds = new Set(
    commandList
      .filter((ref) => typeof ref === 'string')
      .map((ref) =>
        normalizeRef(ref)
          .replace(/^commands\//, '')
          .replace(/\.md$/, '')
      )
  );

  for (const cmd of claudeCmds) {
    if (!manifestCmds.has(cmd)) {
      errors.push(
        `CLAUDE.md lists distributed command "/${cmd}" but .claude-plugin/plugin.json ` +
          'commands[] does not register it (#1451 manual-sync drift)'
      );
    }
  }
  for (const cmd of manifestCmds) {
    if (!claudeCmds.has(cmd)) {
      errors.push(
        `.claude-plugin/plugin.json registers command "${cmd}" but CLAUDE.md's ` +
          '"Details: distributed commands (...)" list omits it (#1451 manual-sync drift)'
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Runtime Adapter Invariants RA-1 / RA-2 (ADR-009 D3)
//
// ADR-009 (docs/adr/009-plugin-first-product-and-runtime-contract.md) defines
// four invariants. RA-3 (checkCrossManifestParity) and RA-4 (version sync) were
// already mechanized above; RA-1 and RA-2 are added here (#2027).
//
//   RA-1  `.claude/**` / `.codex/**` / the two plugin manifests do not define
//         the canonical form of Review Judgment.
//   RA-2  Every entity path a manifest references lives under a host-neutral
//         top-level directory and never under `.claude/**` or `.codex/**`.
// ---------------------------------------------------------------------------

/**
 * RA-1 enforcement stage, introduced off → observe → active (#2027).
 *
 * `observe` carried the rollout while violations remained. Both were then
 * dispositioned: the gate vocabulary was narrowed to the product gate, which
 * put the `.claude/commands/**` work-procedure verdicts out of scope, and
 * `.claude/rules/review-core.md` gained the `src/lib/finding-factory.mjs`
 * source line that satisfies the D3-3 exclusion. With the repository at zero
 * RA-1 findings, the check is `active`: a new violation fails
 * `npm run plugin:validate`.
 *
 * The inventory that records how each violation was dispositioned is
 * docs/development/ra1-runtime-adapter-inventory.md.
 *
 * @type {'off' | 'observe' | 'active'}
 */
export const RA1_ENFORCEMENT = 'active';

/**
 * Where a RA-1 finding goes for a given enforcement stage: `null` (not run),
 * `observations` (reported, exit code unchanged) or `errors` (fails the run).
 *
 * Exported so the routing is testable on its own — the repository has no RA-1
 * violation to exercise it with, so a test that only ran the validator could
 * not tell `observe` from `active`.
 *
 * @param {'off' | 'observe' | 'active'} enforcement
 * @returns {null | 'observations' | 'errors'}
 */
export function ra1Sink(enforcement) {
  if (enforcement === 'off') return null;
  return enforcement === 'active' ? 'errors' : 'observations';
}

/**
 * RA-1 target path set (ADR-009 D3-3 項番 1). Enumerated through `git ls-files`
 * — never `find` — because agent worktrees put a full checkout under
 * `.claude/worktrees/**`; those copies are gitignored and must stay out of the
 * target set.
 */
export const RA1_TARGET_PATHSPECS = [
  '.claude/**',
  '.codex/**',
  '.claude-plugin/*.json',
  '.codex-plugin/*.json',
];

/**
 * SSoT locations a host-local file may derive from (ADR-009 D3-3 項番 3).
 * Exact paths plus directory prefixes.
 */
/**
 * Largest RA-1 target file that is scanned. Anything larger is reported as an
 * error rather than read (ADR-009 D3-3 fail-safe). The largest current target
 * is far below this, so the cap only ever fires on a deliberately oversized
 * file (#2050 review, minor).
 */
export const RA1_MAX_TARGET_BYTES = 1024 * 1024;

export const RA1_SSOT_PATHS = ['pages/reference/review-policy.md', 'docs/review/output-format.md'];
export const RA1_SSOT_PREFIXES = ['skills/', 'src/lib/'];

/**
 * One path segment of an SSoT directory reference, excluding the `..`
 * segment. `[\w./-]+` accepted `skills/../../../../etc/passwd`, which
 * `loadSsotContents` then read through `path.join(ROOT, ref)` — an
 * arbitrary-file read reachable from a fork PR (#2050 review, major 1).
 */
const SSOT_PATH_SEGMENT = '(?!\\.\\.(?:/|$))[\\w.-]+';
const ssotDirPattern = (prefix) => `${prefix}(?:${SSOT_PATH_SEGMENT}/)*${SSOT_PATH_SEGMENT}`;

/**
 * Source of {@link SSOT_REFERENCE_RE}. Exported so the two traversal defences
 * can be pinned separately: with only `isContainedSsotPath` under test, the
 * regex could silently regress back to `[\w./-]+` and every test would still
 * pass (verified by mutation, #2050 review major 1).
 */
export const SSOT_REFERENCE_PATTERN = [
  'pages/reference/review-policy(?:\\.en)?\\.md',
  'docs/review/output-format\\.md',
  ssotDirPattern('skills/'),
  ssotDirPattern('src/lib/'),
].join('|');

const SSOT_REFERENCE_RE = new RegExp(SSOT_REFERENCE_PATTERN, 'g');

/**
 * Normalize a repo-relative reference to a posix path with `.`/`..` resolved.
 *
 * Shared by RA-2's escape check and RA-1's SSoT containment check so the two
 * cannot drift (CLAUDE.md "Import the SSoT, never re-derive it").
 */
function toNormalizedRepoPath(ref) {
  return path.posix.normalize(
    normalizeRef(String(ref ?? ''))
      .split(path.win32.sep)
      .join('/')
  );
}

/** Does an already-normalized posix path leave the repository root? */
function escapesRepoRoot(rel) {
  return rel.startsWith('../') || rel === '..' || path.posix.isAbsolute(rel);
}

/**
 * Is `ref` a D3-3 SSoT path that stays inside the repository?
 *
 * Containment is checked on the **normalized** path, so a reference is only
 * loadable when what it actually resolves to is still in the SSoT set. This is
 * the second half of the traversal fix: the regex refuses to produce a `..`
 * reference, and this predicate refuses to read one even if some other code
 * path produces it (#2050 review, major 1).
 *
 * Pure function.
 *
 * @param {string} ref
 * @returns {boolean}
 */
export function isContainedSsotPath(ref) {
  const rel = toNormalizedRepoPath(ref);
  if (rel === '' || escapesRepoRoot(rel)) return false;
  return RA1_SSOT_PATHS.includes(rel) || RA1_SSOT_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

/**
 * Collect the SSoT paths a host-local file points at. Only paths inside the
 * D3-3 SSoT set count; a reference to any other document (for example
 * `docs/governance.md`) is not an SSoT reference for RA-1 purposes.
 *
 * Pure function.
 *
 * @param {string} content
 * @returns {string[]} repo-relative paths, de-duplicated
 */
export function findSsotReferences(content) {
  const hits = String(content ?? '').match(SSOT_REFERENCE_RE) || [];
  return [...new Set(hits.filter((p) => isContainedSsotPath(p)))];
}

/**
 * Strip inline-emphasis punctuation from a markdown table cell or label so that
 * `` `blocker` `` and `**MERGE_OK**` normalize to their bare token. Without
 * this, an author who merely backticks a cell slips past the detector while
 * changing nothing about the content (#2050 review, major 2).
 */
function stripInlineMarkup(value) {
  let out = String(value ?? '')
    .replace(/[`*~]/g, '')
    .trim();
  // `_` is emphasis only when it wraps the whole span; inside a token it is
  // part of the token (`MERGE_OK` must not become `MERGEOK`).
  while (/^_{1,2}[^_].*[^_]_{1,2}$/.test(out) || /^_{1,2}[^_]_{1,2}$/.test(out)) {
    out = out
      .replace(/^_{1,2}/, '')
      .replace(/_{1,2}$/, '')
      .trim();
  }
  return out;
}

/**
 * Split a markdown table row into its cells, or null when the line is not a
 * table row. Accepts any cell count of 2 or more: pinning the row to exactly
 * two cells let a third "備考" column disable the rule (#2050 review, major 2).
 * Full-width `｜` is accepted alongside `|`.
 */
function tableRowCells(line) {
  const raw = String(line ?? '');
  if (!/^\s*[|｜]/.test(raw)) return null;
  const cells = raw
    .trim()
    .replace(/^[|｜]/, '')
    .replace(/[|｜]\s*$/, '')
    .split(/[|｜]/)
    .map((c) => stripInlineMarkup(c));
  if (cells.length < 2) return null;
  if (cells.every((c) => c === '' || /^:?-+:?$/.test(c))) return null; // separator row
  return cells;
}

/**
 * Fail-safe output severity. `normalizeSeverity` maps every unrecognized input
 * to one value; asking it is how that value is obtained, so this module holds
 * no severity literal of its own (CLAUDE.md "Import the SSoT, never re-derive
 * it"; #2050 review, minor 3).
 */
const FAILSAFE_SEVERITY = normalizeSeverity('__not-a-severity-token__');

/**
 * Is `token` an INTERNAL severity token — one the SSoT renames on the way out?
 *
 * This is what makes a table look like *the* internal→output mapping rather
 * than some other two-column table of words. Two conditions, both asked of
 * `normalizeSeverity` so no vocabulary is restated here (CLAUDE.md "Import the
 * SSoT, never re-derive it"; `FINDING_SEVERITIES` is not exported, and
 * `src/lib/**` is out of scope for this change):
 *
 *  - its image differs from itself, so an OUTPUT token (`critical`, `major`,
 *    `minor`, `info` — the fixed points) is not an anchor;
 *  - its image is not `FAILSAFE_SEVERITY`, so an unknown word is not one either.
 *
 * Anchors are therefore exactly `blocker` and `nit`. The test is one-sided:
 * `warning` maps to the fail-safe value and so cannot anchor a block — that is
 * fine, because this decides only whether the BLOCK is the severity map. Once
 * a block is anchored, every candidate row in it (the `warning` row included)
 * is direction-checked.
 *
 * Requiring an internal token is load-bearing (#2063 review, major 3). Without
 * the fixed-point half, `| minor | info |` + `| major | critical |` (an
 * incident-grade table) and `| critical | major |` + `| trace | info |` (a log
 * level table) both anchored, then failed the direction check — a false
 * positive that would have failed `Meta consistency` for every PR the moment
 * such a table appeared under `.claude/**`.
 */
function isInternalSeverityToken(token) {
  const image = normalizeSeverity(token);
  return image !== String(token).toLowerCase().trim() && image !== FAILSAFE_SEVERITY;
}

/**
 * `[a, b]` read as a candidate row of the internal→output severity mapping, or
 * `null` when the pair cannot be one.
 *
 * Direction is deliberately NOT a condition of candidacy (#2058). It used to
 * be: a row only counted when `normalizeSeverity(left) === right`, so
 * reversing the table (`blocker → minor`, `nit → critical`) produced no
 * detection at all and the drift passed RA-1 silently. Candidacy is now a
 * shape test, and agreement with the SSoT is checked by the D3-3 exclusion
 * (`isExcusedByVerbatimSsot`), which is what turns a mis-directed row into a
 * violation.
 *
 * The left cell must be a single ASCII lowercase word. This is what keeps the
 * `| (なし) | info |` row of `.claude/rules/review-core.md` out of the rule:
 * `(なし)` is prose meaning "no internal token maps here", not a vocabulary
 * token, and asking `normalizeSeverity` about it would return the fail-safe
 * value and manufacture a direction mismatch that does not exist.
 */
function severityMappingPair(a, b) {
  const left = String(a).toLowerCase();
  const right = String(b).toLowerCase();
  if (left === right) return null;
  if (!/^[a-z]+$/.test(left) || !/^[a-z]+$/.test(right)) return null;
  // `right` must be an output-vocabulary token (a fixed point of the mapping).
  if (normalizeSeverity(right) !== right) return null;
  // The original cells are returned so the reported `text` stays faithful to
  // the source line; every consumer lowercases what it compares.
  return [a, b];
}

/**
 * Verdict tokens the gate rule recognizes: exactly River Review's product gate
 * vocabulary, imported from `src/lib/gate-decision.mjs` (`GATE_DECISIONS`)
 * rather than restated.
 *
 * The scope is deliberately this narrow. `.claude/commands/**` define their own
 * verdicts (`MERGE_OK`, `SAFE`, `PASS`, `REGISTERED` …), but those judge a
 * repository work procedure, not a review: they live in a different namespace
 * from the product gate and are therefore not Review Judgment under ADR-009 D3
 * (#2050, user decision 1). Restricting the vocabulary to the product gate also
 * removes the false positives a SCREAMING_CASE shape rule produced — `CLAUDE`,
 * `AGENTS`, `JSON` and `HTTP` headings were read as gate verdicts (#2050
 * review, major 3). One change answers both.
 *
 * Note: ADR-009 D7-4 counts `.claude/commands/merge-check.md` as a D3
 * violation, which is what this scope decided against. That prose is no longer
 * stale: the postscript at the end of ADR-009 D7 records this scope as the
 * decision that was taken (#2059).
 *
 * This narrows the VOCABULARY only. `.claude/commands/**` stays in
 * `RA1_TARGET_PATHSPECS`: a file there that defines a product gate verdict
 * (`GO`, `NO_GO`, …) with no D3-3 SSoT reference is still a violation.
 */
const VERDICT_ALLOWLIST = new Set(GATE_DECISIONS);

/** Leading enumerator of a label: `A.`, `1.`, `B)` … */
const ENUMERATOR_RE = /^(?:[A-Za-z0-9]{1,3}[.)]\s+)+/;
/** What may follow a verdict in subject position: nothing, or a separator. */
const AFTER_VERDICT_RE = /^\s*(?:[-—–:：/|]|$)/;

/**
 * The verdict token a label carries in **subject position**, or null.
 *
 * Subject position means the label — after an optional enumerator — begins with
 * the token, and the token is followed by end-of-label or a separator. Without
 * that constraint a heading that merely mentions a verdict in a sentence
 * (`## ESCALATE 判定の運用`) reads as a definition of it.
 */
function verdictOf(label) {
  const text = stripInlineMarkup(label).replace(ENUMERATOR_RE, '');
  const match = /^[A-Z][A-Z0-9_]*/.exec(text);
  if (!match) return null;
  const token = match[0];
  if (!AFTER_VERDICT_RE.test(text.slice(token.length))) return null;
  return VERDICT_ALLOWLIST.has(token) ? token : null;
}

/**
 * A "条件:" style line. List markers, emphasis and alternative lead-ins are
 * accepted: `- 条件:` and `**成立要件**:` are the same statement as `条件:`
 * (#2050 review, major 2).
 */
const CONDITION_LINE_RE =
  /^\s*(?:[-*+]\s+|\d+[.)]\s+)?[`*_~]*(?:条件|判定条件|成立要件|判定基準|Conditions?)[`*_~]*\s*[:：]/;
const COMPLETION_HEADING_RE = /完了(?:条件|判定|基準)|[Cc]ompletion criteri/;
/**
 * finding evidence requirement: the three ideas on one line.
 *
 * `\b` creates no boundary between CJK characters, so a `\b指摘\b` branch can
 * never match Japanese prose — the rule was silently English-only even though
 * `.claude/**` is mostly Japanese (#2050 re-review, major 1). ASCII words keep
 * an explicit boundary; `指摘` needs none — do NOT reintroduce `\b` around it.
 *
 * The three ideas are three independent `.test()` calls, not three `.*`
 * lookaheads inside one unanchored pattern. The lookahead form was quadratic on
 * a line that never satisfies the last idea (measured on Node 22.22.2: 10KB →
 * 137ms, 40KB → 2068ms, 100KB → 12958ms), so one ~700KB file under
 * `.claude/**` could time the `Meta consistency` job out
 * (`timeout-minutes: 10`) from a fork PR (#2050 review, major 2). The meaning
 * is unchanged: all three must occur somewhere on the same line.
 */
const EVIDENCE_FINDING_RE = /(?<![A-Za-z0-9_])findings?(?![A-Za-z0-9_])|指摘/i;
const EVIDENCE_TRACE_RE = /証跡|evidence/i;
const EVIDENCE_OBLIGATION_RE = /必須|必ず|MUST|required/i;

/** Do the three finding-evidence ideas all occur on one line? Linear in line length. */
function hasEvidenceRequirement(line) {
  return (
    EVIDENCE_FINDING_RE.test(line) &&
    EVIDENCE_TRACE_RE.test(line) &&
    EVIDENCE_OBLIGATION_RE.test(line)
  );
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
/** A list item or a stand-alone emphasized label — both act as verdict anchors. */
const LIST_ITEM_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)$/;
const BOLD_LABEL_RE = /^\s*(?:\*\*|__)([^*_]+)(?:\*\*|__)\s*[-—:：]?\s*(.*)$/;

/** Lines of the section a heading at `index` opens (until the next same/higher heading). */
function sectionLines(lines, index, level) {
  const out = [];
  for (let i = index + 1; i < lines.length; i += 1) {
    const h = HEADING_RE.exec(lines[i]);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out;
}

/**
 * Lines that belong to a non-heading anchor at `index`: everything up to the
 * next heading or the next verdict anchor, capped so an anchor cannot claim an
 * unrelated condition line far below it.
 */
const ANCHOR_WINDOW = 8;
function anchorWindowLines(lines, index, isAnchor) {
  const out = [];
  const end = Math.min(lines.length, index + 1 + ANCHOR_WINDOW);
  for (let i = index + 1; i < end; i += 1) {
    if (HEADING_RE.test(lines[i])) break;
    if (isAnchor(i)) break;
    out.push(lines[i]);
  }
  return out;
}

/**
 * Detect Review Judgment definitions that ADR-009 D3-2 forbids a runtime
 * adapter file from carrying. Four rules, one per forbidden class:
 *
 *  - `severity-vocabulary-map`   severity 語彙の対応表
 *  - `gate-decision-condition`   gate / decision の判定条件
 *  - `completion-condition`      completion の判定条件
 *  - `finding-evidence-requirement`  finding の証跡要件
 *
 * A severity table is only reported when it has at least two candidate mapping
 * rows and at least one row whose *left* token is an INTERNAL severity token
 * (`isInternalSeverityToken`). `normalizeSeverity` maps unknown input to the
 * fail-safe value, so `| something | major |` rows alone are not evidence of a
 * duplicated mapping; and a left cell that is itself an output token means the
 * table maps something else (incident grades, log levels), not this mapping.
 * The two-row floor keeps a one-line glossary entry out of the rule (#2050
 * review, minor 2).
 *
 * Candidacy no longer requires the row to agree with `normalizeSeverity`
 * (#2058); whether it agrees is decided by the D3-3 exclusion.
 *
 * Each hit carries `verbatimTarget`, naming which half of it the D3-3 exclusion
 * must find in the SSoT: `terms` for the severity rule (the vocabulary itself
 * is what gets duplicated) and `text` for every rule whose duplicated content
 * is a condition sentence (#2050 review, major 1).
 *
 * Pure function.
 *
 * @param {string} content
 * @returns {{rule: string, line: number, term: string, text: string, verbatimTarget: 'terms'|'text'}[]}
 */
export function detectReviewJudgmentDefinitions(content) {
  const lines = String(content ?? '').split('\n');
  const findings = [];

  // --- Rule 1: severity vocabulary mapping table ---
  let block = null;
  const flushBlock = () => {
    if (!block) return;
    const anchors = block.rows.filter(([a]) => isInternalSeverityToken(a));
    if (block.rows.length >= 2 && anchors.length >= 1) {
      findings.push({
        rule: 'severity-vocabulary-map',
        line: block.start,
        term: block.rows.map(([a, b]) => `${a.toLowerCase()}→${b.toLowerCase()}`).join(', '),
        text: block.rows.map(([a, b]) => `| ${a} | ${b} |`).join(' '),
        verbatimTarget: 'terms',
      });
    }
    block = null;
  };
  lines.forEach((line, i) => {
    const cells = tableRowCells(line);
    if (!cells) {
      if (!/^\s*[|｜]/.test(line)) flushBlock();
      return;
    }
    // Any adjacent cell pair may carry the mapping, so a third column does not
    // hide it.
    let pair = null;
    for (let c = 0; c + 1 < cells.length && !pair; c += 1) {
      pair = severityMappingPair(cells[c], cells[c + 1]);
    }
    if (!pair) return;
    if (!block) block = { start: i + 1, rows: [] };
    block.rows.push(pair);
  });
  flushBlock();

  // --- Rules 2 & 3: gate / decision and completion conditions ---
  // A verdict may be labelled by a heading, a list item, a bold label or a
  // table cell; all four are scanned (#2050 review, major 2).
  const labelsOf = (line) => {
    const labels = [];
    const heading = HEADING_RE.exec(line);
    if (heading) labels.push(heading[2]);
    const item = LIST_ITEM_RE.exec(line);
    if (item) labels.push(item[1]);
    const bold = BOLD_LABEL_RE.exec(line);
    if (bold) labels.push(bold[1]);
    const cells = tableRowCells(line);
    if (cells) labels.push(cells[0]);
    if (labels.length === 0) labels.push(line);
    return labels;
  };
  const verdictAt = (i) => {
    for (const label of labelsOf(lines[i])) {
      const verdict = verdictOf(label);
      if (verdict) return verdict;
    }
    return null;
  };
  const isVerdictAnchor = (i) => verdictAt(i) !== null;

  lines.forEach((line, i) => {
    const heading = HEADING_RE.exec(line);
    const verdict = verdictAt(i);
    const cells = tableRowCells(line);

    // Table form: `| MERGE_OK | すべての必須チェックが pass |` — the row is both
    // the anchor and the condition.
    if (verdict && cells && cells.length >= 2 && verdictOf(cells[0]) === verdict) {
      const condition = cells.slice(1).find((c) => c !== '' && !/^:?-+:?$/.test(c));
      if (condition) {
        findings.push({
          rule: 'gate-decision-condition',
          line: i + 1,
          term: verdict,
          text: condition,
          verbatimTarget: 'text',
        });
        return;
      }
    }

    const body = heading
      ? sectionLines(lines, i, heading[1].length)
      : verdict
        ? anchorWindowLines(lines, i, isVerdictAnchor)
        : null;
    if (!body) return;
    const conditionLine = body.find((l) => CONDITION_LINE_RE.test(l));
    if (!conditionLine) return;

    if (verdict) {
      findings.push({
        rule: 'gate-decision-condition',
        line: i + 1,
        term: verdict,
        text: conditionLine.trim(),
        verbatimTarget: 'text',
      });
      return;
    }
    if (heading && COMPLETION_HEADING_RE.test(heading[2])) {
      findings.push({
        rule: 'completion-condition',
        line: i + 1,
        term: heading[2].trim(),
        text: conditionLine.trim(),
        verbatimTarget: 'text',
      });
    }
  });

  // --- Rule 4: finding evidence requirement ---
  lines.forEach((line, i) => {
    if (!hasEvidenceRequirement(line)) return;
    findings.push({
      rule: 'finding-evidence-requirement',
      line: i + 1,
      term: 'finding evidence',
      text: line.trim(),
      verbatimTarget: 'text',
    });
  });

  return findings;
}

/** Whitespace-insensitive verbatim containment. */
function containsVerbatimText(haystack, needle) {
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const n = norm(needle);
  return n !== '' && norm(haystack).includes(n);
}

/**
 * Whole-word containment — `BLOCKED` must not match inside `UNBLOCKED_BY`.
 *
 * **Case-sensitive on purpose, and load-bearing.** The internal severity
 * vocabulary is lowercase (`blocker` / `warning` / `nit`), and the prose SSoT
 * documents spell the display form with a capital (`Blocker`). Matching
 * case-insensitively would let a document that only ever writes `Blocker` in
 * a prose heading excuse a lowercase mapping table it never defines. The RA-1
 * inventory's "SSoT 3 本に `blocker` は現れない" evidence rests on this: the
 * same corpus answers 1 to `grep -ic blocker` for two of those files
 * (#2050 review, doc 4). `tests/validate-plugin-manifest.test.mjs` pins it.
 */
function containsWord(haystack, word) {
  const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escaped === '') return false;
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(String(haystack));
}

/**
 * The D3-3 項番 3 exclusion, applied to one detection.
 *
 * ADR-009 requires that the **duplicated definition** exist verbatim in the
 * referenced SSoT. Which half of a hit is "the definition" depends on the rule:
 *
 *  - `terms` (severity rule) — the vocabulary mapping itself is the duplicated
 *    definition, so two things must hold. First, the mapping must agree with
 *    `normalizeSeverity` **row by row**: a table may only restate the SSoT, so
 *    a row pointing the other way (`blocker → minor`) is not a derived copy of
 *    anything and can never be excused (#2058). Checking only that the six
 *    tokens exist left the table's *content* unguarded — reversing it kept
 *    RA-1 green. Second, each token must appear in the SSoT as a whole word.
 *    Substring matching is not enough: `BLOCKED` occurs inside
 *    `PROMPT_AB_UNBLOCKED_BY`, which would have excused an unrelated file that
 *    merely names a `src/lib/**` path (#2050 review, major 1).
 *  - `text` (gate / completion / evidence rules) — the condition sentence is
 *    the duplicated definition. Matching the bare verdict token instead let any
 *    file be excused by naming any `src/lib/**` file that happens to contain
 *    that word.
 *
 * Pure function.
 *
 * `reason`, when present, is the complete `why` clause of the violation and
 * replaces the caller's default wording: a direction mismatch is not a
 * "missing from the SSoT" problem and must not be reported as one.
 *
 * @param {{term: string, text: string, verbatimTarget?: 'terms'|'text'}} hit
 * @param {string[]} corpus contents of the SSoT files the file references
 * @returns {{verbatim: boolean, subject: string, reason?: string}}
 */
export function isExcusedByVerbatimSsot(hit, corpus) {
  if (hit.verbatimTarget === 'terms') {
    const subject = `the severity mapping "${hit.term}"`;
    // `term` is emitted by detectReviewJudgmentDefinitions as
    // `left→right, left→right, …` over `[a-z]+` tokens, so it parses back
    // unambiguously into the rows that were detected.
    const pairs = String(hit.term)
      .split(',')
      .map((row) => row.split('→').map((t) => t.trim()))
      .filter((p) => p.length === 2 && p[0] && p[1]);
    const wrong = pairs.filter(([left, right]) => normalizeSeverity(left) !== right);
    if (pairs.length === 0 || wrong.length > 0) {
      const detail = wrong
        .map(([left, right]) => `${left}→${right} (SSoT: ${left}→${normalizeSeverity(left)})`)
        .join(', ');
      return {
        verbatim: false,
        subject,
        reason:
          `${subject} disagrees with normalizeSeverity() in src/lib/finding-factory.mjs` +
          (detail ? `: ${detail}` : ''),
      };
    }
    if (!Array.isArray(corpus) || corpus.length === 0) return { verbatim: false, subject };
    const terms = pairs.flat();
    const verbatim = terms.every((t) => corpus.some((c) => containsWord(c, t)));
    return { verbatim, subject };
  }
  if (!Array.isArray(corpus) || corpus.length === 0) {
    return { verbatim: false, subject: `"${hit.term}"` };
  }
  const verbatim = corpus.some((c) => containsVerbatimText(c, hit.text));
  return { verbatim, subject: `the condition text of "${hit.term}"` };
}

/**
 * RA-1: no runtime adapter file defines the canonical form of Review Judgment.
 *
 * A detected definition is excused only when BOTH halves of the D3-3 exclusion
 * hold: the same file references a D3-3 SSoT, AND the duplicated wording exists
 * verbatim in one of the referenced SSoT files. A reference without a verbatim
 * match is a violation — that is exactly the `.claude/rules/review-core.md`
 * case ADR-009 D7-2 records.
 *
 * Pure function; `files` and `ssotContents` are injected so the caller owns all
 * I/O.
 *
 * @param {{path: string, content: string}[]} files
 * @param {Map<string, string>} ssotContents repo-relative path → file content
 * @returns {string[]} violation strings (empty = pass)
 */
export function checkReviewJudgmentDuplication(files, ssotContents = new Map()) {
  const violations = [];
  for (const file of files) {
    const hits = detectReviewJudgmentDefinitions(file.content);
    if (hits.length === 0) continue;
    const refs = findSsotReferences(file.content);
    const corpus = refs.map((ref) => ssotContents.get(ref) ?? '').filter(Boolean);
    for (const hit of hits) {
      const { verbatim, subject, reason } = isExcusedByVerbatimSsot(hit, corpus);
      if (verbatim) continue;
      const why =
        reason ??
        (refs.length === 0
          ? 'the file declares no ADR-009 D3-3 SSoT reference'
          : `${subject} is not present verbatim in the referenced SSoT (${refs.join(', ')})`);
      violations.push(
        `RA-1 ${file.path}:${hit.line}: ${hit.rule} — ${why}. ` +
          `Move the definition to skills/**, schemas/**, or an SSoT document and keep only a ` +
          `pointer here (ADR-009 D3/D4). Found: ${hit.text.slice(0, 120)}`
      );
    }
  }
  return violations;
}

/** Host-neutral top-level directories a manifest reference may point at (RA-2). */
export const RA2_ALLOWED_REF_PREFIXES = ['commands/', 'agents/', 'skills/', 'assets/'];

/** Collect every entity path the two manifests reference. */
function manifestRefs(ccManifest, codexManifest) {
  const refs = [];
  const push = (field, value) => {
    if (typeof value === 'string') refs.push([field, value]);
    else if (Array.isArray(value))
      for (const v of value) if (typeof v === 'string') refs.push([field, v]);
  };
  const cc = ccManifest && typeof ccManifest === 'object' ? ccManifest : {};
  const codex = codexManifest && typeof codexManifest === 'object' ? codexManifest : {};
  push('.claude-plugin commands', cc.commands);
  push('.claude-plugin agents', cc.agents);
  push('.claude-plugin skills', cc.skills);
  push('.claude-plugin hooks', cc.hooks);
  push('.claude-plugin composerIcon', cc.composerIcon);
  push('.codex-plugin skills', codex.skills);
  if (codex.interface && typeof codex.interface === 'object') {
    push('.codex-plugin interface.composerIcon', codex.interface.composerIcon);
  }
  return refs;
}

/**
 * RA-2: every manifest reference resolves to a host-neutral top-level
 * directory and never into a host-local development directory.
 *
 * Current state is compliant (ADR-009 Context), so this check is active from
 * the start — it pins the compliance rather than reporting a backlog.
 *
 * Pure function; returns array of error strings (empty = pass).
 */
export function checkManifestHostIndependentRefs(ccManifest, codexManifest) {
  const errors = [];
  for (const [field, ref] of manifestRefs(ccManifest, codexManifest)) {
    // Resolve `..` before judging: `skills/../../etc/passwd` starts with an
    // allowed prefix but leaves the top-level set (#2050 review, minor 4).
    const rel = toNormalizedRepoPath(ref);
    if (escapesRepoRoot(rel)) {
      errors.push(
        `RA-2 ${field}: "${ref}" escapes the repository root once normalized ("${rel}") — ` +
          `ADR-009 D3 RA-2`
      );
      continue;
    }
    if (/(?:^|\/)\.(?:claude|codex)\//.test(rel)) {
      errors.push(
        `RA-2 ${field}: "${ref}" points into a host-local directory. Manifests must reference ` +
          `host-neutral top-level assets only (ADR-009 D3 RA-2 / D4)`
      );
      continue;
    }
    if (!RA2_ALLOWED_REF_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      errors.push(
        `RA-2 ${field}: "${ref}" is outside the host-neutral top-level set ` +
          `(${RA2_ALLOWED_REF_PREFIXES.join(' ')}) — ADR-009 D3 RA-2`
      );
    }
  }
  return errors;
}

/**
 * Enumerate the RA-1 target files through `git ls-files` and read them.
 * Returns `{files, error}`; a git failure yields `error` so the caller can
 * fail-safe (ADR-009 D3-3: 判定不能な場合は違反として扱う).
 */
async function loadRuntimeAdapterFiles() {
  let paths;
  try {
    paths = listTrackedPaths(ROOT, RA1_TARGET_PATHSPECS, { maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    return {
      files: [],
      error: `RA-1: could not enumerate targets via git ls-files (${err.message})`,
    };
  }
  const files = [];
  for (const rel of paths) {
    const abs = path.join(ROOT, rel);
    try {
      // `lstat` (not `stat`) so a symlink is judged as a symlink. Only regular
      // files are scanned: a symlink or a gitlink is not adapter content, and
      // following one would read outside the target set. The size cap bounds
      // per-line scanning work — every rule here is linear per line, but a
      // pathological single-line file is still attacker-controlled input that
      // the `Meta consistency` job has to finish inside its timeout
      // (#2050 review, minor).
      //
      // The enumeration and this classification are shared with
      // scripts/check-control-characters.mjs via scripts/lib/tracked-file-targets.mjs
      // (CLAUDE.md "Import the SSoT, never re-derive it").
      const target = classifyTrackedTarget(abs, RA1_MAX_TARGET_BYTES);
      if (target.kind === 'skip') continue;
      if (target.kind === 'oversize') {
        return {
          files: [],
          error:
            `RA-1: target ${rel} is ${target.size} bytes, over the ${RA1_MAX_TARGET_BYTES}-byte ` +
            `scan limit — split the file or move the content out of the RA-1 target set ` +
            `(ADR-009 D3-3: 判定不能な場合は違反として扱う)`,
        };
      }
      files.push({ path: rel, content: await fs.readFile(abs, 'utf8') });
    } catch (err) {
      return { files: [], error: `RA-1: could not read target ${rel} (${err.message})` };
    }
  }
  return { files, error: null };
}

/**
 * Read the D3-3 SSoT files a target set references.
 *
 * `root` is injectable so the guards below can be exercised against a fixture
 * tree; production always uses the repository ROOT.
 */
export async function loadSsotContents(files, root = ROOT) {
  const wanted = new Set();
  for (const file of files) for (const ref of findSsotReferences(file.content)) wanted.add(ref);
  const map = new Map();
  for (const ref of wanted) {
    // Containment before I/O. `findSsotReferences` already refuses to emit a
    // `..` reference, but this read is the thing that would leak an arbitrary
    // file, so the check sits here too rather than only upstream
    // (#2050 review, major 1).
    if (!isContainedSsotPath(ref)) continue;
    try {
      const abs = path.join(root, ref);
      // Containment is about the *path*; this is about the *file*. `readFile`
      // follows symlinks, so a contained reference such as `skills/x.md` can
      // still resolve to a character device or a file outside the repo. The
      // reference text lives in `.claude/**` (an RA-1 target, editable from a
      // fork PR) and the symlink can be committed in the same PR, so both
      // halves are attacker-controlled. Measured before this guard: a
      // reference pointing at a symlink to `/dev/zero` costs ~4.4 s and >250 MB
      // RSS per reference (`readFile(…, 'utf8')` throws `Invalid string length`
      // into the catch below), so ~137 of them exceed the `Meta consistency`
      // job's `timeout-minutes: 10`. Same guard, same helper as
      // `loadRuntimeAdapterFiles` (#2055 follow-up; the hole predates it).
      const target = classifyTrackedTarget(abs, RA1_MAX_TARGET_BYTES);
      if (target.kind !== 'file') continue;
      map.set(ref, await fs.readFile(abs, 'utf8'));
    } catch {
      // A reference that does not resolve contributes no verbatim evidence,
      // which keeps the fail-safe on the violation side.
    }
  }
  return map;
}

/** Convention path Claude Code loads automatically, with or without a manifest `hooks` field. */
export const PLUGIN_HOOKS_CONVENTION_PATH = 'hooks/hooks.json';

const CLAUDE_PLUGIN_ROOT_PREFIX = '${CLAUDE_PLUGIN_ROOT}/';

/**
 * Extract plugin-root references from the limited shell syntax accepted in hook
 * commands: bare tokens, single/double quoted tokens, and line-end comments.
 */
function extractPluginHookTargets(command) {
  const targets = [];
  let quote = null;
  // `#` opens a comment only at a token boundary. `x#y` is one word in shell, so
  // treating every unquoted `#` as a comment hid the rest of the command from the
  // check -- including root escapes (#2139 round 2). A comment ends at the newline,
  // and scanning resumes on the next line.
  let atTokenStart = true;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (!quote && char === '\\') {
      // Outside single quotes a backslash escapes the next character, so it is
      // part of the token rather than a separator.
      index += 1;
      atTokenStart = false;
      continue;
    }

    if (!quote && char === '#' && atTokenStart) {
      while (index < command.length && command[index] !== '\n') index += 1;
      atTokenStart = true;
      continue;
    }

    if (command.startsWith(CLAUDE_PLUGIN_ROOT_PREFIX, index)) {
      const targetStart = index + CLAUDE_PLUGIN_ROOT_PREFIX.length;
      let cursor = targetStart;
      let target = '';
      while (cursor < command.length) {
        const cur = command[cursor];
        if (quote === "'") {
          if (cur === "'") break;
        } else if (cur === '\\' && cursor + 1 < command.length) {
          // Both inside double quotes and unquoted, the escaped character is
          // literal. Store the character, not the backslash.
          target += command[cursor + 1];
          cursor += 2;
          continue;
        } else if (quote === '"') {
          if (cur === '"') break;
        } else if (/[\s"']/.test(cur)) {
          // `#` is not a separator inside a word: `a.sh#suffix` is one shell token,
          // and treating it as one let a missing target slip through (#2139 round 3).
          // Only the token-boundary `#` handled above opens a comment.
          break;
        }
        target += cur;
        cursor += 1;
      }
      targets.push(target);
      index = cursor - 1;
      atTokenStart = false;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      atTokenStart = false;
    } else if (char === '"' || char === "'") {
      quote = char;
      atTokenStart = false;
    } else {
      atTokenStart = /\s/.test(char);
    }
  }

  return targets;
}

/**
 * Verify that every `${CLAUDE_PLUGIN_ROOT}/<path>` command target referenced
 * from the plugin's hooks files exists under `root`.
 *
 * Which hooks files are read follows the Claude Code loader, not only the
 * manifest: the loader always reads `hooks/hooks.json` when it exists and
 * treats `manifest.hooks` as *additional* files (a manifest entry that resolves
 * to the convention file is reported by the loader as a duplicate — "manifest.hooks
 * should only reference additional hook files", claude 2.1.261). So the check
 * runs on the convention path whenever it exists, plus each declared string
 * path, each file at most once. A repository with neither is a no-op.
 *
 * `root` is a parameter (default: repository ROOT) so fixtures can exercise the
 * three shapes without pinning the real repository.
 */
export async function checkPluginHooksScripts(ccManifest, { root = ROOT } = {}) {
  const errors = [];
  const cc = ccManifest && typeof ccManifest === 'object' ? ccManifest : {};
  const resolvedRoot = path.resolve(root);
  // A root that does not exist is not an error here: the caller may point at a
  // plugin directory that was never created, and the checks below report that
  // through "does not exist" rather than throwing. Keep the pre-#2132 contract.
  const realRoot = await fs.realpath(resolvedRoot).catch(() => resolvedRoot);
  const isUnderRoot = (candidate, base) => {
    const relative = path.relative(base, candidate);
    return (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  const exists = async (rel) => {
    try {
      await fs.access(path.join(root, rel));
      return true;
    } catch {
      return false;
    }
  };

  // label → repo-relative path; label keeps the manifest spelling for messages.
  const targets = new Map();
  if (await exists(PLUGIN_HOOKS_CONVENTION_PATH)) {
    targets.set(PLUGIN_HOOKS_CONVENTION_PATH, PLUGIN_HOOKS_CONVENTION_PATH);
  }
  const declared = Array.isArray(cc.hooks) ? cc.hooks : [cc.hooks];
  for (const ref of declared) {
    if (typeof ref !== 'string') continue;
    const rel = normalizeRef(ref);
    if (rel === PLUGIN_HOOKS_CONVENTION_PATH || targets.has(ref)) continue;
    if (await exists(rel)) targets.set(ref, rel);
  }

  for (const [label, hooksRel] of targets) {
    let hooksDef;
    try {
      hooksDef = JSON.parse(await fs.readFile(path.join(root, hooksRel), 'utf8'));
    } catch {
      errors.push(`${label}: not valid JSON`);
      continue;
    }
    if (!hooksDef || !hooksDef.hooks || typeof hooksDef.hooks !== 'object') {
      errors.push(`${label}: "hooks" field is missing or not an object`);
      continue;
    }
    const commands = [];
    for (const matchers of Object.values(hooksDef.hooks)) {
      if (!Array.isArray(matchers)) continue;
      for (const matcher of matchers) {
        if (!matcher || !Array.isArray(matcher.hooks)) continue;
        for (const hook of matcher.hooks) {
          if (hook && hook.type === 'command' && typeof hook.command === 'string') {
            commands.push(hook.command);
          }
        }
      }
    }
    // Extract ${CLAUDE_PLUGIN_ROOT}/<path> targets and verify they exist.
    for (const command of commands) {
      for (const scriptRel of extractPluginHookTargets(command)) {
        const scriptPath = path.resolve(resolvedRoot, scriptRel);
        if (!isUnderRoot(scriptPath, resolvedRoot)) {
          errors.push(`${label}: hook command target escapes plugin root: ${scriptRel}`);
          continue;
        }
        try {
          const realScriptPath = await fs.realpath(scriptPath);
          if (!isUnderRoot(realScriptPath, realRoot)) {
            errors.push(`${label}: hook command target escapes plugin root: ${scriptRel}`);
          }
        } catch {
          errors.push(`${label}: hook command target does not exist: ${scriptRel}`);
        }
      }
    }
  }
  return errors;
}

/**
 * Validate the Claude Code + Codex plugin manifests and the marketplace
 * manifest against the repository:
 *  - every component path referenced by .claude-plugin/plugin.json exists
 *  - every on-disk distributed command/agent file is registered in the
 *    manifest (reverse drift; checkAssetRegistration)
 *  - .claude-plugin and .codex-plugin manifest versions match package.json
 *  - marketplace plugins[].name matches the plugin manifest name
 *  - the Codex manifest's skills path exists
 *  - the Codex manifest carries only allowlisted bundle fields and all
 *    listing-required fields (checkBundleFieldAllowlist)
 *  - shared fields not owned by plugin:sync match across both canonical
 *    manifests (checkCrossManifestParity)
 *  - manifest references stay host-neutral (RA-2;
 *    checkManifestHostIndependentRefs)
 *  - no runtime adapter file redefines Review Judgment (RA-1;
 *    checkReviewJudgmentDuplication) — routed to errors or to `warnings`
 *    according to `ra1Sink(RA1_ENFORCEMENT)`
 *
 * Returns array of error strings (empty = pass). Pass `{ warnings }` (an array)
 * to also collect non-failing observations.
 */
export async function validatePluginManifest({ warnings } = {}) {
  const errors = [];
  const observations = Array.isArray(warnings) ? warnings : [];

  const pkg = await readJson('package.json');
  const ccManifest = await readJson('.claude-plugin/plugin.json');
  const marketplace = await readJson('.claude-plugin/marketplace.json');

  // --- Claude Code manifest: version sync ---
  if (ccManifest.version !== pkg.version) {
    errors.push(
      `.claude-plugin/plugin.json: version "${ccManifest.version}" !== package.json "${pkg.version}"`
    );
  }

  // --- Claude Code manifest: component paths exist ---
  const refs = [];
  for (const cmd of ccManifest.commands || []) refs.push(cmd);
  if (typeof ccManifest.agents === 'string') refs.push(ccManifest.agents);
  else for (const a of ccManifest.agents || []) refs.push(a);
  if (typeof ccManifest.skills === 'string') refs.push(ccManifest.skills);
  if (typeof ccManifest.hooks === 'string') refs.push(ccManifest.hooks);

  for (const ref of refs) {
    const rel = normalizeRef(ref);
    if (!(await pathExists(rel))) {
      errors.push(`.claude-plugin/plugin.json: referenced path does not exist: ${ref}`);
    }
  }

  // --- Claude Code manifest: composerIcon asset exists ---
  // composerIcon is resolved relative to the manifest's directory (.claude-plugin/)
  if (typeof ccManifest.composerIcon === 'string') {
    const assetPath = path.join('.claude-plugin', normalizeRef(ccManifest.composerIcon));
    if (!(await fileExists(assetPath))) {
      errors.push(
        `.claude-plugin/plugin.json: composerIcon asset does not exist: ${ccManifest.composerIcon}`
      );
    }
  }

  // --- Hooks: parse hooks.json and verify each command's script target exists ---
  errors.push(...(await checkPluginHooksScripts(ccManifest, { root: ROOT })));

  // --- Reverse drift: on-disk command/agent files must be registered ---
  const commandFiles = await listMarkdownFiles('commands');
  const agentFiles = await listMarkdownFiles('agents');
  errors.push(...checkAssetRegistration(ccManifest, { commandFiles, agentFiles }));

  // --- CLAUDE.md prose command list ↔ plugin.json commands[] parity (#1451/#1463) ---
  try {
    const claudeMd = await fs.readFile(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    errors.push(...checkClaudeMdCommandParity(claudeMd, ccManifest));
  } catch (err) {
    errors.push(`CLAUDE.md: not readable for distributed-command parity check (${err.message})`);
  }

  // --- Marketplace: plugins[].name matches manifest name ---
  const entry = (marketplace.plugins || []).find((p) => p.name === ccManifest.name);
  if (!entry) {
    errors.push(
      `.claude-plugin/marketplace.json: no plugins[] entry with name "${ccManifest.name}"`
    );
  }

  // --- Codex manifest (required: official distribution ships Codex too) ---
  if (!(await pathExists('.codex-plugin/plugin.json'))) {
    errors.push('.codex-plugin/plugin.json: missing (required for Codex plugin distribution)');
  } else {
    const codexManifest = await readJson('.codex-plugin/plugin.json');
    if (codexManifest.version !== pkg.version) {
      errors.push(
        `.codex-plugin/plugin.json: version "${codexManifest.version}" !== package.json "${pkg.version}"`
      );
    }
    if (codexManifest.name !== ccManifest.name) {
      errors.push(
        `.codex-plugin/plugin.json: name "${codexManifest.name}" !== .claude-plugin name "${ccManifest.name}"`
      );
    }
    if (typeof codexManifest.skills !== 'string') {
      errors.push('.codex-plugin/plugin.json: "skills" path is missing or not a string');
    } else {
      const rel = normalizeRef(codexManifest.skills);
      if (!(await pathExists(rel))) {
        errors.push(
          `.codex-plugin/plugin.json: skills path does not exist: ${codexManifest.skills}`
        );
      }
    }
    // The Codex plugin UI requires an interface block with these fields.
    const iface = codexManifest.interface;
    if (!iface || typeof iface !== 'object') {
      errors.push('.codex-plugin/plugin.json: "interface" block is missing');
    } else {
      const requiredInterfaceFields = [
        'displayName',
        'shortDescription',
        'longDescription',
        'category',
        'capabilities',
      ];
      for (const field of requiredInterfaceFields) {
        if (iface[field] === undefined || iface[field] === null || iface[field] === '') {
          errors.push(`.codex-plugin/plugin.json: interface.${field} is missing or empty`);
        }
      }
      if (iface.capabilities !== undefined && !Array.isArray(iface.capabilities)) {
        errors.push('.codex-plugin/plugin.json: interface.capabilities must be an array');
      }
      // --- Codex manifest: composerIcon asset exists ---
      // composerIcon is resolved relative to the manifest's directory (.codex-plugin/)
      if (typeof iface.composerIcon === 'string') {
        const assetPath = path.join('.codex-plugin', normalizeRef(iface.composerIcon));
        if (!(await fileExists(assetPath))) {
          errors.push(
            `.codex-plugin/plugin.json: interface.composerIcon asset does not exist: ${iface.composerIcon}`
          );
        }
      }
    }

    // --- Bundle field allowlist + canonical cross-manifest parity (#1250) ---
    errors.push(...checkBundleFieldAllowlist(codexManifest));
    errors.push(...checkCrossManifestParity(ccManifest, codexManifest));

    // --- RA-2: manifest references stay host-neutral (ADR-009 D3) ---
    errors.push(...checkManifestHostIndependentRefs(ccManifest, codexManifest));

    // --- Cross-plugin field parity (synced fields must match package.json) ---
    // repository is excluded: package.json uses {type, url} object; plugins use plain string URL.
    const SYNCED_FIELDS = ['keywords', 'homepage', 'author', 'license'];
    for (const field of SYNCED_FIELDS) {
      if (pkg[field] === undefined) continue;
      const ccVal = JSON.stringify(ccManifest[field]);
      const codexVal = JSON.stringify(codexManifest[field]);
      const pkgVal = JSON.stringify(pkg[field]);
      if (ccVal !== pkgVal) {
        errors.push(
          `.claude-plugin/plugin.json: "${field}" drifted from package.json — run \`npm run plugin:sync\``
        );
      }
      if (codexVal !== pkgVal) {
        errors.push(
          `.codex-plugin/plugin.json: "${field}" drifted from package.json — run \`npm run plugin:sync\``
        );
      }
    }
  }

  // --- RA-1: no runtime adapter file redefines Review Judgment (ADR-009 D3) ---
  const ra1Target = ra1Sink(RA1_ENFORCEMENT);
  if (ra1Target !== null) {
    const { files, error } = await loadRuntimeAdapterFiles();
    const sink = ra1Target === 'errors' ? errors : observations;
    if (error) {
      sink.push(error);
    } else {
      const ssot = await loadSsotContents(files);
      sink.push(...checkReviewJudgmentDuplication(files, ssot));
    }
  }

  return errors;
}

// CLI entry point
if (isDirectRun(import.meta.url)) {
  const warnings = [];
  validatePluginManifest({ warnings })
    .then((errors) => {
      if (warnings.length > 0) {
        console.warn(
          `Plugin manifest: ${warnings.length} RA-1 observation(s) ` +
            `(RA1_ENFORCEMENT="${RA1_ENFORCEMENT}", not failing the run)`
        );
        for (const warning of warnings) {
          console.warn(`  ! ${warning}`);
        }
      }
      if (errors.length === 0) {
        console.log('Plugin manifest: OK');
        return 0;
      }
      console.error(`Plugin manifest: ${errors.length} error(s) found`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      return 1;
    })
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Plugin manifest check failed: ${err.message}`);
      process.exitCode = 1;
    });
}
