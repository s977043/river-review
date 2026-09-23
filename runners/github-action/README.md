# River Review GitHub Action

GitHub Action runner for River Review - a phase-aware code review tool with intelligent skill matching.

## Overview

This GitHub Action is a **thin adapter** around the main River Review CLI: it collects repository/PR context, invokes the bundled CLI (`dist/index.mjs`, an ncc build of `src/cli.mjs`), and converts the result into PR comments and summaries. Skill/pack resolution, gates, and selection semantics all live in the CLI, so resolution behaves identically across the Action, local runs, and agent plugins (see `docs/CLI-architecture.md`).

This GitHub Action allows you to run River Review as part of your CI/CD workflow. It integrates with GitHub pull requests to provide automated code reviews across three phases: upstream (requirements/specs), midstream (implementation), and downstream (testing/deployment).

## Usage

### Basic Example

```yaml
name: River Review

on:
  pull_request:
    branches: [main]

jobs:
  river-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - name: Run River Review
        uses: s977043/river-review/runners/github-action@main
        with:
          phase: midstream
          dry_run: false
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Using in the Same Repository

If you're using this action within the River Review repository itself:

```yaml
- name: Run River Review
  uses: ./runners/github-action
  with:
    phase: midstream
```

## Inputs

| Input          | Description                                                           | Required | Default     |
| -------------- | --------------------------------------------------------------------- | -------- | ----------- |
| `phase`        | Review phase (`upstream`, `midstream`, or `downstream`)               | No       | `midstream` |
| `planner`      | Planner mode (`off`, `order`, or `prune`)                             | No       | `off`       |
| `reviewers`     | Reviewer roles (comma-separated canonical roles or `auto`)                | No       | ``          |
| `target`       | Path to the git repository to review                                  | No       | `.`         |
| `comment`      | Post a PR comment with results (only on pull_request events)          | No       | `true`      |
| `dry_run`      | Run in dry-run mode (no external API calls, print to stdout)          | No       | `true`      |
| `debug`        | Print debug information (merge base, token estimates, prompt preview) | No       | `false`     |
| `estimate`     | Estimate cost only without running the review                         | No       | `false`     |
| `max_cost`     | Abort if estimated USD cost exceeds this value                        | No       | ``          |
| `node_version` | Node.js version to use                                                | No       | `20`        |

### Review Coverage Gate

Review Coverage is opt-in. To make incomplete reviewer execution fail the GitHub Actions job, enable all three conditions:

```yaml
- name: Run River Review with coverage gate
  uses: s977043/river-review/runners/github-action@main
  with:
    gate: true
    reviewers: bug-hunter,security-scanner
  env:
    RIVER_GATE_COVERAGE: '1'
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

`reviewers: auto` is also supported. Reviewer names are forwarded to the CLI unchanged, so the CLI remains the validation and vocabulary source of truth.

## Phases

River Review operates in three distinct phases:

- **upstream**: Reviews requirements, specifications, API definitions, and ADRs
- **midstream**: Reviews implementation code changes
- **downstream**: Reviews tests, deployment configurations, and documentation

## Planner Modes

- **off**: No planning, review all changed files
- **order**: Order files by dependency and review in sequence
- **prune**: Prune unrelated files before review

## Examples

### Upstream Review (Requirements/Specs)

```yaml
- name: Run River Review (upstream)
  uses: s977043/river-review/runners/github-action@main
  with:
    phase: upstream
    dry_run: false
    debug: true
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Midstream Review with Cost Estimation

```yaml
- name: Estimate Review Cost
  uses: s977043/river-review/runners/github-action@main
  with:
    phase: midstream
    estimate: true
    max_cost: '5.00'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Review with Planner (Order Files)

```yaml
- name: Run River Review with Planner
  uses: s977043/river-review/runners/github-action@main
  with:
    phase: midstream
    planner: order
    dry_run: false
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Multiple Phases

```yaml
jobs:
  upstream-review:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.changed_files, 'docs/requirements') || contains(github.event.pull_request.changed_files, 'docs/specs')
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: s977043/river-review/runners/github-action@main
        with:
          phase: upstream
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

  midstream-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: s977043/river-review/runners/github-action@main
        with:
          phase: midstream
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Environment Variables

The action requires API credentials to function. Pass at least one of the following, matching the `modelName` configured in `.river-review.json`:

- `OPENAI_API_KEY` (or `RIVER_OPENAI_API_KEY`): for `gpt-*` / `o1-*` models
- `GOOGLE_API_KEY`: for `gemini-*` models
- `ANTHROPIC_API_KEY` (or `RIVER_ANTHROPIC_API_KEY`): for `claude-*` models

Set these as GitHub secrets in your repository settings.

For provider-specific `.river-review.json` snippets (Anthropic / OpenAI / Gemini), see the [main README](../../README.md) and the [GitHub Actions guide](../../pages/guides/github-actions.md).

## Permissions

The action requires the following GitHub token permissions:

```yaml
permissions:
  contents: read # Read repository contents
  pull-requests: write # Post comments on pull requests
```

## Architecture

This action is part of the River Review runners architecture:

```text
runners/
├── github-action/     # This GitHub Action
│   ├── action.yml
│   ├── post-comment.cjs
│   └── README.md
└── core/              # Shared runner logic
    ├── review-runner.mjs
    └── skill-loader.mjs
```

The action uses the core runner components to:

1. Load phase-appropriate skills
2. Execute reviews using the configured LLM
3. Format and post results as PR comments

## Troubleshooting

### Action Fails with "file not found"

Ensure you have `fetch-depth: 0` in your checkout step to get the full git history:

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0
```

### No PR Comment Posted

1. Check that `comment: true` is set (default)
2. Verify the workflow has `pull-requests: write` permission
3. Ensure the event is a `pull_request` (not `push`)

### Cost Too High

Use the `estimate` and `max_cost` options to control costs:

```yaml
with:
  estimate: true
  max_cost: '1.00'
```

### Dry Run Mode

By default, `dry_run: true` prevents actual API calls. Set to `false` for production:

```yaml
with:
  dry_run: false
```

## Development

This action is part of the River Review monorepo. For local development:

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Run linter
npm run lint
```

## License

See the [main repository](https://github.com/s977043/river-review) for license information.

## Support

For issues, questions, or contributions, please visit the [River Review repository](https://github.com/s977043/river-review).
