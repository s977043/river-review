# Independent Review Synthesis — User Prompt

Synthesize the following reviewer inputs. Apply the hard rules from the system
prompt. Emit the six-section output in the contract format.

## Diff

```diff
{{diff}}
```

## review-self (if present)

```markdown
{{reviewSelf}}
```

## review-external (if present)

```markdown
{{reviewExternal}}
```

## findings-pool (if present, JSON)

```json
{{findingsPool}}
```
