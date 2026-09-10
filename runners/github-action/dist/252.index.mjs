export const id = 252;
export const ids = [252];
export const modules = {

/***/ 5252:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  ALLOWLIST_RELATIVE_PATH: () => (/* binding */ ALLOWLIST_RELATIVE_PATH),
  runDeterministicGates: () => (/* binding */ runDeterministicGates)
});

// EXTERNAL MODULE: external "node:fs/promises"
var promises_ = __webpack_require__(1455);
// EXTERNAL MODULE: external "node:path"
var external_node_path_ = __webpack_require__(6760);
// EXTERNAL MODULE: ../../../node_modules/js-yaml/dist/js-yaml.mjs
var js_yaml = __webpack_require__(1813);
;// CONCATENATED MODULE: ./src/lib/deterministic-command-allowlist.mjs
/**
 * Deterministic command allowlist — validation layer only (#1401 §10.1).
 *
 * PURE VALIDATION LAYER. This module implements the machine-checkable
 * "self-contained command" gate from the #1401 design (§10.1.2 (A)–(E),
 * §10.1.3 processing order). It parses and validates the host-trusted
 * `.river/deterministic-allowlist.yaml` and matches skill `deterministicGate`
 * definitions against the surviving allowlist entries by exact argv equality.
 *
 * It DOES NOT execute anything. There is deliberately NO import or use of
 * `child_process` / `spawn` / `execFile` / `exec` here — the RCE surface (the
 * actual executor) lands in a separate PR. Reading files is allowed; starting
 * processes is not. Keeping this layer process-free means it has no RCE surface
 * of its own and can be exercised freely by canary tests.
 *
 * reasonCode strings (e.g. DETERMINISTIC_UNRUNNABLE) are returned as human /
 * machine-readable reasons only; wiring them into the gate decision is a
 * separate PR.
 */





/** reasonCode returned for entries/commands that cannot be run (§3.5, §5). */
const DETERMINISTIC_UNRUNNABLE = 'DETERMINISTIC_UNRUNNABLE';

/**
 * Bare interpreter denylist (§10.1.2 (C)). If the basename of `command`
 * matches one of these, the entry is rejected even when given as an absolute
 * path, because these are designed to run arbitrary code via their arguments
 * and the danger-flag denylist (B) can never be made complete for them.
 */
const INTERPRETER_DENYLIST = Object.freeze([
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'node',
  'nodejs', // Debian/Ubuntu alias for node — same arbitrary-code surface
  'deno',
  'bun',
  'bash',
  'sh',
  'zsh',
  'dash',
  'ash',
  'ksh',
  'csh',
  'tcsh',
  'fish',
  'pwsh',
  'powershell',
  'osascript',
  'python',
  'python3',
  'ruby',
  'perl',
  'make',
  'env',
  'xargs',
]);

/**
 * Danger-flag denylist (§10.1.2 (B)). Any arg matching one of these (compared
 * on the token to the LEFT of the first `=` so `--eval=...` is not missed)
 * rejects the entry: these tokens inline-eval code, force-load
 * scripts/modules, delegate to a sub-command/shell, or inject config.
 */
const DANGER_FLAG_DENYLIST = Object.freeze([
  // inline eval
  '-e',
  '--eval',
  '-c',
  '--command',
  '-p',
  // script / module force-load
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  // indirect subcommand execution
  'run',
  'exec',
  'run-script',
  'dlx',
  '-x',
  // shell delegation
  '-lc',
  '-ic',
  '--rcfile',
  '--init-file',
  // config injection
  '--config',
  '--rc',
]);

/**
 * Return the basename of a POSIX-style absolute path (no fs / path import
 * needed; deliberately simple and platform-neutral for validation).
 * @param {string} p
 * @returns {string}
 */
function basename(p) {
  // Use path.posix.basename so trailing-slash paths (e.g. `/usr/bin/node/`) do
  // not yield "" and bypass the interpreter denylist (gemini #1427, security-high).
  return external_node_path_.posix.basename(String(p ?? ''));
}

/**
 * True when `command` is an absolute POSIX path (§10.1.2 (A)). Relative paths
 * and bare PATH-lookup names are NOT absolute.
 * @param {string} command
 * @returns {boolean}
 */
function isAbsolutePath(command) {
  return typeof command === 'string' && command.startsWith('/');
}

/**
 * Normalize an arg for danger-flag comparison: take the token left of the
 * first `=` (so `--eval=foo` compares as `--eval`).
 * @param {string} arg
 * @returns {string}
 */
function normalizeFlag(arg) {
  const s = String(arg ?? '');
  const eq = s.indexOf('=');
  return eq === -1 ? s : s.slice(0, eq);
}

