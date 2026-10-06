import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import {
  attachConcernRefsToReviewCoverage,
  buildReviewConcernPlanningObservation,
} from '../src/lib/review-concern-planning-bridge.mjs';

function map(concerns, analysis = { status: 'completed', limitations: [] }) {
  return {
    schemaVersion: '1',
    kind: 'review-concern-map',
    subject: {
      mergeBase: 'base',
      revisionRef: 'head',
      workingTreeDirty: false,
    },
    concerns,
    analysis,
  };
}

function concern(id, changedSubjects, affectedSubjects = []) {
  return {
    id,
    summary: id,
    changedSubjects,
    affectedSubjects: affectedSubjects.map((path) => ({
      path,
      evidenceRefs: [{ path, lineStart: 1 }],
    })),
    evidenceRefs: changedSubjects.map((path) => ({ path, lineStart: 1 })),
    interactionRefs: [],
  };
}

function skill(id, applyTo) {
  return {
    metadata: {
      id,
      applyTo,
    },
  };
}

describe('#2523 Review Concern Planning Bridge', () => {
  it('reuses existing deterministic role routing per concern without applying it', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([
        concern('concern-1', ['src/app.ts']),
        concern('concern-2', ['migrations/001_add_state.sql']),
        concern('concern-3', ['tests/app.test.ts']),
      ]),
      fileTypes: {
        app: ['src/app.ts'],
        migration: ['migrations/001_add_state.sql'],
        test: ['tests/app.test.ts'],
      },
      riskAssessment: null,
      selectedSkills: [],
    });

    assert.equal(observation.status, 'observed');
    assert.equal(observation.applied, false);
    assert.deepEqual(observation.concerns[0].reviewerRoles, ['bug-hunter']);
    assert.deepEqual(observation.concerns[1].reviewerRoles, ['bug-hunter', 'security-scanner']);
    assert.deepEqual(observation.concerns[2].reviewerRoles, ['bug-hunter', 'test-gap']);
    assert.deepEqual(observation.recommendation.reviewerRoles, [
      'bug-hunter',
      'security-scanner',
      'test-gap',
    ]);
  });

  it('records role delta against whole-diff selectRolesAuto instead of changing it', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([concern('concern-1', ['src/app.ts'])]),
      fileTypes: { app: ['src/app.ts'] },
      riskAssessment: null,
      signals: {
        stage: 'verify',
        deploymentChange: true,
      },
      selectedSkills: [],
    });

    assert.deepEqual(observation.wholeDiffAutoSelection.reviewerRoles, [
      'bug-hunter',
      'test-gap',
      'ci-cd-reviewer',
    ]);
    assert.deepEqual(observation.recommendation.reviewerRoles, ['bug-hunter']);
    assert.deepEqual(observation.delta.reviewerRoles, {
      recommendedOnly: [],
      existingOnly: ['test-gap', 'ci-cd-reviewer'],
      shared: ['bug-hunter'],
    });
    assert.equal(observation.applied, false);
  });

  it('maps only already-selected Skills to concern subjects through applyTo overlap', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([
        concern('concern-1', ['src/auth/session.ts'], ['src/api/session-controller.ts']),
        concern('concern-2', ['docs/session.md']),
      ]),
      fileTypes: { app: ['src/auth/session.ts'], docs: ['docs/session.md'] },
      selectedSkills: [
        skill('security-review', ['src/**']),
        skill('docs-review', ['docs/**']),
        skill('migration-review', ['migrations/**']),
      ],
    });

    assert.deepEqual(observation.concerns[0].skillRecommendations, [
      {
        skillId: 'security-review',
        matchedSubjects: ['src/auth/session.ts', 'src/api/session-controller.ts'],
        reason: 'selected-skill-applyTo-overlap',
      },
    ]);
    assert.deepEqual(observation.concerns[1].skillRecommendations, [
      {
        skillId: 'docs-review',
        matchedSubjects: ['docs/session.md'],
        reason: 'selected-skill-applyTo-overlap',
      },
    ]);
    assert.deepEqual(observation.recommendation.skillIds, ['security-review', 'docs-review']);
  });

  it('keeps failed Concern Maps unavailable instead of treating them as negative routing evidence', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([], {
        status: 'failed',
        limitations: ['analyzer-failed:runtime-error'],
      }),
      fileTypes: { migration: ['migrations/001.sql'] },
      selectedSkills: [skill('migration-review', ['migrations/**'])],
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'concern-map-failed');
    assert.deepEqual(observation.wholeDiffAutoSelection.reviewerRoles, [
      'bug-hunter',
      'security-scanner',
    ]);
    assert.equal(observation.recommendation, null);
    assert.equal(observation.delta, null);
    assert.equal(observation.applied, false);
  });

  it('marks partial maps as partial while retaining additive recommendations', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([concern('concern-1', ['tests/app.test.ts'])], {
        status: 'partial',
        limitations: ['diff-input-truncated'],
      }),
      fileTypes: { test: ['tests/app.test.ts'] },
      selectedSkills: [],
    });

    assert.equal(observation.status, 'partial');
    assert.deepEqual(observation.source.limitations, ['diff-input-truncated']);
    assert.deepEqual(observation.recommendation.reviewerRoles, ['bug-hunter', 'test-gap']);
    assert.equal(observation.applied, false);
  });

  it('canonicalizes leading dot segments for Skill and Review Unit overlap', () => {
    const reviewConcernMap = map([
      concern('concern-1', ['./src/auth/session.ts'], ['./src/api/session-controller.ts']),
    ]);

    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap,
      fileTypes: { app: ['src/auth/session.ts'] },
      selectedSkills: [skill('security-review', ['src/**'])],
    });

    assert.deepEqual(observation.concerns[0].subjects, [
      'src/auth/session.ts',
      'src/api/session-controller.ts',
    ]);
    assert.deepEqual(observation.concerns[0].skillRecommendations, [
      {
        skillId: 'security-review',
        matchedSubjects: ['src/auth/session.ts', 'src/api/session-controller.ts'],
        reason: 'selected-skill-applyTo-overlap',
      },
    ]);

    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 1,
      completedUnits: 1,
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
      units: [
        {
          id: 'reviewer:bug-hunter/chunk:1',
          kind: 'diff-chunk',
          subjects: ['src/auth/session.ts'],
          reviewerRole: 'bug-hunter',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
      ],
    };

    const enriched = attachConcernRefsToReviewCoverage(coverage, reviewConcernMap);
    assert.deepEqual(enriched.units[0].concernRefs, ['concern-1']);
  });

  it('keeps the whole-diff auto baseline unavailable when no plan fileTypes exist', () => {
    const observation = buildReviewConcernPlanningObservation({
      reviewConcernMap: map([concern('concern-1', ['src/app.ts'])]),
      selectedSkills: [],
    });

    assert.equal(observation.wholeDiffAutoSelection, null);
    assert.equal(observation.delta, null);
    assert.deepEqual(observation.recommendation.reviewerRoles, ['bug-hunter']);
    assert.equal(observation.applied, false);
  });

  it('returns null when no Concern Map exists', () => {
    assert.equal(
      buildReviewConcernPlanningObservation({
        reviewConcernMap: null,
        fileTypes: { app: ['src/app.ts'] },
      }),
      null
    );
  });

  it('adds concernRefs by subject overlap without changing coverage status or counters', () => {
    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 2,
      completedUnits: 2,
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
      units: [
        {
          id: 'reviewer:bug-hunter/chunk:1',
          executionId: 'exec-1',
          kind: 'diff-chunk',
          subjects: ['src/auth/session.ts'],
          reviewerRole: 'bug-hunter',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
        {
          id: 'reviewer:test-gap/chunk:1',
          executionId: 'exec-2',
          kind: 'diff-chunk',
          subjects: ['tests/session.test.ts'],
          reviewerRole: 'test-gap',
          required: false,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
      ],
    };

    const enriched = attachConcernRefsToReviewCoverage(
      coverage,
      map([
        concern('concern-auth', ['src/auth/session.ts'], ['src/api/session-controller.ts']),
        concern('concern-test', ['tests/session.test.ts']),
      ])
    );

    assert.notEqual(enriched, coverage);
    assert.equal(enriched.status, coverage.status);
    assert.equal(enriched.expectedUnits, coverage.expectedUnits);
    assert.equal(enriched.completedUnits, coverage.completedUnits);
    assert.equal(enriched.requiredUnits, coverage.requiredUnits);
    assert.equal(enriched.completedRequiredUnits, coverage.completedRequiredUnits);
    assert.deepEqual(enriched.incompleteRequiredUnitIds, []);
    assert.deepEqual(enriched.units[0].concernRefs, ['concern-auth']);
    assert.deepEqual(enriched.units[1].concernRefs, ['concern-test']);
  });

  it('merges existing concernRefs instead of overwriting provenance', () => {
    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 1,
      completedUnits: 1,
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
      units: [
        {
          id: 'reviewer:bug-hunter/chunk:1',
          concernRefs: ['concern-existing'],
          kind: 'diff-chunk',
          subjects: ['src/app.ts'],
          reviewerRole: 'bug-hunter',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
      ],
    };

    const enriched = attachConcernRefsToReviewCoverage(
      coverage,
      map([concern('concern-existing', ['src/app.ts']), concern('concern-new', ['src/app.ts'])])
    );

    assert.deepEqual(enriched.units[0].concernRefs, ['concern-existing', 'concern-new']);
    assert.equal(enriched.status, 'complete');
  });

  it('does not fabricate concernRefs or coverage failures when no subject overlaps', () => {
    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 1,
      completedUnits: 1,
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
      units: [
        {
          id: 'reviewer:bug-hunter/chunk:1',
          kind: 'diff-chunk',
          subjects: ['src/app.ts'],
          reviewerRole: 'bug-hunter',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
      ],
    };

    const enriched = attachConcernRefsToReviewCoverage(
      coverage,
      map([concern('concern-docs', ['docs/readme.md'])])
    );

    assert.equal(enriched, coverage);
    assert.equal(enriched.status, 'complete');
    assert.equal('concernRefs' in enriched.units[0], false);
  });

  it('keeps concernRefs optional and schema-valid on Review Units', () => {
    const require = createRequire(import.meta.url);
    const Ajv2020 = require('ajv/dist/2020');
    const schema = JSON.parse(readFileSync('schemas/review-coverage.schema.json', 'utf8'));
    const validate = new Ajv2020({ strict: false }).compile(schema);
    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 1,
      completedUnits: 1,
      requiredUnits: 1,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: [],
      units: [
        {
          id: 'reviewer:bug-hunter/chunk:1',
          concernRefs: ['concern-1'],
          kind: 'diff-chunk',
          subjects: ['src/app.ts'],
          reviewerRole: 'bug-hunter',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
      ],
    };

    assert.equal(validate(coverage), true, JSON.stringify(validate.errors));
    delete coverage.units[0].concernRefs;
    assert.equal(validate(coverage), true, JSON.stringify(validate.errors));
  });

  it('leaves coverage untouched when the Concern Map failed', () => {
    const coverage = {
      schemaVersion: '1',
      status: 'complete',
      expectedUnits: 0,
      completedUnits: 0,
      requiredUnits: 0,
      completedRequiredUnits: 0,
      incompleteRequiredUnitIds: [],
      units: [],
    };

    const enriched = attachConcernRefsToReviewCoverage(
      coverage,
      map([], { status: 'failed', limitations: ['analyzer-failed:invalid-json'] })
    );

    assert.equal(enriched, coverage);
  });
});
