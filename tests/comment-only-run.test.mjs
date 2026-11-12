import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLlmDiffView,
  collectRepoDiff,
  optimizeDiff,
  parseUnifiedDiff,
} from '../src/lib/diff-processor.mjs';
import { splitDiffIntoChunks } from '../src/lib/reviewer-orchestrator.mjs';
import { planLocalReview } from '../src/lib/local-runner.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo } from './helpers/temp-repo.mjs';

const env = {
  RIVER_OFFLINE: '1',
  RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
  RIVER_AUTO_SAVE: '0',
  RIVER_PR_LABELS: undefined,
  RIVER_PR_BODY: undefined,
  GITHUB_EVENT_PATH: undefined,
};

async function fixture(t, added, file = 'src/app.js', config = {}) {
  const { dir, cleanup } = await createTempGitRepo({
    initialFiles: { [file]: 'class Box {\n}\n', ...config },
    changedFiles: { [file]: `class Box {\n${added}\n}\n` },
  });
  t.after(cleanup);
  return dir;
}

for (const gate of [false, true]) {
  test(`CLI reviews a private-field-only addition (gate=${gate})`, async (t) => {
    const cwd = await fixture(t, '  #x = 1;');
    const diff = await collectRepoDiff(cwd, 'HEAD');
    assert.equal(diff.filesForReview.length, 1);
    const planned = await planLocalReview({ cwd, baseRef: 'HEAD', dryRun: true });
    assert.equal(planned.status, 'ok');
    const result = await runCliInProcess(
      ['run', '.', '--base', 'HEAD', '--output', 'json', ...(gate ? ['--gate'] : [])],
      { cwd, env }
    );
    assert.doesNotMatch(result.stderr + result.stdout, /No changes to review/);
    const output = JSON.parse(result.stdout);
    assert.ok(Array.isArray(output.issues));
    if (gate) assert.ok(output.gate);
  });

  test(`CLI preserves ordinary comment no-changes (gate=${gate})`, async (t) => {
    const cwd = await fixture(t, '  // note');
    const diff = await collectRepoDiff(cwd, 'HEAD');
    assert.equal(diff.filesForReview.length, 0);
    const result = await runCliInProcess(
      ['run', '.', '--base', 'HEAD', '--output', 'json', ...(gate ? ['--gate'] : [])],
      { cwd, env }
    );
    assert.equal(result.code, 0);
    assert.match(result.stderr, /No changes to review/);
    assert.equal(result.stdout, '');
  });
}

test('comment-only detector finding crosses the no-changes shortcut and reaches CLI gate', async (t) => {
  const cwd = await fixture(t, '  // TODO: temporary workaround');
  const diff = await collectRepoDiff(cwd, 'HEAD');
  assert.equal(diff.filesForReview.length, 0);
  const result = await runCliInProcess(
    ['run', '.', '--base', 'HEAD', '--gate', '--output', 'json'],
    { cwd, env }
  );
  assert.doesNotMatch(result.stderr, /No changes to review/);
  const output = JSON.parse(result.stdout);
  assert.ok(
    output.issues.some((issue) => issue.ruleId === 'knowledge-to-code-alignment'),
    JSON.stringify(output.issues)
  );
  assert.ok(output.gate);
});

