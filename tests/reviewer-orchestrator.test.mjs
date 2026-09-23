import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Stub generateReview before importing the orchestrator
const generateReviewStub = mock.fn(async ({ projectRules }) => ({
  comments: [
    {
      file: 'src/foo.mjs',
      line: 1,
      message: `Finding: issue Evidence: found in ${projectRules?.slice(0, 20) ?? ''}`,
    },
  ],
  findings: [
    {
      id: 'rr-1',
      ruleId: 'some-rule',
      file: 'src/foo.mjs',
      lineStart: 1,
      lineEnd: 1,
      title: 'test finding',
      message:
        'Finding: issue Evidence: found in diff Impact: medium Fix: fix it Severity: major Confidence: high',
      severity: 'major',
      confidence: 'high',
      status: 'open',
      evidence: ['found in diff with enough characters to pass threshold here'],
    },
  ],
  classified: { overview: [], suppressed: [], inlineCandidates: [] },
  prompt: 'prompt text',
  promptTruncated: false,
  llmModel: 'gpt-4o',
  debug: {},
}));

// Patch the module before import via mock.module
const {
  runReviewerOrchestration,
  REVIEWER_ROLES,
  DEFAULT_REVIEWERS,
  resolveReviewerRoles,
  selectRolesAuto,
  splitDiffIntoChunks,
  deduplicateFindings,
  mergeFindings,
  findingsOverlap,
  resolveReviewerTimeoutMs,
  resolveReviewerProgressEnabled,
  ReviewerTimeoutError,
  REVIEWER_TIMEOUT_ENV,
  REVIEWER_TIMEOUT_MAX_MS,
} = await (() => {
  // We can't easily mock ESM imports in node:test without a loader.
  // Instead, import the real module and test its observable behaviour.
  return import('../src/lib/reviewer-orchestrator.mjs');
})();

function makeDiff() {
  return { diffText: 'diff --git a/src/foo.mjs', files: [], filesForReview: [] };
}

describe('REVIEWER_ROLES', () => {
  it('exports bug-hunter, security-scanner, test-gap', () => {
    assert.ok('bug-hunter' in REVIEWER_ROLES);
    assert.ok('security-scanner' in REVIEWER_ROLES);
    assert.ok('test-gap' in REVIEWER_ROLES);
  });

  it('each role has label and focusInstructions', () => {
    for (const [, role] of Object.entries(REVIEWER_ROLES)) {
      assert.ok(typeof role.label === 'string' && role.label.length > 0);
      assert.ok(typeof role.focusInstructions === 'string' && role.focusInstructions.length > 10);
    }
  });

  // #1455 C1: bug-hunter focusInstructions must call out concurrent access
  // race conditions as a first-class concern, matching the
  // skills/agent-skills/review-team/SKILL.md role table (SSoT for role scope).
  it('bug-hunter focusInstructions covers concurrent access race conditions', () => {
    const focus = REVIEWER_ROLES['bug-hunter'].focusInstructions;
    assert.match(focus, /concurrent access race[- ]conditions?/i);
  });
});

describe('DEFAULT_REVIEWERS', () => {
  it('contains bug-hunter and security-scanner', () => {
    assert.ok(DEFAULT_REVIEWERS.includes('bug-hunter'));
    assert.ok(DEFAULT_REVIEWERS.includes('security-scanner'));
  });
});

describe('resolveReviewerRoles', () => {
  it('returns valid and invalid split', () => {
    const { valid, invalid } = resolveReviewerRoles(['bug-hunter', 'nonexistent']);
    assert.deepEqual(valid, ['bug-hunter']);
    assert.deepEqual(invalid, ['nonexistent']);
  });

  it('uses DEFAULT_REVIEWERS when input is null', () => {
    const { valid, invalid } = resolveReviewerRoles(null);
    assert.deepEqual(valid, DEFAULT_REVIEWERS);
    assert.deepEqual(invalid, []);
  });

  it('uses DEFAULT_REVIEWERS when input is undefined', () => {
    const { valid } = resolveReviewerRoles(undefined);
    assert.deepEqual(valid, DEFAULT_REVIEWERS);
  });
});

