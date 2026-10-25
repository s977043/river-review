# Fixture 02 — File has `'use client'` (False-Positive Guard)

## Description

A client component declares `'use client'` at the top and uses `useState`.
This is correct App Router usage — the skill must NOT flag it.

## Input Diff

```diff
diff --git a/app/dashboard/SearchBox.tsx b/app/dashboard/SearchBox.tsx
@@ -1,5 +1,8 @@
 'use client';

+import { useState } from 'react';
+
 export function SearchBox() {
+  const [q, setQ] = useState('');
   return <input value={q} onChange={(e) => setQ(e.target.value)} />;
 }
```

## Expected Behavior

- No finding. `'use client'` directive guard applies.
- Output references the `'use client'` guard explicitly.
