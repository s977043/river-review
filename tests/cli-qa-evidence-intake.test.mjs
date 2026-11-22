// `river run --qa-evidence` (ADR-017 D2 / D5 / D6, rollout step 5): the CLI reads the evidence
// file and hands it to `auditQaEvidence` with the HEAD and `dirty` the run observed. The audit is
// cross-checked against a direct `auditQaEvidence` call rather than against hand-written values.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { listTrackedChanges, parsePorcelainZPaths } from '../src/lib/git.mjs';
import { auditQaEvidence } from '../src/lib/qa-evidence.mjs';
import { runCliAsSubprocess } from './helpers/cli.mjs';
import { cleanupTempDirAsync, createTempDir } from './helpers/temp-dir.mjs';
import {
  createRepoWithSilentCatchChange,
  createTempGitRepo,
  runGit,
} from './helpers/temp-repo.mjs';

const BASE = JSON.parse(
  readFileSync(new URL('./fixtures/qa-evidence/base.json', import.meta.url), 'utf8')
);

function scratch(t) {
  const dir = createTempDir({ prefix: 'river-qa-cli-' });
  t.after(() => cleanupTempDirAsync(dir));
  return dir;
}

async function git(args, cwd) {
  return (await runGit(args, cwd)).stdout.trim();
}

function evidenceFor(head) {
  const evidence = structuredClone(BASE.evidence);
  evidence.target.subjectRevision = head;
  return JSON.stringify(evidence);
}

function qaFlags(evidencePath, auditPath, artifactsDir) {
  return [
    '--qa-evidence',
    evidencePath,
    '--qa-audit-output',
    auditPath,
    ...(artifactsDir ? ['--qa-artifacts', artifactsDir] : []),
  ];
}

function contextsLine(stderr) {
  return stderr.split('\n').find((line) => line.startsWith('Contexts:'));
}