describe('runReviewerOrchestration', () => {
  it('rejects an explicit list when every reviewer role is unknown (#2363)', async () => {
    await assert.rejects(
      () => runReviewerOrchestration({ diff: makeDiff(), reviewers: ['nonexistent'] }),
      /Unknown reviewer roles: \[nonexistent\]/
    );
  });

  it('returns reviewerResults with role metadata', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner'],
    });
    assert.equal(result.reviewerResults.length, 2);
    assert.equal(result.reviewerResults[0].role, 'bug-hunter');
    assert.equal(result.reviewerResults[0].label, REVIEWER_ROLES['bug-hunter'].label);
    assert.ok('status' in result.reviewerResults[0]);
    assert.ok('findingsCount' in result.reviewerResults[0]);
  });

  it('tags all findings with reviewerRole', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
    });
    for (const f of result.findings) {
      assert.ok(typeof f.reviewerRole === 'string', `finding ${f.id} missing reviewerRole`);
    }
  });

  it('assigns unique finding IDs across multiple reviewers', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner', 'test-gap'],
    });
    const ids = result.findings.map((f) => f.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'finding IDs must be unique');
  });

  it('returns classified findings object', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
    });
    assert.ok(result.classified, 'classified must be present');
    assert.ok(Array.isArray(result.classified.overview));
    assert.ok(Array.isArray(result.classified.suppressed));
    assert.ok(Array.isArray(result.classified.inlineCandidates));
  });

  it('uses DEFAULT_REVIEWERS when reviewers is not specified', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
    });
    const roles = result.reviewerResults.map((r) => r.role);
    assert.deepEqual(roles, DEFAULT_REVIEWERS);
  });

  it('rejects mixed valid and unknown explicit roles before review execution (#2363)', async () => {
    const generateReviewImpl = mock.fn(async () => {
      throw new Error('must not execute');
    });

    await assert.rejects(
      () =>
        runReviewerOrchestration({
          diff: makeDiff(),
          dryRun: true,
          reviewers: ['bug-hunter', 'security'],
          generateReviewImpl,
        }),
      /Unknown reviewer roles: \[security\].*security-scanner/
    );

    assert.equal(generateReviewImpl.mock.callCount(), 0, 'no valid subset may execute');
  });

  it('counts every valid explicit reviewer in Review Coverage (#2363)', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner'],
    });

    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.equal(result.reviewCoverage.completedUnits, 2);
    assert.equal(result.reviewCoverage.requiredUnits, 2);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 2);
    assert.deepEqual(
      result.reviewCoverage.units.map((unit) => unit.reviewerRole),
      ['bug-hunter', 'security-scanner']
    );
  });

  it('keeps duplicate valid explicit roles deduplicated in Review Coverage (#2363)', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter', 'bug-hunter', 'security-scanner'],
    });

    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.deepEqual(
      result.reviewCoverage.units.map((unit) => unit.reviewerRole),
      ['bug-hunter', 'security-scanner']
    );
  });

  it('returns comments array', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
    });
    assert.ok(Array.isArray(result.comments));
  });

  it('returns debug metadata', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner'],
    });
    assert.ok(typeof result.debug.succeededReviewers === 'number');
    assert.ok(typeof result.debug.failedReviewers === 'number');
    assert.ok(typeof result.debug.deduplicatedCount === 'number');
  });

  it('auto mode expands roles based on fileTypes', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['auto'],
      fileTypes: {
        test: ['foo.test.mjs'],
        app: ['src/foo.mjs'],
        config: [],
        schema: [],
        migration: [],
        infra: [],
      },
      riskAssessment: { humanReviewFiles: [], escalatedFiles: [] },
    });
    assert.ok(result.autoSelectedRoles !== null, 'autoSelectedRoles should be set in auto mode');
    assert.ok(result.autoSelectedRoles.includes('bug-hunter'));
    assert.ok(result.autoSelectedRoles.includes('test-gap'), 'test files → test-gap');
  });

  it('auto mode adds security-scanner for risky files', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['auto'],
      fileTypes: {
        test: [],
        app: [],
        config: ['config.json'],
        schema: [],
        migration: [],
        infra: [],
      },
      riskAssessment: { humanReviewFiles: ['config.json'], escalatedFiles: [] },
    });
    assert.ok(result.autoSelectedRoles.includes('security-scanner'));
  });
});

describe('selectRolesAuto', () => {
  it('always includes bug-hunter', () => {
    const roles = selectRolesAuto({}, null);
    assert.ok(roles.includes('bug-hunter'));
  });

  it('adds test-gap when test files are present', () => {
    const roles = selectRolesAuto(
      { test: ['foo.test.ts'], app: [], config: [], schema: [], migration: [], infra: [] },
      null
    );
    assert.ok(roles.includes('test-gap'));
  });

  it('adds test-gap when many app files changed', () => {
    const roles = selectRolesAuto(
      { test: [], app: ['a.ts', 'b.ts', 'c.ts'], config: [], schema: [], migration: [], infra: [] },
      null
    );
    assert.ok(roles.includes('test-gap'));
  });

  it('adds security-scanner for config/schema changes', () => {
    const roles = selectRolesAuto(
      { test: [], app: [], config: ['app.config.ts'], schema: [], migration: [], infra: [] },
      null
    );
    assert.ok(roles.includes('security-scanner'));
  });

  it('adds security-scanner for escalated risk files', () => {
    const roles = selectRolesAuto({}, { humanReviewFiles: [], escalatedFiles: ['auth.ts'] });
    assert.ok(roles.includes('security-scanner'));
  });

  it('returns only bug-hunter when no signals', () => {
    const roles = selectRolesAuto(
      { test: [], app: ['a.ts', 'b.ts'], config: [], schema: [], migration: [], infra: [] },
      { humanReviewFiles: [], escalatedFiles: [] }
    );
    assert.deepEqual(roles, ['bug-hunter']);
  });

  // #1196 S3: richer risk-based routing
  it('adds dependency-reviewer for package manifest / lockfile changes', () => {
    const roles = selectRolesAuto(
      {
        test: [],
        app: [],
        config: ['package.json', 'pnpm-lock.yaml'],
        schema: [],
        migration: [],
        infra: [],
      },
      null
    );
    assert.ok(roles.includes('dependency-reviewer'));
  });

  it('adds frontend-reviewer for UI/component/styling files', () => {
    const roles = selectRolesAuto(
      {
        test: [],
        app: ['src/components/Button.tsx', 'src/styles/app.css'],
        config: [],
        schema: [],
        migration: [],
        infra: [],
      },
      null
    );
    assert.ok(roles.includes('frontend-reviewer'));
  });

  it('adds ci-cd-reviewer for workflow changes', () => {
    const roles = selectRolesAuto(
      {
        test: [],
        app: [],
        config: [],
        schema: [],
        migration: [],
        infra: ['.github/workflows/test.yml'],
      },
      null
    );
    assert.ok(roles.includes('ci-cd-reviewer'));
  });

  it('does not add the new roles for unrelated changes', () => {
    const roles = selectRolesAuto(
      {
        test: [],
        app: ['src/lib/foo.ts'],
        config: ['app.config.ts'],
        schema: [],
        migration: [],
        infra: ['scripts/build.mjs'],
      },
      null
    );
    assert.ok(!roles.includes('dependency-reviewer'));
    assert.ok(!roles.includes('frontend-reviewer'));
    assert.ok(!roles.includes('ci-cd-reviewer'));
  });
});

