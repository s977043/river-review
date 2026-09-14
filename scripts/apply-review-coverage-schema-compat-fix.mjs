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

replaceOnce(
  'schemas/output.schema.json',
  `    "reviewCoverage": {\n      "description": "Observe-only Review Coverage for reviewer orchestration (#2212 Phase 1). Additive/optional. Its absence is not equivalent to complete coverage, and this field MUST NOT change decision or gate behavior in Phase 1.",\n      "$ref": "https://river-review.the3396.com/schemas/review-coverage.schema.json"\n    },`,
  `    "reviewCoverage": {\n      "type": "object",\n      "description": "Observe-only Review Coverage for reviewer orchestration (#2212 Phase 1). Additive/optional. The detailed shape is governed by schemas/review-coverage.schema.json and validated separately at runtime so output.schema.json remains self-contained. Its absence is not equivalent to complete coverage, and this field MUST NOT change decision or gate behavior in Phase 1."\n    },`
);

replaceOnce(
  'src/cli/render.mjs',
  `    const schemaPath = new URL('../../schemas/output.schema.json', import.meta.url);\n    const reviewCoverageSchemaPath = new URL(\n      '../../schemas/review-coverage.schema.json',\n      import.meta.url\n    );\n    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));\n    const reviewCoverageSchema = JSON.parse(readFileSync(reviewCoverageSchemaPath, 'utf8'));\n    const ajv = new Ajv2020({ allErrors: true, strict: false });\n    addFormats(ajv);\n    // Keep review-coverage.schema.json as the single shape SSoT. output.schema\n    // references it by $id instead of copying the Review Coverage contract.\n    ajv.addSchema(reviewCoverageSchema);\n    outputSchemaValidator = ajv.compile(schema);`,
  `    const schemaPath = new URL('../../schemas/output.schema.json', import.meta.url);\n    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));\n    const ajv = new Ajv2020({ allErrors: true, strict: false });\n    addFormats(ajv);\n    outputSchemaValidator = ajv.compile(schema);`
);

replaceOnce(
  'src/cli/render.mjs',
  `  return outputSchemaValidator;\n}\n\n/**\n * Validate a formatted artifact against output.schema.json at runtime and`,
  `  return outputSchemaValidator;\n}\n\nlet reviewCoverageSchemaValidator;\n\n/**\n * Compile the dedicated Review Coverage contract separately from output.schema.\n * Keeping the schemas separate preserves output.schema.json as a self-contained\n * artifact for existing consumers while review-coverage.schema.json remains the\n * single detailed shape SSoT.\n */\nexport function getReviewCoverageSchemaValidator() {\n  if (reviewCoverageSchemaValidator !== undefined) return reviewCoverageSchemaValidator;\n  try {\n    const schemaPath = new URL('../../schemas/review-coverage.schema.json', import.meta.url);\n    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));\n    const ajv = new Ajv2020({ allErrors: true, strict: false });\n    addFormats(ajv);\n    reviewCoverageSchemaValidator = ajv.compile(schema);\n  } catch (err) {\n    console.error(\n      \`Warning: could not load review-coverage.schema.json for validation: \${err.message}\`\n    );\n    reviewCoverageSchemaValidator = null;\n  }\n  return reviewCoverageSchemaValidator;\n}\n\n/**\n * Validate a formatted artifact against output.schema.json at runtime and`
);

replaceOnce(
  'src/cli/render.mjs',
  `  if (!validate(artifact)) {\n    console.error(\n      \`Warning: JSON output does not conform to schemas/output.schema.json:\\n\${JSON.stringify(\n        validate.errors,\n        null,\n        2\n      )}\`\n    );\n  }\n}`,
  `  if (!validate(artifact)) {\n    console.error(\n      \`Warning: JSON output does not conform to schemas/output.schema.json:\\n\${JSON.stringify(\n        validate.errors,\n        null,\n        2\n      )}\`\n    );\n  }\n  if (artifact?.reviewCoverage) {\n    const validateCoverage = getReviewCoverageSchemaValidator();\n    if (validateCoverage && !validateCoverage(artifact.reviewCoverage)) {\n      console.error(\n        \`Warning: reviewCoverage does not conform to schemas/review-coverage.schema.json:\\n\${JSON.stringify(\n          validateCoverage.errors,\n          null,\n          2\n        )}\`\n      );\n    }\n  }\n}`
);

replaceOnce(
  'tests/review-coverage-surface.test.mjs',
  `import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';`,
  `import {\n  formatJsonOutput,\n  getOutputSchemaValidator,\n  getReviewCoverageSchemaValidator,\n} from '../src/cli/render.mjs';\nimport { compileSchemaFile } from './helpers/schema-validator.mjs';`
);

replaceOnce(
  'tests/review-coverage-surface.test.mjs',
  `    const validate = getOutputSchemaValidator();\n\n    assert.ok(validate, 'output schema validator must load');\n    assert.strictEqual(artifact.reviewCoverage, coverage);\n    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));`,
  `    const validate = getOutputSchemaValidator();\n    const validateCoverage = getReviewCoverageSchemaValidator();\n    const validateStandaloneOutput = compileSchemaFile('output.schema.json');\n\n    assert.ok(validate, 'output schema validator must load');\n    assert.ok(validateCoverage, 'Review Coverage schema validator must load');\n    assert.strictEqual(artifact.reviewCoverage, coverage);\n    assert.equal(validate(artifact), true, JSON.stringify(validate.errors, null, 2));\n    assert.equal(\n      validateCoverage(artifact.reviewCoverage),\n      true,\n      JSON.stringify(validateCoverage.errors, null, 2)\n    );\n    assert.equal(\n      validateStandaloneOutput(artifact),\n      true,\n      JSON.stringify(validateStandaloneOutput.errors, null, 2)\n    );`
);

replaceOnce(
  'docs/development/review-coverage-phase1-slice-b-plan.md',
  `The Review Coverage shape remains owned by \`schemas/review-coverage.schema.json\`.\n\nRuntime validation must register that schema with Ajv before compiling \`output.schema.json\`, then reference it by \`$id\`. Do not copy Review Coverage fields into \`output.schema.json\`.\n\nOld JSON payloads without \`reviewCoverage\` remain valid.`,
  `The Review Coverage shape remains owned by \`schemas/review-coverage.schema.json\`.\n\n\`output.schema.json\` stays self-contained for existing consumers and declares \`reviewCoverage\` only as an optional object. Runtime validation separately validates that object against the dedicated Review Coverage schema. Do not copy Review Coverage fields into \`output.schema.json\` and do not introduce a remote-reference requirement for consumers that compile only the output schema.\n\nOld JSON payloads without \`reviewCoverage\` remain valid.`
);

replaceOnce(
  'docs/development/review-coverage-phase1-slice-b-plan.md',
  `| Contract / SSoT | APPROVE WITH GUARD | \`review-coverage.schema.json\` remains the shape SSoT and is referenced by the output validator. |`,
  `| Contract / SSoT | APPROVE WITH GUARD | \`review-coverage.schema.json\` remains the detailed shape SSoT; output schema stays self-contained and runtime validates coverage separately. |`
);

replaceOnce(
  'docs/development/review-coverage-phase1-slice-b-plan.md',
  `- output validation does not duplicate the Review Coverage schema;`,
  `- output schema stays self-contained and does not duplicate the Review Coverage schema;`
);

console.log('Review Coverage schema compatibility fix applied.');
