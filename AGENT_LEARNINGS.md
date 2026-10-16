# AGENT_LEARNINGS.md — River Review

## Purpose

- Store durable, reusable repo-specific learnings for future agents.
- Keep this file focused on facts that help across branches and sessions.

## Write Rules

- Add only stable observations that have been verified in the repository.
- Capture one learning per bullet with enough context to reuse it.
- Record secrets, personal data, transient debugging notes, and branch-specific TODOs nowhere in this file.
- Prefer facts that change slowly: command shapes, package boundaries, validation rules, source-of-truth files, and recurring pitfalls.
- Do not duplicate facts already stated in `AGENTS.md`. Only record what is not obvious from the canonical instructions.
- Remove or update entries when the underlying fact changes. Review during major refactors.

## Entry Format

- `YYYY-MM-DD`: short learning statement.
- `Applies to`: where the learning matters.
- `Evidence`: file or command that confirmed it.

## Current Learnings

- `2026-04-03`: LLM feature guards use `isLlmEnabled()` from `src/lib/utils.mjs`. It checks both OpenAI (`OPENAI_API_KEY`, `RIVER_OPENAI_API_KEY`) and Google Gemini (`GOOGLE_API_KEY`) keys.
  - `Applies to`: any code that conditionally enables LLM-powered features.
  - `Evidence`: `src/lib/utils.mjs`, `src/lib/local-runner.mjs`, `src/core/skill-dispatcher.mjs`.
- `2026-04-03`: Use Git Worktrees for parallel agent tasks. Setup and teardown steps are documented in `docs/runbook/dev.md` § 並行タスク。
  - `Applies to`: concurrent branch work and multi-agent workflows.
  - `Evidence`: `docs/runbook/dev.md`「並行タスク（Git Worktree）」セクション。
- `2026-04-30`: Suppression matching is keyed by **fingerprint** (file + issue pattern hash), not by message text. Severity `major` / `critical` only auto-suppress when the entry sets `feedbackType: accepted_risk`; lower severities pass through automatically. The hard-coded `HIGH_SEVERITY` set in `suppression-apply.mjs` is the P1 guard that protects against silently dropping security/risk findings.
  - `Applies to`: any change to suppression policy, fingerprint stability, or feedback-loop UX.
  - `Evidence`: `src/lib/finding-factory.mjs` (`annotateFingerprints`), `src/lib/suppression-apply.mjs`, `schemas/suppression-context.schema.json`, `pages/guides/repo-wide-review.md` "false positive suppression" section.
- `2026-04-30`: Context budgets are tuned via three knobs that all apply simultaneously: `maxTokens` (256–64000), `maxChars` (1024–200000), and per-section caps (`fullFile` / `tests` / `usages` / `config`). The collector takes `Math.min` across all of them. `reviewMode: tiny | medium | large` selects a preset (1024 / 4000 / 16000 max tokens) only when `context.budget` is omitted; an explicit `budget` always wins. The token estimator is a CJK-aware heuristic with a safe upper bound (chars/2), not a real tokenizer.
  - `Applies to`: tuning prompt size, debugging "context too small" reports, choosing reviewMode for new model classes.
  - `Evidence`: `src/lib/context-presets.mjs`, `src/lib/token-estimator.mjs`, `src/lib/repo-context.mjs` budget computation.
- `2026-04-30`: Secret redaction is **multi-stage** by design. Deny-glob runs BEFORE files are read (`.env*` / `*.pem` / `*.key` / `secrets.*` never enter process memory). Content-level redaction runs AFTER read with named categories plus an entropy fallback (default 4.5 bits / char, 24-char minimum). Replacements use length-stable `<REDACTED:category>` so suppression fingerprints stay deterministic across redaction. Final boundary redaction in `review-engine.mjs` covers prompt previews and debug output. Allowlist is for fixed test fixtures only.
  - `Applies to`: any change touching repo-wide context, prompt construction, or debug observability.
  - `Evidence`: `src/lib/secret-redactor.mjs`, wiring at `src/lib/repo-context.mjs` / `local-runner.mjs` / `review-engine.mjs`, `pages/guides/repo-wide-review.md` "secret redaction" section.

