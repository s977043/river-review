# Vercel PR preview capacity — recovery and prevention

This runbook applies when the GitHub `Vercel` commit status fails with
`api-deployments-free-per-day`. It is a **capacity problem**, not evidence
that the PR's code passed or failed its deployment checks.

## Observe the exact candidate

From the repository root, for an open PR:

```sh
PR=2641
SHA="$(gh api "repos/:owner/:repo/pulls/$PR" --jq '.head.sha')"
gh api "repos/:owner/:repo/commits/$SHA/status" \
  --jq '.statuses[] | select(.context == "Vercel") | {state, target_url}'
scripts/wait-pr-ready.sh "$PR"
```

Use the **full head SHA** and compare the preview's Git commit metadata.
A READY deployment on a different SHA does not validate this PR head.
Distinguish `failure`, `pending`, `success` and a skipped GitHub Action;
no one of them substitutes for the others. A `PlanGate` pass with execution
skipped by label is not an independent security review.

## Reduce avoidable deployments before pushing

1. Keep the reviewed change small, but combine its files into one coherent
   local commit/push rather than pushing once per modified file. Feedback
   iterations do not each need a remote commit.
2. Before pushing, run the applicable local checks, especially
   `npm run format:check`, `npm run lint` and targeted tests. Avoid
   producing predictable Prettier-fix follow-up commits.
3. When source changes affect the bundled GitHub Action, run
   `npm run build:action` and include the refreshed
   `runners/github-action/dist` in the same reviewed commit **when feasible**.
   Do not copy a generated distribution from a branch based on older main.
   The CI `Action dist freshness` check remains mandatory.
4. Prefer **one active delivery PR per overlapping generated distribution**.
   After another PR merges, update the remaining branch from the new main,
   regenerate the distribution and rerun checks for the new head.
5. Do not treat an Ignored Build Step as a way to reduce the number of
   deployments; provider limits may count skipped/canceled builds.

These are process recommendations, not new approval gates. Do not create one
large unsafe commit merely to reduce deployment count.

## Recover after a provider quota failure

1. Record the provider error code and affected **exact** head SHA. Keep the
   PR open; do not forge a green status, remove required checks, force a merge,
   or change account billing or branch-preview rules without owner approval.
2. Check provider capacity. Avoid assuming a particular quota-reset clock:
   measure an explicit time window and distinguish canceled, READY and
   failed deployments. Counts from one window do not prove the quota policy.
3. When capacity permits, redeploy the **same** Git SHA on the linked Vercel
   preview project. Validate the resulting deployment metadata and GitHub
   `Vercel=success` status for that SHA. A deployment can be READY before
   the GitHub status has finished updating.
4. Re-fetch the PR head and base, required checks, PlanGate/review comments,
   both PR discussion and inline review threads, blocked labels and
   generated Action freshness. Rerun if the branch/head changed. Merge only
   when the repository's existing conditions actually pass.

If approval of GitHub Actions workflows is pending after a bot push, that is
a separate problem: use `docs/runbook/bot-pushed-head-kick.md` and the
existing `scripts/pr-unstall.sh` workflow. It does not fix Vercel quota.

## Pilot evidence (2026-10-10–11 JST)

- Issue #2644 measured **100 deployments** in a bounded 24-hour window on
  `ai-review-kit`, all with distinct commit SHAs: 91 previews,
  9 production, 69 READY and 31 CANCELED. Six of those commits came from
  automatic Action-dist rebuilding.
- A later, different 24-hour window contained **88 deployments**.
  Redeploying PR #2641's exact SHA succeeded, updated its Vercel commit
  status to success and allowed a normal, fully checked squash merge.
- The four-file documentation update in PR #2647 was committed atomically
  as a one-commit pilot. The effect on quota, lead time and failures must be
  measured rather than inferred from the command shape alone.

Track at least **deployments per merged PR**, **canceled builds per 24h**,
**quota errors per 24h**, and **time blocked by preview status**.
Keep results with Issue #2644; preserve unknowns rather than invent savings.

Related: Issue #2635 (HOTL), Issue #2644 (capacity), `docs/governance.md`
(PR merge gates).
