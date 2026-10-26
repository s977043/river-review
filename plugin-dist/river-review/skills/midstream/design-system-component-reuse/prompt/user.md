# Design System Component Reuse Guard — User Prompt

Review the provided code diff. Apply the detection heuristics and
false-positive guards from the system prompt.

If a finding applies, emit one block in the documented Output contract format.

If the diff is suppressed (definition file / wrapper / test / story / small
fix), respond with "No findings" and state which guard applied.

## Input

```diff
{{diff}}
```
