# Expected Output: Server Action Mutation Without Auth or Validation

**Finding:** `'use server'` の `deletePost` が認証・認可・入力検証なしに DB の update/delete を実行し、クライアント由来の `userId` を所有者として信頼している（公開エンドポイントとして誰でも任意の投稿を改ざん・削除できる）

**Evidence:** `app/posts/actions.ts` — `auth()` / `requireUser()` 等の呼び出しがなく、`formData.get('postId')` / `formData.get('userId')` を未検証のまま `db.post.update` / `db.post.delete` に渡している

**Impact:** 認証なしに誰でも呼べるため、任意ユーザーが任意の投稿を削除できる。さらにクライアントが渡す `userId` をそのまま `ownerId` に書き込むため、所有者のなりすまし（権限昇格）が可能。

**Fix:** mutation 前に認証・所有者確認・入力検証を行い、所有者はセッションから導出する:

```ts
'use server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({ postId: z.string().uuid() });

export async function deletePost(formData: FormData) {
  const user = await requireUser();
  const { postId } = schema.parse({ postId: formData.get('postId') });
  const post = await db.post.findUniqueOrThrow({ where: { id: postId } });
  if (post.ownerId !== user.id) throw new Error('Forbidden');
  await db.post.delete({ where: { id: postId } });
  return { ok: true };
}
```

**Severity:** critical
**Confidence:** high
