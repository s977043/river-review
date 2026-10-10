# PlanGate interactive review feedback interoperability (Phases A-C)

Tracking: River Review #2577. Producer: PlanGate #1521 (PR #1527 merged).
Related contracts: #2322 (resolution), #2212 (coverage), #2368 (decision surface).
Evidence architecture: #2470 and #2509.

## Trust boundary

PlanGate owns the canonical `plan.md` and the C-3 human approval record.
The optional HTML collects feedback for explicit review questions.
Feedback is not approval. It is not a finding or a verification result.
It cannot authorize execution or change River Review's gate or verdict.

River Review owns its review findings and coverage.
It also owns resolution and provenance evidence.
Untrusted browser-generated JSON never grants approval.

## Review-only sidecar contract

```json
{
  "schemaVersion": 1,
  "kind": "plan-review-feedback",
  "taskId": "TASK-0001",
  "source": {
    "plan": {
      "path": "plan.md",
      "sha256": "64-lowercase-hex"
    },
    "questions": {
      "path": "review-questions.json",
      "sha256": "64-lowercase-hex"
    }
  },
  "feedback_only": true,
  "approval_granted": false,
  "generatedAt": "RFC3339-UTC-time",
  "answers": [
    {
      "questionId": "Q-1",
      "status": "answered",
      "response": "Canary",
      "note": ""
    },
    {
      "questionId": "Q-2",
      "status": "deferred",
      "response": "",
      "note": "Need more evidence"
    }
  ]
}
```

The source SHA-256 values cover the raw bytes of each file.
Answer status is `answered`, `deferred`, or `unanswered`.
An answered item requires a non-empty response.
A deferred item requires a non-empty note and an empty response.
An unanswered item has an empty response and an empty note.
Unknown states do not imply affirmative consent.
Multiple exports do not imply a canonical newest-wins policy.

## Phase B: source-matched local validation

PlanGate PR #1534 provides the read-only source-bound JSON validator.
River Review PR #2620 independently validates local source bytes when
building a display-only projection. Neither tool authenticates the reviewer.
No automatic feedback importer or approval writer is installed.
The validation boundary applies these checks:

1. Check exact schema version and kind.
2. Validate types and allowed states. Reject duplicate question IDs.
3. Keep source file paths within the task directory.
4. Recompute both source hashes from the raw file bytes.
5. Mark hash mismatches as stale. Treat missing files as blocked.
6. Require every question ID to exist in the question source.
7. Never infer reviewer identity from timestamps or text fields.
8. Keep feedback as separate provenance and link only explicit artifact references.
9. Require a separate PlanGate C-3 human action to accept changes.

SHA-256 matching provides source integrity and freshness checks.
It does not establish reviewer identity or signed authorization.

## Phase C opt-in HTML projection (#2601)

The library reads explicit local PlanGate task files in a read-only manner.
It checks the raw plan and question SHA-256 digests.
It validates question definitions and answer states before building the
optional display-only model. It does not trust a `validated` flag.

```js
import { loadPlanFeedbackProjection } from './src/lib/plan-feedback-projection.mjs';
import { formatHtmlOutput } from './src/lib/output-formatters/html.mjs';

const planFeedback = loadPlanFeedbackProjection({
  workDir: '/local/project/docs/working/TASK-0001',
  feedbackPath: '/local/downloads/TASK-0001-review-feedback.json',
  taskId: 'TASK-0001',
});
const html = formatHtmlOutput(canonicalReviewResult, 'midstream', {
  planFeedback,
});
```

The canonical review result is supplied by the existing River Review host.
The optional third argument adds only an HTML section. Without the argument
the existing output is unchanged. Any arbitrary object pretending to be a
validated projection is rejected. The projected question text, answer and
artifact references are escaped. No extra judge, finding, gate, or coverage
status is created.

Source hashes prove freshness against task files at load time; they do not
prove a reviewer's identity. The file-reading host is responsible for
providing its own local paths and protecting them from untrusted callers.
The module never sends a network request or updates an approval record.
Declared `artifactRefs` are display hints, not proof that a referenced
artifact exists or was reviewed. They are rendered as escaped text only.

CLI wiring is explicitly opt-in; never read an implicit environment variable
or accept a browser-only `validated` field as permission to render.

## Explicit HTML CLI integration

The PlanGate source files and exported JSON must be available locally.
River Review can then display source-matched questions in the review report:

```sh
river run . --dry-run --output html \
  --plan-feedback /local/downloads/TASK-0001-review-feedback.json \
  --plan-feedback-workdir /local/project/docs/working/TASK-0001 \
  --plan-feedback-task TASK-0001 > review.html
```

All three flags are required together and are only accepted by `river run`
with `--output html`. Input validation executes before the review starts.
Changed/missing/malicious inputs exit nonzero with no success HTML.

This feature is explicit. It never takes approval from browser text and
never changes a canonical review verdict, gate, or review coverage.
If the repository has no changes to review, the ordinary no-changes path
still applies; the flags do not create a fabricated review run.

## Phase C: read-only decision surface

The optional HTML section presents answered, unanswered, and deferred items.
It never creates findings or overrides the canonical decision.
Disappearance in a later review is not evidence of verified resolution.
All findings and incomplete review coverage remain canonical (#2212, #2322).

The source task ID and exact plan/question SHA-256 values serve as stable
references back to the PlanGate C-3 working files. `artifactRefs` are rendered
as escaped text, not verified clickable URLs: the HTML output may be moved
away from the source repository, and embedding an absolute `file://` path
could disclose private local locations. Creating hyperlinks requires a
separately trusted, explicit base URL and is not part of this contract.

## Delivery status

- [x] Phase A: review-only contract and trust boundaries.
- [x] Phase B: PlanGate local validator (producer-side) is merged; no automatic importer.
- [x] Phase C: source-matched HTML projection (River Review #2620) and explicit
  `river run --output html` flags (River Review #2621), both merged.
- [x] Real-browser keyboard focus, actual disk download, and validator roundtrip
  tested in PlanGate #1542 (merged; #1535 closed).

The Phase A/B/C delivery slices were reviewed independently in PRs #2584,
#2620, and #2621. PlanGate provides the feedback UI/validator and browser E2E.
Neither phase changes the current approval or gate authority.

Merged PR #2621 has a successful latest-head CI, CodeQL, and PlanGate Review.
The HTML report does not authenticate a human or grant C-3 approval.
Missing or stale explicit feedback fails closed before review output; with no
feedback flags, legacy behavior remains unchanged.

## Security and compatibility checklist

- No network dependency or third-party code copying.
- No secrets included in published artifacts.
- No extra judge or approval gate.
- No default behavior or schema change.
- No suppression of raw findings or traceability.
