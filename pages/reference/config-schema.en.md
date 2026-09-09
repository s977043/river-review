# Config / Schema Overview

## `.river-review.json` (Runtime Config)

Place `.river-review.json` in the repository root to customize review model settings and exclusion conditions. Verified by Zod schema in `src/config/schema.mjs`. Defaults to `src/config/default.mjs` if missing.

### Support Items and Defaults

- `model`
  - `provider`: `openai` (Default). The config schema also accepts `google` / `anthropic`, but the current review pipeline is OpenAI-only (see [#490](https://github.com/s977043/river-review/pull/490)).
    - On the review path (`river review` and the GitHub Action), `resolveOpenAIConfig` in `src/lib/review-engine.mjs` uses `model.provider` as-is. Any other value stops the run before the LLM call and records the skip reason `provider <value> is not supported yet`. There is no `modelName`-prefix client auto-selection on this path.
    - The multi-provider clients (OpenAI / Gemini / Anthropic) apply only to the `river skills <path>` route (`src/core/skill-dispatcher.mjs` → `src/ai/factory.mjs`). That route resolves the model name from each skill's own `model` / `modelHint` — not from `model.provider` — and picks the client by prefix (`gpt|o1` → OpenAI, `gemini` → Gemini, `claude` → Anthropic). Anthropic support was added in [#804](https://github.com/s977043/river-review/issues/804).
  - `modelName`: `gpt-4o-mini` (Default). The schema also accepts prefixes such as `claude-sonnet-4-6` or `gemini-2.0-flash`, but `provider` is what decides whether the review path runs; changing the model name alone still skips unless `provider` is `openai`.
  - `temperature`: `0`
  - `maxTokens`: `600`. This is the value passed to the OpenAI call on the review path. The Anthropic client on the `river skills` route does not read this key; it uses the skill's own `maxTokens`, falling back to a per-model default (8192 for `claude-opus-4-7` and `claude-sonnet-4-6`, 4096 otherwise).
- `review`
  - `language`: `ja` (Japanese) / `en` (English). Switches prompt body and output language.
  - `severity`: `normal` (Default) / `strict` / `relaxed`
  - `additionalInstructions`: Additional review policies (array). Listed at the end of the prompt.
  - `specDirs`: Extra spec/ADR directories (repo-relative paths, array) scanned when linking changed files to related design docs. Merged with the built-in defaults (`docs/adr` / `pages/explanation` / `specs`).
  - `walkthrough`: When `true`, asks the prompt to add a per-file walkthrough section (summary, risk, suggested reading order) to the review output (default `false`).
  - `agentHandoff`: When `true`, asks the prompt to emit a provider-agnostic Agent Handoff section (goal / target files / constraints / steps / tests / done criteria) so another AI agent can act on blocking findings (default `false`).
  - `promptCompiler` ([#1859](https://github.com/s977043/river-review/issues/1859)): execution mode for the Prompt Compiler. The design source is ADR-006 (`docs/adr/006-model-aware-review-prompt-compiler.md`).
    - `mode`: `off` (default) / `observe` / `active`. `off` bypasses the Prompt Compiler entirely and behaves exactly as before it was introduced. `observe` builds the compiled prompt but does **not** send it to the LLM; it records only the hash, the estimated token count, and the profile provenance under `debug.execution.promptCompiler`. No additional LLM call is made. `active` actually sends the compiled prompt to the LLM ([#1861](https://github.com/s977043/river-review/issues/1861)). It is opt-in; the default stays `off`. A run in `active` records `debug.execution.promptCompiler.sentPrompt` as `compiled`, and `river evolve prompt-compare` rejects runs carrying that value; the two-sided A/B comparison is handled by `river evolve prompt-ab` instead ([#1880](https://github.com/s977043/river-review/issues/1880)). Note that `shadow` is deliberately not used as a value.
  - `orchestrator` ([#1689](https://github.com/s977043/river-review/issues/1689)): observability settings for the parallel role execution behind `--reviewers`. The key is named `orchestrator` rather than `reviewers` so it cannot be confused with the `--reviewers` CLI flag, which takes a list of role names.
    - `timeoutMs`: per-role wall-clock budget in milliseconds (integer, `1`–`3600000`). Unset by default, meaning no timeout — every role is awaited to completion. A role that exceeds the budget is recorded as a failed role and the run continues with the other roles' findings (fail-soft). The `RIVER_REVIEWER_TIMEOUT` environment variable takes precedence over this key. Out-of-range or non-integer values are rejected with a warning, because `setTimeout` clamps anything above the 32-bit limit to 1 ms and would cut off every role immediately.
    - `progress`: set to `false` to suppress the per-role progress lines (default `true`). Progress is written to stderr only, so the stdout artifact stays clean. The CLI `--quiet` flag takes precedence over this key.
- `exclude`
  - `files`: Glob patterns to exclude from change diffs.
  - `prLabelsToIgnore`: Skips review if Pull Request label contains target keywords. Matches partial case-insensitive against `RIVER_PR_LABELS` (comma separated) or GitHub Actions `GITHUB_EVENT_PATH`.
- `security` ([#692](https://github.com/s977043/river-review/issues/692))
  - `redact.enabled`: `true` (default). Redacts secrets in repo-wide context and prompts before sending to the LLM.
  - `redact.categories`: Toggle individual categories. Keys:
    - Keys: `githubToken` / `openaiKey` / `anthropicKey` / `googleApiKey` / `awsAccessKey` / `awsSecretKey` / `privateKey`
    - Auth: `bearerToken` / `databaseUrl` / `webhookUrl` / `oauthSecret` / `envAssignment`
    - Fallback: `highEntropy`
  - `redact.extraPatterns`: Additional regex (`{ id, pattern, replacement? }`) for project-specific key formats.
  - `redact.allowlist`: Tokens matching these strings are not redacted (useful for protecting test fixtures).
  - `redact.denyFiles`: Globs added to the path-level deny list (on top of the built-in `.env*` / `*.pem` / `*.key` / `secrets.*`).
  - `redact.entropyThreshold`: `3.0`–`6.0` (default `4.5`). Threshold for the Shannon-entropy fallback detector.
  - `redact.entropyMinLength`: Default `24`. Minimum substring length the fallback detector considers.
- `memory` ([#687](https://github.com/s977043/river-review/issues/687))
  - `suppressionEnabled`: `true` (default). Applies suppression entries from Riverbed Memory. Set to `false` to bypass the gate (emergency override).
  - **`feedbackType` of a suppression entry** (`schemas/suppression-context.schema.json`):
    - `accepted_risk`: a finding kept deliberately after weighing the risk. **The only value that passes the HIGH_SEVERITY guard** — automatic suppression of `major` / `critical` requires it (the HIGH_SEVERITY guard in `src/lib/suppression-apply.mjs`).
    - `false_positive`: a misdetection. `major` / `critical` are blocked by the guard and are not suppressed automatically (they stay manual-handle); `minor` / `info` are suppressed automatically.
    - `wont_fix`: a finding you decided not to fix. As with `false_positive`, `major` / `critical` are blocked by the guard.
    - `not_relevant`: a finding with little bearing on the context of this PR or file. `major` / `critical` are blocked by the guard.
    - `duplicate`: a reference to another entry's fingerprint. The `duplicateOfFingerprint` field can point at the referenced entry (optional in the schema, but recording it is the recommended practice). `major` / `critical` are blocked by the guard.
  - CLI: register an entry interactively with `river suppression add`.
    - Required flags: `--fingerprint <fp>` / `--feedback <type>` / `--rationale <text>`
    - Optional flags: `--scope <pattern>` / `--severity <level>` / `--files <glob>` / `--expires <date>` / `--pr <num>` / `--fingerprint-algo <v1|v2>`
- `context` ([#689](https://github.com/s977043/river-review/issues/689))
  - `reviewMode`: `tiny` / `medium` / `large`. When `budget` is omitted, the preset from `src/lib/context-presets.mjs` is applied. An explicit `budget` always wins.
  - `budget.maxTokens`: `256`–`64000`.
  - `budget.maxChars`: `1024`–`200000`. Both char and token caps apply simultaneously.
  - `budget.perSectionCaps`: Per-section char caps for `fullFile` / `tests` / `usages` / `config`.
  - `ranking.enabled`: `true` to enable proximity-based reordering of context candidates.
  - `ranking.weights`: Per-signal weights for `pathProximity` / `symbolUsage` / `siblingTest` / `commitRecency`, each in `0.0`–`1.0`. Equal weighting if omitted.
  - `tokenizer`: Only `heuristic` is accepted (reserved for future expansion).
- `artifacts`
  - Declares paths to input artifacts. It accepts these 14 IDs.
    - Markdown: `pbi-input` / `plan` / `design` / `todo` / `test-cases` / `review-self` / `review-external`
    - Diff and tool output: `diff` / `junit` / `coverage` / `lint` / `typecheck` / `findings-pool` / `tdd-ledger`
  - Each value is a string path, or an object `{ "path": "...", "optional": <boolean> }` (`optional` is a boolean).
  - Unknown keys are accepted for forward compatibility (catchall). See the [Artifact Input Contract](./artifact-input-contract.md) for the resolution order and per-artifact contract.

- `selection` (skill pack adoption)
  - `packs`: array of pack ids to adopt (e.g. `[typescript, ddd]`). Multiple packs are set-unioned by skill id so each skill runs at most once.
  - `tags`: cross-cutting additions; skills carrying any listed tag join the selection.
  - `skills.include` / `skills.exclude`: add or drop individual skills. Precedence: `exclude > include > union(packs, tags)`.
  - `minTier`: `official` / `community` / `experimental`. Explicitly listed `packs` below minTier still run (warning only).
  - When `--skill-set` is passed on the CLI it overrides the config selection. See [examples/selection/](https://github.com/s977043/river-review/tree/main/examples/selection) for samples.

### Configuration Example

```json
{
  "model": { "provider": "openai", "modelName": "gpt-4o", "temperature": 0.2 },
  "review": {
    "language": "en",
    "severity": "strict",
    "additionalInstructions": ["Focus on security", "Prefer readable variable names"]
  },
  "exclude": {
    "files": ["**/*.md", "docs/**"],
    "prLabelsToIgnore": ["no-review", "wip"]
  }
}
```

### Detailed Configuration Example

A configuration example for the more involved sections — `security` / `memory` / `context`:

```json
{
  "security": {
    "redact": {
      "enabled": true,
      "extraPatterns": [
        {
          "id": "my-api-key",
          "pattern": "MYAPP_[A-Z0-9]{32}",
          "replacement": "[REDACTED_MYAPP_KEY]"
        }
      ],
      "allowlist": ["test_token_placeholder"],
      "denyFiles": ["config/secrets/**", "**/*.vault"],
      "entropyThreshold": 4.5
    }
  },
  "memory": {
    "suppressionEnabled": true
  },
  "context": {
    "reviewMode": "medium",
    "budget": {
      "maxTokens": 16000,
      "perSectionCaps": {
        "fullFile": 4000,
        "tests": 2000,
        "usages": 2000,
        "config": 1000
      }
    },
    "ranking": {
      "enabled": true,
      "weights": {
        "pathProximity": 0.4,
        "symbolUsage": 0.3,
        "siblingTest": 0.2,
        "commitRecency": 0.1
      }
    }
  }
}
```

An example invocation of `river suppression add`:

```bash
river suppression add \
  --fingerprint abc123def456 \
  --feedback accepted_risk \
  --rationale "Intentional use of high-entropy token in test fixture" \
  --scope "src/auth/**" \
  --severity major
```

Expected output:

```text
Suppression entry added.
  fingerprint : abc123def456
  feedback    : accepted_risk
  scope       : src/auth/**
  severity    : major
```

`--fingerprint-algo` selects how a finding is matched. The default `v1` does not include the line number, so it suppresses findings of the same kind across the whole file. `v2` anchors the match to the line, so only the finding on that line is suppressed — but the suppression stops matching as soon as the line shifts. Stay on `v1` when you need a suppression that survives line movement.

### Validation Error Examples

When the Zod schema in `src/config/schema.mjs` rejects the config, errors like the following are printed.

| Example error message                                                              | Cause and fix                                                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Invalid enum value. Expected 'google' \| 'openai' \| 'anthropic', received 'xyz'` | `model.provider` is set to an unsupported value. Use one of `google` / `openai` / `anthropic`.      |
| `Number must be less than or equal to 6` (`security.redact.entropyThreshold`)      | `entropyThreshold` must be within `3.0`–`6.0`. Change it to a value inside that range.              |
| `Unrecognized key(s) in object: 'unknownKey'` (`security.redact`)                  | A key that does not exist in the schema was added. Check for a typo and remove the unnecessary key. |

### Operational Tips

- List labels to skip in CI in `prLabelsToIgnore` and ensure they can be read from `RIVER_PR_LABELS` (e.g., `RIVER_PR_LABELS=no-review,wip`) or GitHub event payload.
- Verify schema integrity and behavior with `npm test` or `npm run lint` after changing settings.

## JSON Schema (Skill / Output)

River Review defines skills and outputs using JSON Schema. Skills assume YAML frontmatter, outputs assume JSON.

- `schemas/skill.schema.json`
  - Required: `id` / `name` / `description` / `category` (plus one of `phase` / `category` / `trigger`, and one of `applyTo` / `files` / `path_patterns` / `trigger`)
  - Optional: `tags` / `severity` / `inputContext` / `outputKind` / `modelHint` / `dependencies`
  - `category` is one of `core` / `upstream` / `midstream` / `downstream` and is the primary routing key. `phase` is kept for backward compatibility.

- `schemas/output.schema.json`
  - Required: `issue` / `rationale` / `impact` / `suggestion` / `priority` / `skill_id`
  - `priority`: `P0` to `P3`

Skills are placed as Markdown files in `skills/{category}/` and can be schema-validated with `npm run skills:validate`.
