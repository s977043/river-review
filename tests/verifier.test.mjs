import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { formatFindingMessage } from '../src/lib/finding-factory.mjs';
import { HEURISTIC_KIND_PRESENTATIONS } from '../src/lib/heuristic-review.mjs';
import { determineScopeFromDiff, verifyFinding } from '../src/lib/verifier.mjs';

test('verifyFinding: passes for well-formed finding', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: The diff shows X\nSeverity: warning\nConfidence: high\nFix: Use Y instead of Z for better performance',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'major' } },
  });
  assert.ok(result.verified);
  assert.equal(result.reasons.length, 0);
});

test('verifyFinding: rejects finding without evidence', () => {
  const result = verifyFinding({
    finding: {
      message: 'Finding:\nSeverity: warning\nFix: Do something about this',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream' } },
  });
  assert.ok(!result.verified);
  assert.ok(result.reasons.some((r) => r.includes('evidence')));
  assert.equal(result.checks.evidenceExists, false);
});

test('verifyFinding: rejects finding without actionable fix', () => {
  const result = verifyFinding({
    finding: {
      message: 'Finding:\nEvidence: code at line 5\nSeverity: warning\nFix: fix it',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream' } },
  });
  assert.ok(!result.verified);
  assert.equal(result.checks.suggestionActionable, false);
});

test('verifyFinding: accepts finding with no phase info (lenient)', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: warning\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: {} },
  });
  assert.ok(result.checks.phaseCoherent);
});

test('verifyFinding: severity blocker maps to critical', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: hardcoded secret\nSeverity: blocker\nFix: Move to environment variable and use GitHub Secrets',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'critical' } },
  });
  assert.ok(result.checks.severityJustified);
});

test('verifyFinding: rejects blocker severity when skill is minor', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: minor style issue\nSeverity: blocker\nFix: Rename the variable to follow naming convention guidelines',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'minor' } },
  });
  assert.equal(result.checks.severityJustified, false);
});

test('verifyFinding: severity nit maps to minor', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: trailing whitespace\nSeverity: nit\nFix: Remove the trailing whitespace on lines 5 and 12',
    },
    diff: '...',
    skill: { metadata: { severity: 'minor' } },
  });
  assert.ok(result.checks.severityJustified);
});

test('verifyFinding: nit severity rejected when skill is info', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: minor whitespace\nSeverity: nit\nFix: Clean up trailing whitespace in the file',
    },
    diff: '...',
    skill: { metadata: { severity: 'info' } },
  });
  assert.equal(result.checks.severityJustified, false);
});

test('verifyFinding: lenient when finding has no severity', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: some evidence here\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: { severity: 'minor' } },
  });
  assert.ok(result.checks.severityJustified);
});

test('verifyFinding: lenient when skill has no severity', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: blocker\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: {} },
  });
  assert.ok(result.checks.severityJustified);
});

test('verifyFinding: Suggestion label is accepted as actionable', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: duplicated logic\nSeverity: warning\nSuggestion: Extract the shared logic into a utility function',
    },
    diff: '...',
    skill: { metadata: { severity: 'major' } },
  });
  assert.ok(result.checks.suggestionActionable);
});

test('verifyFinding: phase mismatch is rejected', () => {
  const result = verifyFinding({
    finding: {
      phase: 'upstream',
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: warning\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'major' } },
  });
  assert.equal(result.checks.phaseCoherent, false);
  assert.ok(result.reasons.some((r) => r.includes('Phase mismatch')));
});

test('verifyFinding: array skill phase containing finding phase passes', () => {
  const result = verifyFinding({
    finding: {
      phase: 'midstream',
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: warning\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: { phase: ['upstream', 'midstream'], severity: 'major' } },
  });
  assert.equal(result.checks.phaseCoherent, true);
  assert.ok(result.verified);
});

test('verifyFinding: array skill phase not containing finding phase is rejected', () => {
  const result = verifyFinding({
    finding: {
      phase: 'downstream',
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: warning\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: { phase: ['upstream', 'midstream'], severity: 'major' } },
  });
  assert.equal(result.checks.phaseCoherent, false);
  assert.ok(
    result.reasons.some((r) => r.includes('Phase mismatch') && r.includes('upstream/midstream'))
  );
});

test('verifyFinding: string skill phase matching finding phase still passes', () => {
  const result = verifyFinding({
    finding: {
      phase: 'midstream',
      message:
        'Finding:\nEvidence: some evidence here\nSeverity: warning\nFix: Replace the old API call with the new versioned endpoint',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'major' } },
  });
  assert.equal(result.checks.phaseCoherent, true);
});

