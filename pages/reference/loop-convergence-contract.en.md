---
title: Loop Convergence Contract (stop conditions for the self-fix loop)
---

River Review acts as the **review stage** in a generate → review → revise loop. River Review only returns judgment materials (`decision` / `summary.issueCountBySeverity` / `oscillated` / `suggestedLoopSignal` / exit code); iteration, stopping, and escalation are the **caller's responsibility** (the invoking agent or workflow). See [#976 boundary — docs/ai/generate-review-revise-loop.md](https://github.com/s977043/river-review/blob/main/docs/ai/generate-review-revise-loop.md).

This document defines the stop / convergence / divergence-guard contract that callers need to implement loop control, in one page.

## `suggestedLoopSignal` — 3-layer design

River Review emits a `suggestedLoopSignal` field on each artifact and on `runs diff --output json` output to make loop decisions machine-readable without requiring callers to implement the derivation logic themselves. The design is intentionally layered:

**Layer 1** — Single `river run` artifact (`suggestedLoopSignal` top-level field):

| Value             | Meaning                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `NO_SIGNAL`       | Loop action cannot be determined (decision absent or `human-review-recommended` with no blocking findings) |
| `REVISE_REQUIRED` | Blocking findings (`critical` or `major`) are present — agent should revise and re-run                     |
| `CONVERGED`       | No blocking findings and decision is auto-approve equivalent — agent may stop the loop                     |
| `ESCALATE_HUMAN`  | `decision === 'human-review-required'` — agent must hand off to a human                                    |

Derivation order: ESCALATE_HUMAN → REVISE_REQUIRED → CONVERGED → NO_SIGNAL. Deterministic; no AI call.

**Layer 2** — `river runs diff --output json` (3+ runs): adds `STOP_OSCILLATED` when `oscillated` is non-empty. Oscillation takes priority over all Layer 1 values.

Layer 2 additionally qualifies the derived value by the latest run's `reviewCoverage` ([Review Coverage](https://github.com/s977043/river-review/blob/main/src/lib/review-coverage.mjs)) as of PR #2335, on both the 2-run and the 3+-run `river runs diff` paths: when that coverage is `partial` or `not_executed`, `CONVERGED` is demoted to `NO_SIGNAL`. A run whose review units timed out is indistinguishable from a clean one on the two inputs Layer 1 reads (zero blocking findings plus an auto-approve decision), so returning `CONVERGED` there stops the caller's loop on the strength of a review that never finished. Only `CONVERGED` is demoted; the other values already point away from stopping and accepting. A run record without `reviewCoverage` counts as `unknown` and is not demoted, because a missing observation is not an observation of incompleteness.

Because of that demotion, a `partial` or `not_executed` run no longer stops the loop through `CONVERGED`, and a loop over runs that keep coming back incomplete never terminates on its own. **Callers must therefore also carry a Layer 3 bound such as `STOP_MAX_ITERATIONS`.**

What the demotion suppresses is limited to the Layer 2 signal. When an artifact carries a `gate` block, the reference agent below treats `gate` as authoritative over the signal, so a Layer 1 derived `GO` can still stop a `partial` run. Whether coverage should reach `gate` is tracked in issue #2337.

**Layer 3** — Caller-synthesized (River Review deliberately does **not** emit these):

| Value                  | When to synthesize                                             |
| ---------------------- | -------------------------------------------------------------- |
| `STOP_MAX_ITERATIONS`  | `iteration_count >= max_iterations`                            |
| `STOP_POLICY_REQUIRED` | External policy trigger (cost cap, mandatory HITL label, etc.) |

The `suggestedLoopSignal` is **additive and optional** — it does not change `decision` or `verdict`, and is not a GO/NO-GO gate. Absent on older artifacts.

## `gate` — risk-tiered gate signal (Epic #1347 S2)

Above `suggestedLoopSignal` sits `gate`, a machine-readable signal that composes the risk tiers (cliff / hill / field). It is attached to both the `river review` Review Artifact and `river run --output json` (additive / optional). Derivation is a **deterministic pure function** (`src/lib/gate-decision.mjs`); LLM output can only contribute in the escalation direction.