// ---------------------------------------------------------------------------
// #1545 P1: formalized stage/risk/artifact routing signals for selectRolesAuto.
// New `signals` argument is optional and strictly additive.
// ---------------------------------------------------------------------------
describe('selectRolesAuto — formalized signals (#1545 P1)', () => {
  const emptyFileTypes = { test: [], app: [], config: [], schema: [], migration: [], infra: [] };
  const noRisk = { humanReviewFiles: [], escalatedFiles: [] };

  it('backward compat: omitting signals equals passing undefined', () => {
    const withArg = selectRolesAuto(emptyFileTypes, noRisk, undefined);
    const withoutArg = selectRolesAuto(emptyFileTypes, noRisk);
    assert.deepEqual(withArg, withoutArg);
    assert.deepEqual(withoutArg, ['bug-hunter']);
  });

  it('backward compat: empty signals object does not change selection', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, {});
    assert.deepEqual(roles, ['bug-hunter']);
  });

  it('signal touchesAuth adds security-scanner', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { touchesAuth: true });
    assert.ok(roles.includes('security-scanner'));
  });

  it('signal changesUi adds frontend-reviewer', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { changesUi: true });
    assert.ok(roles.includes('frontend-reviewer'));
  });

  it('signal deploymentChange adds ci-cd-reviewer', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { deploymentChange: true });
    assert.ok(roles.includes('ci-cd-reviewer'));
  });

  it('devex-only signals (changesPublicApi) map to no existing role', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, {
      changesPublicApi: true,
      changesCliInterface: true,
      changesInstallation: true,
    });
    assert.deepEqual(roles, ['bug-hunter']);
  });

  it('stage verify adds test-gap', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { stage: 'verify' });
    assert.ok(roles.includes('test-gap'));
  });

  it('stage plan adds security-scanner and test-gap', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { stage: 'plan' });
    assert.ok(roles.includes('security-scanner'));
    assert.ok(roles.includes('test-gap'));
  });

  it('unknown stage is ignored', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { stage: 'not-a-stage' });
    assert.deepEqual(roles, ['bug-hunter']);
  });

  it('signals are additive: never remove file-derived roles and always keep bug-hunter', () => {
    const roles = selectRolesAuto({ ...emptyFileTypes, test: ['a.test.ts'] }, noRisk, {
      changesUi: true,
    });
    assert.ok(roles.includes('bug-hunter'));
    assert.ok(roles.includes('test-gap'), 'file-derived test-gap preserved');
    assert.ok(roles.includes('frontend-reviewer'), 'signal-derived frontend added');
  });

  it('bug-hunter stays first in the selected order', () => {
    const roles = selectRolesAuto(emptyFileTypes, noRisk, { touchesAuth: true, changesUi: true });
    assert.equal(roles[0], 'bug-hunter');
  });
});

describe('resolveReviewerRoles — auto rationale (#1545 P1)', () => {
  it('auto mode returns autoSelection with reasons, required, and skipped', () => {
    const { valid, autoSelection } = resolveReviewerRoles(['auto'], {
      fileTypes: { test: [], app: [], config: [], schema: [], migration: [], infra: [] },
      riskAssessment: { humanReviewFiles: [], escalatedFiles: [] },
      signals: { touchesAuth: true },
    });
    assert.ok(valid.includes('security-scanner'));
    assert.ok(autoSelection, 'autoSelection present in auto mode');
    assert.deepEqual(autoSelection.required, ['bug-hunter']);
    assert.ok(autoSelection.reasons['bug-hunter'].includes('always-on'));
    assert.ok(autoSelection.reasons['security-scanner'].includes('signal:touchesAuth'));
    // test-gap was not selected → recorded as skipped
    assert.ok(autoSelection.skipped.includes('test-gap'));
  });

  it('explicit mode does not attach autoSelection', () => {
    const result = resolveReviewerRoles(['bug-hunter'], {});
    assert.equal(result.autoSelection, undefined);
  });
});

describe('runReviewerOrchestration — signal routing + rationale (#1545 P1)', () => {
  it('auto mode routes on signals and exposes autoSelection + selectionReasons', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['auto'],
      fileTypes: { test: [], app: [], config: [], schema: [], migration: [], infra: [] },
      riskAssessment: { humanReviewFiles: [], escalatedFiles: [] },
      signals: { touchesAuth: true },
    });
    assert.ok(result.autoSelectedRoles.includes('security-scanner'), 'signal routed to role');
    assert.ok(result.autoSelection, 'autoSelection present');
    assert.deepEqual(result.autoSelection.required, ['bug-hunter']);
    const sec = result.reviewerResults.find((r) => r.role === 'security-scanner');
    assert.ok(sec.selectionReasons.includes('signal:touchesAuth'));
  });

  it('explicit mode leaves autoSelection null and selectionReasons null', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
    });
    assert.equal(result.autoSelection, null);
    assert.equal(result.reviewerResults[0].selectionReasons, null);
  });
});

describe('splitDiffIntoChunks', () => {
  function makeFile(path, lines = 10) {
    return { path, hunks: [{ header: '@@ -1 +1 @@', lines: Array(lines).fill('+line') }] };
  }

  it('returns null for small diffs', () => {
    const diff = { files: [makeFile('src/a.ts'), makeFile('src/b.ts')] };
    assert.equal(splitDiffIntoChunks(diff), null);
  });

  it('splits large diffs into chunks', () => {
    // Use distinct top-level directories so grouping produces multiple chunks
    const dirs = ['api', 'ui', 'lib', 'tests', 'config'];
    const files = Array.from({ length: 15 }, (_, i) =>
      makeFile(`${dirs[i % dirs.length]}/file${i}.ts`, 20)
    );
    const diff = { files, filesForReview: files, diffText: '' };
    const chunks = splitDiffIntoChunks(diff);
    assert.ok(chunks !== null);
    assert.ok(chunks.length >= 2, `expected ≥2 chunks, got ${chunks?.length}`);
    // All files must appear in exactly one chunk
    const allPaths = chunks.flatMap((c) => c.files.map((f) => f.path));
    assert.equal(allPaths.length, files.length);
    assert.equal(new Set(allPaths).size, files.length, 'no duplicates');
  });

  it('chunks contain diffText', () => {
    const files = Array.from({ length: 12 }, (_, i) => makeFile(`pkg${i % 4}/f${i}.ts`, 60));
    const diff = { files, filesForReview: files, diffText: '' };
    const chunks = splitDiffIntoChunks(diff);
    assert.ok(chunks !== null);
    for (const chunk of chunks) {
      assert.ok(typeof chunk.diffText === 'string');
    }
  });
});

