import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo } from './helpers/temp-repo.mjs';

// #2812 N2/N3: exercise real CLI wiring, not a hand-built formatter input.
// HTTP responses are stubbed; these tests do not measure model review quality.
const KEY_VARS = [
  'RIVER_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'RIVER_ANTHROPIC_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'RIVER_OFFLINE',
  'RIVER_GATE_REQUIRE_LLM',
  'RIVER_GATE_COVERAGE',
];
const REVIEWER_ARGS = ['--reviewers', 'bug-hunter,security-scanner'];
const DECISION_LABELS = {
  'auto-approve': 'Auto Approve',
  'human-review-recommended': 'Human Review Recommended',
  'human-review-required': 'Human Review Required',
};
const UNEXECUTED_WARNING = /LLM による意味レビューは未実行です/;

function bannerBody(html) {
  const banners = [...html.matchAll(/<div class="banner"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.equal(banners.length, 1, 'expected exactly one decision/warning banner');
  return banners[0][1];
}

function assertUnexecutedHtml(html) {
  assert.match(html, /^<!DOCTYPE html>/);
  const banner = bannerBody(html);
  assert.match(banner, UNEXECUTED_WARNING);
  // Do not depend on a particular approval icon (the old assertion used "✓").
  for (const label of Object.values(DECISION_LABELS)) {
    assert.ok(!banner.includes(label), `unexecuted banner contains verdict: ${label}`);
  }
  assert.doesNotMatch(banner, /\d+\s*\/\s*100/);
  assert.doesNotMatch(html, /class="overall"/);
  assert.doesNotMatch(html, /class="score-bar"/);
  for (const line of html.split('\n').filter((l) => /Auto Approve|Human Review|\/100/.test(l))) {
    assert.match(line, /参考値（LLM 未実行）/);
  }
}

async function renderReports(t, { apiKey, args = [] } = {}) {
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
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls++;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
    };
  };

  const env = Object.fromEntries(KEY_VARS.map((key) => [key, undefined]));
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  const htmlResult = await runCliInProcess(['run', '.', ...args, '--output', 'html'], {
    cwd: dir,
    env,
  });
  assert.equal(htmlResult.code, 0, `html: ${htmlResult.stderr}`);
  const htmlCalls = fetchCalls;
  const jsonResult = await runCliInProcess(['run', '.', ...args, '--output', 'json'], {
    cwd: dir,
    env,
  });
  assert.equal(jsonResult.code, 0, `json: ${jsonResult.stderr}`);
  return {
    html: htmlResult.stdout,
    json: JSON.parse(jsonResult.stdout),
    htmlCalls,
    jsonCalls: fetchCalls - htmlCalls,
  };
}

describe('HTML report when the LLM did not run (#2812)', () => {
  for (const [name, options] of [
    ['no key', {}],
    ['dry-run with a key', { apiKey: 'test-key', args: ['--dry-run'] }],
    ['reviewers without a key', { args: REVIEWER_ARGS }],
    ['dry-run reviewers with a key', { apiKey: 'test-key', args: ['--dry-run', ...REVIEWER_ARGS] }],
    ['offline with a key', { apiKey: 'test-key', args: ['--offline'] }],
  ]) {
    it(`${name}: warns without an approval banner or score visualization`, async (t) => {
      const { html, json, htmlCalls, jsonCalls } = await renderReports(t, options);

      assert.equal(htmlCalls, 0, 'HTML skip path must not call the provider');
      assert.equal(jsonCalls, 0, 'JSON skip path must not call the provider');
      assert.equal(
        json.llmNotExecuted,
        true,
        `${name}: missing execution evidence (decision: ${json.decision})`
      );
      assertUnexecutedHtml(html);
      const label = DECISION_LABELS[json.decision];
      assert.ok(label, `unknown JSON decision: ${json.decision}`);
      assert.ok(html.includes(`参考値（LLM 未実行）: 判定 ${label}<`));
    });
  }

  for (const [name, args, expectedCalls] of [
    ['single reviewer', [], 1],
    ['reviewers', REVIEWER_ARGS, 2],
  ]) {
    it(`${name}, stubbed NO_ISSUES: keeps the approval banner and score`, async (t) => {
      const { html, json, htmlCalls, jsonCalls } = await renderReports(t, {
        apiKey: 'test-key',
        args,
      });

      // Each explicit reviewer must execute once for this single-chunk success fixture.
      assert.equal(htmlCalls, expectedCalls, 'HTML must execute every requested reviewer');
      assert.equal(jsonCalls, expectedCalls, 'JSON must execute every requested reviewer');
      assert.notEqual(json.llmNotExecuted, true);
      assert.equal(json.decision, 'auto-approve');
      assert.match(bannerBody(html), /Auto Approve/);
      assert.match(html, /<span class="overall">100\/100<\/span>/);
      assert.match(html, /class="score-bar"/);
      assert.doesNotMatch(html, /LLM 未実行|意味レビューは未実行/);
    });
  }

  it('rejects false-clean banner mutations even when the warning remains', async (t) => {
    const { html } = await renderReports(t);
    const banner = bannerBody(html);
    assertUnexecutedHtml(html);
    // Keep the warning and reference values intact: rejection must come from
    // the extra approval/score inside the banner, not an absent warning.
    for (const extra of [...Object.values(DECISION_LABELS), '100/100']) {
      const mutated = html.replace(banner, `${banner}! ${extra}\n`);
      assert.throws(() => assertUnexecutedHtml(mutated), assert.AssertionError, extra);
    }
  });
});
