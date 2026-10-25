# Suppression Feedback Workflow - User Prompt

You will receive:

- The current PR diff.
- One or more companion findings from other midstream skills, each with `Severity`, optional `Confidence`, optional `Fingerprint`, and the `file:line` of the offending location.
- Optional Riverbed Memory state: a list of active `type: 'suppression'` entries with `fingerprint`, `feedbackType`, `rationale`, `scope`, and `files`.
- Optional PR body / commit messages that may already contain rationale text.

## Task

For each companion finding decide which of these three states applies and emit at most one finding per companion:

1. **Already suppressed** — fingerprint matches an active suppression entry.
   → Emit no finding, or one `info` acknowledgement that re-states the existing rationale in one line. Do not repeat the suppression workflow.

2. **Suppression workflow needed** — companion finding has no matching suppression entry.
   → Emit one `minor` finding telling the reviewer to choose: implement the fix, or `river suppression add` with the appropriate `--feedback`. If the companion finding is `major` / `critical`, surface the HIGH_SEVERITY guard explicitly so the reviewer knows only `accepted_risk` will auto-suppress.

3. **Out of scope** — the companion finding does not require a workflow nudge (e.g. the diff is doc-only, or the Pre-execution Gate did not fire).
   → Return `NO_REVIEW`.

## Selection rules

- For `major` / `critical` companions without rationale in the PR body, recommend implementing the fix as the **first** option; suppression is the second option only if the rationale is genuine.
- For `minor` / `info` companions in obvious test / fixture / mock contexts, recommend `false_positive` (not `accepted_risk`).
- Never recommend `accepted_risk` without a rationale visible in the PR body or commit message.
- Never re-emit suppression workflow guidance for a fingerprint that is already in an active `type: 'suppression'` entry.

## Output Format

Use the format from the system prompt for every finding. The skill's own `Severity` is `minor` for workflow nudges (case 2 — suppression workflow needed) and `info` for already-suppressed acknowledgements (case 1 — but prefer `NO_REVIEW` when the acknowledgement adds no information); never `major` or `critical`. Always end with `**Skill ID:** suppression-feedback`.

If no finding is emitted, output exactly:

```text
NO_REVIEW: suppression-feedback — suppression workflow に関連する変更や指摘が検出されない
```
