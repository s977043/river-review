# River Review

**Turn review into an organizational judgment asset.**  
Review Judgment as Code for AI-assisted development.

[![Documentation](https://img.shields.io/badge/docs-available-blue)](https://river-review.the3396.com/)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13339/badge)](https://www.bestpractices.dev/projects/13339)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/s977043/river-review/badge)](https://securityscorecards.dev/viewer/?uri=github.com/s977043/river-review)

![River Review logo](assets/logo/river-review-logo.svg)

English edition. [日本語 README](./README.md) is the source of truth.

River Review is an OSS framework for keeping review criteria as **versioned, repo-owned Skills** and applying them across plans, diffs, tests, and earlier review evidence. Use the same team criteria in local Claude Code / Codex reviews and in GitHub Actions. It does not replace human approval or auto-merge.

- **Skills define judgment** — Own review criteria and evaluate them with fixtures and golden outputs.
- **Gates execute judgment** — Apply review criteria to plans, diffs, and verification evidence at the review gates that are currently available.
- **Riverbed remembers judgment** — Store decisions and feedback to reduce repeated low-value findings.

[Concept](https://river-review.the3396.com/explanation/concept-en/) / [Capabilities and execution](https://river-review.the3396.com/explanation/what-is-river-review-en/) / [Known limitations](https://river-review.the3396.com/reference/known-limitations.en/)

## Getting Started

### Claude Code (fastest)

```text
/plugin marketplace add s977043/river-review
/plugin install river-review@river-review-marketplace
/reload-plugins
/river-review:review-local
```

### Codex

```text
codex plugin marketplace add s977043/river-review
```

Normal plugin usage **does not need an additional River Review LLM API key**. Headless GitHub Actions and standalone `river run` require a configured LLM provider API key.

For installation options, pinning, and GitHub Actions setup, see the [five-minute Quickstart](https://river-review.the3396.com/guides/quickstart.en/). River Review is distributed via plugins and GitHub Actions, not npm publication. Contributors can run the in-repo CLI with `npm run river -- ...`.

Latest release: [v1.131.0](https://github.com/s977043/river-review/releases/latest)

## What you get

What you get (namespaced by plugin name):

- Commands: `/river-review:setup-team`, `/river-review:review-local`, `/river-review:review-team`, `/river-review:challenge`, `/river-review:skill`, `/river-review:check`, `/river-review:pr`

- Skills: the orchestrator `river-review` plus `river-review-code`, `river-review-security`, `river-review-security-audit`, `river-review-performance`, `river-review-architecture`, `river-review-testing`, `river-review-frontend`, `river-review-docs`, `adversarial-review`, `review-team`, and `unknown-coverage-review` — addressable as `/river-review:<skill-name>`

Before authoring custom Skills, try the [Starter Cookbook](https://river-review.the3396.com/guides/starter-cookbook.en/). Follow [Creating your first Skill](https://river-review.the3396.com/tutorials/creating-your-first-skill.en/) when your team needs a new review criterion.

## Documentation

| Goal | Reference |
| --- | --- |
| First run | [Quickstart](https://river-review.the3396.com/guides/quickstart.en/) |
| Team workflow | [Two-stage review gate](https://river-review.the3396.com/guides/two-stage-review-gate.en/) |
| GitHub Actions | [GitHub Actions guide](https://river-review.the3396.com/guides/github-actions.en/) |
| Skills and schemas | [Skill Catalog](https://river-review.the3396.com/reference/skills-catalog.en/) / [Schema](https://river-review.the3396.com/reference/skill-schema.en/) |
| CLI contract | [CLI reference](https://river-review.the3396.com/reference/runner-cli-reference.en/) |
| Troubleshooting | [Troubleshooting](https://river-review.the3396.com/guides/troubleshooting.en/) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) / [Issues](https://github.com/s977043/river-review/issues) |

The source of truth for official website documentation is `pages/`. Maintainer notes in `docs/` are not included on the published website, but both directories are publicly readable on GitHub. [Documentation policy](docs/policy/DOCUMENTATION.md)

## FAQ

**Does this replace ESLint, type checking, or static analysis?** No. River Review complements deterministic checks with judgment across artifacts such as implementation plans and tests.

**Does a review verdict automatically approve a change?** No. Findings and verdicts are decision inputs; humans or the calling workflow own final GO / NO-GO and approval.

See the [FAQ](https://river-review.the3396.com/guides/faq.en/) and [security model](https://river-review.the3396.com/explanation/security-model-en/) for more.

## Contributing and security

Bug reports, improvements, and documentation contributions are welcome.

- [Contribution guide](.github/CONTRIBUTING.en.md) / [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- [Private vulnerability reporting](.github/SECURITY.md) (do not disclose vulnerabilities in public issues)
- [Practice evolution policy](https://river-review.the3396.com/guides/governance/practice-evolution-en/)

## License

Licensing depends on the type of asset: [LICENSE-CODE](LICENSE-CODE) covers code (MIT), [LICENSE-CONTENT](LICENSE-CONTENT) covers documentation/text/media (CC BY 4.0), and [LICENSE](LICENSE) covers scaffolding/configuration (Apache-2.0). Markdown documents under `.github/` remain content; workflows and configurations remain scaffolding.
