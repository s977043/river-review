// Canary for #1599: fileURLToPath(new URL(...)) resolved schemas/output.schema.json
// correctly when render.mjs ran from source, but ncc rewrote the expression into a
// plain-path string in the built dist bundle, so fileURLToPath threw
// `TypeError [ERR_INVALID_URL]: Invalid URL` and getOutputSchemaValidator()
// silently fell back to null — disabling output schema validation on every
// dist (GitHub Action) run without any test catching it. This test asserts the
// source-level contract directly: the validator must load successfully.
// A companion dist smoke test (tests/integration/dist-schema-smoke.test.mjs,
// gated on the built bundle) covers the ncc-bundled path this test cannot see.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatJsonOutput,
  getOutputSchemaValidator,
  printMarkdownReport,
} from '../src/cli/render.mjs';
import { mergeFindings } from '../src/lib/reviewer-orchestrator.mjs';
import { synthesizeTeamLeadReport } from '../src/lib/team-lead-synthesizer.mjs';

/**
 * Run `fn` with console.error captured. validateOutputArtifact reports schema
 * violations to stderr and never throws, so the only way to assert "no schema
 * warning" is to watch that channel.
 */
function captureStderr(fn) {
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  try {
    return { value: fn(), lines };
  } finally {
    console.error = originalError;
  }
}

describe('getOutputSchemaValidator', () => {
  it('loads schemas/output.schema.json and returns a compiled validator', () => {
    const validate = getOutputSchemaValidator();
    assert.notStrictEqual(validate, null, 'expected output.schema.json to load successfully');
    assert.strictEqual(typeof validate, 'function');
  });
});

// #1644 Phase 1: the JSON artifact is what output.schema.json governs, so a
// schema field that never reaches formatJsonOutput would be unobservable.
describe('formatJsonOutput scope propagation', () => {
  const baseFinding = {
    id: 'rr-1',
    ruleId: 'security-basic',
    title: 'token',
    message: 'Finding: token Evidence: x Severity: warning Confidence: high Fix: rotate the token',
    severity: 'major',
    confidence: 'high',
    status: 'open',
    evidence: ['x'],
    file: 'src/app.mjs',
    lineStart: 3,
    lineEnd: 3,
  };

  it('emits scope on the issue when the finding carries one', () => {
    const out = formatJsonOutput(
      { findings: [{ ...baseFinding, scope: 'pre-existing' }] },
      'midstream'
    );
    assert.strictEqual(out.issues[0].scope, 'pre-existing');
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });

  it('omits scope when the finding has none (back-compat)', () => {
    const out = formatJsonOutput({ findings: [baseFinding] }, 'midstream');
    assert.ok(!('scope' in out.issues[0]));
  });
});

// #1666 (#1545 Phase 2): same reachability contract as scope — the traceability
// refs must reach the JSON artifact, and must stay absent when unset so every
// pre-#1666 output still validates unchanged.
describe('formatJsonOutput traceability refs propagation', () => {
  const baseFinding = {
    id: 'rr-1',
    ruleId: 'requirements-acceptance',
    title: 'acceptance criterion is untestable',
    message:
      'Finding: AC-4 is untestable Evidence: x Severity: warning Confidence: high Fix: define the observable outcome',
    severity: 'major',
    confidence: 'high',
    status: 'open',
    evidence: ['x'],
    file: 'docs/prd.md',
    lineStart: 42,
    lineEnd: 42,
  };

  it('emits criterionRefs / artifactRefs and still validates against the schema', () => {
    const out = formatJsonOutput(
      {
        findings: [
          {
            ...baseFinding,
            criterionRefs: ['AC-4', 'TC-7'],
            artifactRefs: ['plan.md#AC-4', 'todo.md#TASK-3'],
          },
        ],
      },
      'upstream'
    );
    assert.deepStrictEqual(out.issues[0].criterionRefs, ['AC-4', 'TC-7']);
    assert.deepStrictEqual(out.issues[0].artifactRefs, ['plan.md#AC-4', 'todo.md#TASK-3']);
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });

  it('omits both fields when the finding has none (back-compat)', () => {
    const out = formatJsonOutput({ findings: [baseFinding] }, 'upstream');
    assert.ok(!('criterionRefs' in out.issues[0]));
    assert.ok(!('artifactRefs' in out.issues[0]));
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });

  it('omits both fields for null and empty-array values', () => {
    const out = formatJsonOutput(
      { findings: [{ ...baseFinding, criterionRefs: null, artifactRefs: [] }] },
      'upstream'
    );
    assert.ok(!('criterionRefs' in out.issues[0]), 'null must not be serialized');
    assert.ok(!('artifactRefs' in out.issues[0]), 'an empty array must not be serialized');
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });

  it('breaks the reserved labels onto their own markdown bullet (F10)', () => {
    // The local label list in formatMessageForMarkdown had drifted from the
    // parser's: Suggestion, Scope and the refs labels ran into the field before
    // them. It now imports the shared RESERVED_FINDING_LABELS set.
    const lines = [];
    const originalLog = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      printMarkdownReport(
        {
          comments: [
            {
              file: 'src/app.mjs',
              line: 3,
              message:
                'Finding: x Evidence: y Suggestion: rotate it Scope: in-diff CriterionRefs: AC-4 ArtifactRefs: plan.md#AC-4 Severity: warning Confidence: high',
            },
          ],
          plan: { selected: [], skipped: [] },
          changedFiles: ['src/app.mjs'],
          tokenEstimate: 10,
        },
        'midstream'
      );
    } finally {
      console.log = originalLog;
    }
    const output = lines.join('\n');
    for (const label of ['Suggestion', 'Scope', 'CriterionRefs', 'ArtifactRefs']) {
      assert.ok(output.includes(`- **${label}:**`), `${label} should get its own bullet`);
    }
  });

  it('omits a non-array refs value instead of emitting it (F11)', () => {
    // A truthy `.length` on a string slipped past the first guard and emitted
    // `criterionRefs: "AC-4"`, which the schema rejects.
    const out = formatJsonOutput(
      { findings: [{ ...baseFinding, criterionRefs: 'AC-4', artifactRefs: { a: 1 } }] },
      'upstream'
    );
    assert.ok(!('criterionRefs' in out.issues[0]), 'a string must not be serialized');
    assert.ok(!('artifactRefs' in out.issues[0]), 'an object must not be serialized');
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });
});

