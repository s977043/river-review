// `river run --qa-evidence` (ADR-017 D2 / D5 / D6, rollout step 5): the CLI reads the evidence
// file and hands it to `auditQaEvidence` with the HEAD and `dirty` the run observed. The audit is
// cross-checked against a direct `auditQaEvidence` call rather than against hand-written values.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, test } from 'node:test';

import { listTrackedChanges, parsePorcelainZPaths } from '../src/lib/git.mjs';
import { QA_EVIDENCE_LIMITS, auditQaEvidence } from '../src/lib/qa-evidence.mjs';
import { buildExecutionPlan } from '../runners/core/review-runner.mjs';
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

const QA_SKILL_ID = 'qa-evidence-consistency';

const IGNORED_CONTEXT_WARNING =
  /--context qaEvidence is ignored; no CLI input makes it available yet \(river run --qa-evidence records the audit only\)/;

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
    // Accepted evidence is recorded only: no skill receives its body yet (ADR-017 rollout step 5).
    assert.doesNotMatch(contextsLine(run.stderr), /\bqaEvidence\b/);
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
    assert.equal(JSON.parse(readFileSync(join(work, 'a.json'), 'utf8')).accepted, true);
    assert.equal(withQa.code, plain.code);
    assert.deepEqual(JSON.parse(withQa.stdout), JSON.parse(plain.stdout));
    assert.equal(contextsLine(withQa.stderr), contextsLine(plain.stderr));
    assert.doesNotMatch(contextsLine(plain.stderr), /\bqaEvidence\b/);
    assert.doesNotMatch(plain.stderr, /QA evidence audit/);
  });

  // A dry run skips the QA skill as LLM-only before it reaches inputContext, so the contexts the
  // downstream run hands to planning are replayed into buildExecutionPlan to see the selection.
  test('accepted evidence leaves the QA skill skipped for missing qaEvidence downstream', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const evidencePath = join(work, 'evidence.json');
    const auditPath = join(work, 'audit.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));

    const run = await runCliAsSubprocess(
      [
        'run',
        '.',
        '--dry-run',
        '--phase',
        'downstream',
        '--output',
        'json',
        ...qaFlags(evidencePath, auditPath),
      ],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    assert.equal(JSON.parse(readFileSync(auditPath, 'utf8')).accepted, true);
    const contexts = contextsLine(run.stderr)
      .replace(/^Contexts:\s*/, '')
      .split(', ');

    const plan = await buildExecutionPlan({
      phase: 'downstream',
      changedFiles: ['src/app.js'],
      availableContexts: contexts,
    });
    const idOf = (skill) => (skill.metadata ?? skill).id;
    assert.ok(!plan.selected.map(idOf).includes(QA_SKILL_ID));
    const skipped = plan.skipped.find((entry) => idOf(entry.skill) === QA_SKILL_ID);
    assert.ok(skipped, `${QA_SKILL_ID} must be skipped`);
    assert.deepEqual(skipped.reasons, ['missing inputContext: qaEvidence']);
  });

  test('--help states that input/output errors stop the run with exit 1', async () => {
    const help = await runCliAsSubprocess(['--help']);
    assert.equal(help.code, 0, help.stderr);
    assert.match(
      help.stdout,
      /The audit result alone does not change the review output, gate\s+or exit code; input\/output errors stop the run with exit 1/
    );
  });

  test('--context qaEvidence alone resolves the same skills as no --context', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const resolve = (extra) =>
      runCliAsSubprocess(
        ['skills', 'resolve', '--path', 'src/app.js', '--output', 'json', ...extra],
        { cwd: dir }
      );
    const plain = await resolve([]);
    const alone = await resolve(['--context', 'qaEvidence']);
    assert.equal(plain.code, 0, plain.stderr);
    assert.equal(alone.code, 0, alone.stderr);
    assert.match(alone.stderr, IGNORED_CONTEXT_WARNING);
    const plainSelected = JSON.parse(plain.stdout).selected;
    assert.ok(plainSelected.length > 0);
    assert.deepEqual(JSON.parse(alone.stdout).selected, plainSelected);
  });

  test('--context diff,qaEvidence does not make the context available', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const run = await runCliAsSubprocess(
      ['run', '.', '--dry-run', '--output', 'json', '--context', 'diff,qaEvidence'],
      { cwd: dir }
    );
    assert.equal(run.code, 0, run.stderr);
    assert.doesNotMatch(contextsLine(run.stderr), /\bqaEvidence\b/);
    assert.match(contextsLine(run.stderr), /\bdiff\b/);
    assert.match(run.stderr, IGNORED_CONTEXT_WARNING);
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
      [join(work, 'no-dir', 'audit.json'), /its parent directory does not exist$/m],
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

  test('an output whose parent is a regular file keeps the original error', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const evidencePath = join(work, 'evidence.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));
    const run = await runCliAsSubprocess(
      [
        'run',
        '.',
        '--dry-run',
        '--output',
        'json',
        ...qaFlags(evidencePath, join(evidencePath, 'audit.json')),
      ],
      { cwd: dir }
    );
    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /--qa-audit-output is refused: ENOTDIR/);
    assert.doesNotMatch(run.stderr, /its parent directory does not exist/);
    assert.doesNotMatch(run.stderr, /River Review \(local\)/, 'the review must not start');
  });

  test('an output under --qa-artifacts reached through a symlink is refused', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);
    const work = scratch(t);
    const artifacts = scratch(t);
    const link = join(work, 'artifacts-link');
    symlinkSync(artifacts, link);
    const evidencePath = join(work, 'evidence.json');
    writeFileSync(evidencePath, evidenceFor(await git(['rev-parse', 'HEAD'], dir)));
    // Either side may be the link: the output path, or the --qa-artifacts root.
    for (const [auditPath, artifactsRoot] of [
      [join(link, 'audit.json'), artifacts],
      [join(artifacts, 'audit.json'), link],
    ]) {
      const run = await runCliAsSubprocess(
        [
          'run',
          '.',
          '--dry-run',
          '--output',
          'json',
          ...qaFlags(evidencePath, auditPath, artifactsRoot),
        ],
        { cwd: dir }
      );
      assert.equal(run.code, 1, `${auditPath}: ${run.stderr}`);
      assert.match(run.stderr, /--qa-audit-output is refused: it is inside --qa-artifacts/);
    }
    assert.equal(existsSync(join(artifacts, 'audit.json')), false);
  });

  const duplicateAc = structuredClone(BASE.evidence);
  duplicateAc.target.acceptanceCriteria.push(duplicateAc.target.acceptanceCriteria[0]);
  for (const [name, content, stage, code] of [
    ['not JSON', '{ not json', 1, 'QA_EVIDENCE_MALFORMED'],
    ['over the size limit', `"${'x'.repeat(1_048_576)}"`, 1, 'QA_EVIDENCE_TOO_LARGE'],
    [
      'with an undefined field',
      JSON.stringify({ ...BASE.evidence, unexpected: true }),
      1,
      'QA_EVIDENCE_MALFORMED',
    ],
    ['with a duplicate AC id', JSON.stringify(duplicateAc), 3, 'QA_TARGET_AC_ID_DUPLICATE'],
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
      assert.equal(audit.stage, stage);
      assert.deepEqual(audit.rejectReasons, [code]);
      // Rejected evidence never makes the context available to skill selection.
      assert.doesNotMatch(contextsLine(run.stderr), /\bqaEvidence\b/);
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

  test(
    'a FIFO as --qa-evidence is not a regular file and stops with exit 1',
    { skip: process.platform === 'win32' },
    async (t) => {
      const { dir, cleanup } = await createRepoWithSilentCatchChange();
      t.after(cleanup);
      const work = scratch(t);
      const fifo = join(work, 'evidence.fifo');
      execFileSync('mkfifo', [fifo]);
      const auditPath = join(work, 'audit.json');
      const run = await runCliAsSubprocess(
        ['run', '.', '--dry-run', '--output', 'json', ...qaFlags(fifo, auditPath)],
        { cwd: dir }
      );
      assert.equal(run.code, 1, run.stderr);
      assert.match(run.stderr, /cannot read --qa-evidence: not a regular file/);
      assert.doesNotMatch(run.stderr, /River Review \(local\)/, 'the review must not start');
      assert.equal(existsSync(auditPath), false);
    }
  );

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

describe('river review exec --plan with a QA evidence skill', () => {
  function fullArtifact(skillId) {
    return {
      version: '1',
      timestamp: '2026-11-24T00:00:00Z',
      phase: 'downstream',
      status: 'ok',
      plan: { selectedSkills: [{ id: skillId }], skippedSkills: [], plannerMode: 'off' },
    };
  }

  async function replay(t, plan) {
    const work = scratch(t);
    const planPath = join(work, 'plan.json');
    writeFileSync(planPath, JSON.stringify(plan));
    return runCliAsSubprocess(['review', 'exec', '--plan', planPath], { cwd: work });
  }

  for (const [name, plan] of [
    ['a full artifact', fullArtifact(QA_SKILL_ID)],
    ['a bare plan', { selectedSkills: [{ id: QA_SKILL_ID }] }],
  ]) {
    test(`${name} selecting it is refused with exit 1`, async (t) => {
      const run = await replay(t, plan);
      assert.equal(run.code, 1, run.stderr);
      assert.match(
        run.stderr,
        /review exec --plan cannot run qa-evidence-consistency: it requires the qaEvidence input context, and the main CLI does not pass QA evidence to skills yet/
      );
      assert.equal(run.stdout, '');
    });
  }

  test('a plan without a QA evidence skill replays as before', async (t) => {
    const run = await replay(t, fullArtifact('test-existence'));
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(
      JSON.parse(run.stdout).plan.selectedSkills.map((skill) => skill.id),
      ['test-existence']
    );
  });
});

describe('QA_EVIDENCE_LIMITS', () => {
  test('matches the literal limits of docs/development/qa-evidence-contract.md §2.1', () => {
    assert.deepEqual(QA_EVIDENCE_LIMITS, {
      evidenceBytes: 1048576,
      depth: 16,
      artifactBytes: 104857600,
      artifactTotalBytes: 536870912,
    });
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
