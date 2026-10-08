# Independent Review Synthesis — eval scaffolding

Status: **fixtures + golden + eval scaffolding**. `golden/` has 2 outputs (01–02); promptfoo eval is not run in CI (no API keys, config validation only).

See `../modern-web-semantic/README.md` for the rationale
(hand-written goldens reproduce the "posture, not progress" anti-pattern) and
the `promptfoo eval` workflow to generate verified goldens.

Promotion to `recommended: true` in `skills/registry.yaml` requires verified
goldens + promptfoo eval in CI.

## Phase context

Phase 1 of [#911](https://github.com/s977043/river-review/issues/911):
skill body + fixtures + eval scaffolding only. Phase 2 will add artifact
contract extensions (`findings[]` provenance fields, schema `inputContext`
enum additions). Phase 3 will add CLI / Actions ensemble mode.