// #1689 review B3: the per-role timeout was recorded only on objects this
// formatter drops (`reviewerResults` / `debug`), so from the CLI a role that
// never returned looked exactly like a role that found nothing. The docs
// claimed the opposite — this pins the claim to the artifact.
describe('formatJsonOutput timedOutRoles (#1689)', () => {
  const baseResult = {
    status: 'ok',
    dryRun: false,
    findings: [],
    changedFiles: ['src/app.mjs'],
    plan: {},
    config: {},
  };

  it('emits the timed-out role names at the top level', () => {
    const out = formatJsonOutput(
      {
        ...baseResult,
        reviewerResults: [
          { role: 'bug-hunter', status: 'fulfilled', timedOut: false },
          { role: 'security-scanner', status: 'rejected', timedOut: true },
        ],
      },
      'midstream'
    );
    assert.deepEqual(out.timedOutRoles, ['security-scanner']);
  });

  it('omits the key entirely when no role timed out', () => {
    for (const reviewerResults of [
      null,
      undefined,
      [],
      [{ role: 'bug-hunter', status: 'fulfilled', timedOut: false }],
    ]) {
      const out = formatJsonOutput({ ...baseResult, reviewerResults }, 'midstream');
      assert.ok(
        !('timedOutRoles' in out),
        `absent for reviewerResults=${JSON.stringify(reviewerResults)}`
      );
    }
  });

  it('the emitted artifact conforms to output.schema.json', () => {
    const out = formatJsonOutput(
      {
        ...baseResult,
        reviewerResults: [{ role: 'bug-hunter', status: 'rejected', timedOut: true }],
      },
      'midstream'
    );
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });
});

