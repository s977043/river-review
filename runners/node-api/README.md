# Node.js API Runner

Node.js API interface for programmatic usage of River Review in custom applications.

## Overview

The Node API runner provides a TypeScript/JavaScript API for integrating River Review into your Node.js applications. It enables programmatic skill loading, file review, and execution planning without requiring the CLI.

## Package

|         | `@river-review/node-api`                                                                                             | `@river-review/core-runner`                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| npm     | `@river-review/node-api` (not yet published to npm — see [#800](https://github.com/s977043/river-review/issues/800)) | `@river-review/core-runner` (not yet published to npm — see [#800](https://github.com/s977043/river-review/issues/800)) |
| Version | see [package.json](./package.json)                                                                                   | see [core package.json](../core/package.json)                                                                           |

## Installation

```bash
npm install @river-review/node-api
```

## Important Notes

> **⚠️ Current Implementation Status:** The `review()` and `evaluateSkill()` functions currently return execution plans and skill selection results only. They do **not** execute skills with AI providers. Actual AI-powered review execution requires custom AI provider integration. See the [Integration with Custom AI Provider](#integration-with-custom-ai-provider) section for examples.

## Quick Start

```typescript
import { review, loadSkills, buildExecutionPlan } from '@river-review/node-api';

// Build execution plan (note: does not execute AI review)
const results = await review({
  phase: 'midstream',
  files: ['src/**/*.ts'],
  availableContexts: ['diff', 'fullFile'],
});

// Access the execution plan
console.log(`Skills selected: ${results.summary.skillsExecuted}`);
// For actual AI execution, integrate with your AI provider
```

## API Reference

### Core Functions

#### `loadSkills(options?)`

Load all skills from the skills directory with optional filtering.

**Parameters:**

- `options.skillsDir?: string` - Custom skills directory path
- `options.schemaPath?: string` - Custom schema path
- `options.phase?: Phase` - Filter skills by phase

**Returns:** `Promise<SkillDefinition[]>`

**Example:**

```typescript
// Load all skills
const allSkills = await loadSkills();

// Load skills for specific phase
const midstreamSkills = await loadSkills({ phase: 'midstream' });

// Load from custom directory
const customSkills = await loadSkills({
  skillsDir: '/path/to/skills',
});
```

#### `loadSkillFile(filePath, options?)`

Load a single skill file.

**Parameters:**

- `filePath: string` - Absolute path to skill file
- `options.schemaPath?: string` - Optional schema path

**Returns:** `Promise<SkillDefinition>`

**Example:**

```typescript
const skill = await loadSkillFile('/path/to/skill.md');
console.log(skill.metadata.id);
console.log(skill.metadata.name);
```

#### `selectSkills(skills, options)`

Select skills matching review context criteria.

**Parameters:**

- `skills: SkillDefinition[]` - Array of skills to filter
- `options.phase: Phase` - Review phase
- `options.changedFiles: string[]` - Changed file paths
- `options.availableContexts?: InputContext[]` - Available contexts
- `options.availableDependencies?: Dependency[]` - Available dependencies

**Returns:** `{ selected: SkillDefinition[], skipped: Array<{ skill, reasons }> }`

**Example:**

```typescript
const skills = await loadSkills();
const selection = selectSkills(skills, {
  phase: 'midstream',
  changedFiles: ['src/app.ts', 'src/utils.ts'],
  availableContexts: ['diff', 'fullFile'],
});

console.log(`Selected ${selection.selected.length} skills`);
selection.skipped.forEach(({ skill, reasons }) => {
  console.log(`Skipped ${skill.metadata.id}: ${reasons.join(', ')}`);
});
```

#### `buildExecutionPlan(options)`

Build an optimized execution plan with skill prioritization.

**Parameters:**

- `options.phase: Phase` - Review phase
- `options.changedFiles: string[]` - Changed file paths
- `options.availableContexts?: InputContext[]` - Available contexts
- `options.availableDependencies?: Dependency[]` - Available dependencies
- `options.preferredModelHint?: ModelHint` - Preferred model hint (default: 'balanced')
- `options.skills?: SkillDefinition[]` - Pre-loaded skills (optional)
- `options.diffText?: string` - Git diff text for impact analysis

**Returns:** `Promise<SkillSelectionResult>`

**Example:**

```typescript
const plan = await buildExecutionPlan({
  phase: 'midstream',
  changedFiles: ['src/app.ts'],
  availableContexts: ['diff', 'fullFile'],
  preferredModelHint: 'balanced',
  diffText: diffOutput,
});

// Execute skills in priority order
for (const skill of plan.selected) {
  console.log(`Execute: ${skill.metadata.id}`);
  // Custom execution logic here
}
```

#### `review(options)`

Main entry point for programmatic file review.

**Parameters:**

- `options.phase?: Phase` - Review phase (default: 'midstream')
- `options.files?: string[]` - File patterns or paths to review
- `options.baseBranch?: string` - Base branch for diff comparison
- `options.skillsDir?: string` - Custom skills directory
- `options.availableContexts?: InputContext[]` - Available contexts
- `options.availableDependencies?: Dependency[]` - Available dependencies
- `options.preferredModelHint?: ModelHint` - Preferred model hint
- `options.diffText?: string` - Git diff text

**Returns:** `Promise<ReviewResult>`

**Example:**

```typescript
const result = await review({
  phase: 'midstream',
  files: ['src/**/*.ts'],
  availableContexts: ['diff', 'fullFile'],
  preferredModelHint: 'balanced',
});

console.log(`Total findings: ${result.summary.totalFindings}`);
console.log(`Critical: ${result.summary.bySeverity.critical}`);
console.log(`Major: ${result.summary.bySeverity.major}`);
console.log(`Files reviewed: ${result.summary.filesReviewed}`);
```

#### `evaluateSkill(options)`

Evaluate a specific skill (placeholder for AI integration).

**Parameters:**

- `options.skillId: string` - Skill ID to evaluate
- `options.provider: string` - AI provider (e.g., "openai:gpt-4o")
- `options.files?: string[]` - Files to evaluate
- `options.inputContexts?: InputContext[]` - Input contexts
- `options.skillsDir?: string` - Custom skills directory

**Returns:** `Promise<EvaluationResult>`

**Example:**

```typescript
const result = await evaluateSkill({
  skillId: 'security-basic',
  provider: 'openai:gpt-4o',
  files: ['src/app.ts'],
});

if (result.success) {
  console.log(`Execution time: ${result.executionTime}ms`);
}
```

### Utility Functions

#### `getDefaultPaths()`

Get default paths for River Review.

**Returns:** `{ repoRoot: string, skillsDir: string, schemaPath: string }`

```typescript
const paths = getDefaultPaths();
console.log(`Skills directory: ${paths.skillsDir}`);
```

#### `matchesPhase(skill, phase)`

Check if a skill matches a specific phase.

**Parameters:**

- `skill: SkillDefinition | SkillMetadata` - Skill to check
- `phase: Phase` - Phase to match

**Returns:** `boolean`

```typescript
const skill = await loadSkillFile('/path/to/skill.md');
if (matchesPhase(skill, 'midstream')) {
  console.log('Skill applies to midstream');
}
```

#### `rankByModelHint(skills, preferredModelHint?)`

Rank skills by model hint preference.

**Parameters:**

- `skills: SkillDefinition[]` - Skills to rank
- `preferredModelHint?: ModelHint` - Preferred hint (default: 'balanced')

**Returns:** `SkillDefinition[]`

```typescript
const skills = await loadSkills();
const ranked = rankByModelHint(skills, 'high-accuracy');
```

#### `summarizeSkill(skill)`

Create a summary of skill metadata.

**Parameters:**

- `skill: SkillDefinition` - Skill to summarize

**Returns:** `{ id, name, description, phase, tags? }`

```typescript
const skill = await loadSkillFile('/path/to/skill.md');
const summary = summarizeSkill(skill);
console.log(summary);
```

## Type Definitions

### Core Types

```typescript
type Phase = 'upstream' | 'midstream' | 'downstream';
type Severity = 'info' | 'minor' | 'major' | 'critical';
type InputContext = 'diff' | 'fullFile' | 'tests' | 'adr' | 'commitMessage' | 'repoConfig';
type OutputKind = 'findings' | 'summary' | 'actions' | 'tests' | 'metrics' | 'questions';
type ModelHint = 'cheap' | 'balanced' | 'high-accuracy';
type Dependency =
  | 'code_search'
  | 'test_runner'
  | 'adr_lookup'
  | 'repo_metadata'
  | 'coverage_report'
  | 'tracing'
  | `custom:${string}`;
```

### Interfaces

See [src/types.ts](./src/types.ts) for complete type definitions including:

- `SkillMetadata` - Skill metadata structure
- `SkillDefinition` - Complete skill with body and path
- `ReviewOptions` - Options for review function
- `ReviewResult` - Review execution result
- `Finding` - Individual finding structure
- `ReviewSummary` - Summary statistics
- `EvaluationResult` - Skill evaluation result

## Usage Examples

### Basic File Review

```typescript
import { review } from '@river-review/node-api';

async function reviewChanges() {
  const result = await review({
    phase: 'midstream',
    files: ['src/**/*.ts'],
    availableContexts: ['diff', 'fullFile'],
  });

  console.log(`Review complete:`);
  // NOTE: totalFindings is always 0 here — review() returns a plan only, not AI findings.
  // Wire an AI provider (see "Integration with Custom AI Provider" below) for real findings.
  console.log(`- Total findings: ${result.summary.totalFindings}`);
  console.log(`- Skills executed: ${result.summary.skillsExecuted}`);
  console.log(`- Files reviewed: ${result.summary.filesReviewed}`);
}
```

### Custom Skill Loading and Filtering

```typescript
import { loadSkills, selectSkills } from '@river-review/node-api';

async function customReview() {
  // Load all midstream skills
  const skills = await loadSkills({ phase: 'midstream' });

  // Filter for TypeScript files
  const selection = selectSkills(skills, {
    phase: 'midstream',
    changedFiles: ['src/app.ts', 'src/utils.ts'],
    availableContexts: ['diff', 'fullFile'],
  });

  console.log('Selected skills:');
  selection.selected.forEach((skill) => {
    console.log(`- ${skill.metadata.id}: ${skill.metadata.name}`);
  });

  console.log('\nSkipped skills:');
  selection.skipped.forEach(({ skill, reasons }) => {
    console.log(`- ${skill.metadata.id}: ${reasons.join(', ')}`);
  });
}
```

### Execution Planning with Impact Analysis

```typescript
import { buildExecutionPlan } from '@river-review/node-api';
import { execSync } from 'child_process';

async function planReview() {
  // Get git diff
  const diffText = execSync('git diff main', { encoding: 'utf8' });

  // Build execution plan
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/security.ts', 'src/auth.ts'],
    availableContexts: ['diff', 'fullFile'],
    preferredModelHint: 'balanced',
    diffText,
  });

  console.log('Execution plan:');
  console.log(`- Impact tags: ${plan.impactTags?.join(', ')}`);
  console.log(`- Skills to execute: ${plan.selected.length}`);

  plan.selected.forEach((skill, index) => {
    console.log(`${index + 1}. ${skill.metadata.id} (${skill.metadata.modelHint})`);
  });
}
```

### Integration with Custom AI Provider

```typescript
import { loadSkills, buildExecutionPlan } from '@river-review/node-api';
import type { SkillDefinition, Finding } from '@river-review/node-api';

async function executeWithCustomProvider(
  skill: SkillDefinition,
  files: string[]
): Promise<Finding[]> {
  // Custom AI provider integration
  // This is where you would integrate with OpenAI, Anthropic, etc.
  const findings: Finding[] = [];
  // ... your implementation
  return findings;
}

async function customReviewWorkflow() {
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles: ['src/app.ts'],
    availableContexts: ['diff', 'fullFile'],
  });

  const allFindings: Finding[] = [];

  for (const skill of plan.selected) {
    const findings = await executeWithCustomProvider(skill, ['src/app.ts']);
    allFindings.push(...findings);
  }

  console.log(`Total findings: ${allFindings.length}`);
}
```

## AI Provider Integration Guide

This guide explains how to integrate AI providers (OpenAI, Anthropic, etc.) with the River Review Node API to execute skills and generate code review findings.

### Execution Model

The River Review Node API provides **execution plans**, not AI execution. This means:

1. **`review()`** - Returns which skills should be executed and against which files
2. **`buildExecutionPlan()`** - Creates an optimized execution plan with skill prioritization
3. **`evaluateSkill()`** - Currently a placeholder that requires custom AI integration

To perform actual AI-powered code reviews, you must:

1. Build an execution plan using the Node API
2. Pass the skill body and code context to your AI provider
3. Parse the AI response into `Finding` objects
4. Aggregate findings across all executed skills

### Interface Requirements

Your AI provider integration must handle:

**Input to AI Provider:**

- `skill.body` - The skill instructions (markdown text with review criteria)
- `diffText` - Git diff of changes (when `inputContext` includes `'diff'`)
- `fileContents` - Full file contents (when `inputContext` includes `'fullFile'`)
- `skill.metadata` - Skill metadata for context (severity, tags, etc.)

**Output from AI Provider:**

- Structured findings that can be parsed into the `Finding` interface:

```typescript
interface Finding {
  file: string; // File path where finding was detected
  line?: number; // Line number (optional)
  column?: number; // Column number (optional)
  message: string; // Finding description
  severity: Severity; // 'info' | 'minor' | 'major' | 'critical'
  skillId: string; // Skill ID that produced this finding
  suggestion?: string; // Suggested fix (optional)
}
```

### Example: OpenAI Integration

```typescript
import OpenAI from 'openai';
import { buildExecutionPlan, loadSkills } from '@river-review/node-api';
import type { SkillDefinition, Finding, Severity } from '@river-review/node-api';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for structured output
const SYSTEM_PROMPT = `You are a code reviewer. Analyze the provided code according to the skill instructions.

Return findings as a JSON array with this structure:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "severity": "major",
      "suggestion": "How to fix it"
    }
  ]
}