| `gate.decision`       | Tier                                                                   | Expected caller behavior                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GO`                  | field                                                                  | Autonomous continuation permitted                                                                                                                                                     |
| `GO_WITH_OBSERVATION` | hill                                                                   | Proceed, with an async review due within `observation.expiresInHours`. **On expiry, stop** and treat changes from `observation.files` as unreviewed (re-review required)              |
| `NO_GO`               | — (emitted as `field`; not a supervision tier, kept for enum totality) | Route to revise (`reasonCode` explains why; e.g. `NOT_EXECUTED` = review did not run, `UNDETERMINED` = verdict indeterminate — review-artifact.schema.json is the authoritative enum) |
| `ESCALATE`            | cliff                                                                  | Stop until a human approves                                                                                                                                                           |

- **Fail-safe**: indeterminate or unknown inputs always map to `NO_GO`, never to the `GO` family
- **Bootstrap cliff**: a diff touching `.river/**` (risk map and other gate config) escalates unconditionally (`GATE_CONFIG_CHANGED`) — changes that could unguard the gate itself, including deleting the risk map, always pass through human approval
- **Trust boundary**: the risk map, config, and plan text live inside the reviewed repository and are writable by the agent under review. A gate block is trustworthy **only when derived outside that agent's write authority** (host / CI checkout). Protecting `.river/**` via CODEOWNERS / branch protection is recommended
- **Replay check (integrity verification)**: since derivation is pure, callers can re-feed `gate.inputs` into `deriveGateDecision` and compare decisions (`inputsHash` is a lightweight summary for S3 regression comparison, not a tamper-proof control). `inputs.riskMapDigest` is computed as "YAML load → `JSON.stringify` → sha256 first 16 hex"
- **Circuit breaker**: `gate.configSnapshot.maxConsecutiveAutoGo` is advisory. Counting consecutive auto-GOs and enforcing checkpoints is the caller's job, and **when the caller has its own limit, the stricter value (min) wins**
- The reference enforcement implementation lives in `examples/loop-reference-agent/`; conformance fixtures (`tests/fixtures/gate-conformance/`) let external callers verify their enforcement behavior

`gate` is advisory. Enforcement (`--gate` mode, strict_block routing) lands in Epic #1347 S4.

## Stop (convergence) conditions — composite formula

### Why `decision == "auto-approve"` alone is not a stop condition

`auto-approve` is advice meaning "bypass Human-in-the-Loop". It can be returned even when minor / info findings remain. Using it as the sole stop criterion risks exiting the loop with significant findings still open.

### Recommended stop / continue logic

| Condition                                            | Recommended action                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.issueCountBySeverity.critical + .major > 0` | **Continue (revise)**: blocking findings remain; keep fixing                                                                             |
| `critical == 0` and `major == 0`                     | **Converged**: exit the loop and advance to the next stage. Whether to accept minor / info follows the caller's policy (default: accept) |
| `decision == "human-review-required"`                | **Escalate immediately**: hand off to a human reviewer                                                                                   |
| `river runs diff` returns non-empty `oscillated`     | **Escalate immediately**: revising is introducing new problems (oscillation). See "Oscillation detection" below                          |

Pseudo-code for the composite condition:

```text
if decision == "human-review-required":
    escalate_to_human(result)
    stop
if oscillated is non-empty:
    escalate_to_human(result, reason="oscillation")
    stop
if critical + major == 0:
    # converged; handling of minor / info is caller policy
    break  # exit loop
else:
    revise(result.issues)
    continue  # next iteration
```

### Supervision digest and audit records (Epic #1347 S3)

Run records saved with `--save` (automatic on GitHub Actions; opt out with `RIVER_AUTO_SAVE=false`, write target `.river/runs/`) carry `gate` and `decision`, and `river runs digest` aggregates them into the supervisor-facing summary. On GitHub Actions the digest is **appended to the job summary automatically** — a forced display point, because a digest nobody runs is the same as no digest.

- **Runs-store trust boundary**: `.river/runs/` sits inside the reviewed agent's write authority, and runtime tampering is invisible to gate rule 0 (which only inspects diffs). Records are a convenience reference with no tamper evidence; append-only storage, signing, or off-repo persistence is the caller / CI's responsibility
- **Escape candidates are NOT a rate**: the digest lists cases where a GO-family run was followed by a run (overlapping changed files) that produced new blocking findings. Fingerprints drift with LLM phrasing and later diffs introduce their own problems, so **attribution is a human judgment; threshold or automated decisions on this list are forbidden by contract**
- **Override records are always UNVERIFIED**: the optional `override` on a run record (`actor` / `timestamp` / `gateInputsHash` required) is host-attested; River Review does not verify it. The digest force-labels it UNVERIFIED and warns on `gateInputsHash` mismatches
- **The circuit breaker only warns**: when consecutive auto-GO runs exceed `configSnapshot.maxConsecutiveAutoGo`, the digest warns; stopping is the caller's job (S4)

## Divergence guards

Two safety mechanisms when an autonomous loop fails to converge.

- **max iterations (recommended 3–5)**: an upper bound on iteration count. When the limit is reached, escalate to a human and force-stop the loop.
- **loop-until-dry (zero new findings for N consecutive rounds)**: compare the previous and current reviews with `river runs diff`; if `new` findings are zero for N rounds (recommended: 2), treat as converged. When the same findings keep appearing, further revising will not improve the situation — escalate to a human.

```bash
# Save the run, then diff to check for new findings
# The run ID is written to stderr as "Run saved: <id>" — it is not in the stdout JSON
result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
curr_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)
river runs diff <prev_run_id> "$curr_id"
# If new[] is empty, count it as 1 round toward loop-until-dry
```

## Oscillation detection

When a finding that was resolved in one iteration reappears in the next, the revise step is introducing another problem (oscillation).

```bash
# Passing 3 or more run IDs includes `oscillated` in the JSON output
river runs diff <id1> <id2> <id3>
```

When `oscillated` is non-empty, the caller escalates immediately. Detection is based on `computeFingerprint` (`src/lib/finding-factory.mjs`, `ruleId + file + message` prefix), so the same finding is tracked even when line numbers shift due to a fix.

## Exit code contract (implementation-accurate)

The table below covers `river run`. The `river review` family uses a separate contract (includes exit 3) and is out of scope for this page.

Findings-based exit codes are non-zero only when `--fail-on` / `--warn-on` is specified. **Without `--fail-on`, a successful run always exits 0 regardless of findings.** Usage errors (unknown options, missing values, etc.) and runtime errors exit 1 regardless of `--fail-on` (#1709).

| Exit code | Condition                                                                | Description                            |
| --------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `0`       | `--fail-on` not specified / `--advisory-only` / max severity < warn rank | Pass. Always 0 regardless of findings  |
| `1`       | `--fail-on <sev>` specified and max severity ≥ fail rank                 | Fail. Blocking threshold met           |
| `2`       | `--warn-on <sev>` specified and max severity ≥ warn rank but < fail rank | Warn. Threshold reached but not a fail |
| `1`       | Invalid input / git diff failure / `--max-cost` exceeded, etc.           | Error exit                             |

Severity rank (low → high): `info`=0 / `minor`=1 / `major`=2 / `critical`=3

> **Recommended CI / agent setup**: explicitly add `--fail-on critical --warn-on major` to enable exit-code-based branching. Without `--fail-on`, findings produce exit 0, so for machine decisions, reading `summary.issueCountBySeverity` directly (see examples below) is more reliable.

## Minimal machine-consumption examples

### Convergence check from JSON output (no flags)

A pattern that reads JSON directly instead of using `--fail-on`.

```bash
#!/usr/bin/env bash
# The run ID is not in the stdout JSON. Retrieve it from the stderr "Run saved: <id>" line.
result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
run_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)

critical=$(echo "$result" | jq '.summary.issueCountBySeverity.critical // 0' 2>/dev/null)
major=$(echo "$result" | jq '.summary.issueCountBySeverity.major // 0' 2>/dev/null)
decision=$(echo "$result" | jq -r '.decision // "unknown"' 2>/dev/null)

if [ "$decision" = "human-review-required" ]; then
  echo "ESCALATE: human review required" >&2
  exit 2
fi

if [ $(( ${critical:-0} + ${major:-0} )) -gt 0 ]; then
  echo "REVISE: critical=$critical major=$major" >&2
  exit 1  # caller continues the loop
fi

echo "CONVERGED: proceed to next stage"
```

### Loop example with oscillation detection

```bash
#!/usr/bin/env bash
# Accumulate run IDs in an array; pass the 3 most recent to detect oscillation
declare -a run_ids=()
max_iter=5

for i in $(seq 1 $max_iter); do
  result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
  curr_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)
  run_ids+=("$curr_id")

  # Oscillation detection: once 3+ run IDs are accumulated, pass the latest 3
  n=${#run_ids[@]}
  if [ "$n" -ge 3 ]; then
    id_a="${run_ids[$((n-3))]}"
    id_b="${run_ids[$((n-2))]}"
    id_c="${run_ids[$((n-1))]}"
    oscillated=$(river runs diff "$id_a" "$id_b" "$id_c" --output json \
                   | jq '.oscillated // [] | length' 2>/dev/null)
    if [ "${oscillated:-0}" -gt 0 ]; then
      echo "OSCILLATION DETECTED: escalate to human" >&2
      exit 3
    fi
  fi

  critical=$(echo "$result" | jq '.summary.issueCountBySeverity.critical // 0' 2>/dev/null)
  major=$(echo "$result" | jq '.summary.issueCountBySeverity.major // 0' 2>/dev/null)

  if [ $(( ${critical:-0} + ${major:-0} )) -eq 0 ]; then
    echo "CONVERGED after $i iteration(s)"
    exit 0
  fi

  # caller performs the revise step here
done

echo "MAX ITERATIONS reached: escalate to human" >&2
exit 4
```

## Related documents

- [AI-Driven Development Playbook (Case 2 / Case 3)](../guides/ai-agent-playbook.en.md) — case-by-case invocation guide
- [generate → review → revise loop design](https://github.com/s977043/river-review/blob/main/docs/ai/generate-review-revise-loop.md) — background design for convergence control (#1150 S2a source doc)
- [Stable Interfaces (CLI / GitHub Actions)](./stable-interfaces.en.md) — CLI stable contract including exit codes