describe('deduplicateFindings', () => {
  function makeF(file, line, message) {
    return { file, lineStart: line, message, title: message };
  }

  it('keeps unique findings', () => {
    const findings = [makeF('a.ts', 1, 'bug A'), makeF('b.ts', 5, 'bug B')];
    assert.equal(deduplicateFindings(findings).length, 2);
  });

  it('removes exact duplicates', () => {
    const f = makeF('a.ts', 1, 'null dereference on line 1 of function foo bar');
    assert.equal(deduplicateFindings([f, { ...f }]).length, 1);
  });

  it('removes near-duplicates same file same line', () => {
    const f1 = makeF('a.ts', 10, 'null pointer dereference in handleRequest');
    const f2 = makeF('a.ts', 10, 'null pointer dereference in handleRequest func');
    assert.equal(deduplicateFindings([f1, f2]).length, 1);
  });

  it('keeps findings on different lines', () => {
    const f1 = makeF('a.ts', 10, 'null pointer');
    const f2 = makeF('a.ts', 50, 'null pointer');
    assert.equal(deduplicateFindings([f1, f2]).length, 2);
  });

  it('keeps findings on different files', () => {
    const f1 = makeF('a.ts', 10, 'null pointer dereference on handleRequest');
    const f2 = makeF('b.ts', 10, 'null pointer dereference on handleRequest');
    assert.equal(deduplicateFindings([f1, f2]).length, 2);
  });
});

describe('mergeFindings', () => {
  function makeF(file, line, message, severity = 'major', reviewerRole, evidence = []) {
    return { file, lineStart: line, message, title: message, severity, reviewerRole, evidence };
  }

  it('merges duplicate findings with max severity (major+critical → critical)', () => {
    const f1 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'major',
      'bug-hunter',
      ['line 10']
    );
    const f2 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'critical',
      'security-scanner',
      ['line 10 ctx']
    );
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, 'critical');
  });

  it('unions evidence arrays and deduplicates', () => {
    const f1 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'major',
      'bug-hunter',
      ['shared evidence', 'unique A']
    );
    const f2 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'major',
      'security-scanner',
      ['shared evidence', 'unique B']
    );
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    const ev = result[0].evidence;
    assert.ok(ev.includes('shared evidence'), 'shared evidence present');
    assert.ok(ev.includes('unique A'), 'unique A present');
    assert.ok(ev.includes('unique B'), 'unique B present');
    // shared evidence deduplicated: should appear once
    assert.equal(ev.filter((e) => e === 'shared evidence').length, 1);
  });

  it('agreement array contains both reviewer roles', () => {
    const f1 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'major',
      'bug-hunter',
      []
    );
    const f2 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'minor',
      'security-scanner',
      []
    );
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    assert.ok(result[0].agreement.includes('bug-hunter'));
    assert.ok(result[0].agreement.includes('security-scanner'));
  });

  it('non-duplicate findings pass through unchanged with agreement=[own role]', () => {
    const f1 = makeF('a.ts', 1, 'bug A', 'major', 'bug-hunter', ['ev1']);
    const f2 = makeF('b.ts', 5, 'bug B', 'minor', 'security-scanner', ['ev2']);
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 2);
    assert.equal(result[0].agreement.length, 1);
    assert.equal(result[0].agreement[0], 'bug-hunter');
    assert.equal(result[1].agreement[0], 'security-scanner');
  });

  it('preserves existing agreement on passthrough (single member with pre-existing agreement)', () => {
    const f = makeF('a.ts', 1, 'unique bug', 'major', 'bug-hunter', ['ev1']);
    const fWithAgreement = { ...f, agreement: ['prior-reviewer'] };
    const result = mergeFindings([fWithAgreement]);
    assert.equal(result.length, 1);
    assert.ok(result[0].agreement.includes('prior-reviewer'), 'prior-reviewer preserved');
    assert.ok(result[0].agreement.includes('bug-hunter'), 'own role added');
  });

  it('preserves existing agreement on multi-member merge', () => {
    const f1 = {
      ...makeF('a.ts', 10, 'null pointer dereference in handleRequest', 'major', 'bug-hunter', []),
      agreement: ['x'],
    };
    const f2 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'minor',
      'security-scanner',
      []
    );
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    assert.ok(result[0].agreement.includes('x'), 'pre-existing agreement x preserved');
    assert.ok(result[0].agreement.includes('bug-hunter'));
    assert.ok(result[0].agreement.includes('security-scanner'));
  });

  it('does not throw when evidence is null', () => {
    const f = {
      file: 'a.ts',
      lineStart: 1,
      message: 'bug',
      title: 'bug',
      severity: 'major',
      reviewerRole: 'bug-hunter',
      evidence: null,
    };
    assert.doesNotThrow(() => mergeFindings([f]));
    const result = mergeFindings([f]);
    assert.ok(
      Array.isArray(result[0].evidence) ||
        result[0].evidence === undefined ||
        result[0].evidence === null
    );
  });

  it('does not throw when agreement is null on passthrough', () => {
    const f = {
      file: 'a.ts',
      lineStart: 1,
      message: 'bug',
      title: 'bug',
      severity: 'major',
      reviewerRole: 'bug-hunter',
      evidence: [],
      agreement: null,
    };
    assert.doesNotThrow(() => mergeFindings([f]));
    const result = mergeFindings([f]);
    assert.ok(Array.isArray(result[0].agreement));
    assert.ok(result[0].agreement.includes('bug-hunter'));
  });

  it('normalizes severity in single-finding passthrough (blocker → critical)', () => {
    const f = makeF('a.ts', 1, 'null deref', 'blocker', 'bug-hunter', []);
    const result = mergeFindings([f]);
    assert.equal(result.length, 1);
    assert.equal(
      result[0].severity,
      'critical',
      'blocker must normalize to critical on passthrough'
    );
  });

  it('does not throw when evidence/agreement are null on multi-member merge', () => {
    const f1 = {
      file: 'a.ts',
      lineStart: 10,
      message: 'null pointer dereference in handleRequest',
      title: 'null pointer dereference in handleRequest',
      severity: 'major',
      reviewerRole: 'bug-hunter',
      evidence: null,
      agreement: null,
    };
    const f2 = {
      file: 'a.ts',
      lineStart: 10,
      message: 'null pointer dereference in handleRequest',
      title: 'null pointer dereference in handleRequest',
      severity: 'minor',
      reviewerRole: 'security-scanner',
      evidence: null,
      agreement: null,
    };
    assert.doesNotThrow(() => mergeFindings([f1, f2]));
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    assert.ok(Array.isArray(result[0].agreement));
    assert.ok(result[0].agreement.includes('bug-hunter'));
    assert.ok(result[0].agreement.includes('security-scanner'));
  });

  it('preserves existing fields on merged finding (backward compat)', () => {
    const f1 = {
      ...makeF('a.ts', 10, 'null pointer dereference in handleRequest', 'major', 'bug-hunter', []),
      id: 'rr-1',
      ruleId: 'some-rule',
      title: 'Null pointer',
      phase: 'midstream',
      confidence: 'high',
    };
    const f2 = makeF(
      'a.ts',
      10,
      'null pointer dereference in handleRequest',
      'major',
      'security-scanner',
      []
    );
    const result = mergeFindings([f1, f2]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'rr-1');
    assert.equal(result[0].ruleId, 'some-rule');
    assert.equal(result[0].phase, 'midstream');
    assert.equal(result[0].confidence, 'high');
    assert.equal(result[0].file, 'a.ts');
    assert.equal(result[0].message, 'null pointer dereference in handleRequest');
  });
});

