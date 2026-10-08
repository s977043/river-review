# PlanGate interactive review feedback interoperability (Phase A)

Tracking: River Review #2577. Producer: PlanGate #1521.
Existing authority owners include #2322 Review Resolution and #2212 Review Coverage.
They also include #2368 Decision Surface and #2470/#2509 Evidence Architecture.

## Boundary

PlanGate retains plan.md and C-3 approval as the **authoritative** plan and
human-approval records. A PlanGate HTML page may collect review-only answers
to explicit questions. The feedback is **not** a finding or a test result.
It does not authorize execution and cannot change a River Review gate/verdict.

River Review owns review findings, review coverage, resolution status,
provenance, and decision *evidence*. It must not assign approval from an
untrusted browser-originated file.

## Proposed additive review-only sidecar

~~~json
{
  "schemaVersion": 1,
  "kind": "plan-review-feedback",
  "taskId": "TASK-0001",
  "source": {
    "plan": {"path": "plan.md", "sha256": "64-lowercase-hex"},
    "questions": {"path": "review-questions.json", "sha256": "64-lowercase-hex"}
  },
  "feedback_only": true,
  "approval_granted": false,
  "generatedAt": "RFC3339-UTC-time",
  "answers": [
    {"questionId": "Q-1", "status": "answered", "response": "Canary", "note": ""},
    {"questionId": "Q-2", "status": "deferred", "response": "", "note": "Need more evidence"}
  ]
}
~~~

The source digest covers the raw bytes of each input file. Entries have
exactly one of three states: answered, deferred, unanswered. Deferred
requires a non-empty note, answered a non-empty response, and unanswered
must have no response or note. Unknown or
missing status is **not** affirmative consent. Multiple exports can exist,
but there is no implicit newest-wins or promotion to canonical state.

## Planned importer, not implemented in Phase A

An opt-in local validator would:

1. Require an exact schema version and kind. Validate types and allowed states.
   Reject duplicate IDs. Restrict local paths to the task directory.
2. Recompute plan.md and review-questions.json SHA-256 and compare.
   Changed files -> STALE; missing inputs -> UNKNOWN/BLOCKED.
3. Ensure question IDs exist in the referenced question input, and do not
   infer reviewer identity, authenticity, or approval from generatedAt.
4. Keep feedback as separate provenance, link explicit artifactRefs to
   existing finding criterionRefs/artifactRefs **without** inventing IDs.
5. Surface unresolved questions and the evidence link in the existing
   display projection only. Never synthesize a finding, override gate /
   decision, hide partial coverage, or mark a resolution verified.
6. Require a separate human action in the established PlanGate C-3 workflow
   to accept or reject plan changes.

Note: A SHA-256 source digest establishes freshness/integrity matching,
not reviewer authenticity or cryptographic signing. A browser-controlled
JSON answer is not an identity assertion or authorization.

## Relationship to current semantics

- System disposition (blocking/advisory/suppressed) is not human resolution.
- Author says fixed is not verified resolved; absence in another run is
  not verification (Review Resolution #2322).
- A finding's artifactRefs are existing traceability metadata; they are
  not evidence that the user chose an option.
- Incomplete/not_executed review coverage may not become GO/CONVERGED due
  to optional UI results.
- Existing HTML/JSON/YAML formats, Review Artifact, Decision Surface and
  gate must remain compatible.

## Delivery slices / acceptance

- [x] Phase A: contract and trust boundaries documented (this file).
- [ ] Phase B: strict validator + positive/negative fixtures + CLI opt-in.
- [ ] Phase C: decision-only projection referencing validated sidecar.
- [ ] Browser/UX integration evaluation; evaluate whether it reduces human
  decision time without hiding unresolved or low-priority findings.

Phase B/C remain outside this design PR. Their implementation requires
fresh repository-contract review and automated regression evidence.

## Security and compatibility review

Check the following properties before an implementation PR can merge:

- No network dependency or third-party code copying.
- No secrets included in published artifacts.
- No additional judge or approval gate.
- Existing schema and default behavior remain unchanged.
- Raw findings and their traceability remain available.
