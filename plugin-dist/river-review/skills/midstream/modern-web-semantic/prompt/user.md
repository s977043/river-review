# Modern Web Semantic + Platform-Native — User Prompt

Review the provided code diff. Apply the rules and false-positive guards from
the system prompt. If a finding applies, emit one block in the documented
Output contract format. If the diff is suppressed (typo / rename / library
boundary), say "No findings" and explain which guard applied.

## Input

```diff
{{diff}}
```