// ---------------------------------------------------------------------------
// Adversarial tests for connected-components mergeFindings + maxSeverity F4
// ---------------------------------------------------------------------------
describe('mergeFindings adversarial (connected-components)', () => {
  // Helper: minimal finding shape
  function mkF(file, line, message, severity = 'major', role = 'bug-hunter', evidence = []) {
    return {
      file,
      lineStart: line,
      message,
      title: message,
      severity,
      reviewerRole: role,
      evidence,
    };
  }

  // ADV-1: A–B–C chain: A overlaps B, B overlaps C, but A does NOT directly overlap C.
  // All three must land in ONE cluster.
  it('ADV-1: A-B-C chain collapses to one cluster (transitivity)', () => {
    // A and B differ by editDistance ≤ 10 (8 chars different)
    const fA = mkF('src/auth.ts', 10, 'null pointer dereference in handleRequ');
    // B and C differ by editDistance ≤ 10 (9 chars different)
    const fB = mkF('src/auth.ts', 10, 'null pointer dereference in handleRequ_ext');
    // A and C differ by editDistance > 10 (direct overlap would fail), but transitively linked via B
    const fC = mkF('src/auth.ts', 10, 'null pointer dereference in handleRequ_ext_v2');
    // Verify the chain assumptions: A-B overlap, B-C overlap, A-C MAY or MAY NOT overlap directly
    assert.ok(findingsOverlap(fA, fB), 'A-B should overlap');
    assert.ok(findingsOverlap(fB, fC), 'B-C should overlap');
    // The key assertion: all three merge into one output finding
    const result = mergeFindings([fA, fB, fC]);
    assert.equal(result.length, 1, 'A-B-C chain must produce 1 cluster');
  });

  // ADV-2: Two distinct bugs with similar-length messages but content is different enough
  // (editDistance > 10) must NOT be merged.
  it('ADV-2: distinct bugs with dissimilar messages are not merged', () => {
    const fA = mkF('src/foo.ts', 10, 'SQL injection vulnerability in query builder execute');
    const fB = mkF('src/foo.ts', 10, 'null pointer dereference in handleRequest dispatch');
    // Must be kept separate
    const result = mergeFindings([fA, fB]);
    assert.equal(result.length, 2, 'distinct bugs must not be merged');
  });

  // ADV-3: Line-boundary — line shift of exactly ±2 is within threshold (overlap),
  // shift of ±3 is outside (no overlap).
  it('ADV-3: line shift ±2 merges; ±3 does not', () => {
    const base = mkF('src/foo.ts', 10, 'null pointer dereference in handleRequest');
    const atTwo = mkF('src/foo.ts', 12, 'null pointer dereference in handleRequest');
    const atThree = mkF('src/foo.ts', 13, 'null pointer dereference in handleRequest');

    assert.equal(mergeFindings([base, atTwo]).length, 1, 'shift=2 must merge');
    assert.equal(mergeFindings([base, atThree]).length, 2, 'shift=3 must not merge');
  });

  // ADV-4: Message drift at the editDistance boundary.
  // A message that is exactly 10 edits away merges; 11 edits does not.
  it('ADV-4: editDistance 10 merges, 11 does not', () => {
    const base = mkF('src/foo.ts', 10, 'null pointer deref in foo bar baz qux');
    // 10 substitutions at the end → within threshold
    const at10 = mkF('src/foo.ts', 10, 'null pointer deref in foo bar baz 1234567890');
    // 11 substitutions → over threshold (replace last 11 chars distinctly)
    const at11 = mkF('src/foo.ts', 10, 'null pointer deref in foo bar 12345678901');

    const r10 = mergeFindings([base, at10]);
    const r11 = mergeFindings([base, at11]);
    // The threshold is ≤10 → editDistance=10 merges, editDistance=11 does not
    assert.equal(r10.length, 1, 'editDistance=10 must merge');
    assert.equal(r11.length, 2, 'editDistance=11 must not merge');
  });

  // ADV-5: Severity normalization — 'blocker' (internal LLM vocab) must normalize to
  // 'critical' and win over 'warning' (→ 'major').
  it('ADV-5: blocker+warning mix → critical (F4 normalization)', () => {
    const fA = mkF(
      'src/foo.ts',
      10,
      'null pointer dereference in handleRequest',
      'blocker',
      'bug-hunter'
    );
    const fB = mkF(
      'src/foo.ts',
      10,
      'null pointer dereference in handleRequest',
      'warning',
      'security-scanner'
    );
    const result = mergeFindings([fA, fB]);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, 'critical', 'blocker must normalize to critical and win');
  });

  // ADV-6: Idempotency — merging the output of mergeFindings again must produce the
  // same count and severity (no double-merging or count drift).
  it('ADV-6: mergeFindings is idempotent (second pass identical to first)', () => {
    const findings = [
      mkF('src/a.ts', 10, 'null pointer dereference in handleRequest', 'major', 'bug-hunter', [
        'ev1',
      ]),
      mkF(
        'src/a.ts',
        10,
        'null pointer dereference in handleRequest',
        'critical',
        'security-scanner',
        ['ev2']
      ),
      mkF(
        'src/b.ts',
        5,
        'sql injection in query builder execute method',
        'minor',
        'security-scanner',
        ['ev3']
      ),
    ];
    const pass1 = mergeFindings(findings);
    const pass2 = mergeFindings(pass1);
    assert.equal(pass1.length, pass2.length, 'second pass must not change finding count');
    for (let i = 0; i < pass1.length; i++) {
      assert.equal(pass1[i].severity, pass2[i].severity, `severity must be stable at index ${i}`);
      assert.deepEqual(
        pass1[i].agreement,
        pass2[i].agreement,
        `agreement must be stable at index ${i}`
      );
    }
  });
});

