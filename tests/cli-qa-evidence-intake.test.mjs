// `river run --qa-evidence` (ADR-017 D2 / D5 / D6, rollout step 5): the CLI reads the evidence
// file and hands it to `auditQaEvidence` with the HEAD and `dirty` the run observed. The audit is
// cross-checked against a direct `auditQaEvidence` call rather than against hand-written values.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

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
    const head = await git(['rev-parse', 'HEAD'], dir);
    const repoRoot = await git(['rev-parse', '--show-toplevel'], dir);
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceFor(head));
    // `ci-pass` points into the artifacts root, so dropping that root changes its resolution.
    mkdirSync(join(work, 'ci'));
    writeFileSync(join(work, 'ci', 'pass.txt'), 'ok\n');

    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath, work)],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);

    const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
    const direct = await auditQaEvidence({
      evidence: readFileSync(evidencePath),
      population: null,
      observed: { head, dirty: true },
      roots: { repository: repoRoot, artifacts: work },
    });
    assert.deepEqual(audit, JSON.parse(JSON.stringify(direct)));
    assert.equal(audit.accepted, true);
    assert.equal(audit.revision.observedHead, head);
    assert.equal(audit.revision.dirty, true);
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

  test('an unreadable evidence path stops before the review with exit 2', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const auditPath = join(work, 'audit.json');
    for (const evidencePath of [join(work, 'missing.json'), work]) {
      const run = await runCliAsSubprocess(
        ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(evidencePath, auditPath)],
        { cwd: dir }
      );
      assert.equal(run.code, 2, run.stderr);
      assert.match(run.stderr, /cannot read --qa-evidence/);
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
});
