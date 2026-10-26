# Expected Output: Unrestored Spy and Un-awaited Rejects

**Finding:** `vi.spyOn` is used without any `afterEach` restore (and no `restoreMocks` config visible), and `resolves` / `rejects` assertions are not awaited

**Evidence:** `src/user.test.ts` — `vi.spyOn(api, 'fetchUser')` with no `afterEach(() => vi.restoreAllMocks())`; `expect(loadUser(1)).resolves...` and `expect(saveUser(null)).rejects...` are not `await`ed

**Impact:** The spy leaks into subsequent tests, producing order-dependent flaky results; un-awaited `resolves`/`rejects` assertions resolve after the test ends and pass without ever being evaluated.

**Fix:** Restore mocks per test and await the async assertions:

```ts
afterEach(() => {
  vi.restoreAllMocks();
});

it('reads from api', async () => {
  vi.spyOn(api, 'fetchUser').mockResolvedValue({ id: 1 });
  await expect(loadUser(1)).resolves.toEqual({ id: 1 });
});

it('rejects on invalid input', async () => {
  await expect(saveUser(null)).rejects.toThrow('invalid');
});
```

**Severity:** major
**Confidence:** high
