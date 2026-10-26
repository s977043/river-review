# Expected Output: False Positive Candidate (Minor Severity)

**Finding:** A `minor` severity credential finding from `security-basic` is in `tests/auth.test.ts` with `test-`-prefixed mock values; this is the canonical false-positive shape for credential checks. Recommend `feedbackType=false_positive`, not `accepted_risk`.

**Evidence:** Companion finding at `tests/auth.test.ts:11` is `Severity: minor`, `Confidence: low`. The diff is entirely in a `tests/` path and the values are `test-password-123-rotated`, `test-api-key-mock-value`, `test-session-id-stub`, and `test-token-do-not-use-in-prod` — all visibly mock-shaped.

**Impact:** Choosing `accepted_risk` for a misdetection conflates "real risk we accept" with "the tool is wrong here," making future audits noisier. The HIGH_SEVERITY guard does **not** apply at `minor` severity, so `false_positive` suppression is safe — it will not bypass `major` / `critical` checks.

**Fix:** Use `false_positive` (not `accepted_risk`) for this fingerprint:

```bash
river suppression add \
  --fingerprint <fp from --debug or reviewDebug.suppressionsApplied> \
  --feedback false_positive \
  --rationale "test fixture; values are visibly mock and not a production secret" \
  --files tests/auth.test.ts \
  --pr <this PR number>
```

If similar test fixtures recur, prefer adding a guard fixture under `skills/midstream/security-basic/fixtures/` so the underlying detector stops misfiring instead of suppressing every instance.

**Severity:** minor

**Confidence:** medium

**Skill ID:** suppression-feedback
