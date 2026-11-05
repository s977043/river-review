import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { formatComparisonScopeMarkdown, printMarkdownReport } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit, writeFileRelative } from './helpers/temp-repo.mjs';

it('keeps raw and selected counts distinct on a non-default PR base without model execution', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    initialFiles: { 'app.js': 'export const value = 1;\n' },
  });
  t.after(cleanup);
  await runGit(['checkout', '-b', 'develop'], dir);
  writeFileRelative(dir, 'app.js', 'export const value = 2;\n');
  await runGit(['commit', '-am', 'integration change'], dir);
  const base = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
  await runGit(['checkout', '-b', 'docs-change'], dir);
  writeFileRelative(dir, 'plan.md', '# Plan\nDocumentation only.\n');
  await runGit(['add', '.'], dir);
  await runGit(['commit', '-m', 'documentation'], dir);

  const context = await planLocalReview({ cwd: dir, dryRun: true, phase: 'midstream' });
  assert.equal(context.rawChangedFileCount, 2);
  assert.deepEqual(context.changedFiles, ['app.js']);
  const result = await runLocalReview({ cwd: dir, context, dryRun: true, quiet: true });
  assert.equal(result.rawChangedFileCount, 2);
  assert.match(formatComparisonScopeMarkdown(result), /変更ファイル数（除外前）: 2/);
  assert.match(formatComparisonScopeMarkdown(result), /実行カバレッジではない）: 1/);
  assert.match(formatComparisonScopeMarkdown(result), /作業ツリー: クリーン/);

  const prContext = await planLocalReview({
    cwd: dir,
    baseRef: base,
    dryRun: true,
    phase: 'midstream',
  });
  assert.equal(prContext.status, 'no-changes');
  assert.equal(prContext.mergeBase, base);
  assert.equal(prContext.rawChangedFileCount, 1);
  assert.deepEqual(prContext.changedFiles, []);
  const noChanges = await runLocalReview({
    cwd: dir,
    context: prContext,
    dryRun: true,
    quiet: true,
  });
  assert.equal(noChanges.rawChangedFileCount, 1);
  assert.match(formatComparisonScopeMarkdown(noChanges), /実行カバレッジではない）: 0/);
});

it('reports unknown metadata honestly and warns that dirty HEAD is not a snapshot', () => {
  const unknown = formatComparisonScopeMarkdown({});
  assert.match(unknown, /比較の merge base（ローカルでの比較。PR の base とは限らない）: 不明/);
  assert.match(unknown, /除外前）: 不明/);
  assert.match(unknown, /実行カバレッジではない）: 不明/);
  assert.match(formatComparisonScopeMarkdown({ dirty: true }), /HEAD だけでは再現できない/);
  for (const mergeBase of ['<script>bad</script>', '<SCRIPT>bad</SCRIPT>']) {
    assert.equal(
      formatComparisonScopeMarkdown({ mergeBase }).split('\n')[0],
      '- 比較の merge base（ローカルでの比較。PR の base とは限らない）: 不明'
    );
  }
});

it('preserves scope in the no-key Markdown early return without inventing coverage', () => {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    printMarkdownReport(
      {
        findings: [],
        comments: [],
        changedFiles: ['app.js'],
        rawChangedFileCount: 2,
        reviewDebug: { llmSkipped: 'API key not set' },
        reviewCoverage: null,
        mergeBase: 'a'.repeat(40),
        commitSha: 'b'.repeat(40),
        dirty: false,
      },
      'midstream'
    );
  } finally {
    console.log = log;
  }
  assert.match(lines.join('\n'), /変更ファイル数（除外前）: 2/);
  assert.match(lines.join('\n'), /実行カバレッジではない）: 1/);
});

it('accepts only 40- or 64-character hashes', () => {
  for (const length of [39, 41, 63, 65]) {
    assert.match(
      formatComparisonScopeMarkdown({ mergeBase: 'a'.repeat(length) }).split('\n')[0],
      /: 不明$/
    );
  }
  for (const length of [40, 64]) {
    assert.match(
      formatComparisonScopeMarkdown({ mergeBase: 'a'.repeat(length) }).split('\n')[0],
      new RegExp(`\`a{${length}}\`$`)
    );
  }
});

it('wires comparison scope into the debug summary of a full Markdown report', () => {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    printMarkdownReport(
      {
        findings: [],
        comments: [],
        changedFiles: ['app.js'],
        rawChangedFileCount: 3,
        reviewDebug: { llmUsed: true, llmModel: 'test-model' },
        plan: { selected: [], skipped: [] },
        tokenEstimate: 0,
        mergeBase: 'a'.repeat(40),
        commitSha: 'b'.repeat(40),
        dirty: false,
      },
      'midstream'
    );
  } finally {
    console.log = log;
  }
  const output = lines.join('\n');
  assert.match(output, /レビュー実行の内訳/);
  assert.match(output, /変更ファイル数（除外前）: 3/);
  assert.match(output, /PR の base とは限らない/);
});

describe('no-changes path keeps structured stdout clean', () => {
  let repo = null;

  before(async () => {
    repo = await createTempGitRepo({ initialFiles: { 'a.txt': 'hello\n' } });
  });

  after(async () => {
    await repo.cleanup();
  });

  it('prints comparison scope on stdout for text', async () => {
    const result = await runCliInProcess(['run', '.', '--dry-run', '--output', 'text'], {
      cwd: repo.dir,
      env: { RIVER_OFFLINE: '1' },
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /No changes to review/);
    assert.match(result.stdout, /変更ファイル数（除外前）: 0/);
  });

  for (const output of ['markdown', 'json', 'yaml', 'html']) {
    it(`keeps No changes off stdout and moves scope to stderr for ${output}`, async () => {
      const result = await runCliInProcess(['run', '.', '--dry-run', '--output', output], {
        cwd: repo.dir,
        env: { RIVER_OFFLINE: '1' },
      });
      assert.equal(result.code, 0);
      assert.doesNotMatch(result.stdout, /No changes to review/);
      assert.match(result.stderr, /No changes to review/);
      assert.match(result.stderr, /変更ファイル数（除外前）: 0/);
    });
  }
});
