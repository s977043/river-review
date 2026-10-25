# Expected Output: Already-Suppressed Finding (No Repeat Guidance)

No suppression workflow guidance.

**Rationale:** Riverbed Memory already has an active `type: 'suppression'` entry for fingerprint `9f3c1a8b2d4e7f01` (`feedbackType: accepted_risk`, `rationale: 'metrics client is fire-and-forget by design (PR #612)'`, scope: file). The skill's False-positive guards section explicitly prevents re-issuing the suppression workflow when the same fingerprint is already suppressed; doing so would duplicate user-facing noise.

**Optional info-level acknowledgement (only if emitted at all):**

> **Note:** Existing suppression covers this finding (`accepted_risk`, "metrics client is fire-and-forget by design (PR #612)"). No reviewer action required.
>
> **Severity:** info

Do not emit a `minor` or higher finding. Do not repeat the `river suppression add` CLI form. Do not ask the reviewer to choose suppression vs. fix again.
