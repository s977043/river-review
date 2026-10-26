# Test Case: N+1 Query in a Loop (Happy Path)

## Description

Verifies the skill flags a relation accessed inside a loop without eager loading.

## Input Diff

```diff
diff --git a/app/Http/Controllers/BookController.php b/app/Http/Controllers/BookController.php
index 1234567..89abcde 100644
--- a/app/Http/Controllers/BookController.php
+++ b/app/Http/Controllers/BookController.php
@@ -1,0 +1,8 @@
+    public function index()
+    {
+        $books = Book::all();
+        foreach ($books as $book) {
+            echo $book->author->name; // separate query per book
+        }
+        return view('books.index', compact('books'));
+    }
```

## Expected Behavior

The skill should:

1. Flag `$book->author->name` inside the loop as N+1 (one query per book)
2. Recommend `Book::with('author')->get()` (eager loading)
3. Reference the eager-loading convention
