# Expected Output: Mass Assignment via request->all()

**Finding:** `$user->update($request->all())` mass-assigns unfiltered input, and the action has no authorization check

**Evidence:** `app/Http/Controllers/UserController.php` — `update(Request $request, User $user)` calling `$user->update($request->all())`

**Impact:** A crafted request containing `is_admin=1` (or any non-fillable-but-fillable field) can escalate privileges or tamper with data; without an authorization check any authenticated user can update any user.

**Fix:** Allow-list fields and authorize the action:

```php
public function update(UpdateUserRequest $request, User $user)
{
    // UpdateUserRequest::authorize() -> $this->user()->can('update', $user)
    $user->update($request->validated());
    return redirect()->route('users.show', $user);
}
```

**Severity:** major
**Confidence:** high