Severity levels:
- "critical": Security vulnerabilities, data loss risks
- "major": Bugs, significant issues that will cause problems
- "minor": Code quality issues, minor improvements
- "info": Suggestions, observations, best practices

If no issues are found, return: { "findings": [] }`;

// Execute a single skill with OpenAI
async function executeSkillWithOpenAI(
  skill: SkillDefinition,
  diffText: string,
  fileContents: Map<string, string>
): Promise<Finding[]> {
  // Build the context based on skill's input requirements
  const inputContexts = skill.metadata.inputContext ?? ['diff'];
  let codeContext = '';

  if (inputContexts.includes('diff')) {
    codeContext += `## Git Diff\n\`\`\`diff\n${diffText}\n\`\`\`\n\n`;
  }

  if (inputContexts.includes('fullFile')) {
    codeContext += '## Full File Contents\n';
    for (const [filePath, content] of fileContents) {
      codeContext += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
  }

  // Build the user prompt
  const userPrompt = `## Skill Instructions
${skill.body}

## Code to Review
${codeContext}

Analyze the code according to the skill instructions and return findings as JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: skill.metadata.modelHint === 'cheap' ? 'gpt-4o-mini' : 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    // Parse the response
    const parsed = JSON.parse(content) as { findings: Array<Omit<Finding, 'skillId'>> };

    // Add skillId to each finding and validate severity
    return parsed.findings.map((f) => ({
      ...f,
      skillId: skill.metadata.id,
      severity: validateSeverity(f.severity, skill.metadata.severity),
    }));
  } catch (error) {
    console.error(`Error executing skill ${skill.metadata.id}:`, error);
    return [];
  }
}

// Validate and normalize severity
function validateSeverity(severity: string | undefined, defaultSeverity?: Severity): Severity {
  const validSeverities: Severity[] = ['info', 'minor', 'major', 'critical'];
  if (severity && validSeverities.includes(severity as Severity)) {
    return severity as Severity;
  }
  return defaultSeverity ?? 'minor';
}

// Main review workflow with OpenAI
async function reviewWithOpenAI(changedFiles: string[], baseBranch = 'main') {
  // Get git diff
  const diffText = execSync(`git diff ${baseBranch}`, { encoding: 'utf8' });

  // Read file contents
  const fileContents = new Map<string, string>();
  for (const file of changedFiles) {
    if (fs.existsSync(file)) {
      fileContents.set(file, fs.readFileSync(file, 'utf8'));
    }
  }

  // Build execution plan
  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles,
    availableContexts: ['diff', 'fullFile'],
    preferredModelHint: 'balanced',
    diffText,
  });

  console.log(`Executing ${plan.selected.length} skills...`);

  // Execute each skill
  const allFindings: Finding[] = [];

  for (const skill of plan.selected) {
    console.log(`  Running: ${skill.metadata.id}`);
    const findings = await executeSkillWithOpenAI(skill, diffText, fileContents);
    allFindings.push(...findings);
  }

  // Summarize results
  const summary = {
    totalFindings: allFindings.length,
    bySeverity: {
      critical: allFindings.filter((f) => f.severity === 'critical').length,
      major: allFindings.filter((f) => f.severity === 'major').length,
      minor: allFindings.filter((f) => f.severity === 'minor').length,
      info: allFindings.filter((f) => f.severity === 'info').length,
    },
    filesReviewed: changedFiles.length,
    skillsExecuted: plan.selected.length,
  };

  return { findings: allFindings, summary };
}

// Usage
const result = await reviewWithOpenAI(['src/app.ts', 'src/utils.ts']);
console.log(`Found ${result.summary.totalFindings} findings`);
```

### Example: Anthropic Integration

````typescript
import Anthropic from '@anthropic-ai/sdk';
import { buildExecutionPlan } from '@river-review/node-api';
import type { SkillDefinition, Finding, Severity } from '@river-review/node-api';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for structured output
const SYSTEM_PROMPT = `You are a code reviewer. Analyze the provided code according to the skill instructions.

Return your findings as a JSON object with this structure:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "severity": "major",
      "suggestion": "How to fix it"
    }
  ]
}

Severity levels:
- "critical": Security vulnerabilities, data loss risks
- "major": Bugs, significant issues
- "minor": Code quality issues
- "info": Suggestions and observations

Return ONLY the JSON object, no additional text.`;

// Select model based on skill's model hint
function selectAnthropicModel(modelHint?: string): string {
  switch (modelHint) {
    case 'cheap':
      return 'claude-3-5-haiku-20241022';
    case 'high-accuracy':
      return 'claude-opus-4-5-20251101';
    case 'balanced':
    default:
      return 'claude-sonnet-4-20250514';
  }
}

// Execute a single skill with Anthropic
async function executeSkillWithAnthropic(
  skill: SkillDefinition,
  diffText: string,
  fileContents: Map<string, string>
): Promise<Finding[]> {
  // Build context based on skill requirements
  const inputContexts = skill.metadata.inputContext ?? ['diff'];
  let codeContext = '';

  if (inputContexts.includes('diff')) {
    codeContext += `## Git Diff\n\`\`\`diff\n${diffText}\n\`\`\`\n\n`;
  }

  if (inputContexts.includes('fullFile')) {
    codeContext += '## Full File Contents\n';
    for (const [filePath, content] of fileContents) {
      codeContext += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
  }

  const userMessage = `## Skill Instructions
${skill.body}

## Code to Review
${codeContext}

Analyze the code and return findings as JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: selectAnthropicModel(skill.metadata.modelHint),
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text content
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return [];
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }

    const parsed = JSON.parse(jsonText.trim()) as {
      findings: Array<Omit<Finding, 'skillId'>>;
    };

    // Add skillId and validate severity
    return parsed.findings.map((f) => ({
      ...f,
      skillId: skill.metadata.id,
      severity: validateSeverity(f.severity, skill.metadata.severity),
    }));
  } catch (error) {
    console.error(`Error executing skill ${skill.metadata.id}:`, error);
    return [];
  }
}

// Validate severity helper
function validateSeverity(severity: string | undefined, defaultSeverity?: Severity): Severity {
  const validSeverities: Severity[] = ['info', 'minor', 'major', 'critical'];
  if (severity && validSeverities.includes(severity as Severity)) {
    return severity as Severity;
  }
  return defaultSeverity ?? 'minor';
}

// Main review workflow with Anthropic
async function reviewWithAnthropic(changedFiles: string[], baseBranch = 'main') {
  const diffText = execSync(`git diff ${baseBranch}`, { encoding: 'utf8' });

  const fileContents = new Map<string, string>();
  for (const file of changedFiles) {
    if (fs.existsSync(file)) {
      fileContents.set(file, fs.readFileSync(file, 'utf8'));
    }
  }

  const plan = await buildExecutionPlan({
    phase: 'midstream',
    changedFiles,
    availableContexts: ['diff', 'fullFile'],
    preferredModelHint: 'balanced',
    diffText,
  });

  console.log(`Executing ${plan.selected.length} skills with Anthropic...`);

  const allFindings: Finding[] = [];

  for (const skill of plan.selected) {
    console.log(`  Running: ${skill.metadata.id}`);
    const findings = await executeSkillWithAnthropic(skill, diffText, fileContents);
    allFindings.push(...findings);
  }

  return {
    findings: allFindings,
    summary: {
      totalFindings: allFindings.length,
      bySeverity: {
        critical: allFindings.filter((f) => f.severity === 'critical').length,
        major: allFindings.filter((f) => f.severity === 'major').length,
        minor: allFindings.filter((f) => f.severity === 'minor').length,
        info: allFindings.filter((f) => f.severity === 'info').length,
      },
      filesReviewed: changedFiles.length,
      skillsExecuted: plan.selected.length,
    },
  };
}

// Usage
const result = await reviewWithAnthropic(['src/app.ts']);
console.log(`Found ${result.summary.totalFindings} findings`);
````

### Error Handling and Rate Limiting

When integrating with AI providers, implement proper error handling and rate limiting:

```typescript
import type { SkillDefinition, Finding } from '@river-review/node-api';

// Simple rate limiter
class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;

  constructor(
    private maxConcurrent: number,
    private minDelayMs: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.running++;
    try {
      const result = await fn();
      await new Promise((resolve) => setTimeout(resolve, this.minDelayMs));
      return result;
    } finally {
      this.running--;
    }
  }
}

// Retry with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit errors
      if (isRateLimitError(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on non-retryable errors
      if (!isRetryableError(error)) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );
  }
  return false;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Retry on network errors, timeouts, and 5xx errors
    return (
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('500') ||
      error.message.includes('502') ||
      error.message.includes('503')
    );
  }
  return false;
}

