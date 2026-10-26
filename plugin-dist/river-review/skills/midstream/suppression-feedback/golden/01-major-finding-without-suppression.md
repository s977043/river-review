# Expected Output: Major Finding Without Suppression Entry

**Finding:** A `major` severity finding from `logging-observability` (try / catch swallow at `src/api/users.ts:18`) has no active suppression entry; the suppression-vs-fix decision must be made explicitly before merge.

**Evidence:** Companion finding at `src/api/users.ts:18` is `Severity: major`. Riverbed Memory has no `type: 'suppression'` entry for the matching fingerprint.

**Impact:** `major` and `critical` findings are auto-suppressed only when `feedbackType=accepted_risk`. Choosing `false_positive`, `wont_fix`, `not_relevant`, or `duplicate` is blocked by the HIGH_SEVERITY guard, so the same finding will surface on every subsequent PR until the reviewer either fixes the code or registers an `accepted_risk` entry with rationale.

**Fix:** Decide explicitly before merge:

- (a) Remove the swallow and re-raise / log the original error, **or**
- (b) Add a suppression with explicit rationale:

  ```bash
  river suppression add \
    --fingerprint <fp from --debug or reviewDebug.suppressionsApplied> \
    --feedback accepted_risk \
    --rationale "upstream logger already records this error; deliberate swallow" \
    --pr <this PR number>
  ```

**Severity:** minor

**Confidence:** medium

**Skill ID:** suppression-feedback