// --- #1689: progress output + per-role timeout ---------------------------
//
// The orchestrator's fan-out had no observability: a role that never returned
// left the run silent and unbounded. These tests pin the three contract points
// from the issue — fail-soft timeout, unchanged default behavior, and the
// stdout/stderr split.

/** Minimal generateReview() return shape (mirrors review-engine.mjs output). */
function makeRoleResult(file) {
  return {
    comments: [{ file, line: 1, message: 'Finding: issue Evidence: seen in diff' }],
    findings: [
      {
        id: 'stub-1',
        ruleId: 'some-rule',
        file,
        lineStart: 1,
        lineEnd: 1,
        title: 'test finding',
        message: 'Finding: issue Evidence: seen in diff Impact: medium Fix: fix it',
        severity: 'major',
        confidence: 'high',
        status: 'open',
        evidence: ['found in diff with enough characters to pass the threshold here'],
      },
    ],
    classified: { overview: [], suppressed: [], inlineCandidates: [] },
    prompt: 'prompt text',
    promptTruncated: false,
    llmModel: 'stub-model',
    debug: {},
  };
}

/** Route by the role's focusInstructions prefix — roleRules starts with it. */
function isRole(projectRules, roleName) {
  return String(projectRules ?? '').startsWith(REVIEWER_ROLES[roleName].focusInstructions);
}

