// Staging outcome reaches the verdict (#2311).
//
// Before this, `runDeterministicGates` discarded everything
// `copyReviewTargetToSandbox` returned, so a check whose subject files were
// refused by the sandbox ran against an empty directory, exited 0, and the
// fast-verification checkpoint published `pass` for a file it never opened.
//
// The reproduction in the issue is the FIRST test here and it drives the
// PRODUCTION wiring: no `runGatesImpl`, no `execImpl`, a real allowlisted
// binary, a real symlinked changed file, a real sandbox. A stub anywhere in
// that chain would let the defect back in without failing this file.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  CHECK_STATUS,
  FAST_VERIFICATION_REASON,
  runFastVerification,
} from '../src/lib/fast-verification.mjs';
import {
  ALLOWLIST_RELATIVE_PATH,
  runDeterministicGates,
} from '../src/lib/deterministic-command-orchestrator.mjs';
import { resolveTrigger } from '../src/lib/trigger-resolver.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SUBJECT = 'b'.repeat(40);

const evidenceSchema = JSON.parse(
  await fs.readFile(
    path.join(repoRoot, 'schemas', 'fast-verification-evidence.schema.json'),
    'utf8'
  )
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateEvidence = ajv.compile(evidenceSchema);

/** Assert against the PUBLISHED schema, not a hand-rolled key comparison. */
function assertValidEvidence(evidence) {
  const ok = validateEvidence(evidence);
  assert.ok(ok, `evidence must validate: ${JSON.stringify(validateEvidence.errors)}`);
}

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

async function afterChangeResolution(subjectRevision = SUBJECT) {
  const registry = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'flows/entry-map.json'), 'utf8')
  );
  return resolveTrigger(
    { event: 'after-change', subjectRevision },
    { registry, flowDocuments: [] }
  );
}

async function makeTrustedTree(commands) {
  const dir = await makeTempDir('river-2311-trusted-');
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  const lines = ['version: 1', 'commands:'];
  for (const command of commands) lines.push(`  - command: ${command}`, '    selfContained: true');
  await fs.writeFile(allowlistPath, lines.join('\n'), 'utf8');
  return dir;
}

/** A source dir holding one regular file and one symlink the sandbox refuses. */
async function makeSourceDirWithSymlink() {
  const dir = await makeTempDir('river-2311-src-');
  await fs.writeFile(path.join(dir, 'real.js'), 'ok\n', 'utf8');
  await fs.mkdir(path.join(dir, 'lnk'), { recursive: true });
  await fs.symlink(path.join(dir, 'real.js'), path.join(dir, 'lnk', 'bad.js'));
  return dir;
}

const skill = (id, command, args = []) => ({
  id,
  metadata: { deterministicGate: { command, args } },
});

const clock = () => {
  let value = 1_700_000_000_000;
  return () => (value += 5);
};

// ---------------------------------------------------------------------------
// The issue reproduction, through the default (production) wiring.
// ---------------------------------------------------------------------------

test('#2311 reproduction: a refused subject file does not produce a pass (default wiring)', async (t) => {
  const realCommand = '/bin/echo';
  try {
    await fs.access(realCommand);
  } catch {
    t.skip(`${realCommand} is not available on this platform`);
    return;
  }
  const trustedTree = await makeTrustedTree([realCommand]);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['lnk/bad.js'],
    selected: [skill('lint', realCommand)],
    trustedTree,
    reviewSourceDir,
    processEnv: process.env,
    now: clock(),
    // NOTHING injected: the default runGatesImpl is the real orchestrator and
    // the real executor really launches /bin/echo, which really exits 0.
  });

  const check = evidence.checks[0];
  assert.equal(check.exitCode, 0, 'the checker really ran and really exited 0');
  assert.notEqual(check.status, CHECK_STATUS.PASS, 'exit 0 on an empty sandbox is not a pass');
  assert.equal(check.status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(check.reasonCode, FAST_VERIFICATION_REASON.STAGING_INCOMPLETE);
  assert.equal(check.supersededStatus, CHECK_STATUS.PASS);
  // The refusal is traceable: which file, and why.
  assert.deepEqual(check.staging, {
    requested: 1,
    copied: 0,
    complete: false,
    skipped: [{ path: 'lnk/bad.js', reason: 'symlink' }],
  });
  assert.equal(evidence.status, CHECK_STATUS.UNRUNNABLE);
  assertValidEvidence(evidence);
});

