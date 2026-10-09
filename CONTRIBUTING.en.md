# Thank you for contributing to River Review

Thank you for taking the time to make this project better. We welcome bug reports, feature ideas, and documentation improvements.
The Japanese guide in `CONTRIBUTING.md` is the source of truth; this English copy is best-effort.

## ⚖️ Code of Conduct

We aim for an open, welcoming community. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) when you participate.

## Values and OSS practice evolution

River Review follows a [public Practice Evolution policy](https://github.com/s977043/river-review/blob/main/pages/guides/governance/practice-evolution.en.md), guided by agile values, user dialogue, verifiable outcomes, and responsiveness to change. We weigh local evidence and external knowledge to **adopt, adapt, transform, or defer** proposals.

We welcome suggestions that simplify review, reduce false positives, or remove unnecessary process, not just new skills and gates. When possible, share the problem, evidence, smallest useful experiment, and a reason to revisit the decision. This is not a new required template. Existing security, approval, CI, and maintainer authority rules still apply.

## 💡 Ways to contribute

### ✅ Before opening an issue

- Search existing issues (open/closed) to avoid duplicates
- Check docs (`README.md` and `pages/`) for existing answers or policies
- If this may be a security issue, do not open a public issue; follow `SECURITY.md` to report it privately

Use the issue templates via `Issues → New issue` (or [issues/new/choose](https://github.com/s977043/river-review/issues/new/choose)).

### 🗂️ Issue types (rough guide)

- Bug: unexpected behavior, exceptions, incorrect output
- Feature/Enhancement: new capability or improvement (skills, CLI/Action/Docs, etc.)
- Task: concrete work item (roadmap, ops, refactors)
- Documentation: add/fix docs
- Question: ask/discuss (use `question` label for lightweight topics)

### 🐞 Bug reports

If you find a bug, open an issue with:

- **Summary**: What's wrong?
- **Reproduction steps**: Concrete steps so others can reproduce it.
- **Expected behavior**: What you thought would happen.
- **Actual behavior**: What actually happened.

### ✨ Feature proposals

For new checklist items or agent ideas, open an issue with:

- **Clear title**: So the idea is recognizable.
- **Background**: Why this is needed and what problem it solves.

### 📝 Pull request process

1. **Fork** this repository.
2. Clone locally and **create a branch** (`git checkout -b feature/your-feature-name`).
3. Make your changes and commit with a clear message.
4. Run local checks (at least `npm test` and `npm run lint`).
5. **Push** the branch to GitHub (`git push origin feature/your-feature-name`).
6. Open a pull request and follow the PR template to describe your changes.

Smaller, focused PRs are ideal.

### Commit message convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/), enforced by `commitlint` (config: [`commitlint.config.js`](./commitlint.config.js)). The release automation (release-please) uses commit types to generate changelogs, so following the convention matters.

Common commit types with examples:

```text
feat: add YAML output option to review results
fix: handle missing Vale config file gracefully
docs: document GitHub Action input parameters in README
chore: upgrade eslint to v9
```

### What to expect after opening a PR

- **Review turnaround**: A maintainer will look at your PR within 7 days. If you hear nothing, feel free to leave a comment to ask for a status update.
- **Required approvals**: At least 1 maintainer approval is required to merge.
- **CI gates**: All of the following required checks must pass before merging:
  - Lint (`npm run lint` = Prettier format check / dash check / code hygiene / markdownlint / textlint)
  - Unit tests (22.x)
  - Skill schema validation
  - Meta consistency
  - Action dist freshness
  - Integration (CLI)
  - Blocked label guard
- **When a PR may be closed without merge**: PRs with no author response for 30 days, changes out of scope, or work that duplicates an existing effort may be closed. We will always leave a comment explaining the reason before closing.

### ✅ Local checks (recommended)

```bash
npm test
npm run lint
```

Depending on what you change:

- If you changed skills (`skills/`): `npm run skills:validate`
- If you changed Agent Skills (`skills/agent-skills/`): `npm run agent-skills:validate`
- If you changed agent definitions: `npm run agents:validate`
- If you changed tracing functionality: `npm run trace:validate` (when OpenTelemetry validation is needed)

### 📎 Related docs

- Review checklist: `pages/contributing/review-checklist.md`

### 🔒 Security considerations

When making code changes, keep common security pitfalls in mind.

- **Input validation**: Validate data received from external sources (CLI options, file paths, etc.) before use.
- **Dependency vulnerabilities**: Run `npm audit` to check for known vulnerabilities (also checked automatically via the nightly-audit CI job).
- **Secrets**: Never hard-code API keys or tokens in code or config files (`.env*` files must not be committed).
- **Command injection**: Escape arguments when constructing shell commands.

If you have a security concern, please report it privately following `SECURITY.md` rather than opening a public issue.

### 🧭 Coding/ops conventions (summary)

- JS/Node uses ESM; tests use `node --test`
- Formatting is enforced by Prettier (checked via `npm run lint`)
- Do not commit secrets in `.env*` files; use dummy values in examples
- Public documentation lives under `pages/` (Docusaurus). Treat `docs/` as internal materials; avoid direct links from published pages.
- Do not hand-edit `package-lock.json`; update it by running `npm install` when you change dependencies in `package.json` (`npm ci` installs from the lock file)

## 📚 Documentation contributions

River Review docs follow the [Diátaxis documentation framework](https://diataxis.fr/). Choose one type and write to that shape. Japanese (`.md`) is the source of truth; English copies use the same name with `.en.md` and are maintained on a best-effort basis. If content diverges, prefer the Japanese version.

- Tutorial—learning-oriented, step-by-step guides to get new users to a first success.  
  Example: "First steps with River Review on GitHub Actions"

- How-to guide—recipes for achieving a specific goal; the reader already knows the basics.  
  Example: "Add a custom review skill" / "Run River Review locally"

- Reference—accurate, as-complete-as-possible lists of APIs, settings, and schemas.  
  Example: "GitHub Action inputs" / "skill YAML schema"

- Explanation—background, design decisions, and concepts.  
  Example: "Upstream/midstream/downstream model" / "Design principles of River Review"

To keep reviews smooth:

- Place files under the right section (for example, `pages/tutorials/`, `pages/guides/`, `pages/reference/`, `pages/explanation/`). Add English copies in the same location with a `.en.md` suffix.
- State the chosen Diátaxis type in the PR title or description, for example:
  - Docs: Tutorial—Getting started with River Review
  - Docs: How-to—Add a custom skill
  - Docs: Reference—GitHub Action inputs
  - Docs: Explanation—River Review flow model

## ✍️ Document style (dashes)

We standardize dash usage like this:

- Use an em dash (—) with **no spaces** for heading breaks or front-matter titles (example: `Part I—Overview`).
- Use an en dash (–) for numeric ranges (`0.0–1.0`).
- Don't automatically convert dashes inside code blocks or YAML structure.

Automation:

- The repository has a Node script `scripts/fix-dashes.mjs`. Run locally with `npm run fix:dashes`.
- CI and PRs use Vale (Prose Lint) with Microsoft Dashes rules. Run the linter locally before opening a PR.

## 📜 Attribution

This guide was inspired by the [contributing.md template](https://gist.github.com/PurpleBooth/b24679402957c63ec426) and [opensource.guide](https://opensource.guide/how-to-contribute/).
