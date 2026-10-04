# Quickstart (River Review)

The shortest way to try River Review is to **start from a local AI agent**. You do not need to author a Skill from scratch or prepare a CI API key first.

## Path A: Try with Claude Code in five minutes (recommended)

### 1. Add the marketplace

```text
/plugin marketplace add s977043/river-review
```

Pin a release tag when you need a reproducible installation.

### 2. Install the plugin

```text
/plugin install river-review@river-review-marketplace
/reload-plugins
```

### 3. Review the current diff

```text
/river-review:review-local
```

For focused review, bundled Skills include `river-review-security`, `river-review-performance`, `river-review-architecture`, and `river-review-testing`.

> Normal plugin usage needs **no additional River Review LLM API key**. Claude Code's own model applies the Skills.

## Path B: Try with Codex

Codex uses the same plugin marketplace.

```text
codex plugin marketplace add s977043/river-review
```

After the marketplace is added, River Review specialist review skills are registered from `.codex-plugin/plugin.json`. See [Agent workflow](./agent-workflow.en.md) for the full setup and manual copy-in fallback.

## Path C: Add post-PR review with GitHub Actions

Use GitHub Actions when you want a shared post-PR team check. This **headless execution** requires an LLM provider API key.

```yaml
name: River Review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: s977043/river-review/runners/github-action@v1
        with:
          phase: midstream
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

For production use, pin a release tag such as `@v1.124.5`. See the [GitHub Actions guide](./github-actions.en.md) for details.

## What to do next

You do not need to create custom Skills on day one. Use this progression instead:

1. Pick reusable Skills / Skill Packs from the [Starter Cookbook](./starter-cookbook.en.md).
2. Adopt the [two-stage review gate](./two-stage-review-gate.en.md): local before PR, CI after PR.
3. Observe results through [Run store / regression comparison](./track-runs-and-regressions.en.md).
4. Only then codify team-specific judgment with [Creating your first Skill](../tutorials/creating-your-first-skill.en.md).
5. Keep Skill changes safe with fixture / golden / regression evals.

This gives you a progressive path: **use first → observe value → codify only the judgment your team actually needs**.