describe('runReviewerOrchestration progress and per-role timeout (#1689)', () => {
  const roles = ['bug-hunter', 'security-scanner'];
  // Every orchestration test passes an explicit `env` so a RIVER_REVIEWER_TIMEOUT
  // left in the developer's shell cannot change the outcome (#1689 review N4).
  const noEnv = {};

  it('times out the slow role only and keeps the other roles findings', async () => {
    const lines = [];
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: roles,
      timeoutMs: 20,
      env: noEnv,
      progressSink: (line) => lines.push(line),
      // security-scanner never settles; bug-hunter returns immediately.
      generateReviewImpl: ({ projectRules }) =>
        isRole(projectRules, 'security-scanner')
          ? new Promise(() => {})
          : Promise.resolve(makeRoleResult('src/foo.mjs')),
    });

    // The surviving role's findings are intact.
    assert.equal(result.findings.length, 1, 'the fast role finding must survive');
    assert.equal(result.findings[0].reviewerRole, 'bug-hunter');

    const byRole = Object.fromEntries(result.reviewerResults.map((r) => [r.role, r]));
    assert.equal(byRole['bug-hunter'].status, 'fulfilled');
    assert.equal(byRole['bug-hunter'].timedOut, false);
    assert.equal(byRole['security-scanner'].status, 'rejected');
    assert.equal(byRole['security-scanner'].timedOut, true);
    assert.match(byRole['security-scanner'].error, /timed out after 20ms/);

    // The timeout is recorded in the machine-readable result, not only on stderr.
    assert.equal(result.debug.timeoutMs, 20);
    assert.deepEqual(result.debug.timedOutRoles, ['security-scanner']);
    assert.equal(result.debug.failedReviewers, 1);
    assert.equal(result.debug.succeededReviewers, 1);
    assert.equal(typeof result.debug.durationMs, 'number');

    // …and on stderr.
    const output = lines.join('\n');
    assert.match(output, /Reviewer security-scanner: timeout after/);
    assert.match(output, /Reviewer bug-hunter: done in .* \(1 findings\)/);
    assert.match(output, /Reviewers: 1\/2 roles succeeded, 1 failed/);
    assert.match(output, /\(timed out: security-scanner\)/);
  });

  it('does not abort a slow role when no timeout is configured (default)', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: roles,
      progress: false,
      env: noEnv,
      // Slower than any timeout used above, yet must still be awaited to completion.
      generateReviewImpl: ({ projectRules }) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(makeRoleResult(isRole(projectRules, 'bug-hunter') ? 'a.mjs' : 'b.mjs')),
            40
          )
        ),
    });

    assert.equal(result.debug.timeoutMs, null, 'timeout must be disabled by default');
    assert.deepEqual(result.debug.timedOutRoles, []);
    assert.equal(result.debug.failedReviewers, 0);
    assert.equal(result.findings.length, 2, 'both roles must contribute findings');
    for (const r of result.reviewerResults) {
      assert.equal(r.status, 'fulfilled');
      assert.equal(r.timedOut, false);
    }
  });

  // #1689 review B1: 2^31 ms overflows setTimeout's 32-bit delay and Node
  // CLAMPS it to 1 ms, so an over-large limit used to time out every role
  // instantly and hand back a zero-finding "clean" run.
  for (const bad of ['2147483648', '0.5', '1e10', '-1', 'abc']) {
    it(`ignores the out-of-range env timeout ${bad} with a warning`, async () => {
      const lines = [];
      const result = await runReviewerOrchestration({
        diff: makeDiff(),
        dryRun: true,
        reviewers: ['bug-hunter'],
        env: { [REVIEWER_TIMEOUT_ENV]: bad },
        progressSink: (line) => lines.push(line),
        generateReviewImpl: () => Promise.resolve(makeRoleResult('src/foo.mjs')),
      });
      assert.equal(result.debug.timeoutMs, null, `${bad} must not become an active timeout`);
      assert.deepEqual(result.debug.timedOutRoles, [], `${bad} must not cut any role off`);
      assert.equal(result.findings.length, 1, 'the role must still produce its findings');
      const warnings = lines.filter((l) => l.startsWith('Warning:'));
      assert.equal(warnings.length, 1, 'exactly one warning line');
      assert.match(warnings[0], new RegExp(`${REVIEWER_TIMEOUT_ENV}=`));
      assert.match(warnings[0], /positive integer of at most 3600000 ms/);
    });
  }

  // env → orchestrator wiring: a VALID env value must actually take effect.
  it('applies a valid RIVER_REVIEWER_TIMEOUT from the injected env', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
      env: { [REVIEWER_TIMEOUT_ENV]: '20' },
      progress: false,
      generateReviewImpl: () => new Promise(() => {}),
    });
    assert.equal(result.debug.timeoutMs, 20);
    assert.deepEqual(result.debug.timedOutRoles, ['bug-hunter']);
  });

  // config → orchestrator wiring for both knobs.
  it('applies review.orchestrator.timeoutMs and progress from config', async () => {
    const lines = [];
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
      env: noEnv,
      config: { review: { orchestrator: { timeoutMs: 20, progress: false } } },
      progressSink: (line) => lines.push(line),
      generateReviewImpl: () => new Promise(() => {}),
    });
    assert.equal(result.debug.timeoutMs, 20);
    assert.deepEqual(result.debug.timedOutRoles, ['bug-hunter']);
    assert.deepEqual(lines, [], 'config progress:false must silence the progress lines');
  });

  // Chunked fan-out: one chunk of a role times out, the other survives. The
  // role stays 'fulfilled' (its findings are kept) while still being flagged.
  it('keeps a role fulfilled when only one of its chunks times out', async () => {
    // 12 files across two directories exceeds SPLIT_FILE_THRESHOLD, so
    // splitDiffIntoChunks produces more than one chunk.
    const files = Array.from({ length: 12 }, (_, i) => ({
      path: `${i < 6 ? 'alpha' : 'beta'}/f${i}.mjs`,
      hunks: [{ lines: ['+a'] }],
    }));
    const diff = { diffText: 'd', files, filesForReview: files };
    let call = 0;
    const result = await runReviewerOrchestration({
      diff,
      dryRun: true,
      reviewers: ['bug-hunter'],
      timeoutMs: 20,
      env: noEnv,
      progress: false,
      // First chunk hangs, later chunks return.
      generateReviewImpl: () =>
        call++ === 0 ? new Promise(() => {}) : Promise.resolve(makeRoleResult('alpha/f1.mjs')),
    });

    assert.ok(result.chunked, 'the diff must actually be chunked for this test to mean anything');
    assert.ok(result.chunkCount > 1);
    const role = result.reviewerResults[0];
    assert.equal(role.status, 'fulfilled', 'surviving chunks keep the role fulfilled');
    assert.equal(role.timedOut, true, 'the cut-off chunk must still be recorded');
    assert.deepEqual(result.debug.timedOutRoles, ['bug-hunter']);
    assert.ok(result.findings.length > 0, 'the surviving chunk findings must be kept');
  });

  it('writes progress to stderr only, never to stdout', async () => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (chunk, ...rest) => {
      stdoutChunks.push(String(chunk));
      return originalStdoutWrite(chunk, ...rest);
    };
    process.stderr.write = (chunk) => {
      stderrChunks.push(String(chunk));
      return true; // swallow: keep the progress lines out of the test report
    };
    try {
      await runReviewerOrchestration({
        diff: makeDiff(),
        dryRun: true,
        reviewers: ['bug-hunter'],
        // No progressSink → exercise the real default console.error path.
        generateReviewImpl: () => Promise.resolve(makeRoleResult('src/foo.mjs')),
      });
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert.ok(
      !stdoutChunks.join('').includes('Reviewer '),
      'progress output must never reach stdout (it carries the review artifact)'
    );
    assert.match(stderrChunks.join(''), /Reviewer bug-hunter: start/);
  });

  it('suppresses progress when quiet is set', async () => {
    const lines = [];
    await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
      quiet: true,
      env: noEnv,
      progressSink: (line) => lines.push(line),
      generateReviewImpl: () => Promise.resolve(makeRoleResult('src/foo.mjs')),
    });
    assert.deepEqual(lines, [], '--quiet must silence every progress line');
  });

  // A misconfigured limit is a correctness problem, not chatter: --quiet must
  // not hide it, or the operator never learns their timeout is inert.
  it('still warns about an invalid timeout under quiet', async () => {
    const lines = [];
    await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
      quiet: true,
      env: { [REVIEWER_TIMEOUT_ENV]: '2147483648' },
      progressSink: (line) => lines.push(line),
      generateReviewImpl: () => Promise.resolve(makeRoleResult('src/foo.mjs')),
    });
    assert.equal(lines.length, 1, 'only the warning, no progress lines');
    assert.match(lines[0], /^Warning: RIVER_REVIEWER_TIMEOUT=2147483648/);
  });

  it('propagates a real role failure unchanged (not reported as a timeout)', async () => {
    const result = await runReviewerOrchestration({
      diff: makeDiff(),
      dryRun: true,
      reviewers: ['bug-hunter'],
      timeoutMs: 1000,
      progress: false,
      env: noEnv,
      generateReviewImpl: () => Promise.reject(new Error('boom')),
    });
    assert.equal(result.reviewerResults[0].status, 'rejected');
    assert.equal(result.reviewerResults[0].timedOut, false);
    assert.equal(result.reviewerResults[0].error, 'boom');
    assert.deepEqual(result.debug.timedOutRoles, []);
  });
});

