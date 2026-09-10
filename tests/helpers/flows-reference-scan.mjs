// Detects whether a JavaScript/TypeScript source actually loads something from
// the repository's `flows/` directory (#2016 observe mode).
//
// The naive version of this check was a single regexp over the raw file text,
// which was wrong in BOTH directions:
//
//   - false positive: a JSDoc comment that merely writes `flows/` was reported
//     as a module that loads the directory;
//   - false negative: the ordinary way this repository builds paths —
//     `path.join(REPO_ROOT, 'flows', 'entry-map.json')` — passes `flows` as its
//     own segment, so no literal ever contains the substring `flows/`.
//
// So the scan works on string literals only, with comments removed, and treats
// a bare `flows` segment (and the flow asset filenames) as a reference too.

const QUOTES = new Set(["'", '"', '`']);

// `/` starts a regexp literal only where a value cannot already have ended.
const REGEXP_ALLOWED_AFTER = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
]);

/** Reads a quoted literal that starts at `start`; returns its raw text and the index after it. */
const readStringLiteral = (source, start) => {
  const quote = source[start];
  let index = start + 1;
  let value = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      value += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === quote) return { value, next: index + 1 };
    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      // Skip the interpolated expression, including any strings inside it.
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        const inner = source[index];
        if (QUOTES.has(inner)) {
          index = readStringLiteral(source, index).next;
          continue;
        }
        if (inner === '{') depth += 1;
        if (inner === '}') depth -= 1;
        index += 1;
      }
      continue;
    }
    value += char;
    index += 1;
  }
  return { value, next: index };
};

/**
 * Extracts every string / template literal in `source`, ignoring line comments,
 * block comments and regexp literals.
 *
 * @param {string} source
 * @returns {string[]}
 */
export const extractStringLiterals = (source) => {
  const literals = [];
  let index = 0;
  let previous = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '/' && REGEXP_ALLOWED_AFTER.has(previous)) {
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') {
          index += 2;
          continue;
        }
        if (inner === '[') inClass = true;
        else if (inner === ']') inClass = false;
        else if (inner === '/' && !inClass) {
          index += 1;
          break;
        } else if (inner === '\n') break;
        index += 1;
      }
      previous = '/';
      continue;
    }
    if (QUOTES.has(char)) {
      const { value, next } = readStringLiteral(source, index);
      literals.push(value);
      index = next;
      previous = char;
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    index += 1;
  }
  return literals;
};

// `../flows/x`, `flows/x`, and Windows-separator spellings of the same.
const FLOWS_PATH = /(^|[/\\])flows[/\\]/;
// The asset filenames that only live under `flows/`, for `` `${dir}/entry-map.json` `` forms.
const FLOWS_ASSET = /(^|[/\\])(entry-map\.json|[^/\\]+\.(flow|intent)\.json)$/;

/**
 * True when `source` reads something under `flows/`.
 *
 * @param {string} source JavaScript/TypeScript source text
 * @returns {boolean}
 */
export const referencesFlowsDirectory = (source) =>
  extractStringLiterals(source).some(
    (literal) => literal === 'flows' || FLOWS_PATH.test(literal) || FLOWS_ASSET.test(literal)
  );
