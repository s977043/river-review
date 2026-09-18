const CONTRACT_PATH_RE = /(?:^|\/)(?:api|apis|dto|dtos|contract|contracts)(?:\/|\.|-|_)/i;
const TYPESCRIPT_PATH_RE = /\.(?:ts|tsx)$/i;
const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i;
const CONTRACT_DECLARATION_RE =
  /\binterface\s+[A-Za-z_$][\w$]*(?:Dto|DTO|Request|Response|Api|API|Contract|Schema)[\w$]*\s*(?:extends\s+[^\{]+)?\{|\btype\s+[A-Za-z_$][\w$]*(?:Dto|DTO|Request|Response|Api|API|Contract|Schema)[\w$]*\s*=\s*\{|\bconst\s+[A-Za-z_$][\w$]*(?:Dto|DTO|Request|Response|Api|API|Contract|Schema)[\w$]*\s*=\s*z\.object\s*\(/;
const PROPERTY_RE =
  /^\s*(?:readonly\s+)?(?<name>[A-Za-z_$][\w$]*)(?<optional>\?)?\s*:\s*(?<type>.+?)\s*[;,]?\s*$/;

function normalizeType(type) {
  return String(type)
    .replace(/[;,]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseProperty(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return null;
  if (/^(?:interface|type|class|const|let|var|function|return|import|export)\b/.test(trimmed)) {
    return null;
  }

  const match = PROPERTY_RE.exec(text);
  if (!match?.groups) return null;
  const type = normalizeType(match.groups.type);
  if (!type || type === '{' || type.endsWith('=>')) return null;

  return {
    name: match.groups.name,
    optional: match.groups.optional === '?',
    type,
  };
}

/**
 * Number of marker columns a hunk's body lines carry.
 *
 * `parentCount` is set by `parseUnifiedDiff` in src/lib/diff-processor.mjs and
 * is the single source of truth for the column width; it is never re-derived
 * here by inspecting the line text.
 *
 * @param {object} hunk
 * @returns {number}
 */
function markerWidth(hunk) {
  const parentCount = hunk?.parentCount;
  return Number.isInteger(parentCount) && parentCount > 1 ? parentCount : 1;
}

/**
 * Classify one hunk body line from its marker columns.
 *
 * A combined diff (`diff --cc`) carries one marker column per parent. Column
 * `i` says how the line relates to parent `i`: `-` it is absent from the merge
 * result, `+` it is absent from that parent, ` ` it is in both. So the line is
 * removed when SOME column is `-`, added when SOME column is `+`, and context
 * otherwise. The `-` test runs BEFORE the `+` test and that order is
 * load-bearing: on input that mixes the two in one line, reading it as added
 * would invent a line number and advance the counter past it, mis-anchoring
 * every signal below. Pinned by a mixed-column fixture, not only by the
 * cross-check against the parse layer.
 *
 * `\ No newline at end of file` is metadata, not a body line, and must not
 * advance the counter — in COMBINED hunks only. The single-parent path in
 * `parseUnifiedDiff` still counts it as context, and this function mirrors that
 * asymmetry deliberately rather than improving on it (tracked in #2309).
 *
 * This mirrors `classifyCombinedBodyLine` / `classifyUnifiedBodyLine` in
 * src/lib/diff-processor.mjs. Those are module-private, so the agreement is
 * pinned by a test that cross-checks this consumer against what
 * `parseUnifiedDiff` itself classified rather than by reading them side by side.
 *
 * @param {string} line
 * @param {number} width
 * @returns {'added' | 'removed' | 'context'}
 */
function classifyBodyLine(line, width) {
  if (width === 1) {
    if (line.startsWith('+')) return 'added';
    if (line.startsWith('-')) return 'removed';
    return 'context';
  }
  if (line.startsWith('\\')) return 'removed';
  const columns = line.slice(0, width);
  if (columns.includes('-')) return 'removed';
  if (columns.includes('+')) return 'added';
  return 'context';
}

/**
 * Text of a hunk body line with its marker columns stripped.
 * @param {string} line
 * @param {number} width
 * @returns {string}
 */
function bodyText(line, width) {
  return line.slice(width);
}

/**
 * Does this hunk carry a contract declaration in its own body?
 *
 * ONLY the hunk body counts. The enclosing declaration git prints in the hunk
 * heading (`@@ -4,6 +4,6 @@ export interface HealthResponse {`) is NOT read,
 * and reading it was measured to be unsound: the heading comes from git's
 * funcname heuristic, which walks BACKWARDS to the nearest line starting in
 * column 0 with an identifier character. A region opened by a line that does
 * not qualify — a decorator (`@Module({`), a top-level IIFE (`(function ...`),
 * a bracket or a quote — therefore inherits the heading of an ALREADY CLOSED
 * declaration above it. When that stale heading names a contract, every
 * unrelated property change beneath it reads as a contract change. Measured on
 * real `git diff` output for both shapes, in BOTH the default and the
 * `--unified=0` band, so scoping the heading to `--unified=0` would not have
 * helped. The diff alone carries nothing that separates a live heading from a
 * stale one. Negative fixtures `n07` / `n08` hold both shapes (#2314 review).
 *
 * @param {object} hunk
 * @returns {boolean}
 */
function hunkHasContractDeclaration(hunk) {
  const width = markerWidth(hunk);
  return (hunk?.lines ?? []).some((rawLine) =>
    CONTRACT_DECLARATION_RE.test(bodyText(String(rawLine), width))
  );
}

function collectChangedProperties(file, { declarationScoped = false } = {}) {
  const removed = new Map();
  const added = new Map();

  for (const hunk of file?.hunks ?? []) {
    if (declarationScoped && !hunkHasContractDeclaration(hunk)) continue;
    const width = markerWidth(hunk);
    let newLine = Number.isInteger(hunk?.newStart) ? hunk.newStart : 1;

    for (const rawLine of hunk?.lines ?? []) {
      const line = String(rawLine);
      const classified = classifyBodyLine(line, width);

      if (classified === 'removed') {
        const property = parseProperty(bodyText(line, width));
        if (property) {
          const entries = removed.get(property.name) ?? [];
          entries.push({ ...property, line: newLine });
          removed.set(property.name, entries);
        }
        continue;
      }

      if (classified === 'added') {
        const property = parseProperty(bodyText(line, width));
        if (property) {
          const entries = added.get(property.name) ?? [];
          entries.push({ ...property, line: newLine });
          added.set(property.name, entries);
        }
      }

      newLine += 1;
    }
  }

  return { removed, added };
}

function first(entries) {
  return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
}

/**
 * Extract neutral, deterministic facts that can activate api-compatibility
 * Review Viewpoints. These are signals, not findings: no severity, policy,
 * violation decision, or gate behavior is attached here.
 *
 * The v1 detector is deliberately conservative. It handles TypeScript property
 * changes only when an API/DTO/contract path or a contract-named declaration
 * identifies the boundary. Declaration-based fallback is hunk-scoped so an
 * unrelated internal type in the same file does not inherit contract status.
 * The scope is the hunk BODY only; see `hunkHasContractDeclaration` for why the
 * hunk heading is not read. Marker columns are read by the hunk's `parentCount`, so a combined diff
 * (`diff --cc`) yields the same signals whichever parent it is read from.
 * New files and test/fixture files are excluded because they cannot establish a
 * breaking change to an existing production contract.
 *
 * @param {{diff?: {files?: Array<object>}}} options
 * @returns {Array<{kind: string, file: string, line?: number}>}
 */
export function detectApiCompatibilitySignals({ diff } = {}) {
  const signals = [];

  for (const file of diff?.files ?? []) {
    const filePath = typeof file?.path === 'string' ? file.path : '';
    if (!filePath || filePath === '/dev/null') continue;
    if (!TYPESCRIPT_PATH_RE.test(filePath) || TEST_PATH_RE.test(filePath)) continue;
    if (!file.oldPath || file.oldPath === '/dev/null') continue;

    const pathBased = CONTRACT_PATH_RE.test(filePath);
    const declarationBased = (file.hunks ?? []).some(hunkHasContractDeclaration);
    if (!pathBased && !declarationBased) continue;

    const { removed, added } = collectChangedProperties(file, {
      declarationScoped: !pathBased,
    });
    const names = new Set([...removed.keys(), ...added.keys()]);

    for (const name of names) {
      const before = first(removed.get(name));
      const after = first(added.get(name));

      if (before && !after) {
        signals.push({ kind: 'dto-field-removed', file: filePath, line: before.line });
        continue;
      }

      if (!before && after) {
        if (after.optional) {
          signals.push({ kind: 'dto-optional-field-added', file: filePath, line: after.line });
        }
        continue;
      }

      if (!before || !after) continue;

      if (before.optional && !after.optional && before.type === after.type) {
        signals.push({ kind: 'dto-requiredness-tightened', file: filePath, line: after.line });
        continue;
      }

      if (before.type !== after.type) {
        signals.push({ kind: 'dto-field-type-changed', file: filePath, line: after.line });
      }
    }
  }

  return signals;
}
