# Skill Schema

River Review skills use YAML frontmatter for metadata and Markdown for guidance. The metadata fields are validated by `schemas/skill.schema.json`.

## Fields

The required fields are `id` / `name` / `description` / `category`. In addition, the schema requires one of `phase` / `category` / `trigger`, and one of `applyTo` / `files` / `path_patterns` / `trigger` (see the `anyOf` constraint in `schemas/skill.schema.json`).

- `id` (string, required): unique identifier (for example, `design-architecture`); stable across moves/renames.
- `name` (string, required): human-readable skill name.
- `description` (string, required): concise explanation of what the skill checks.
- `category` (string, required): stream classification of the skill. One of `core` / `upstream` / `midstream` / `downstream`. The primary routing key.
- `phase` (string | string[], optional): `upstream` / `midstream` / `downstream`. Kept for backward compatibility; new skills only need `category`. Use an array for multiple values.
- `applyTo` (string[], required\*): glob patterns for files the skill should evaluate. `files` and `path_patterns` are accepted aliases.
- `trigger` (object, optional): wrapper for `phase` and `applyTo` (or `files`). If both top-level and `trigger` values exist, top-level takes precedence.
- `tags` (string[], optional): keywords that group related skills.
- `severity` (string, optional): impact level; one of `info`/`minor`/`major`/`critical`.
- `inputContext` (string[], optional): required inputs the skill expects. Allowed values are `diff` | `fullFile` | `tests` | `adr` | `commitMessage` | `repoConfig` | `reviewSelf` | `reviewExternal` | `findingsPool` | `prDescription` | `qaEvidence`.
- `outputKind` (string[], optional, default `['findings']`): output categories produced by the skill. Allowed values are `findings` | `summary` | `actions` | `tests` | `metrics` | `questions` | `review-audit`.
- `modelHint` (string, optional): model selection hint; one of `cheap`/`balanced`/`high-accuracy`.
- `evaluationType` (string, optional): which evaluation layer runs this skill; one of `deterministic` / `heuristic` / `agentic`. `deterministic` lets an external command decide pass/fail with no LLM, `heuristic` uses pure-code detectors, and `agentic` is LLM-backed. Skills that omit it keep their current behavior, and the `executionOrder` field of the review plan is derived from these declarations. See [Judgment Placement](../explanation/judgment-placement.en.md) for the design principle behind choosing a layer.
- `deterministicGate` (object, optional): declaration of the command run by a skill whose `evaluationType` is `deterministic`. Holds `command` (string, required) / `args` (string[]) / `selfContained` (boolean) / `failSeverity` (`strict_block` | `bypass_warning`, default `strict_block`). `command` is an arbitrary command specified by a repo-owned file, so execution must stay inside the trust boundary (host-approved configuration).
- `dependencies` (string[], optional): downstream tools/resources required. Examples: `code_search` | `test_runner` | `adr_lookup` | `repo_metadata` | `coverage_report` | `tracing` | `custom:*` for extensions.

\* `applyTo` can be substituted with the aliases `files` / `path_patterns`, or with `trigger.files`.

## YAML Example (midstream performance)

```yaml
---
id: performance-en
name: Midstream Performance Budget Check
description: Flag midstream changes that risk latency regressions or heavy resource use.
category: midstream
phase: midstream # kept for backward compatibility
tags:
  - performance
  - latency
severity: major
applyTo:
  - 'src/**/*.ts'
  - 'packages/**/src/**/*.{ts,js}'
---
Ensure changed code paths avoid unnecessary synchronous I/O and unbounded concurrency. Avoid repeated heavy computations. Recommend benchmarks when touching hot paths.
```

## YAML Example with trigger

```yaml
---
id: performance-en
name: Midstream Performance Budget Check
description: Flag midstream changes that risk latency regressions or heavy resource use.
category: midstream
trigger:
  phase: midstream
  files:
    - 'src/**/*.ts'
---
Ensure changed code paths avoid unnecessary synchronous I/O and unbounded concurrency. Avoid repeated heavy computations. Recommend benchmarks when touching hot paths.
```
