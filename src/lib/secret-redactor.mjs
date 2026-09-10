// Secret redaction for repo-wide review context (#692 PR-A).
//
// Wiring status (corrected in #2033 — the previous note claiming this module
// was "not yet wired into the review pipeline" was stale). `redactText` is
// called from five places today (verified with `grep -rl redactText src`):
//   - src/lib/repo-context.mjs        (repo-wide context files)
//   - src/lib/review-engine.mjs       (prompt input)
//   - src/lib/plan-review/llm-adjudicator.mjs
//   - src/lib/finding-critic-runner.mjs
//   - src/lib/execution-manifest.mjs  (every string leaf, #2015)
//
// Coverage is pattern-based, therefore INCOMPLETE by construction: a caller
// that records "redaction ran" must not read that as "no secret remains".
// `REDACTION_PATTERN_IDS` names the pattern set that was applied so consumers
// can record *which* categories were searched for rather than a bare boolean.
//
// Design notes (see Issue #692 plan):
// - Replacements are *length-independent* (`<REDACTED:category>`) so that
//   suppression fingerprints stay stable when redaction is toggled on/off
//   (interaction with #687 PR-B applySuppressions).
// - High-entropy detection is opt-in by config and runs LAST so that named
//   categories take priority and avoid double-counting.
// - Allowlist substrings (example, dummy, placeholder, missing, xxxxx)
//   suppress redaction on the surrounding token to protect documentation
//   examples and obvious test fixtures from being mangled.
// - DEFAULT_DENY_GLOBS is exported separately so that path-level exclusion
//   can run BEFORE redaction (avoids reading .env / *.pem files at all).

import { minimatch } from 'minimatch';

/**
 * Path globs that must be excluded from repo-wide context regardless of
 * user config. Lock files and build artifacts are also denied because they
 * carry no review value but inflate the budget.
 */
export const DEFAULT_DENY_GLOBS = Object.freeze([
  '**/.env',
  '**/.env.*',
  '**/.envrc',
  '**/secrets.*',
  '**/credentials.*',
  '**/credentials/**',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.jks',
  '**/*.keystore',
  '**/id_rsa',
  '**/id_dsa',
  '**/id_ecdsa',
  '**/id_ed25519',
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/composer.lock',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/Gemfile.lock',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
]);

/**
 * Substrings that, when found near a candidate match, mark the match as a
 * documentation example or test placeholder rather than a real secret.
 *
 * `xxxxx` was rejected as too aggressive: legitimate hex / base64 tokens
 * frequently contain runs of repeated characters and would be incorrectly
 * skipped. The high-entropy fallback already protects monotonic strings
 * (entropy below threshold) so the placeholder list is intentionally short.
 */
const ALLOWLIST_TOKENS = Object.freeze([
  'example',
  'dummy',
  'placeholder',
  '<missing>',
  // Common substrings used in test fixtures so they don't get redacted
  // when test files are included in repo-wide context scans (#808 follow-up).
  'test-key',
  'fake-key',
]);

