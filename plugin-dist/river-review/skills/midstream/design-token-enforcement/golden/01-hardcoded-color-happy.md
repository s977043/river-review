Finding: Hardcoded hex color `#3B82F6` used directly in inline style prop instead of a design token or CSS custom property.
Evidence: src/components/PrimaryButton.tsx:11 — `style={{ color: '#3B82F6', padding: '16px', fontSize: '14px' }}`
TokenSuggestion: Replace with Tailwind utility class `text-blue-500`, or CSS custom property `var(--color-primary)` if a semantic token exists in the project.
Severity: minor
Confidence: high

---

Finding: Hardcoded pixel padding `'16px'` used in inline style prop instead of a spacing token.
Evidence: src/components/PrimaryButton.tsx:11 — `style={{ color: '#3B82F6', padding: '16px', fontSize: '14px' }}`
TokenSuggestion: Replace with Tailwind utility class `p-4` (which maps to 16px in the default Tailwind scale).
Severity: minor
Confidence: high

---

Finding: Hardcoded font size `'14px'` used in inline style prop instead of a typography token.
Evidence: src/components/PrimaryButton.tsx:11 — `style={{ color: '#3B82F6', padding: '16px', fontSize: '14px' }}`
TokenSuggestion: Replace with Tailwind utility class `text-sm` (which maps to 14px in the default Tailwind scale), or `var(--font-size-sm)` if a CSS custom property exists in the project.
Severity: minor
Confidence: high
