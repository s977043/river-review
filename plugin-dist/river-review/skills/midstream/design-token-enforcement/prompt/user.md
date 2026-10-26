# Figma Design Drift Detector — User Prompt

Review the provided code diff. Apply the rules and false-positive guards from
the system prompt. Emit one Output block per finding. If suppressed, say
"No findings" and name the guard.

## Input

```diff
{{diff}}
```
