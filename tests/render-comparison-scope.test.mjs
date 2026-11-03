import assert from 'node:assert/strict';
import { it } from 'node:test';
import { formatComparisonScopeMarkdown, printMarkdownReport } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
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
  assert.match(formatComparisonScopeMarkdown(result), /Raw changed files \(before exclusions\): 2/);
  assert.match(formatComparisonScopeMarkdown(result), /not execution coverage\): 1/);
  assert.match(formatComparisonScopeMarkdown(result), /working tree: clean/);

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
  assert.match(formatComparisonScopeMarkdown(noChanges), /not execution coverage\): 0/);
});

it('reports unknown metadata honestly and warns that dirty HEAD is not a snapshot', () => {
  const unknown = formatComparisonScopeMarkdown({});
  assert.match(unknown, /Comparison merge base: unknown/);
  assert.match(unknown, /before exclusions\): unknown/);
  assert.match(unknown, /not execution coverage\): unknown/);
  assert.match(formatComparisonScopeMarkdown({ dirty: true }), /HEAD alone cannot reproduce/);
  for (const mergeBase of ['<script>bad</script>', '<SCRIPT>bad</SCRIPT>']) {
    assert.equal(
      formatComparisonScopeMarkdown({ mergeBase }).split('\n')[0],
      '- Comparison merge base: unknown'
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
  assert.match(lines.join('\n'), /Raw changed files \(before exclusions\): 2/);
  assert.match(lines.join('\n'), /not execution coverage\): 1/);
});
