# Expected Output: Non-Null Assertion on API Response

**Finding:** Unsafe non-null assertion on external API response

**Evidence:** Line 11: `return data.profile!.name;`

**Impact:** If the API returns a response where `profile` is undefined or null, this code will throw a runtime TypeError. External API responses are inherently unpredictable and should never be assumed to be non-null.

**Fix:** Use optional chaining with a fallback or an explicit null guard:

```typescript
return data.profile?.name ?? 'Anonymous';
```

**Severity:** major

**Confidence:** high
