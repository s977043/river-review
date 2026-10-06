# Figma Design Drift Detector

**Status**: fixtures + golden + eval scaffolding. `golden/` has 2 outputs (01–02); promptfoo eval is not run in CI (no API keys, config validation only).

## 概要 (Japanese)

フロントエンド差分においてデザイントークンを使わずに直書きされた
色・余白・フォントサイズ・角丸・シャドウを検出するスキルです。

Figma Variables / Tailwind config / CSS custom properties などの
トークンシステムが存在するプロジェクトで、生値（`#3B82F6`, `16px`, `0.5rem` 等）
による実装ドリフトを早期に指摘し、修正候補トークン名まで提示します。

Tailwind ユーティリティクラス (`bg-blue-500`, `p-4` 等) は
トークンシステムの一部として扱い、誤検知しません。

## Overview (English)

This skill detects hardcoded design values in UI code diffs that should use
design tokens instead. It flags colors, spacing, font sizes, border-radius, and
shadows written as raw literals when a design token system (Figma Variables,
Tailwind config, CSS custom properties) is in use.

**Flags**: `#XXXXXX`, `rgb(...)`, `hsl(...)`, arbitrary Tailwind values
(`p-[16px]`), inline `fontSize`/`borderRadius`/`boxShadow` literals.

**Does not flag**: Tailwind utility classes, `var(--token)` references,
`theme()` / token function calls, dynamically computed inline styles.

## Files

| File                                           | Purpose                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| `SKILL.md`                                     | Skill definition and rules                            |
| `prompt/system.md`                             | System prompt for the LLM reviewer                    |
| `prompt/user.md`                               | User prompt template (`{{diff}}` variable)            |
| `fixtures/01-hardcoded-color-happy.md`         | Happy path: inline style with `#3B82F6` → should find |
| `fixtures/02-tailwind-token-false-positive.md` | False-positive guard: Tailwind-only → no finding      |
| `eval/promptfoo.yaml`                          | Eval configuration                                    |

## Golden generation workflow

See `../modern-web-semantic/README.md` for the golden-generation
workflow. Promotion to `recommended: true` requires verified goldens.
