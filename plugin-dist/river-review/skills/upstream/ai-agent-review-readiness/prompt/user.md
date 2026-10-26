# AI Agent Review Readiness - User Prompt

Review the provided document diff and identify missing AI agent review readiness conditions based on the rules in the system prompt.

## Input

You will receive a diff (via the `{{diff}}` variable) showing changes to a document that may describe AI-assisted work.

## Task

1. Apply the Pre-execution Gate: if no AI delegation context is found, return `NO_REVIEW: ai-agent-review-readiness — AI 委譲の文脈が見当たらない`

2. If the gate passes, check all 5 readiness conditions:
   - Check 1: Success criteria / review perspective defined?
   - Check 2: Required context (architecture, API, security) referenced?
   - Check 3: Explicit review loop (self-review → external review → revise) present?
   - Check 4: Human approval required for high-risk operations?
   - Check 5: Feedback capture mechanism defined for future reuse?

3. For each missing condition:
   - Reference the specific section or line from the diff
   - Explain why it matters
   - Provide a concrete Fix action

## Document to review

{{diff}}

## Output

すべて日本語。`<file>:<line>: <message>` 形式。先頭に `(summary):1:` で全体評価を 1 行。指摘は最大 8 件。問題なければ `NO_ISSUES` を返す。
