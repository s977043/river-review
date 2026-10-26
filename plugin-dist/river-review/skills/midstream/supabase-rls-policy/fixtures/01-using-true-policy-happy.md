# Test Case: Over-permissive `USING (true)` Policy (Happy Path)

## Description

Verifies the skill flags a policy that grants all rows to all roles via `USING (true)` with no owner condition, letting any authenticated user read and modify every row.

## Input Diff

```diff
diff --git a/supabase/migrations/20260611_documents.sql b/supabase/migrations/20260611_documents.sql
index 1234567..89abcde 100644
--- a/supabase/migrations/20260611_documents.sql
+++ b/supabase/migrations/20260611_documents.sql
@@ -1,0 +1,10 @@
+create table public.documents (
+  id uuid primary key default gen_random_uuid(),
+  user_id uuid references auth.users,
+  body text
+);
+alter table public.documents enable row level security;
+create policy "all access" on public.documents
+  for all
+  using (true)
+  with check (true);
```

## Expected Behavior

The skill should:

1. Flag the `using (true)` / `with check (true)` policy as granting all rows with no owner condition
2. Note that any user can read, update, and delete every row regardless of ownership
3. Reference the row-level-security convention (require `auth.uid() = user_id`)
