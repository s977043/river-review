# Test Case: No Secret Candidate (Should Return NO_REVIEW)

差分の追加行に機密候補（高エントロピー文字列・秘密鍵名・接頭辞・個人パス・.env 実値）が一切含まれないケース。SKILL.md の Pre-execution Gate「追加行に機密情報の候補が含まれている」を満たさず、`NO_REVIEW` を返すべき。

## Input Artifacts

### diff

```diff
diff --git a/src/utils/format.ts b/src/utils/format.ts
index 6666666..7777777 100644
--- a/src/utils/format.ts
+++ b/src/utils/format.ts
@@ -1,7 +1,11 @@
 export function toTitleCase(input: string): string {
   return input
     .toLowerCase()
     .split(' ')
     .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
     .join(' ');
 }
+
+export function truncate(input: string, max = 80): string {
+  return input.length > max ? input.slice(0, max) + '…' : input;
+}
diff --git a/.env.example b/.env.example
index 8888888..9999999 100644
--- a/.env.example
+++ b/.env.example
@@ -1,2 +1,3 @@
 DATABASE_URL=postgres://user:your-password@localhost:5432/dev
 API_KEY=your-api-key-here
+SENTRY_DSN=https://<public-key>@o0.ingest.sentry.io/<project-id>
```

## Expected Behavior

`diff` の追加行は純粋なロジック追加（`truncate`）と `.env.example` のプレースホルダ行（`<public-key>` / `<project-id>` / `your-...`）のみ。実値の機密は無く、Pre-execution Gate が不成立。

期待出力:

```text
NO_REVIEW: secret-credential-scan — 機密情報の候補が差分に検出されない
```