test('a fully staged subject file still passes through the default wiring', async (t) => {
  const realCommand = '/bin/echo';
  try {
    await fs.access(realCommand);
  } catch {
    t.skip(`${realCommand} is not available on this platform`);
    return;
  }
  const trustedTree = await makeTrustedTree([realCommand]);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['real.js'],
    selected: [skill('lint', realCommand)],
    trustedTree,
    reviewSourceDir,
    processEnv: process.env,
    now: clock(),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.PASS, 'the fix must not block a real pass');
  assert.deepEqual(evidence.checks[0].staging, {
    requested: 1,
    copied: 1,
    complete: true,
    skipped: [],
  });
  assertValidEvidence(evidence);
});

test('a partially staged subject set is incomplete: one refusal is enough', async (t) => {
  const realCommand = '/bin/echo';
  try {
    await fs.access(realCommand);
  } catch {
    t.skip(`${realCommand} is not available on this platform`);
    return;
  }
  const trustedTree = await makeTrustedTree([realCommand]);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['real.js', 'lnk/bad.js'],
    selected: [skill('lint', realCommand)],
    trustedTree,
    reviewSourceDir,
    processEnv: process.env,
    now: clock(),
  });

  const check = evidence.checks[0];
  assert.equal(check.status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(check.reasonCode, FAST_VERIFICATION_REASON.STAGING_INCOMPLETE);
  assert.equal(check.staging.copied, 1);
  assert.equal(check.staging.requested, 2);
  assert.deepEqual(check.staging.skipped, [{ path: 'lnk/bad.js', reason: 'symlink' }]);
  assertValidEvidence(evidence);
});

// ---------------------------------------------------------------------------
// Orchestrator side: the staging outcome is on the row, and the GATE verdict
// is unchanged (the other caller, deterministic-exec-gate, must not shift).
// ---------------------------------------------------------------------------

test('the orchestrator surfaces staging per gate without changing gate aggregation', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const result = await runDeterministicGates({
    trustedTree,
    selected: [skill('s1', '/usr/bin/tool-ok')],
    reviewSourceDir,
    changedFiles: ['lnk/bad.js'],
    processEnv: { PATH: '/usr/bin' },
    execImpl: async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }),
  });

  // Gate inputs are byte-for-byte what they were before #2311.
  assert.equal(result.strictBlock, false);
  assert.equal(result.deterministicUnrunnable, false);
  assert.deepEqual(result.results[0].staging, {
    requested: 1,
    copied: 0,
    complete: false,
    skipped: [{ path: 'lnk/bad.js', reason: 'symlink' }],
  });
});

test('a path escaping the review root is surfaced as outside-root', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const result = await runDeterministicGates({
    trustedTree,
    selected: [skill('s1', '/usr/bin/tool-ok')],
    reviewSourceDir,
    changedFiles: ['../escape.js'],
    execImpl: async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }),
  });

  assert.equal(result.results[0].staging.complete, false);
  assert.deepEqual(result.results[0].staging.skipped, [
    { path: '../escape.js', reason: 'outside-root' },
  ]);
});

test('a copy failure is surfaced without leaking the error message', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const result = await runDeterministicGates({
    trustedTree,
    selected: [skill('s1', '/usr/bin/tool-ok')],
    reviewSourceDir,
    // Never created in the source dir → fs.copyFile throws ENOENT.
    changedFiles: ['missing.js'],
    execImpl: async () => ({ status: 'pass', reasonCode: 'DETERMINISTIC_PASS' }),
  });

  assert.deepEqual(result.results[0].staging.skipped, [
    { path: 'missing.js', reason: 'copy-error' },
  ]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('ENOENT'), 'raw copy errors are not evidence');
  assert.ok(!serialized.includes(reviewSourceDir), 'absolute host paths are not evidence');
});

