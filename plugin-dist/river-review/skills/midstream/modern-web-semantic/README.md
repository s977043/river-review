# Modern Web Semantic + Platform-Native — eval scaffolding

Status: **fixtures + golden + eval scaffolding**. `golden/` has 2 outputs (01–02); promptfoo eval is not run in CI (no API keys, config validation only).

## Why no golden output yet

Golden output must be generated and verified by running the actual evaluation
(`promptfoo eval` against a real LLM), not hand-written. Hand-writing goldens
would create the appearance of quality without the underlying verification —
the same "posture, not progress" pattern flagged in
[`docs/development/retrospectives/2026-05-21-25.md`](../../../docs/development/retrospectives/2026-05-21-25.md).

## How to generate goldens

1. Install promptfoo: `npm i -g promptfoo` (or use repo-local install).
2. Set API keys: `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`.
3. From this skill directory:

   ```bash
   cd eval && promptfoo eval
   ```

4. Review outputs against the SKILL.md `Output / 出力` contract.
5. Save the verified outputs to `golden/<fixture-name>.md`.

## Promotion path

This skill is registered with `recommended: false` in `skills/registry.yaml`.
Promotion to `recommended: true` requires:

- At least 1 happy-path and 1 false-positive fixture (done)
- Verified golden output for each fixture
- promptfoo eval passing in CI (separate work)
