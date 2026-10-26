# Expected Output: Over-permissive `USING (true)` Policy

**Finding:** `for all` policy uses `using (true)` / `with check (true)` with no owner condition, so any authenticated user can read, update, and delete every row

**Evidence:** `supabase/migrations/20260611_documents.sql` — `create policy "all access" ... using (true) with check (true)`

**Impact:** 所有者に関係なく全行へのアクセス・改ざん・削除が可能。RLS は有効でも policy が無効化と同等になり、なりすましとデータ破壊に直結する。

**Fix:** Restrict to the row owner:

```sql
create policy "owner access" on public.documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Severity:** critical
**Confidence:** high
