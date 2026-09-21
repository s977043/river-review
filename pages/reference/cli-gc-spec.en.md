---
title: CLI Spec — `river gc`
---

`river gc` is River Review's **deterministic garbage-collection** entrypoint. It is a maintenance CLI that runs outside the review pipeline and deletes (or flags) stale artifacts under `.river/memory/`, `artifacts/evals/`, `artifacts/review-artifact*.json`, and temp files left behind by previous CLI runs. It is NOT a review CLI — it shares CLI ergonomics with `river review *` only for consistency, so CI can call it with familiar flags.

> Related issues: #576 (Task) / #509 (Capability) / #507 (Epic)
> Related workflow: `.github/workflows/weekly-gc.yml`

## Positioning

- `river gc` is **not a review CLI**. It is not a sibling of `river review plan` / `river review exec` / `river review verify`; it is an independent maintenance CLI that collects the artifacts those commands produce.
- "Deterministic" means: given the same filesystem state, the same retention policy, and the same reference timestamp (`--now`), the same set of files is always chosen for removal. Ties are broken by lexicographic path order.
- Stability: **Internal**. The `river` CLI is not published to npm and has no distribution channel. Adding, removing, or altering the semantics of a flag, and changing a default, are all outside the Stable Contract and ship in a minor or patch release. The defaults are:
  - `--retention-days` default `90`
  - `--max-entries` default `1000`
  - `--max-size-mb` default `500`

## Usage

```bash
river gc [options]
```

### Examples

```bash
# 1) Default is dry-run — list what would be removed, do not delete
river gc

# 2) Actually delete (typical CI / weekly workflow usage)
river gc --force

# 3) Emit machine-readable result for CI to consume
river gc --force --json --output-file ./artifacts/gc-result.json

# 4) Only memory and evals, only entries older than 30 days, dry-run
river gc --scope memory --scope evals --retention-days 30

# 5) Protect important temp files from deletion
river gc --force --exclude 'artifacts/keep/**'
```

## Arguments and Options

### Retention knobs

| Option                  | Type   | Default      | Description                                                                                                    |
| ----------------------- | ------ | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `--retention-days <N>`  | number | `90`         | Delete entries older than N days, based on artifact metadata `timestamp` (mtime fallback).                     |
| `--max-entries <N>`     | number | `1000`       | When per-scope entry count exceeds N, drop the oldest until at most N remain.                                  |
| `--max-size-mb <N>`     | number | `500`        | When per-scope total size exceeds N MB, drop the oldest until the sum is ≤ N MB.                               |
| `--now <iso-timestamp>` | string | system clock | Pin the reference timestamp for deterministic test runs. Used when comparing against the `timestamp` metadata. |

`--retention-days` / `--max-entries` / `--max-size-mb` are evaluated as a **union**: a file matched by any one of them is eligible for removal. Files matched by multiple policies are still removed exactly once.

### Scope selectors

| Option             | Type                                                    | Default | Description                                                                         |
| ------------------ | ------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `--scope <value>`  | `memory` / `evals` / `review-artifacts` / `tmp` / `all` | `all`   | Repeatable. Multiple values are unioned. `all` expands to the four concrete scopes. |
| `--exclude <glob>` | string                                                  | -       | Repeatable glob (`.gitignore` syntax) of paths to protect from deletion.            |

Files matching `--exclude` are **always kept**, regardless of retention policy. Excluded files never appear in `removed[]`; the exclusion is reflected only in `keptSummary` counts.

### Mode

| Option      | Type | Default                         | Description                                                                                           |
| ----------- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `--dry-run` | flag | `true` when `--force` is absent | Enumerate deletion candidates only; do not remove. Exit `0`.                                          |
| `--force`   | flag | `false`                         | Actually delete. If both `--dry-run` and `--force` are supplied, **`--dry-run` wins** (safety-first). |

`river gc` performs **no destructive action** unless `--force` is explicitly set. CI jobs that perform real deletion must always pass `--force`.

### Output

| Option                 | Type   | Default | Description                                                                                                      |
| ---------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `--json`               | flag   | `false` | Emit the machine-readable plan / result (see below) on stdout. Human summary is routed to stderr.                |
| `--output-file <path>` | string | -       | Destination for `--json`. When set, stdout is untouched and JSON is written to the file.                         |
| `--quiet`              | flag   | `false` | Suppress the human-readable summary. With `--json`, also silences the stderr summary. Errors still go to stderr. |
| `--debug`              | flag   | `false` | Verbose stderr logging. May populate extra detail in `errors[]`.                                                 |

## GC scopes

The paths each scope touches, and what it explicitly keeps.

| Scope              | Target directories / patterns                              | Included                                      | Explicitly excluded                                         |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `memory`           | `.river/memory/**`                                         | Indexes, embeddings, conversation history     | `.river/memory/index.json` (the current index itself)       |
| `evals`            | `artifacts/evals/**`                                       | Per-run eval results and snapshots            | `artifacts/evals/latest/**` (symlink to the current run)    |
| `review-artifacts` | `artifacts/review-artifact*.json`, `artifacts/review-*.md` | Review Artifacts and human-readable summaries | `artifacts/review-artifact.schema.json` (the schema itself) |
| `tmp`              | `.river/tmp/**`, `artifacts/.tmp/**`                       | Intermediate files left by CLI runs           | (none; empty directories are preserved)                     |

