# design-system-component-reuse

## Design System Component Reuse Guard

## 日本語

差分が UI プリミティブ（Button / Input / Modal / Card / Badge 等）を既存のデザインシステムコンポーネントを使わずにゼロから再実装していないかを検出するスキルです。

Figma → コード実装フローで「既存コンポーネントを無視してインラインスタイル付きの素の HTML 要素を使う」パターンを防ぎ、デザインシステムの一貫性を維持します。

**検出対象**: 新規コンポーネントファイル（またはコンポーネント関数）が `<button>` / `<input>` / `<div>` 等を 3 つ以上のユーティリティクラスまたは `style=` でスタイリングしており、かつファイルがデザインシステム定義ディレクトリ（`components/ui/` 等）の外にある場合。

**Severity**: major  
**Confidence**: medium（リポジトリ全体のコンポーネント一覧なしに既存コンポーネントの有無を確定できないため）

---

## English

A skill that detects when a diff reimplements a UI primitive (Button, Input,
Modal, Card, Badge, etc.) from scratch using raw HTML elements with custom
styling, instead of importing and reusing an existing design system component.

Prevents the "ignore the design system and inline-style raw HTML" pattern that
commonly occurs during Figma-to-code implementation, helping maintain design
system consistency.

**Triggers on**: new component files (or new component functions) that render
`<button>`, `<input>`, or a styled `<div>`/`<span>` with ≥3 utility class
tokens or `style=`, where the file lives outside the design system definition
directories (`components/ui/` etc.).

**Severity**: major  
**Confidence**: medium (cannot confirm existing component existence without
full repo context)

---

## Files

| Path                                                    | Purpose                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `SKILL.md`                                              | Skill metadata, rules, false-positive guards, output contract              |
| `prompt/system.md`                                      | System prompt for the LLM reviewer                                         |
| `prompt/user.md`                                        | User prompt template (`{{diff}}` placeholder)                              |
| `fixtures/01-button-reimplemented-happy.md`             | Happy-path: `SubmitButton.tsx` reimplements `<button>` — should be flagged |
| `fixtures/02-ui-primitive-definition-false-positive.md` | `src/components/ui/Button.tsx` size prop — should NOT be flagged           |
| `eval/promptfoo.yaml`                                   | promptfoo evaluation config                                                |
