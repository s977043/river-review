# Metadata Fields

Use these fields to keep skill metadata consistent and easy to route.

| Field          | Purpose                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | Unique identifier (recommended `rr-xxxx` format).                                                                                                                                               |
| `name`         | Human-readable skill name shown in reviews.                                                                                                                                                     |
| `description`  | Short summary of what the skill checks.                                                                                                                                                         |
| `category`     | Primary routing key: `core`, `upstream`, `midstream`, or `downstream`. New skills should use this.                                                                                              |
| `phase`        | Backward-compatibility alias for `category`. New skills should use `category`. Allowed values are `upstream`, `midstream`, `downstream` (`core` is only for `category`).                        |
| `applyTo`      | Glob patterns for files the skill should inspect.                                                                                                                                               |
| `tags`         | Optional classifiers (for example, `security` or `performance`).                                                                                                                                |
| `severity`     | Optional impact level: `info`, `minor`, `major`, `critical`.                                                                                                                                    |
| `inputContext` | Required inputs the skill expects (`diff` / `fullFile` / `tests` / `adr` / `commitMessage` / `repoConfig` / `reviewSelf` / `reviewExternal` / `findingsPool` / `prDescription` / `qaEvidence`). |
| `outputKind`   | Output categories produced (`findings` / `summary` / `actions` / `tests` / `metrics` / `questions` / `review-audit`). Defaults to `findings` if omitted.                                        |
| `modelHint`    | Model selection hint: `cheap` / `balanced` / `high-accuracy`.                                                                                                                                   |
| `dependencies` | Required tools/resources (for example `code_search`, `test_runner`, `adr_lookup`, `repo_metadata`, `coverage_report`, `tracing`, or `custom:*`).                                                |
| `priority`     | Optional ordering hint (lower runs earlier) for deterministic execution when no planner is used.                                                                                                |

`evaluationType` (`deterministic` / `heuristic` / `agentic`) and `deterministicGate` are optional fields that declare which evaluation layer runs the skill. See [Skill Schema](./skill-schema.en.md) for details.

Keep metadata in front matter so it can be parsed before the instructions run. All required fields must pass checks using `/schemas/skill.schema.json`.
