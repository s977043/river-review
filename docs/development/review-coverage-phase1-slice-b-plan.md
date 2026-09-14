# Review Coverage Phase 1 Slice B Plan (#2212)

## Status

**APPROVED after multi-perspective review.**

Slice A (PR #2216) made `reviewCoverage` a deterministic runtime observation inside reviewer orchestration. Slice B propagates that same object to machine-readable output and saved runs without changing Gate, decision, auto-approve, or Human Review policy.

## Goal

Make runtime Review Coverage observable and dogfoodable through supported machine-readable surfaces before any Gate integration.

The data flow is one-way and additive:

```text
reviewer-orchestrator
  -> runLocalReview result
  -> JSON artifact
  -> saved run record
```

No layer recomputes coverage.

## Slice B-0 — reviewer identity guard

Before external emission, normalize explicit reviewer role lists to stable unique roles while preserving first-seen order.

Why:

- v1 unit identity is `reviewer:<role>/chunk:<index>`;
- duplicate explicit roles can otherwise produce duplicate unit IDs;
- role-level aggregation already treats the role name as the identity;
- repeated execution of an identical role is not a documented contract.

`auto` selection remains unchanged.

Tests must pin order-preserving de-duplication and preserve invalid-role reporting.

## Slice B-1 — local result propagation

`runLocalReview` passes through `review.reviewCoverage` additively.

Rules:

- reviewer orchestration result: preserve the exact object;
- single-reviewer path: do not invent coverage;
- absence must stay distinguishable from `complete`.

## Slice B-2 — JSON artifact

Add optional top-level `reviewCoverage` to `schemas/output.schema.json` and `formatJsonOutput()`.

The Review Coverage shape remains owned by `schemas/review-coverage.schema.json`.

Runtime validation must register that schema with Ajv before compiling `output.schema.json`, then reference it by `$id`. Do not copy Review Coverage fields into `output.schema.json`.

Consumers that validate `output.schema.json` outside the Node runtime must be able to resolve the same `$id` without network access. The bundled Python runner therefore registers the local `review-coverage.schema.json` in its schema resolver store.

Old JSON payloads without `reviewCoverage` remain valid.

## Slice B-3 — saved run

`buildRunRecord()` conditionally persists the same `result.reviewCoverage` object.

Rules:

- no recomputation;
- old records without coverage remain readable;
- coverage is observation metadata, not an attestation;
- existing result-store trust-boundary semantics remain unchanged.

## Slice B-4 — interface declaration

Register these surfaces as **Experimental** in `pages/reference/stable-interfaces.md`:

- `schemas/review-coverage.schema.json`;
- JSON output `reviewCoverage`;
- saved-run `reviewCoverage`.

Explicitly state that Review Coverage does not influence Gate or decision in Phase 1.

## Non-goals

- Gate / decision integration;
- Markdown, YAML, or HTML presentation;
- selected/excluded file scope accounting;
- `skipped` / `unrunnable` Review Unit states;
- Execution Manifest integration;
- signed or independently attested coverage evidence.

## Test plan

1. explicit duplicate reviewers are normalized in stable first-seen order;
2. invalid role reporting is preserved after normalization;
3. orchestrated local result carries the same `reviewCoverage` object;
4. single-reviewer local result does not synthesize coverage;
5. JSON output emits `reviewCoverage` only when present;
6. JSON output with coverage validates using the Review Coverage schema as the SSoT;
7. JSON output without coverage remains schema-valid;
8. bundled non-Node consumers resolve the Review Coverage schema locally without network access;
9. saved run persists the same coverage object;
10. saved run without coverage preserves the legacy key shape;
11. partial coverage does not change `decision` or Gate;
12. Linux and macOS unit suites, Integration CLI, schema validation, and Action dist freshness are green.

## Multi-perspective review

- **Architecture — APPROVE:** one-way propagation from the runtime producer; no second coverage computation.
- **Contract / SSoT — APPROVE WITH GUARD:** `review-coverage.schema.json` remains the shape SSoT, while each validator resolves that schema locally rather than duplicating it.
- **Reliability — APPROVE:** absence is never rewritten as complete; partial/not-executed remain observable states.
- **Backward compatibility — APPROVE:** new fields are additive and optional. Duplicate-role normalization resolves previously undefined redundant input. Offline schema resolution preserves existing local validation behavior.
- **Security / trust — APPROVE:** metadata propagation adds no capability or authority and does not make saved records tamper-evident.
- **Operations — APPROVE:** JSON and saved runs enable dogfood metrics before Gate policy changes.
- **Testing — APPROVE:** tests cover identity uniqueness, propagation, schema validation, legacy absence, and Gate non-interference; CI must also prove packaged schema availability.

## Approval conditions

Slice B can merge only when:

- required CI is green;
- unresolved blocking review threads are zero;
- output validation does not duplicate the Review Coverage schema;
- machine-readable consumers can resolve Review Coverage without network access;
- legacy artifacts without coverage remain valid;
- duplicate explicit reviewer roles cannot create duplicate Review Unit IDs;
- Gate and decision behavior are unchanged.
