# Test Case: External Boundary Code (False Positive Guard)

## Description

This test verifies that the skill does NOT demand branded types in boundary code that maps an external API response, and stays silent for a context-free single-parameter utility.

## Input Diff

```diff
diff --git a/src/external/github-client.ts b/src/external/github-client.ts
index 1234567..89abcde 100644
--- a/src/external/github-client.ts
+++ b/src/external/github-client.ts
@@ -1,0 +1,10 @@
+// Maps the raw GitHub REST response; field shapes are dictated by the API.
+export interface GitHubIssueResponse {
+  id: number;
+  node_id: string;
+  title: string;
+}
+
+export function slugify(input: string): string {
+  return input.toLowerCase().replace(/\s+/g, '-');
+}
```

## Expected Behavior

The skill should:

1. NOT flag `GitHubIssueResponse` fields — external API boundary types follow the upstream contract (at most a note about where to convert into domain types)
2. NOT flag `slugify` — a single-parameter generic utility with no domain context and no transposition risk
3. Produce no findings (or boundary notes only, never `major`)
