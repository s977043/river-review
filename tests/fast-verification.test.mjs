// Fast-verification checkpoint (#2275 PR-3B). These tests exist to make the
// "never a false green" promise mechanical: every path that does NOT execute a
// check is asserted to produce its own word, and the adversarial cases from
// #2275 "Security / adversarial tests" that fall inside this PR's scope are
// pinned here (1, 2, 4, 5, 6, 7, 8, 9, 10; item 3 — path traversal / symlink —
// is a sandbox invariant and stays in tests/deterministic-command-sandbox.test.mjs).

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECK_STATUS,
  FAST_VERIFICATION_PROFILE,
  FAST_VERIFICATION_REASON,
  FastVerificationError,
  occurrenceKeyOf,
  runFastVerification,
} from '../src/lib/fast-verification.mjs';
import {
  ALLOWLIST_RELATIVE_PATH,
  runDeterministicGates,
} from '../src/lib/deterministic-command-orchestrator.mjs';
import { resolveTrigger } from '../src/lib/trigger-resolver.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const readEntryMap = async () =>
  JSON.parse(await fs.readFile(path.join(repoRoot, 'flows/entry-map.json'), 'utf8'));

const SUBJECT = 'a'.repeat(40);

/** Every temp dir these tests create, removed once at the end of the file. */
const tempDirs = [];
after(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A real `after-change` resolution from the real entry map. */
async function afterChangeResolution(subjectRevision = SUBJECT) {
  const registry = await readEntryMap();
  return resolveTrigger(
    { event: 'after-change', subjectRevision },
    { registry, flowDocuments: [] }
  );
}

async function makeTrustedTree(commands) {
  const dir = await makeTempDir('river-fastverify-trusted-');
  await writeAllowlist(dir, commands);
  return dir;
}

async function writeAllowlist(dir, commands) {
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  const lines = ['version: 1', 'commands:'];
  for (const entry of commands) {
    const { command, args } = typeof entry === 'string' ? { command: entry } : entry;
    lines.push(`  - command: ${command}`, '    selfContained: true');
    if (args) lines.push(`    args: [${args.map((arg) => JSON.stringify(arg)).join(', ')}]`);
  }
  await fs.writeFile(allowlistPath, lines.join('\n'), 'utf8');
}

async function makeSourceDir() {
  const dir = await makeTempDir('river-fastverify-src-');
  await fs.writeFile(path.join(dir, 'changed.txt'), 'changed', 'utf8');
  return dir;
}

const skill = (id, command, args = []) => ({
  id,
  metadata: { deterministicGate: { command, args } },
});

/** Drives the REAL #1401 orchestrator, with only the process launch injected. */
const gatesWith = (execImpl, calls) => (args) => {
  calls?.push(args);
  return runDeterministicGates({ ...args, execImpl });
};

const clock = () => {
  let value = 1_700_000_000_000;
  return () => (value += 5);
};

test('an executed check reports pass with its safe metadata and nothing else', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt', 'changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => ({
      status: 'pass',
      reasonCode: 'DETERMINISTIC_PASS',
      durationMs: 12,
      exitCode: 0,
      stdoutBytes: 7,
      stdout: 'AWS_SECRET_ACCESS_KEY=deadbeefdeadbeef',
      stderr: '/Users/someone/private/path',
    })),
  });

  assert.equal(evidence.triggerId, 'after-change');
  assert.equal(evidence.profile, FAST_VERIFICATION_PROFILE);
  assert.equal(evidence.mode, 'observe');
  assert.equal(evidence.status, CHECK_STATUS.PASS);
  assert.deepEqual(evidence.changedFiles, ['changed.txt']);
  assert.equal(evidence.occurrenceKey, occurrenceKeyOf(evidence));
  assert.deepEqual(evidence.checks, [
    {
      id: 'skill-ok',
      status: 'pass',
      reasonCode: 'DETERMINISTIC_PASS',
      durationMs: 12,
      exitCode: 0,
      stdoutBytes: 7,
      staging: { requested: 1, copied: 1, complete: true, skipped: [] },
    },
  ]);
  // Adversarial #4: no secret-like stdout/stderr anywhere in the evidence.
  const serialized = JSON.stringify(evidence);
  assert.ok(!serialized.includes('AWS_SECRET_ACCESS_KEY'));
  assert.ok(!serialized.includes('/Users/someone/private/path'));
});

