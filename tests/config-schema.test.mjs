import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  modelConfigSchema,
  reviewConfigSchema,
  excludeConfigSchema,
  riverReviewerConfigSchema,
  AIModelSchema,
  RuleSchema,
  SkillSchema,
  ConfigSchema,
  redactCategoriesSchema,
  redactConfigSchema,
  securityConfigSchema,
  artifactPathConfigSchema,
  artifactsConfigSchema,
} from '../src/config/schema.mjs';

import { RiskActionSchema, RiskRuleSchema, RiskMapSchema } from '../src/config/risk-map-schema.mjs';

// ---------------------------------------------------------------------------
// Legacy schemas (river run)
// ---------------------------------------------------------------------------

describe('modelConfigSchema', () => {
  test('accepts valid config', () => {
    const result = modelConfigSchema.safeParse({
      provider: 'openai',
      modelName: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1024,
    });
    assert.ok(result.success);
  });

  test('accepts empty object (all optional)', () => {
    assert.ok(modelConfigSchema.safeParse({}).success);
  });

  test('rejects invalid provider', () => {
    const result = modelConfigSchema.safeParse({ provider: 'azure' });
    assert.ok(!result.success);
  });

  test('rejects temperature out of range', () => {
    assert.ok(!modelConfigSchema.safeParse({ temperature: 2 }).success);
    assert.ok(!modelConfigSchema.safeParse({ temperature: -0.1 }).success);
  });

  test('rejects non-positive maxTokens', () => {
    assert.ok(!modelConfigSchema.safeParse({ maxTokens: 0 }).success);
    assert.ok(!modelConfigSchema.safeParse({ maxTokens: -10 }).success);
  });
});

describe('reviewConfigSchema', () => {
  test('accepts valid config', () => {
    const result = reviewConfigSchema.safeParse({
      language: 'ja',
      severity: 'strict',
      additionalInstructions: ['Be thorough'],
    });
    assert.ok(result.success);
  });

  test('rejects invalid language', () => {
    assert.ok(!reviewConfigSchema.safeParse({ language: 'fr' }).success);
  });

  test('rejects invalid severity', () => {
    assert.ok(!reviewConfigSchema.safeParse({ severity: 'harsh' }).success);
  });

  test('rejects empty strings in additionalInstructions', () => {
    assert.ok(!reviewConfigSchema.safeParse({ additionalInstructions: [''] }).success);
  });

  // #1689: reviewer orchestration knobs. z.object strips unknown keys, so the
  // round-trip assertion is what proves the key actually reaches the runtime.
  test('keeps review.orchestrator.timeoutMs / progress after validation', () => {
    const result = reviewConfigSchema.safeParse({
      orchestrator: { timeoutMs: 120000, progress: false },
    });
    assert.ok(result.success);
    assert.deepEqual(result.data.orchestrator, { timeoutMs: 120000, progress: false });
  });

  test('rejects a non-positive or over-cap orchestrator timeout', () => {
    assert.ok(!reviewConfigSchema.safeParse({ orchestrator: { timeoutMs: 0 } }).success);
    assert.ok(!reviewConfigSchema.safeParse({ orchestrator: { timeoutMs: -1 } }).success);
    assert.ok(!reviewConfigSchema.safeParse({ orchestrator: { timeoutMs: 0.5 } }).success);
    // 2^31 would overflow setTimeout's 32-bit delay and clamp to 1 ms.
    assert.ok(!reviewConfigSchema.safeParse({ orchestrator: { timeoutMs: 2147483648 } }).success);
    assert.ok(reviewConfigSchema.safeParse({ orchestrator: { timeoutMs: 3600000 } }).success);
  });

  // #1689 review W1a: `--reviewers` is an existing CLI flag taking a list of
  // role names, so a user writing the same key in config is plausible. It must
  // be ignored like any other unknown key, never fail the whole run.
  test('a legacy review.reviewers array is stripped, not a validation error', () => {
    const result = reviewConfigSchema.safeParse({
      language: 'ja',
      reviewers: ['bug-hunter', 'security-scanner'],
    });
    assert.ok(result.success, 'an array under review.reviewers must not fail validation');
    assert.equal(result.data.reviewers, undefined, 'the unknown key is stripped');
    assert.equal(result.data.language, 'ja', 'the rest of the section survives');
  });

  // The orchestrator sub-schema is intentionally non-strict, matching every
  // other section here: a key added by a newer version must not hard-fail an
  // older one on config load.
  test('an unknown key inside orchestrator is stripped, not rejected', () => {
    const result = reviewConfigSchema.safeParse({ orchestrator: { futureKey: 1, progress: true } });
    assert.ok(result.success);
    assert.deepEqual(result.data.orchestrator, { progress: true });
  });
});

