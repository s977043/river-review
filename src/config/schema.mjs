import { z } from 'zod';

// --- Legacy Schema (for river run) ---
export const modelConfigSchema = z.object({
  provider: z.enum(['google', 'openai', 'anthropic']).optional(),
  modelName: z.string().min(1).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});

// --- #1689: parallel reviewer-role orchestration knobs ---
//
// Companion to src/lib/reviewer-orchestrator.mjs. Nested under `review` (rather
// than a new top-level section) so the loader's known-key list keeps accepting
// it without an "Unknown config keys ignored" warning.
//
// Named `orchestrator`, NOT `reviewers`: the CLI already exposes a `--reviewers
// <list>` flag, so a user writing `review: { reviewers: [bug-hunter] }` in
// `.river-review.json` is entirely plausible. An object schema on that key would
// reject the array and fail the whole run on config load; under a different name
// the stray key is simply stripped as an unknown key, exactly as before #1689.
//
// `timeoutMs` is the per-role wall-clock budget, capped at
// REVIEWER_TIMEOUT_MAX_MS (1 h) — beyond ~2^31 ms setTimeout clamps to 1 ms and
// would fail every role. Omitted = no timeout (the default; the orchestrator
// waits for every role, as before #1689). The env var `RIVER_REVIEWER_TIMEOUT`
// overrides it. `progress` (default true) toggles the per-role stderr progress
// lines; the CLI `--quiet` flag always wins over it.
//
// Not `.strict()`: every other section here (model / review / context / …) uses
// the zod default of stripping unknown keys, and a strict sub-schema would make
// a future key a hard load error on older versions.
export const reviewerOrchestratorConfigSchema = z.object({
  timeoutMs: z.number().int().positive().max(3_600_000).optional(),
  progress: z.boolean().optional(),
});

// --- ADR-006 / #1859: Prompt Compiler の実行モード ---
//
// `off` が既定であり、現行と完全に同一の挙動になる。`observe` は compiled
// プロンプトを生成するが送信せず、計測値だけを debug へ残す。`active` は
// compiled を送る想定だが #1859 では有効化しない（#1861 で配線する）。
//
// `shadow` という語を採らない理由は ADR-006 に記録がある。
// src/lib/shadow-aggregate.mjs が「複数 Run の読み取り専用集約」の意味で
// 既に使っており、二義になる。
//
// `.strict()` にしない。この節の他の schema と同じく未知キーは除去に留め、
// 将来キーを足しても古い版で hard error にならないようにする。
export const promptCompilerConfigSchema = z.object({
  mode: z.enum(['off', 'observe', 'active']).optional(),
});

export const reviewConfigSchema = z.object({
  promptCompiler: promptCompilerConfigSchema.optional(),
  language: z.enum(['ja', 'en']).optional(),
  severity: z.enum(['strict', 'normal', 'relaxed']).optional(),
  additionalInstructions: z.array(z.string().min(1)).optional(),
  orchestrator: reviewerOrchestratorConfigSchema.optional(),
  // Extra spec/ADR directories (relative to repo root) scanned when linking
  // changed files to related design docs. Merged with the built-in defaults.
  specDirs: z.array(z.string().min(1)).optional(),
  // Opt-in output enhancements. When true, the prompt asks the model to also
  // emit a per-file walkthrough / a provider-agnostic agent-handoff section.
  walkthrough: z.boolean().optional(),
  agentHandoff: z.boolean().optional(),
});

export const excludeConfigSchema = z.object({
  files: z.array(z.string().min(1)).optional(),
  prLabelsToIgnore: z.array(z.string().min(1)).optional(),
});

// --- #692 PR-B: security.redact.* schema ---
//
// Pure schema addition: this PR only teaches the loader to accept and
// validate `security.redact.*`. The keys are not yet read by the review
// pipeline; PR-C of #692 will plumb `config.security` into
// src/lib/repo-context.mjs and src/lib/local-runner.mjs.
//
// Default policy: redaction enabled; every named category on; entropy
// fallback at 4.5 bits/char with a 24-char minimum length. Users tighten
// or loosen via `extraPatterns`, `allowlist`, and `denyFiles`.

export const redactCategoriesSchema = z
  .object({
    githubToken: z.boolean().optional(),
    openaiKey: z.boolean().optional(),
    anthropicKey: z.boolean().optional(),
    googleApiKey: z.boolean().optional(),
    awsAccessKey: z.boolean().optional(),
    awsSecretKey: z.boolean().optional(),
    privateKey: z.boolean().optional(),
    bearerToken: z.boolean().optional(),
    databaseUrl: z.boolean().optional(),
    webhookUrl: z.boolean().optional(),
    oauthSecret: z.boolean().optional(),
    envAssignment: z.boolean().optional(),
    highEntropy: z.boolean().optional(),
  })
  .strict();