// ---------------------------------------------------------------------------
// Checkpoint boundary: what it does with staging it cannot trust.
// ---------------------------------------------------------------------------

test('a pass row with no staging evidence at all is unrunnable, not pass', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['real.js'],
    selected: [skill('lint', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    // An injected orchestrator (e.g. a future host adapter) that reports no
    // staging at all: absence of evidence is not evidence of a clean sandbox.
    runGatesImpl: async () => ({
      results: [
        { gateIndex: 0, skillId: 'lint', status: 'pass', reasonCode: 'DETERMINISTIC_PASS' },
      ],
    }),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(evidence.checks[0].reasonCode, FAST_VERIFICATION_REASON.STAGING_EVIDENCE_MISSING);
  assertValidEvidence(evidence);
});

test('a staging summary that claims complete while reporting a refusal is not believed', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['real.js'],
    selected: [skill('lint', '/usr/bin/tool-ok')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: async () => ({
      results: [
        {
          gateIndex: 0,
          skillId: 'lint',
          status: 'pass',
          reasonCode: 'DETERMINISTIC_PASS',
          staging: {
            requested: 1,
            copied: 0,
            complete: true,
            skipped: [{ path: 'real.js', reason: 'symlink' }],
          },
        },
      ],
    }),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.UNRUNNABLE);
  assert.equal(evidence.checks[0].reasonCode, FAST_VERIFICATION_REASON.STAGING_INCOMPLETE);
  assert.equal(evidence.checks[0].staging.complete, false);
});

test('a malformed staging summary is treated as missing, never as complete', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-ok']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  for (const staging of [
    'complete',
    { complete: true },
    { requested: 1, copied: 1, complete: 'yes', skipped: [] },
    { requested: -1, copied: 1, complete: true, skipped: [] },
    { requested: 1, copied: 1, complete: true, skipped: [{ path: 'x', reason: 'made-up' }] },
  ]) {
    const evidence = await runFastVerification({
      resolution: await afterChangeResolution(),
      subjectRevision: SUBJECT,
      changedFiles: ['real.js'],
      selected: [skill('lint', '/usr/bin/tool-ok')],
      trustedTree,
      reviewSourceDir,
      now: clock(),
      runGatesImpl: async () => ({
        results: [
          {
            gateIndex: 0,
            skillId: 'lint',
            status: 'pass',
            reasonCode: 'DETERMINISTIC_PASS',
            staging,
          },
        ],
      }),
    });
    assert.equal(
      evidence.checks[0].status,
      CHECK_STATUS.UNRUNNABLE,
      `staging ${JSON.stringify(staging)} must not yield a pass`
    );
    assert.equal(
      evidence.checks[0].reasonCode,
      FAST_VERIFICATION_REASON.STAGING_EVIDENCE_MISSING,
      `staging ${JSON.stringify(staging)} must be reported as missing evidence`
    );
    assert.equal(evidence.checks[0].staging, undefined);
    assertValidEvidence(evidence);
  }
});

test('a fail is NOT downgraded by incomplete staging — that would be the fail-open', async () => {
  const trustedTree = await makeTrustedTree(['/usr/bin/tool-fail']);
  const reviewSourceDir = await makeSourceDirWithSymlink();

  const evidence = await runFastVerification({
    resolution: await afterChangeResolution(),
    subjectRevision: SUBJECT,
    changedFiles: ['lnk/bad.js'],
    selected: [skill('lint', '/usr/bin/tool-fail')],
    trustedTree,
    reviewSourceDir,
    now: clock(),
    runGatesImpl: (args) =>
      runDeterministicGates({
        ...args,
        execImpl: async () => ({ status: 'fail', reasonCode: 'STRICT_BLOCK', exitCode: 1 }),
      }),
  });

  assert.equal(evidence.checks[0].status, CHECK_STATUS.FAIL);
  assert.equal(evidence.checks[0].staging.complete, false, 'the refusal is still recorded');
  assertValidEvidence(evidence);
});
