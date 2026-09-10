#!/usr/bin/env node
// Normalize the GitHub Action dist so its bytes depend only on the sources,
// never on the machine or the directory the build happened to run in.
//
// Two normalizations and one asset copy run here:
//
//   1. Line endings -> LF. ncc bundles tslib and other deps with CRLF on some
//      platforms; this ensures cross-platform deterministic output.
//   2. Build-directory name -> the canonical checkout name (see below).
//   3. Flow assets -> dist/flows and dist/schemas (see the bottom of the file).
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(repoRoot, 'runners/github-action/dist');

// --- 2. build-directory name -------------------------------------------------
//
// ncc resolves relocated assets relative to the PARENT of the build root, so
// both the emitted asset directory (dist/<name>/...) and the asset references
// inside the bundle (`__webpack_require__.ab + "<name>/..."`) are prefixed with
// `basename(repoRoot)`. The committed dist was therefore built in a directory
// named after the repository, which is what `actions/checkout` produces in CI.
// A build run from a git worktree such as `.claude/worktrees/agent-<id>/` bakes
// that directory name in instead, and `Action dist freshness` then reports a
// diff for a bundle whose sources did not change (observed in #1894).
//
// The canonical name is read from package.json `name` rather than hardcoded,
// so a repository rename only has to be applied in one place. It is not read
// from the git remote: the build must also work from a source tarball or a CI
// cache where no git metadata is present, and a remote can be renamed or
// missing without the checkout directory changing.
const canonicalName = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).name.replace(
  /^@[^/]+\//,
  ''
);
const buildDirName = basename(repoRoot.replace(/[/\\]+$/, ''));

// Only the ncc asset-prefix expression is rewritten, never a bare occurrence of
// the directory name. The repository name also appears in the bundle as a
// package name, as a URL, and inside vendored source paths such as
// `skills/agent-skills/river-review/...`; a plain string replacement would
// corrupt those. Anchoring on `__webpack_require__.ab` restricts the rewrite to
// strings ncc itself generated for asset resolution.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const assetPrefixPattern = new RegExp(
  `(__webpack_require__\\.ab\\s*\\+\\s*")${escapeRegExp(buildDirName)}/`,
  'g'
);

const renameBuildDirName = buildDirName !== canonicalName;

let normalized = 0;
for (const file of readdirSync(distDir)) {
  if (file.endsWith('.mjs') || file.endsWith('.map') || file.endsWith('.cjs')) {
    const path = join(distDir, file);
    const content = readFileSync(path, 'utf8');
    let fixed = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (renameBuildDirName) {
      fixed = fixed.replace(assetPrefixPattern, `$1${canonicalName}/`);
    }
    if (fixed !== content) {
      writeFileSync(path, fixed, 'utf8');
      normalized++;
    }
  }
}

// The emitted asset directory is renamed rather than left in place or merely
// reported: leaving `dist/<worktree name>/` behind makes `git status` on dist/
// dirty (the freshness job compares with `git status --porcelain`), and the
// bundle references the canonical directory after the rewrite above, so the
// assets have to live there for the built action to resolve them.
let renamedDir = false;
if (renameBuildDirName) {
  const staleDir = join(distDir, buildDirName);
  const targetDir = join(distDir, canonicalName);
  if (existsSync(staleDir)) {
    if (existsSync(targetDir)) {
      // A previous build already produced the canonical directory. The two hold
      // the same assets, so overwrite rather than fail.
      cpSync(staleDir, targetDir, { recursive: true, force: true });
      rmSync(staleDir, { recursive: true, force: true });
    } else {
      renameSync(staleDir, targetDir);
    }
    renamedDir = true;
  }
}

if (normalized > 0) console.log(`Normalized ${normalized} file(s) in dist/`);
if (renameBuildDirName && (normalized > 0 || renamedDir)) {
  console.log(
    `Rewrote build directory name "${buildDirName}" to "${canonicalName}" in dist/ ` +
      `(build ran outside a checkout named "${canonicalName}").`
  );
}

// --- 3. Flow assets ------------------------------------------------------------
//
// `river review plan --entry <name>` (#2054 PR-3, Beta) reads `flows/` and
// validates each document against three schemas through src/lib/flow-loader.mjs.
// ncc does not bundle either (#2105): the loader builds every file name at
// runtime precisely so the asset relocator leaves it alone (#1900 / #2111). The
// copy is therefore made here, deterministically, rather than left to ncc's
// static analysis. The loader looks for `flows/` and `schemas/` as siblings of
// the bundle first, so the dist reads what it ships (#2054 PR-5, #2105 (b)).
//
// Only the three schemas the loader compiles are copied — not `schemas/` as a
// whole — so a schema that is not a runtime dependency cannot drift into the
// bundle. The list mirrors FLOW_SCHEMA_FILENAMES in src/lib/flow-loader.mjs
// (not imported: this script must run in a checkout that has no node_modules,
// see tests/normalize-dist.test.mjs); the same test pins the two lists equal.
const FLOW_SCHEMA_FILES = [
  'flow-entry-map.schema.json',
  'flow.schema.json',
  'review-intent.schema.json',
];
const isFlowAsset = (name) =>
  name === 'entry-map.json' || name.endsWith('.flow.json') || name.endsWith('.intent.json');

const flowsSrc = join(repoRoot, 'flows');
const schemasSrc = join(repoRoot, 'schemas');
// A build without the assets is a broken build, not a build with fewer files:
// fail loudly rather than emit a dist whose `--entry` exits 1 (#2105 again).
for (const [label, dir] of [
  ['flows/', flowsSrc],
  ['schemas/', schemasSrc],
]) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      `normalize-dist: ${label} not found at ${dir}; the dist cannot ship --entry without it`
    );
  }
}
for (const fileName of FLOW_SCHEMA_FILES) {
  if (!existsSync(join(schemasSrc, fileName))) {
    throw new Error(
      `normalize-dist: schemas/${fileName} not found; it is a runtime dependency of the Flow loader`
    );
  }
}
const flowsDst = join(distDir, 'flows');
rmSync(flowsDst, { recursive: true, force: true });
cpSync(flowsSrc, flowsDst, {
  recursive: true,
  filter: (src) => (statSync(src).isDirectory() ? true : isFlowAsset(basename(src))),
});
const schemasDst = join(distDir, 'schemas');
rmSync(schemasDst, { recursive: true, force: true });
mkdirSync(schemasDst, { recursive: true });
for (const fileName of FLOW_SCHEMA_FILES) {
  copyFileSync(join(schemasSrc, fileName), join(schemasDst, fileName));
}
console.log(`Copied flows/ and ${FLOW_SCHEMA_FILES.length} schema(s) into dist/ (#2054 PR-5)`);