export const redactExtraPatternSchema = z
  .object({
    id: z.string().min(1),
    pattern: z.string().min(1),
    replacement: z.string().min(1).optional(),
  })
  .strict();

export const redactConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    categories: redactCategoriesSchema.optional(),
    extraPatterns: z.array(redactExtraPatternSchema).optional(),
    allowlist: z.array(z.string().min(1)).optional(),
    denyFiles: z.array(z.string().min(1)).optional(),
    entropyThreshold: z.number().min(3.0).max(6.0).optional(),
    entropyMinLength: z.number().int().min(8).optional(),
  })
  .strict();

export const securityConfigSchema = z
  .object({
    redact: redactConfigSchema.optional(),
  })
  .strict();

// --- #687 PR-D: memory.suppressionEnabled ---
//
// Companion to applySuppressions in src/lib/suppression-apply.mjs. When
// `false`, the suppression gate is bypassed entirely (debugging /
// emergency disable). Defaults to true at runtime; the schema only needs
// to know the field exists.
export const memoryConfigSchema = z
  .object({
    suppressionEnabled: z.boolean().optional(),
  })
  .strict();

// --- Epic #1347 S2 (#1349): gate contract config ---
//
// Companion to src/lib/gate-decision.mjs. Values are DERIVATION inputs and
// advisory contract values only — enforcement (observation expiry, the
// circuit-breaker counter) is the host's responsibility. Note the trust
// boundary: this file lives inside the reviewed repo, so when a host has its
// own limits the stricter value wins.
export const gateConfigSchema = z
  .object({
    observation: z
      .object({
        expiresInHours: z.number().positive().max(720).optional(),
      })
      .strict()
      .optional(),
    circuitBreaker: z
      .object({
        maxConsecutiveAutoGo: z.number().int().positive().max(1000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// --- #689 PR-A: context.budget config surface ---
//
// Companion to src/lib/token-estimator.mjs. PR-A teaches the loader to
// accept and validate the new keys; pipeline integration (collectRepoContext
// reading these and adjusting per-section caps) lands in #689 PR-C.
//
// Defaults are documented at runtime in repo-context.mjs (DEFAULT_MAX_CHARS,
// SECTION_CAPS) and preserved when this block is omitted entirely.

export const contextBudgetSchema = z
  .object({
    maxTokens: z.number().int().min(256).max(64000).optional(),
    maxChars: z.number().int().min(1024).max(200000).optional(),
    perSectionCaps: z
      .object({
        fullFile: z.number().int().min(0).optional(),
        tests: z.number().int().min(0).optional(),
        usages: z.number().int().min(0).optional(),
        config: z.number().int().min(0).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const contextRankingSchema = z
  .object({
    enabled: z.boolean().optional(),
    weights: z
      .object({
        pathProximity: z.number().min(0).max(1).optional(),
        symbolUsage: z.number().min(0).max(1).optional(),
        siblingTest: z.number().min(0).max(1).optional(),
        commitRecency: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// --- #689 PR-D: reviewMode preset budgets ---
//
// reviewMode is a friendly knob that picks a preset budget so users do
// not have to think in token counts. The runtime preset table lives in
// src/lib/context-presets.mjs; PR-D applies the preset when budget is
// omitted, so an explicit `budget: { ... }` always wins.
export const contextReviewModeSchema = z.enum(['tiny', 'medium', 'large']);

export const contextConfigSchema = z
  .object({
    budget: contextBudgetSchema.optional(),
    ranking: contextRankingSchema.optional(),
    tokenizer: z.enum(['heuristic']).optional(),
    reviewMode: contextReviewModeSchema.optional(),
  })
  .strict();

// --- #802 Phase 2a: artifacts.* schema ---
//
// Pure schema addition: this PR only teaches the loader to accept and
// validate the `artifacts.*` config section. The keys are not yet read
// by the review pipeline; the artifact resolver (Phase 2b) and the
// `river review plan/exec/verify` CLI vertical slice (Phase 3) plumb
// these into the resolution order documented in
// pages/reference/artifact-input-contract.md (CLI/Action args -> config
// -> cwd default filenames).
//
// The known artifact IDs mirror the Artifact Input Contract. `.catchall`
// (not `.strict`) is intentional: the contract treats adding a new
// artifact ID as a backward-compatible minor bump, so a config naming a
// future artifact ID must not fail validation against an older schema.
export const artifactPathConfigSchema = z.union([
  z.string().min(1),
  z
    .object({
      path: z.string().min(1),
      optional: z.boolean().optional(),
    })
    .strict(),
]);

export const artifactsConfigSchema = z
  .object({
    'pbi-input': artifactPathConfigSchema.optional(),
    plan: artifactPathConfigSchema.optional(),
    design: artifactPathConfigSchema.optional(),
    todo: artifactPathConfigSchema.optional(),
    'test-cases': artifactPathConfigSchema.optional(),
    'review-self': artifactPathConfigSchema.optional(),
    'review-external': artifactPathConfigSchema.optional(),
    diff: artifactPathConfigSchema.optional(),
    junit: artifactPathConfigSchema.optional(),
    coverage: artifactPathConfigSchema.optional(),
    lint: artifactPathConfigSchema.optional(),
    typecheck: artifactPathConfigSchema.optional(),
    'findings-pool': artifactPathConfigSchema.optional(),
    'tdd-ledger': artifactPathConfigSchema.optional(),
  })
  .catchall(z.unknown());

export const selectionConfigSchema = z
  .object({
    packs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    skills: z
      .object({
        include: z.array(z.string()).default([]),
        exclude: z.array(z.string()).default([]),
      })
      .strict()
      .default({ include: [], exclude: [] }),
    minTier: z.enum(['official', 'community', 'experimental']).optional(),
  })
  .strict()
  .describe('Project-level skill selection (packs / tags / individual skills)');

export const riverReviewerConfigSchema = z.object({
  model: modelConfigSchema.optional(),
  review: reviewConfigSchema.optional(),
  exclude: excludeConfigSchema.optional(),
  security: securityConfigSchema.optional(),
  memory: memoryConfigSchema.optional(),
  context: contextConfigSchema.optional(),
  artifacts: artifactsConfigSchema.optional(),
  selection: selectionConfigSchema.optional(),
  gate: gateConfigSchema.optional(),
});

// --- New Skill-based Schema (for river skills) ---

// Skill-based schemas
// Hybrid model identifier: keep the curated enum for typo protection on
// well-known names, but also accept any string that matches a known provider
// prefix. This lets users adopt newer SDK-supported snapshots (e.g.
// `claude-sonnet-4-6-20260301`, `gpt-4o-mini-2026`) without waiting for an
// enum update PR. Completely foreign prefixes (e.g. `mistral-*`) still fail
// validation upstream, surfacing typos early.
export const KnownAIModels = z.enum([
  'gemini-2.0-flash', // Default: Fast & Smart
  'gemini-2.0-flash-thinking', // Reasoning: For Security/Architecture
  'gemini-2.0-pro', // High Spec
  'gemini-1.5-pro', // Legacy Balanced
  'gpt-4o', // OpenAI Option
  'o1', // OpenAI Reasoning
  'o1-mini', // OpenAI Fast Reasoning
  'claude-sonnet-4-6', // Anthropic Balanced
  'claude-opus-4-7', // Anthropic Top-tier
  'claude-haiku-4-5', // Anthropic Fast
]);

export const AIModelSchema = z.union([
  KnownAIModels,
  z.string().regex(/^(gemini|gpt|o1|claude)-[a-z0-9.\-_]+$/i, {
    message:
      'modelName must be a known model or match a supported provider prefix (gemini-* / gpt-* / o1-* / claude-*)',
  }),
]);

export const RuleSchema = z.object({
  id: z.string().describe('Unique identifier for the rule'),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  description: z.string(),
  context: z.string().describe('Why this matters (Understanding)'),
  patterns: z.array(z.string()).describe('Keywords or patterns to look for'),
  anti_patterns: z.array(z.string()).describe('Bad code examples'),
  fix_guidance: z.string().describe('How to fix it (Expertise Transfer)'),
});

export const SkillSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  files: z.array(z.string()).describe('Glob patterns for target files'),
  exclude: z.array(z.string()).optional(),
  model: AIModelSchema.default('gemini-2.0-flash'),
  temperature: z.number().min(0).max(1).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  // Anthropic-specific: opt out of ephemeral prompt caching for this skill.
  // Useful for skills whose systemPrompt is highly dynamic (where cache
  // misses dominate), or for A/B testing cache impact.
  disableCache: z.boolean().optional(),
  rules: z.array(RuleSchema),
});

export const ConfigSchema = z
  .object({
    version: z.string().default('1.0'),
    model: modelConfigSchema.optional(),
    review: reviewConfigSchema.optional(),
    exclude: excludeConfigSchema.optional(),
    security: securityConfigSchema.optional(),
    memory: memoryConfigSchema.optional(),
    context: contextConfigSchema.optional(),
    artifacts: artifactsConfigSchema.optional(),
    selection: selectionConfigSchema.optional(),
    gate: gateConfigSchema.optional(),
    skills: z.array(SkillSchema).default([]),
  })
  // Allow forward-compatible / custom keys; unknown detection is handled in loader for warnings
  .catchall(z.unknown());
