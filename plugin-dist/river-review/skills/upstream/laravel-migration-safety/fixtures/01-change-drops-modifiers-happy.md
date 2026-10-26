# Test Case: change() Dropping Modifiers (Happy Path)

## Description

Verifies the skill flags a `change()` that omits modifiers present on the original column, which silently drops them.

## Input Diff

```diff
diff --git a/database/migrations/2026_06_11_000000_alter_votes.php b/database/migrations/2026_06_11_000000_alter_votes.php
index 1234567..89abcde 100644
--- a/database/migrations/2026_06_11_000000_alter_votes.php
+++ b/database/migrations/2026_06_11_000000_alter_votes.php
@@ -1,0 +1,7 @@
+    public function up(): void
+    {
+        Schema::table('posts', function (Blueprint $table) {
+            // original: $table->integer('votes')->unsigned()->default(1)->comment('vote count');
+            $table->integer('votes')->change();
+        });
+    }
```

## Expected Behavior

The skill should:

1. Flag that `->change()` re-declares only the base type, silently dropping `unsigned`, `default(1)`, and `comment`
2. Recommend re-listing all modifiers to keep
3. Reference the modifying-columns convention