test('verifyFinding: multiple failures are all reported', () => {
  const result = verifyFinding({
    finding: {
      phase: 'upstream',
      message: 'No structured labels at all',
    },
    diff: '...',
    skill: { metadata: { phase: 'midstream', severity: 'minor' } },
  });
  assert.ok(!result.verified);
  assert.ok(result.reasons.length >= 3);
  assert.equal(result.checks.evidenceExists, false);
  assert.equal(result.checks.phaseCoherent, false);
  assert.equal(result.checks.suggestionActionable, false);
});

test('verifyFinding: evidenceInDiff passes when file is in diff', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: hardcoded secret in src/config/auth.ts\nSeverity: warning\nFix: Move the secret to environment variables',
    },
    diff: 'diff --git a/src/config/auth.ts b/src/config/auth.ts\n+const secret = "abc";',
    skill: { metadata: { severity: 'major' } },
  });
  assert.equal(result.checks.evidenceInDiff, true);
});

test('verifyFinding: evidenceInDiff fails when file is not in diff', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: hardcoded secret in src/config/auth.ts\nSeverity: warning\nFix: Move the secret to environment variables',
    },
    diff: 'diff --git a/src/index.mjs b/src/index.mjs\n+console.log("hello");',
    skill: { metadata: { severity: 'major' } },
  });
  assert.equal(result.checks.evidenceInDiff, false);
  assert.ok(result.reasons.some((r) => r.includes('file not found in diff')));
});

test('verifyFinding: evidenceInDiff lenient when no file reference', () => {
  const result = verifyFinding({
    finding: {
      message:
        'Finding:\nEvidence: the code uses an outdated pattern\nSeverity: warning\nFix: Migrate to the newer API for better performance',
    },
    diff: 'diff --git a/src/index.mjs b/src/index.mjs\n+console.log("hello");',
    skill: { metadata: { severity: 'major' } },
  });
  assert.equal(result.checks.evidenceInDiff, true);
});

test('verifyFinding: filePhaseCoherent passes when file type matches phase', () => {
  const result = verifyFinding({
    finding: {
      file: 'tests/foo.test.mjs',
      phase: 'downstream',
      message:
        'Finding:\nEvidence: test is incomplete\nSeverity: nit\nFix: Add assertion for edge case',
    },
    diff: 'diff --git a/tests/foo.test.mjs\n+test()',
    skill: { metadata: { severity: 'minor' } },
    fileTypes: { test: ['tests/foo.test.mjs'], app: ['src/index.mjs'] },
  });
  assert.equal(result.checks.filePhaseCoherent, true);
});

test('verifyFinding: filePhaseCoherent rejects when file type mismatches phase', () => {
  const result = verifyFinding({
    finding: {
      file: 'tests/foo.test.mjs',
      phase: 'upstream',
      message:
        'Finding:\nEvidence: test is incomplete\nSeverity: nit\nFix: Add assertion for edge case',
    },
    diff: 'diff --git a/tests/foo.test.mjs\n+test()',
    skill: { metadata: { severity: 'minor' } },
    fileTypes: { test: ['tests/foo.test.mjs'], app: ['src/index.mjs'] },
  });
  assert.equal(result.checks.filePhaseCoherent, false);
  assert.ok(result.reasons.some((r) => r.includes('File type does not match')));
});

test('verifyFinding: filePhaseCoherent lenient when fileTypes not provided', () => {
  const result = verifyFinding({
    finding: {
      file: 'tests/foo.test.mjs',
      phase: 'upstream',
      message:
        'Finding:\nEvidence: test is incomplete\nSeverity: nit\nFix: Add assertion for edge case',
    },
    diff: 'diff --git a/tests/foo.test.mjs\n+test()',
    skill: { metadata: { severity: 'minor' } },
  });
  assert.equal(result.checks.filePhaseCoherent, true);
});

// ---------------------------------------------------------------------------
// #1644 Phase 1: finding scope (in-diff / pre-existing)
// ---------------------------------------------------------------------------

const SCOPE_MESSAGE =
  'Finding: issue\nEvidence: src/app.mjs drops the error\nSeverity: warning\nConfidence: high\nFix: Rethrow the error with context added';

const SCOPE_DIFF = 'diff --git a/src/app.mjs\n+throw err';
const SCOPE_DIFF_FILES = [{ path: 'src/app.mjs', addedLines: [10, 11, 12] }];

