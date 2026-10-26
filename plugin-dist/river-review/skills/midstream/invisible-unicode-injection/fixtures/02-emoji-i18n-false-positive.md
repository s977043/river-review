# Test Case: Legitimate Emoji / i18n Text (False Positive Guard)

This case must NOT trigger any `invisible-unicode-injection` finding. The added lines in
`src/ui/labels.ts` (see `02-emoji-i18n-false-positive.diff`) contain only legitimate
Unicode:

- **Emoji ZWJ sequence**: family emoji joined with `U+200D` ZERO WIDTH JOINER — a valid
  emoji joiner, not a bare token splitter.
- **Emoji presentation selector**: a heart followed by `U+FE0F` (VS16) to force emoji
  presentation — a single selector on a pictographic base.
- **Keycap sequence**: the digit `1` followed by `U+FE0F` and `U+20E3` (combining
  enclosing keycap).
- **NBSP inside a string literal**: `U+00A0` used inside French typography text; a
  confusable space is only suspicious outside string literals.

## Expected Behavior

The skill should return `NO_ISSUES` (or `NO_REVIEW` from the pre-execution gate) for this
diff. Each construct is covered by a False-positive guard (emoji adjacency, single
selector after a pictographic base, keycap, in-string whitespace). The canary tests pin
this so a future change to the detector cannot silently start flagging legitimate emoji
or internationalized strings.