- "Single sources of truth" (the live memory index, `evals/latest`, schema files) are **hard-guarded**: no retention policy can delete them.
- Deletion is per-file. Empty directories are left in place to avoid breaking symlinks or relative references.

## Output JSON

Shape emitted when `--json` is set:

```text
{
  "version": "1",
  "mode": "dry-run" | "force",
  "scopes": ["memory", "evals", ...],
  "retention": { "days": N, "maxEntries": N, "maxSizeMb": N },
  "removed": [
    { "path": "...", "sizeBytes": N, "reason": "age" | "count" | "size" },
    ...
  ],
  "keptSummary": {
    "memory":           { "count": N, "sizeBytes": N },
    "evals":            { "count": N, "sizeBytes": N },
    "review-artifacts": { "count": N, "sizeBytes": N },
    "tmp":              { "count": N, "sizeBytes": N }
  },
  "errors": [
    { "path": "...", "message": "..." }
  ]
}
```

### Field definitions

| Field         | Type     | Description                                                                                                 |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `version`     | string   | Schema version. Currently `"1"`. Bumped on breaking changes.                                                |
| `mode`        | string   | `"dry-run"` or `"force"`. `force` only when `--force` was set and honored.                                  |
| `scopes`      | string[] | Resolved scope list (`all` is expanded).                                                                    |
| `retention`   | object   | Retention knobs actually applied. Defaults appear verbatim when flags were not supplied.                    |
| `removed`     | array    | Files that were removed (or would be removed, in dry-run). `reason` records the first matching policy only. |
| `keptSummary` | object   | Per-scope count and total bytes of retained entries. Files protected by `--exclude` count here.             |
| `errors`      | array    | Per-file failures (delete failure, stat failure). A non-empty `errors` does not stop other deletions.       |

- `removed[]` is sorted by **lexicographic path order**. This is one of the pillars of determinism.
- When a file matches more than one of `age` / `count` / `size`, the recorded `reason` uses precedence `age` > `count` > `size`.

## Exit codes

| Exit | Meaning                                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success. Both dry-run and force exit `0` when `errors` is empty.                                                                                                                                                                                          |
| `1`  | Runtime failure. `errors` has at least one entry (delete / IO / permission error during execution).                                                                                                                                                       |
| `2`  | Config error. Unknown `--scope` value, malformed glob, non-numeric `--retention-days` / `--max-entries` / `--max-size-mb`, or mutually exclusive flag misuse. Argument validation completes at startup, so these errors are caught before any skill runs. |

Supplying both `--dry-run` and `--force` is not a config error — `--dry-run` wins, as stated above.

### mode × exit code

| mode      | errors    | Exit | Meaning                                                                              |
| --------- | --------- | ---- | ------------------------------------------------------------------------------------ |
| `dry-run` | empty     | `0`  | Candidates listed. No side effects.                                                  |
| `dry-run` | non-empty | `1`  | IO error occurred while enumerating (e.g. permission denied).                        |
| `force`   | empty     | `0`  | All listed files deleted successfully.                                               |
| `force`   | non-empty | `1`  | Some deletions failed. Successful deletions are NOT rolled back (idempotency first). |

## Determinism guarantee

`river gc` is deterministic when the following three conditions all hold.

1. **Same filesystem state**: the set of files under the selected scopes, with identical `timestamp` metadata (or mtime fallback) and identical sizes.
2. **Same retention policy**: identical values for `--retention-days` / `--max-entries` / `--max-size-mb`.
3. **Same reference time**: identical `--now` (omitting `--now` uses system time and therefore breaks determinism).

Under these conditions the **contents, order, and `reason` of `removed[]`** are identical across runs.

- Tie-break rule: when two files share the same `timestamp`, they are ordered **lexicographically by path** (oldest-first within equal timestamps). `--max-entries` / `--max-size-mb` boundaries honor this same ordering.
- `--exclude` globs are normalized before matching, so matches themselves are also lexicographically stable.

## CI / `weekly-gc.yml` integration

Standard CI invocation contract:

```bash
river gc --force --json --output-file ./artifacts/gc-result.json
```

- `artifacts/gc-result.json` should be uploaded as a workflow artifact for auditing.
- Exit `0` means "retention policy applied cleanly" — **including when zero files were removed** (nothing to clean is still success).
- Non-zero exit feeds into the `weekly-gc.yml` "create issue on failure" path.
- The current `.github/workflows/weekly-gc.yml` does not yet invoke `river gc`; it runs lint / structure test / build as a placeholder. This spec is the **prerequisite contract** for wiring `river gc` into that workflow once the implementation lands.

## Related documents

- [Artifact Input Contract](./artifact-input-contract.en.md) — input artifact SSoT (prerequisite for scope targeting)
- [Review Artifact](./review-artifact.en.md) — schema managed by the `review-artifacts` scope
- [Riverbed Memory](./riverbed-storage.en.md) — persistent storage managed by the `memory` scope
- [Stable Interfaces](./stable-interfaces.en.md) — CLI / GitHub Actions stability contract
- [`river review exec`](./cli-review-exec-spec.en.md) / [`river review plan`](./cli-review-plan-spec.en.md) — the review CLIs (distinct responsibility from GC)
