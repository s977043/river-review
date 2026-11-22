/**
 * Skill YAML Schema
 * Based on pages/reference/skill-metadata.md
 */

import { z } from 'zod';

// Enums
export const PhaseEnum = z.enum(['upstream', 'midstream', 'downstream']);
const StreamCategoryEnum = z.enum(['core', 'upstream', 'midstream', 'downstream']);
const SeverityEnum = z.enum(['info', 'minor', 'major', 'critical']);
// Keep in sync with schemas/skill.schema.json $defs.inputContext.enum.
// The enum-parity canary in tests/skill-schema-parity.test.mjs asserts they match.
export const InputContextEnum = z.enum([
  'diff',
  'fullFile',
  'tests',
  'adr',
  'commitMessage',
  'repoConfig',
  'reviewSelf',
  'reviewExternal',
  'findingsPool',
  'prDescription',
  'qaEvidence',
]);
const OutputKindEnum = z.enum([
  'findings',
  'summary',
  'actions',
  'tests',
  'metrics',
  'questions',
  'review-audit',
]);
export const ModelHintEnum = z.enum(['cheap', 'balanced', 'high-accuracy']);

// Custom dependencies pattern
const DependencyEnum = z.enum([
  'code_search',
  'test_runner',
  'adr_lookup',
  'repo_metadata',
  'coverage_report',
  'tracing',
]);

const DependencySchema = z.union([
  DependencyEnum,
  z.string().regex(/^custom:.+/, 'Custom dependency must be in format "custom:name"'),
]);

// Prompt reference
const PromptSchema = z.object({
  system: z.string().min(1).describe('Path to system prompt file'),
  user: z.string().min(1).describe('Path to user prompt file'),
});

// Evaluation configuration
const EvalSchema = z.object({
  promptfoo: z.string().min(1).optional().describe('Path to promptfoo configuration'),
});

// Trigger configuration (alternative format)
// `.strict()` mirrors the ajv side (schemas/skill.schema.json → properties.trigger
// has `additionalProperties: false`). Without it an unknown trigger sub-field would
// be accepted here but rejected by ajv, i.e. a trigger field added to only one
// schema would drift silently — the exact gap the skill-schema-parity canary guards
// (#1399). Matches the deterministicGate object, the other nested schema that uses
// `.strict()` to track ajv `additionalProperties: false`.
const TriggerSchema = z
  .object({
    phase: z
      .union([PhaseEnum, z.array(PhaseEnum)])
      .optional()
      .describe('SDLC phase(s)'),
    files: z.array(z.string().min(1)).optional().describe('File patterns (glob)'),
    path_patterns: z.array(z.string().min(1)).optional().describe('File patterns (alias)'),
    applyTo: z.array(z.string().min(1)).optional().describe('File patterns (alias)'),
  })
  .strict();

// Main Skill YAML Schema
export const SkillYamlSchema = z
  .object({
    // Required fields
    id: z.string().min(1).describe('Unique identifier for the skill'),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version format (x.y.z)')
      .describe('Semantic version'),
    name: z.string().min(1).describe('Human-readable skill name'),
    description: z.string().min(1).describe('Purpose and role of the skill'),
    category: StreamCategoryEnum.describe('Stream category'),

    // Trigger conditions (at top level or in trigger object)
    phase: z
      .union([PhaseEnum, z.array(PhaseEnum)])
      .optional()
      .describe('SDLC phase(s)'),
    applyTo: z.array(z.string().min(1)).optional().describe('File patterns (glob)'),
    path_patterns: z.array(z.string().min(1)).optional().describe('File patterns (alias)'),
    trigger: TriggerSchema.optional().describe('Alternative trigger format'),

    // Optional fields (per spec: pages/reference/skill-metadata.md)
    tags: z.array(z.string()).optional().describe('Classification tags'),
    severity: SeverityEnum.optional().describe('Severity level of findings'),
    inputContext: z.array(InputContextEnum).optional().describe('Input context references'),
    outputKind: z.array(OutputKindEnum).default(['findings']).describe('Output types'),
    modelHint: ModelHintEnum.optional().describe('Recommended model type'),
    evaluationType: z
      .enum(['deterministic', 'heuristic', 'agentic'])
      .optional()
      .describe('Evaluation layer (Epic #1347 S2): deterministic | heuristic | agentic'),
    deterministicGate: z
      .object({
        command: z
          .string()
          .min(1)
          .describe(
            'External command deciding pass/fail (executed only inside the trust boundary; S4)'
          ),
        args: z
          .array(z.string())
          .optional()
          .describe(
            'argv (shell 非経由 execFile); command は実行ファイル名、args がその引数 (#1401 §4)'
          ),
        selfContained: z
          .boolean()
          .optional()
          .describe(
            'Self-contained command declaration; reads no PR-head config/scripts/node_modules (#1401 §10.1.2). Phase 1 executes only when true'
          ),
        failSeverity: z.enum(['strict_block', 'bypass_warning']).default('strict_block'),
      })
      .strict()
      .optional()
      .describe('Declaration for deterministic skills; execution lands in S4'),
    dependencies: z.array(DependencySchema).optional().describe('Feature dependencies'),
    priority: z.number().int().optional().describe('Ordering hint for execution priority'),

    // Implementation references (optional, commonly used but not in spec)
    prompt: PromptSchema.optional().describe('Prompt file references'),
    eval: EvalSchema.optional().describe('Evaluation configuration'),
    fixturesDir: z.string().optional().describe('Fixtures directory path'),
    goldenDir: z.string().optional().describe('Golden directory path'),
  })
  .refine(
    (data) => {
      const hasTopLevel =
        (data.phase !== undefined || data.category !== undefined) &&
        (data.applyTo !== undefined || data.path_patterns !== undefined);
      const triggerFiles =
        data.trigger?.applyTo ?? data.trigger?.files ?? data.trigger?.path_patterns;
      const triggerPhase = data.trigger?.phase !== undefined;
      const hasTrigger = data.trigger !== undefined && triggerPhase && triggerFiles !== undefined;
      return hasTopLevel || hasTrigger;
    },
    {
      message:
        'Must have either (phase/category + applyTo/path_patterns) at top level or trigger object with phase and files',
    }
  );
