import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { printMarkdownReport } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2812 Step 2: a run in which no unit reached the LLM must not render as a
// full-review auto-approve. Checked through printMarkdownReport on the output
// of runLocalReview, on both the single-reviewer and --reviewers paths.
const ROLES = ['bug-hunter', 'security-scanner'];
const KEY_VARS = [
  'RIVER_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'RIVER_OFFLINE',
  'RIVER_GATE_REQUIRE_LLM',
  'RIVER_GATE_COVERAGE',
];

const noIssues = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
});

async function renderRun(t, { reviewers, apiKey }) {
  const saved = {};
  for (const key of KEY_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-llm-not-executed-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: { 'src/app.js': 'export const value = 2;\n' },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const context = await planLocalReview({ cwd: dir, dryRun: true });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = noIssues;

  const result = await runLocalReview({
    cwd: dir,
    context,
    dryRun: false,
    apiKey,
    quiet: true,
    ...(reviewers ? { reviewers } : {}),
  });

  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    printMarkdownReport(result, 'midstream');
  } finally {
    console.log = originalLog;
  }
  return { result, markdown: lines.join('\n') };
}

for (const [pathName, reviewers] of [
  ['single reviewer', undefined],
  ['--reviewers', ROLES],
]) {
  describe(`Markdown report when the LLM did not run, ${pathName} path (#2812)`, () => {
    it('no key: warns, shows no auto-approve / 100/100, and lists the gap in the Decision Surface', async (t) => {
      const { result, markdown } = await renderRun(t, { reviewers });

      assert.equal(result.llmNotExecuted, true);
      // A verdict or score may appear only as a labelled static-only reference value.
      for (const line of markdown.split('\n').filter((l) => /判定: |\/100/.test(l))) {
        assert.match(line, /^- 参考値（LLM 未実行）: /);
      }
      assert.doesNotMatch(markdown, /結果\(スコア\)/);
      assert.doesNotMatch(markdown, /マージ前に対応が必要な指摘はありません/);
      assert.match(markdown, /LLM (レビュー未設定|による意味レビューは未実行)/);
      assert.match(markdown, /### 判断が必要な項目/);
      assert.match(markdown, /- LLM による意味レビュー: \*\*未実行\*\*/);
    });

    it('key set, NO_ISSUES: keeps the auto-approve headline and score', async (t) => {
      const { result, markdown } = await renderRun(t, { reviewers, apiKey: 'test-key' });

      assert.notEqual(result.llmNotExecuted, true);
      assert.match(markdown, /\*\*判定: auto-approve\*\*/);
      assert.match(markdown, /スコア 100\/100/);
      assert.doesNotMatch(markdown, /意味レビュー/);
    });
  });
}
