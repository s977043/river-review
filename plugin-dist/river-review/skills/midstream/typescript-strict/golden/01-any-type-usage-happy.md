# Expected Output: Unsafe `any` Type Usage

**Finding:** Unsafe `any` type annotations bypass TypeScript type checking

**Evidence:** Lines 8-9: `const result: any = data;` and `const user: any = result.user;`

**Impact:** Using `any` disables TypeScript's type checking for these variables. If `data.user` has a different shape than expected, the error will only be caught at runtime rather than compile time.

**Fix:** Use `unknown` with a type guard or define an explicit interface:

```typescript
interface ParsedData {
  user: { id: string; name: string };
}
const parsed = data as ParsedData;
return { id: parsed.user.id, name: parsed.user.name };
```

**Severity:** major

**Confidence:** high
