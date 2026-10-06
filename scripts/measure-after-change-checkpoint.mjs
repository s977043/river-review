#!/usr/bin/env node
// Dogfood measurement of the after-change Fast Verification Checkpoint
// (#2275 PR-3D, Epic #2054 Phase 3).
//
// Replays real commits of this repository as after-change events and drives
// the REAL hook (`.claude/hooks/after-change-observe.sh`) on each one, so what
// is measured is what a host runs: bash + jq + git + the Node adapter + the
// checkpoint core + `runDeterministicGates` (#1401).
//
// Population: `git rev-list --first-parent -n <count> <base>`, replayed in a
// disposable `git clone --shared` under os.tmpdir(). For each commit C three
// events fire with HEAD = C^1 and the index left at C^1, which is the state an
// agent's unstaged Write/Edit leaves behind (new files are untracked):
//
//   partial  only the first path C changed is applied on top of C^1
//   full     the whole of C is in the working tree
//   repeat   the hook fires again on the unchanged `full` state
//
// Each event runs under two host configurations:
//
//   repo-default  what this repository ships: no trusted allowlist, no check
//                 selected
//   trusted-true  a host-trusted allowlist with `/usr/bin/true`, selected. The
//                 checker costs nothing, so the latency is the checkpoint's own
//                 overhead (staging, sandbox, spawn), not a checker's
//
// Every Node process the hook starts is loaded with `scripts/lib/
// llm-call-guard.mjs`, which records model-SDK module resolution and refuses
// and records any outbound connection. The run fails (exit 1) when a provider
// is reached or when a run produced evidence without the guard loaded.
//
// Usage:
//   node scripts/measure-after-change-checkpoint.mjs              # report
//   node scripts/measure-after-change-checkpoint.mjs --json       # raw JSON
//   node scripts/measure-after-change-checkpoint.mjs --base <sha> --count <n>

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ALLOWLIST_RELATIVE_PATH } from '../src/lib/deterministic-command-orchestrator.mjs';
import { isDirectRun } from './lib/is-direct-run.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const HOOK = path.join(repoRoot, '.claude/hooks/after-change-observe.sh');
const GUARD = path.join(repoRoot, 'scripts/lib/llm-call-guard.mjs');

/** The recorded population of docs/development/2275-phase3d-after-change-dogfood.md. */
export const DEFAULT_POPULATION = Object.freeze({
  base: 'b190b8f8914562c49310f246afe9107f48fe23df',
  count: 30,
});

export const EVENTS = Object.freeze(['partial', 'full', 'repeat']);
export const CONFIGS = Object.freeze(['repo-default', 'trusted-true']);

const TRUE_BIN = '/usr/bin/true';
const EXECUTED = new Set(['pass', 'fail', 'unrunnable']);

const gitIn = (cwd, args, options = {}) =>
  execFileSync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, ...options });

/** Nearest-rank percentile; `null` for an empty sample. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const rate = (count, total) => (total === 0 ? null : count / total);

/**
 * Aggregate the per-run rows of ONE configuration.
 *
 * duplicateExecutionRate  runs that executed a check on a (occurrenceKey,
 *                         working-tree digest) pair an earlier executed run
 *                         already covered, over all executed runs
 * occurrenceKeyCollisionRate  runs whose occurrenceKey was already seen with a
 *                         DIFFERENT working-tree digest, over runs with evidence.
 *                         Non-zero means occurrenceKey alone cannot be the
 *                         dedup key without suppressing a real change
 */
