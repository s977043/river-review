# Review Coverage Phase 1 Execution Plan (#2212)

## Status

**APPROVED after multi-perspective review.**

PR #2214 established the Experimental Review Coverage Contract. Phase 1 wires that contract into runtime observation without changing `decision`, Gate behavior, auto-approve, or Human Review policy.

## Delivery slices

### Slice A—Orchestrator coverage generation

- Use the existing `role × diff chunk` task descriptors as the Review Unit SSoT.
- Derive stable unit IDs as `reviewer:<role>/chunk:<1-based index>`.
- Record subjects from the files assigned to each chunk.
- Map `Promise.allSettled` outcomes to `completed | failed | timed_out`.
- Derive `required` from `autoSelection.required` in auto mode; explicit reviewer selections remain required.
- Return `reviewCoverage` from reviewer orchestration.
- Add runtime regression tests for complete and partial timeout/failure cases. Also cover not-executed and optional auto-selected reviewer failure.

This slice does not expose a new public CLI field yet.

### Slice B—Observe-only surface propagation

After Slice A is green and reviewed:

- propagate `reviewCoverage` through `runLocalReview`;
- expose it additively in JSON output using `schemas/review-coverage.schema.json`;
- persist the same object in saved run records;
- register the runtime field in Stable Interfaces with its Experimental/Beta status;
- keep Gate and decision derivation unchanged.

### Slice C—Visibility and dogfood

After the stored data is proven reliable:

- add Markdown/debug visibility for partial coverage;
- collect coverage distribution and timeout/failure rates;
- decide whether selected/excluded file coverage belongs in this contract or a separate scope ledger.

Gate integration remains a later opt-in phase.

## Multi-perspective review

| Perspective                | Decision            | Reason                                                                                                 |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| Architecture               | APPROVE             | Reuses the actual task descriptors instead of creating a second execution plan.                        |
| Safety / Gate              | APPROVE             | Observe-only; no Gate or verdict input changes.                                                        |
| Backward compatibility     | APPROVE             | Slice A only adds a return field on the reviewer-orchestration path.                                   |
| Schema / Contract          | APPROVE WITH GUARDS | Runtime output must validate against the existing schema; derived values remain the SSoT for counters. |
| Testing / Regression       | APPROVE             | Pins real allSettled timeout/failure paths, not only pure helper behavior.                             |
| Operations / Observability | APPROVE             | Staged exposure lets data quality be verified before promoting the field to a supported surface.       |
| Security / Trust boundary  | APPROVE             | No new network/tool capability and no trust elevation.                                                 |

## Approval conditions

Slice A can merge only when:

- required CI is green;
- Review Coverage schema validation passes for runtime-produced objects;
- existing reviewer orchestration behavior remains unchanged aside from the additive return field;
- no unresolved blocking review thread remains;
- diff review confirms no unrelated source/documentation churn.

Slice B must be separately reviewed before external contract exposure.
