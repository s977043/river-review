/**
 * Type declarations for @river-review/core-runner/skill-loader
 */

export type Phase = 'upstream' | 'midstream' | 'downstream';
export type Severity = 'info' | 'minor' | 'major' | 'critical';
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
export type OutputKind =
  'findings' | 'summary' | 'actions' | 'tests' | 'metrics' | 'questions' | 'review-audit';
export type ModelHint = 'cheap' | 'balanced' | 'high-accuracy';
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
  files?: string[];
  tags?: string[];
  severity?: Severity;
  inputContext?: InputContext[];
  outputKind?: OutputKind[];
  modelHint?: ModelHint;
  dependencies?: Dependency[];
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  body: string;
  path: string;
}

export interface LoadSkillsOptions {
  skillsDir?: string;
  schemaPath?: string;
}

export const defaultPaths: {
  repoRoot: string;
  skillsDir: string;
  schemaPath: string;
};

export class SkillLoaderError extends Error {
  constructor(message: string);
}

export function loadSchema(schemaPath?: string): Promise<unknown>;
export function createSkillValidator(schema: unknown): (data: unknown) => boolean;
export function listSkillFiles(dir?: string): Promise<string[]>;
export function parseFrontMatter(
  content: string,
  options?: { filePath?: string }
): { data: Record<string, unknown>; content: string };
export function parseSkillFile(filePath: string): Promise<SkillDefinition>;
export function loadSkillFile(
  filePath: string,
  options?: LoadSkillsOptions
): Promise<SkillDefinition>;
export function loadSkills(options?: LoadSkillsOptions): Promise<SkillDefinition[]>;
export function loadSkillMetadata(
  filePath: string,
  options?: LoadSkillsOptions
): Promise<{ metadata: SkillMetadata; path: string }>;
export function loadAllSkillMetadata(
  options?: Pick<LoadSkillsOptions, 'skillsDir' | 'schemaPath'>
): Promise<Array<{ metadata: SkillMetadata; path: string }>>;