for (const [file, line] of [
  ['src/a.c', '#include <stdio.h>'],
  ['src/a.css', '#main { color: red; }'],
  ['src/a.unknown', '# custom syntax'],
  ['src/a.py', '# ordinary Python comment'],
]) {
  test(`does not guess hash comment semantics in ${file}`, () => {
    const diffText = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1 @@\n+${line}\n`;
    assert.equal(optimizeDiff({ ...parseUnifiedDiff(diffText), diffText }).files.length, 1);
  });
}

for (const file of ['README.md', 'dist/app.js', 'package-lock.json']) {
  test(`preflight does not resurrect excluded ${file}`, async (t) => {
    const cwd = await fixture(t, '// TODO: temporary workaround', file);
    const planned = await planLocalReview({ cwd, baseRef: 'HEAD', dryRun: true });
    assert.equal(planned.status, 'no-changes');
  });
}

test('preflight respects configured file exclusions', async (t) => {
  const cwd = await fixture(t, '// TODO: temporary workaround', 'src/app.js', {
    '.river-review.yaml': 'exclude:\n  files:\n    - "src/**"\n',
  });
  const planned = await planLocalReview({ cwd, baseRef: 'HEAD', dryRun: true });
  assert.equal(planned.status, 'no-changes');
});

test('preflight scans raw hunks rather than the compressed prompt', async (t) => {
  const lines = Array.from({ length: 240 }, () => '  // note');
  lines[150] = '  // TODO: temporary workaround';
  const cwd = await fixture(t, lines.join('\n'));
  const planned = await planLocalReview({ cwd, baseRef: 'HEAD', dryRun: true });
  assert.equal(planned.status, 'ok');
  assert.equal(planned.fullFileSupply.available, true);
  assert.ok(planned.availableContexts.includes('fullFile'));
  assert.deepEqual(
    planned.fullFileSupply.supplied.map((file) => file.path),
    ['src/app.js']
  );
  assert.deepEqual(planned.reviewFileScope.selected, ['src/app.js']);
  assert.deepEqual(planned.reviewFileScope.excluded, []);
  assert.equal(planned.changedFiles.length, 1);
  assert.equal(planned.diff.filesForReview.length, 1);
});

test('a truly unchanged repo stays no-changes', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({ initialFiles: { 'src/app.js': '// note\n' } });
  t.after(cleanup);
  assert.equal(
    (await planLocalReview({ cwd: dir, baseRef: 'HEAD', dryRun: true })).status,
    'no-changes'
  );
});

test('restored comment prompts survive chunking and phase-specific view rebuilding', async (t) => {
  const cwd = await fixture(t, '// TODO: temporary workaround');
  const planned = await planLocalReview({ cwd, baseRef: 'HEAD', dryRun: true });
  assert.equal(planned.status, 'ok');
  const files = Array.from({ length: 30 }, (_, index) => ({
    ...planned.diff.files[0],
    path: `src/file${index}.js`,
  }));
  const chunks = splitDiffIntoChunks({ ...planned.diff, files });
  assert.ok(chunks?.length);
  for (const chunk of chunks) {
    for (const phase of ['midstream', 'upstream']) {
      const view = buildLlmDiffView(chunk, { phase });
      assert.equal(view.files.length, chunk.files.length);
      assert.match(view.diffText, /TODO: temporary workaround/);
    }
  }
});

test('preflight respects explicit skill selection', async (t) => {
  const cwd = await fixture(t, '// TODO: temporary workaround');
  const planned = await planLocalReview({
    cwd,
    baseRef: 'HEAD',
    dryRun: true,
    skillIds: ['security-basic'],
  });
  assert.equal(planned.status, 'no-changes');
});

test('private field is retained in a real zero-context git diff', async (t) => {
  const cwd = await fixture(t, '#x = 1;');
  const diff = await collectRepoDiff(cwd, 'HEAD', { contextLines: 0 });
  assert.equal(diff.filesForReview.length, 1);
});

test('chunked multi-reviewer CLI retains comment detector findings', async (t) => {
  const initialFiles = {};
  const changedFiles = {};
  for (let i = 0; i < 12; i += 1) {
    const file = `src/group${i}/app.js`;
    initialFiles[file] = 'export const value = 1;\n';
    changedFiles[file] = 'export const value = 1;\n// TODO: temporary workaround\n';
  }
  const { dir: cwd, cleanup } = await createTempGitRepo({ initialFiles, changedFiles });
  t.after(cleanup);
  const result = await runCliInProcess(
    [
      'run',
      '.',
      '--base',
      'HEAD',
      '--gate',
      '--output',
      'json',
      '--reviewers',
      'bug-hunter,security-scanner',
    ],
    { cwd, env }
  );
  assert.doesNotMatch(result.stderr, /No changes to review/);
  const output = JSON.parse(result.stdout);
  assert.ok(output.issues.some((issue) => issue.ruleId === 'knowledge-to-code-alignment'));
  assert.ok(output.gate);
});

test('clean comments do not call the model even with a configured key', async (t) => {
  const cwd = await fixture(t, '// note');
  let calls = 0;
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('unexpected model call');
  };
  t.after(() => {
    globalThis.fetch = fetch;
  });
  const result = await runCliInProcess(
    ['run', '.', '--base', 'HEAD', '--gate', '--output', 'json'],
    {
      cwd,
      env: {
        ...env,
        RIVER_OFFLINE: undefined,
        OPENAI_API_KEY: 'test-key',
        RIVER_OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: undefined,
        GOOGLE_API_KEY: undefined,
      },
    }
  );
  assert.equal(result.code, 0);
  assert.match(result.stderr, /No changes to review/);
  assert.equal(calls, 0);
});
