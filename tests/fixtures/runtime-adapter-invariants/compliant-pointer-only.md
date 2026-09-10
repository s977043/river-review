# Review criteria (RA-1 positive fixture)

Positive fixture for RA-1: a host-local file that only points at the SSoT and
defines nothing itself. `detectReviewJudgmentDefinitions` must return `[]`.

Refer to these for the canonical definitions:

- Severity labels and output format: `docs/review/output-format.md`
- Full review policy: `pages/reference/review-policy.md`
- Judgment implementation: `src/lib/finding-factory.mjs`

## Additional instructions specific to this rule

- Do not raise findings about code that is absent from the diff.
- Do not raise generic findings with no reference to the diff.

## Table that is not a severity mapping

| Column | Meaning     |
| ------ | ----------- |
| left   | first cell  |
| right  | second cell |
