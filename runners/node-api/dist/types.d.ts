/**
 * River Review Node API Type Definitions
 * @module @river-review/node-api
 */
/**
 * Review phase in the SDLC
 */
export type Phase = 'upstream' | 'midstream' | 'downstream';
/**
 * Severity level for findings
 */
export type Severity = 'info' | 'minor' | 'major' | 'critical';
/**
 * Input context types available for skill execution
 */
export type InputContext = 'diff' | 'fullFile' | 'tests' | 'adr' | 'commitMessage' | 'repoConfig' | 'reviewSelf' | 'reviewExternal' | 'findingsPool' | 'prDescription' | 'qaEvidence';
/**
 * Output kind that skills can produce
 */
export type OutputKind = 'findings' | 'summary' | 'actions' | 'tests' | 'metrics' | 'questions' | 'review-audit';
/**
 * Model hint for skill execution cost/accuracy tradeoff
 */
export type ModelHint = 'cheap' | 'balanced' | 'high-accuracy';
/**
 * Dependency types that skills may require
 */
export type Dependency = 'code_search' | 'test_runner' | 'adr_lookup' | 'repo_metadata' | 'coverage_report' | 'tracing' | `custom:${string}`;
/**
 * Skill metadata definition
 */
export interface SkillMetadata {
    /** Unique identifier for the skill */
    id: string;
    /** Human-readable skill name */
    name: string;
    /** Brief description of what the skill checks */
    description: string;
    /** Which SDLC phase(s) this skill applies to */
    phase: Phase | Phase[];
    /** Glob patterns defining which files to check */
    applyTo: string[];
    /** File patterns (alias for applyTo) */
    files?: string[];
    /** Tags for categorization and impact analysis */
    tags?: string[];
    /** Severity level of findings this skill produces */
    severity?: Severity;
    /** Required input contexts */
    inputContext?: InputContext[];
    /** Output kinds this skill produces */
    outputKind?: OutputKind[];
    /** Model hint for execution */
    modelHint?: ModelHint;
    /** Required dependencies */
    dependencies?: Dependency[];
}
/**
 * Complete skill definition with metadata, body, and path
 */
export interface SkillDefinition {
    /** Skill metadata */
    metadata: SkillMetadata;
    /** Skill instruction body (markdown/text) */
    body: string;
    /** File path to the skill definition */
    path: string;
}
/**
 * Options for loading skills
 */
export interface LoadSkillsOptions {
    /** Directory containing skill definitions (default: repo/skills) */
    skillsDir?: string;
    /** Path to skill schema for validation (default: repo/schemas/skill.schema.json) */
    schemaPath?: string;
    /** Review phase filter */
    phase?: Phase;
}
/**
 * Options for reviewing files
 */
export interface ReviewOptions {
    /** Review phase (default: 'midstream') */
    phase?: Phase;
    /** Files to review (glob patterns or file paths) */
    files?: string[];
    /** Base branch for diff comparison */
    baseBranch?: string;
    /** Directory containing skill definitions */
    skillsDir?: string;
    /** Output format for results */
    outputFormat?: 'json' | 'markdown' | 'pr-comment';
    /** Available input contexts */
    availableContexts?: InputContext[];
    /** Available dependencies */
    availableDependencies?: Dependency[];
    /** Preferred model hint */
    preferredModelHint?: ModelHint;
    /** Diff text for impact analysis */
    diffText?: string;
    /**
     * AI provider string for executing skills (e.g. "openai:gpt-4o").
     * When omitted, review() returns an execution plan with zero findings.
     * Supported formats: "openai:<model>" uses OPENAI_API_KEY env var.
     */
    provider?: string;
    /**
     * Maximum number of skills to execute concurrently (default: 3, 0 = unlimited).
     */
    concurrency?: number;
}
/**
 * Skill selection result with selected and skipped skills
 */
export interface SkillSelectionResult {
    /** Skills selected for execution */
    selected: SkillDefinition[];
    /** Skills skipped with reasons */
    skipped: Array<{
        skill: SkillDefinition;
        reasons: string[];
    }>;
    /** Impact tags inferred from changed files */
    impactTags?: string[];
    /** Planner mode used (if applicable) */
    plannerMode?: 'off' | 'order' | 'prune';
    /** Planner reasons (if applicable) */
    plannerReasons?: Array<{
        skill: string;
        reason: string;
    }>;
    /** Whether planner fell back to deterministic ranking */
    plannerFallback?: boolean;
    /** Planner error message (if fallback occurred) */
    plannerError?: string;
    /** Review mode determined by diff size */
    reviewMode?: 'tiny' | 'medium' | 'large';
}
/**
 * Individual finding from a skill execution
 */
export interface Finding {
    /** File path where the finding was detected */
    file: string;
    /** Line number (optional) */
    line?: number;
    /** Column number (optional) */
    column?: number;
    /** Finding message */
    message: string;
    /** Severity level */
    severity: Severity;
    /** Skill ID that produced this finding */
    skillId: string;
    /** Suggested fix (optional) */
    suggestion?: string;
}
/**
 * Summary of review results
 */
export interface ReviewSummary {
    /** Total number of findings */
    totalFindings: number;
    /** Findings by severity */
    bySeverity: {
        critical: number;
        major: number;
        minor: number;
        info: number;
    };
    /** Number of files reviewed */
    filesReviewed: number;
    /** Number of skills executed */
    skillsExecuted: number;
}
/**
 * Metadata about the review execution
 */
export interface ReviewMetadata {
    /** Review phase */
    phase: Phase;
    /** Files reviewed */
    files: string[];
    /** Timestamp of review */
    timestamp: string;
    /** Skills executed */
    skillsExecuted: string[];
    /** Skills skipped */
    skillsSkipped: string[];
}
/**
 * Complete review result
 */
export interface ReviewResult {
    /** All findings from the review */
    findings: Finding[];
    /** Summary statistics */
    summary: ReviewSummary;
    /** Review metadata */
    metadata: ReviewMetadata;
}
/**
 * Options for evaluating a single skill
 */
export interface EvaluateSkillOptions {
    /** Skill ID to evaluate */
    skillId: string;
    /** AI provider configuration (e.g., "openai:gpt-4o") */
    provider: string;
    /** Files to evaluate against */
    files?: string[];
    /** Input contexts to provide */
    inputContexts?: InputContext[];
    /** Custom skill directory */
    skillsDir?: string;
}
/**
 * Result of skill evaluation
 */
export interface EvaluationResult {
    /** Skill that was evaluated */
    skill: SkillDefinition;
    /** Success status */
    success: boolean;
    /** Findings produced (if successful) */
    findings?: Finding[];
    /** Error message (if failed) */
    error?: string;
    /** Execution time in milliseconds */
    executionTime: number;
}
//# sourceMappingURL=types.d.ts.map