---
id: ai-code-review-tools-en
title: AI Code Review Tools Compared (Open-Source & Alternatives)
sidebar_label: AI review alternatives
description: Honest comparison of AI code review tools (CodeRabbit, Greptile, Qodo, Copilot, and more) versus River Review's repo-owned, versioned review skills.
keywords:
  - AIコードレビュー
  - AI code review
  - CodeRabbit alternative
  - open source AI code review
  - AIコードレビュー 比較
  - River Review
---

If you are deciding **which AI code review tool fits your team**, this page compares the main options against River Review on the same axes. It is written for engineering leads and reviewers choosing between a managed PR-review bot, a static-analysis platform, a self-hosted/OSS reviewer, and a repo-owned review framework. Where another tool is the better fit, we say so and point you to it — River Review is not the right answer for every team.

:::info First-party disclosure
This page is maintained by the **River Review** project. We have an interest in River Review, so weigh the recommendations accordingly. We have tried to describe every tool from its own documentation, name each scenario where a competitor is the better choice, and date-stamp anything that changes often (pricing, model behavior, feature availability). Verify volatile facts against each vendor's own pricing/docs before you rely on them.
:::

## How this comparison was done

We compare on a fixed set of axes and apply them to every tool, including River Review. No axis is chosen just to flatter one product.

- **Input scope** — does the tool reason over only the diff, the whole repository, or cross-artifact inputs (plan, tests, prior reviews)?
- **Rule ownership / customization** — where do the review rules live: vendor account/config, or versioned in your repo?
- **OSS / self-host** — is the product open source, and can you self-host or air-gap it?
- **Analysis type** — LLM reasoning, deterministic static analysis, or a mix?
- **Platform / CI integration** — which forges and workflows it plugs into.
- **Determinism / reproducibility** — how stable are findings across runs?
- **Human-review model** — does it advise humans, gate merges, or attempt automation?
- **Pricing / licensing** — the commercial model, at a glance.

Assessment is from each vendor's public docs, pricing pages, and repositories as of the **last-verified date** in the footer. Pricing and tier names for hosted tools change frequently; treat quoted numbers as indicative and vendor-reported benchmark claims as marketing, not independent measurement.

> Scope note: this comparison covers tools we have primary data for. Several other reviewers exist (for example, diff-focused PR bots not listed here); their absence is a data-coverage limit, not a judgment.

## At-a-glance comparison

Cells are intentionally terse; see the per-tool profiles below for the qualified version.

| Axis               | CodeRabbit                              | Qodo / PR-Agent                        | Greptile                            | Codacy                                 | Copilot review                       | Graphite                     | River Review                                         |
| ------------------ | --------------------------------------- | -------------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------------------------- |
| Primary input      | Diff + cached repo                      | Diff (agentic)                         | Whole-repo graph                    | Whole-repo scan                        | Diff / changed files                 | Diff (stack-aware)           | Plan, diff, tests, JUnit, prior reviews              |
| Rule ownership     | Vendor-hosted config                    | Config; BYO model                      | Vendor-hosted config                | Policy / quality gates                 | Custom-instruction files             | Vendor-hosted config         | Repo-owned versioned `SKILL.md`                      |
| OSS / self-host    | Closed; self-host Enterprise-only       | Hybrid — PR-Agent OSS, Qodo Merge SaaS | Closed; on-prem/air-gap Enterprise  | Closed platform; self-host option      | Proprietary; GitHub-native           | Closed SaaS                  | OSS; repo-owned; provider-agnostic                   |
| Analysis type      | LLM + embedded linters/SAST             | LLM (agentic)                          | LLM + code graph + confidence       | Deterministic SAST/SCA + AI Guardrails | LLM                                  | LLM (low-noise)              | Agent-applied skills + regex heuristics              |
| Platform / CI      | GitHub/GitLab/Azure/Bitbucket, IDE, CLI | PR bots, IDE, self-host                | PR review, self-host Enterprise     | Gates across ~40+ languages            | Native GitHub PR + IDE               | Graphite stack + merge queue | Claude Code/Codex plugin, GitHub Action, in-repo CLI |
| Reproducibility    | Per-run variance                        | Per-run variance                       | Confidence scores; per-run variance | Deterministic (its strength)           | Per-run variance                     | Tuned for fewer comments     | Suppression memory, fixtures, deterministic scoring  |
| Human-review model | Advises; human decides                  | Advises; human decides                 | Advises; human decides              | Enforceable gates                      | Optional/required reviewer           | Explicit human complement    | Human-in-the-loop; verdict only, no auto-merge       |
| Pricing (short)    | Seat-based; free for OSS                | OSS free self-host; managed ~$30/user  | ~$30/dev/mo + overage; free tier    | Free OSS/small; ~$15-25/committer      | Bundled w/ Copilot; consumes credits | Bundled in plans; free Hobby | Free OSS; you pay provider LLM usage                 |