// Usage with rate limiting and retry
const rateLimiter = new RateLimiter(3, 500); // 3 concurrent, 500ms delay

async function executeSkillsWithRateLimiting(
  skills: SkillDefinition[],
  executeSkill: (skill: SkillDefinition) => Promise<Finding[]>
): Promise<Finding[]> {
  const results = await Promise.all(
    skills.map((skill) => rateLimiter.execute(() => withRetry(() => executeSkill(skill), 3, 1000)))
  );

  return results.flat();
}
```

### Best Practices

1. **Model Selection**: Use `skill.metadata.modelHint` to select appropriate models:
   - `'cheap'`: Use faster/cheaper models (gpt-4o-mini, claude-3-5-haiku)
   - `'balanced'`: Use standard models (gpt-4o, claude-sonnet-4)
   - `'high-accuracy'`: Use most capable models (gpt-4o, claude-opus-4-5)

2. **Token Management**: Skills can have large bodies. Consider truncating diff/file content if needed.

3. **Caching**: Cache skill execution results for unchanged files to reduce API calls.

4. **Parallel Execution**: Execute independent skills in parallel, respecting rate limits.

5. **Error Isolation**: One skill failure should not prevent other skills from executing.

6. **Response Validation**: Always validate and sanitize AI responses before using them.

## Development

### Build

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory and generates type definition files.

### Clean

```bash
npm run clean
```

Remove the `dist/` directory.

## Architecture

The Node API runner is a thin wrapper around the core runner (`@river-review/core-runner`) that provides:

1. **Type Safety**: Full TypeScript type definitions for all APIs
2. **Simplified Interface**: Clean, promise-based API surface
3. **Documentation**: Comprehensive JSDoc documentation
4. **Flexibility**: Support for custom skill directories, phases, and contexts

## Dependencies

- `@river-review/core-runner` - Core skill loading and execution planning

## Related Documentation

- [Core Runner](../core/README.md) - Core execution components
- [Skill Schema](../../schemas/skill.schema.json) - Skill definition schema
- [Skills Directory](../../skills/) - Available skills
- [Project README](../../README.md) - Main project documentation

## Notes

- The `review()` and `evaluateSkill()` functions currently return execution plans but do not execute skills with AI providers. Actual execution requires custom AI provider integration.
- For CLI usage, see the main `river-review` CLI tool.
- This package uses ESM (ES Modules) format.

## License

MIT