const ALLOWLIST_RE = new RegExp(
  ALLOWLIST_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const REPLACEMENT = (category) => `<REDACTED:${category}>`;

/**
 * Pattern categories. Order matters — more specific / longer alternatives
 * come first so they win over weaker patterns and don't get partly eaten by
 * the high-entropy fallback.
 *
 * Each entry: { id, regex, redact? }. `redact(match, ...groups)` may return a
 * replacement string, or `null` to leave the match untouched (used by the
 * patterns that need a value-shape check the regex cannot express).
 */
const PATTERNS = [
  // GitHub
  { id: 'githubToken', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { id: 'githubToken', regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  // OpenAI / Anthropic / Google
  { id: 'openaiKey', regex: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g },
  { id: 'anthropicKey', regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  { id: 'openaiKey', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { id: 'googleApiKey', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // AWS
  { id: 'awsAccessKey', regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // Long-form private keys (multi-line block)
  {
    id: 'privateKey',
    regex:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP |)PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
  },
  // Bearer tokens — capture the surrounding "Bearer " keyword to limit FP
  { id: 'bearerToken', regex: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{20,}\b/g },
  // Database connection strings
  {
    id: 'databaseUrl',
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s'"`<>]+/g,
  },
  // Webhook URLs (Slack / Discord)
  { id: 'webhookUrl', regex: /https:\/\/hooks\.slack\.com\/[A-Z0-9/]+/g },
  {
    id: 'webhookUrl',
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
  },
  // URL userinfo — `scheme://user:pass@host` (#2033). Only the credential span
  // is replaced so the host stays reviewable; a policy `ref` pointing at an
  // internal host is still readable after its basic-auth pair is removed.
  //
  // Runs AFTER databaseUrl so `postgres://u:p@h/db` is still redacted whole.
  // The user half excludes `:` and `/`; the password half excludes `/` but
  // ALLOWS `:` because RFC 3986 permits it inside the password
  // (`alice:hun:ter2@host`). The password half is optional so token-style
  // userinfo (`https://token@host/p`) is covered too. A plain
  // `https://host.example.com:8443/path` still cannot match: there is no `@`
  // before the first `/`.
  {
    id: 'urlUserInfo',
    regex: /\b([A-Za-z][A-Za-z0-9+.-]*):\/\/([^\s:/?#@'"`<>]+)(?::([^\s/?#@'"`<>]+))?@/g,
    redact: (_m, scheme) => `${scheme}://${REPLACEMENT('urlUserInfo')}@`,
  },
];

/**
 * Patterns that are case-insensitive *value-shape* patterns and require an
 * explicit assignment context (key=value). These run after the explicit
 * patterns above so a literal `aws_secret_access_key=...` does not get
 * partially consumed.
 */
const ASSIGNMENT_PATTERNS = [
  // aws_secret_access_key = "..."
  {
    id: 'awsSecretKey',
    regex: /\baws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
  },
  // client_secret = "...", consumer_secret = "..."
  {
    id: 'oauthSecret',
    regex: /\b(?:client|consumer)[_-]?secret\s*[:=]\s*['"][^'"]{16,}['"]/gi,
  },
  // password= / passwd= / pwd= (#2033). ENV_VAR_RE below only sees
  // SCREAMING_CASE names at the start of a line, so lowercase config / YAML /
  // JSON / query-string shapes were passing through untouched.
  //
  // The key is preserved and only the value is masked, so a reviewer still
  // sees that a credential was present. `isCredentialLiteral` is what keeps
  // type annotations (`password: string`) and references
  // (`password = req.body.password`) out — see its own comment.
  //
  // The optional matched quote pair around the key covers JSON
  // (`{"password": "hunter2"}`), the trailing `\b` stops `PWD` from being
  // read as a password key mid-word, and `&` is excluded from the unquoted
  // value class so a query string only loses the one parameter.
  {
    id: 'passwordAssignment',
    regex:
      /(["']?)\b(password|passwd|pwd)\b\1(\s*[:=]\s*)("[^"\n]{4,}"|'[^'\n]{4,}'|[^\s'"`,;)\]}&]{4,})/gi,
    redact: (_m, quote, name, sep, value) => {
      if (NON_SECRET_PWD_NAMES.has(name)) return null;
      if (!isCredentialLiteral(value)) return null;
      return `${quote}${name}${quote}${sep}${REPLACEMENT('passwordAssignment')}`;
    },
  },
];

/**
 * Values that follow a `password`-ish key but are NOT a credential. Without
 * this the pattern fires on ordinary source: TypeScript / JSON-schema type
 * annotations, documentation placeholders, and variable references.
 *
 * These are the negative cases pinned by
 * `tests/secret-redactor.test.mjs` ("does not redact password type
 * annotations, references, or placeholders").
 */
const NON_CREDENTIAL_VALUE_RE =
  /^(?:string|number|boolean|any|unknown|never|object|null|undefined|true|false|none|nil|nan|required|optional|text|hidden|password)$/i;
// `req.body.password`, `process.env.PASSWORD`, `user.password` — a dotted
// identifier path is a reference to the value, never the value itself.
const REFERENCE_EXPRESSION_RE = /^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/;
// A bare identifier written the way source code names things — camelCase
// (`hashedPassword`) or snake_case (`user_password`), letters only. A literal
// credential is not spelled like a symbol, so this shape is a reference to
// one. Deliberately NOT `^[A-Za-z_$][\w$]*$`: that also covers `hunter2`,
// which is the canonical leaked-password form and must stay redacted. Digits
// disqualify the identifier reading for the same reason — `MyS3cret` after a
// `password=` key is a credential, not a symbol. Residual gap: an unquoted,
// digit-free camelCase password (`password=MyPassword`) is not redacted;
// quoted, SCREAMING_CASE (`envAssignment`) and high-entropy forms still are.
const IDENTIFIER_SHAPED_RE =
  /^(?:[A-Za-z][a-z]*(?:[A-Z][a-z]*)+|[A-Za-z_$][A-Za-z_$]*[_$][A-Za-z_$]*)$/;
// Names that match the `pwd` alternative but never hold a password: `PWD` and
// `OLDPWD` are the shell's working directory and appear in every env dump and
// CI log. Case-sensitive — lowercase `pwd = '...'` is still a password key.
const NON_SECRET_PWD_NAMES = new Set(['PWD', 'OLDPWD']);

function isCredentialLiteral(raw) {
  const quoted = /^(["']).*\1$/s.test(raw);
  const value = raw.replace(/^["']/, '').replace(/["']$/, '').trim();
  if (value.length < 4) return false;
  if (NON_CREDENTIAL_VALUE_RE.test(value)) return false;
  // `<your-password>`, `${DB_PASSWORD}`, `{{ password }}`, `*****`
  if (/^[<{$*]/.test(value)) return false;
  if (REFERENCE_EXPRESSION_RE.test(value)) return false;
  // The remaining shapes are only ambiguous when the value is unquoted. A
  // quoted value is a literal by construction, so `"password": "hashedX"`
  // stays redacted while `password: hashedX` in a diff does not.
  if (!quoted) {
    // Prose, not a value: `password: 8文字以上を推奨します`. A credential that
    // reaches a config file or a URL is ASCII.
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7f]/.test(value)) return false;
    // `getPassword(` — the value class stops before `)`, so a call site is
    // recognised by the opening paren alone. Redacting it would also leave
    // the stray `)` behind and break the syntax the reviewer is reading.
    if (value.includes('(')) return false;
    if (IDENTIFIER_SHAPED_RE.test(value)) return false;
  }
  return true;
}

/**
 * Variable-name based assignment redaction. Only redacts values when the
 * name itself implies a secret, so plain dotenv lines like `PORT=3000` or
 * `LOG_LEVEL=info` are left alone.
 */
// Two-step approach so the regex can capture short and unprefixed names
// (`TOKEN=`, `MY_TOKEN=`, `export TOKEN=`) without exploding the alternation.
// The captured name is then sanity-checked with SENSITIVE_NAME_RE before
// the value is masked, which keeps `PORT=3000` and `LOG_LEVEL=info`
// untouched.
const ENV_VAR_RE = /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/gm;
const SENSITIVE_NAME_RE =
  /(?:^|_)(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|CREDENTIALS|API_KEY|ACCESS_KEY|PRIVATE_KEY)$/;

/**
 * The pattern set `redactText` applies, as stable category ids (#2033).
 *
 * Exported so a consumer that persists a redaction record can state WHICH
 * categories were searched for instead of a bare `applied: true`, which reads
 * as "exhaustive" and is not. `envAssignment` and `highEntropy` are appended
 * because they are produced by the two non-table passes below.
 */
export const REDACTION_PATTERN_IDS = Object.freeze([
  ...new Set([
    ...PATTERNS.map((p) => p.id),
    ...ASSIGNMENT_PATTERNS.map((p) => p.id),
    'envAssignment',
    'highEntropy',
  ]),
]);

const MIN_HIGH_ENTROPY_LENGTH = 24;
const DEFAULT_HIGH_ENTROPY_THRESHOLD = 4.5;
const HIGH_ENTROPY_TOKEN_RE = /[A-Za-z0-9+/=_-]{24,}/g;

/**
 * Shannon entropy in bits per character. Higher = more random.
 * @param {string} s
 */
export function shannonEntropy(s) {
  if (!s) return 0;
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  const len = s.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return h;
}

function isAllowlisted(snippet) {
  return ALLOWLIST_RE.test(snippet);
}

/**
 * The capture groups of a `String.prototype.replace` callback, taken from the
 * arguments that follow `match`.
 *
 * `replace` calls back with `(match, ...captures, offset, string)` — and, when
 * the pattern contains ANY named capture group `(?<name>...)`, with a trailing
 * `groups` object as well. Dropping a fixed two-element tail therefore starts
 * handing `offset` to a pattern's `redact` callback as if it were a capture
 * the moment a named group is added to any pattern here (#2038 review). The
 * tail length is decided by the shape of the last argument instead: `string`
 * when there are no named groups, an object when there are.
 *
 * Exported so the contract can be exercised against both argument shapes; it
 * is a `replace` adapter, not part of the redaction API.
 *
 * @param {Array<unknown>} rest the callback arguments after `match`
 * @returns {Array<unknown>} the capture groups only
 */
export function extractCaptureGroups(rest) {
  const last = rest[rest.length - 1];
  const tailLength = last !== null && typeof last === 'object' ? 3 : 2;
  return rest.slice(0, -tailLength);
}

/**
 * Redact secrets in a text string.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.highEntropy] enable Shannon-entropy fallback (default true)
 * @param {number} [opts.entropyThreshold] entropy bits/char threshold (default 4.5)
 * @param {string[]} [opts.allowlist] additional substrings that suppress redaction
 * @returns {{ text: string, hits: Array<{ category: string, count: number }> }}
 */
export function redactText(text, opts = {}) {
  if (text == null || text === '') return { text: text ?? '', hits: [] };
  const {
    highEntropy = true,
    entropyThreshold = DEFAULT_HIGH_ENTROPY_THRESHOLD,
    allowlist = [],
  } = opts;
  const extraAllow = allowlist.length
    ? new RegExp(allowlist.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    : null;

  const hits = new Map();
  const bump = (category, n = 1) => hits.set(category, (hits.get(category) || 0) + n);
  const skipMatch = (full) => isAllowlisted(full) || (extraAllow ? extraAllow.test(full) : false);

  let out = String(text);

  for (const { id, regex, redact } of [...PATTERNS, ...ASSIGNMENT_PATTERNS]) {
    out = out.replace(regex, (m, ...groups) => {
      if (skipMatch(m)) return m;
      if (redact) {
        const replaced = redact(m, ...extractCaptureGroups(groups));
        if (replaced == null) return m;
        bump(id);
        return replaced;
      }
      bump(id);
      return REPLACEMENT(id);
    });
  }

  out = out.replace(ENV_VAR_RE, (full, name, value) => {
    if (skipMatch(full)) return full;
    if (!SENSITIVE_NAME_RE.test(name)) return full;
    if (!value || value.trim().length < 8) return full;
    bump('envAssignment');
    // Reconstruct so we keep the (optional) `export ` prefix and the exact
    // whitespace around `=`. Slicing `full` up to the start of `value` is
    // safer than rebuilding the line by hand.
    const valueStart = full.length - value.length;
    return full.slice(0, valueStart) + REPLACEMENT('envAssignment');
  });

  if (highEntropy) {
    out = out.replace(HIGH_ENTROPY_TOKEN_RE, (m) => {
      if (m.length < MIN_HIGH_ENTROPY_LENGTH) return m;
      if (skipMatch(m)) return m;
      // Skip tokens that are still mid-replacement (we already redacted nearby).
      if (m.includes('REDACTED')) return m;
      const h = shannonEntropy(m);
      if (h < entropyThreshold) return m;
      bump('highEntropy');
      return REPLACEMENT('highEntropy');
    });
  }

  return {
    text: out,
    hits: [...hits.entries()].map(([category, count]) => ({ category, count })),
  };
}

/**
 * True when `relPath` should be excluded from repo-wide context.
 * Combines the built-in deny list with caller-supplied additions, then
 * applies an allowlist of explicit "force-include" globs.
 *
 * @param {string} relPath
 * @param {object} [opts]
 * @param {string[]} [opts.extraDenyGlobs]
 * @param {string[]} [opts.allowlist] globs that override deny matches
 * @returns {boolean}
 */
export function shouldExcludeForContext(relPath, opts = {}) {
  if (!relPath) return false;
  const { extraDenyGlobs = [], allowlist = [] } = opts;
  const deny = [...DEFAULT_DENY_GLOBS, ...extraDenyGlobs];

  // nocase: case-insensitive so `.ENV`, `Package-Lock.json`, `ID_RSA` etc.
  // are still excluded on case-preserving filesystems.
  const matchOpts = { dot: true, nocase: true, matchBase: false };
  // Allowlist beats deny so users can opt back into specific paths if they
  // truly need them (e.g., a sample .env they want reviewed).
  for (const g of allowlist) {
    if (minimatch(relPath, g, matchOpts)) return false;
  }
  for (const g of deny) {
    if (minimatch(relPath, g, matchOpts)) return true;
  }
  return false;
}
