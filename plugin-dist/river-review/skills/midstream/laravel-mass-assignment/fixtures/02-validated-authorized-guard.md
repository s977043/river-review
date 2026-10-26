# Test Case: Validated Input with Authorization (False Positive Guard)

## Description

Verifies the skill does NOT flag an update that uses a FormRequest (validated input + `authorize()`).

## Input Diff

```diff
diff --git a/app/Http/Controllers/UserController.php b/app/Http/Controllers/UserController.php
index 1234567..89abcde 100644
--- a/app/Http/Controllers/UserController.php
+++ b/app/Http/Controllers/UserController.php
@@ -1,0 +1,6 @@
+    // UpdateUserRequest::authorize() returns $this->user()->can('update', $this->route('user'))
+    public function update(UpdateUserRequest $request, User $user)
+    {
+        $user->update($request->validated());
+        return redirect()->route('users.show', $user);
+    }
```

## Expected Behavior

The skill should:

1. NOT flag the update — `$request->validated()` allow-lists fields and the FormRequest's `authorize()` handles authorization
2. Produce no findings
