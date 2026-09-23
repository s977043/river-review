import assert from 'node:assert';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runCliInProcess } from '../helpers/cli.mjs';
import { createTempGitRepo, runGit } from '../helpers/temp-repo.mjs';

const SAMPLE_DIFF = resolve('tests/fixtures/sample-diff.txt');
const SAMPLE_RULES = resolve('tests/fixtures/.river/rules.md');

async function applySampleDiff(repoDir) {
  const raw = await fs.promises.readFile(SAMPLE_DIFF, 'utf8');
  const lines = raw
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
  const targetPath = join(repoDir, 'src', 'utils');
  await fs.promises.mkdir(targetPath, { recursive: true });
  await fs.promises.writeFile(join(targetPath, 'math.ts'), `${lines.join('\n')}\n`, 'utf8');
}

async function setupRepoWithDiff() {
  const rulesText = await fs.promises.readFile(SAMPLE_RULES, 'utf8');
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-int-',
    rules: rulesText,
  });
  await applySampleDiff(dir);
  // 新規ファイルは git add しないと diff に現れないため明示的にステージする
  await runGit(['add', '.'], dir);
  return { dir, cleanup };
}

test('runs dry-run review with sample diff and project rules', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(['run', '.', '--dry-run', '--debug'], { cwd: dir });

  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /River Review/);
  assert.match(result.stdout, /Project rules: present/);
  assert.match(result.stdout, /src\/utils\/math.ts/);
  assert.match(result.stdout, /Review comments/);
});

test('respects phase flag in integration run', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(['run', '.', '--phase', 'downstream', '--dry-run'], {
    cwd: dir,
  });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /Phase: downstream/);
});

test('debug output shows token estimation and reduction', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(['run', '.', '--dry-run', '--debug'], { cwd: dir });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /Token estimate/);
  assert.match(result.stdout, /Changed files/);
});

test('fails clearly when project rules cannot be read', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const rulesPath = join(dir, '.river', 'rules.md');
  await fs.promises.rm(rulesPath, { force: true });
  await fs.promises.mkdir(rulesPath, { recursive: true });

  const result = await runCliInProcess(['run', '.'], { cwd: dir });
  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /Failed to read project rules/);
});

// #1689: the reviewer-orchestration progress lines, exercised through the real
// CLI so the run.mjs -> local-runner -> orchestrator wiring is covered (the unit
// tests can only reach the orchestrator directly).
test('--reviewers writes role progress to stderr, never to stdout', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(
    ['run', '.', '--dry-run', '--reviewers', 'bug-hunter,security-scanner', '--output', 'json'],
    { cwd: dir }
  );

  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stderr, /Reviewer bug-hunter: start/);
  assert.match(result.stderr, /Reviewers: \d+\/2 roles succeeded/);
  assert.ok(
    !result.stdout.includes('Reviewer bug-hunter'),
    'progress must not reach stdout, which carries the artifact'
  );
});

// #2363: explicit reviewer input is an execution contract. A typo alongside a
// valid role must fail before the valid subset starts; otherwise Review Coverage
// can report complete for less work than the caller requested.
test('--reviewers rejects a mixed valid and unknown role before execution', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(
    ['run', '.', '--dry-run', '--reviewers', 'bug-hunter,security', '--output', 'json'],
    { cwd: dir }
  );

  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /Unknown reviewer roles: \[security\]/);
  assert.match(result.stderr, /security-scanner/);
  assert.doesNotMatch(result.stderr, /Reviewer bug-hunter: start/);
});

// #1700: the JSON artifact of a --reviewers run carries teamLeadReport plus
// per-issue consensusLevel / reviewerRole. None of the three were declared in
// schemas/output.schema.json, which is additionalProperties: false, so every
// role-orchestrated run printed a schema warning to stderr. validateOutputArtifact
// only warns, so no exit code or unit test caught it — this pins the symptom at
// the CLI boundary where it was observed.
test('--reviewers JSON output validates against output.schema.json', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(
    ['run', '.', '--dry-run', '--reviewers', 'bug-hunter,security-scanner', '--output', 'json'],
    { cwd: dir }
  );

  assert.strictEqual(result.code, 0, result.stderr);
  assert.doesNotMatch(
    result.stderr,
    /does not conform to schemas\/output\.schema\.json/,
    `--reviewers output must validate; got:\n${result.stderr}`
  );
  // Guard against a vacuous pass: the run really did emit the fields that used
  // to trip the validator.
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  assert.ok(parsed.teamLeadReport, 'a --reviewers run must emit teamLeadReport');
  assert.ok(Array.isArray(parsed.teamLeadReport.blindSpots));
  assert.ok(parsed.issues.every((i) => typeof i.reviewerRole === 'string'));
});

// #1689: --quiet was parsed by cli.mjs but consumed by nothing. This asserts the
// whole chain, not just resolveReviewerProgressEnabled().
test('--quiet suppresses the reviewer progress lines end to end', async (t) => {
  const { dir, cleanup } = await setupRepoWithDiff();
  t.after(cleanup);

  const result = await runCliInProcess(
    [
      'run',
      '.',
      '--dry-run',
      '--reviewers',
      'bug-hunter,security-scanner',
      '--output',
      'json',
      '--quiet',
    ],
    { cwd: dir }
  );

  assert.strictEqual(result.code, 0, result.stderr);
  assert.ok(
    !result.stderr.includes('Reviewer bug-hunter'),
    `--quiet must silence the per-role lines; got: ${result.stderr}`
  );
  assert.ok(
    !result.stderr.includes('roles succeeded'),
    '--quiet must silence the summary line too'
  );
});
