# Expected Output: Over-permissive `allow read, write: if true`

**Finding:** Firestore rule grants unconditional read and write (`if true`) with no auth or ownership check, so any client can overwrite any user's document

**Evidence:** `firestore.rules` — `match /users/{userId}` で `allow read, write: if true;`

**Impact:** 認証なしで任意ユーザーのドキュメントを読み書きできる。なりすまし・データ改ざん・情報漏洩に直結する。

**Fix:** Require authentication and ownership:

```js
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if request.auth != null && request.auth.uid == userId;
}
```

**Severity:** critical
**Confidence:** high
