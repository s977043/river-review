# Expected Output: Route Data Fetched in useEffect

**Finding:** Route-tied initial data is fetched in `useEffect` instead of a `loader`

**Evidence:** `app/routes/dashboard.tsx` — `useEffect(() => { fetch('/api/stats')... }, [])`

**Impact:** Client-only fetch on mount causes a loading flash (no SSR), risks double-fetch / race conditions, and a hydration mismatch. The data is determined by the route, so it belongs in a loader.

**Fix:** Move it to a `loader`:

```tsx
export async function loader() {
  return { stats: await getStats() };
}
export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return <StatsView stats={loaderData.stats} />;
}
```

**Severity:** major
**Confidence:** high
