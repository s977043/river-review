import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  organizeReviewResolution,
  renderReviewResolutionJson,
  renderReviewResolutionMarkdown,
} from '../src/lib/review-resolution-organizer.mjs';

function finding(id, overrides = {}) {
  return {
    id,
    title: `Finding ${id}`,
    file: `src/${id}.mjs`,
    lineStart: 10,
    fingerprint: `fp-${id}`,
    fingerprintV2: `fp2-${id}`,
    severity: 'major',
    ...overrides,
  };
}

function resolutionItem({
  findingId,
  fingerprint,
  fingerprintAlgo = 'v1',
  author = 'none',
  resolution = 'open',
  verification = 'not_requested',
  disposition = 'unknown',
} = {}) {
  return {
    findingRef: {
      findingId,
      fingerprint,
      fingerprintAlgo,
      sources: [{ findingId: `source-${findingId}`, reviewerId: 'bug-hunter' }],
    },
    systemJudgment: {
      disposition,
      source: disposition === 'unknown' ? 'unavailable' : 'semantic-precision',
    },
    authorResponse: { state: author, rationale: null },
    resolution: { state: resolution, target: null, decisionRefs: [] },
    verification: {
      state: verification,
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
  };
}

describe('organizeReviewResolution', () => {
  test('projects every finding exactly once even when it is outside Team Lead top3', () => {
    const findings = [finding('rr-1'), finding('rr-2'), finding('rr-3'), finding('rr-4')];
    const result = organizeReviewResolution({
      findings,
      teamLeadReport: { top3Findings: findings.slice(0, 3), blindSpots: [] },
    });

    assert.deepEqual(
      result.findings.map((entry) => entry.finding.id),
      ['rr-1', 'rr-2', 'rr-3', 'rr-4']
    );
    assert.deepEqual(
      result.findings.map((entry) => entry.priority),
      [
        { inTop3: true, top3Rank: 1 },
        { inTop3: true, top3Rank: 2 },
        { inTop3: true, top3Rank: 3 },
        { inTop3: false, top3Rank: null },
      ]
    );
  });

  test('joins by findingId first and reports a mismatched auxiliary fingerprint', () => {
    const result = organizeReviewResolution({
      findings: [finding('rr-1')],
      reviewResolution: {
        items: [
          resolutionItem({
            findingId: 'rr-1',
            fingerprint: 'different-fingerprint',
            author: 'will_fix',
          }),
        ],
      },
    });

    assert.equal(result.findings[0].resolutionMatches.length, 1);
    assert.equal(result.findings[0].resolutionMatches[0].matchBasis, 'finding_id');
    assert.equal(result.findings[0].resolutionMatches[0].item.authorResponse.state, 'will_fix');
    assert.ok(result.warnings.some((item) => item.code === 'identity_mismatch'));
  });

  test('falls back to the declared fingerprint algorithm when findingId does not match', () => {
    const result = organizeReviewResolution({
      findings: [finding('rr-1')],
      reviewResolution: {
        items: [
          resolutionItem({
            findingId: 'old-run-id',
            fingerprint: 'fp2-rr-1',
            fingerprintAlgo: 'v2',
          }),
        ],
      },
    });

    assert.equal(result.findings[0].resolutionMatches.length, 1);
    assert.equal(result.findings[0].resolutionMatches[0].matchBasis, 'fingerprint');
    assert.deepEqual(result.warnings, []);
  });

  test('does not guess a fingerprint algorithm when findingId is unavailable', () => {
    const result = organizeReviewResolution({
      findings: [finding('rr-1')],
      reviewResolution: {
        items: [
          resolutionItem({
            findingId: 'old-run-id',
            fingerprint: 'fp-rr-1',
            fingerprintAlgo: 'v9',
          }),
        ],
      },
    });

    assert.equal(result.findings[0].resolutionMatches.length, 0);
    const orphan = result.warnings.find((item) => item.code === 'orphan_resolution');
    assert.equal(orphan?.fingerprintAlgo, 'v9');
  });

  test('reports an ambiguous fingerprint instead of selecting one candidate', () => {
    const findings = [
      finding('rr-1', { fingerprint: 'shared-fingerprint' }),
      finding('rr-2', { fingerprint: 'shared-fingerprint' }),
    ];
    const result = organizeReviewResolution({
      findings,
      reviewResolution: {
        items: [
          resolutionItem({
            findingId: 'old-run-id',
            fingerprint: 'shared-fingerprint',
            fingerprintAlgo: 'v1',
          }),
        ],
      },
    });

    assert.ok(result.warnings.some((item) => item.code === 'ambiguous_fingerprint'));
    assert.equal(result.findings[0].resolutionMatches.length, 0);
    assert.equal(result.findings[1].resolutionMatches.length, 0);
  });

  test('keeps orphan and ambiguous resolution items visible as warnings', () => {
    const duplicatedId = [
      finding('duplicate', { fingerprint: 'fp-a' }),
      finding('duplicate', { fingerprint: 'fp-b' }),
      finding('other'),
    ];
    const result = organizeReviewResolution({
      findings: duplicatedId,
      reviewResolution: {
        items: [
          resolutionItem({ findingId: 'duplicate', fingerprint: 'fp-a' }),
          resolutionItem({ findingId: 'missing', fingerprint: 'missing-fp' }),
        ],
      },
    });

    assert.ok(result.warnings.some((item) => item.code === 'ambiguous_finding_id'));
    assert.ok(result.warnings.some((item) => item.code === 'orphan_resolution'));
    assert.equal(result.findings[0].resolutionMatches.length, 0);
    assert.equal(result.findings[1].resolutionMatches.length, 0);
  });

  test(
    'warns instead of silently choosing one when multiple resolution items join one finding',
    () => {
      const result = organizeReviewResolution({
        findings: [finding('rr-1')],
        reviewResolution: {
          items: [
            resolutionItem({ findingId: 'rr-1', fingerprint: 'fp-rr-1' }),
            resolutionItem({
              findingId: 'rr-1',
              fingerprint: 'fp-rr-1',
              author: 'disputes',
            }),
          ],
        },
      });

      assert.equal(result.findings[0].resolutionMatches.length, 2);
      assert.ok(result.warnings.some((item) => item.code === 'multiple_resolution_items'));
    }
  );

  test('does not invent a system disposition when no Review Resolution item is joined', () => {
    const result = organizeReviewResolution({
      findings: [finding('rr-1', { severity: 'critical' })],
    });

    assert.deepEqual(result.findings[0].resolutionMatches, []);
    const markdown = renderReviewResolutionMarkdown(result);
    assert.match(markdown, /\| rr-1 .* \| — \| — \| — \| — \| — \|/);
    assert.doesNotMatch(markdown, /blocking|advisory|suppressed/);
  });

  test('preserves Team Lead blind spots and treats missing coverage as unknown', () => {
    const result = organizeReviewResolution({
      findings: [],
      teamLeadReport: {
        top3Findings: [],
        blindSpots: [{ role: 'security-scanner', label: 'Security Scanner' }],
      },
    });

    assert.equal(result.coverage.status, 'unknown');
    assert.deepEqual(result.coverage.incompleteRequiredUnitIds, []);
    assert.deepEqual(result.blindSpots, [
      { role: 'security-scanner', label: 'Security Scanner' },
    ]);
  });

  test('projects partial coverage and incomplete required unit IDs', () => {
    const result = organizeReviewResolution({
      findings: [],
      reviewCoverage: {
        status: 'partial',
        requiredUnits: 2,
        completedRequiredUnits: 1,
        incompleteRequiredUnitIds: ['reviewer:security/chunk:2'],
      },
    });

    assert.deepEqual(result.coverage, {
      status: 'partial',
      incompleteRequiredUnitIds: ['reviewer:security/chunk:2'],
    });
    assert.match(
      renderReviewResolutionMarkdown(result),
      /Incomplete required units: reviewer:security\/chunk:2/
    );
  });

  test('renders all finding resolution states in Markdown', () => {
    const result = organizeReviewResolution({
      findings: [finding('rr-1')],
      reviewResolution: {
        items: [
          resolutionItem({
            findingId: 'rr-1',
            fingerprint: 'fp-rr-1',
            author: 'will_fix',
            resolution: 'action_submitted',
            verification: 'pending',
            disposition: 'blocking',
          }),
        ],
      },
    });
    const markdown = renderReviewResolutionMarkdown(result);

    assert.match(markdown, /rr-1/);
    assert.match(markdown, /blocking/);
    assert.match(markdown, /will_fix/);
    assert.match(markdown, /action_submitted/);
    assert.match(markdown, /pending/);
  });

  test('JSON rendering is deterministic and inputs are not mutated', () => {
    const findings = [finding('rr-1')];
    const reviewResolution = {
      items: [resolutionItem({ findingId: 'rr-1', fingerprint: 'fp-rr-1' })],
    };
    const teamLeadReport = {
      top3Findings: [findings[0]],
      blindSpots: [{ role: 'test-gap', label: 'Test Gap Finder' }],
    };
    const reviewCoverage = {
      status: 'complete',
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
    };
    const before = JSON.stringify({ findings, reviewResolution, teamLeadReport, reviewCoverage });

    const first = organizeReviewResolution({
      findings,
      reviewResolution,
      teamLeadReport,
      reviewCoverage,
    });
    const second = organizeReviewResolution({
      findings,
      reviewResolution,
      teamLeadReport,
      reviewCoverage,
    });

    assert.equal(renderReviewResolutionJson(first), renderReviewResolutionJson(second));
    assert.equal(
      JSON.stringify({ findings, reviewResolution, teamLeadReport, reviewCoverage }),
      before
    );
  });
});
