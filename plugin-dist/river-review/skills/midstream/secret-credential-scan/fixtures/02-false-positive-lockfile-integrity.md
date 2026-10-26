# Test Case: Lockfile Integrity Hash (Should NOT Trigger Finding)

`package-lock.json` の `integrity: sha512-...` 行は高エントロピー文字列だが、SRI（Subresource Integrity）ダイジェストであり秘密ではない。SKILL.md False-positive guards「ハッシュ・UUID への難癖をしない」に該当し、誤検出してはならない。

加えて、この種のファイルは secret-scan の frontmatter `exclude` グロブ（`**/package-lock.json`, `**/*.lock` 等）により midstream skill-dispatcher の実行経路では本来 per-file 呼び出し対象から除外される。したがって本来このスキルは当該ファイルに発火しないが、万一発火しても `NO_ISSUES` を返すべき、という二重の安全性を示す。

## Input Artifacts

### diff

```diff
diff --git a/package-lock.json b/package-lock.json
index 4444444..5555555 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -120,8 +120,8 @@
     "node_modules/minimatch": {
       "version": "9.0.5",
       "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.5.tgz",
-      "integrity": "sha512-G6T0ZX48xgozx7587koeX9Ys2NYy6Gmv//P89sEte9V9whJ8fJVk3J8Pw5MnXHM02Zf6KZh3rEeUUbHaUWmOg==",
+      "integrity": "sha512-OqeFlT4N7DdyCT9oFR1Fl4q6pV4M3k2eF8YzpSv6cF3VqB1cqYQ3jN5pZr2sT8wK0uX1vY4mC7nB9aD3eW6fU==",
       "dependencies": {
         "brace-expansion": "^2.0.1"
       }
     },
@@ -200,0 +208,5 @@
+    "node_modules/yaml": {
+      "version": "2.6.0",
+      "resolved": "https://registry.npmjs.org/yaml/-/yaml-2.6.0.tgz",
+      "integrity": "sha512-a6ae//JvKDEra2kdi1qzCyrJW/WZCgFi8ydDV+eXExl95t+5R+ijnqHJbz9tmMh8FUjx3iv2fCQ4dclAQlO2UQ==",
+    },
```

## Expected Behavior

The skill should NOT flag any line:

- `integrity: sha512-...` は npm の SRI ダイジェスト。高エントロピーだが秘密ではない（公開レジストリの内容ハッシュ）→ False-positive guards 該当
- `resolved` の URL は公開 registry URL → 秘密ではない
- そもそも `package-lock.json` は secret-scan の `exclude` グロブにより midstream 実行経路では除外対象

期待出力: `NO_ISSUES`（または exclude により未発火）。
