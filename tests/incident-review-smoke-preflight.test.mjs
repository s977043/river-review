import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assessIncidentReviewSmoke,
  MAX_INPUT_BYTES,
  runIncidentReviewPreflightCli,
} from '../scripts/experiments/incident-review-smoke-preflight.mjs';

const SCRIPT = fileURLToPath(
  new URL('../scripts/experiments/incident-review-smoke-preflight.mjs', import.meta.url)
);
const PRIVATE = 'synthetic-PRIVATE-evidence-must-not-appear';
const SHA = { reviewed: 'a'.repeat(40), base: 'b'.repeat(40), introducing: 'c'.repeat(40) };

function fixture() {
  const bug = {
    caseId: 'synthetic-bug-1',
    label: 'bug',
    partition: 'development',
    usedForTuning: true,
    source: {
      reviewedTarget: 'synthetic/repo@review',
      reviewedCommit: SHA.reviewed,
      mergeBase: SHA.base,
      reviewedAt: '2026-10-01T00:00:00Z',
      diffScopeRef: 'scope/synthetic-1',
      reviewVisibility: 'reviewable',
      evidenceDigest: 'd'.repeat(64),
      bugIntroducingCommit: SHA.introducing,
      fixEvidenceRef: 'synthetic/fix-1',
      fixObservedAt: '2026-10-02T00:00:00Z',
    },
    oracle: {
      claimedStatus: 'independently_checked',
      adjudicatorRef: 'operator-reported-reviewer-1',
      evidenceRef: 'synthetic/oracle-1',
      adjudicatedAt: '2026-10-03T00:00:00Z',
      causeRef: 'synthetic/mechanism-1',
      locationRef: 'synthetic/location-1',
    },
    isolation: {
      labelsWithheld: true,
      laterFixWithheld: true,
      privateReportsWithheld: true,
    },
  };
  const clean = structuredClone(bug);
  clean.caseId = 'synthetic-clean-1';
  clean.label = 'clean';
  clean.partition = 'held_out';
  clean.usedForTuning = false;
  clean.source.reviewedTarget = 'synthetic/repo@clean';
  clean.source.reviewedCommit = 'f'.repeat(40);
  clean.source.diffScopeRef = 'scope/synthetic-2';
  clean.source.evidenceDigest = 'e'.repeat(64);
  delete clean.source.bugIntroducingCommit;
  delete clean.source.fixEvidenceRef;
  delete clean.source.fixObservedAt;
  delete clean.oracle.causeRef;
  delete clean.oracle.locationRef;
  clean.oracle.cleanScopeRef = 'synthetic/negative-scope-1';
  clean.oracle.alternativeAssessment = 'checked_valid';
  return {
    kind: 'incident-review-smoke/v1',
    heldOutFrozenAt: '2026-09-30T00:00:00Z',
    cases: [bug, clean],
  };
}

function cli(input, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
}

function assertUntrusted(report) {
  assert.equal(report.scope, 'metadata-only');
  assert.equal(report.evidenceTrust, 'unverified-input');
  assert.equal(report.authorizesApproval, false);
  assert.equal(report.decision, null);
  assert.deepEqual(report.writeEffects, []);
  for (const key of ['precision', 'recall', 'harmfulFalsePositiveRate', 'humanAttention']) {
    assert.equal(report[key], null);
  }
  for (const value of [PRIVATE, 'synthetic/oracle-1', 'operator-reported-reviewer-1']) {
    assert.equal(JSON.stringify(report).includes(value), false);
  }
}

test('complete synthetic metadata never becomes verified evidence, metrics or approval', () => {
  const input = fixture();
  const original = structuredClone(input);
  const report = assessIncidentReviewSmoke(input);
  assert.equal(report.metadataStatus, 'complete');
  assert.deepEqual(report.counts, {
    total: 2,
    reportedBug: 1,
    reportedClean: 1,
    development: 1,
    heldOut: 1,
  });
  assert.deepEqual(
    report.cases.map((c) => c.reasonCodes),
    [[], []]
  );
  assert.deepEqual(input, original, 'preflight must not mutate or store supplied cases');
  assertUntrusted(report);
});

test('empty template and one-sided corpora cannot appear complete', () => {
  const empty = assessIncidentReviewSmoke({
    kind: 'incident-review-smoke/v1',
    heldOutFrozenAt: null,
    cases: [],
  });
  assert.equal(empty.metadataStatus, 'incomplete');
  assert.ok(empty.reasonCodes.includes('no_cases'));
  assert.ok(empty.reasonCodes.includes('holdout_not_frozen'));
  assertUntrusted(empty);

  for (const label of ['bug', 'clean']) {
    const input = fixture();
    input.cases = input.cases.filter((entry) => entry.label === label);
    const report = assessIncidentReviewSmoke(input);
    assert.equal(report.metadataStatus, 'incomplete');
    assert.ok(report.reasonCodes.includes('missing_dataset_partition'));
  }
});

