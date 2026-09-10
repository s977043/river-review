// A `gh` stand-in for tests of scripts/pr-unstall.sh and scripts/merge-chain.sh.
//
// The stub answers each `gh` invocation from a routing table: the first route
// whose regex matches the joined argv (with any `--jq <filter>` removed) wins,
// its fixture file is printed, and the `--jq` filter, if any, is applied with
// the real `jq`. Every call is appended to `<dir>/calls.log`, so a test can
// assert that a dry-run never reached a write endpoint.
//
// Routes are `{ match: RegExp | string, file?: string, body?: string, exit?: number, after?: number }`.
// Anchor every route with `^...$`: an unanchored route lets a typo in the
// script's query string (`per_page` -> `perpage`) or `--json` field list pass
// unnoticed (#2095).
//
// `after: N` lets the first N matching calls fall through to the routes below
// it and answers from the (N+1)-th on, so one endpoint can succeed for an
// early read and fail for a later one (the `|| return 2` pins in
// merge-chain.sh). Put the `after` route above the healthy route for the
// same endpoint. The count lives in `<dir>/hits-<route index>` because every
// `gh` call is a fresh process.
//
// The stub also mimics the argument checks the real `gh` performs, so a typo
// in the script fails here the way it would fail against GitHub:
//   --json <fields>   every field must be a key of the fixture's objects
//                     (real gh: "Unknown JSON field"), exit 1 otherwise
//   --method <M>      must be GET / POST / PUT / PATCH / DELETE
//   -f / -F <k=v>     must carry a `key=value` pair
//   --paginate        recognised as a flag (takes no value)
// `--json`, `--method`, `--paginate`, `-f` and `-F` stay in the argv the route
// regex sees, so a route can (and should) pin them literally.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTempDir } from './temp-dir.mjs';
import { spawnSyncGuarded } from './spawn-guard.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const FIXTURE_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'scripts-gh');

export function fixture(name) {
  return join(FIXTURE_DIR, name);
}

const STUB_SOURCE = `#!/usr/bin/env bash
set -u
dir="\${GH_STUB:?}"
printf '%s\\n' "$*" >> "\${dir}/calls.log"
filter=''
json_fields=''
method=''
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --jq) filter="$2"; shift ;;
    --json)
      json_fields="\${2:-}"
      if [ -z "\${json_fields}" ]; then
        echo "gh-stub: --json needs a field list" >&2
        exit 1
      fi
      args+=("$1" "$2"); shift ;;
    --method)
      method="\${2:-}"
      case "\${method}" in
        GET|POST|PUT|PATCH|DELETE) ;;
        *) echo "gh-stub: --method needs GET/POST/PUT/PATCH/DELETE, got: \${method}" >&2; exit 1 ;;
      esac
      args+=("$1" "$2"); shift ;;
    --paginate) args+=("$1") ;;
    -f|-F)
      case "\${2:-}" in
        *=*) ;;
        *) echo "gh-stub: $1 needs key=value, got: \${2:-}" >&2; exit 1 ;;
      esac
      args+=("$1" "$2"); shift ;;
    *) args+=("$1") ;;
  esac
  shift
done
joined="\${args[*]}"
n=0
while IFS= read -r route; do
  n=$((n + 1))
  regex="\${route%%	*}"
  rest="\${route#*	}"
  file="\${rest%%	*}"
  rest="\${rest#*	}"
  code="\${rest%%	*}"
  after="\${rest#*	}"
  if [[ "\${joined}" =~ \${regex} ]]; then
    if [ "\${after}" -gt 0 ]; then
      hits=0
      [ -f "\${dir}/hits-\${n}" ] && hits=$(cat "\${dir}/hits-\${n}")
      hits=$((hits + 1))
      printf '%s' "\${hits}" > "\${dir}/hits-\${n}"
      [ "\${hits}" -gt "\${after}" ] || continue
    fi
    # Real gh rejects a --json field it does not know before answering; the
    # fixture's keys stand in for that field list. Only object elements are
    # checked, so a fixture that deliberately carries a non-object element
    # still reaches the script under test.
    if [ -n "\${json_fields}" ] && [ "\${code}" = 0 ] && jq -e . "\${file}" >/dev/null 2>&1; then
      if ! jq -e --arg fields "\${json_fields}" '
        ($fields | split(",")) as $want
        | (if type == "array" then . else [.] end | map(select(type == "object"))) as $objs
        | if ($objs | length) == 0 then true
          else ($objs | map(keys) | add | unique) as $have
            | all($want[]; . as $f | $have | index($f) != null) end
      ' "\${file}" >/dev/null; then
        echo "gh-stub: Unknown JSON field in --json \${json_fields} (fixture keys: $(jq -c 'if type == "array" then map(select(type == "object")) | map(keys) | add | unique else keys end' "\${file}"))" >&2
        exit 1
      fi
    fi
    if [ -n "\${filter}" ]; then
      jq -r "\${filter}" < "\${file}"
    else
      cat "\${file}"
    fi
    exit "\${code}"
  fi
done < "\${dir}/routes"
echo "gh-stub: no route for: \${joined}" >&2
exit 99
`;

