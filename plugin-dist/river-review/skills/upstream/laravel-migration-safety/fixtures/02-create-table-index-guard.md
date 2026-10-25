# Test Case: Index on a New Table (False Positive Guard)

## Description

Verifies the skill does NOT flag an index added inside `Schema::create` — a new table has no rows to lock.

## Input Diff

```diff
diff --git a/database/migrations/2026_06_11_000001_create_tags.php b/database/migrations/2026_06_11_000001_create_tags.php
index 1234567..89abcde 100644
--- a/database/migrations/2026_06_11_000001_create_tags.php
+++ b/database/migrations/2026_06_11_000001_create_tags.php
@@ -1,0 +1,9 @@
+    public function up(): void
+    {
+        Schema::create('tags', function (Blueprint $table) {
+            $table->id();
+            $table->string('slug');
+            $table->index('slug');
+        });
+    }
+    public function down(): void { Schema::dropIfExists('tags'); }
```

## Expected Behavior

The skill should:

1. NOT flag `$table->index('slug')` — it is inside `Schema::create`, so there is no locking concern (no existing rows)
2. Recognize `down()` correctly reverses `up()`
3. Produce no findings