// #1700: every `--reviewers` run printed `Warning: JSON output does not conform
// to schemas/output.schema.json` because formatJsonOutput emits three
// properties the schema never declared (teamLeadReport at the top level,
// consensusLevel and reviewerRole on each issue) while the schema is
// additionalProperties: false. The validator only warns, so the violation was
// permanent stderr noise rather than a failure. The report is built through the
// production path (mergeFindings -> synthesizeTeamLeadReport) instead of being
// hand-written, so the schema is pinned to what the synthesizer really emits.
describe('formatJsonOutput teamLeadReport (#1700)', () => {
  function makeRawFinding(overrides) {
    return {
      ruleId: 'security-basic',
      file: 'src/app.mjs',
      lineStart: 12,
      lineEnd: 12,
      title: 'token is read straight from the environment',
      message:
        'Finding: token is read straight from the environment Evidence: const token = process.env.SECRET Impact: leaks on log Severity: warning Confidence: high Fix: read it through the config loader',
      severity: 'warning',
      confidence: 'high',
      status: 'open',
      evidence: ['const token = process.env.SECRET'],
      suggestion: 'read it through the config loader',
      scope: 'in-diff',
      criterionRefs: null,
      artifactRefs: null,
      chunkLabel: null,
      ...overrides,
    };
  }

  /** Mirrors runReviewerOrchestration: merge across roles, then assign stable ids. */
  function buildReviewerRunResult() {
    const merged = mergeFindings([
      makeRawFinding({
        reviewerRole: 'bug-hunter',
        sourceExecutionIds: ['exec-bug-hunter'],
      }),
      // Same file and line: mergeFindings clusters it, so this finding ends up
      // with agreement.length 2 -> consensusLevel 'multi'.
      makeRawFinding({
        reviewerRole: 'security-scanner',
        sourceExecutionIds: ['exec-security-scanner'],
      }),
      makeRawFinding({
        reviewerRole: 'bug-hunter',
        ruleId: 'logic-guard',
        file: 'src/parse.mjs',
        lineStart: 40,
        lineEnd: 41,
        title: 'missing guard clause',
        message:
          'Finding: missing guard clause Evidence: rows[0] is read before the length check Impact: throws on empty input Severity: nit Confidence: medium Fix: return early when rows is empty',
        severity: 'nit',
        confidence: 'medium',
        evidence: ['rows[0] is read before the length check'],
        suggestion: 'return early when rows is empty',
        scope: 'pre-existing',
        criterionRefs: ['AC-4'],
        artifactRefs: ['plan.md#AC-4'],
      }),
    ]).map((f, i) => ({ ...f, id: `rr-${i + 1}` }));

    const reviewerResults = [
      { role: 'bug-hunter', label: 'Bug Hunter', status: 'fulfilled', timedOut: false },
      { role: 'security-scanner', label: 'Security Scanner', status: 'fulfilled', timedOut: false },
    ];

    return {
      status: 'ok',
      dryRun: false,
      findings: merged,
      changedFiles: ['src/app.mjs', 'src/parse.mjs'],
      plan: {},
      config: {},
      reviewerResults,
      teamLeadReport: synthesizeTeamLeadReport({ findings: merged, reviewerResults }),
    };
  }

  it('emits no schema warning for a --reviewers run', () => {
    const { value: out, lines } = captureStderr(() =>
      formatJsonOutput(buildReviewerRunResult(), 'midstream')
    );
    assert.deepStrictEqual(lines, [], `expected no stderr output, got:\n${lines.join('\n')}`);
    const validate = getOutputSchemaValidator();
    assert.ok(validate(out), JSON.stringify(validate.errors));
  });

  it('carries the fields whose absence would make the no-warning assertion vacuous', () => {
    const out = formatJsonOutput(buildReviewerRunResult(), 'midstream');
    assert.deepStrictEqual(Object.keys(out.teamLeadReport).sort(), [
      'blindSpots',
      'consensusSummary',
      'top3Findings',
    ]);
    assert.strictEqual(out.teamLeadReport.top3Findings[0].consensusLevel, 'multi');
    assert.deepStrictEqual(out.teamLeadReport.consensusSummary, {
      consensus: 0,
      multi: 1,
      single: 1,
      total: 2,
    });
    // The four roles that did not run must surface as blind spots.
    assert.deepStrictEqual(
      out.teamLeadReport.blindSpots.map((b) => b.role),
      ['test-gap', 'dependency-reviewer', 'frontend-reviewer', 'ci-cd-reviewer']
    );
    // The other two properties #1700 had to declare live on the issues.
    assert.strictEqual(out.issues[0].consensusLevel, 'multi');
    assert.strictEqual(out.issues[0].reviewerRole, 'bug-hunter');
    assert.deepStrictEqual(out.issues[0].sourceExecutionIds, [
      'exec-bug-hunter',
      'exec-security-scanner',
    ]);
  });

  it('still warns when the report grows an undeclared field', () => {
    const result = buildReviewerRunResult();
    const { lines } = captureStderr(() =>
      formatJsonOutput(
        {
          ...result,
          teamLeadReport: { ...result.teamLeadReport, executiveSummary: 'looks fine to me' },
        },
        'midstream'
      )
    );
    assert.strictEqual(lines.length, 1, `expected exactly one warning, got:\n${lines.join('\n')}`);
    assert.match(lines[0], /does not conform to schemas\/output\.schema\.json/);
    assert.match(lines[0], /executiveSummary/);
  });

  it('omits teamLeadReport entirely for a single-reviewer run (back-compat)', () => {
    // local-runner.mjs sets `teamLeadReport: review.teamLeadReport ?? null`, so
    // the non-orchestrated path reaches the formatter with an explicit null.
    for (const teamLeadReport of [null, undefined]) {
      const { value: out, lines } = captureStderr(() =>
        formatJsonOutput(
          { status: 'ok', dryRun: false, findings: [], plan: {}, config: {}, teamLeadReport },
          'midstream'
        )
      );
      assert.ok(!('teamLeadReport' in out), `absent for teamLeadReport=${teamLeadReport}`);
      assert.deepStrictEqual(lines, []);
    }
  });
});