export function summarize(runs) {
  const withEvidence = runs.filter((run) => run.evidence != null);
  const statusCounts = {};
  for (const run of runs) {
    const status = run.evidence?.status ?? 'not-run';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  const reasonCounts = {};
  for (const run of withEvidence) {
    reasonCounts[run.evidence.reasonCode] = (reasonCounts[run.evidence.reasonCode] ?? 0) + 1;
  }

  const executed = withEvidence.filter((run) =>
    run.evidence.checks.some((check) => EXECUTED.has(check.status))
  );
  const seenPairs = new Set();
  let duplicates = 0;
  for (const run of executed) {
    const pair = `${run.evidence.occurrenceKey}\0${run.digest}`;
    if (seenPairs.has(pair)) duplicates += 1;
    seenPairs.add(pair);
  }
  const digestsByKey = new Map();
  let collisions = 0;
  for (const run of withEvidence) {
    const digests = digestsByKey.get(run.evidence.occurrenceKey) ?? new Set();
    if (digests.size > 0 && !digests.has(run.digest)) collisions += 1;
    digests.add(run.digest);
    digestsByKey.set(run.evidence.occurrenceKey, digests);
  }

  const wall = runs.map((run) => run.wallMs);
  const core = withEvidence.map((run) => run.evidence.totalDurationMs);
  const round = (value) => (value == null ? null : Math.round(value * 10) / 10);
  return {
    runs: runs.length,
    hookWallMs: { p50: round(percentile(wall, 50)), p95: round(percentile(wall, 95)) },
    checkpointMs: { p50: round(percentile(core, 50)), p95: round(percentile(core, 95)) },
    statusCounts,
    reasonCounts,
    rates: {
      unrunnable: rate(statusCounts.unrunnable ?? 0, runs.length),
      skipped: rate(statusCounts.skipped ?? 0, runs.length),
      bypassed: rate(statusCounts.bypassed ?? 0, runs.length),
      notRun: rate(statusCounts['not-run'] ?? 0, runs.length),
      duplicateExecution: rate(duplicates, executed.length),
      occurrenceKeyCollision: rate(collisions, withEvidence.length),
    },
    executedRuns: executed.length,
    llmGuard: {
      guardLoadedRuns: runs.filter((run) => run.guard.loaded).length,
      evidenceWithoutGuard: withEvidence.filter((run) => !run.guard.loaded).length,
      providerModuleLoads: runs.reduce((sum, run) => sum + run.guard.providerModules, 0),
      networkAttempts: runs.reduce((sum, run) => sum + run.guard.network, 0),
    },
  };
}

/** True when the guard proves 0 LLM/network calls for every run that produced evidence. */
export function llmGuardHolds(summary) {
  const guard = summary.llmGuard;
  return (
    guard.providerModuleLoads === 0 &&
    guard.networkAttempts === 0 &&
    guard.evidenceWithoutGuard === 0
  );
}

/** Content of the working tree relative to HEAD, as the hook would see it. */
function workingTreeDigest(clone) {
  const hash = crypto.createHash('sha256');
  hash.update(gitIn(clone, ['diff', '--binary', 'HEAD']));
  const untracked = gitIn(clone, ['ls-files', '-z', '--others', '--exclude-standard'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
  for (const file of untracked) {
    hash.update(`\0${file}\0`);
    const full = path.join(clone, file);
    const stat = fs.lstatSync(full);
    hash.update(stat.isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full));
  }
  return hash.digest('hex');
}

/** What the hook's own git view of one `full` event contains (input bands). */
function describeChange(clone) {
  const fields = gitIn(clone, ['diff', '-z', '--name-status', 'HEAD'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const letters = {};
  const paths = [];
  for (let i = 0; i < fields.length; i += 1) {
    const letter = fields[i][0];
    letters[letter] = (letters[letter] ?? 0) + 1;
    const width = letter === 'R' || letter === 'C' ? 2 : 1;
    paths.push(...fields.slice(i + 1, i + 1 + width));
    i += width;
  }
  const untracked = gitIn(clone, ['ls-files', '-z', '--others', '--exclude-standard'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  paths.push(...untracked);
  const symlinks = untracked.filter((file) =>
    fs.lstatSync(path.join(clone, file)).isSymbolicLink()
  );
  return {
    nameStatus: letters,
    untracked: untracked.length,
    nonAsciiPaths: paths.filter((file) => /[^\x20-\x7e]/.test(file)).length,
    untrackedSymlinks: symlinks.length,
    files: paths.length,
  };
}

function checkoutParent(clone, commit) {
  gitIn(clone, [
    '-c',
    'advice.detachedHead=false',
    'checkout',
    '-q',
    '--force',
    '--detach',
    `${commit}^1`,
  ]);
  gitIn(clone, ['clean', '-fdq']);
}

function applyPartial(clone, commit) {
  const first = gitIn(clone, ['diff', '--name-only', '-z', `${commit}^1`, commit])
    .toString('utf8')
    .split('\0')
    .find(Boolean);
  if (first == null) return;
  const target = path.join(clone, first);
  const exists = gitIn(clone, ['ls-tree', '-z', '--name-only', commit, '--', first]).length > 0;
  if (!exists) {
    fs.rmSync(target, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { force: true });
  fs.writeFileSync(target, gitIn(clone, ['show', `${commit}:${first}`]));
}

function applyFull(clone, commit) {
  gitIn(clone, [
    '-c',
    'advice.detachedHead=false',
    'checkout',
    '-q',
    '--force',
    '--detach',
    commit,
  ]);
  gitIn(clone, ['reset', '-q', `${commit}^1`]);
}

function readGuardLog(file) {
  const guard = { loaded: false, providerModules: 0, network: 0 };
  if (!fs.existsSync(file)) return guard;
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const { event } = JSON.parse(line);
    if (event === 'guard-loaded') guard.loaded = true;
    if (event === 'provider-module') guard.providerModules += 1;
    if (event === 'network') guard.network += 1;
  }
  return guard;
}

function runHook({ clone, workDir, config, trustedTree, selectedFile }) {
  const tmp = fs.mkdtempSync(path.join(workDir, 'run-'));
  const guardLog = path.join(tmp, 'guard.jsonl');
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`,
    HOME: tmp,
    TMPDIR: tmp,
    CLAUDE_PROJECT_DIR: clone,
    RIVER_AFTER_CHANGE_OBSERVE: '1',
    NODE_OPTIONS: `--import=${pathToFileURL(GUARD).href}`,
    RIVER_LLM_GUARD_LOG: guardLog,
    // Sentinels, not keys: a provider reached on this path would try to use
    // them and hit the guard's network refusal instead of a silent dry run.
    ANTHROPIC_API_KEY: 'sentinel-not-a-key',
    OPENAI_API_KEY: 'sentinel-not-a-key',
    GOOGLE_API_KEY: 'sentinel-not-a-key',
    GEMINI_API_KEY: 'sentinel-not-a-key',
  };
  if (config === 'trusted-true') {
    env.RIVER_TRUSTED_TREE = trustedTree;
    env.RIVER_AFTER_CHANGE_SELECTED = selectedFile;
  }
  const started = performance.now();
  const child = spawnSync('/bin/bash', [HOOK], {
    cwd: clone,
    env,
    input: JSON.stringify({ tool_name: 'Edit', tool_input: {} }),
    encoding: 'utf8',
  });
  const wallMs = performance.now() - started;
  const evidenceDir = path.join(tmp, 'river-review-after-change');
  const files = fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir) : [];
  const evidence =
    files.length === 1
      ? JSON.parse(fs.readFileSync(path.join(evidenceDir, files[0]), 'utf8'))
      : null;
  return {
    wallMs,
    exitCode: child.status,
    stdout: child.stdout.trim(),
    evidence:
      evidence == null
        ? null
        : {
            status: evidence.status,
            reasonCode: evidence.reasonCode,
            occurrenceKey: evidence.occurrenceKey,
            totalDurationMs: evidence.totalDurationMs,
            changedFiles: evidence.changedFiles.length,
            checks: evidence.checks.map((check) => ({
              status: check.status,
              reasonCode: check.reasonCode,
            })),
          },
    guard: readGuardLog(guardLog),
  };
}

function makeHostFixtures(workDir) {
  const trustedTree = fs.mkdtempSync(path.join(workDir, 'trusted-'));
  const allowlist = path.join(trustedTree, ALLOWLIST_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(allowlist), { recursive: true });
  fs.writeFileSync(
    allowlist,
    ['version: 1', 'commands:', `  - command: ${TRUE_BIN}`, '    selfContained: true', ''].join(
      '\n'
    )
  );
  const selectedFile = path.join(trustedTree, 'selected.json');
  fs.writeFileSync(
    selectedFile,
    JSON.stringify([{ id: 'dogfood-true', metadata: { deterministicGate: { command: TRUE_BIN } } }])
  );
  return { trustedTree, selectedFile };
}

/**
 * Replay the population and return per-run rows plus per-config summaries.
 *
 * @param {{ base?: string, count?: number, sourceRepo?: string }} [options]
 */
export function measure({
  base = DEFAULT_POPULATION.base,
  count = DEFAULT_POPULATION.count,
  sourceRepo = repoRoot,
} = {}) {
  const workDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'river-after-change-dogfood-'))
  );
  try {
    const clone = path.join(workDir, 'repo');
    execFileSync('git', ['clone', '-q', '--shared', '--no-checkout', sourceRepo, clone]);
    const commits = gitIn(clone, ['rev-list', '--first-parent', '-n', String(count), base])
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
    const merges = commits.filter(
      (commit) =>
        gitIn(clone, ['rev-list', '--parents', '-n', '1', commit]).toString().trim().split(' ')
          .length > 2
    );
    const host = makeHostFixtures(workDir);
    const runs = [];
    const bands = [];
    for (const commit of commits) {
      for (const event of EVENTS) {
        if (event === 'partial') {
          checkoutParent(clone, commit);
          applyPartial(clone, commit);
        } else if (event === 'full') {
          applyFull(clone, commit);
          bands.push({ commit, ...describeChange(clone) });
        }
        const digest = workingTreeDigest(clone);
        for (const config of CONFIGS) {
          runs.push({
            commit,
            event,
            config,
            digest,
            ...runHook({ clone, workDir, config, ...host }),
          });
        }
      }
    }
    const summaries = Object.fromEntries(
      CONFIGS.map((config) => [config, summarize(runs.filter((run) => run.config === config))])
    );
    return {
      population: {
        base,
        count,
        commits: commits.length,
        firstCommit: commits.at(-1),
        lastCommit: commits[0],
        mergeCommits: merges.length,
        bands: aggregateBands(bands),
      },
      node: process.version,
      platform: `${os.platform()}-${os.arch()}`,
      // Wall-clock latency on a shared machine moves with its load, so the
      // load at the end of the run is part of the measurement.
      loadavg: os.loadavg().map((value) => Math.round(value * 100) / 100),
      cpus: os.cpus().length,
      summaries,
      runs,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function aggregateBands(bands) {
  const nameStatus = {};
  for (const band of bands) {
    for (const [letter, n] of Object.entries(band.nameStatus)) {
      nameStatus[letter] = (nameStatus[letter] ?? 0) + n;
    }
  }
  const sum = (key) => bands.reduce((total, band) => total + band[key], 0);
  return {
    nameStatus,
    untrackedFiles: sum('untracked'),
    commitsWithUntracked: bands.filter((band) => band.untracked > 0).length,
    commitsWithDeletion: bands.filter((band) => (band.nameStatus.D ?? 0) > 0).length,
    nonAsciiPaths: sum('nonAsciiPaths'),
    untrackedSymlinks: sum('untrackedSymlinks'),
    filesPerCommit: {
      p50: percentile(
        bands.map((band) => band.files),
        50
      ),
      max: Math.max(...bands.map((band) => band.files)),
    },
  };
}

function parseArgs(argv) {
  const options = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') options.json = true;
    else if (argv[i] === '--base') options.base = argv[++i];
    else if (argv[i] === '--count') options.count = Number(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return options;
}

if (isDirectRun(import.meta.url)) {
  const { json, ...options } = parseArgs(process.argv.slice(2));
  const result = measure(options);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const { runs: _runs, ...report } = result;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  const holds = CONFIGS.every((config) => llmGuardHolds(result.summaries[config]));
  if (!holds) {
    process.stderr.write('after-change dogfood: the 0-LLM-call guard did not hold\n');
    process.exitCode = 1;
  }
}