describe('resolveReviewerTimeoutMs (#1689)', () => {
  it('returns null when nothing is configured (unlimited by default)', () => {
    assert.equal(resolveReviewerTimeoutMs({ env: {} }), null);
    assert.equal(resolveReviewerTimeoutMs({ config: {}, env: {} }), null);
  });

  it('reads the config path review.orchestrator.timeoutMs', () => {
    const config = { review: { orchestrator: { timeoutMs: 5000 } } };
    assert.equal(resolveReviewerTimeoutMs({ config, env: {} }), 5000);
  });

  it('lets the env var override config, and the explicit argument override both', () => {
    const config = { review: { orchestrator: { timeoutMs: 5000 } } };
    const env = { [REVIEWER_TIMEOUT_ENV]: '1500' };
    assert.equal(resolveReviewerTimeoutMs({ config, env }), 1500);
    assert.equal(resolveReviewerTimeoutMs({ timeoutMs: 250, config, env }), 250);
  });

  it('ignores unusable values, warns once each, and falls through', () => {
    const config = { review: { orchestrator: { timeoutMs: 5000 } } };
    const warned = [];
    const warn = (line) => warned.push(line);
    for (const bad of ['abc', '0', '-1', '0.5', '2147483648', '1e10', String(3_600_001)]) {
      warned.length = 0;
      assert.equal(
        resolveReviewerTimeoutMs({ config, env: { [REVIEWER_TIMEOUT_ENV]: bad }, warn }),
        5000,
        `${bad} must fall through to the config value`
      );
      assert.equal(warned.length, 1, `${bad} must emit exactly one warning`);
    }
    // With no other source the result is "unlimited", never a clamped value.
    warned.length = 0;
    assert.equal(
      resolveReviewerTimeoutMs({ env: { [REVIEWER_TIMEOUT_ENV]: '2147483648' }, warn }),
      null
    );
    assert.equal(warned.length, 1);
  });

  it('accepts the boundary value and rejects one past it', () => {
    const warn = () => {};
    assert.equal(
      resolveReviewerTimeoutMs({ env: { [REVIEWER_TIMEOUT_ENV]: '3600000' }, warn }),
      3_600_000
    );
    assert.equal(
      resolveReviewerTimeoutMs({ env: { [REVIEWER_TIMEOUT_ENV]: '3600001' }, warn }),
      null
    );
    assert.equal(REVIEWER_TIMEOUT_MAX_MS, 3_600_000);
  });

  it('rejects an unusable explicit argument too, not just env', () => {
    const warned = [];
    assert.equal(
      resolveReviewerTimeoutMs({ timeoutMs: 2147483648, env: {}, warn: (l) => warned.push(l) }),
      null
    );
    assert.equal(warned.length, 1);
  });
});

describe('resolveReviewerProgressEnabled (#1689)', () => {
  it('is enabled by default', () => {
    assert.equal(resolveReviewerProgressEnabled(), true);
    assert.equal(resolveReviewerProgressEnabled({ config: {} }), true);
  });

  it('is disabled by config, by the explicit argument, and always by quiet', () => {
    assert.equal(
      resolveReviewerProgressEnabled({ config: { review: { orchestrator: { progress: false } } } }),
      false
    );
    assert.equal(resolveReviewerProgressEnabled({ progress: false }), false);
    assert.equal(
      resolveReviewerProgressEnabled({
        quiet: true,
        progress: true,
        config: { review: { orchestrator: { progress: true } } },
      }),
      false,
      'quiet must win over every other source'
    );
  });
});

describe('ReviewerTimeoutError (#1689)', () => {
  it('carries the role, the limit, and the timedOut marker', () => {
    const err = new ReviewerTimeoutError('bug-hunter', 1234);
    assert.equal(err.name, 'ReviewerTimeoutError');
    assert.equal(err.role, 'bug-hunter');
    assert.equal(err.timeoutMs, 1234);
    assert.equal(err.timedOut, true);
    assert.match(err.message, /Reviewer role "bug-hunter" timed out after 1234ms/);
  });
});