describe('excludeConfigSchema', () => {
  test('accepts valid exclusions', () => {
    const result = excludeConfigSchema.safeParse({
      files: ['*.md', 'vendor/**'],
      prLabelsToIgnore: ['skip-review'],
    });
    assert.ok(result.success);
  });

  test('rejects empty strings in arrays', () => {
    assert.ok(!excludeConfigSchema.safeParse({ files: [''] }).success);
  });
});

describe('riverReviewerConfigSchema', () => {
  test('accepts combined config', () => {
    const result = riverReviewerConfigSchema.safeParse({
      model: { provider: 'google' },
      review: { language: 'en' },
      exclude: { files: ['*.lock'] },
    });
    assert.ok(result.success);
  });

  test('accepts empty object', () => {
    assert.ok(riverReviewerConfigSchema.safeParse({}).success);
  });

  test('accepts security.redact block (#692 PR-B)', () => {
    const result = riverReviewerConfigSchema.safeParse({
      security: {
        redact: {
          enabled: true,
          categories: { githubToken: true, highEntropy: false },
          extraPatterns: [{ id: 'custom', pattern: '\\bsecret-\\w+\\b' }],
          allowlist: ['TESTFIXTURE'],
          denyFiles: ['vendor/**'],
          entropyThreshold: 4.5,
          entropyMinLength: 24,
        },
      },
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });

  test('accepts context.budget / context.ranking blocks (#689 PR-A)', () => {
    const result = riverReviewerConfigSchema.safeParse({
      context: {
        budget: {
          maxTokens: 4000,
          maxChars: 16000,
          perSectionCaps: { fullFile: 3000, tests: 2000, usages: 1500, config: 500 },
        },
        ranking: {
          enabled: true,
          weights: { pathProximity: 0.4, symbolUsage: 0.3, siblingTest: 0.2, commitRecency: 0.1 },
        },
        tokenizer: 'heuristic',
      },
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });

  test('rejects out-of-range context.budget.maxTokens', () => {
    assert.equal(
      riverReviewerConfigSchema.safeParse({ context: { budget: { maxTokens: 100 } } }).success,
      false
    );
    assert.equal(
      riverReviewerConfigSchema.safeParse({ context: { budget: { maxTokens: 999_999 } } }).success,
      false
    );
  });

  test('rejects unknown context.tokenizer values', () => {
    assert.equal(
      riverReviewerConfigSchema.safeParse({ context: { tokenizer: 'tiktoken' } }).success,
      false
    );
  });

  test('accepts artifacts block (#802 Phase 2a)', () => {
    const result = riverReviewerConfigSchema.safeParse({
      artifacts: {
        'pbi-input': './docs/working/TASK-1/pbi-input.md',
        plan: { path: './docs/working/TASK-1/plan.md' },
        diff: { path: './artifacts/diff.patch', optional: false },
        'review-self': { path: './review-self.md', optional: true },
      },
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });
});

// ---------------------------------------------------------------------------
// #692 PR-B: security.redact.* zod and JSON Schema
// ---------------------------------------------------------------------------

describe('redactCategoriesSchema', () => {
  test('accepts a partial object with only some categories', () => {
    const r = redactCategoriesSchema.safeParse({ githubToken: true, highEntropy: false });
    assert.ok(r.success);
  });

  test('rejects unknown category keys (strict)', () => {
    const r = redactCategoriesSchema.safeParse({ unknownThing: true });
    assert.equal(r.success, false);
  });

  test('rejects non-boolean values', () => {
    const r = redactCategoriesSchema.safeParse({ githubToken: 'yes' });
    assert.equal(r.success, false);
  });
});

describe('redactConfigSchema', () => {
  test('accepts an empty object (everything optional)', () => {
    assert.ok(redactConfigSchema.safeParse({}).success);
  });

  test('rejects entropyThreshold outside [3.0, 6.0]', () => {
    assert.equal(redactConfigSchema.safeParse({ entropyThreshold: 2.9 }).success, false);
    assert.equal(redactConfigSchema.safeParse({ entropyThreshold: 6.1 }).success, false);
    assert.ok(redactConfigSchema.safeParse({ entropyThreshold: 4.5 }).success);
  });

  test('rejects non-integer entropyMinLength', () => {
    assert.equal(redactConfigSchema.safeParse({ entropyMinLength: 24.5 }).success, false);
    assert.equal(redactConfigSchema.safeParse({ entropyMinLength: 7 }).success, false);
    assert.ok(redactConfigSchema.safeParse({ entropyMinLength: 24 }).success);
  });

  test('rejects extra properties (strict)', () => {
    const r = redactConfigSchema.safeParse({ enabled: true, somethingElse: 1 });
    assert.equal(r.success, false);
  });

  test('rejects extraPatterns entries that omit id or pattern', () => {
    assert.equal(
      redactConfigSchema.safeParse({ extraPatterns: [{ pattern: 'x' }] }).success,
      false
    );
    assert.equal(redactConfigSchema.safeParse({ extraPatterns: [{ id: 'x' }] }).success, false);
  });
});

describe('securityConfigSchema', () => {
  test('accepts only `redact`', () => {
    assert.ok(securityConfigSchema.safeParse({ redact: { enabled: false } }).success);
  });

  test('rejects unknown top-level keys (strict)', () => {
    assert.equal(securityConfigSchema.safeParse({ network: {} }).success, false);
  });
});

describe('redaction-config.schema.json (#692 PR-B)', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(__dirname, '..', 'schemas', 'redaction-config.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  test('accepts an example matching all properties', () => {
    const ok = validate({
      enabled: true,
      categories: { githubToken: true },
      extraPatterns: [{ id: 'custom', pattern: '\\bX\\b', replacement: '<X>' }],
      allowlist: ['TESTFIXTURE'],
      denyFiles: ['vendor/**'],
      entropyThreshold: 4.5,
      entropyMinLength: 24,
    });
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test('rejects unknown root-level properties', () => {
    const ok = validate({ enabled: true, somethingElse: 1 });
    assert.equal(ok, false);
  });

  test('rejects extraPatterns entries missing required fields', () => {
    assert.equal(validate({ extraPatterns: [{ pattern: 'x' }] }), false);
    assert.equal(validate({ extraPatterns: [{ id: 'x' }] }), false);
  });

  test('rejects out-of-range entropyThreshold', () => {
    assert.equal(validate({ entropyThreshold: 2.5 }), false);
    assert.equal(validate({ entropyThreshold: 6.5 }), false);
  });
});

// ---------------------------------------------------------------------------
// Skill-based schemas
// ---------------------------------------------------------------------------

describe('AIModelSchema (hybrid enum + prefix regex)', () => {
  test('accepts known enum members', () => {
    for (const model of [
      'gemini-2.0-flash',
      'gpt-4o',
      'o1',
      'o1-mini',
      'claude-sonnet-4-6',
      'claude-opus-4-7',
      'claude-haiku-4-5',
    ]) {
      assert.ok(AIModelSchema.safeParse(model).success, `should accept ${model}`);
    }
  });

  test('accepts forward-compatible names matching the provider prefix', () => {
    for (const model of [
      'gemini-3.0-flash',
      'gpt-4o-mini-2026-01',
      'o1-pro',
      'claude-sonnet-5-1',
      'claude-haiku-4-5-20260101',
    ]) {
      assert.ok(AIModelSchema.safeParse(model).success, `should accept future model ${model}`);
    }
  });

  test('rejects names that do not match any supported provider prefix', () => {
    for (const model of ['mistral-large', 'llama-3', 'random-string', 'claude', '']) {
      assert.ok(!AIModelSchema.safeParse(model).success, `should reject ${model}`);
    }
  });
});

describe('RuleSchema', () => {
  test('accepts valid rule', () => {
    const result = RuleSchema.safeParse({
      id: 'rule-1',
      severity: 'error',
      description: 'Desc',
      context: 'Why',
      patterns: ['TODO'],
      anti_patterns: ['bad code'],
      fix_guidance: 'Fix it',
    });
    assert.ok(result.success);
  });

  test('rejects missing required fields', () => {
    assert.ok(!RuleSchema.safeParse({ id: 'rule-1' }).success);
  });
});

describe('artifactsConfigSchema (#802 Phase 2a)', () => {
  test('accepts string path form', () => {
    assert.ok(artifactPathConfigSchema.safeParse('./plan.md').success);
  });

  test('accepts object form with optional flag', () => {
    assert.ok(artifactPathConfigSchema.safeParse({ path: './plan.md', optional: true }).success);
  });

  test('rejects empty path', () => {
    assert.ok(!artifactPathConfigSchema.safeParse('').success);
    assert.ok(!artifactPathConfigSchema.safeParse({ path: '' }).success);
  });

  test('rejects unknown keys inside the object form (.strict)', () => {
    assert.ok(!artifactPathConfigSchema.safeParse({ path: './x.md', extra: 1 }).success);
  });

  test('accepts all known artifact IDs', () => {
    const result = artifactsConfigSchema.safeParse({
      'pbi-input': './pbi-input.md',
      plan: './plan.md',
      design: './design.md',
      todo: './todo.md',
      'test-cases': './test-cases.md',
      'review-self': './review-self.md',
      'review-external': './review-external.md',
      diff: './diff.patch',
      junit: './junit.xml',
      coverage: './coverage.xml',
      lint: './lint.json',
      typecheck: './typecheck.txt',
      'findings-pool': './findings-pool.json',
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });

  test('accepts empty object (all optional)', () => {
    assert.ok(artifactsConfigSchema.safeParse({}).success);
  });

  test('allows unknown artifact IDs (catchall: contract treats new IDs as a backward-compatible minor bump)', () => {
    const result = artifactsConfigSchema.safeParse({
      plan: './plan.md',
      'future-artifact': './future.md',
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });

  test('rejects an invalid value for a known artifact ID', () => {
    assert.ok(!artifactsConfigSchema.safeParse({ plan: 123 }).success);
    assert.ok(!artifactsConfigSchema.safeParse({ plan: { optional: true } }).success);
  });

  // #2011 AC7 P3-4: `design` is a declared key, not a `.catchall` passthrough,
  // so an invalid value must be rejected the same way `plan` is.
  test('rejects an invalid value for the design artifact ID', () => {
    assert.ok(!artifactsConfigSchema.safeParse({ design: 123 }).success);
    assert.ok(!artifactsConfigSchema.safeParse({ design: { optional: true } }).success);
    assert.ok(artifactsConfigSchema.safeParse({ design: './docs/design.md' }).success);
  });
});

describe('ConfigSchema', () => {
  test('accepts minimal config with defaults', () => {
    const result = ConfigSchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data.version, '1.0');
    assert.deepEqual(result.data.skills, []);
  });

  test('allows unknown keys (catchall)', () => {
    const result = ConfigSchema.safeParse({ customField: 'value' });
    assert.ok(result.success);
    assert.equal(result.data.customField, 'value');
  });

  test('accepts artifacts block (#802 Phase 2a)', () => {
    const result = ConfigSchema.safeParse({
      artifacts: { plan: './plan.md', diff: { path: './diff.patch', optional: false } },
    });
    assert.ok(result.success, JSON.stringify(result.error?.format()));
  });
});

// ---------------------------------------------------------------------------
// Risk map schemas
// ---------------------------------------------------------------------------

describe('RiskActionSchema', () => {
  test('accepts valid actions', () => {
    for (const action of ['comment_only', 'escalate', 'require_human_review']) {
      assert.ok(RiskActionSchema.safeParse(action).success);
    }
  });

  test('rejects invalid action', () => {
    assert.ok(!RiskActionSchema.safeParse('block').success);
  });
});

describe('RiskRuleSchema', () => {
  test('accepts valid rule', () => {
    const result = RiskRuleSchema.safeParse({
      pattern: 'src/auth/**',
      action: 'escalate',
      reason: 'Auth changes are sensitive',
    });
    assert.ok(result.success);
  });

  test('rejects empty pattern', () => {
    assert.ok(!RiskRuleSchema.safeParse({ pattern: '', action: 'escalate' }).success);
  });

  test('reason is optional', () => {
    assert.ok(RiskRuleSchema.safeParse({ pattern: '*.ts', action: 'comment_only' }).success);
  });
});

describe('RiskMapSchema', () => {
  test('accepts valid risk map', () => {
    const result = RiskMapSchema.safeParse({
      version: '1',
      rules: [{ pattern: 'db/**', action: 'require_human_review' }],
    });
    assert.ok(result.success);
    assert.equal(result.data.defaults.action, 'comment_only');
  });

  test('rejects empty rules array', () => {
    assert.ok(!RiskMapSchema.safeParse({ rules: [] }).success);
  });

  test('applies default version and defaults.action', () => {
    const result = RiskMapSchema.safeParse({
      rules: [{ pattern: '**/*.ts', action: 'escalate' }],
    });
    assert.ok(result.success);
    assert.equal(result.data.version, '1');
    assert.equal(result.data.defaults.action, 'comment_only');
  });

  test('allows overriding defaults.action', () => {
    const result = RiskMapSchema.safeParse({
      rules: [{ pattern: '**', action: 'comment_only' }],
      defaults: { action: 'escalate' },
    });
    assert.ok(result.success);
    assert.equal(result.data.defaults.action, 'escalate');
  });
});