/**
 * Parse `.river/deterministic-allowlist.yaml` text into an array of entries.
 *
 * Expected shape:
 *   version: 1
 *   commands:
 *     - id?: string
 *       command: string   # absolute path
 *       args?: string[]
 *       selfContained: boolean
 *
 * Never throws on malformed YAML or shape: returns `{ error }` instead so the
 * caller stays fail-safe (a broken allowlist must not crash the host).
 *
 * @param {string} yamlText
 * @returns {{ version?: unknown, commands: Array<object> } | { error: string }}
 */
function parseAllowlist(yamlText) {
  let doc;
  try {
    doc = js_yaml/* load */.Hh(String(yamlText ?? ''));
  } catch (err) {
    return { error: `invalid YAML: ${err?.message ?? String(err)}` };
  }
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { error: 'allowlist root must be a mapping with a `commands` list' };
  }
  const { version, commands } = doc;
  if (!Array.isArray(commands)) {
    return { error: '`commands` must be a list' };
  }
  // Reject non-object entries early so downstream validators only see objects.
  for (const entry of commands) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: 'each command entry must be a mapping' };
    }
  }
  return { version, commands };
}

/**
 * Validate a single allowlist entry per §10.1.2 in the §10.1.3 order:
 *   (A) command must be an absolute path
 *   (C) command basename must not be a bare interpreter
 *   (B) no arg may be a danger flag; no arg may start with `@` (gemini #1426)
 *   (A) selfContained must be exactly true (Phase 1)
 *
 * @param {object} entry
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateAllowlistEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, reason: `${DETERMINISTIC_UNRUNNABLE}: entry is not a mapping` };
  }
  const { command, args, selfContained } = entry;

  // (A) absolute path required
  if (typeof command !== 'string' || command.length === 0) {
    return { valid: false, reason: `${DETERMINISTIC_UNRUNNABLE}: command is required` };
  }
  if (!isAbsolutePath(command)) {
    return {
      valid: false,
      reason: `${DETERMINISTIC_UNRUNNABLE}: command must be an absolute path (got "${command}")`,
    };
  }

  // (C) bare interpreter rejection (even for absolute paths)
  const base = basename(command);
  if (INTERPRETER_DENYLIST.includes(base)) {
    return {
      valid: false,
      reason: `${DETERMINISTIC_UNRUNNABLE}: interpreter "${base}" is not allowed (runs arbitrary code via args)`,
    };
  }

  // args must be a string[] when present
  const argv = args === undefined ? [] : args;
  if (!Array.isArray(argv) || !argv.every((a) => typeof a === 'string')) {
    return {
      valid: false,
      reason: `${DETERMINISTIC_UNRUNNABLE}: args must be an array of strings`,
    };
  }

  // (B) danger-flag denylist + `@file` argument-file syntax (gemini #1426)
  for (const arg of argv) {
    if (arg.startsWith('@')) {
      return {
        valid: false,
        reason: `${DETERMINISTIC_UNRUNNABLE}: @-prefixed argument-file syntax is not allowed (denylist bypass)`,
      };
    }
    if (DANGER_FLAG_DENYLIST.includes(normalizeFlag(arg))) {
      return {
        valid: false,
        reason: `${DETERMINISTIC_UNRUNNABLE}: dangerous flag "${arg}" is not allowed`,
      };
    }
  }

  // (A) selfContained must be exactly true in Phase 1
  if (selfContained !== true) {
    return {
      valid: false,
      reason: `${DETERMINISTIC_UNRUNNABLE}: selfContained must be true (Phase 1 executes only self-contained commands)`,
    };
  }

  return { valid: true };
}

/**
 * Parse + validate every entry. Returns the surviving valid entries and the
 * rejected ones with their reasons. On parse failure, returns empty valid set
 * and a single synthetic rejection carrying the parse error.
 *
 * @param {string} yamlText
 * @returns {{ valid: Array<object>, rejected: Array<{ entry: unknown, reason: string }> }}
 */
function loadValidAllowlist(yamlText) {
  const parsed = parseAllowlist(yamlText);
  if ('error' in parsed) {
    return { valid: [], rejected: [{ entry: null, reason: parsed.error }] };
  }
  const valid = [];
  const rejected = [];
  for (const entry of parsed.commands) {
    const result = validateAllowlistEntry(entry);
    if (result.valid) {
      valid.push(entry);
    } else {
      rejected.push({ entry, reason: result.reason ?? DETERMINISTIC_UNRUNNABLE });
    }
  }
  return { valid, rejected };
}

/**
 * Structural argv equality: same command string AND element-wise identical
 * args (order included). Missing args is treated as an empty array.
 * @param {{ command?: string, args?: Array<string> }} a
 * @param {{ command?: string, args?: Array<string> }} b
 * @returns {boolean}
 */
