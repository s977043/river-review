# Test Case: Public Master Table SELECT + anon key (False Positive Guard)

## Description

Verifies the skill does NOT flag a deliberately public `USING (true)` SELECT policy on a read-only master table (justified with a comment) and does NOT flag the client-side `anon` key — both are officially sanctioned, distinct from an all-access policy or a `service_role` key exposure.

## Input Diff

```diff
diff --git a/supabase/migrations/20260611_countries.sql b/supabase/migrations/20260611_countries.sql
index 1234567..89abcde 100644
--- a/supabase/migrations/20260611_countries.sql
+++ b/supabase/migrations/20260611_countries.sql
@@ -1,0 +1,9 @@
+create table public.countries (
+  code text primary key,
+  name text not null
+);
+alter table public.countries enable row level security;
+-- 公開マスタデータ: 全員参照可が要件上正当（書き込みは管理者のみ）
+create policy "public read" on public.countries
+  for select
+  using (true);
diff --git a/src/supabaseClient.ts b/src/supabaseClient.ts
index 1234567..89abcde 100644
--- a/src/supabaseClient.ts
+++ b/src/supabaseClient.ts
@@ -1,0 +1,3 @@
+// anon key のクライアント使用は公式仕様（service_role とは異なる）
+const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
+export default supabase;
```

## Expected Behavior

The skill should:

1. NOT flag the `using (true)` SELECT policy — intentional and comment-justified public read on a master table
2. NOT flag `SUPABASE_ANON_KEY` — client use of the anon key is the official Supabase spec, not a `service_role` leak
3. Recognize RLS is enabled and the policy is SELECT-only
4. Produce no findings