test('a failing check reports fail, and is not aggregated into a gate verdict', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-fail']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-fail', '/usr/bin/tool-fail')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => ({
      status: 'fail',
      reasonCode: 'STRICT_BLOCK',
      durationMs: 3,
      exitCode: 1,
      stdoutBytes: 0,
    })),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.FAIL);
  assert.equal(evidence.status, CHECK_STATUS.FAIL);
  // Adversarial #10: observe-only evidence carries no gate / decision authority.
  for (const key of ['strictBlock', 'deterministicUnrunnable', 'gate', 'decision', 'merge']) {
    assert.ok(!Object.hasOwn(evidence, key), `evidence must not carry "${key}"`);
  }
});

// Adversarial #5.
test('timeout and spawn error are unrunnable, never a silent success', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-timeout', '/usr/bin/tool-spawn']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [
      skill('skill-timeout', '/usr/bin/tool-timeout'),
      skill('skill-spawn', '/usr/bin/tool-spawn'),
    ],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async ({ entry }) => ({
      status: 'unrunnable',
      reasonCode: 'DETERMINISTIC_UNRUNNABLE',
      durationMs: 1,
      unrunnableCause: entry.command === '/usr/bin/tool-timeout' ? 'timeout' : 'spawn-error',
    })),
  });

  assert.deepEqual(
    evidence.checks.map((check) => [check.status, check.unrunnableCause]),
    [
      [CHECK_STATUS.UNRUNNABLE, 'timeout'],
      [CHECK_STATUS.UNRUNNABLE, 'spawn-error'],
    ]
  );
  assert.equal(evidence.status, CHECK_STATUS.UNRUNNABLE);
});

test('an unreadable executor status decays to unrunnable, not to pass', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-odd']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-odd', '/usr/bin/tool-odd')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => ({ reasonCode: 'DETERMINISTIC_PASS' })),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(evidence.checks[0].reasonCode, FAST_VERIFICATION_REASON.EXECUTOR_STATUS_MISSING);
});

// Adversarial #1 + #6.
test('a head-side allowlist cannot enable a command the trusted base does not list', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-listed']);
  const reviewSourceDir = await makeSourceDir();
  // The change under review adds the command to ITS OWN allowlist copy.
  await writeAllowlist(reviewSourceDir, ['/usr/bin/tool-listed', '/usr/bin/tool-smuggled']);

  let executed = 0;
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt', ALLOWLIST_RELATIVE_PATH],
    selected: [skill('skill-smuggled', '/usr/bin/tool-smuggled')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => {
      executed += 1;
      return { status: 'pass', reasonCode: 'DETERMINISTIC_PASS' };
    }),
  });

  assert.equal(executed, 0, 'the smuggled command must never be launched');
  assert.deepEqual(evidence.checks, [
    {
      id: 'skill-smuggled',
      status: CHECK_STATUS.BYPASSED,
      reasonCode: FAST_VERIFICATION_REASON.ALLOWLIST_MISS,
    },
  ]);
  assert.notEqual(evidence.status, CHECK_STATUS.PASS);
});

// Adversarial #2: shell metacharacters are argv bytes, never syntax; an argv
// that is not EXACTLY on the trusted allowlist is not run.
test('shell metacharacters in argv do not widen the allowlist match', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  let executed = 0;
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-inject', '/usr/bin/tool-ok', [';', '&&', '$(id)', '|', 'rm -rf /'])],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => {
      executed += 1;
      return { status: 'pass', reasonCode: 'DETERMINISTIC_PASS' };
    }),
  });

  assert.equal(executed, 0);
  assert.equal(evidence.checks[0].status, CHECK_STATUS.BYPASSED);
});

// Adversarial #6.
test('no host-trusted allowlist is bypassed with a reason, never pass', async () => {
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree: undefined,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => {
      throw new Error('must not reach the executor without a trusted allowlist');
    }),
  });

  assert.equal(evidence.status, CHECK_STATUS.BYPASSED);
  assert.equal(evidence.reasonCode, FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_ABSENT);
  assert.equal(evidence.checks[0].status, CHECK_STATUS.BYPASSED);
});

test('nothing to run is skipped, and is distinguishable from bypassed', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const base = {
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => {
      throw new Error('must not execute when there is nothing to run');
    }),
  };

  const noCheck = await runFastVerification({
    ...base,
    changedFiles: ['changed.txt'],
    selected: [],
  });
  assert.equal(noCheck.status, CHECK_STATUS.SKIPPED);
  assert.equal(noCheck.reasonCode, FAST_VERIFICATION_REASON.NO_CHECK_SELECTED);
  assert.deepEqual(noCheck.checks, []);

  const noFiles = await runFastVerification({
    ...base,
    changedFiles: [],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
  });
  assert.equal(noFiles.status, CHECK_STATUS.SKIPPED);
  assert.equal(noFiles.checks[0].reasonCode, FAST_VERIFICATION_REASON.NO_CHANGED_FILES);
});

