import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: expected patch anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${path}: patch anchor is not unique`);
  }
  fs.writeFileSync(path, source.replace(before, after), 'utf8');
}

function insertStableInterfaceRow() {
  const path = 'pages/reference/stable-interfaces.md';
  const source = fs.readFileSync(path, 'utf8');
  const lines = source.split('\n');
  const index = lines.findIndex((line) =>
    line.includes('| Execution Manifest (`schemas/execution-manifest.schema.json`)')
  );
  if (index < 0) throw new Error(`${path}: Execution Manifest row not found`);
  if (lines.some((line) => line.includes('| Review Coverage (`schemas/review-coverage.schema.json`)'))) {
    throw new Error(`${path}: Review Coverage row already exists`);
  }
  lines.splice(
    index + 1,
    0,
    '| Review Coverage (`schemas/review-coverage.schema.json` / JSON・saved run `reviewCoverage`) | Experimental | #2212 Phase 1 の観測用 contract。Gate / `decision` には影響せず、JSON output と `.river/runs/*.json` への field は additive・optional |'
  );
  fs.writeFileSync(path, lines.join('\n'), 'utf8');
}

replaceOnce(
  'src/lib/reviewer-orchestrator.mjs',
  `  const names = reviewers ?? DEFAULT_REVIEWERS;\n  const valid = names.filter((n) => REVIEWER_ROLES[n]);\n  const invalid = names.filter((n) => !REVIEWER_ROLES[n]);\n  return { valid, invalid };`,
  `  const names = reviewers ?? DEFAULT_REVIEWERS;\n  // A reviewer role is an identity, not an execution multiplicity. Normalize\n  // explicit duplicate names here so role aggregation and Review Unit IDs stay\n  // one-to-one while preserving the caller's first-seen order.\n  const uniqueNames = [...new Set(names)];\n  const valid = uniqueNames.filter((n) => REVIEWER_ROLES[n]);\n  const invalid = uniqueNames.filter((n) => !REVIEWER_ROLES[n]);\n  return { valid, invalid };`
);

replaceOnce(
  'src/lib/local-runner.mjs',
  `    classified: review.classified,\n    reviewerResults: review.reviewerResults ?? null,\n    teamLeadReport: review.teamLeadReport ?? null,`,
  `    classified: review.classified,\n    reviewerResults: review.reviewerResults ?? null,\n    // #2212 Phase 1: observe-only execution coverage. Preserve the producer's\n    // object verbatim; a single-reviewer run has no coverage contract to invent.\n    reviewCoverage: review.reviewCoverage ?? null,\n    teamLeadReport: review.teamLeadReport ?? null,`
);

replaceOnce(
  'src/lib/result-store.mjs',
  `    ...(decision !== undefined ? { decision } : {}),\n    ...(gate ? { gate } : {}),\n    // #1600: persist the calibration debug telemetry`,
  `    ...(decision !== undefined ? { decision } : {}),\n    ...(gate ? { gate } : {}),\n    // #2212 Phase 1: persist the exact runtime observation. Do not recompute\n    // coverage in the store; absence remains distinguishable from complete.\n    ...(result.reviewCoverage ? { reviewCoverage: result.reviewCoverage } : {}),\n    // #1600: persist the calibration debug telemetry`
);

replaceOnce(
  'schemas/output.schema.json',
  `    "teamLeadReport": {\n      "description": "Tech Lead synthesis of a multi-role run (#1700). Emitted only when the run went through reviewer orchestration (\u0060--reviewers\u0060), so its absence means a single-reviewer run. Produced by synthesizeTeamLeadReport (src/lib/team-lead-synthesizer.mjs) with no LLM call — every field is a deterministic aggregation of the same findings already listed in \u0060issues\u0060. Additive/optional and display-only: it MUST NOT override severity, \u0060decision\u0060, or \u0060gate\u0060.",\n      "$ref": "#/$defs/teamLeadReport"\n    }`,
  `    "reviewCoverage": {\n      "description": "Observe-only Review Coverage for reviewer orchestration (#2212 Phase 1). Additive/optional. Its absence is not equivalent to complete coverage, and this field MUST NOT change decision or gate behavior in Phase 1.",\n      "$ref": "https://river-review.the3396.com/schemas/review-coverage.schema.json"\n    },\n    "teamLeadReport": {\n      "description": "Tech Lead synthesis of a multi-role run (#1700). Emitted only when the run went through reviewer orchestration (\u0060--reviewers\u0060), so its absence means a single-reviewer run. Produced by synthesizeTeamLeadReport (src/lib/team-lead-synthesizer.mjs) with no LLM call — every field is a deterministic aggregation of the same findings already listed in \u0060issues\u0060. Additive/optional and display-only: it MUST NOT override severity, \u0060decision\u0060, or \u0060gate\u0060.",\n      "$ref": "#/$defs/teamLeadReport"\n    }`
);

replaceOnce(
  'src/cli/render.mjs',
  `    const schemaPath = new URL('../../schemas/output.schema.json', import.meta.url);\n    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));\n    const ajv = new Ajv2020({ allErrors: true, strict: false });\n    addFormats(ajv);\n    outputSchemaValidator = ajv.compile(schema);`,
  `    const schemaPath = new URL('../../schemas/output.schema.json', import.meta.url);\n    const reviewCoverageSchemaPath = new URL(\n      '../../schemas/review-coverage.schema.json',\n      import.meta.url\n    );\n    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));\n    const reviewCoverageSchema = JSON.parse(readFileSync(reviewCoverageSchemaPath, 'utf8'));\n    const ajv = new Ajv2020({ allErrors: true, strict: false });\n    addFormats(ajv);\n    // Keep review-coverage.schema.json as the single shape SSoT. output.schema\n    // references it by $id instead of copying the Review Coverage contract.\n    ajv.addSchema(reviewCoverageSchema);\n    outputSchemaValidator = ajv.compile(schema);`
);

replaceOnce(
  'src/cli/render.mjs',
  `    ...(timedOutRoles.length > 0 ? { timedOutRoles } : {}),\n    ...(result.teamLeadReport ? { teamLeadReport: result.teamLeadReport } : {}),`,
  `    ...(timedOutRoles.length > 0 ? { timedOutRoles } : {}),\n    ...(result.reviewCoverage ? { reviewCoverage: result.reviewCoverage } : {}),\n    ...(result.teamLeadReport ? { teamLeadReport: result.teamLeadReport } : {}),`
);

insertStableInterfaceRow();

const testPath = 'tests/review-coverage-surface.test.mjs';
if (fs.existsSync(testPath)) throw new Error(`${testPath}: already exists`);
fs.writeFileSync(
  testPath,
  `import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport { describe, it } from 'node:test';\n\nimport { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';\nimport { buildRunRecord } from '../src/lib/result-store.mjs';\nimport { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';\nimport { resolveReviewerRoles } from '../src/lib/reviewer-orchestrator.mjs';\n\nfunction unit(overrides = {}) {\n  return {\n    id: 'reviewer:bug-hunter/chunk:1',\n    kind: 'diff-chunk',\n    subjects: ['src/a.js'],\n    reviewerRole: 'bug-hunter',\n    required: true,\n    status: 'completed',\n    reasonCode: null,\n    findingsCount: 0,\n    ...overrides,\n  };\n}\n\nfunction baseResult(overrides = {}) {\n  return {\n    findings: [],\n    changedFiles: ['src/a.js'],\n    reviewerResults: [{ role: 'bug-hunter', status: 'fulfilled', timedOut: false }],\n    reviewMode: 'medium',\n    plan: { phase: 'midstream', reviewMode: 'medium' },\n    ...overrides,\n  };\n}\n\ndescribe('Review Coverage surface propagation', () => {\n  it('dedupes explicit reviewer roles in first-seen order', () => {\n    const resolved = resolveReviewerRoles([\n      'security-scanner',\n      'bug-hunter',\n      'security-scanner',\n      'unknown-role',\n      'unknown-role',\n    ]);\n\n    assert.deepEqual(resolved.valid, ['security-scanner', 'bug-hunter']);\n    assert.deepEqual(resolved.invalid, ['unknown-role']);\n  });\n\n  it('wires the orchestration observation through runLocalReview without synthesizing it', () => {\n    const source = readFileSync(new URL('../src/lib/local-runner.mjs', import.meta.url), 'utf8');\n    assert.match(source, /reviewCoverage:\\s*review\\.reviewCoverage \\?\\? null/);\n  });\n\n  it('emits schema-valid JSON Review Coverage only when present', () => {\n    const coverage = deriveReviewCoverage([unit()]);\n    const artifact = formatJsonOutput(baseResult({ reviewCoverage: coverage }), 'midstream');\n    const validate = getOutputSchemaValidator();\n\n    assert.ok(validate, 'output schema validator must load');\n    assert.strictEqual(artifact.reviewCoverage, coverage);\n    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));\n\n    const legacy = formatJsonOutput(baseResult(), 'midstream');\n    assert.equal(Object.hasOwn(legacy, 'reviewCoverage'), false);\n    assert.equal(validate(legacy), true, JSON.stringify(validate.errors, null, 2));\n  });\n\n  it('persists the same Review Coverage object without recomputation', () => {\n    const coverage = deriveReviewCoverage([unit()]);\n    const record = buildRunRecord(baseResult({ reviewCoverage: coverage }), { runId: 'coverage-run' });\n\n    assert.strictEqual(record.reviewCoverage, coverage);\n\n    const legacy = buildRunRecord(baseResult(), { runId: 'legacy-run' });\n    assert.equal(Object.hasOwn(legacy, 'reviewCoverage'), false);\n  });\n\n  it('does not let partial coverage change decision or gate in observe-only Slice B', () => {\n    const partial = deriveReviewCoverage([\n      unit(),\n      unit({\n        id: 'reviewer:bug-hunter/chunk:2',\n        subjects: ['src/b.js'],\n        status: 'failed',\n        reasonCode: 'reviewer_error',\n      }),\n    ]);\n    const withoutCoverage = formatJsonOutput(baseResult(), 'midstream');\n    const withCoverage = formatJsonOutput(baseResult({ reviewCoverage: partial }), 'midstream');\n\n    assert.equal(partial.status, 'partial');\n    assert.equal(withCoverage.decision, withoutCoverage.decision);\n    assert.deepEqual(withCoverage.gate, withoutCoverage.gate);\n  });\n});\n`,
  'utf8'
);

console.log('Review Coverage Slice B patch applied.');
