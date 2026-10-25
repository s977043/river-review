# Closure Scope Retention Guard - User Prompt

Review the provided code diff and identify long-lived objects that retain their entire enclosing
scope via closures, following the rules and guards in the system prompt.

## Input

You will receive:

- Code diff showing changes
- Surrounding context (module-level declarations in the same hunk, if available)

## Task

1. Apply the Pre-execution Gate. If it fails, output `NO_REVIEW: closure-scope-retention — <理由>` and stop.
2. Analyze the diff for closure-based scope retention:
   - Long-lived objects (module-level singletons, caches, registered listeners, stored return values) built from closures
   - Large enclosing-scope data (file contents, big arrays, parsed document sets, temporary buffers) kept reachable by those closures
   - Which fields are actually consumed vs. what is retained
3. For each finding:
   - Verify the flagged `file:line` is in the diff (not speculative)
   - Check against the False-positive guards (immediate reduce-and-release, short-lived objects, small data)
   - Assess confidence

## Output Format

For each retention finding:

```text
**Finding:** [long-lived object + the large scope variables its closures capture]
**Evidence:** [file:line and the captured variable names]
**Impact:** [memory kept alive for the object's lifetime]
**Fix:** [copy only the needed fields — e.g. build a compact Map/class fields at construction time]
**Severity:** [info/minor/major]
**Confidence:** [high/medium/low]
```

If there is no qualifying finding, output `NO_ISSUES`.

### Important Notes

- **DO NOT** flag functions that reduce large data into a compact structure and let the originals go unreachable on return
- **DO NOT** flag short-lived objects or clearly small data
- **DO NOT** flag correctness bugs or security issues (out of scope)
- **DO** name the exact captured variables and the fields actually read
- **DO** lower Confidence when data size or object lifetime is uncertain

## 評価指標（Evaluation）

- 合格基準: 指摘が差分の closure 保持に紐づき、掴まれる変数・寿命の根拠と縮約案が説明されている
- 不合格基準: 差分と無関係な指摘、即時縮約パターンの誤検出、サイズ・寿命の根拠なき断定
