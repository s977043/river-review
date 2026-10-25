Finding: `Button` primitive is being reimplemented from scratch using a raw `<button>` element with custom styling, instead of reusing an existing design system Button component.
Evidence: src/features/checkout/SubmitButton.tsx:12 — `<button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50" onClick={onClick} disabled={disabled}>`
Suggestion: Import and use `<Button>` from `src/components/ui/Button` (or equivalent design system path) instead of constructing a raw `<button>` with manual Tailwind styling. Pass `disabled` and click handler as props.
Severity: major
Confidence: medium
