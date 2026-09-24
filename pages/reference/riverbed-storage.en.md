# Riverbed Memory Storage Design

Riverbed Memory is a lightweight storage system for leveraging past decisions and patterns in LLM reviews. In v1 it operates by appending entries to a single JSON file at `.river/memory/index.json` inside the repository (`src/lib/riverbed-memory.mjs`).

## Directory Structure

```text
.river/memory/
  index.json
```

- `index.json`: A single file that holds the entries array and a version field. It conforms to `schemas/riverbed-index.schema.json`, and each entry conforms to `schemas/riverbed-entry.schema.json`.

Disk I/O goes through functions like `loadMemory` / `appendEntry` / `queryMemory` / `supersede` / `expireEntries`. When the file does not exist, a stateless fallback returns `{ entries: [], version: "1" }`. `expireEntries` transitions entries whose `expiresAt` has passed into `status: archived`. When `expiresAt` cannot be parsed as a timestamp, the entry is left as-is and only a warning is emitted, because an unparseable string is no evidence that the deadline passed. This matters most for `promotion_candidate` entries, where `archived` is an irreversible terminal state and archiving therefore amounts to discarding the candidate.

What counts as a valid `expiresAt` is defined in exactly one place, `parseExpiresAt` in `src/lib/expires-at.mjs`, and it is the same set of values the CLI's `--expires` accepts: RFC 3339 `YYYY-MM-DD` and date-time only, with impossible calendar days (such as `2027-02-30`) rejected. Values `Date` happens to read, such as `2026` or `2026-08-04 10:00`, are invalid here and are never treated as evidence that a deadline passed.

## Entry Specification (Excerpt)

- `id`: Unique string (e.g., `adr-001`, `pattern-react-query`)
- `type`: `adr | review | wontfix | pattern | decision | eval_result | suppression | resurface`
- `content`: Body text. Markdown/Text assumed.
- `metadata`:
  - `createdAt` (ISO8601), `updatedAt` (Optional)
  - `author`
  - `phase` (`upstream | midstream | downstream`, Optional)
    - A review such as `river run` loads only entries whose `phase` matches its own phase. A `suppression` entry without `phase` is loaded in every phase (`river suppression add` does not write `phase`)
  - `tags`, `relatedFiles`, `links`, `summary`
- `context`: Arbitrary additional info (PR number, related ADR ID, etc.)
- `status`: `active | superseded | archived` (defaults to `active`; `archived` is set by `expireEntries`)

See `schemas/riverbed-entry.schema.json` for details.

## Index Specification (Excerpt)

- `version`: schema version (currently `"1"`)
- `entries[]`: the array of entries described above

## Generation and Usage Flow

1. Running `npm run eval:all -- --persist-memory` appends eval results as `eval_result` entries to `.river/memory/index.json`.
2. To add entries manually, call `appendEntry(indexPath, entry)` from `src/lib/riverbed-memory.mjs`. Use `supersede(indexPath, oldId, newId)` to logically replace an older entry, or `expireEntries(indexPath)` to batch-archive entries past their `expiresAt`.
3. During a review, `runLocalReview` (`src/lib/local-runner.mjs`) calls `loadReviewMemory` (`src/lib/memory-context.mjs`). `loadReviewMemory` reads entries with `loadMemory`, narrows them by phase and changed files, and buckets them by type. The result is injected into the prompt and also drives suppression through `applySuppressions` (`src/lib/suppression-apply.mjs`). `queryMemory` is used for lookups in regression-eval (`src/lib/regression-eval.mjs`).
4. In CI, `.github/workflows/riverbed-persist.yml` persists `index.json` via GitHub Artifacts with 90-day retention.

### Storage Policy

- You can either check `.river/memory/index.json` into Git or keep it local via `.gitignore`. Do not include sensitive information.
- UTF-8 encoding.
- Corrupted files throw on load. Review runs continue via the stateless fallback.

## Sample Data

Examples of ADR, wontfix, and pattern are placed in `tests/fixtures/riverbed/`. Use them as minimal references satisfying the schema.