- `2026-05-03`: Root scripts assume Node.js `22.x`; running validations on older Node versions can fail before repo logic executes.
  - `Applies to`: local/CI execution of `npm run lint`, `npm test`, and validation scripts.
  - `Evidence`: `package.json` `engines.node` is pinned to `22.x`.

- `2026-05-24`: release-please often leaves a PR in `mergeStateStatus: BLOCKED` because the required CI checks did not register on the auto-generated branch (only `Vercel` appears). Fix: advance the branch by one empty commit. When local `git push` is unavailable (e.g. macOS Full Disk Access revoked the working tree), do it entirely via the gh REST API:

  ```bash
  REPO=s977043/river-review
  BRANCH=release-please--branches--main--components--river-review
  PARENT=$(gh api repos/$REPO/git/refs/heads/$BRANCH --jq '.object.sha')
  TREE=$(gh api repos/$REPO/git/commits/$PARENT --jq '.tree.sha')

  NEW=$(gh api repos/$REPO/git/commits --method POST --input - <<EOF | jq -r .sha
  { "message": "chore: trigger CI", "tree": "$TREE", "parents": ["$PARENT"] }
  EOF
  )

  gh api -X PATCH repos/$REPO/git/refs/heads/$BRANCH --input - <<EOF
  { "sha": "$NEW" }
  EOF
  ```

  Once the ref advances, the required status checks re-register and the PR transitions BLOCKED → CLEAN.
  - `Applies to`: release-please workflow recovery, fs-loss / sandbox-restricted environments, any case where the branch head must advance without a local checkout.
  - `Evidence`: validated on PR #876 (v0.53.0) during a session where the working tree was inaccessible; the BLOCKED → CLEAN → squash-merge → release-publish flow completed entirely via gh API.

- `2026-07-09`: `git commit --no-verify` skips the lint-staged pre-commit hooks, including the `skills/**/*.md` step that runs `npm run skills:manifest && git add docs/data/skill-manifest.json`. Committing skill-doc edits with `--no-verify` therefore leaves `docs/data/skill-manifest.json` stale, and the CI `Skill schema validation` job (`skills:manifest:check`) fails with "skill manifest is stale". After editing `skills/**/*.md`, either commit without `--no-verify`, or run `npm run skills:manifest` and stage `docs/data/skill-manifest.json` in the same commit. The same bypass also drops `check:dashes` / `prettier --write` / `markdownlint --fix` on `**/*.md` and `textlint --no-cache` on `pages/**`.
  - `Applies to`: any commit that edits `skills/**/*.md` (especially `skills/agent-skills/**`) and uses `--no-verify`.
  - `Evidence`: `.lintstagedrc.json` `skills/**/*.md` block; PR #1447's first commit failed CI `Skill schema validation`, fixed by regenerating the manifest in the second commit.

- `2026-07-11`: When a review bot's comment claims a reproducible behavior change (a crash, a wrong output, a missed detection), attempt the reproduction before dismissing the comment on consistency/convention grounds. Consistency-based skips are valid only for comments that make no behavior claim (link style, vocabulary, formatting).
  - `Applies to`: triaging gemini/Codex review-bot comments on PRs, especially "consistency" or "convention" dismissals.
  - `Evidence`: gemini flagged the `realpathSync` ENOENT crash in 5 comments across #1475/#1479; the skips cited "canonical-form consistency", then Codex reproduced the crash (`printf "import '<script>';" | node --input-type=module -`) proving a real import-time regression, fixed in #1483.

