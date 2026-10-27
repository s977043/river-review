import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo } from './helpers/temp-repo.mjs';

// #2812 Step 2 (HTML): a run in which no unit reached the LLM must not render
// as a full-review auto-approve. Checked through `river run --output html`, so
// the run.mjs wiring of `llmNotExecuted` is covered along with the formatter.
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

async function renderHtml(t, { apiKey }) {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-html-llm-not-executed-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: { 'src/app.js': 'export const value = 2;\n' },
  });
  t.after(cleanup);
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = noIssues;

  const env = Object.fromEntries(KEY_VARS.map((key) => [key, undefined]));
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  const { stdout } = await runCliInProcess(['run', '.', '--output', 'html'], { cwd: dir, env });
  return stdout;
}

describe('HTML report when the LLM did not run (#2812)', () => {
  it('no key: warns, and shows auto-approve / 100/100 only as labelled reference values', async (t) => {
    const html = await renderHtml(t, {});

    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /LLM による意味レビューは未実行です/);
    assert.doesNotMatch(html, /✓ Auto Approve/);
    assert.doesNotMatch(html, /class="overall"/);
    assert.doesNotMatch(html, /class="score-bar"/);
    for (const line of html.split('\n').filter((l) => /Auto Approve|\/100/.test(l))) {
      assert.match(line, /参考値（LLM 未実行）/);
    }
  });

  it('key set, NO_ISSUES: keeps the auto-approve banner and score', async (t) => {
    const html = await renderHtml(t, { apiKey: 'test-key' });

    assert.match(html, /✓ Auto Approve/);
    assert.match(html, /<span class="overall">100\/100<\/span>/);
    assert.match(html, /class="score-bar"/);
    assert.doesNotMatch(html, /LLM 未実行|意味レビューは未実行/);
  });
});
