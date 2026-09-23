import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const ACTION_PATH = path.join(REPO_ROOT, 'runners', 'github-action', 'action.yml');
const actionYml = fs.readFileSync(ACTION_PATH, 'utf8');

function runBlock() {
  const startMarker = '      run: |\n';
  const endMarker = '\n    # Both comment steps';
  const start = actionYml.indexOf(startMarker);
  assert.notEqual(start, -1, 'run block start not found');
  const contentStart = start + startMarker.length;
  const end = actionYml.indexOf(endMarker, contentStart);
  assert.notEqual(end, -1, 'run block end not found');
  return actionYml.slice(contentStart, end);
}

function render({ reviewers = '', entry = '' } = {}) {
  const inputs = {
    phase: 'midstream',
    planner: 'off',
    target: '.',
    comment: 'false',
    inline_comments: 'false',
    dry_run: 'false',
    debug: 'false',
    estimate: 'false',
    max_cost: '',
    gate: 'false',
  };

  const script = runBlock()
    .split('\n')
    .map((line) => line.slice(8))
    .join('\n')
    .replace(/\$\{\{ inputs\.(\w+) \}\}/g, (_, key) => inputs[key] ?? '')
    .replace(/echo "Running: \${cmd\[\*\]}"[\s\S]*$/, 'echo "Running: ${cmd[*]}"\n');

  return execFileSync('bash', ['-c', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RIVER_REPO_ROOT: REPO_ROOT,
      RIVER_OUTPUT_FORMAT: 'markdown',
      INPUT_DETERMINISTIC_EXEC: 'false',
      INPUT_TRUSTED_TREE: '',
      INPUT_ENTRY: entry,
      INPUT_REVIEWERS: reviewers,
      GITHUB_ACTION_PATH: path.join(REPO_ROOT, 'runners', 'github-action'),
    },
  });
}

test('GitHub Action declares reviewers as an additive empty-default input (#2344)', () => {
  const block = /^  reviewers:\n(?:    .*\n)+/m.exec(actionYml)?.[0] ?? '';
  assert.match(block, /required: false/);
  assert.match(block, /default: ''/);
  assert.match(actionYml, /INPUT_REVIEWERS: \$\{\{ inputs\.reviewers \}\}/);
});

test('GitHub Action forwards one reviewers argument pair only on the run path (#2344)', () => {
  const withReviewers =
    /^Running: (.*)$/m.exec(render({ reviewers: 'bug-hunter,security-scanner' }))?.[1] ?? '';
  assert.match(withReviewers, / --reviewers bug-hunter,security-scanner(?: |$)/);
  assert.equal((withReviewers.match(/--reviewers/g) ?? []).length, 1);

  const withoutReviewers = /^Running: (.*)$/m.exec(render())?.[1] ?? '';
  assert.doesNotMatch(withoutReviewers, /--reviewers/);

  const entryOutput = render({ reviewers: 'bug-hunter,security-scanner', entry: 'review-task' });
  const entryCommand = /^Running: (.*)$/m.exec(entryOutput)?.[1] ?? '';
  assert.doesNotMatch(entryCommand, /--reviewers/);
  const notice = entryOutput.split('\n').find((line) => line.startsWith('::notice::')) ?? '';
  assert.match(notice, /\breviewers\b/);
});

test('reviewers shell metacharacters remain data and are not evaluated (#2344)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'river-review-reviewers-'));
  const sentinel = path.join(tempDir, 'injected');
  try {
    const reviewers = `bug-hunter;touch ${sentinel}`;
    const output = render({ reviewers });
    assert.equal(fs.existsSync(sentinel), false);
    assert.match(output, /--reviewers bug-hunter;touch /);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
