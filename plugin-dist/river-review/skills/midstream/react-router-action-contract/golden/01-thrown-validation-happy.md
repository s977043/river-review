# Expected Output: Validation Error Thrown to ErrorBoundary

**Finding:** Expected validation failure is `throw`n (hits the ErrorBoundary) instead of returned as data with a 4xx status; success path does not `redirect()`

**Evidence:** `app/routes/signup.tsx` — `throw new Response('Invalid email', { status: 400 })` and `return { ok: true }`

**Impact:** Throwing breaks inline form-error display and the automatic revalidation control; returning `{ ok: true }` without a redirect leaves a resubmission hazard.

**Fix:** Return validation errors as data and redirect on success:

```tsx
if (!email.includes('@')) {
  return data({ errors: { email: 'Invalid email' } }, { status: 400 });
}
await createUser(email);
return redirect('/welcome');
```

**Severity:** major
**Confidence:** high
