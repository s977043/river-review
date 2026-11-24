// ADR-004 re-entry conditions 1 and 2, checked from `river run` for the QA evidence skill
// (ADR-017 §Status / D2). The table that maps each condition to these tests is
// docs/development/adr-004-reentry-verification.md.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, test } from 'node:test';

import { main } from '../src/cli.mjs';
import { planLocalReview } from '../src/lib/local-runner.mjs';
import { cleanupTempDirAsync, createTempDir } from './helpers/temp-dir.mjs';
import { createRepoWithSilentCatchChange, runGit } from './helpers/temp-repo.mjs';

const BASE = JSON.parse(
  readFileSync(new URL('./fixtures/qa-evidence/base.json', import.meta.url), 'utf8')
);
const QA_SKILL_ID = 'qa-evidence-consistency';
const MARKER = 'adr004-wiring-marker';
const SECTION = '### QA Evidence';
const MISSING_REASON = 'missing inputContext: qaEvidence';
const SKIP_LINE = `- ${QA_SKILL_ID}: ${MISSING_REASON}`;

function evidenceFor(head) {
  const evidence = structuredClone(BASE.evidence);
  evidence.target.subjectRevision = head;
  evidence.verification[0].attempts[0].command = `npm test -- --grep ${MARKER}`;
  return JSON.stringify(evidence);
}

// `npm test` runs every file in one process (--experimental-test-isolation=none), so the state
// a run replaces is restored per test rather than through file-level hooks.
function isolate(t) {
  const fetch = globalThis.fetch;
  const env = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'RIVER_OFFLINE'].map((name) => [
    name,
    process.env[name],
  ]);
  const { log, error, warn } = console;
  t.after(() => {
    globalThis.fetch = fetch;
    for (const [name, value] of env) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    Object.assign(console, { log, error, warn });
  });
  delete process.env.RIVER_OFFLINE;
  delete process.env.ANTHROPIC_API_KEY;
  return { log, error, warn };
}

/**
 * Run `river run <repo> --phase downstream` in process. With `keyed`, a placeholder key makes
 * the run plan as a keyed run, and the stubbed fetch records every prompt sent to the LLM
 * instead of reaching the network.
 * @param {'accepted' | 'rejected' | 'none'} evidence
 */
