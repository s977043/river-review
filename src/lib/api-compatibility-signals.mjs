const CONTRACT_PATH_RE =
  /(?:^|\/)(?:api|apis|dto|dtos|schema|schemas|contract|contracts|types?)(?:\/|\.|-|_)/i;
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

function hasContractContext(file) {
  if (CONTRACT_PATH_RE.test(String(file?.path ?? ''))) return true;
  return (file?.hunks ?? []).some((hunk) =>
    (hunk?.lines ?? []).some((rawLine) => CONTRACT_DECLARATION_RE.test(String(rawLine).slice(1)))
  );
}

function collectChangedProperties(file) {
  const removed = new Map();
  const added = new Map();

  for (const hunk of file?.hunks ?? []) {
    let newLine = Number.isInteger(hunk?.newStart) ? hunk.newStart : 1;

    for (const rawLine of hunk?.lines ?? []) {
      const line = String(rawLine);
      if (line.startsWith('+++') || line.startsWith('---')) continue;

      if (line.startsWith('-')) {
        const property = parseProperty(line.slice(1));
        if (property) {
          const entries = removed.get(property.name) ?? [];
          entries.push({ ...property, line: newLine });
          removed.set(property.name, entries);
        }
        continue;
      }

      if (line.startsWith('+')) {
        const property = parseProperty(line.slice(1));
        if (property) {
          const entries = added.get(property.name) ?? [];
          entries.push({ ...property, line: newLine });
          added.set(property.name, entries);
        }
        newLine += 1;
        continue;
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
 * changes only when the file path or a contract-named declaration indicates an
 * API/DTO/schema/contract/type boundary. New files and test/fixture files are
 * excluded because they cannot establish a breaking change to an existing
 * production contract.
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
    if (!hasContractContext(file)) continue;

    const { removed, added } = collectChangedProperties(file);
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
