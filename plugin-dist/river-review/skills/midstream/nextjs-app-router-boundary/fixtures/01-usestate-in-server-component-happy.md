# Fixture 01 — `useState` in Server Component (Happy Path)

## Description

A file under `app/` has no `'use client'` directive but adds `useState`.
The skill should flag the boundary violation and suggest adding `'use client'`
or extracting the state to a child client component.

## Input Diff

```diff
diff --git a/app/dashboard/Filter.tsx b/app/dashboard/Filter.tsx
@@ -1,5 +1,7 @@
 import { Card } from '@/components/Card';
+import { useState } from 'react';

 export function Filter() {
+  const [query, setQuery] = useState('');
   return <Card><input /></Card>;
 }
```

## Expected Behavior

- `Finding:` boundary violation referencing `useState`.
- `BoundaryViolation: client-API in server component`.
- Suggestion proposes adding `'use client'` at top of file.
- `Severity: major`.
- `Confidence: high`.
