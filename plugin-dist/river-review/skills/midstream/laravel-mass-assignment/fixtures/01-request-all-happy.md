# Test Case: Mass Assignment via request->all() (Happy Path)

## Description

Verifies the skill flags `update($request->all())` on a mutating action with no field allow-listing and no authorization.

## Input Diff

```diff
diff --git a/app/Http/Controllers/UserController.php b/app/Http/Controllers/UserController.php
index 1234567..89abcde 100644
--- a/app/Http/Controllers/UserController.php
+++ b/app/Http/Controllers/UserController.php
@@ -1,0 +1,5 @@
+    public function update(Request $request, User $user)
+    {
+        $user->update($request->all());
+        return redirect()->route('users.show', $user);
+    }
```

## Expected Behavior

The skill should:

1. Flag `$user->update($request->all())` as mass assignment (an `is_admin` field in the request could escalate privileges)
2. Flag the missing authorization on this update action
3. Recommend `$request->validated()` / `safe()->only([...])` and a Policy / Gate check