function argvEqual(a, b) {
  if (!a || !b) return false; // defensive: matchCommand may receive null entries (gemini #1427)
  if (a.command !== b.command) return false;
  const aa = Array.isArray(a.args) ? a.args : [];
  const bb = Array.isArray(b.args) ? b.args : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

/**
 * Match a skill's deterministicGate {command,args} against the surviving valid
 * allowlist entries by EXACT argv equality (§3.2, §10.1.3 step 3). Returns the
 * matching entry or null. No partial / prefix / glob matching.
 *
 * @param {{ command?: string, args?: Array<string> }} gate
 * @param {Array<object>} validEntries - output of loadValidAllowlist().valid
 * @returns {object | null}
 */
function matchCommand(gate, validEntries) {
  if (gate == null || typeof gate !== 'object') return null;
  const list = Array.isArray(validEntries) ? validEntries : [];
  for (const entry of list) {
    if (argvEqual(gate, entry)) return entry;
  }
  return null;
}

// EXTERNAL MODULE: external "node:os"
var external_node_os_ = __webpack_require__(8161);
;// CONCATENATED MODULE: ./src/lib/deterministic-command-sandbox.mjs
/**
 * Deterministic command sandbox — preparation layer only (#1401 §11.8 (a)).
 *
 * PURE PREPARATION LAYER. This module implements increment (a) of the executor
 * from the #1401 design (§11.2 clean cwd, §11.3 env, §10.2 on-disk secret,
 * §10.3 stdout exfil / symlink non-following): it builds the scrubbed child
 * environment and stages review-target files into a clean cwd that contains no
 * `.git` and follows no symlinks.
 *
 * IT DOES NOT EXECUTE ANYTHING. There is deliberately NO import or use of
 * `child_process` / `spawn` / `execFile` / `exec` here — the RCE surface (the
 * actual `execFile` launch, increment (b)) lands in a separate PR. Reading and
 * copying files is allowed; starting processes is not. Keeping this layer
 * process-free means it has no RCE surface of its own and its symlink-blocking
 * and env-scrubbing behavior can be exercised freely by canary tests.
 */





/**
 * SAFE_ENV allowlist (§11.3 / §3.3). Only these keys are copied from the
 * parent `process.env` into the child environment. Everything else — including
 * `NODE_OPTIONS`, `NODE_PATH`, `XDG_CONFIG_HOME`, `*_TOKEN`, `*_SECRET`,
 * `AWS_*`, `GITHUB_*` — is dropped by construction (allowlist, not denylist, so
 * a new secret variable name fails safe instead of leaking).
 */
const SAFE_ENV_ALLOWLIST = Object.freeze(['PATH', 'LANG', 'LC_ALL', 'TZ']);

/**
 * Build the scrubbed environment for a sandboxed child process (§11.3 / §3.3).
 *
 * Starts from an empty object and copies ONLY the {@link SAFE_ENV_ALLOWLIST}
 * keys from `processEnv` (when present). `HOME` is NOT copied from the real
 * environment — the caller supplies the path to a fresh empty temp directory
 * via `home`, so `~/.aws` / `~/.npmrc` / `~/.git-credentials` are unreachable
 * (§10.2). `XDG_CONFIG_HOME` is pinned to the same empty `home` so config
 * autoload cannot reach the real `~/.config` (§10.1 (D)).
 *
 * Does not mutate `processEnv`; returns a fresh object.
 *
 * @param {Record<string, string | undefined>} processEnv - source env (e.g. `process.env`)
 * @param {{ home: string }} options - `home` is a fresh empty temp dir path
 * @returns {Record<string, string>} new child environment
 */
function buildSandboxEnv(processEnv, { home } = {}) {
  if (typeof home !== 'string' || home.length === 0) {
    throw new TypeError('buildSandboxEnv: `home` (empty temp dir path) is required');
  }
  const source = processEnv && typeof processEnv === 'object' ? processEnv : {};
  const childEnv = {};
  for (const key of SAFE_ENV_ALLOWLIST) {
    const value = source[key];
    // Only copy real string values; skip undefined so the child env stays minimal.
    if (typeof value === 'string') {
      childEnv[key] = value;
    }
  }
  // HOME / XDG_CONFIG_HOME point at the caller-provided empty temp dir. The real
  // $HOME and ~/.config are never inherited (on-disk secret blocking, §10.2).
  childEnv.HOME = home;
  childEnv.XDG_CONFIG_HOME = home;
  return childEnv;
}

/**
 * True when any component of `relPath` is exactly `.git` (§10.2). Blocks both
 * `.git` and nested `.git/config` so a persisted GITHUB_TOKEN is never staged.
 * @param {string} relPath
 * @returns {boolean}
 */
function isGitPath(relPath) {
  return relPath.split(/[\\/]/).some((segment) => segment === '.git');
}

/**
 * True when `relPath` escapes `sourceDir` (absolute, `..` traversal, or empty).
 * Defensive: staging must never read outside the review target.
 * @param {string} sourceDir
 * @param {string} relPath
 * @returns {boolean}
 */
function escapesRoot(sourceDir, relPath) {
  if (external_node_path_.isAbsolute(relPath)) return true;
  const resolved = external_node_path_.resolve(sourceDir, relPath);
  const root = external_node_path_.resolve(sourceDir);
  const rel = external_node_path_.relative(root, resolved);
  return rel === '' || rel === '..' || rel.startsWith(`..${external_node_path_.sep}`) || external_node_path_.isAbsolute(rel);
}

/**
 * True when any ancestor path component (from `sourceDir` down to, and
 * including, the full entry) is a symlink (§10.3.2 (A)). Following a symlinked
 * PARENT directory would also reach outside the review target (e.g. a
 * `link/credentials` where `link -> ~/.aws`), so every segment is `lstat`ed —
 * not just the leaf.
 *
 * @param {string} sourceDir
 * @param {string} relPath
 * @returns {Promise<boolean>}
 */
async function pathContainsSymlink(sourceDir, relPath) {
  const segments = relPath.split(/[\\/]/).filter((s) => s.length > 0);
  let current = sourceDir;
  for (const segment of segments) {
    current = external_node_path_.join(current, segment);
    let stat;
    try {
      stat = await promises_.lstat(current);
    } catch {
      // Missing intermediate component: nothing to follow. The leaf copy below
      // will surface a real ENOENT; treat "cannot stat" as "not a symlink here".
      return false;
    }
    if (stat.isSymbolicLink()) return true;
  }
  return false;
}

/**
 * Recursively scan `dir` for any residual symlink and return their absolute
 * paths (§10.3.2 (A) step 3 / §11.2 step 3 — multi-layer TOCTOU re-check). Used
 * to prove that nothing symlinked survived into the clean cwd.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findResidualSymlinks(dir) {
  const found = [];
  let entries;
  try {
    entries = await promises_.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = external_node_path_.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      found.push(full);
    } else if (entry.isDirectory()) {
      found.push(...(await findResidualSymlinks(full)));
    }
  }
  return found;
}

/**
 * Stage review-target files into a clean cwd (§11.2 / §10.3.2 (A)).
 *
 * Copies each relative `files` entry from `sourceDir` into `destDir` (which the
 * caller created with {@link makeSandboxTempDir} / `fs.mkdtemp`). Symlinks are
 * NOT followed: any entry whose leaf OR any ancestor component is a symlink is
 * skipped and recorded (blocking `~/.aws`-style exfil). `.git` paths are
 * excluded (blocking `.git/config` token leak). After copying, `destDir` is
 * re-scanned for residual symlinks; any found are unlinked and recorded (they
 * should never occur, since symlinks are never copied — the re-scan is a
 * multi-layer TOCTOU guard).
 *
 * Never starts a process. Copy failures for an individual entry are recorded in
 * `errors` and do not abort the whole staging pass.
 *
 * @param {{ sourceDir: string, destDir: string, files: string[] }} args
 * @returns {Promise<{
 *   copied: string[],
 *   skippedSymlinks: string[],
 *   skippedGit: string[],
 *   skippedOutside: string[],
 *   errors: Array<{ file: string, message: string }>,
 * }>}
 */
async function copyReviewTargetToSandbox({ sourceDir, destDir, files } = {}) {
  if (typeof sourceDir !== 'string' || sourceDir.length === 0) {
    throw new TypeError('copyReviewTargetToSandbox: `sourceDir` is required');
  }
  if (typeof destDir !== 'string' || destDir.length === 0) {
    throw new TypeError('copyReviewTargetToSandbox: `destDir` is required');
  }

  const copied = [];
  const skippedSymlinks = [];
  const skippedGit = [];
  const skippedOutside = [];
  const errors = [];

  const list = Array.isArray(files) ? files : [];
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.length === 0) {
      // Ignore non-string / empty entries safely rather than throwing.
      continue;
    }
    const relPath = external_node_path_.normalize(raw);

    if (isGitPath(relPath)) {
      skippedGit.push(raw);
      continue;
    }
    if (escapesRoot(sourceDir, relPath)) {
      skippedOutside.push(raw);
      continue;
    }
    if (await pathContainsSymlink(sourceDir, relPath)) {
      skippedSymlinks.push(raw);
      continue;
    }

    const srcPath = external_node_path_.join(sourceDir, relPath);
    const destPath = external_node_path_.join(destDir, relPath);
    try {
      await promises_.mkdir(external_node_path_.dirname(destPath), { recursive: true });
      // Copy the file contents only. COPYFILE_FICLONE is best-effort; symlinks
      // were already excluded above, so this always copies a regular file.
      await promises_.copyFile(srcPath, destPath);
      copied.push(raw);
    } catch (err) {
      errors.push({ file: raw, message: err?.message ?? String(err) });
    }
  }

  // Multi-layer re-check: prove no symlink survived into the clean cwd.
  const residual = await findResidualSymlinks(destDir);
  for (const link of residual) {
    try {
      await promises_.unlink(link);
    } catch {
      // Ignore unlink failure; it is still recorded so the caller can fail safe.
    }
    skippedSymlinks.push(external_node_path_.relative(destDir, link));
  }

  return { copied, skippedSymlinks, skippedGit, skippedOutside, errors };
}

