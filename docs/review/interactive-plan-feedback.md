# PlanGate interactive review feedback interoperability (Phase A)

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

## Phase B: optional validator and importer

The importer is not implemented by this Phase A PR.
The proposed validator must perform the following checks:

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

CLI wiring is deliberately separate: do not expose an implicit environment
variable or accept a browser-only `validated` field as permission to render.

## Phase C: read-only decision surface

An optional projection may display unresolved questions with evidence links.
It must not create findings or override the canonical decision.
It must never treat disappearance from a later review as verified resolution.
It must preserve all findings and incomplete review coverage.
System disposition and author resolution remain separate concepts (#2322).

## Delivery status

- [x] Phase A: review-only contract and trust boundaries.
- [x] Phase B: PlanGate local validator (producer-side) is merged; no automatic importer.
- [ ] Phase C: source-checked library HTML projection added; CLI integration remains opt-in future work.
- [ ] Real-browser evaluation of keyboard navigation and JSON download.

Phase B and Phase C require separate reviewable implementation slices.
Neither phase changes the current approval or gate authority.

## Security and compatibility checklist

- No network dependency or third-party code copying.
- No secrets included in published artifacts.
- No extra judge or approval gate.
- No default behavior or schema change.
- No suppression of raw findings or traceability.