async function runRiver(t, { evidence, keyed = true, extra = [], config = null }) {
  const saved = isolate(t);
  const { dir, cleanup } = await createRepoWithSilentCatchChange();
  t.after(cleanup);
  if (config) writeFileSync(join(dir, '.river-review.json'), JSON.stringify(config));
  const head = (await runGit(['rev-parse', 'HEAD'], dir)).stdout.trim();
  const work = createTempDir({ prefix: 'river-adr004-' });
  t.after(() => cleanupTempDirAsync(work));
  const evidencePath = join(work, 'evidence.json');
  const auditPath = join(work, 'audit.json');
  if (evidence === 'accepted') writeFileSync(evidencePath, evidenceFor(head));
  if (evidence === 'rejected') writeFileSync(evidencePath, '{ not json');

  if (keyed) process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
  else delete process.env.OPENAI_API_KEY;
  const prompts = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    prompts.push(body.messages.map((message) => message.content).join('\n'));
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
      text: async () => '',
    };
  };
  const stdout = [];
  const stderr = [];
  console.log = (...args) => stdout.push(args.join(' '));
  console.error = (...args) => stderr.push(args.join(' '));
  console.warn = (...args) => stderr.push(args.join(' '));
  const qaArgs =
    evidence === 'none' ? [] : ['--qa-evidence', evidencePath, '--qa-audit-output', auditPath];
  const code = await main(['run', dir, '--phase', 'downstream', ...qaArgs, ...extra]);
  Object.assign(console, saved);
  const audit = evidence === 'none' ? null : JSON.parse(readFileSync(auditPath, 'utf8'));
  return { dir, code, prompts, audit, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('ADR-004 re-entry condition 1: the QA evidence reaches the skill only when provided', () => {
  test('accepted evidence goes from river run through the plan to the prompt the LLM receives', async (t) => {
    const run = await runRiver(t, { evidence: 'accepted' });
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.audit.accepted, true);
    assert.match(run.stdout, new RegExp(`Selected skills \\(\\d+\\): .*${QA_SKILL_ID}`));
    assert.ok(!run.stdout.includes(SKIP_LINE));
    assert.ok(run.prompts.length > 0, 'the review reached the LLM');
    const withSection = run.prompts.filter((prompt) => prompt.includes(SECTION));
    assert.ok(withSection.length > 0, 'a prompt carries the QA evidence section');
    assert.ok(
      withSection.every((prompt) => prompt.includes(MARKER)),
      'the section holds the evidence body'
    );
  });

  test('with the Prompt Compiler active, the compiled prompt sent to the LLM carries the evidence', async (t) => {
    const config = { review: { promptCompiler: { mode: 'active' } } };
    const run = await runRiver(t, { evidence: 'accepted', config });
    assert.equal(run.code, 0, run.stderr);
    const withSection = run.prompts.filter((prompt) => prompt.includes(SECTION));
    assert.ok(withSection.length > 0, 'the compiled prompt carries the QA evidence section');
    assert.ok(withSection.every((prompt) => prompt.includes(MARKER)));
  });

  for (const evidence of ['rejected', 'none']) {
    test(`${evidence} evidence: the QA skill is skipped and no prompt carries the evidence`, async (t) => {
      const run = await runRiver(t, { evidence });
      assert.equal(run.code, 0, run.stderr);
      if (run.audit) assert.equal(run.audit.accepted, false);
      assert.ok(run.stdout.includes(SKIP_LINE), run.stdout);
      assert.ok(run.prompts.length > 0, 'the review still reached the LLM');
      for (const prompt of run.prompts) {
        assert.ok(!prompt.includes(SECTION));
        assert.ok(!prompt.includes(MARKER));
      }
    });
  }
});

describe('ADR-004 re-entry condition 2: without QA evidence the skill is skipped with a visible reason', () => {
  test('the default text output lists the skip and its reason', async (t) => {
    const run = await runRiver(t, { evidence: 'none' });
    assert.equal(run.code, 0, run.stderr);
    assert.doesNotMatch(run.stdout, new RegExp(`Selected skills \\(\\d+\\): .*${QA_SKILL_ID}`));
    assert.ok(run.stdout.includes(SKIP_LINE), run.stdout);
  });

  test('--debug with --output json writes the skip and its reason to stderr', async (t) => {
    const run = await runRiver(t, { evidence: 'none', extra: ['--output', 'json', '--debug'] });
    assert.equal(run.code, 0, run.stderr);
    const detail = run.stderr.split('Skipped skills detail:')[1] ?? '';
    assert.ok(detail.includes(SKIP_LINE), run.stderr);
    assert.ok(!run.stdout.includes(SKIP_LINE), 'the JSON artifact on stdout stays unchanged');
  });

  // Without any key the LLM-only skip comes first (runners/core/review-runner.mjs selectSkills),
  // so the CLI shows that reason instead; the inputContext skip is then checked at the plan layer.
  test('without an API key the CLI shows the LLM-only skip, and the plan layer the missing input', async (t) => {
    const run = await runRiver(t, { evidence: 'none', keyed: false });
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.prompts.length, 0);
    assert.ok(!run.stdout.includes(SKIP_LINE));
    assert.ok(run.stdout.includes(`- ${QA_SKILL_ID}: LLM disabled:`), run.stdout);

    // The same repository planned as a keyed run (placeholder key, no LLM call while planning).
    process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
    const context = await planLocalReview({ cwd: run.dir, phase: 'downstream' });
    assert.ok(!context.availableContexts.includes('qaEvidence'));
    const skipped = context.plan.skipped.find(
      (entry) => (entry.skill.metadata ?? entry.skill).id === QA_SKILL_ID
    );
    assert.deepEqual(skipped?.reasons, [MISSING_REASON]);
  });
});
