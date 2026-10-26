# Test Case: GlassWorm / Trojan Source Payload (Happy Path)

This case should trigger `invisible-unicode-injection` findings. The added lines in
`src/plugins/loader.ts` carry three real attack primitives (see the sibling
`01-glassworm-payload-happy.diff` for the exact bytes):

- **Bidi control**: `U+202E` (RIGHT-TO-LEFT OVERRIDE) makes the visible source order
  differ from the executed order (Trojan Source / CVE-2021-42574).
- **Variation selector on a non-emoji base**: `U+FE0F` attached to an identifier, the
  GlassWorm technique for encoding an invisible payload.
- **Zero-width space**: `U+200B` splits a token so `admin` reads as a different
  identifier than it executes as.

The raw bytes live only in the `.diff` fixture; they are described here as code points
so this document stays pure ASCII.

## Expected Behavior

The skill should flag each of the three added lines with its category (bidi control,
invisible/zero-width, variation selector), point to `src/plugins/loader.ts:<line>`, and
recommend removing the characters. It must not reprint the raw invisible bytes in its
output. Because the payloads are deterministic, the primary guarantee is the
`findInvisibleUnicode` detector plus the canary tests in
`tests/heuristic-review.test.mjs`; the LLM review adds contextual judgement only.