/**
 * Create a fresh empty temp directory for use as a sandbox `HOME` or clean cwd
 * (`RIVER_EXEC_ROOT`). Thin wrapper over `fs.mkdtemp`, injectable for tests.
 *
 * Cleanup is the CALLER'S responsibility: wrap usage in `try/finally` and
 * remove the returned directory (e.g. `fs.rm(dir, { recursive: true,
 * force: true })`) on every path — success, spawn failure, timeout, exception —
 * so no sandbox directory is ever left behind (§11.2 lifecycle).
 *
 * @param {(prefix: string) => Promise<string>} [mkdtempImpl] - defaults to `fs.mkdtemp`
 * @param {string} [prefix] - path prefix; defaults to `os.tmpdir()/river-sandbox-`
 * @returns {Promise<string>} absolute path of the new empty directory
 */
function makeSandboxTempDir(mkdtempImpl, prefix) {
  const impl = typeof mkdtempImpl === 'function' ? mkdtempImpl : promises_.mkdtemp;
  const base =
    typeof prefix === 'string' && prefix.length > 0
      ? prefix
      : external_node_path_.join(external_node_os_.tmpdir(), 'river-sandbox-');
  return impl(base);
}

// EXTERNAL MODULE: external "node:child_process"
var external_node_child_process_ = __webpack_require__(1421);
;// CONCATENATED MODULE: ./src/lib/deterministic-command-executor.mjs
/**
 * Deterministic command executor — execFile launch + exit-code classification
 * (#1401 §11.8 (b), the RCE surface).
 *
 * SINGLE RESPONSIBILITY: receive one already-validated allowlist entry, launch
 * it in a caller-prepared clean cwd with a caller-prepared scrubbed env, and
 * classify the exit code into one of three states (§11.1 / §11.5.1):
 *   - `pass`       exit 0                → gate adds nothing
 *   - `fail`       exit non-zero         → STRICT_BLOCK (NO_GO), carries exitCode
 *   - `unrunnable` spawn error / timeout / invalid entry → DETERMINISTIC_UNRUNNABLE (ESCALATE)
 *
 * HARDENING / RCE surface notes:
 *
 * - **`execFile` is the ONLY execution point.** `node:child_process`'s `execFile`
 *   is imported once and called once. `exec` (shell string), `spawn`, and any
 *   template-string command are deliberately NOT used. `execFile` does not spawn
 *   a shell (equivalent to `{ shell: false }`), so argv elements are passed
 *   verbatim to the executable — `;`, `&&`, `$()`, `|` in an argument are inert
 *   text, never shell metacharacters.
 * - **stdout / stderr are never returned** (§10.3.2 (B)). Judgement reduces to
 *   the exit code only. Captured output is discarded; at most its byte length is
 *   recorded. No captured bytes reach the return value, a finding body, or a PR
 *   comment, so an attacker cannot steer a finding through stdout.
 * - **Entry is re-validated at the launch site** with `validateAllowlistEntry`
 *   (§11.1.2 multi-layer defense). An entry that fails re-validation is NOT
 *   executed and returns `unrunnable` (`invalid-entry`).
 * - **DoS limits** (§3.6): `timeout` (default 60s) with `killSignal: 'SIGKILL'`
 *   and `maxBuffer` (default 1 MiB). Descendant-process containment: `execFile`
 *   offers limited process-group control, so timeout enforcement relies on
 *   `killSignal` killing the direct child. Full process-group kill
 *   (`detached` + negative-PID `kill`) is intentionally NOT implemented here to
 *   avoid over-engineering; the design accepts this as a Linux-first residual
 *   (§3.6 / §6.8). CI runs on `ubuntu-latest`.
 *
 * DEFAULT OFF / INERT: this module ONLY exports functions. It does not read any
 * opt-in flag, does not import or touch the gate (`deriveGateDecision`) or CI
 * (`action.yml`), and nothing runs until a caller explicitly invokes
 * `executeDeterministicCommand`. Importing this module starts no process.
 */