test('verifyFinding: scope is in-diff when the finding line is an added line', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 11, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'in-diff');
  assert.equal(result.scopeSource, 'machine');
  assert.equal(result.verified, true);
});

test('verifyFinding: scope is pre-existing when the line is outside the added lines', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 80, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'pre-existing');
  assert.equal(result.scopeSource, 'machine');
});

test('verifyFinding: scope does not widen beyond the added lines (tolerance 0)', () => {
  for (const line of [9, 13, 14]) {
    const result = verifyFinding({
      finding: { file: 'src/app.mjs', line, message: SCOPE_MESSAGE },
      diff: SCOPE_DIFF,
      skill: { metadata: {} },
      diffFiles: SCOPE_DIFF_FILES,
    });
    assert.equal(result.scope, 'pre-existing', `line ${line} must not be in-diff`);
  }
});

test('determineScopeFromDiff: real parseUnifiedDiff context lines are pre-existing', () => {
  // Regression guard for the tolerance widening (#1644 review B1): hand-written
  // addedLines cannot expose it, because a unified diff always surrounds a hunk
  // with context lines. Drive the assertion from real parser output instead.
  const diffText = fs.readFileSync(
    'tests/fixtures/planner-dataset/diffs/midstream-security-hardcoded-token.diff',
    'utf8'
  );
  const { files } = parseUnifiedDiff(diffText);
  const entry = files.find((f) => f.path === 'src/config/auth.ts');
  assert.ok(entry, 'fixture file is present in the parsed diff');
  assert.ok(entry.addedLines.length > 0, 'fixture has added lines');

  const addedSet = new Set(entry.addedLines);
  const firstAdded = Math.min(...entry.addedLines);
  const contextLines = [];
  for (let line = 1; line < firstAdded; line += 1) {
    if (!addedSet.has(line)) contextLines.push(line);
  }
  assert.ok(contextLines.length > 0, 'fixture has context lines before the first added line');

  for (const line of contextLines) {
    assert.equal(
      determineScopeFromDiff({ file: 'src/config/auth.ts', line }, files),
      'pre-existing',
      `context line ${line} must be pre-existing`
    );
  }
  for (const line of entry.addedLines) {
    assert.equal(
      determineScopeFromDiff({ file: 'src/config/auth.ts', line }, files),
      'in-diff',
      `added line ${line} must be in-diff`
    );
  }
});

test('determineScopeFromDiff: non-positive or non-finite lines are undetermined (W2)', () => {
  for (const line of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      determineScopeFromDiff({ file: 'src/app.mjs', line }, SCOPE_DIFF_FILES),
      null,
      `line ${line} must not be decided by the diff`
    );
  }
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 0, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'in-diff', 'fails safe rather than demoting to pre-existing');
  assert.equal(result.scopeSource, 'default');
});

test('determineScopeFromDiff: an ambiguous suffix match is undetermined (W4)', () => {
  const ambiguous = [
    { path: 'packages/a/src/app.mjs', addedLines: [10] },
    { path: 'packages/b/src/app.mjs', addedLines: [99] },
  ];
  assert.equal(determineScopeFromDiff({ file: 'src/app.mjs', line: 10 }, ambiguous), null);

  const unique = [
    { path: 'packages/a/src/app.mjs', addedLines: [10] },
    { path: 'packages/b/src/other.mjs', addedLines: [99] },
  ];
  assert.equal(determineScopeFromDiff({ file: 'src/app.mjs', line: 10 }, unique), 'in-diff');
});

test('determineScopeFromDiff: a range finding intersecting added lines is in-diff (N6)', () => {
  const files = [{ path: 'src/app.mjs', addedLines: [20, 21] }];
  assert.equal(
    determineScopeFromDiff({ file: 'src/app.mjs', lineStart: 15, lineEnd: 25 }, files),
    'in-diff'
  );
  assert.equal(
    determineScopeFromDiff({ file: 'src/app.mjs', lineStart: 30, lineEnd: 40 }, files),
    'pre-existing'
  );
  assert.equal(
    determineScopeFromDiff({ file: 'src/app.mjs', lineStart: 30, lineEnd: 10 }, files),
    'pre-existing',
    'an inverted range degrades to the start line'
  );
});

test('verifyFinding: an out-of-vocabulary Scope label is not a self-report (N7)', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', message: `${SCOPE_MESSAGE}\nScope: unknown` },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scopeSelfReported, null);
  assert.equal(result.scopeSource, 'default');
  assert.equal(result.scope, 'in-diff');
  assert.equal(result.scopeMismatch, false, 'no spurious mismatch from a normalized fake report');
});

