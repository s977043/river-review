---
id: skill-lifecycle-en
---

# Skill Lifecycle

This document outlines the operational guidelines for adoption, training, and evaluation to ensure skills are not simply "created and forgotten."

## 1. Adoption

- Purpose: Clarify which review responsibilities the skill will replace or supplement.
- Target phase: Decide whether it belongs in upstream, midstream, or downstream.
- Responsibility boundary: Define which decisions the skill handles and where to hand off to humans.
- Evaluation criteria: Establish pass and fail criteria upfront.

### Additional Checklist

- Verify no overlap with existing skills.
- Determine whether the existing rubric suffices or new items are needed.
- Confirm alignment with the existing schema.

## 2. Training

- Prepare examples and golden cases.
- Cover three categories: typical cases, failure cases, and edge cases.
- Verify that the skill's output format fits the review workflow.

## 3. Evaluation

- Score against the rubric and determine pass/fail.
- Run automated evaluation in CI to detect regressions.
- If the score falls below the threshold, fix immediately or revert to human review.

### Evaluation Checkpoints

- Is the balance between false positives and missed detections maintained?
- Are findings specific enough to lead to actionable fixes?
- Is the impact explanation neither too brief nor too verbose?

### Evaluate marginal contribution

A skill being selected or executed does not prove that it improves outcomes.

```text
same case / runtime / model / effort
  ├─ WITHOUT skill
  └─ WITH skill
       ↓
paired comparison
```

For a new skill, compare WITHOUT versus WITH. For a material update to an existing skill, compare the previous version as the baseline against the changed version as the candidate.

At minimum, compare detection results, false positives, and critical regressions. When available, also compare time, tokens, cost, and human intervention.

If the candidate did not activate, paired cases are missing, or the sample is insufficient, report `INCONCLUSIVE`. Do not infer "no effect" from missing evidence.

## 4. Iterative Operation

- Retain change history and evaluation results to support improvement decisions.
- When a declining trend is observed, retrain or redesign the skill.
- Re-evaluate marginal contribution after a major model or runtime update.
- Re-evaluate after material changes to responsibility, prompt, or routing.

A stronger base model can absorb capability that previously required a skill. A model upgrade alone is not permission to remove the skill. Treat removal or simplification as a candidate only after WITH/WITHOUT evidence shows that quality and safety are preserved.

## 5. Guardrails

- Define explicit signals for when the skill is uncertain.
- Never compromise the assumption that humans make the final decision.
- Keep activation separate from effectiveness: `Usage != Effectiveness`.
- Do not treat a model or runtime update as permission to remove skills or weaken safety boundaries.