// Adversarial #8.
test('a re-sent occurrence on the same revision is skipped without re-executing', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const resolution = await afterChangeResolution();
  const calls = [];
  const input = {
    resolution,
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(
      async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }),
      calls
    ),
  };

  const first = await runFastVerification(input);
  assert.equal(first.status, CHECK_STATUS.PASS);
  assert.equal(calls.length, 1);

  const second = await runFastVerification({ ...input, seenOccurrences: [first.occurrenceKey] });
  assert.equal(calls.length, 1, 'a duplicate occurrence must not launch anything');
  assert.equal(second.status, CHECK_STATUS.SKIPPED);
  assert.equal(second.reasonCode, FAST_VERIFICATION_REASON.DUPLICATE_OCCURRENCE);

  // A different revision is a different occurrence and does run.
  const other = 'b'.repeat(40);
  const third = await runFastVerification({
    ...input,
    resolution: await afterChangeResolution(other),
    subjectRevision: other,
    seenOccurrences: [first.occurrenceKey],
  });
  assert.equal(calls.length, 2);
  assert.equal(third.status, CHECK_STATUS.PASS);
});

// Adversarial #7.
test('a verdict is stale once the subject revision moves under it', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok', '/usr/bin/tool-timeout']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [
      skill('skill-ok', '/usr/bin/tool-ok'),
      skill('skill-timeout', '/usr/bin/tool-timeout'),
    ],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    readSubjectRevision: () => 'c'.repeat(40),
    runGatesImpl: gatesWith(async ({ entry }) =>
      entry.command === '/usr/bin/tool-ok'
        ? { status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }
        : {
            status: 'unrunnable',
            reasonCode: 'DETERMINISTIC_UNRUNNABLE',
            unrunnableCause: 'timeout',
          }
    ),
  });

  assert.equal(evidence.status, CHECK_STATUS.STALE);
  assert.equal(evidence.reasonCode, FAST_VERIFICATION_REASON.SUBJECT_REVISION_CHANGED);
  const ok = evidence.checks.find((check) => check.id === 'skill-ok');
  assert.equal(ok.status, CHECK_STATUS.STALE);
  assert.equal(ok.supersededStatus, CHECK_STATUS.PASS);
  // A non-verdict keeps its own word rather than being relabelled.
  const timedOut = evidence.checks.find((check) => check.id === 'skill-timeout');
  assert.equal(timedOut.status, CHECK_STATUS.UNRUNNABLE);
  assert.ok(!Object.hasOwn(timedOut, 'supersededStatus'));
});

test('an unchanged subject revision leaves the verdicts intact', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    readSubjectRevision: () => SUBJECT,
    runGatesImpl: gatesWith(async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' })),
  });
  assert.equal(evidence.status, CHECK_STATUS.PASS);
});

test('only an after-change observe resolution is accepted', async () => {
  const registry = await readEntryMap();
  const resolution = await afterChangeResolution();

  await assert.rejects(
    () =>
      runFastVerification({
        resolution: { ...resolution, mode: 'active' },
        subjectRevision: SUBJECT,
      }),
    FastVerificationError
  );
  await assert.rejects(
    () =>
      runFastVerification({
        resolution: { ...resolution, profile: null },
        subjectRevision: SUBJECT,
      }),
    FastVerificationError
  );
  await assert.rejects(
    () =>
      runFastVerification({
        resolution: { ...resolution, selectedEntries: ['review-task'] },
        subjectRevision: SUBJECT,
      }),
    FastVerificationError
  );
  await assert.rejects(
    () => runFastVerification({ resolution, subjectRevision: '  ' }),
    FastVerificationError
  );
  // The registry really declares what this module refuses to assume.
  assert.equal(registry.triggers['after-change'].profile, FAST_VERIFICATION_PROFILE);
  assert.equal(registry.triggers['after-change'].mode, 'observe');
  assert.deepEqual(registry.triggers['after-change'].entries, []);
});

// Adversarial #9 + #10, mechanized over the TRANSITIVE import closure, not
// just this file: scanning one file's import lines let a `node:https` added to
// the orchestrator survive as a mutation (#2304 adversarial review).
async function importClosure(entryPath) {
  const visited = new Set();
  const external = new Set();
  const dynamic = [];
  const queue = [entryPath];
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const text = await fs.readFile(file, 'utf8');
    if (/\bimport\s*\(/.test(text) || /\brequire\s*\(/.test(text)) dynamic.push(file);
    const specifiers = [
      ...text.matchAll(/(?:^|\n)\s*import[^;]*?from\s+['"]([^'"]+)['"]/gs),
      ...text.matchAll(/(?:^|\n)\s*export[^;]*?from\s+['"]([^'"]+)['"]/gs),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        queue.push(path.resolve(path.dirname(file), specifier));
      } else {
        external.add(specifier);
      }
    }
  }
  return { visited, external, dynamic };
}

