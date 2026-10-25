# Expected Output: N+1 Query in a Loop

**Finding:** `author` relation accessed inside a `foreach` without eager loading (N+1)

**Evidence:** `app/Http/Controllers/BookController.php` — `Book::all()` then `$book->author->name` in the loop

**Impact:** One extra query per book (25 books → 26 queries). Scales linearly with row count and degrades the endpoint under load.

**Fix:** Eager-load the relation:

```php
$books = Book::with('author')->get();
```

**Severity:** major
**Confidence:** high
