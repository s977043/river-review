import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { buildRunRecord } from '../src/lib/result-store.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import { resolveReviewerRoles } from '../src/lib/reviewer-orchestrator.mjs';
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

    // Orchestrated run without the Slice C ledger: local-runner must surface the
    // orchestration observation as-is and invent no fileScope of its own.
    const withoutScope = await runLocalReview({
      cwd: dir,
      context: { ...context, reviewFileScope: null },
      dryRun: true,
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
      dryRun: true,
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
    t.after(() => { global.fetch = originalFetch; });
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
    t.after(() => { global.fetch = originalFetch; });
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
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, [
      'reviewer:single/chunk:1',
    ]);
  });
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