- `2026-07-11`: Four techniques proven during the #1473 refactor wave (all merged with zero behavioral regressions in CI) go beyond "the tests still pass" when verifying a behavior-invariant refactor: (a) extract the pre-change function body from real source text into a standalone snapshot module and byte-diff its outputs across all inputs (used for the 18-kind message switch in #1480); (b) run the same CLI commands on a temp git repo before/after and byte-diff stderr/exit codes (#1477); (c) prove "not even imported when opted out" invariants with an injected import spy (#1478); (d) pin generated artifacts with `git diff --quiet` after regeneration (#1481).
  - `Applies to`: reviewing or authoring refactor PRs that claim behavior-invariance.
  - `Evidence`: #1473 (refactor wave issue); #1477, #1478, #1480, #1481 (merged PRs applying each technique).

- `2026-07-11`: The commit-msg hook (`@commitlint/config-conventional`) rejects subjects whose first token after the type is sentence-/start-/pascal-/upper-case — e.g. `docs: AGENTS.md の...` fails with `subject-case`. Start the subject with a lowercase word or Japanese text; when the subject naturally starts with a proper noun or filename, prefix a lowercase action verb instead (e.g. `docs: update AGENTS.md ...`).
  - `Applies to`: any `git commit` on this repo, especially docs commits that would otherwise start with a proper noun or filename.
  - `Evidence`: masked historically by `--no-verify` usage (see the 2026-07-09 entry above); observed on #1450's fix commit.

- `2026-07-11`: Recurring false-positive patterns from review bots in this repo — safe to skip with the named evidence (complements the reproduce-before-dismissing guard above, which covers when skipping is WRONG): (1) link-form suggestions that ignore the rendering context — relative links from `pages/` to repo-internal files 404 on the Docusaurus site, and bare `#N` refs do not auto-link in rendered .md files; check the actual rendering target first. (2) manual table/spacing alignment suggestions that fight the formatting SSoT — run `npx prettier --check <file>`; if it passes, the layout is canonical. (3) defensive-programming fallbacks (`?? {}` etc.) on code whose stated design intent is fail-fast — the fallback can reintroduce the exact silent-failure mode the code was built to eliminate; judge against the module's intent.
  - `Applies to`: triaging bot review comments (link / formatting / defensive-programming suggestions) on PRs.
  - `Evidence`: skips held without reversal on #1451 (prettier-verified table), #1464 (Docusaurus 404 + bare-ref behavior, 4 comments), #1476 (`unknown` typing), #1480 (fail-fast registry) — contrast with the reversed `realpathSync` skips (#1475/#1479) covered by the reproduce guard.

