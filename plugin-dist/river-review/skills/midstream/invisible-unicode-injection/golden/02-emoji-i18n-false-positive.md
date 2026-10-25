# Golden: Legitimate Emoji / i18n Text

The review should produce no findings for this diff.

```text
NO_ISSUES
```

Or, when the pre-execution gate short-circuits:

```text
NO_REVIEW: invisible-unicode-injection — 不可視・危険な Unicode 文字が差分に検出されない
```

Key assertion: zero findings. Emoji ZWJ sequences, a single presentation selector on a
pictographic base, keycap sequences, and NBSP inside a string literal are all legitimate
and must be suppressed by the False-positive guards.
