---
id: security-model-en
title: River Review's security model
sidebar_label: Security model
description: Why River Review itself is safe by design. Skills are not executable code, reviews are read-only, output is comment-only, and there is no approve or merge path.
keywords:
  - security model
  - AI code review safety
  - prompt injection
  - human-in-the-loop
  - River Review
---

This page explains why River Review itself is safe by design. For how to report a vulnerability, see [private vulnerability report form](https://github.com/s977043/river-review/security/advisories/new).

## Skills are not executable code

A River Review skill is a Markdown file — frontmatter plus a prompt body. There are no `scripts/` directories under `skills/`, and a skill never runs a shell or code.

"Executing" a skill means sending its prompt and the diff to an LLM to obtain review text. The pipeline uses no `eval` / `vm` / dynamic `require`, and there is no code-execution sink that consumes the diff. The deterministic detectors are regex matches only, and the `git` / `rg` calls use array-argument `execFile` with no shell.

## Reviews are read-only

Review output is a set of `<file>:<line>: <message>` findings. Output that does not match the format is dropped, and the fallback is limited to deterministic heuristics. River Review does not change code; it only surfaces findings and a verdict as decision material.

## No approve or merge path

- The GitHub Action defaults to `dry_run: true`.
- It posts to the PR as a `COMMENT` only — there is no approve or auto-merge path.
- The deterministic gate can only escalate to human review; it has no way to push a decision toward GO.

So no finding can automatically approve, merge, or change code.

## Handling untrusted diffs

The diff is untrusted input placed into the prompt. That is the prompt-injection surface common to all LLM-based review, not a River-Review-specific defect. The worst a malicious diff can achieve is a wrong review comment that a human reads — because:

- Output is comment-only; injection cannot cause a merge or approval.
- Findings pass format validation, so free-form injected prose is dropped.
- The verifier rejects findings whose evidence references files not in the diff ([verifier](https://github.com/s977043/river-review/blob/main/src/lib/verifier.mjs)).
- The review rules forbid speculation beyond the diff.
- Secret redaction runs on both the input and the output.
- No dynamic code execution or deserialization happens, so an RCE-style "malicious payload" does not apply.

## Where the review criteria come from

The review criteria themselves live in the same repository as the diff. [`loadProjectRules`](https://github.com/s977043/river-review/blob/main/src/lib/rules.mjs) reads `.river/rules.md` and `.river/rules.d/*.md` straight from the working tree.

- **Rules trust boundary**: `.river/rules.md` and `.river/rules.d/*.md` sit inside the reviewed agent's write authority. The loaded text is passed into the prompt as trusted policy.
- **No provenance mechanism**: there is no pin to a base ref, no blob SHA record of the loaded rules, no schema validation, and no floor of criteria that a PR cannot weaken.
- **Consequence on the Action path**: the GitHub Action uses the rules in the working tree it checked out, so a change that weakens `.river/rules.md` inside a PR takes effect on that same PR's review criteria immediately.
- **The worst case stays bounded**: the Action defaults to `dry_run: true` (report-only) and has no approve or auto-merge path. The impact stays at "a human reads a lenient comment produced under weakened criteria".

Rules are an input with no tamper evidence; pinning their provenance (a base pin, recording the blob SHA) is the caller / CI's responsibility. The immediate harm is small, but leaving this trust boundary undocumented is itself the risk. The same kind of statement is written for the runs store in the [loop convergence contract](../reference/loop-convergence-contract.en.md).

## Common misconceptions

- **"Large change → run all skills" is not code execution.** It means applying all review lenses (test coverage, naming, flakiness, and so on); no privileged operation or shell is involved.
- **It is not a replacement for static analysis.** Deterministic syntactic / type / known-pattern checks stay with dedicated tools; River Review complements them with semantic consistency.

## Related docs

- [Private vulnerability report](https://github.com/s977043/river-review/security/advisories/new)
- [Human Judgment Focus](./human-judgment-focus.en.md)
- [What is River Review](./what-is-river-review.en.md)
