/**
 * Type declarations for @river-review/core-runner/review-runner
 */

export type Phase = 'upstream' | 'midstream' | 'downstream';
export type ModelHint = 'cheap' | 'balanced' | 'high-accuracy';
export type InputContext =
  | 'diff'
  | 'fullFile'
  | 'tests'
  | 'adr'
  | 'commitMessage'
  | 'repoConfig'
  | 'reviewSelf'
  | 'reviewExternal'
  | 'findingsPool'
  | 'prDescription'
  | 'qaEvidence';
export type Dependency =
  | 'code_search'
  | 'test_runner'
  | 'adr_lookup'
  | 'repo_metadata'
  | 'coverage_report'
  | 'tracing'
  | `custom:${string}`;

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  phase: Phase | Phase[];
  applyTo: string[];
  tags?: string[];
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  body: string;
  path: string;
}

export interface SkillSelectionResult {
  selected: SkillDefinition[];
  skipped: Array<{ skill: SkillDefinition; reasons: string[] }>;
  impactTags?: string[];
  plannerMode?: 'off' | 'order' | 'prune';
  plannerReasons?: Array<{ skill: string; reason: string }>;
  plannerFallback?: boolean;
  plannerError?: string;
  reviewMode?: 'tiny' | 'medium' | 'large';
}

export interface SelectSkillsOptions {
  phase: Phase;
  changedFiles: string[];
  availableContexts?: InputContext[];
  availableDependencies?: Dependency[];
}

export interface BuildExecutionPlanOptions extends SelectSkillsOptions {
  preferredModelHint?: ModelHint;
  skills?: SkillDefinition[];
  diffText?: string;
}

export function matchesPhase(skill: SkillDefinition | SkillMetadata, phase: Phase): boolean;

export function selectSkills(
  skills: SkillDefinition[],
  options: SelectSkillsOptions
): SkillSelectionResult;

export function rankByModelHint(
  skills: SkillDefinition[],
  preferredModelHint?: ModelHint
): SkillDefinition[];

export function buildExecutionPlan(
  options: BuildExecutionPlanOptions
): Promise<SkillSelectionResult>;

export function summarizeSkill(skill: SkillDefinition): {
  id: string;
  name: string;
  description: string;
  phase: Phase | Phase[];
  tags?: string[];
};