/** reasonCode for a clean pass (exit 0). */
const DETERMINISTIC_PASS = 'DETERMINISTIC_PASS';

/** reasonCode for a violation: the command ran and exited non-zero (§11.5.1). */
const STRICT_BLOCK = 'STRICT_BLOCK';

/** reasonCode for "could not run" (spawn error / timeout / invalid entry). */
const deterministic_command_executor_DETERMINISTIC_UNRUNNABLE = 'DETERMINISTIC_UNRUNNABLE';

/** Default DoS limits (§3.6). Host-overridable via the `limits` argument. */
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_BUFFER = 1 << 20; // 1 MiB

/**
 * Run `execFile` and resolve with a normalized `{ error, stdout, stderr }`
 * shape (never rejects). Callback → Promise adapter over the ONE execFile call.
 * `stdout`/`stderr` are captured only so the length can be recorded; they are
 * dropped by the caller and never returned to the pipeline.
 *
 * @param {string} command absolute path to the executable
 * @param {string[]} args argv (passed verbatim; no shell)
 * @param {object} options execFile options ({ cwd, env, timeout, maxBuffer, killSignal })
 * @returns {Promise<{ error: (Error & { code?: number | string, signal?: string, killed?: boolean }) | null, stdout: string, stderr: string }>}
 */
