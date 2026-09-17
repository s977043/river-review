import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import { securityAuditUnitSemanticKey } from '../src/lib/security-audit-coverage.mjs';
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

  it('refuses carry-over when the prior unit reviewed no path at all', () => {
    // The revision of an empty path list is a publicly computable constant, so
    // without this guard a prior unit with no reviewedPaths carried over no
    // matter how much the source moved.
    const emptyPrior = priorCoveredUnit({
      reviewedPaths: [],
      evidenceRefs: [],
      sourceRevision: deriveUnitSourceRevision([], {}).revision,
    });
    const { coverage, repeatRun } = reconcile({}, [plannedUnit()], [emptyPrior]);

    assert.equal(coverage.coveredUnits, 0);
    assert.equal(coverage.plannedUnits, 1);
    assert.deepEqual(repeatRun.carriedOverUnitIds, []);
    assert.deepEqual(repeatRun.revalidationRequired, [
      { unitId: 'auth/authn@run2', reason: 'no_prior_source_revision' },
    ]);
  });

  it('does not carry coverage across a different attack class', () => {
    const { coverage, repeatRun } = reconcile(
      digestsV1,
      [plannedUnit({ attackClassId: 'injection' })],
      [priorCoveredUnit()]
    );

    assert.equal(coverage.coveredUnits, 0);
    assert.deepEqual(repeatRun.carriedOverUnitIds, []);
    assert.deepEqual(repeatRun.revalidationRequired, []);
  });

  it('does not carry coverage across a different trust boundary', () => {
    const { coverage, repeatRun } = reconcile(
      digestsV1,
      [plannedUnit({ trustBoundary: 'public-internet -> edge' })],
      [priorCoveredUnit()]
    );

    assert.equal(coverage.coveredUnits, 0);
    assert.deepEqual(repeatRun.carriedOverUnitIds, []);
    assert.deepEqual(repeatRun.revalidationRequired, []);
  });

  it('does not carry coverage across a different subsystem', () => {
    const { coverage } = reconcile(
      digestsV1,
      [plannedUnit({ subsystem: 'billing' })],
      [priorCoveredUnit()]
    );

    assert.equal(coverage.coveredUnits, 0);
  });

  it('matches unit identity through the Phase 3 semantic key, NFC included', () => {
    // The same name in NFC and NFD is one unit for Phase 3 duplicate detection,
    // so it must be one unit for carry-over matching too.
    const nfd = 'cafe\u0301-svc';
    const nfc = 'caf\u00e9-svc';
    assert.notEqual(nfd, nfc);
    assert.equal(
      securityAuditUnitSemanticKey({ ...priorCoveredUnit(), subsystem: nfd }),
      securityAuditUnitSemanticKey({ ...priorCoveredUnit(), subsystem: nfc })
    );

    const { coverage } = reconcile(
      digestsV1,
      [plannedUnit({ subsystem: nfd })],
      [priorCoveredUnit({ subsystem: nfc })]
    );
    assert.equal(coverage.coveredUnits, 1);
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
