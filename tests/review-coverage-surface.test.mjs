import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { buildRunRecord } from '../src/lib/result-store.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import {
  resolveReviewerRoles,
  runReviewerOrchestration,
} from '../src/lib/reviewer-orchestrator.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

function unit(overrides = {}) {
  return {
    id: 'reviewer:bug-hunter/chunk:1',
    kind: 'diff-chunk',
    subjects: ['src/a.js'],
    reviewerRole: 'bug-hunter',
    required: true,
    status: 'completed',
    reasonCode: null,
    findingsCount: 0,
    ...overrides,
  };
}

function baseResult(overrides = {}) {
  return {
    findings: [],
    changedFiles: ['src/a.js'],
    reviewerResults: [{ role: 'bug-hunter', status: 'fulfilled', timedOut: false }],
    reviewMode: 'medium',
    plan: { phase: 'midstream', reviewMode: 'medium' },
    ...overrides,
  };
}

describe('Review Coverage surface propagation', () => {
  it('dedupes explicit reviewer roles in first-seen order', () => {
    const resolved = resolveReviewerRoles([
      'security-scanner',
      'bug-hunter',
      'security-scanner',
      'unknown-role',
      'unknown-role',
    ]);

    assert.deepEqual(resolved.valid, ['security-scanner', 'bug-hunter']);
    assert.deepEqual(resolved.invalid, ['unknown-role']);
  });

  it('wires the orchestration observation through runLocalReview without synthesizing it', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-review-coverage-passthrough-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');

    // #2436: an all-skipped (dry-run) orchestrated run now emits no coverage,
    // so the orchestrated calls below execute a mocked LLM instead.
    const originalFetch = global.fetch;
    t.after(() => {
      global.fetch = originalFetch;
    });
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
    });

    // Orchestrated run without the Slice C ledger: local-runner must surface the
    // orchestration observation as-is and invent no fileScope of its own.
    const withoutScope = await runLocalReview({
      cwd: dir,
      context: { ...context, reviewFileScope: null },
      dryRun: false,
      apiKey: 'test-key',
      reviewers: ['bug-hunter'],
      quiet: true,
    });
    assert.ok(withoutScope.reviewCoverage, 'orchestrated run must surface Review Coverage');
    assert.equal(Object.hasOwn(withoutScope.reviewCoverage, 'fileScope'), false);

    // Same context plus the ledger: enrichment only — every other field of the
    // observation is identical, so nothing is recomputed in local-runner.
    const withScope = await runLocalReview({
      cwd: dir,
      context,
      dryRun: false,
      apiKey: 'test-key',
      reviewers: ['bug-hunter'],
      quiet: true,
    });
    const { fileScope, ...enriched } = withScope.reviewCoverage;
    assert.deepEqual(fileScope, context.reviewFileScope);
    assert.deepEqual(enriched, withoutScope.reviewCoverage);

    // No orchestration, no observation: local-runner does not synthesize one.
    const unorchestrated = await runLocalReview({
      cwd: dir,
      context,
      dryRun: true,
      quiet: true,
    });
    assert.equal(unorchestrated.reviewCoverage, null);
  });

  it('emits complete coverage for a successful single-reviewer LLM call', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-review-single-coverage-success-',
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
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
    });

    const result = await runLocalReview({
      cwd: dir,
      context,
      dryRun: false,
      apiKey: 'test-key',
      quiet: true,
    });

    assert.equal(result.reviewDebug.llmUsed, true);
    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.units[0].status, 'completed');
    assert.deepEqual(result.reviewCoverage.units[0].subjects, ['src/app.js']);
    assert.deepEqual(result.reviewCoverage.fileScope, context.reviewFileScope);
  });

  it('emits not_executed coverage for a single-reviewer response-envelope parse failure', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-review-single-coverage-failure-',
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
    global.fetch = async () => ({
      ok: true,
      json: async () => JSON.parse('OK\\r\\n'),
    });

    const result = await runLocalReview({
      cwd: dir,
      context,
      dryRun: false,
      apiKey: 'test-key',
      quiet: true,
    });

    assert.equal(result.reviewDebug.llmUsed, false);
    assert.match(result.reviewDebug.llmError, /Unexpected token/);
    assert.equal(result.reviewCoverage.status, 'not_executed');
    assert.equal(result.reviewCoverage.units[0].status, 'failed');
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, ['reviewer:single/chunk:1']);
  });

  // #2423: the --reviewers path goes through the same real generateReview,
  // which catches the LLM failure and resolves. The unit must still be failed.
  async function runWithFetch(
    t,
    prefix,
    fetchImpl,
    extra = {},
    changedFiles = { 'src/app.js': 'export const value = 2;\n' }
  ) {
    const { dir, cleanup } = await createTempGitRepo({
      prefix,
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles,
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const context = await planLocalReview({ cwd: dir, dryRun: true });
    const originalFetch = global.fetch;
    t.after(() => {
      global.fetch = originalFetch;
    });
    global.fetch = fetchImpl;

    return runLocalReview({
      cwd: dir,
      context,
      dryRun: false,
      apiKey: 'test-key',
      quiet: true,
      ...extra,
    });
  }

  it('emits not_executed coverage when an explicit --reviewers role hits an LLM transport failure', async (t) => {
    const result = await runWithFetch(
      t,
      'river-review-reviewers-coverage-failure-',
      async () => ({ ok: false, status: 400, text: async () => 'bad request' }),
      { reviewers: ['security-scanner'] }
    );

    assert.equal(result.reviewerResults[0].status, 'rejected');
    assert.equal(result.reviewCoverage.status, 'not_executed');
    assert.equal(result.reviewDebug.succeededReviewers, 0);
    assert.equal(result.reviewCoverage.units[0].id, 'reviewer:security-scanner/chunk:1');
    assert.equal(result.reviewCoverage.units[0].status, 'failed');
    assert.equal(result.reviewCoverage.units[0].reasonCode, 'reviewer_error');
    assert.equal(result.reviewCoverage.units[0].findingsCount, 0);
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, [
      'reviewer:security-scanner/chunk:1',
    ]);
  });

  it('reports findingsCount 0 for a failed --reviewers unit even when heuristics produce findings', async (t) => {
    const result = await runWithFetch(
      t,
      'river-review-reviewers-coverage-failure-heuristic-',
      async () => ({ ok: false, status: 400, text: async () => 'bad request' }),
      { reviewers: ['security-scanner'] },
      {
        'src/app.js':
          'export const value = 2;\nexport function test() {\n  try {\n    run();\n  } catch(e) {\n    return;\n  }\n}\n',
      }
    );

    assert.ok(result.reviewerResults[0].findingsCount > 0);
    assert.equal(result.reviewCoverage.units[0].status, 'failed');
    assert.equal(result.reviewCoverage.units[0].findingsCount, 0);
  });

  it('keeps complete coverage when an explicit --reviewers role gets a valid LLM response', async (t) => {
    const result = await runWithFetch(
      t,
      'river-review-reviewers-coverage-success-',
      async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
      }),
      { reviewers: ['security-scanner'] }
    );

    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.units[0].status, 'completed');
  });

  // #2436: a --reviewers run whose every unit skipped the LLM reviewed nothing,
  // so it emits no coverage, the same shape as the single-reviewer path.
  it('emits no coverage when every explicit --reviewers unit skips the LLM (no API key)', async (t) => {
    const saved = {};
    for (const key of ['RIVER_OPENAI_API_KEY', 'OPENAI_API_KEY']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    t.after(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    const result = await runWithFetch(
      t,
      'river-review-reviewers-coverage-nokey-',
      async () => {
        throw new Error('fetch must not be called without an API key');
      },
      { apiKey: undefined, reviewers: ['bug-hunter', 'security-scanner'] }
    );

    assert.equal(result.reviewCoverage, null);
    assert.equal(result.reviewDebug.succeededReviewers, 0);
    assert.equal(Object.hasOwn(formatJsonOutput(result, 'midstream'), 'reviewCoverage'), false);
  });

  it('emits no coverage for a dry-run explicit --reviewers run', async (t) => {
    const result = await runWithFetch(
      t,
      'river-review-reviewers-coverage-dryrun-',
      async () => {
        throw new Error('fetch must not be called on a dry-run');
      },
      { dryRun: true, reviewers: ['bug-hunter'] }
    );

    assert.equal(result.reviewCoverage, null);
  });

  // Unreachable through runLocalReview (the skip reason is decided per run from
  // dryRun / offline / provider / apiKey), so pinned at the orchestrator: a
  // skipped unit in a run that otherwise executed must not count as completed.
  it('counts a skipped unit as failed when other units executed the LLM', async () => {
    let call = 0;
    const result = await runReviewerOrchestration({
      diff: { diffText: 'diff --git a/src/app.js', files: [], filesForReview: [] },
      reviewers: ['bug-hunter', 'security-scanner'],
      generateReviewImpl: async () => ({
        findings: [],
        comments: [],
        debug: call++ === 0 ? { llmUsed: true } : { llmUsed: false, llmSkipped: 'dry-run enabled' },
      }),
    });

    const byRole = Object.fromEntries(
      result.reviewCoverage.units.map((u) => [u.reviewerRole, u.status])
    );
    assert.deepEqual(byRole, { 'bug-hunter': 'completed', 'security-scanner': 'failed' });
    assert.equal(result.reviewCoverage.status, 'partial');
    assert.equal(result.debug.succeededReviewers, 1);
  });

  for (const [label, thrown] of [
    ["Error('')", () => new Error('')],
    ['a thrown string', () => 'boom'],
  ]) {
    it(`treats an LLM failure thrown as ${label} as not_executed on both paths`, async (t) => {
      const fail = async () => {
        throw thrown();
      };
      const single = await runWithFetch(t, 'river-review-single-empty-error-', fail);
      assert.equal(single.reviewDebug.llmSkipped, undefined);
      assert.equal(single.reviewDebug.llmUsed, false);
      assert.equal(single.reviewCoverage.status, 'not_executed');

      const orchestrated = await runWithFetch(t, 'river-review-reviewers-empty-error-', fail, {
        reviewers: ['security-scanner'],
      });
      assert.equal(orchestrated.reviewCoverage.status, 'not_executed');
    });
  }

  it('emits schema-valid JSON Review Coverage only when present', () => {
    const coverage = deriveReviewCoverage([unit()]);
    const artifact = formatJsonOutput(baseResult({ reviewCoverage: coverage }), 'midstream');
    const validate = getOutputSchemaValidator();

    assert.ok(validate, 'output schema validator must load');
    assert.strictEqual(artifact.reviewCoverage, coverage);
    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));

    const legacy = formatJsonOutput(baseResult(), 'midstream');
    assert.equal(Object.hasOwn(legacy, 'reviewCoverage'), false);
    assert.equal(validate(legacy), true, JSON.stringify(validate.errors, null, 2));
  });

  it('persists the same Review Coverage object without recomputation', () => {
    const coverage = deriveReviewCoverage([unit()]);
    const record = buildRunRecord(baseResult({ reviewCoverage: coverage }), {
      runId: 'coverage-run',
    });

    assert.strictEqual(record.reviewCoverage, coverage);

    const legacy = buildRunRecord(baseResult(), { runId: 'legacy-run' });
    assert.equal(Object.hasOwn(legacy, 'reviewCoverage'), false);
  });

  it('does not let partial coverage change decision or gate in observe-only Slice B', () => {
    const partial = deriveReviewCoverage([
      unit(),
      unit({
        id: 'reviewer:bug-hunter/chunk:2',
        subjects: ['src/b.js'],
        status: 'failed',
        reasonCode: 'reviewer_error',
      }),
    ]);
    const withoutCoverage = formatJsonOutput(baseResult(), 'midstream');
    const withCoverage = formatJsonOutput(baseResult({ reviewCoverage: partial }), 'midstream');

    assert.equal(partial.status, 'partial');
    assert.equal(withCoverage.decision, withoutCoverage.decision);
    assert.deepEqual(withCoverage.gate, withoutCoverage.gate);
  });
});