function runExecFile(command, args, options) {
  return new Promise((resolve) => {
    // execFile — NO shell. This is the sole process-execution call in the module.
    // execFile can throw SYNCHRONOUSLY on malformed options (bad cwd/env); catch
    // so runExecFile never rejects (gemini #1431). A sync throw is a setup error.
    try {
      (0,external_node_child_process_.execFile)(command, args, options, (error, stdout, stderr) => {
        resolve({
          error: error ?? null,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      });
    } catch (syncError) {
      resolve({ error: syncError, stdout: '', stderr: '' });
    }
  });
}

/**
 * Execute one validated deterministic-allowlist entry and classify the result.
 *
 * The caller MUST supply:
 *   - `entry`      — the valid entry from `matchCommand` (absolute-path command,
 *                    argv `args`, `selfContained: true`). Re-validated here.
 *   - `sandboxDir` — the clean cwd prepared by the sandbox layer
 *                    (`makeSandboxTempDir` + `copyReviewTargetToSandbox`).
 *   - `env`        — the scrubbed child env from `buildSandboxEnv` (SAFE_ENV
 *                    allowlist only; no secrets, no NODE_OPTIONS).
 *   - `limits`     — `{ timeoutMs?, maxBuffer? }` (defaults 60000 / 1 MiB).
 *
 * @param {{
 *   entry: { command?: string, args?: string[], selfContained?: boolean, id?: string },
 *   sandboxDir: string,
 *   env: Record<string, string>,
 *   limits?: { timeoutMs?: number, maxBuffer?: number },
 * }} args
 * @returns {Promise<{
 *   status: 'pass' | 'fail' | 'unrunnable',
 *   exitCode?: number,
 *   reasonCode: string,
 *   durationMs: number,
 *   stdoutBytes?: number,
 *   unrunnableCause?: 'spawn-error' | 'timeout' | 'invalid-entry',
 * }>}
 */
async function executeDeterministicCommand({ entry, sandboxDir, env, limits } = {}) {
  const startedAt = Date.now();
  const durationSince = () => Date.now() - startedAt;

  // Multi-layer defense (§11.1.2): re-validate the entry at the launch site. An
  // entry that fails re-validation is never executed.
  const validation = validateAllowlistEntry(entry);
  if (!validation.valid) {
    return {
      status: 'unrunnable',
      reasonCode: deterministic_command_executor_DETERMINISTIC_UNRUNNABLE,
      durationMs: durationSince(),
      unrunnableCause: 'invalid-entry',
    };
  }

  if (typeof sandboxDir !== 'string' || sandboxDir.length === 0) {
    // No clean cwd — do not fall back to process.cwd(); treat as unrunnable.
    return {
      status: 'unrunnable',
      reasonCode: deterministic_command_executor_DETERMINISTIC_UNRUNNABLE,
      durationMs: durationSince(),
      unrunnableCause: 'invalid-entry',
    };
  }

  const timeoutMs =
    typeof limits?.timeoutMs === 'number' && limits.timeoutMs > 0
      ? limits.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const maxBuffer =
    typeof limits?.maxBuffer === 'number' && limits.maxBuffer > 0
      ? limits.maxBuffer
      : DEFAULT_MAX_BUFFER;

  const options = {
    cwd: sandboxDir,
    // Scrubbed env ONLY — do not merge process.env (would re-introduce secrets).
    env: env && typeof env === 'object' ? env : {},
    timeout: timeoutMs,
    maxBuffer,
    killSignal: 'SIGKILL',
    windowsHide: true,
  };

  const { error, stdout } = await runExecFile(entry.command, entry.args ?? [], options);
  // Record only the byte length; the captured stdout itself is dropped here.
  const stdoutBytes = Buffer.byteLength(stdout);
  const durationMs = durationSince();

  // (1) No error → clean exit 0 → pass. Gate adds nothing.
  if (error == null) {
    return { status: 'pass', reasonCode: DETERMINISTIC_PASS, durationMs, exitCode: 0, stdoutBytes };
  }

  // (2) Killed by a signal → unrunnable (ESCALATE). `error.killed` is true when
  //     the runtime SIGKILLs the child for exceeding `timeout` (or `maxBuffer`
  //     overflow). An EXTERNAL signal (SIGKILL/SIGTERM/SIGSEGV crash) instead
  //     sets `error.signal` (a string) but NOT `error.killed` (gemini #1431), so
  //     check both. A signal-terminated process produced no clean verdict →
  //     "cannot judge", not a violation. Checked BEFORE the numeric-exit-code
  //     branch because a killed process has no meaningful exit code.
  if (
    error.killed === true ||
    typeof error.signal === 'string' ||
    error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
  ) {
    return {
      status: 'unrunnable',
      reasonCode: deterministic_command_executor_DETERMINISTIC_UNRUNNABLE,
      durationMs,
      unrunnableCause: 'timeout',
      stdoutBytes,
    };
  }

  // (3) Process ran and exited non-zero → violation → STRICT_BLOCK (NO_GO).
  //     On a real exit, execFile sets `error.code` to the numeric exit code.
  if (typeof error.code === 'number') {
    return {
      status: 'fail',
      exitCode: error.code,
      reasonCode: STRICT_BLOCK,
      durationMs,
      stdoutBytes,
    };
  }

  // (4) Everything else — spawn failure (ENOENT / EACCES, `error.code` is a
  //     string errno) — → unrunnable (ESCALATE). The command could not start.
  return {
    status: 'unrunnable',
    reasonCode: deterministic_command_executor_DETERMINISTIC_UNRUNNABLE,
    durationMs,
    unrunnableCause: 'spawn-error',
    stdoutBytes,
  };
}

;// CONCATENATED MODULE: ./src/lib/deterministic-command-orchestrator.mjs
/**
 * Deterministic command orchestrator — the confluence point (#1401 §11.8 (c2a) / §11.5.3).
 *
 * Composes the four merged building blocks into a single gate pass:
 *   allowlist (validate) → sandbox (prepare env + clean cwd) → executor (run)
 *   → aggregate into the { strictBlock, deterministicUnrunnable } gate inputs
 *   consumed by `deriveGateDecision` (rules 5b / 5c).
 *
 * TRUST BOUNDARY (§11.6). The allowlist is read ONLY from the host-trusted base
 * checkout (`trustedTree`). The PR head's `.river/deterministic-allowlist.yaml`
 * is NEVER read — an implementation agent under review must not be able to add
 * its own command to the allowlist. When `trustedTree` is not supplied or the
 * base allowlist file is absent, this function runs NOTHING and returns the
 * safe-default empty result — deterministic gates are opt-in (§11.6).
 *
 * INJECTABLE EXECUTOR / OFF BY DEFAULT. The actual process launch is reached
 * only through the injected `execImpl` (default `executeDeterministicCommand`).
 * This module itself imports `child_process` transitively via the executor but
 * starts no process on import: nothing runs until a caller invokes
 * `runDeterministicGates`. As of §11.8 (c2) the review pipeline (local-runner /
 * review-plan) invokes this — but ONLY behind a double env-var gate
 * (`RIVER_DETERMINISTIC_EXEC=1` AND `RIVER_TRUSTED_TREE`); absent either, the
 * caller never imports this module and behavior is unchanged. CI wiring
 * (action.yml) lands in (d). Tests inject a mock `execImpl` and `mkdtempImpl`
 * so no real process is spawned.
 */








/** Relative path of the host-trusted allowlist inside the base checkout (§11.6). */
const ALLOWLIST_RELATIVE_PATH = '.river/deterministic-allowlist.yaml';

/** Safe-default empty result: nothing ran, gate learns nothing. */
function emptyResult() {
  return { strictBlock: false, deterministicUnrunnable: false, results: [] };
}

/**
 * Read + validate the host-trusted allowlist from the base checkout. Returns the
 * surviving valid entries, or `null` when `trustedTree` is unusable / the file
 * is missing (safe-default: run nothing). Never reads the PR head allowlist.
 *
 * @param {string | undefined} trustedTree base-checkout path
 * @returns {Promise<Array<object> | null>}
 */
async function loadTrustedAllowlist(trustedTree) {
  if (typeof trustedTree !== 'string' || trustedTree.length === 0) return null;
  const allowlistPath = external_node_path_.join(trustedTree, ALLOWLIST_RELATIVE_PATH);
  let yamlText;
  try {
    yamlText = await promises_.readFile(allowlistPath, 'utf8');
  } catch {
    // Missing / unreadable base allowlist → deterministic gates are not opted in.
    return null;
  }
  return loadValidAllowlist(yamlText).valid;
}

/**
 * Extract the deterministic-gate command definitions from the selected skills.
 * Only skills whose `metadata.deterministicGate` carries a non-empty `command`
 * are candidates. `args` defaults to `[]`.
 *
 * @param {Array<object>} selected
 * @returns {Array<{ skillId: string, command: string, args: string[] }>}
 */
function extractGateCommands(selected) {
  const list = Array.isArray(selected) ? selected : [];
  const gates = [];
  for (const skill of list) {
    const gate = skill?.metadata?.deterministicGate;
    if (gate == null || typeof gate !== 'object') continue;
    if (typeof gate.command !== 'string' || gate.command.length === 0) continue;
    const args = Array.isArray(gate.args) ? gate.args : [];
    const skillId = skill?.id ?? skill?.metadata?.id ?? gate.command;
    gates.push({ skillId, command: gate.command, args });
  }
  return gates;
}

/**
 * Run the deterministic gates for a review pass and aggregate their verdicts.
 *
 * Processing (§11.5.3 confluence):
 *  1. Read the host-trusted allowlist from `trustedTree`. Absent → run nothing,
 *     return the safe-default empty result (PR-head allowlist is never read).
 *  2. Collect each selected skill's `deterministicGate` {command, args}.
 *  3. Match each against the valid allowlist by EXACT argv equality
 *     (`matchCommand`). No match → skip (do not run an unlisted command).
 *  4. For each match: prepare a clean cwd + an empty HOME (two temp dirs),
 *     stage the changed files, build the scrubbed env, then invoke the injected
 *     `execImpl`. Temp dirs are removed in `finally` on every path.
 *  5. Aggregate: any `fail` → strictBlock; any `unrunnable` → deterministicUnrunnable.
 *     Both can be true at once (the gate composes 5b > 5c).
 *
 * @param {object} opts
 * @param {string} [opts.trustedTree] base-checkout path (host-trusted allowlist source)
 * @param {Array<object>} [opts.selected] selected skills (metadata.deterministicGate)
 * @param {string} [opts.reviewSourceDir] dir the changed files are copied FROM
 * @param {string[]} [opts.changedFiles] relative paths to stage into the clean cwd
 * @param {Record<string, string | undefined>} [opts.processEnv] source env (e.g. process.env)
 * @param {(args: object) => Promise<{ status: string, reasonCode: string }>} [opts.execImpl]
 *   injected executor; defaults to `executeDeterministicCommand`
 * @param {(prefix: string) => Promise<string>} [opts.mkdtempImpl] injected mkdtemp (tests)
 * @returns {Promise<{ strictBlock: boolean, deterministicUnrunnable: boolean,
 *   results: Array<{ skillId: string, status: string, reasonCode: string }> }>}
 */
async function runDeterministicGates({
  trustedTree,
  selected,
  reviewSourceDir,
  changedFiles,
  processEnv,
  execImpl,
  mkdtempImpl,
} = {}) {
  const validEntries = await loadTrustedAllowlist(trustedTree);
  if (validEntries == null) return emptyResult();

  const gates = extractGateCommands(selected);
  if (gates.length === 0) return emptyResult();

  const exec = typeof execImpl === 'function' ? execImpl : executeDeterministicCommand;

  let strictBlock = false;
  let deterministicUnrunnable = false;
  const results = [];

  for (const gate of gates) {
    const entry = matchCommand({ command: gate.command, args: gate.args }, validEntries);
    // Not on the host-trusted allowlist → never run it.
    if (entry == null) continue;

    // Declared outside try so finally can clean up whichever dirs were created
    // even if the SECOND makeSandboxTempDir throws (gemini #1433 leak fix).
    let cleanCwd;
    let emptyHome;
    try {
      cleanCwd = await makeSandboxTempDir(mkdtempImpl);
      emptyHome = await makeSandboxTempDir(mkdtempImpl);
      await copyReviewTargetToSandbox({
        sourceDir: reviewSourceDir,
        destDir: cleanCwd,
        files: Array.isArray(changedFiles) ? changedFiles : [],
      });
      const env = buildSandboxEnv(processEnv, { home: emptyHome });
      const result = await exec({ entry, sandboxDir: cleanCwd, env });

      const status = result?.status;
      const reasonCode = result?.reasonCode;
      if (status === 'fail') strictBlock = true;
      if (status === 'unrunnable') deterministicUnrunnable = true;
      results.push({ skillId: gate.skillId, status, reasonCode });
    } finally {
      // Remove both sandbox temp dirs on every path. Each rm is individually
      // guarded so a failure removing one still attempts the other (gemini #1433).
      for (const dir of [cleanCwd, emptyHome]) {
        if (!dir) continue;
        try {
          await promises_.rm(dir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors so the remaining dir is still attempted.
        }
      }
    }
  }

  return { strictBlock, deterministicUnrunnable, results };
}


/***/ })

};

//# sourceMappingURL=252.index.mjs.map