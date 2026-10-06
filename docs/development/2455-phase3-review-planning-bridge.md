# #2455 Phase 3—Observe-only Review Planning Bridge

## Status

Implementation note for Issue #2455 Phase 3.

Phase 2 established deterministic scoring for human-labeled Review Concern obligations. Phase 3 connects a successful or partial Concern Map to review-planning observations. Reviewer routing and Skill routing remain unchanged. Review Coverage status, Gate behavior, and merge authority also remain unchanged.

Tracking issue: #2523.

## Goal

The bridge answers:

> If the same existing deterministic routing rules are scoped to each semantic concern, which reviewer roles and already-selected Skills look relevant, and how does that differ from the existing whole-diff auto-selection?

It does not answer:

> Which reviewers or Skills should actually run?

The existing router remains authoritative.

## Responsibility split

```text
Review Concern Map
  -> per-concern subject paths
  -> existing file classifier
  -> existing selectRolesAuto
  -> observe-only role recommendation

existing Execution Plan selected Skills
  -> existing Skill applyTo metadata
  -> per-concern subject overlap
  -> observe-only Skill recommendation

existing Review Coverage units
  -> subject overlap
  -> optional concernRefs trace
```

No recommendation is fed back into execution.

## Reviewer-role recommendation

For each concern, the bridge classifies that concern's changed and affected subject paths with `classifyChangedFiles()` and calls the existing `selectRolesAuto()`.

The bridge deliberately does not create a second role map.

Per-concern routing uses path evidence only. Whole-diff risk and semantic signals remain visible in the existing baseline selection. They are not copied onto every concern. The recorded delta therefore exposes cases where a global signal selected a role that cannot yet be attributed to a specific concern.

## Existing auto-selection comparison

The observation records the whole-diff `selectRolesAuto()` output from the current plan inputs:

- file types
- risk assessment
- review signals

It then compares that baseline with the union of per-concern role recommendations.

The delta contains:

- `recommendedOnly`
- `existingOnly`
- `shared`

The delta is evidence only. It has `applied: false` and cannot add or remove an executed reviewer.

## Skill recommendation

Phase 3 does not rerun Skill planning and does not revive Skills that the current Execution Plan excluded or pruned.

The bridge looks only at `plan.selected`. A selected Skill is associated with a concern when its existing `applyTo` metadata matches at least one changed or affected concern subject.

Each recommendation records:

- Skill id
- matched concern subjects
- reason `selected-skill-applyTo-overlap`

This keeps the existing Execution Plan as the Skill-routing SSoT.

## Failed and partial Concern Maps

A failed Concern Map is not negative routing evidence.

When `analysis.status` is `failed`:

- planning observation status is `unavailable`
- existing auto-selection is still recorded
- recommendation is `null`
- delta is `null`
- `applied` remains `false`

A partial Concern Map may emit recommendations, but the planning observation is explicitly marked `partial` and carries the original limitations.

## Review Unit concernRefs

`review-coverage.schema.json` allows an optional `concernRefs[]` field on each Review Unit.

The local runner adds a concern ref only when the Review Unit's actual `subjects[]` overlap the concern's changed or affected subjects.

The enrichment preserves any existing refs and de-duplicates the result.

`concernRefs` is provenance only:

- it is optional
- missing refs are allowed
- missing refs do not make coverage partial
- missing refs do not increase incomplete unit counts
- refs do not change `required`
- refs do not change Gate decisions

Review Coverage continues to describe execution completion, not semantic Concern coverage.

## Default-off compatibility

The planning bridge is reachable only when a Review Concern Map exists. The analyzer remains opt-in through `RIVER_CONCERN_ANALYZER=1`.

With the analyzer off, the bridge returns no observation and no Review Unit gains `concernRefs`.

## Output shape

An observed bridge result has the following conceptual shape:

```json
{
  "kind": "review-concern-planning-observation",
  "status": "observed",
  "existingAutoSelection": {
    "reviewerRoles": ["bug-hunter", "security-scanner"]
  },
  "recommendation": {
    "reviewerRoles": ["bug-hunter", "security-scanner", "test-gap"],
    "skillIds": ["security-review", "test-review"]
  },
  "delta": {
    "reviewerRoles": {
      "recommendedOnly": ["test-gap"],
      "existingOnly": [],
      "shared": ["bug-hunter", "security-scanner"]
    }
  },
  "applied": false
}
```

The detailed `concerns[]` entries retain the concern id, subjects, role recommendations, and matched selected Skills.

## Promotion boundary

Phase 3 still does not justify active concern-aware routing.

Before promotion, later phases need paired evidence for:

1. whether concern-derived recommendations expose review obligations missed by the current router
2. whether added roles improve Major/Critical recall
3. whether additional reviewer work increases false positives or redundant findings
4. latency, token, and model-call cost
5. human correction burden
6. stability across repeated runs

Phase 4 may use `concernRefs` for semantic coverage experiments. Missing refs must remain distinct from execution failure unless a later explicit contract changes that rule.

## References

- #2455
- #2523
- ADR-014
- `src/lib/review-concern-planning-bridge.mjs`
- `src/lib/reviewer-orchestrator.mjs`
- `src/lib/file-classifier.mjs`
- `schemas/review-coverage.schema.json`
- `docs/development/2455-phase2-concern-evaluation.md`
