import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { runCliAsSubprocess } from './helpers/cli.mjs';
import { createRepoWithSilentCatchChange } from './helpers/temp-repo.mjs';

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function planFiles(dir) {
  const workDir = join(dir, 'docs', 'working', 'TASK-0001');
  await mkdir(workDir, { recursive: true });
  const plan = '# Rollout\n';
  const questions = JSON.stringify({
    version: 1,
    questions: [
      { id: 'Q1', prompt: 'Which rollout?', choices: ['Canary', 'Flag'] },
      { id: 'Q2', prompt: 'When to resume?' },
    ],
  });
  const feedbackPath = join(dir, 'review-feedback.json');
  await writeFile(join(workDir, 'plan.md'), plan);
  await writeFile(join(workDir, 'review-questions.json'), questions);
  const sidecar = {
    schemaVersion: 1,
    kind: 'plan-review-feedback',
    taskId: 'TASK-0001',
    source: {
      plan: { path: 'plan.md', sha256: sha(plan) },
      questions: { path: 'review-questions.json', sha256: sha(questions) },
    },
    feedback_only: true,
    approval_granted: false,
    generatedAt: '2026-10-09T00:00:00.000Z',
    answers: [
      { questionId: 'Q1', status: 'answered', response: 'Canary', note: '' },
      { questionId: 'Q2', status: 'deferred', response: '', note: 'Need evidence' },
    ],
  };
  await writeFile(feedbackPath, JSON.stringify(sidecar));
  return { workDir, feedbackPath };
}

function flags(workDir, feedbackPath) {
  return [
    '--plan-feedback',
    feedbackPath,
    '--plan-feedback-workdir',
    workDir,
    '--plan-feedback-task',
    'TASK-0001',
  ];
}

test('river run --output html displays source-matched feedback without changing findings', async (t) => {
  const { dir, cleanup } = await createRepoWithSilentCatchChange();
  t.after(cleanup);
  const { workDir, feedbackPath } = await planFiles(dir);
  const run = await runCliAsSubprocess(
    ['run', '.', '--dry-run', '--output', 'html', ...flags(workDir, feedbackPath)],
    { cwd: dir }
  );
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /^<!DOCTYPE html>/);
  assert.match(run.stdout, /Planning questions \(review-only\)/);
  assert.match(run.stdout, /DEFERRED/);
  assert.match(run.stdout, /Need evidence/);
  assert.match(run.stdout, /Source-matched feedback/);
  assert.match(run.stdout, /Findings/);
  assert.doesNotMatch(run.stdout, /approval_granted:\s*true/);
});

test('CLI rejects partial and wrong-format feedback flags before reviewing', async (t) => {
  const { dir, cleanup } = await createRepoWithSilentCatchChange();
  t.after(cleanup);
  const { workDir, feedbackPath } = await planFiles(dir);
  for (const args of [
    ['run', '.', '--output', 'html', '--plan-feedback', feedbackPath],
    ['run', '.', '--output', 'json', ...flags(workDir, feedbackPath)],
    ['doctor', '.', '--output', 'html', ...flags(workDir, feedbackPath)],
  ]) {
    const run = await runCliAsSubprocess(args, { cwd: dir });
    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /must be used together/);
    assert.equal(run.stdout, '');
  }
});

test('CLI refuses a stale sidecar before emitting an HTML success document', async (t) => {
  const { dir, cleanup } = await createRepoWithSilentCatchChange();
  t.after(cleanup);
  const { workDir, feedbackPath } = await planFiles(dir);
  await writeFile(join(workDir, 'plan.md'), '# Plan changed\n');
  const run = await runCliAsSubprocess(
    ['run', '.', '--dry-run', '--output', 'html', ...flags(workDir, feedbackPath)],
    { cwd: dir }
  );
  assert.equal(run.code, 2, run.stderr);
  assert.match(run.stderr, /STALE/);
  assert.equal(run.stdout, '');
});
