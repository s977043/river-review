---
name: skill-optimizer
description: Evaluate and improve an existing Claude Code skill using explicit success criteria and small controlled changes. Use when the user asks to optimize a skill, reduce over-triggering or under-triggering, improve reliability, tighten instructions, or add evals for a skill. Also trigger on "スキルを改善して", "スキルを最適化して", "スキルの品質を確認して".
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Pipeline
Why: optimization starts with diagnosis against criteria, then applies small changes in a controlled sequence with eval checkpoints.

## Purpose

Improve an existing skill without breaking what already works.

Your job is to:

1. inspect the current skill package
2. define or refine success criteria
3. identify failure modes
4. propose one small change at a time
5. attach each change to an eval hypothesis
6. reject changes that cannot be evaluated

## Core optimization rule

Never apply a large rewrite first.

Optimize in small units:

- description
- gate logic
- workflow order
- examples
- prohibited behaviors
- output contract
- review checklist
- supporting file structure

Change only one major unit per proposal.

## Phase 0: Baseline audit

Inspect:

- current `SKILL.md`
- current `SKILL.md` entrypoint size (UTF-8 bytes / lines) and whether optional knowledge is eagerly loaded
- current supporting files
- invocation settings
- current examples
- current failure reports or user complaints
- existing eval cases if any

Then summarize:

- what the skill is supposed to do
- where it fails
- whether the issue is discovery, execution, or validation

## Phase 1: Success criteria

Define 3 to 6 evaluation criteria.

Each criterion must be:

- specific
- observable
- pass/fail or narrowly scored

Separate:

- trigger quality
- task fidelity
- completeness
- safety / side effects
- output format compliance

## Phase 2: Failure mapping

Classify failures into:

- over-triggering
- under-triggering
- missing context collection
- vague output
- hallucinated assumptions
- skipped verification
- unnecessary tool use
- high token or step cost
- entrypoint context bloat / optional knowledge that should be progressively disclosed

## Phase 2.5: Pattern mismatch diagnosis

Before proposing wording or structure fixes, you must check whether the failure is caused by the wrong pattern or a missing secondary pattern. Do not skip this phase.

Check:

- acts too early on ambiguous input → missing Inversion
- output structure is inconsistent across runs → missing Generator
- returns unvalidated or unchecked output → missing Reviewer
- skips required steps or loses sequence control → missing Pipeline
- lacks domain-specific accuracy → missing Tool Wrapper

If pattern mismatch exists:

- recommend the smallest structural correction first
- do not jump to wording tweaks before resolving the pattern issue

Do not proceed to Phase 3 until pattern mismatch has been evaluated and documented.

## Phase 3: Optimization proposal

For each proposed change, output:

- change id
- exact file to modify
- exact section to modify
- exact change summary
- reason
- expected benefit
- risk
- eval method
- rollback condition

Prefer the smallest useful change.

For context-health failures, move optional examples, troubleshooting, rationale, rare exceptions, or provider-specific detail to supporting references before rewriting behavior. Keep activation, responsibility, routing, hard guards, output contracts, and required verification in the main entrypoint unless an eval proves a safer boundary. In River Review Agent Skills, inspect the warning-only 12 KiB / 250-line advisory from `npm run agent-skills:validate`; do not optimize to the number alone.

## Phase 4: Eval plan

For the recommended next change, define:

- baseline measurement
- test prompts
- grading method
- number of trials
- adoption threshold
- rollback threshold

Use `${CLAUDE_SKILL_ROOT}/assets/eval-rubric-template.md` as the rubric structure.

Default stance:

- do not adopt on a single successful run
- do not accept regressions on critical criteria

## Phase 5: Review

Check against:

- `${CLAUDE_SKILL_ROOT}/references/review-default.md`
- `${CLAUDE_SKILL_ROOT}/references/optimization-playbook.md`

Before finalizing, verify:

- no broad rewrites without evidence
- no hidden assumptions
- no unverifiable claims
- no changes that weaken safety or review steps
- no context reduction that hides always-required routing, hard guards, output contracts, or verification
- no new ambiguity in the description

## Output format

Return exactly these sections:

### Baseline summary

### Success criteria

### Failure modes

### Pattern mismatch diagnosis

### Recommended next change

### Eval plan

### Rollback rule

### Follow-up changes backlog

## Anti-patterns

Do not:

- rewrite the whole skill first
- mix multiple major changes in one proposal
- optimize without a baseline
- optimize only for style
- remove verification to save tokens
- broaden description without evidence

## Failure handling

If the current skill is structurally unsalvageable:

- say so directly
- recommend a replacement design
- explain why incremental optimization is not appropriate
