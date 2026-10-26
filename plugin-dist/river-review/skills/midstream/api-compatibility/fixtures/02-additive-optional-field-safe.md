# Test Case: New Optional Response Field with Test Coverage (False Positive Guard)

## Description

This test verifies that the skill does NOT flag a backward-compatible additive change — a new optional field added to a response DTO — when the change includes corresponding test updates.

## Input Diff

```diff
diff --git a/src/types/user-profile.dto.ts b/src/types/user-profile.dto.ts
index 1234567..abcdef0 100644
--- a/src/types/user-profile.dto.ts
+++ b/src/types/user-profile.dto.ts
@@ -5,4 +5,6 @@ export interface UserProfileDto {
   id: string;
   name: string;
   email: string;
+  avatarUrl?: string;
+  lastLoginAt?: string;
 }
diff --git a/src/api/users.ts b/src/api/users.ts
index 2345678..3456789 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -8,2 +8,6 @@ export async function getUserProfile(userId: string): Promise<UserProfileDto> {
   return response.json();
 }
+
+export function getAvatarUrl(profile: UserProfileDto): string {
+  return profile.avatarUrl ?? '/default-avatar.png';
+}
diff --git a/tests/api/users.test.ts b/tests/api/users.test.ts
index 3456789..4567890 100644
--- a/tests/api/users.test.ts
+++ b/tests/api/users.test.ts
@@ -15,3 +15,16 @@ describe('getUserProfile', () => {
     expect(profile.name).toBe('Alice');
   });
+
+  it('returns default avatar when avatarUrl is absent', async () => {
+    const profile: UserProfileDto = { id: '1', name: 'Alice', email: 'a@example.com' };
+    expect(getAvatarUrl(profile)).toBe('/default-avatar.png');
+  });
+
+  it('returns avatarUrl when present', async () => {
+    const profile: UserProfileDto = {
+      id: '1', name: 'Alice', email: 'a@example.com',
+      avatarUrl: 'https://cdn.example.com/alice.jpg',
+    };
+    expect(getAvatarUrl(profile)).toBe('https://cdn.example.com/alice.jpg');
+  });
 });
```

## Expected Behavior

The skill should:

1. Recognize that `avatarUrl` and `lastLoginAt` are added as optional fields (`?`) — this is a backward-compatible additive change
2. Note that `getAvatarUrl` handles the nullable case with `?? '/default-avatar.png'`
3. Observe that tests cover both the present and absent cases for the new field
4. NOT flag this as a breaking change or a test gap
5. Either return no findings or explicitly confirm the change is backward-compatible and well-tested