/**
 * Create a stub directory with a `gh` executable and a routing table.
 * @param {Array<{match: RegExp|string, file?: string, body?: string, exit?: number, after?: number}>} routes
 * @returns {{ dir: string, calls: () => string[] }}
 */
export function createGhStub(routes) {
  const dir = createTempDir({ prefix: 'gh-stub-' });
  const bodies = join(dir, 'bodies');
  mkdirSync(bodies);
  const lines = routes.map((route, i) => {
    const regex = route.match instanceof RegExp ? route.match.source : route.match;
    let file = route.file;
    if (route.body !== undefined) {
      file = join(bodies, `route-${i}`);
      writeFileSync(file, route.body);
    }
    if (!file) throw new Error(`route ${i} needs file or body`);
    return `${regex}\t${file}\t${route.exit ?? 0}\t${route.after ?? 0}`;
  });
  writeFileSync(join(dir, 'routes'), `${lines.join('\n')}\n`);
  writeFileSync(join(dir, 'calls.log'), '');
  writeFileSync(join(dir, 'gh'), STUB_SOURCE);
  chmodSync(join(dir, 'gh'), 0o755);
  return {
    dir,
    calls: () =>
      readFileSync(join(dir, 'calls.log'), 'utf8')
        .split('\n')
        .filter((line) => line !== ''),
  };
}

/**
 * Invoke the stub `gh` directly, the way a script would.
 * @param {{ dir: string }} stub
 * @param {string[]} args
 */
export function runGh(stub, args) {
  const result = spawnSyncGuarded(join(stub.dir, 'gh'), args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GH_STUB: stub.dir },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Copy a repo script into a temp dir with one string replaced, for mutation
 * tests that must not edit `scripts/` itself. Returns an absolute path that
 * `runScriptWithStub` accepts. Throws when `from` is absent, so a mutation
 * cannot silently turn into a no-op once the script changes.
 *
 * The copy lives alone in its temp dir, so a script that calls a sibling
 * through `SCRIPT_DIR` (merge-chain.sh -> wait-pr-ready.sh) needs a second
 * mutation that points `SCRIPT_DIR` back at `scripts/`: pass the absolute
 * path of the first copy as `script` to stack mutations.
 * @param {string} script path relative to the repo root, or an absolute path
 *   (an earlier `mutateScript` copy)
 * @param {string} from
 * @param {string} to
 */
export function mutateScript(script, from, to) {
  const sourcePath = isAbsolute(script) ? script : join(REPO_ROOT, script);
  const source = readFileSync(sourcePath, 'utf8');
  if (!source.includes(from)) throw new Error(`${script} does not contain: ${from}`);
  const dir = createTempDir({ prefix: 'gh-stub-mutant-' });
  const target = join(dir, basename(script));
  writeFileSync(target, source.replaceAll(from, to));
  chmodSync(target, 0o755);
  return target;
}

/** The `scripts/` dir, for pinning `SCRIPT_DIR` in a `mutateScript` copy. */
export const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');

/**
 * Run a repo script through bash with the stub `gh` first on PATH.
 * @param {string} script path relative to the repo root, e.g. 'scripts/pr-unstall.sh',
 *   or an absolute path (a `mutateScript` copy)
 * @param {string[]} args
 * @param {{ dir: string }} stub
 * @param {Record<string,string>} [env]
 */
export function runScriptWithStub(script, args, stub, env = {}) {
  const scriptPath = isAbsolute(script) ? script : join(REPO_ROOT, script);
  const result = spawnSyncGuarded('bash', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${stub.dir}:${process.env.PATH}`,
      GH_STUB: stub.dir,
      REPO: 'owner/repo',
      INTERVAL_SECONDS: '0',
      TIMEOUT_SECONDS: '5',
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Source a script and call one of its judging functions with string arguments,
 * without any `gh` on the path.
 */
export function callFunction(script, fn, args) {
  const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
  const result = spawnSyncGuarded(
    'bash',
    ['-c', `source '${join(REPO_ROOT, script)}' && ${fn} ${quoted}`],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin' },
    }
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
