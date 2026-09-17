import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import {
  deriveUnitSourceRevision,
  reconcileRepeatRunCoverage,
} from '../src/lib/security-audit-repeat-run.mjs';
import { sha256Hex } from '../src/lib/shadow-aggregate.mjs';
import { compileSecurityAuditCoverageValidator } from './helpers/schema-validator.mjs';

const validateCoverage = compileSecurityAuditCoverageValidator();
const validationErrors = () => JSON.stringify(validateCoverage.errors, null, 2);

const attackRegistry = JSON.parse(
  readFileSync(
    new URL(
      '../skills/agent-skills/river-review-security-audit/references/attack-classes.json',
      import.meta.url
    ),
    'utf8'
  )
);
const taxonomyVersion = attackRegistry.version;

const SESSION_PATH = 'src/auth/session.mjs';
const digestsV1 = { [SESSION_PATH]: 'a'.repeat(64) };
const digestsV2 = { [SESSION_PATH]: 'b'.repeat(64) };

function evidenceRef() {
  return {
    kind: 'source',
    path: SESSION_PATH,
    lineStart: 42,
    lineEnd: 44,
    note: 'authorization enforcement evidence',
  };
}

function priorCoveredUnit(overrides = {}) {
  return {
    id: 'auth/authn@run1',
    subsystem: 'auth',
    trustBoundary: 'tenant-user -> tenant-resource',
    attackClassId: 'authn-authz',
    state: 'covered',
    reasonCode: null,
    reviewedPaths: [SESSION_PATH],
    evidenceRefs: [evidenceRef()],
    relatedFindingIds: [],
    validationPlan: null,
    explanation: null,
    sourceRevision: deriveUnitSourceRevision([SESSION_PATH], digestsV1).revision,
    ...overrides,
  };
}

function plannedUnit(overrides = {}) {
  return {
    id: 'auth/authn@run2',
    subsystem: 'auth',
    trustBoundary: 'tenant-user -> tenant-resource',
    attackClassId: 'authn-authz',
    state: 'planned',
    reasonCode: null,
    reviewedPaths: [],
    evidenceRefs: [],
    relatedFindingIds: [],
    validationPlan: null,
    explanation: null,
    ...overrides,
  };
}

function reconcile(
  sourceDigests,
  currentUnits = [plannedUnit()],
  priorUnits = [priorCoveredUnit()]
) {
  return reconcileRepeatRunCoverage({
    priorUnits,
    currentUnits,
    sourceDigests,
    taxonomyVersion,
  });
}

describe('deriveUnitSourceRevision', () => {
  it('reuses the repo-wide canonicalJson + sha256Hex hashing SSoT', () => {
    const { revision } = deriveUnitSourceRevision([SESSION_PATH], digestsV1);
    assert.equal(revision, sha256Hex(canonicalJson([[SESSION_PATH, digestsV1[SESSION_PATH]]])));
  });

  it('records a path with no supplied digest as unknown instead of skipping it', () => {
    const { revision, unknownPaths } = deriveUnitSourceRevision([SESSION_PATH], {});
    assert.deepEqual(unknownPaths, [SESSION_PATH]);
    assert.notEqual(revision, deriveUnitSourceRevision([], {}).revision);
  });

  it('is order-insensitive across the reviewed path list', () => {
    const digests = { a: '1'.repeat(64), b: '2'.repeat(64) };
    assert.equal(
      deriveUnitSourceRevision(['a', 'b'], digests).revision,
      deriveUnitSourceRevision(['b', 'a'], digests).revision
    );
  });
});

describe('reconcileRepeatRunCoverage', () => {
  it('carries over a prior covered unit when the reviewed source is unchanged', () => {
    const { coverage, repeatRun } = reconcile(digestsV1);

    assert.equal(coverage.coveredUnits, 1);
    assert.equal(coverage.plannedUnits, 0);
    assert.deepEqual(repeatRun.carriedOverUnitIds, ['auth/authn@run2']);
    assert.deepEqual(repeatRun.revalidationRequired, []);
    assert.equal(coverage.units[0].carriedOverFrom, 'auth/authn@run1');
    assert.ok(validateCoverage(coverage), validationErrors());
  });

  it('does NOT treat changed source as stale coverage: the unit returns to planned', () => {
    const { coverage, repeatRun } = reconcile(digestsV2);

    assert.equal(coverage.coveredUnits, 0);
    assert.equal(coverage.plannedUnits, 1);
    assert.deepEqual(coverage.openUnitIds, ['auth/authn@run2']);
    assert.deepEqual(repeatRun.carriedOverUnitIds, []);
    assert.deepEqual(repeatRun.revalidationRequired, [
      { unitId: 'auth/authn@run2', reason: 'source_changed' },
    ]);
    assert.ok(validateCoverage(coverage), validationErrors());
  });

  it('returns the unit to planned when a reviewed path digest is unavailable', () => {
    const { coverage, repeatRun } = reconcile({});

    assert.equal(coverage.coveredUnits, 0);
    assert.deepEqual(repeatRun.revalidationRequired, [
      {
        unitId: 'auth/authn@run2',
        reason: 'source_digest_unavailable',
        unknownPaths: [SESSION_PATH],
      },
    ]);
  });

  it('refuses carry-over when the prior unit recorded no source revision', () => {
    const { coverage, repeatRun } = reconcile(
      digestsV1,
      [plannedUnit()],
      [priorCoveredUnit({ sourceRevision: null })]
    );

    assert.equal(coverage.coveredUnits, 0);
    assert.deepEqual(repeatRun.revalidationRequired, [
      { unitId: 'auth/authn@run2', reason: 'no_prior_source_revision' },
    ]);
  });

  it('refuses carry-over when this run plans a different reviewed path set', () => {
    const { repeatRun } = reconcile(digestsV1, [plannedUnit({ reviewedPaths: ['src/other.mjs'] })]);

    assert.deepEqual(repeatRun.revalidationRequired, [
      { unitId: 'auth/authn@run2', reason: 'reviewed_paths_changed' },
    ]);
  });

  it('never promotes a unit the prior run did not cover', () => {
    const { coverage, repeatRun } = reconcile(
      digestsV1,
      [plannedUnit()],
      [priorCoveredUnit({ state: 'blocked' })]
    );

    assert.equal(coverage.coveredUnits, 0);
    assert.equal(repeatRun.priorUnitCount, 0);
    assert.deepEqual(repeatRun.carriedOverUnitIds, []);
  });

  it('leaves units this run already classified untouched', () => {
    const fresh = {
      ...plannedUnit({ id: 'auth/injection@run2', attackClassId: 'injection' }),
      state: 'covered',
      reviewedPaths: [SESSION_PATH],
      evidenceRefs: [evidenceRef()],
    };
    const { coverage, repeatRun } = reconcile(digestsV2, [fresh]);

    assert.equal(coverage.coveredUnits, 1);
    assert.deepEqual(repeatRun.freshUnitIds, ['auth/injection@run2']);
    assert.equal(coverage.units[0].carriedOverFrom, undefined);
  });
});