- `2026-07-12`: An entry skill (agent-skills router, e.g. `river-review-frontend`)'s `applyTo` must be derived from the **union of its routing-target registry skills' `applyTo`** (excluding overly broad globs), not designed independently from the entry's own intuition. Two incidents were caught only by human review (verifying a gemini line comment), never by CI: #1494 (`unknown-coverage-review`'s Gate declaration described a "config file" trigger, but `applyTo` had no config glob, so config-only diffs never fired the skill) and #1500 (`river-review-frontend`'s `applyTo` did not reach Next.js `route.ts` files or React Router resource routes, leaving several routed skills unreachable on keyword-less diffs). When creating a new entry skill or adding a routing target, cross-check the target registry skills' frontmatter `applyTo` before writing the entry's `applyTo`. Treat a "just add a broad `src/**` glob to the entry" suggestion with suspicion — the #1500 disposition explicitly rejected widening to all of `src/**` because it would reintroduce double-firing with `river-review-code` (the skill the entry route was moved out of), and instead added the narrower `src/routes/**` / `components/**` patterns that actually match the routed skills' own `applyTo` (FP-first principle, `.claude/rules/review-core.md` #1070).
  - `Applies to`: creating or extending `skills/agent-skills/` entry/router skills (e.g. adding a routing target to `river-review-frontend/references/ROUTING.md` or a similar router's routing table).
  - `Evidence`: PR #1494 gemini review comment + disposition (commit `c2ca20a`); PR #1500 gemini review comment + disposition (commit `7df1c20f`).

- `2026-07-12`: A permanently-dry-run integration path (a code path that has never been exercised with a real call) accumulates undetected inconsistencies until the moment it is enabled, at which point they surface all at once. The CI LLM review path was sealed twice over — `dry_run: true` left on indefinitely, and no API key configured — so `generateReview` → `callChatCompletion` never actually ran in CI. When it was finally enabled (#1526), two independent latent bugs surfaced immediately: a prompt-construction conflict where an `additionalInstructions` config value collided with the required single-line output format (fixed in #1529), and an all-or-nothing finding-validation fallback where a single malformed finding discarded the entire valid batch (fixed in #1533). Neither bug was reachable by unit tests or by `eval:fixtures`-style checks, because `src/lib/review-fixtures-eval.mjs` itself runs with `dryRun: true` and therefore never inspects a real LLM response. **New integration paths must be exercised end-to-end at least once, with a real call, in the PR that introduces them** — a permanently-off dry-run flag is not a substitute for that.
  - `Applies to`: any new LLM/external-API integration path gated behind a feature flag, dry-run mode, or missing-credential fallback; evaluating whether `eval:fixtures`-style checks provide real coverage.
  - `Evidence`: #1526 (GitHub Models switch-on, real first invocation), #1529 (prompt-format conflict found only via real LLM output), #1533 (all-or-nothing fallback found only via real LLM output); `src/lib/review-fixtures-eval.mjs` uses `dryRun: true`.

- `2026-07-12`: For changes to the LLM review path, run a real end-to-end check before merging by attaching the `river-review` label to the PR that carries the change itself — the `pull_request` event runs the workflow against the PR's merge ref, so the post-change code path executes for real before merge. This catches regressions that 100%-passing unit tests do not: the #1526 self-PR E2E discovered the `parseLineComments` parse failure that #1529 went on to fix, and the #1533 self-PR E2E caught a self-regression (findings misclassified as `NO_ISSUES`) introduced by #1533's own fix, which was corrected before merge.
  - `Applies to`: any PR that changes `src/lib/review-engine.mjs`, prompt construction, finding parsing/validation, or `.github/workflows/river-review.yml` LLM-related env/config.
  - `Evidence`: #1526 PR body "検証計画" (self-label E2E plan); #1529 root-cause section (T64, found via #1526's E2E run); #1533 "Repro & Validation" (found via #1529's E2E run) and "Monitoring" (states its own self-PR E2E check).

- `2026-07-12`: A newly added debug/observability output path can bypass an existing redaction invariant even when the parsed data it derives from is already masked. `debug.rawLlmOutput` was added in #1529 to expose the raw LLM response for parse-failure debugging, but it stored the response _before_ `redactSecrets` (the masking already applied to `parseLineComments`-parsed comments) — so any secret present in the raw LLM output would have flowed unmasked into `printDebugInfo`'s CI log output. Caught by a gemini security-high review comment, not by tests. Fix: apply `redactSecrets` at the **storage site** (`debug.rawLlmOutput = redactSecrets(output)` in `src/lib/review-engine.mjs`), not at the print site — this masks the value for every future consumer (CI logs, future artifact export, etc.), not just the current print call.
  - `Applies to`: adding any new debug/log/artifact output path that carries raw (pre-redaction) upstream data, especially in `src/lib/review-engine.mjs` and `src/cli.mjs`'s `printDebugInfo`.
  - `Evidence`: #1529 gemini security-high comment on `src/cli.mjs`; fix commit `ca7eaa3b` ("rawLlmOutput を格納時に redactSecrets でマスクする").

- `2026-08-20`: `gh run list --branch main --limit N` mixes long-superseded runs into its output, so a single reading of it is not evidence about main's health. Twice in one session it surfaced a `Nightly Measure & Audit` failure whose real date was two weeks earlier, after which every later nightly had succeeded. Judge main by workflow instead: `gh run list --workflow <file>.yml --limit 5`, or query failures directly with `gh api 'repos/:owner/:repo/actions/runs?branch=main&status=failure&per_page=10'` and read `created_at`.
  - `Applies to`: any "is main green?" check, session-start status recovery, and pre-merge judgment.
  - `Evidence`: `gh run list --branch main --limit 8` reported `failure Nightly Measure & Audit` while `gh run list --workflow nightly-audit.yml --limit 5` returned five consecutive `success`; the REST failure query dated the failing run to `2026-08-06`.

- `2026-08-20`: A failing `Action dist freshness` job on a PR that touches `src/` is a designed waypoint, not a flake and not a mistake to fix by hand. The `Auto Rebuild Action Dist` bot pushes the regenerated bundle afterwards, which turns the job green — and that bot push is also what leaves the new head's workflows in `action_required` (see the CLAUDE.md guard on `N of N required checks are expected`). Over 100 consecutive `test.yml` runs, all three `failure` conclusions were this job and none were unit tests.
  - `Applies to`: reading CI results on any PR that changes `src/`, `runners/github-action/src/`, `runners/core/`, or `package-lock.json`.
  - `Evidence`: `gh api 'repos/:owner/:repo/actions/workflows/test.yml/runs?per_page=100'` → 86 success / 8 action_required / 3 cancelled / 3 failure; expanding the three failures via `actions/runs/<id>/jobs` yielded `Action dist freshness` three times.

- `2026-08-20`: `src/cli.mjs` exports `parseArgs`, so any claim about argument _semantics_ must be measured there rather than on stdout. Two CLI shapes can produce byte-identical output while parsing to different commands, and the run header's `Generated at` timestamp makes a naive `diff` report a difference that is not one. Both failure directions occurred while confirming #1759 B1: `diff -q` reported "different" because of the timestamp alone, and a timestamp-stripped `diff` reported "identical" because an empty `.river` store makes both parses print the same empty report.
  - `Applies to`: verifying argument-parsing bugs, especially ones whose symptom is "the user cannot tell the two apart" (#1759 B1, #1936).
  - `Evidence`: `import { parseArgs } from './src/cli.mjs'` showed `evolve --min 2 aggregate` resolving to `{sub: null, target: 'aggregate'}` before #1932 and `{sub: 'aggregate', target: '.'}` after, while both stdout outputs stayed identical apart from the timestamp line.

- `2026-08-20`: A detached worktree created for mutation testing has no `node_modules`, and the resulting `ERR_MODULE_NOT_FOUND: Cannot find package 'js-yaml'` surfaces as a plain `# fail 1` that reads exactly like "the mutation was detected". Symlink the main checkout's directory (`ln -s <repo>/node_modules node_modules`) before running anything, and read the failure body rather than the counts.
  - `Applies to`: mutation testing and any throwaway `git worktree add --detach` used to run the suite.
  - `Evidence`: a mutation run reported `# pass 0 / # fail 1` whose TAP body was the js-yaml resolution error; after symlinking `node_modules` the same mutation reported `# pass 220 / # fail 1` with the intended assertion failing.

- `2026-08-20`: Calling `/opt/homebrew/opt/node@22/bin/npm` by absolute path does _not_ pin the Node version, because that npm's shebang is `#!/usr/bin/env node` and resolves through `PATH`. Run through `scripts/node22.sh <node|npm|npx> [args...]` instead (PR #2688): it reads the major from `.nvmrc`, puts that bin dir (default `/opt/homebrew/opt/node@<major>/bin`, override with `NODE22_BIN`) first on `PATH`, and `exec`s the command; it exits 127 when that node is missing or its major differs, and 64 for any other first argument.
  - `Applies to`: worker instructions and any sandbox where `export PATH=...; cmd` is awkward and an absolute path looks like a safe substitute.
  - `Evidence`: `head -1 /opt/homebrew/opt/node@22/bin/npm` is `#!/usr/bin/env node`; with a v26-first `PATH`, that npm reported `10.9.7` while `node --version` reported `v26.0.0`. Through the wrapper, `scripts/node22.sh npm version --json` reports node `22.22.2` (PR #2688).

- `2026-08-20`: When judging whether a capability already exists in this repo, searching `skills/` alone is not enough — review policy is implemented across at least three layers, and the non-skill layers carry first-class concepts of their own. A Zenn triage nearly proposed adopting "separate the AI's opinion from whether a human must look" as a gap, because the search covered only the 119-odd `skills/**/SKILL.md` files; the concept already exists as the `require_human_review` risk action, driven by path-matching rules rather than by any skill. Search `src/config/`, `src/lib/`, and `schemas/` alongside `skills/` before calling something unimplemented.
  - `Applies to`: `docs/runbook/zenn-watch.md` triage question 2 (existing coverage), `/propose-issue` research, and any "this is a gap" claim.
  - `Evidence`: `src/config/risk-map-schema.mjs:3` declares `RiskActionSchema = z.enum(['comment_only', 'escalate', 'require_human_review'])`; `src/lib/risk-map.mjs:106` derives `humanReviewFiles` from it; `src/prompt/sections.mjs:139` passes it into the prompt and `src/cli/render.mjs:482` renders it.

- `2026-08-20`: Never pipe a completeness check through `head -N`. A search that answers "how many places declare X?" turns its own limit into the answer: `grep -rln 'fullFile' --include='*.ts' . | ... | head -4` returned four files and became "the vocabulary is declared in 3 TypeScript places", but the unlimited search returns five — `src/types/skill.ts` was the fifth line. The same run also missed `runners/core/skill-loader.mjs:14`, a JSDoc `@typedef` that `--include='*.ts'` excludes by construction. A truncated search is more dangerous than an unmeasured guess, because having run a command makes the result feel measured.
  - `Applies to`: counting declaration sites, "is this already implemented?" checks, and any grep whose conclusion is a count or an exhaustive list.
  - `Evidence`: issue #1940 shipped with "TypeScript の 3 か所" from the `head -4` run; #1941 found five TS sites plus the JSDoc typedef. Also `runners/node-api/package.json` carries `"private": true`, which the same issue asserted as public without measuring.

- `2026-10-15`: A wrapper script on the permission allow list that ends in `exec "$@"` runs whatever command its arguments name, so the allow rule becomes a bypass of the list. Restrict the first argument to a fixed set and reject everything else, so the rule grants no more than the commands it replaces. Keep machine-specific absolute paths out of `.claude/settings.json`: allow the repo-relative script path and resolve the machine-specific location inside the script.
  - `Applies to`: any helper script added to `.claude/settings.json` `permissions.allow`.
  - `Evidence`: `scripts/node22.sh` accepts only `node` / `npm` / `npx` and exits 64 otherwise, with the comment "so the allow rule for this script grants no more than `Bash(node:*)` / `Bash(npm:*)`"; `.claude/settings.json` allows `Bash(scripts/node22.sh:*)` while the Homebrew path lives in the script behind a `NODE22_BIN` override (PR #2688).

- `2026-10-15`: In CI without an LLM API key, the self-review workflow's `reviewers: auto` runs every reviewer role but skips every LLM call, so the saved run record has no `reviewCoverage` (only `llmNotExecuted`). This is by design, not a wiring bug: Coverage is withheld when all attempts are skipped, and CI holds no key by policy. Coverage evidence needs an API-keyed run, for example a local one.
  - `Applies to`: reading `reviewCoverage` from `.river/runs/*.json` artifacts of `.github/workflows/river-review.yml`, and #2396 / #2212 evidence collection.
  - `Evidence`: `src/lib/reviewer-orchestrator.mjs:991` is `const reviewCoverage = allSkipped ? null : deriveReviewCoverage(reviewUnits);`; PR #2689's dogfood run 38677832851 logged `Reviewers: 4/4 roles succeeded` / `LLM: not used` (issue #2396, issuecomment-6184980872).