test('unconfirmed oracle or unreviewable chronology is not graded as a missed bug', () => {
  for (const change of [
    (c) => (c.oracle.claimedStatus = 'unknown'),
    (c) => (c.oracle.adjudicatorRef = ''),
    (c) => (c.source.reviewVisibility = 'unknown'),
    (c) => (c.source.reviewVisibility = 'not_reviewable'),
    (c) => (c.source.reviewedCommit = 'short'),
    (c) => delete c.source.evidenceDigest,
    (c) => delete c.oracle.causeRef,
    (c) => delete c.oracle.locationRef,
    (c) => delete c.source.bugIntroducingCommit,
    (c) => delete c.source.fixEvidenceRef,
    (c) => (c.source.fixObservedAt = c.source.reviewedAt),
    (c) => (c.source.fixObservedAt = '2026-09-01T00:00:00Z'),
  ]) {
    const input = fixture();
    change(input.cases[0]);
    const report = assessIncidentReviewSmoke(input);
    assert.equal(report.metadataStatus, 'incomplete');
    assert.notDeepEqual(report.cases[0].reasonCodes, []);
    assertUntrusted(report);
  }
});

test('clean negatives require a scoped oracle and alternative treatment', () => {
  for (const change of [
    (c) => delete c.oracle.cleanScopeRef,
    (c) => (c.oracle.alternativeAssessment = 'unknown'),
    (c) => (c.oracle.alternativeAssessment = 'not_reported'),
  ]) {
    const input = fixture();
    change(input.cases[1]);
    const report = assessIncidentReviewSmoke(input);
    assert.equal(report.metadataStatus, 'incomplete');
    assert.ok(report.cases[1].reasonCodes.includes('unconfirmed_clean_scope'));
  }
  const input = fixture();
  input.cases[1].oracle.alternativeAssessment = 'checked_not_applicable';
  assert.equal(assessIncidentReviewSmoke(input).metadataStatus, 'complete');
});

test('held-out contamination, missing isolation and duplicate identity stay incomplete', () => {
  const input = fixture();
  input.cases[1].caseId = input.cases[0].caseId;
  input.cases[1].isolation.laterFixWithheld = false;
  const report = assessIncidentReviewSmoke(input);
  assert.ok(report.cases[1].reasonCodes.includes('duplicate_case_id'));
  assert.ok(report.cases[1].reasonCodes.includes('unconfirmed_context_isolation'));
  assert.equal(report.metadataStatus, 'incomplete');
  assertUntrusted(report);
});

test('a held-out case already used for tuning, or with unknown tuning history, is incomplete', () => {
  for (const usedForTuning of [true, null, undefined]) {
    const input = fixture();
    input.cases[1].usedForTuning = usedForTuning;
    const report = assessIncidentReviewSmoke(input);
    assert.equal(report.metadataStatus, 'incomplete');
    assert.ok(report.cases[1].reasonCodes.includes('unconfirmed_tuning_exposure'));
  }
});

test('the same review snapshot cannot straddle development and held-out partitions', () => {
  const input = fixture();
  input.cases[1].source.reviewedTarget = input.cases[0].source.reviewedTarget;
  input.cases[1].source.reviewedCommit = input.cases[0].source.reviewedCommit;
  input.cases[1].source.diffScopeRef = input.cases[0].source.diffScopeRef;
  input.cases[1].source.evidenceDigest = input.cases[0].source.evidenceDigest;
  assert.ok(
    assessIncidentReviewSmoke(input).cases[1].reasonCodes.includes('cross_partition_snapshot')
  );
});

test('strict allowlists reject raw reports, hidden authority flags and unbounded references', () => {
  for (const change of [
    (input) => (input.approved = true),
    (input) => (input.cases[0].postmortem = PRIVATE),
    (input) => (input.cases[0].oracle.rawDiff = PRIVATE),
    (input) => (input.cases[1].source.prompt = PRIVATE),
    (input) => (input.cases[0].isolation.verified = true),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => assessIncidentReviewSmoke(input), /unsupported_field/);
  }
  const input = fixture();
  input.cases[0].oracle.evidenceRef = `synthetic/${PRIVATE.repeat(10)}`;
  const report = assessIncidentReviewSmoke(input);
  assert.equal(report.metadataStatus, 'incomplete');
  assert.ok(report.cases[0].reasonCodes.includes('unconfirmed_oracle'));
  assertUntrusted(report);
});

test('malformed, sparse and excess case collections do not silently pass', () => {
  for (const value of [null, [], {}, { kind: 'incident-review-smoke/v1', cases: {} }]) {
    assert.throws(() => assessIncidentReviewSmoke(value), /invalid_input/);
  }
  const input = fixture();
  input.cases = Array(31).fill(input.cases[0]);
  assert.throws(() => assessIncidentReviewSmoke(input), /invalid_input/);
  input.cases = [, fixture().cases[1]];
  const report = assessIncidentReviewSmoke(input);
  assert.equal(report.metadataStatus, 'incomplete');
  assert.ok(report.cases[0].reasonCodes.includes('invalid_case'));
});