test('verifyFinding: prose containing "Scope:" is not read as a self-report (W3)', () => {
  const result = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      message:
        'Finding: token is over-privileged Evidence: the OAuth Scope: admin:org is granted in src/app.mjs Severity: warning Confidence: high Fix: narrow the requested scope to read:org only',
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scopeSelfReported, null);
  assert.equal(result.scopeSource, 'default');
});

test('verifyFinding: scope falls back to the self-reported label when the diff cannot decide', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', message: `${SCOPE_MESSAGE}\nScope: pre-existing` },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'pre-existing');
  assert.equal(result.scopeSource, 'self-reported');
});

test('verifyFinding: machine determination overrides a conflicting self-report', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 11, message: `${SCOPE_MESSAGE}\nScope: pre-existing` },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'in-diff');
  assert.equal(result.scopeSource, 'machine');
  assert.equal(result.scopeSelfReported, 'pre-existing');
  assert.equal(result.scopeMismatch, true);
});

test('verifyFinding: scope fails safe to in-diff without diffFiles or self-report', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 11, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
  });
  assert.equal(result.scope, 'in-diff');
  assert.equal(result.scopeSource, 'default');
  assert.equal(result.scopeMismatch, false);
});

test('verifyFinding: scope fails safe to in-diff when the file is absent from the diff', () => {
  const result = verifyFinding({
    finding: { file: 'src/other.mjs', line: 11, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'in-diff');
  assert.equal(result.scopeSource, 'default');
});

test('verifyFinding: scope never affects the verified verdict', () => {
  const result = verifyFinding({
    finding: { file: 'src/app.mjs', line: 80, message: SCOPE_MESSAGE },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(result.scope, 'pre-existing');
  assert.equal(result.verified, true);
  assert.equal(result.reasons.length, 0);
});

// ---------------------------------------------------------------------------
// #1666 (#1545 Phase 2): traceability refs must not move the verified verdict
// ---------------------------------------------------------------------------

test('verifyFinding: ArtifactRefs anchors are not read as evidence file references', () => {
  // Regression guard: RE_EVIDENCE runs greedily to end-of-line, so an artifact
  // anchor (`plan.md#AC-4` — by design NOT in the diff) tripped
  // checkEvidenceInDiff and rejected an otherwise-valid finding.
  const withRefs = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      line: 11,
      message: `${SCOPE_MESSAGE} CriterionRefs: AC-4, TC-7 ArtifactRefs: plan.md#AC-4, todo.md#TASK-3`,
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(withRefs.verified, true, withRefs.reasons.join('; '));
  assert.equal(withRefs.checks.evidenceInDiff, true);
});

test('verifyFinding: refs change no check outcome versus the same message without them', () => {
  const call = (message) =>
    verifyFinding({
      finding: { file: 'src/app.mjs', line: 11, message },
      diff: SCOPE_DIFF,
      skill: { metadata: {} },
      diffFiles: SCOPE_DIFF_FILES,
    });
  const without = call(SCOPE_MESSAGE);
  const withRefs = call(`${SCOPE_MESSAGE} CriterionRefs: AC-4 ArtifactRefs: plan.md#AC-4`);
  assert.deepEqual(withRefs.checks, without.checks);
  assert.equal(withRefs.verified, without.verified);
  assert.deepEqual(withRefs.reasons, without.reasons);
  assert.equal(withRefs.scope, without.scope);
});

test('verifyFinding: a refs label cannot launder a hallucinated evidence path (F2)', () => {
  // Attack A2/A3: the first implementation ran checkEvidenceInDiff on a
  // ref-STRIPPED message, so moving a fake file reference behind a refs label
  // deleted it from the text and the check passed. The file-reference check now
  // reads the raw message and subtracts only anchored artifact citations.
  const baseline = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      line: 11,
      message:
        'Finding: issue Evidence: the secret is in src/fake.mjs line 3 Impact: leak Fix: move it to an environment variable Severity: warning Confidence: high',
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(baseline.verified, false, 'control: a fake path is rejected');

  const hiddenInEvidence = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      line: 11,
      message:
        'Finding: issue Evidence: the secret is in ArtifactRefs: src/fake.mjs and it leaks badly Impact: leak Fix: move it to an environment variable Severity: warning Confidence: high',
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(hiddenInEvidence.verified, false, 'A2: a bare path in a refs field stays checkable');
  assert.equal(hiddenInEvidence.checks.evidenceInDiff, false);

  const movedToTrailingList = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      line: 11,
      message:
        'Finding: issue Evidence: the secret leaks here badly CriterionRefs: src/fake.mjs Impact: leak Fix: move it to an environment variable Severity: warning Confidence: high',
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(movedToTrailingList.verified, false, 'A3: same, via a trailing list');
});

test('verifyFinding: anchored artifact citations are exempt, including unparsed shapes (F2)', () => {
  const call = (message) =>
    verifyFinding({
      finding: { file: 'src/app.mjs', line: 11, message },
      diff: SCOPE_DIFF,
      skill: { metadata: {} },
      diffFiles: SCOPE_DIFF_FILES,
    });
  // `plan.md` is not in the diff; the anchor marks it as an artifact citation.
  assert.equal(call(`${SCOPE_MESSAGE} ArtifactRefs: plan.md#AC-4`).verified, true);
  // The span is wider than the parsed list, so a space-separated second value
  // does not drop the finding even though it is not captured as a ref value.
  assert.equal(
    call(`${SCOPE_MESSAGE} ArtifactRefs: plan.md#AC-4 todo.md#TASK-3`).verified,
    true,
    'an unparsed shape must not be fail-open on content, nor destroy the finding'
  );
  // An anchored path OUTSIDE any refs field keeps the pre-#1666 behavior.
  assert.equal(
    call(
      'Finding: issue\nEvidence: see plan.md#AC-4 for the rule\nSeverity: warning\nConfidence: high\nFix: Rethrow the error with context added'
    ).verified,
    false,
    'the exemption is scoped to refs fields — prose citations are unchanged'
  );
});

test('verifyFinding: refs cannot pad a too-short Evidence / Fix into passing', () => {
  // The mirror direction of the same non-interference contract: because the
  // greedy checks read to end-of-line, appended refs would otherwise satisfy
  // the minimum-length requirements on their own.
  const rejected = verifyFinding({
    finding: {
      file: 'src/app.mjs',
      line: 11,
      message:
        'Finding: issue\nSeverity: warning\nConfidence: high\nFix: short CriterionRefs: AC-4',
    },
    diff: SCOPE_DIFF,
    skill: { metadata: {} },
    diffFiles: SCOPE_DIFF_FILES,
  });
  assert.equal(rejected.verified, false);
  assert.ok(rejected.reasons.includes('No evidence provided in finding'));
  assert.ok(rejected.reasons.includes('Fix/suggestion is missing or too brief'));
});

const PRESET_DIFF = 'diff --git a/src/app.js b/src/app.js\n+x';
const verifyPreset = (preset, options = {}) =>
  verifyFinding({
    finding: { file: 'src/app.js', line: 1, message: formatFindingMessage(preset) },
    diff: PRESET_DIFF,
    skill: { metadata: { severity: 'minor' } },
    ...options,
  });

test('verifyFinding: deterministicSource passes every heuristic kind (TC-10)', () => {
  assert.ok(HEURISTIC_KIND_PRESENTATIONS.size > 0);
  for (const [kind, preset] of HEURISTIC_KIND_PRESENTATIONS) {
    const result = verifyPreset(preset, { deterministicSource: true });
    assert.deepEqual(result.reasons, [], kind);
    assert.equal(result.verified, true, kind);
  }
});

test('verifyFinding: without deterministicSource, a minor skill rejects all but nits (TC-10)', () => {
  assert.ok(HEURISTIC_KIND_PRESENTATIONS.size > 0);
  for (const [kind, preset] of HEURISTIC_KIND_PRESENTATIONS) {
    assert.equal(verifyPreset(preset).verified, preset.severity === 'nit', kind);
  }
});

test('verifyFinding: deterministicSource exempts the dangerous-eval evidence text (TC-03)', () => {
  const preset = HEURISTIC_KIND_PRESENTATIONS.get('dangerous-eval');
  const skill = { metadata: { severity: 'critical' } };
  assert.deepEqual(verifyPreset(preset, { skill }).reasons, [
    'Evidence references file not found in diff',
  ]);
  assert.equal(verifyPreset(preset, { skill, deterministicSource: true }).verified, true);
});

test('verifyFinding: deterministicSource keeps the format checks', () => {
  const result = verifyFinding({
    finding: { message: 'Finding: issue\nSeverity: warning\nConfidence: high\nFix: short' },
    diff: PRESET_DIFF,
    skill: { metadata: {} },
    deterministicSource: true,
  });
  assert.equal(result.verified, false);
  assert.ok(result.reasons.includes('No evidence provided in finding'));
  assert.ok(result.reasons.includes('Fix/suggestion is missing or too brief'));
});
