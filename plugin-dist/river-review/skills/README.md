# River Review Skills

This directory contains River Review skills - reusable code review patterns organized by stream category (core/upstream/midstream/downstream).

## What are Skills?

Skills are modular, version-controlled review patterns that encapsulate:

- **Review logic** - What to check and how to check it
- **Context requirements** - What information the skill needs (diff, full file, tests, etc.)
- **Evaluation criteria** - How to measure the skill's effectiveness
- **Test fixtures** - Sample inputs and expected outputs

Each skill is a **first-class asset** with its own version, tests, and documentation.

External evidence: [「AIレビューに渡すskillについての検証」](https://zenn.dev/team_lab/articles/5091dfeeb9deef) (萩沢 / teamLab, 2026-08-26) ran the same Kotlin code twice, with and without a skill. The model was GPT-5.5 at high reasoning effort. A generic unsafe `!!` call was caught either way. The skill-equipped run spent 134,651 tokens against 464,353 without one. Two project-specific rules (an allowed mail-domain check, and a designated time-retrieval helper) were missed without a skill. Both were caught with one, at 128,623 and 130,856 tokens. The author concludes that a skill pays off by stabilizing project-specific rules. Generic bugs are better left to automated checks. Skills here are therefore versioned assets carrying project review logic, not general lint rules.

## Directory Structure

```text
skills/
├── README.md                       # This file
├── registry.yaml                   # Skill catalog
├── _template.md                    # Skill frontmatter template
├── core/                           # Always-on or cross-stream skills (currently empty)
├── upstream/                       # Design & Architecture skills
│   └── <skill-id>/SKILL.md         # One directory per skill (frontmatter + Markdown)
├── midstream/                      # Implementation skills
│   └── <skill-id>/SKILL.md         # Includes community-contributed skills (recommended: false by default)
├── downstream/                     # Testing & Release skills
│   └── <skill-id>/SKILL.md
└── agent-skills/                   # Agent Skills format (entry/router skills; validated by npm run agent-skills:validate)
```

Some skills keep fixtures/prompt/eval assets in sibling folders (e.g. `fixtures/`, `eval/`) inside the skill directory, but the source of truth for each skill is its `SKILL.md`.

## Skill Format

Skills use a single format: YAML frontmatter + Markdown body.

Set `category` to one of `core`, `upstream`, `midstream`, or `downstream` (use `core` for always-on skills). `phase` remains for compatibility but `category` is the primary routing key.

```markdown
---
id: rr-midstream-example-001
name: Example Skill
description: Example skill description
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.ts'
path_patterns: # optional alias for applyTo
  - 'src/**/*.{ts,tsx}'
tags: [sample, midstream]
severity: minor
inputContext: [diff]
outputKind: [findings, actions]
modelHint: balanced
priority: 10
---

## Guidance

- Keep review instructions concise (around 10 lines) and actionable.
- Include Non-goals and False-positive guards to control noise.
```

## Progressive Disclosure and Context Health

For Agent Skills under `skills/agent-skills/`, treat `SKILL.md` as the entrypoint, not as the complete knowledge base.

Keep these in `SKILL.md` because they are needed to activate and execute the skill safely:

- activation / when-to-use criteria
- responsibility and scope boundaries
- routing and delegation rules
- hard safety or policy guards
- output contract and required verification

Move optional or situational material to `references/` and load it only when the task requires it:

- long examples and counterexamples
- troubleshooting and failure histories
- detailed rationale and background
- provider- or framework-specific notes
- rare exceptions and deep operational guidance

`npm run agent-skills:validate` reports a **warning-only** context-health advisory when an Agent Skill entrypoint exceeds either **12 KiB of UTF-8 text** or **250 lines**. These values are review signals, not correctness limits or token estimates. Exceeding them is allowed when the always-needed contract genuinely requires the space; document the reason in review instead of deleting hard guards or verification merely to satisfy the advisory.

The validator intentionally uses deterministic bytes / lines rather than pretending to infer exact model token cost. Re-evaluate the thresholds from dogfood and paired evaluations before considering any hard gate. See #2372 and #2483.

## Creating a New Skill

### Using the Scaffolding Tool (Recommended)

```bash
npm run create:skill
```

This interactive tool will:

1. Prompt for skill metadata (ID, name, description, etc.)
2. Generate a Markdown skill file with YAML frontmatter
3. (Optional) Create fixture/eval folders if needed

### Manual Creation

1. Copy the template:

   ```bash
   mkdir -p skills/<phase>/<skill-id>
   cp skills/_template.md skills/<phase>/<skill-id>/SKILL.md
   ```

2. Fill in the YAML frontmatter (id, name, description, category, applyTo, inputContext, outputKind, priority, etc.)
3. Keep the body concise with Guidance / Non-goals / False-positive guards
4. (Optional) Add fixtures or promptfoo configs under a sibling directory if you need evaluations

## Naming

Rules for naming skills — both when creating a new skill and when importing a concept or implementation from another project. These rules apply to **new names only**; existing names are grandfathered (see [Grandfathered names](#grandfathered-names)).

### Import decision framework (Q0–Q5)

When importing from another project (an OSS tool, another repo's skill, a published technique), decide between "keep the original name" and "rename" with the gates below. Q0 only classifies the input; Q1–Q5 are sequential gates evaluated top-down with early return — the first gate that decides is final.

```text
Q0 (input node). Are you importing the artifact itself, or reimplementing the concept?
    -> Artifact (vendoring / wrapper / bundle): default to keeping the original name; go to Q1
       (Homebrew rule: use the name the project calls itself)
    -> Concept / technique reimplementation: default to renaming; go to Q1
       (fork rule: the name is outside the license)

---- Sequential gates: stop at the first gate that decides ----

Q1 (hard gate, highest priority). Does the original name collide?
   Is there a trademark or origin-confusion risk?
    -> Collides with an id / dir / command name inside this repo: RENAME (unconditional)
    -> Is another company's brand or trademark, or implies the same origin: RENAME (unconditional)
    -> Collides only across the ecosystem (other plugins): if a namespace prefix
       (e.g. `river-review:`) resolves the ambiguity, balance against Q3
       (keeping the original name is allowed)
    Explicit exception: /simplify collides with the built-in simplify skill across the
    ecosystem, but is prefix-resolvable and has high recognition value (Q3), so the
    original name was kept.

Q2. Does the role or meaning change from the original in this repo?
    -> Changes fundamentally: rename
    -> Partial adaptation (definition below): keep the original name + state the origin
    "Partial adaptation" = the core detection/evaluation value is identical to the
    original, and only the application or output mode changes.
    Example: /simplify changed "auto-apply" to "report-only", but the core value
    (readability / duplication / efficiency cleanups) is identical
    -> partial adaptation -> original name kept.

Q3. Is the original name's recognition value high (users search by that name)?
    -> YES: keep the original name + state the origin (subordinate to the Q1 hard gate)

Q4. Does the original name fit this repo's naming family?
    -> NO: rename + state the origin

Q5. None of the above -> coin a new name that states the role
    (name the value, not the mechanism).
```

The framework is a tie-breaker; the final call is made in PR review. The Q0 defaults follow the Homebrew convention for imported artifacts [^homebrew] and the fork convention for concept reimplementations [^fork].

Common rules for either outcome:

- State the origin ("inspired by ..." + link) at the top of `SKILL.md` for every new import. Wording that implies the same origin or an endorsement is not allowed (stay within nominative fair use). This requirement applies to new imports only.
- Never use another company's brand or trademark as a skill name.
- When renaming, keep the original name in `tags` or in the body for searchability.
- Renaming a distributed command requires a calendar-based deprecation window (at minimum 90 days, or an explicit removal version recorded in `docs/deprecated.md`) — never "N releases", which under a weekly release cadence amounts to no grace period.
- When invoking a skill in a multi-plugin environment, use the namespace prefix (`river-review:<name>`) so a same-named skill from another plugin or a stale cache is not resolved by mistake; see [Plugin cache purge](../docs/runbook/plugin-cache-purge.md).

### Naming rules by skill kind

This repo has two naming systems. Do not mix them up.

**Agent skills** (`skills/agent-skills/<dir>/SKILL.md`):

| Field             | Rule                                                                                    | Enforced by                     |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| directory name    | lowercase kebab-case                                                                    | `npm run agent-skills:validate` |
| `metadata.name`   | must equal the directory name (no separate display name)                                | `npm run agent-skills:validate` |
| router skills     | `river-review-<domain>` (e.g. `river-review-code`, `river-review-security`)             | convention                      |
| review techniques | `<value>-review` — name the differentiating value, not the mechanism                    | convention (see note below)     |
| imported skills   | `metadata.metadata.source: agent` may use a generated id (`as-<name>`) as the directory | validator exemption             |

**Registry skills** (`skills/registry.yaml` entries):

| Field  | Rule                                                           | Example                            |
| ------ | -------------------------------------------------------------- | ---------------------------------- |
| `id`   | lowercase kebab-case; the reference and identity key           | `security-privacy-design`          |
| `name` | display name; Title Case, symbols, and Japanese are acceptable | `Security & Privacy Design Review` |

Agent skills use a "directory = name" identity rule; registry skills separate `id` (kebab-case) from `name` (display). Applying Title Case to an agent-skill directory, or forcing kebab-case onto a registry display name, are both wrong.

### Entry-skill `applyTo` coverage (#1508)

An entry/router skill (an agent skill with `references/ROUTING.md` or `entry`/`routing` tags) must let every diff its routed registry skills care about reach the entry. `npm run agent-skills:validate` checks that the entry's `applyTo` covers the union of its routing targets' `applyTo`:

- **Error** — a routed registry skill is unreachable via _every_ entry that routes to it (its `applyTo` is provably disjoint from all of them). This is the #1494 / #1500 failure class.
- **Warning** — a routed skill is reachable, but the entry's `applyTo` never fires on some file category the target declares (e.g. a `.html` extension or a `route.ts` path). Widen the entry's `applyTo`, or exempt it.
- **Exemption** — declare an intentional exclusion in the entry frontmatter so the reason sits next to the `applyTo` block:

  ```yaml
  applyToExemptions:
    - skill: modern-web-performance
      reason: 参照のみ。実行は river-review-performance に据置く。
  ```

Comparisons undecidable for the checker (unsupported glob grammar) degrade to a non-blocking warning, never an error (repo principle #1070, false-positive-first).

### Common prohibitions and consistency

- No organizational nouns (team / manager / helper / util), no names that state only the mechanism, no names that differ from an existing one only by hyphenation, and no collisions with reserved vocabulary already used elsewhere in the repo.
- A skill name should echo **one primary output key** of its output contract (e.g. a consensus-scoring skill echoing `consensusLevel`). Correspondence with every output key is not required.
- Use noun phrases. The rationale is collection-internal consistency (Anthropic accepts noun phrases) [^anthropic]; do not switch the collection to gerunds.
- The `<value>-review` family currently has a single precedent (`adversarial-review`). Align with that precedent for now; revisit the pattern if later additions diverge.
- "When to use" belongs in `description` — `name` is for reference and identity [^anthropic] [^npm].

### Anthropic-derived constraints

- `name` must be at most 64 characters and must not contain the reserved words `anthropic` or `claude` [^anthropic].
- These constraints are codified here but are **not yet enforced by the validators**; the validator work is tracked separately (see issue [#1463](https://github.com/s977043/river-review/issues/1463)).

### Grandfathered names

The rules above apply to new names only. The following existing names are explicitly exempt; renaming any of them requires a dedicated issue with a cost/benefit case:

- `setup-team` (distributed command)
- `review-team` (rename deferred; see issue [#1463](https://github.com/s977043/river-review/issues/1463))
- `teamLeadReport` (JSON output key; kept stable for output consumers)
- imported-skill generated ids (`as-<name>`; already exempted by the validator)

### Sources

[^homebrew]: [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook) — imported artifacts keep the name the project calls itself.

[^fork]: [Open Source Guides: The Legal Side of Open Source](https://opensource.guide/legal/) — reimplementations and forks rename; attribution stays nominative.

[^anthropic]: [Anthropic skill authoring best practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices) — name length and reserved words, avoiding vague names, collection consistency, and description-driven discovery.

[^npm]: [npm package name guidelines](https://docs.npmjs.com/package-name-guidelines) — avoid generic names; typosquat protections.

## Validating Skills

```bash
npm run skills:validate
```

## Testing Skills

### Run promptfoo Evaluation

```bash
cd skills/<phase>/<skill-id>
npx promptfoo eval
```

### Run All Fixture Tests

```bash
npm run eval:fixtures
```

## Stream Categories

### Core

Focus: Always-on checks that apply to every stream (e.g., review policies, global safety rails)

- **Input Context**: Depends on the skill; should avoid heavy or stream-specific assumptions
- **Output**: Cross-cutting guidance or guardrails
- **Examples**: Review policy baselines, output shaping rules

### Upstream (Design & Architecture)

Focus: Design decisions, ADRs, architecture patterns

- **Input Context**: ADR files, design docs, commit messages
- **Output**: Design feedback, alternative suggestions, questions
- **Examples**: ADR quality, API design review, architecture patterns

### Midstream (Implementation)

Focus: Code quality, security, observability

- **Input Context**: Diff, full files, tests
- **Output**: Code findings, refactoring suggestions, security alerts
- **Examples**: Code quality, security scan, observability checks

### Downstream (Testing & Release)

Focus: Test coverage, release readiness

- **Input Context**: Test files, coverage reports, diff
- **Output**: Test recommendations, coverage gaps, release checklist
- **Examples**: Test coverage, integration test review

## Registry

The `registry.yaml` file maintains a catalog of all skills with:

- Skill metadata and versions
- Tag-based categorization
- Recommended skills for common use cases
- Phase-based organization

See [registry.yaml](./registry.yaml) for the complete catalog.

## Best Practices

1. **One skill, one concern** - Keep skills focused on a single review aspect
2. **Write tests** - Add fixtures and golden files for regression testing
3. **Document thoroughly** - Include clear examples and non-goals
4. **Version carefully** - Use semantic versioning for breaking changes
5. **Evaluate regularly** - Run promptfoo evaluations to measure effectiveness

## References

- [Skill Metadata](../pages/reference/skill-metadata.md)
- [Skill Template](./_template.md)
- [promptfoo Documentation](https://www.promptfoo.dev/)
- [River Review Documentation](../docs/policy/DOCUMENTATION.md)