test('IDs, revisions and digests must be actual strings, not coercible JSON arrays', () => {
  for (const [key, original] of [
    ['caseId', 'synthetic-bug-1'],
    ['reviewedCommit', SHA.reviewed],
    ['mergeBase', SHA.base],
    ['bugIntroducingCommit', SHA.introducing],
    ['evidenceDigest', 'd'.repeat(64)],
  ]) {
    const input = fixture();
    const target = key === 'caseId' ? input.cases[0] : input.cases[0].source;
    target[key] = [original];
    assert.equal(assessIncidentReviewSmoke(input).metadataStatus, 'incomplete', key);
  }
});

test('timestamps reject normalized non-existent calendar dates', () => {
  const input = fixture();
  input.cases[0].source.reviewedAt = '2026-02-31T00:00:00Z';
  assert.ok(
    assessIncidentReviewSmoke(input).cases[0].reasonCodes.includes('incomplete_review_snapshot')
  );
});

test('bug and clean-specific evidence cannot be silently mixed', () => {
  const bug = fixture();
  bug.cases[0].oracle.cleanScopeRef = 'synthetic/negative-scope-1';
  assert.ok(assessIncidentReviewSmoke(bug).cases[0].reasonCodes.includes('mixed_oracle_fields'));
  const clean = fixture();
  clean.cases[1].source.fixEvidenceRef = 'synthetic/later-fix';
  assert.ok(assessIncidentReviewSmoke(clean).cases[1].reasonCodes.includes('mixed_oracle_fields'));
});

test('CLI separates structurally complete, incomplete, and malformed inputs', () => {
  const complete = cli(fixture());
  assert.equal(complete.status, 0);
  assertUntrusted(JSON.parse(complete.stdout));

  const incomplete = fixture();
  incomplete.cases[0].oracle.claimedStatus = 'pending';
  const pending = cli(incomplete);
  assert.equal(pending.status, 3);
  assert.equal(JSON.parse(pending.stdout).metadataStatus, 'incomplete');

  for (const input of ['{', 'not-json', JSON.stringify({ secret: PRIVATE })]) {
    const invalid = cli(input);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stderr.includes(PRIVATE), false);
  }
  const unsupported = fixture();
  unsupported.cases[0].rawReport = PRIVATE;
  const rejected = cli(unsupported);
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stdout.includes(PRIVATE) || rejected.stderr.includes(PRIVATE), false);
  assert.equal(cli(fixture(), ['--unknown']).status, 2);
});

test('CLI enforces its input byte ceiling without reflecting private input', () => {
  const input = fixture();
  input.cases[0].source.diffScopeRef = PRIVATE.repeat(MAX_INPUT_BYTES / 20);
  const result = cli(input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /input_too_large/);
  assert.equal(result.stderr.includes(PRIVATE), false);
});

test('CLI sanitizes asynchronously failed output, including help', async () => {
  for (const args of [[], ['--help']]) {
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        queueMicrotask(() => callback(new Error(PRIVATE)));
      },
    });
    const errors = [];
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        errors.push(chunk.toString());
        callback();
      },
    });
    const code = await runIncidentReviewPreflightCli(
      args,
      Readable.from([JSON.stringify(fixture())]),
      output,
      stderr
    );
    assert.equal(code, 2);
    assert.deepEqual(errors, ['{"error":"output_write_failed"}\n']);
  }
});

test('stdin overflow absorbs a subsequent producer error without leaking it', async () => {
  const input = new Readable({
    read() {
      this.push(Buffer.alloc(MAX_INPUT_BYTES + 1));
      this.destroy(new Error(PRIVATE));
    },
  });
  const stdout = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const errors = [];
  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      errors.push(chunk.toString());
      callback();
    },
  });
  const code = await runIncidentReviewPreflightCli([], input, stdout, stderr);
  assert.equal(code, 2);
  assert.deepEqual(errors, ['{"error":"input_too_large"}\n']);
});

test('stdin cleanup error after valid JSON does not reveal a producer error', async () => {
  let emitted = false;
  const input = new Readable({
    read() {
      if (emitted) return;
      emitted = true;
      this.push(JSON.stringify(fixture()));
      this.push(null);
    },
    destroy(_error, callback) {
      callback(new Error(PRIVATE));
    },
  });
  const stdout = [];
  const code = await runIncidentReviewPreflightCli(
    [],
    input,
    new Writable({
      write(chunk, _encoding, callback) {
        stdout.push(chunk.toString());
        callback();
      },
    }),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    })
  );
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout.join('')).metadataStatus, 'complete');
});