test('the checkpoint reaches no model, no network and no gate authority', async () => {
  const entry = path.join(repoRoot, 'src/lib/fast-verification.mjs');
  const { visited, external, dynamic } = await importClosure(entry);

  // Pinned so that ADDING a module to the closure is a test failure to be
  // looked at, not a silent widening of what this checkpoint can reach.
  assert.deepEqual([...external].sort(), [
    'fs',
    'js-yaml',
    'node:child_process',
    'node:crypto',
    'node:fs',
    'node:fs/promises',
    'node:os',
    'node:path',
    'path',
  ]);
  assert.deepEqual(dynamic, [], 'a dynamic import can reach anything, so there must be none');
  assert.ok(visited.size > 1, 'the closure must actually have been walked');
  for (const file of visited) {
    assert.ok(
      !/(^|\/)(llm-pipeline|openai-planner|gate-decision|run-gate|gate-exit)\.mjs$/.test(file),
      `the closure must not reach ${file}`
    );
  }

  // Host vocabulary stays in the adapter. Comments explain which host words are
  // deliberately absent, so the scan is over code lines only.
  const source = await fs.readFile(entry, 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  for (const forbidden of ['PostToolUse', 'MultiEdit', 'fetch(']) {
    assert.ok(!code.includes(forbidden), `fast-verification.mjs must not reference ${forbidden}`);
  }
});

test('the evidence validates against its published schema', async () => {
  const schema = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'schemas/fast-verification-evidence.schema.json'), 'utf8')
  );
  const statuses = schema.$defs.status.enum;
  assert.deepEqual(statuses.sort(), Object.values(CHECK_STATUS).sort());
  const reasons = schema.$defs.reasonCode.enum;
  for (const reason of Object.values(FAST_VERIFICATION_REASON)) {
    assert.ok(reasons.includes(reason), `schema is missing reasonCode "${reason}"`);
  }

  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async () => ({
      status: 'pass',
      reasonCode: 'DETERMINISTIC_PASS',
      durationMs: 4,
      exitCode: 0,
      stdoutBytes: 0,
    })),
  });

  assert.deepEqual(Object.keys(evidence).sort(), [...schema.required].sort());
  assert.match(evidence.occurrenceId, new RegExp(schema.properties.occurrenceId.pattern));
  for (const key of Object.keys(evidence.checks[0])) {
    assert.ok(
      Object.hasOwn(schema.$defs.check.properties, key),
      `schema is missing check property "${key}"`
    );
  }
});

// Blocker (#2304 adversarial review): `skillId` is not an identity. A skill
// without an `id` falls back to its command string, so two gates on the same
// command with different args used to collapse into one map key and a real
// `fail` was reported as `pass`.
test('two gates sharing a command keep their own verdicts', async () => {
  const trustedTree = await makeTrustedTree([
    { command: '/usr/bin/tool', args: ['lint'] },
    { command: '/usr/bin/tool', args: ['test'] },
  ]);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    // No `id`: extractGateCommands falls back to the command string for both.
    selected: [
      { metadata: { deterministicGate: { command: '/usr/bin/tool', args: ['lint'] } } },
      { metadata: { deterministicGate: { command: '/usr/bin/tool', args: ['test'] } } },
    ],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: gatesWith(async ({ entry }) =>
      entry.args?.[0] === 'lint'
        ? { status: 'fail', reasonCode: 'STRICT_BLOCK', exitCode: 1 }
        : { status: 'pass', reasonCode: 'DETERMINISTIC_PASS', exitCode: 0 }
    ),
  });

  assert.equal(evidence.checks.length, 2);
  assert.deepEqual(
    evidence.checks.map((check) => check.status),
    [CHECK_STATUS.FAIL, CHECK_STATUS.PASS]
  );
  assert.equal(evidence.status, CHECK_STATUS.FAIL, 'a real fail must not be reported as pass');
});

test('results that cannot be attributed to a gate are unrunnable, not pass', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    // A caller-supplied orchestrator that omits the correlation key.
    runGatesImpl: async () => ({
      results: [{ skillId: 'skill-ok', status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }],
    }),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(evidence.checks[0].reasonCode, FAST_VERIFICATION_REASON.RESULT_CORRELATION_FAILED);
});

