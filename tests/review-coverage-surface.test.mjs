import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';
import { buildRunRecord } from '../src/lib/result-store.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import { resolveReviewerRoles } from '../src/lib/reviewer-orchestrator.mjs';

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

  it('wires the orchestration observation through runLocalReview without synthesizing it', () => {
    const source = readFileSync(new URL('../src/lib/local-runner.mjs', import.meta.url), 'utf8');
    assert.match(source, /reviewCoverage:\s*review\.reviewCoverage \?\? null/);
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