describe('river run --qa-evidence', () => {
  test('the audit file equals a direct auditQaEvidence call on the observed HEAD', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const artifacts = scratch(t);
    const head = await git(['rev-parse', 'HEAD'], dir);
    const repoRoot = await git(['rev-parse', '--show-toplevel'], dir);
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceFor(head));
    // `ci-pass` points into the artifacts root, so dropping that root changes its resolution.
    mkdirSync(join(artifacts, 'ci'));
    writeFileSync(join(artifacts, 'ci', 'pass.txt'), 'ok\n');

    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath, artifacts)],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);

    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    const direct = await auditQaEvidence({
      evidence: readFileSync(evidencePath),
      population: null,
      observed: { head, dirty: true, changedFiles: ['src/app.js'] },
      roots: { repository: repoRoot, artifacts },
    });
    assert.deepEqual(audit, JSON.parse(JSON.stringify(direct)));
    assert.equal(audit.accepted, true);
    assert.equal(audit.revision.observedHead, head);
    assert.equal(audit.revision.dirty, true);
    assert.deepEqual(audit.revision.changedFiles, ['src/app.js']);
    assert.equal(audit.projection, null);
    assert.ok(audit.criteria.every((criterion) => criterion.verified === false));
    // Restricted artifacts (no `sensitivity`) leave the output by id only.
    assert.doesNotMatch(readFileSync(auditPath, 'utf8'), /logs\/pass\.txt/);
    assert.match(contextsLine(run.stderr), /\bqaEvidence\b/);
  });

  test('the review output and exit code are those of the same run without QA evidence', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const evidencePath = join(work, 'evidence.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));

    const plain = await runCliAsSubprocess(['run', '.', '--dry-run', '--output', 'json'], {
      cwd: dir,
    });
    const withQa = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, join(work, 'a.json'))],
      { cwd: dir }
    );
    assert.equal(withQa.code, plain.code);
    assert.deepEqual(JSON.parse(withQa.stdout), JSON.parse(plain.stdout));
    assert.doesNotMatch(contextsLine(plain.stderr), /\bqaEvidence\b/);
    assert.doesNotMatch(plain.stderr, /QA evidence audit/);
  });

  test('--context qaEvidence alone does not make the context available', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', '--context', 'diff,qaEvidence'],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    assert.doesNotMatch(contextsLine(run.stderr), /\bqaEvidence\b/);
    assert.match(contextsLine(run.stderr), /\bdiff\b/);
    assert.match(run.stderr, /--context qaEvidence is ignored/);
  });

  for (const [name, extra] of [
    ['alone', []],
    ['with --context', ['--context', 'diff']],
  ]) {
    test(`RIVER_AVAILABLE_CONTEXTS=qaEvidence ${name} does not make the context available`, async (t) => {
      const { dir, cleanup } = await createRepoWithSilentCatchChange();
      t.after(cleanup);
      const run = await runCliAsSubprocess(
        ['run', '.', '--dry-run', '--output', 'json', ...extra],
        { cwd: dir, env: { RIVER_AVAILABLE_CONTEXTS: 'tests,qaEvidence' } }
      );
      assert.equal(run.code, 0, run.stderr);
      assert.doesNotMatch(contextsLine(run.stderr), /\bqaEvidence\b/);
      assert.match(contextsLine(run.stderr), /\btests\b/);
    });
  }

  test('an existing, linked, evidence or artifacts-root output path stops before the review', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const artifacts = scratch(t);
    const evidencePath = join(work, 'evidence.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));
    const existing = join(work, 'existing.json');
    writeFileSync(existing, 'keep\n');
    const dangling = join(work, 'dangling.json');
    symlinkSync(join(work, 'nowhere.json'), dangling);
    for (const [auditPath, reason] of [
      [existing, /already exists/],
      [dangling, /already exists/],
      [evidencePath, /--qa-evidence file/],
      [join(artifacts, 'audit.json'), /inside --qa-artifacts/],
      [join(work, 'no-dir', 'audit.json'), /ENOENT/],
    ]) {
      const run = await runCliAsSubprocess(
        [
          'run',
          '.',
          '--dry-run',
          '--output',
          'json',
          ...qaFlags(evidencePath, auditPath, artifacts),
        ],
        { cwd: dir }
      );
      assert.equal(run.code, 1, `${auditPath}: ${run.stderr}`);
      assert.match(run.stderr, /--qa-audit-output is refused/);
      assert.match(run.stderr, reason);
      assert.doesNotMatch(run.stderr, /River Review \(local\)/, 'the review must not start');
      assert.equal(run.stdout, '');
    }
    assert.equal(readFileSync(existing, 'utf8'), 'keep\n');
    assert.equal(existsSync(join(work, 'nowhere.json')), false);
    assert.equal(existsSync(join(artifacts, 'audit.json')), false);
  });

  for (const [name, content, code] of [
    ['not JSON', '{ not json', 'QA_EVIDENCE_MALFORMED'],
    ['over the size limit', `"${'x'.repeat(1_048_576)}"`, 'QA_EVIDENCE_TOO_LARGE'],
  ]) {
    test(`evidence ${name} is rejected in the audit while the review still runs`, async (t) => {
      const { dir, cleanup } = await createRepoWithSilentCatchChange();
      t.after(cleanup);
      const work = scratch(t);
      const evidencePath = join(work, 'evidence.json');
      const auditPath = join(work, 'audit.json');
      writeFileSync(evidencePath, content);

      const run = await runCliAsSubprocess(
        ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath)],
        { cwd: dir }
      );
      assert.equal(run.code, 0, run.stderr);
      assert.ok(Array.isArray(JSON.parse(run.stdout).issues));
      const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
      assert.equal(audit.accepted, false);
      assert.equal(audit.stage, 1);
      assert.deepEqual(audit.rejectReasons, [code]);
    });
  }

  test('an unreadable evidence path stops before the review with exit 1', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const auditPath = join(work, 'audit.json');
    for (const evidencePath of [join(work, 'missing.json'), work]) {
      const run = await runCliAsSubprocess(
        ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath)],
        { cwd: dir }
      );
      assert.equal(run.code, 1, run.stderr);
      assert.match(run.stderr, /cannot read --qa-evidence/);
      assert.doesNotMatch(run.stderr, /River Review \(local\)/, 'the review must not start');
      assert.equal(run.stdout, '');
      assert.equal(existsSync(auditPath), false);
    }
  });

  test('a run without changes still writes the audit against a clean HEAD', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    });
    t.after(cleanup);
    const work = scratch(t);
    const head = await git(['rev-parse', 'HEAD'], dir);
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceFor(head));

    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', ...qaFlags(evidencePath, auditPath)],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /No changes to review/);
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    assert.equal(audit.revision.dirty, false);
    for (const criterion of audit.criteria) {
      assert.ok(!criterion.reasonCodes.includes('QA_TARGET_REVISION_STALE'));
      assert.ok(!criterion.reasonCodes.includes('QA_TARGET_REVISION_UNOBSERVED'));
      assert.ok(criterion.reasonCodes.includes('QA_INDEPENDENCE_UNKNOWN'));
      assert.equal(criterion.verified, false);
    }
  });

  test('untracked files alone leave the QA audit clean', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    });
    t.after(cleanup);
    writeFileSync(join(dir, 'untracked.txt'), 'ci output\n');
    const work = scratch(t);
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));

    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath)],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    assert.equal(audit.revision.dirty, false);
    assert.deepEqual(audit.revision.changedFiles, []);
  });
});

describe('listTrackedChanges', () => {
  test('skips the source path of a rename or copy in either status column', () => {
    assert.deepEqual(parsePorcelainZPaths(' R new.txt\0old-name.txt\0 M next.txt\0'), [
      'new.txt',
      'next.txt',
    ]);
    assert.deepEqual(parsePorcelainZPaths(' C copy.txt\0orig-name.txt\0M  next.txt\0'), [
      'copy.txt',
      'next.txt',
    ]);
    assert.deepEqual(parsePorcelainZPaths('R  new.txt\0old-name.txt\0 M next.txt\0'), [
      'new.txt',
      'next.txt',
    ]);
  });

  test('lists tracked changes, the new path of a rename, and no untracked file', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.txt': 'c\n' },
    });
    t.after(cleanup);
    assert.deepEqual(await listTrackedChanges(dir), []);
    writeFileSync(join(dir, 'a.txt'), 'changed\n');
    await runGit(['mv', 'b.txt', 'renamed.txt'], dir);
    writeFileSync(join(dir, 'untracked.txt'), 'u\n');
    assert.deepEqual((await listTrackedChanges(dir)).sort(), ['a.txt', 'renamed.txt']);
  });

  test('returns null outside a repository', async (t) => {
    assert.equal(await listTrackedChanges(scratch(t)), null);
  });
});
