Finding: `app/dashboard/Filter.tsx` uses `useState` without a `'use client'` directive, making it an invalid Server Component.

Evidence: Line `+import { useState } from 'react';` and `+  const [query, setQuery] = useState('');` are added to a file under `app/` that has no `'use client'` directive at the top. React hooks are client-only APIs and cannot run in a Server Component.

BoundaryViolation: client-API in server component

Suggestion: Add `'use client';` as the very first line of `app/dashboard/Filter.tsx`. Alternatively, extract the stateful logic into a new child component (e.g. `FilterClient.tsx`) that begins with `'use client';`, and render it from the existing `Filter` server component.

Severity: major

Confidence: high