// Major-1.
test('an unreadable subject revision makes the verdicts stale, not pass', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  for (const unreadable of [null, '', '   ', 42]) {
    const evidence = await runFastVerification({
      resolution: await afterChangeResolution(),
      subjectRevision: SUBJECT,
      changedFiles: ['changed.txt'],
      selected: [skill('skill-ok', '/usr/bin/tool-ok')],
      trustedTree,
      reviewSourceDir,
      now: clock(),
      readSubjectRevision: () => unreadable,
      runGatesImpl: gatesWith(async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' })),
    });
    assert.equal(evidence.status, CHECK_STATUS.STALE, `unreadable revision ${String(unreadable)}`);
    assert.equal(evidence.reasonCode, FAST_VERIFICATION_REASON.SUBJECT_REVISION_UNREADABLE);
    assert.equal(evidence.checks[0].supersededStatus, CHECK_STATUS.PASS);
  }
});

// Major-2: the production wiring itself, with nothing injected. A stub default
// would satisfy an allowlist-miss assertion just as well, so this drives a real
// allowlisted command to a real verdict — only the real orchestrator can
// produce it.
test('the default runGatesImpl is the real orchestrator', async (t) => {
  const realCommand = '/bin/echo';
  try {
    await fs.access(realCommand);
  } catch {
    t.skip(`${realCommand} is not available on this platform`);
    return;
  }
  const trustedTree = await makeTrustedTree([realCommand]);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-real', realCommand), skill('skill-unlisted', '/usr/bin/tool-unlisted')],
    trustedTree,
    reviewSourceDir,
    processEnv: process.env,
    now: clock(),
  });

  const real = evidence.checks.find((check) => check.id === 'skill-real');
  assert.equal(real.status, CHECK_STATUS.PASS, 'the real executor must have run and succeeded');
  assert.equal(real.exitCode, 0);
  assert.equal(typeof real.durationMs, 'number');
  const unlisted = evidence.checks.find((check) => check.id === 'skill-unlisted');
  assert.equal(unlisted.status, CHECK_STATUS.BYPASSED);
  assert.equal(unlisted.reasonCode, FAST_VERIFICATION_REASON.ALLOWLIST_MISS);
});

// Major-4: the env the sandbox scrubs has to actually arrive.
test('processEnv is forwarded to the orchestrator', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const processEnv = { RIVER_TEST_SENTINEL: 'sentinel' };
  const calls = [];
  await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    processEnv,
    now: clock(),
    runGatesImpl: gatesWith(
      async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }),
      calls
    ),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].processEnv, processEnv);
  assert.equal(calls[0].trustedTree, trustedTree);
  assert.equal(calls[0].reviewSourceDir, reviewSourceDir);
});

// Minor: only the known-safe executor fields reach the evidence, even when the
// orchestrator is injected and hands over more than the real one would.
test('a check row copies only the allowlisted execution metadata', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDir();
  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: async () => ({
      results: [
        {
          gateIndex: 0,
          skillId: 'skill-ok',
          status: 'pass',
          reasonCode: 'DETERMINISTIC_PASS',
          durationMs: 2,
          staging: { requested: 1, copied: 1, complete: true, skipped: [] },
          stdout: 'AWS_SECRET_ACCESS_KEY=deadbeefdeadbeef',
          cwd: '/Users/someone/private/path',
          env: { TOKEN: 'ghp_deadbeef' },
        },
      ],
    }),
  });

  assert.deepEqual(evidence.checks, [
    {
      id: 'skill-ok',
      status: 'pass',
      reasonCode: 'DETERMINISTIC_PASS',
      durationMs: 2,
      staging: { requested: 1, copied: 1, complete: true, skipped: [] },
    },
  ]);
  const serialized = JSON.stringify(evidence);
  for (const leak of ['AWS_SECRET_ACCESS_KEY', '/Users/someone/private/path', 'ghp_deadbeef']) {
    assert.ok(!serialized.includes(leak), `evidence must not carry ${leak}`);
  }
});

// Minor: a validated-but-unusable allowlist is its own host condition.
test('an allowlist with no usable entry is bypassed with its own reason', async () => {
  const reviewSourceDir = await makeSourceDir();
  const trustedTree = await makeTempDir('river-fastverify-broken-');
  const allowlistPath = path.join(trustedTree, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  await fs.writeFile(allowlistPath, 'version: 1\ncommands: []\n', 'utf8');

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['changed.txt'],
    selected: [skill('skill-ok', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
  });

  assert.equal(evidence.status, CHECK_STATUS.BYPASSED);
  assert.equal(evidence.reasonCode, FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_EMPTY);
});