## Tool profiles

Every profile uses the same template: what it is, best fit, notable strengths, limitations, license & pricing, and the official link.

### CodeRabbit

- **What it is** — an AI PR-review bot for GitHub/GitLab/Azure DevOps/Bitbucket that posts a high-level "walkthrough" summary (change groups, sequence diagrams) plus line-by-line inline comments, and orchestrates embedded open-source linters/SAST tools alongside the LLM. Also ships IDE and CLI reviewers.
- **Best fit** — teams wanting a batteries-included automated PR reviewer with readable summaries and granular line comments at low setup cost; open-source maintainers who want a full-featured reviewer at no cost.
- **Notable strengths** — low setup, dual summary + line-comment output, bundled linters for extra signal, multi-forge support.
- **Limitations** — closed source; self-hosting exists only at the Enterprise tier (not as OSS); rules live in the vendor's config rather than your repo; per-run variance like any LLM bot.
- **License & pricing** _(check current numbers)_ — closed SaaS, free forever for public/OSS repos; seat-based paid tiers billed per PR-authoring developer, roughly Pro ~$24/dev/mo annual (~$30 monthly), Pro+ ~$48/dev/mo, Enterprise adds self-host/SSO/SLA with seat minimums. Tier names and the seat threshold that unlocks self-hosting shift periodically.
- **Official link** — [https://coderabbit.ai/](https://coderabbit.ai/) (pricing at [https://coderabbit.ai/pricing](https://coderabbit.ai/pricing)).

### Qodo (formerly CodiumAI) — Qodo Merge / PR-Agent

- **What it is** — agentic PR review available two ways: self-host the open-source **PR-Agent** with your own LLM keys, or use the managed **Qodo Merge** bot. A newer multi-agent architecture is marketed as Qodo 2.0, and the broader Qodo platform also does test generation and IDE assistance.
- **Best fit** — teams that prioritize open source, self-hosting, data control, or bring-your-own-model flexibility; also teams wanting review plus AI test generation from one vendor.
- **Notable strengths** — genuine OSS self-host path, BYO model, one vendor for review + test generation.
- **Limitations** — governance and license are in transition (community handoff, license restoration toward Apache 2.0 after an earlier more-restrictive period — confirm the live `LICENSE` before relying on it); naming has churned (CodiumAI → Qodo, PR-Agent → Qodo Merge, repo migrated orgs); managed-tier limits and prices change.
- **License & pricing** _(verify live license)_ — OSS PR-Agent is free to self-host (you pay only LLM usage); managed has a free "Developer" tier (shared monthly PR-review pool + capped IDE/CLI credits), Teams ~$30/user/mo annual, Enterprise custom.
- **Official link** — [https://www.qodo.ai/](https://www.qodo.ai/) (OSS reviewer at [https://github.com/qodo-ai/pr-agent](https://github.com/qodo-ai/pr-agent)).

### Greptile

- **What it is** — a full-repository-context reviewer that indexes the whole codebase into a semantic code graph (syntax trees, call graphs, cross-file relationships) before reviewing, so it can flag cross-file impacts such as a changed signature with unupdated callers. Recent versions attach a per-comment confidence score.
- **Best fit** — teams whose review pain is cross-file / whole-codebase reasoning: large, interconnected, or legacy codebases where diff-only bots miss ripple effects.
- **Notable strengths** — whole-repo graph context, cross-file impact detection, per-comment confidence, on-prem/air-gapped Enterprise deployment.
- **Limitations** — closed source (self-host is Enterprise-only); fast-moving product with frequent major agent versions; vendor-reported benchmark numbers should be treated as marketing.
- **License & pricing** _(recent, dates quickly)_ — closed SaaS ~$30/developer/mo bundling a monthly review quota (~50) with per-review overage (~$1 each); a free tier (fixed reviews/mo, unlimited authors) was introduced in 2026; Enterprise/self-host custom.
- **Official link** — [https://www.greptile.com/](https://www.greptile.com/).

### Codacy

- **What it is** — primarily a deterministic static-analysis / DevSecOps platform, not an LLM diff bot: it orchestrates many open-source engines for SAST, SCA, secrets, IaC and (newer) DAST scanning, plus duplication/complexity, coverage, and enforceable quality gates across ~40-49 languages, with newer AI "Guardrails" aimed at AI-generated code.
- **Best fit** — teams that want enforceable, deterministic quality and security gates, coverage tracking, and standardization across many languages/repos. It complements rather than replaces an LLM reasoning reviewer.
- **Notable strengths** — deterministic and reproducible by design, broad language coverage, policy/standards enforcement, coverage and security gating.
- **Limitations** — the platform itself is closed source (it wraps OSS engines); its conversational "AI review" behavior is newer and evolving, so how much it acts like a reasoning reviewer vs a scanner is in flux; committer-counting for billing varies by period.
- **License & pricing** _(varies by billing period)_ — free for open source and small teams (up to ~2 committers); seat/committer-based paid plans (Team ~$18/dev/mo annual, Pro ~$15-25/committer), Enterprise/self-host custom.
- **Official link** — [https://www.codacy.com/](https://www.codacy.com/).

### GitHub Copilot code review

- **What it is** — an AI PR reviewer built natively into the GitHub pull-request flow. Reviews focus primarily on the diff/changed files, can follow custom-instruction / coding-guideline files, be set as an automatic or required reviewer, and also run in the IDE. Deep native integration is the main differentiator.
- **Best fit** — teams already standardized on GitHub + Copilot who want zero-integration, in-platform PR review with no extra vendor; useful for broad org-wide coverage since reviews can be enabled even on PRs from non-licensed members.
- **Notable strengths** — no extra integration, native GitHub UX, custom-instruction support, can act as a required reviewer.
- **Limitations** — proprietary and GitHub-only (no self-host outside GitHub); context is primarily the diff rather than the whole repo; billing is contentious and volatile — premium-request consumption, a rising model multiplier (~13x reported for mid-2026), and Actions-minute usage make true per-review cost hard to pin down.
- **License & pricing** _(billing volatile)_ — bundled with Copilot subscriptions (Pro ~$10/mo, Pro+ ~$20/mo, Business ~$19/user/mo, Enterprise ~$39/user/mo), but reviews increasingly consume premium requests/AI credits plus GitHub Actions minutes rather than being wholly free within the seat.
- **Official link** — [https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review).

### Graphite Reviewer (Graphite Agent)

- **What it is** — an AI reviewer originally shipped as "Diamond" and, as of Oct 2025, folded into "Graphite Agent." It is explicitly positioned as a complement to (not a replacement for) human review, tuned to emit fewer, higher-signal comments, and integrated with Graphite's stacked-diff workflow and merge queue.
- **Best fit** — teams using (or adopting) Graphite's stacked-diff / merge-queue workflow who want AI review woven into that flow, and teams that prefer a low-noise reviewer that surfaces only high-confidence issues.
- **Notable strengths** — low-noise/high-signal tuning, tight stacked-diff and merge-queue integration, explicit human-complement stance.
- **Limitations** — closed SaaS; naming and packaging changed recently (Diamond deprecated Oct 2025 into Graphite Agent), so whether the reviewer is buyable standalone vs only bundled is in flux.
- **License & pricing** _(recently consolidated)_ — historically Diamond was a ~$15-20/active-contributor/mo add-on (free up to ~100 PRs/mo); now consolidated into platform plans: free Hobby, Starter ~$20, Team ~$40/user/mo (unlimited AI reviews + Agent + stacking + merge queue), 30-day trial.
- **Official link** — [https://graphite.dev/](https://graphite.dev/).

### River Review

- **What it is** — an OSS "Review Judgment as Code" framework. Your team's review criteria are versioned, repo-owned `SKILL.md` skills that run across the SDLC (upstream design/plan, midstream diff/plan-conformance/tests, downstream report). Perspective-based reviewer roles (bug-hunter, security-scanner, test-gap, dependency-reviewer, frontend-reviewer, ci-cd-reviewer) run in parallel in one orchestrator and merge findings via connected-components. Distributed as a Claude Code / Codex plugin and a GitHub Action.
- **Best fit** — teams doing AI-assisted development that want a team-owned audit layer checking agent-written code against their own rules; teams that want review criteria versioned and diffable in the repo; reviews that need more than the diff (plan-conformance, test-boundary coverage, migration/dependency policy).
- **Notable strengths** — repo-owned, reviewable rules (judgment travels with the code, not a vendor-hosted config store); cross-artifact input via an explicit contract; phase-aware gates; reproducibility engineering (Riverbed suppression memory, fixture + golden-output tests, deterministic scoring); runs on the agent's own model, so no separate River Review LLM key is usually needed, and some security/quality checks run key-less via deterministic regex heuristics.
- **Limitations** — see [Honest limitations](#honest-limitations-of-river-review) below and the [Known Limitations](../reference/known-limitations.en.md) reference. In short: local `river run` is preview-oriented; bundled skills mix samples and production-intended definitions; the `verify` SDLC gate is not implemented yet; no official curated skill-pack registry yet; no npm distribution by design; solo-maintained and early-stage; it is not a replacement for static analysis.
- **License & pricing** — OSS and repo-owned; provider-agnostic (pick OpenAI/Anthropic/Google). You pay only your provider's LLM usage, and the mechanical checks run key-less. No npm distribution — install via the bundled plugin (Claude Code / Codex) or the GitHub Action.
- **Official link** — [What is River Review](../explanation/what-is-river-review.en.md).

## When to use what

Match the concrete need to the tool that wins it. Some of these route you to a competitor on purpose.

- **Managed, zero-config diff review with the least setup** — a hosted bot like **CodeRabbit** (rich summaries + line comments) or **Greptile** (whole-repo context) is simpler and more managed than River Review.
- **Fully self-hosted or air-gapped, bring-your-own-model** — **PR-Agent (Qodo)** for an OSS self-host reviewer, or **Greptile Enterprise** for on-prem/air-gapped whole-repo review.
- **Deterministic quality/security gates across many languages** — **Codacy** (or ESLint / SonarQube / Semgrep) for SAST/SCA/secrets/coverage gates. River Review complements these; it does not replace them.
- **Zero-integration review inside GitHub you already pay for** — **GitHub Copilot code review**, especially for broad org-wide coverage.
- **Low-noise review inside a stacked-diff / merge-queue workflow** — **Graphite Reviewer**.
- **Cross-file ripple detection on a large, interconnected codebase** — **Greptile**'s semantic code graph.
- **Repo-owned, versioned review rules and cross-artifact review (plan + diff + tests) as an audit layer over AI-written code** — **River Review**.

## Where River Review fits — and where it doesn't

River Review is deliberately narrow. Consider a different tool when:

- **You want turnkey diff-only PR review with near-zero setup** — a hosted vendor tool (e.g. CodeRabbit, Greptile) is simpler and more managed.
- **You need deterministic syntactic, type, style, or known-pattern security checks** — use ESLint, a type checker, SonarQube, or Semgrep. River Review complements but does not replace them.
- **You want fully automated approve-and-merge with no human in the loop** — River Review deliberately refuses auto-merge and is the wrong fit.
- **You need an npm-installable or standalone local CLI as the primary workflow** — npm distribution is out of scope and local `river run` is preview-oriented.
- **You need the `verify` gate, mature evaluation dashboards, or an official curated skill pack available today** — those are still planned or partial.
- **You require enterprise SLAs, vendor support, or a large maintainer team** — this is a solo-maintained, early-stage OSS project.
- **Your team will not invest in authoring and tuning skills** — the core value depends on repo-owned skills, and the out-of-box samples need adaptation.

River Review fits best when the review pain is **team-specific judgment on AI-assisted changes**: you want the rules versioned and diffable in the repo, you need more than the diff (plan-conformance, test boundaries, dependency/migration policy), and you want risk-tiered human-in-the-loop review that concentrates human attention on auth, payments, data, and irreversible changes — never auto-merge.

## Honest limitations of River Review

Consistent with our [Known Limitations](../reference/known-limitations.en.md) reference, the trade-offs are stated plainly:

- Local `river run` is preview/validation-oriented, not the primary production path; it relies on `--dry-run` and a heuristic fallback when no API key is set.
- Bundled skills mix samples and production-intended definitions; tune them for your repo before relying on them.
- Pin the GitHub Action to release tags — breaking changes can land between versions.
- The `verify` SDLC gate is not implemented yet (only `plan` and `exec` gates exist; `verify` is planned, issue #802).
- No official curated Skill Pack registry yet; skill-authoring governance/contribution policy is still planned.
- Evaluation observability (dashboards, per-skill badges, broad CI regression) is largely planned, not shipped.
- No npm distribution by design — distribution is the bundled plugin (Claude Code / Codex) and the GitHub Action; the CLI runs only from inside the repo.
- Solo-maintained and early-stage; the OpenSSF Passing badge reflects basic OSS best practices, not a security guarantee.
- Not a replacement for static analysis — deterministic syntax/type/style/known-security-pattern checks still belong to ESLint, type checkers, or SonarQube.

River Review does **not** claim to fully automate review, and it never auto-approves or auto-merges. It outputs findings plus a verdict (merge-ready / human-review / block) as decision material for a human.

## How to evaluate for yourself

Do not take any comparison — including this one — on trust. Run a short bake-off on your own PRs:

1. **Run on a real PR** — pick one recent, non-trivial PR and run each candidate against it.
2. **Check the false-positive rate** — count noisy/incorrect comments vs actionable ones; a low-signal reviewer costs review time.
3. **Test rule customizability** — can you express one of _your_ team's real rules, and does it live in your repo or the vendor's account?
4. **Measure CI latency and cost** — time-to-comment and per-review cost (including credits/Actions minutes) at your PR volume.
5. **Confirm data handling** — where does your code go, which provider/region, and can you self-host or air-gap if required?
6. **Check reproducibility** — run the same PR twice and compare findings; stable, suppressible findings save re-triage.

## FAQ

**Is there a free or open-source option?**
Yes. River Review is OSS and repo-owned (you pay only your LLM provider usage, and mechanical checks run key-less). PR-Agent (Qodo) is open source and self-hostable. CodeRabbit and Codacy are free for public/OSS repos, and Greptile and Graphite have free tiers — but those products themselves are not open source.

**Which tools handle AI-generated code well?**
River Review is designed as an audit layer over agent-written code (Claude Code / Codex / Cursor) with repo-owned rules and human-in-the-loop gates. Codacy added AI "Guardrails" aimed at AI-generated code. Any LLM reviewer can comment on AI-written diffs; the differentiator is whether the _review rules_ are yours and versioned.

**Can I self-host or air-gap?**
Yes, depending on the tool. River Review is repo-owned and provider-agnostic, so the data boundary is yours. PR-Agent (Qodo) is self-hostable OSS. Greptile and Codacy offer on-prem/self-hosted deployments at higher tiers. CodeRabbit self-hosting is Enterprise-only. Copilot code review runs only inside GitHub.

**Does River Review auto-merge or replace human review?**
No. It never auto-approves or auto-merges. It emits findings and a verdict as decision material; a human makes the call, with risk-tiered focus on high-stakes areas.

**Is River Review a replacement for ESLint / SonarQube / Semgrep?**
No. Deterministic syntax/type/style/known-pattern security checks should still come from static-analysis tools. River Review complements them by reasoning about semantic and cross-artifact concerns.

**Do I need a separate LLM API key?**
Usually not for AI-agent-driven use — the agent applies the skills with its own model, and some checks run key-less via deterministic regex. A provider key is needed mainly for headless execution (GitHub Action / standalone CLI) on non-mechanical skills.

**How do I pick between River Review and a managed bot?**
Choose a managed bot (CodeRabbit, Greptile, Copilot, Graphite) for turnkey diff review with minimal setup. Choose River Review when you want repo-owned, versioned rules and cross-artifact review as an audit layer over AI-assisted changes — and are willing to author and tune skills.

## Related docs and next steps

- [What is River Review](../explanation/what-is-river-review.en.md) — the framework and execution model.
- [Review policy](../reference/review-policy.en.md) — the standard policy AI reviewers follow.
- [Known limitations](../reference/known-limitations.en.md) — the full, current limitations list.
- [Human judgment focus](../explanation/human-judgment-focus.en.md) — the human-in-the-loop stance.
- [Quick start](../guides/quickstart.en.md) and [GitHub Actions setup](../guides/github-actions.en.md) — try it on a real PR.

---

_Last verified: 2026-07-04. Tools, pricing, and feature availability change frequently; the figures above were checked on that date from each vendor's public materials. If you spot a stale claim, please open an issue._
