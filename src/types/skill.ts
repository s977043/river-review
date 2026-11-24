export type Phase = 'upstream' | 'midstream' | 'downstream';
export type StreamCategory = 'core' | Phase;
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

export interface SkillTrigger {
  phase?: Phase | Phase[];
  applyTo?: string[];
  files?: string[];
  path_patterns?: string[];
}

interface SkillFrontmatterBase {
  id: string;
  name: string;
  description: string;
  category?: StreamCategory;
  phase?: Phase | Phase[];
  applyTo?: string[];
  files?: string[];
  path_patterns?: string[];
  trigger?: SkillTrigger;
  tags?: string[];
  severity?: Severity;
  inputContext?: InputContext[];
  outputKind?: OutputKind[];
  modelHint?: ModelHint;
  dependencies?: Dependency[];
  priority?: number;
  version?: string;
  model?: string;
  prompt?: {
    system?: string;
    user?: string;
  };
  eval?: {
    promptfoo?: string;
  };
  fixturesDir?: string;
  goldenDir?: string;
}

export type SkillFrontmatter = SkillFrontmatterBase;

export interface SkillMetadata extends SkillFrontmatter {
  category: StreamCategory;
  phase: Phase | Phase[];
  applyTo: string[];
  outputKind?: OutputKind[];
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  body: string;
  path: string;
}

// Agent Skills bridge types
export type SkillSource = 'agent' | 'rr';

export interface AgentSkillMeta {
  source: SkillSource;
  originPath: string;
  [key: string]: unknown;
}

export interface AgentSkillParsed {
  metadata: Record<string, unknown>;
  body: string;
  dirPath: string;
  assets: Record<string, string>;
}
