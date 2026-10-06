# Modern Web Browser Compatibility — eval scaffolding

Status: **fixtures + golden + eval scaffolding**. `golden/` has 2 outputs (01–02); promptfoo eval is not run in CI (no API keys, config validation only).

See `../modern-web-semantic/README.md` for the rationale
(hand-written goldens reproduce the "posture, not progress" anti-pattern) and
the `promptfoo eval` workflow to generate verified goldens.

Promotion to `recommended: true` in `skills/registry.yaml` requires verified
goldens + promptfoo eval in CI.
