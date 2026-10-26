# Invisible Unicode Injection Scan - User Prompt

Review the provided code diff and identify invisible or deceptive Unicode characters newly
added to source code, following the rules and guards in the system prompt.

## Input

You will receive:

- A code diff showing added lines
- The file paths of the changed files

## Task

1. Apply the Pre-execution Gate. If it fails, output `NO_REVIEW: invisible-unicode-injection — <理由>` and stop.
2. Scan the added lines for dangerous Unicode (limited to the enumerated code-point set):
   - Tag characters outside emoji tag sequences (U+E0000-E007F)
   - Bidirectional controls and marks (U+202A-202E / U+2066-2069 / U+061C / U+200E / U+200F)
   - Variation selectors on a non-emoji base or in chained runs (U+FE00-FE0F / U+E0100-E01EF)
   - Zero-width / invisible format characters (U+200B / U+2060 / U+00AD / U+180E / U+034F / U+2061-2064 / U+115F / U+1160 / U+3164 / U+2800 / U+FFF9-FFFB / non-leading U+FEFF)
   - Bare zero-width joiners outside emoji sequences (U+200C / U+200D)
   - Confusable whitespace outside string literals and comments (U+00A0 etc.)
3. For each finding:
   - Verify the flagged `file:line` is an added line in the diff (not speculative)
   - Check against the False-positive guards (emoji sequence, single presentation selector, keycap, in-string whitespace, leading BOM)
   - Assess confidence

## Output Format

For each finding:

```text
**Finding:** [category + where the invisible character was added]
**Evidence:** [file:line and the code point — do NOT reprint the raw bytes]
**Impact:** [display/execution mismatch, code hiding, or token splitting]
**Fix:** [remove the character; keep decorative use inside string literals; add a CI guard]
**Severity:** [critical/major/minor]
**Confidence:** [high/medium/low]
```

If there is no qualifying finding, output `NO_ISSUES`.

### Important Notes

- **DO NOT** flag legitimate emoji ZWJ sequences, a single presentation selector after a pictographic base, or keycap sequences
- **DO NOT** flag NBSP or other spaces inside string literals (internationalized text)
- **DO NOT** flag a leading BOM at column 0, or documentation / test files
- **DO** name the exact category and code point, and anchor to a real added line
- **DO** lower Confidence when it is unclear whether the character is decorative or malicious

## 評価指標（Evaluation）

- 合格基準: 指摘が差分の追加行に紐づき、カテゴリ・code point・攻撃手口が示され、raw 文字を再掲していない
- 不合格基準: 正当な絵文字・国際化テキストへの誤検出、差分外・ドキュメント・テストへの指摘、raw 文字の再掲
