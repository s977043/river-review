# Expected Output: change() Dropping Modifiers

**Finding:** `->change()` re-declares only the base type and silently drops the column's existing modifiers

**Evidence:** `database/migrations/2026_06_11_000000_alter_votes.php` — `$table->integer('votes')->change()` where the original had `unsigned()->default(1)->comment(...)`

**Impact:** Laravel requires every modifier to be re-listed on `change()`; the omitted `unsigned`, `default(1)`, and `comment` are dropped, altering column semantics and potentially failing inserts that relied on the default.

**Fix:** Re-list all modifiers to keep:

```php
$table->integer('votes')->unsigned()->default(1)->comment('vote count')->change();
```

**Severity:** major
**Confidence:** high
