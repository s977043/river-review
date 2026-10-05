---
name: skill-creator
description: Design a new Claude Code skill from a concrete use case and produce a repo-ready skill package. Use when the user asks to create a new skill, define a skill's responsibility, draft SKILL.md, choose frontmatter, design supporting files, or prepare eval criteria for a new skill. Also trigger on "スキルを作りたい", "スキルを作って", "スキルを追加して", "新しいスキル", "SKILL.md生成".
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## Pattern declaration

Primary pattern: Pipeline
Secondary patterns: Inversion
Why: skill creation requires strict phase order (requirements → pattern selection → structure → review) with an upfront question-gathering gate.

## Purpose

Create a new skill only after the use case is concrete enough.

Your job is to:

1. identify the smallest useful responsibility
2. select the right design pattern
3. define when the skill should trigger
4. choose safe frontmatter defaults
5. draft a minimal but strong `SKILL.md`
6. propose supporting files only when they add clear value
7. define an initial eval set

## Safety constraints

Write output files only to `.claude/skills/` unless the user explicitly specifies a different path.
Do not modify existing skills without user confirmation.

Note: this skill does not set `disable-model-invocation: true` because file creation is its primary purpose, not an incidental side effect. The settings.json deny list and user confirmation prompts provide sufficient guardrails.

## Core rule

Do not create a broad or fuzzy skill.

Prefer:

- one responsibility
- one primary workflow
- one clear success condition

If the requested scope is too broad, split it into multiple skills.

## Phase 0: Gate

Before drafting, confirm:

- target outcome
- primary user intent
- trigger phrases
- audience
- allowed tools needed
- whether the skill should be auto-invoked or manual-only
- source material available
- definition of done

If any item is unclear:

- ask the minimum focused questions, or
- inspect available files first if the answer can be found without asking

Do not draft the full skill until the gate passes.

## Phase 0.5: Pattern selection

Choose the primary design pattern before drafting the skill.

Available patterns:

- Tool Wrapper — the skill mainly injects domain, library, or framework knowledge on demand
- Generator — the skill mainly produces structured output from a reusable template
- Reviewer — the skill mainly evaluates output against a checklist or rubric
- Inversion — the skill must gather missing information before acting
- Pipeline — the skill must enforce a strict multi-step workflow with checkpoints

Selection rules:

1. identify the primary value source or failure mode the skill addresses
2. map it to one primary pattern
3. add secondary patterns only when one pattern is insufficient
4. each secondary pattern must appear in a named phase with a measurable role

Do not continue until the pattern choice is explicit.

## Phase 1: Skill boundary design

Produce a short working summary with:

- skill name candidate
- single responsibility
- in-scope tasks
- out-of-scope tasks
- likely trigger language
- risk level

Reject designs that combine unrelated workflows.

## Phase 2: Frontmatter design

Choose frontmatter intentionally.

Defaults:

- include `name`
- include `description`
- omit extra fields unless clearly needed

Use:

- `disable-model-invocation: true` for side-effecting, sensitive, or timing-dependent workflows
- `allowed-tools` only when safe pre-approval is clearly useful
- `model` only when there is a concrete reason to override the default

For every chosen field, state why it is needed.

## Phase 3: Structure design

Draft the skill with this order:

1. pattern declaration
2. purpose
3. gate
4. workflow phases
5. output contract
6. review step
7. failure handling
8. additional resources

Keep the main file compact.
Move heavy references, examples, and templates into separate files.
For River Review Agent Skills, keep activation, responsibility, routing, hard guards, and the output contract in `SKILL.md`; move optional examples, troubleshooting, rationale, and provider-specific detail to `references/`. Treat the repository's 12 KiB / 250-line context-health threshold as an advisory review signal, never as a reason to remove safety or verification.

Use `${CLAUDE_SKILL_ROOT}/assets/basic-skill-template.md` as the starting skeleton.

The generated SKILL.md must include a Pattern declaration section at the top with primary pattern, secondary patterns, and Why fields matching the choice from Phase 0.5.

## Phase 4: Eval design

Create an initial eval plan with:

- 10 to 20 realistic test prompts
- 3 to 6 pass/fail criteria
- likely failure modes
- what should be checked by code vs by reviewer

Include at least:

- one trigger test
- one under-specified request
- one boundary case
- one anti-pattern case

Use `${CLAUDE_SKILL_ROOT}/assets/eval-rubric-template.md` as the rubric structure.

## Phase 5: Review

Check the draft against:

- `${CLAUDE_SKILL_ROOT}/references/review-default.md`
- `${CLAUDE_SKILL_ROOT}/references/design-principles.md`

Fix any issue before finalizing.

## Phase 6: Registration

After the skill files are written:

1. verify the directory name matches the `name` field in frontmatter
2. verify `description` is under 1024 characters and includes trigger keywords
3. measure the `SKILL.md` entrypoint size and review whether optional knowledge should move to supporting files
4. for River Review Agent Skills, run `npm run agent-skills:validate` and inspect any context-health advisory; exceeding 12 KiB / 250 lines is warning-only and requires judgment, not blind trimming
5. verify all `${CLAUDE_SKILL_ROOT}/` references point to existing files
6. check the repository CLAUDE.md or AGENTS.md for additional registration steps
7. if the repository uses a skills index or registry, update it

## Output format

Return exactly these sections:

### Skill summary

### Pattern selection

### Recommended directory structure

### SKILL.md draft

### Supporting files to add

### Eval plan

### Known risks

## Anti-patterns

Do not:

- create a "do everything" skill
- invent company-specific rules
- write a vague description
- skip the gate
- skip pattern selection
- omit eval planning
- hide trade-offs
- stack multiple patterns without justifying each one

## Failure handling

If the request is too broad:

- propose 2 to 4 smaller skills
- explain the split by responsibility
- recommend which one to build first
