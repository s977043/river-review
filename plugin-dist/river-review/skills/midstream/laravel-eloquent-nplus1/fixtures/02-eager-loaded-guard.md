# Test Case: Already Eager-Loaded Relation (False Positive Guard)

## Description

Verifies the skill does NOT flag a relation accessed in a loop when it was eager-loaded in the same change.

## Input Diff

```diff
diff --git a/app/Http/Controllers/BookController.php b/app/Http/Controllers/BookController.php
index 1234567..89abcde 100644
--- a/app/Http/Controllers/BookController.php
+++ b/app/Http/Controllers/BookController.php
@@ -1,0 +1,8 @@
+    public function index()
+    {
+        $books = Book::with('author')->get();
+        foreach ($books as $book) {
+            echo $book->author->name; // already eager-loaded
+        }
+        return view('books.index', compact('books'));
+    }
```

## Expected Behavior

The skill should:

1. NOT flag `$book->author->name` — `with('author')` eager-loads the relation, so there is no N+1
2. Produce no findings
