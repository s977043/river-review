# Fixture 02 — Hallucinated Finding (False-Positive Guard)

## Description

A reviewer claims a vulnerability on `src/auth/jwt.ts:42`, but no such file
or line exists in the diff (it's pure fabrication). The synthesis layer must
mark this as `dismissed-hallucination`, NOT propagate it to the merge
recommendation.

## Diff

```diff
diff --git a/src/api/users.ts b/src/api/users.ts
@@ -10,3 +10,3 @@ export async function getUserById(req: Request, res: Response) {
   const { id } = req.params;
-  return db.findById(id);
+  return await db.findById(id);
 }
```

## review-self

> Added `await` to ensure the promise resolves before return.

## review-external

> Critical: JWT validation in `src/auth/jwt.ts:42` is missing signature check. Attacker can forge tokens.

## findings-pool

```json
[]
```

## Expected Behavior

- The JWT finding from review-external is **dismissed** with `ValidatedStatus: dismissed-hallucination` — `src/auth/jwt.ts` is not in the diff and not referenced.
- The dismissed finding appears in the **Dismissed Findings** section, not in Critical / Major / Minor.
- `Merge Recommendation: merge-ready` (only the benign `await` change is in scope).
- No critical / major in the confirmed sections.
