---
id: skills-en
---

# Skills: The Heart of River Review

## What is a Skill?

A **skill** is a reusable, version-controlled code review pattern that encapsulates team knowledge into a reproducible agent capability.

Think of skills as:

- **📚 A playbook** - Documented review procedures your team follows
- **🔧 A tool** - Ready-to-use review logic that runs automatically
- **📦 An artifact** - Versioned, tested, shareable asset

Skills transform implicit knowledge ("we usually check for X") into explicit, automated checks that run consistently every time.

## Why Skills Matter

### The Problem: Implicit Knowledge

Traditional code review relies on human memory and experience:

- "Did we check for SQL injection?"
- "Remember to verify error handling"
- "Don't forget the accessibility audit"

This creates:

- **Inconsistency** - Reviews depend on who's available
- **Knowledge loss** - Experts leave, knowledge disappears
- **Scaling issues** - Can't review everything thoroughly

### The Solution: Skills as Assets

Skills make implicit knowledge explicit and executable:

```yaml
# Before: "Remember to check for SQL injection"
# After:  A versioned, testable skill
id: security-basic
name: Baseline Security Checks
version: 0.1.0
```

Benefits:

- **Reproducible** - Same checks every time
- **Improvable** - Test and refine with fixtures
- **Shareable** - Teams can exchange skills
- **Scalable** - Review all PRs without human bottleneck

## Skill Anatomy

Every skill has five core components:

### 1. Metadata (skill.yaml)

Declares what the skill does and when to run it:

```yaml
id: security-basic # Unique identifier
name: Baseline Security Checks # Human-readable name
version: 0.1.0 # Semantic version
description: Detects common vulnerabilities

# When to activate
phase: midstream # SDLC phase
applyTo: # File patterns
  - 'src/**/*.ts'
  - 'src/**/*.js'

# What it needs/produces
inputContext: [diff] # Input requirements
outputKind: [findings] # Output type

# Optimization hints
modelHint: cheap # Cost/accuracy balance
severity: major # Finding importance
```

### 2. Prompts (prompt/)

The review logic in natural language:

**prompt/system.md** - Sets the role:

```markdown
You are a security-focused code reviewer.
Your task is to identify common vulnerabilities.

Focus on:

- SQL injection
- XSS vulnerabilities
- Hardcoded secrets
```

**prompt/user.md** - Applies to specific code:

```markdown
Review this diff for security issues:

{{diff}}

Report findings using this format:
**Finding:** [description]
**Fix:** [suggestion]
**Severity:** [info|minor|major|critical]
```

### 3. Fixtures (fixtures/)

Sample inputs for testing:

**fixtures/01-sql-injection.md:**

```markdown
+const query = `SELECT * FROM users WHERE id = ${userId}`;
+const result = await db.query(query);
```

### 4. Golden Outputs (golden/)

Expected results for each fixture:

**golden/01-sql-injection.md:**

```markdown
**Finding:** SQL injection vulnerability in user lookup
**Fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
**Severity:** major
```

### 5. Evaluation Config (eval/)

How to test the skill:

**eval/promptfoo.yaml:**

```yaml
prompts:
  - file://../prompt/system.md
  - file://../prompt/user.md

tests:
  - vars:
      diff: file://../fixtures/01-sql-injection.md
    assert:
      - type: contains
        value: 'SQL injection'
      - type: similar
        value: file://../golden/01-sql-injection.md
        threshold: 0.7
```

## Skill Lifecycle

See also [Skill Lifecycle](./skill-lifecycle.md) for a deeper walkthrough.

### 1. Create

```bash
# Interactive scaffolding
npm run create:skill

# Manual creation
cp -r scripts/templates/skill skills/my-skill
```

### 2. Implement

Edit the prompts to encode your review knowledge:

```markdown
# prompt/system.md

You are a React code reviewer checking for common pitfalls.

Rules:

1. State updates must be immutable
2. Event handlers should be memoized
3. Lists must have stable keys
```

### 3. Test

Add fixtures and golden outputs:

```bash
# Add test cases
echo "..." > fixtures/01-state-mutation.md
echo "..." > golden/01-state-mutation.md

# Run evaluation
cd skills/my-skill
npx promptfoo eval
```

### 4. Validate

Ensure the skill meets schema requirements:

```bash
npm run validate:skill-yaml
```

### 5. Deploy

Skills automatically activate when:

- Phase matches (upstream/midstream/downstream)
- File patterns match (`applyTo` glob)
- Required context is available (`inputContext`)

No deployment step needed—just commit to repository!

### 6. Improve

Monitor skill effectiveness and iterate. Separate **being invoked** from **being useful**.

`installed / selected / fired` are availability or activation evidence, not effectiveness evidence. Where practical, hold case / runtime / model / effort constant and compare **WITH skill vs WITHOUT skill** (or previous-version baseline vs candidate for a skill update). Use repeated trials for nondeterministic runs rather than concluding from a single success.

At minimum compare detection, false positives, and critical regressions; add time / token / cost / human intervention when available. If the candidate did not activate, paired cases are missing, or the sample is insufficient, report `INCONCLUSIVE` instead of guessing FAIL.

Re-evaluate after major model/runtime changes or material changes to skill responsibility, prompt, or routing. A stronger base model can absorb capability that previously required a skill. For River Review harness evolution, reuse the existing Experiment Manifest / paired-replay machinery rather than creating a parallel evaluator.

Then iterate:

```bash
# Run regression tests
npx promptfoo eval

# Update prompts based on results
# Add more fixtures for edge cases
# Bump version in skill.yaml
```

## Creating Your First Skill

### Step-by-Step Example

Let's create a skill that checks for missing TypeScript null checks:

**1. Scaffold:**

```bash
npm run create:skill

# Enter:
# ID: typescript-nullcheck
# Name: TypeScript Null Safety
# Phase: midstream
# Files: src/**/*.ts
```

**2. Write System Prompt:**

```markdown
# prompt/system.md

You are a TypeScript code reviewer focused on null safety.

Check for:

- Optional chaining (?.) vs explicit null checks
- Nullish coalescing (??) vs || for defaults
- Non-null assertions (!) without validation
```

**3. Write User Prompt:**

```markdown
# prompt/user.md

Review this TypeScript code for null safety issues:

{{diff}}

For each issue, provide:

- **Issue:** What's wrong
- **Line:** Line number
- **Fix:** Corrected code
- **Severity:** minor|major
```

**4. Add Fixtures:**

```markdown
# fixtures/01-unsafe-property-access.md

+function getName(user) {

- return user.profile.name;
  +}
```

**5. Add Golden Output:**

```markdown
# golden/01-unsafe-property-access.md

**Issue:** Unsafe property access without null check
**Line:** 2
**Fix:** Use optional chaining: `return user?.profile?.name;`
**Severity:** major
```

**6. Configure Evaluation:**

```yaml
# eval/promptfoo.yaml
prompts:
  - file://../prompt/system.md
  - file://../prompt/user.md

providers:
  - id: openai:gpt-4o
    config:
      temperature: 0.1

tests:
  - description: Unsafe property access
    vars:
      diff: file://../fixtures/01-unsafe-property-access.md
    assert:
      - type: contains
        value: 'optional chaining'
      - type: llm-rubric
        value: |
          Score 1 if the output correctly identifies the null safety issue
          and suggests optional chaining. Score 0 otherwise.
```

**7. Test:**

```bash
cd skills/midstream/typescript-nullcheck
npx promptfoo eval

# Review results in eval/results.json
```

**8. Commit:**

```bash
git add skills/typescript-nullcheck
git commit -m "feat: add TypeScript null safety skill"
```

Done! The skill now runs automatically on TypeScript PRs.

## Skill Design Principles

### 1. Single Responsibility

❌ **Bad:** "Check code quality, security, and performance"
✅ **Good:** "Detect SQL injection vulnerabilities"

One skill, one concern. Focused skills are:

- Easier to test
- Easier to understand
- Easier to maintain

### 2. Clear Contracts

Explicitly declare what you need and produce:

```yaml
inputContext: [diff, fullFile] # I need both diff and full file
outputKind: [findings, metrics] # I produce findings and metrics
```

This enables:

- Smart skill selection (only run when context available)
- Better error messages (missing context = skip, not fail)
- Future optimizations (parallel execution based on dependencies)

### 3. Testable with Fixtures

Every skill should have:

- At least 2 fixtures (happy path + edge case)
- Corresponding golden outputs
- Assertions that verify behavior

```text
fixtures/
  01-happy-path.md        → golden/01-happy-path.md
  02-edge-case-null.md    → golden/02-edge-case-null.md
  03-false-positive.md    → golden/03-false-positive.md
```

### 4. Versioned Carefully

Use semantic versioning:

- **Patch (0.1.1):** Fix typos, improve examples
- **Minor (0.2.0):** Add new checks, expand scope
- **Major (1.0.0):** Change output format, break compatibility

### 5. Model-Hint Appropriate

Choose the right cost/accuracy balance:

```yaml
modelHint: cheap # Fast syntax checks, style guides
modelHint: balanced # Standard code review
modelHint: high-accuracy # Security audits, architecture review
```

Cheap skills run first (fast feedback), high-accuracy last (thorough analysis).

## Advanced Concepts

### Input Contexts

Skills can request different types of input:

```yaml
inputContext:
  - diff # Git diff (fastest, least context)
  - fullFile # Complete file content
  - tests # Associated test files
  - adr # Architecture Decision Records
  - commitMessage # Commit message for context
```

Framework provides the requested context or skips the skill.

### Output Kinds

Skills can produce different outputs:

```yaml
outputKind:
  - findings # Standard review comments
  - questions # Clarifying questions for author
  - metrics # Quantitative measurements
  - actions # Suggested automated fixes
```

Output formatters adapt based on declared kinds.

### Dependencies

Skills can declare required tools:

```yaml
dependencies:
  - test_runner # Need to run tests
  - coverage_report # Need coverage data
  - custom:sonarqube # Custom tool integration
```

Framework validates availability before running skill.

### Skill Composition (Future)

Skills will be able to reference other skills:

```yaml
dependencies:
  - skill:typescript-strict # Run this first
```

This enables:

- Layered checks (basic → advanced)
- Skill reuse (security skill calls auth skill)
- Workflow orchestration

## Evaluation Philosophy

### Why Evaluate?

Skills are code. Like any code, they need tests.

Evaluation answers:

- **Does it work?** (Regression testing)
- **Is it effective?** (Quality measurement)
- **Is it consistent?** (Reproducibility check)

### Evaluation Strategies

#### 1. Exact Match (Strict)

```yaml
assert:
  - type: contains
    value: 'SQL injection'
```

Use for: Specific technical terms, required phrases

#### 2. Similarity (Flexible)

```yaml
assert:
  - type: similar
    value: file://../golden/01-expected.md
    threshold: 0.7 # 70% semantic similarity
```

Use for: Natural language outputs, variable phrasing

#### 3. LLM-as-Judge (Rubric)

```yaml
assert:
  - type: llm-rubric
    value: |
      Score 1 if the output identifies the vulnerability
      and provides a concrete fix. Score 0 otherwise.
```

Use for: Complex criteria, subjective quality

**Best Practice:** Combine multiple assertions:

```yaml
assert:
  - type: contains
    value: 'SQL injection' # Must mention the issue
  - type: llm-rubric
    value: 'Suggests parameterized queries' # Must have fix
  - type: similar
    value: file://../golden/01.md
    threshold: 0.6 # Should resemble expected output
```

### Continuous Evaluation

Run evaluations regularly:

```bash
# Before commit
npm run eval:fixtures

# In CI (optional - requires API keys)
# See .github/workflows/skills-and-tests.yml
```

Treat skill quality like code quality—test before merge.

## Best Practices

### Do's

✅ **Start small** - One simple skill is better than one complex skill
✅ **Test thoroughly** - Add fixtures for edge cases and false positives
✅ **Document intent** - Explain why the skill exists, not just what it does
✅ **Version carefully** - Breaking changes need major version bumps
✅ **Iterate based on feedback** - Use evaluation results to improve

### Don'ts

❌ **Don't be vague** - "Check code quality" is too broad
❌ **Don't skip fixtures** - Untested skills will drift
❌ **Don't hard-code specifics** - Use variables for file paths, names
❌ **Don't ignore false positives** - Add fixtures to prevent them
❌ **Don't forget severity** - Help users prioritize findings

## Examples from the Registry

### Security Skill

```yaml
# skills/security-basic/skill.yaml
id: security-basic
name: Baseline Security Checks
phase: midstream
applyTo: ['src/**/*.{ts,js}']
inputContext: [diff]
modelHint: cheap
severity: major
```

**Use Case:** Fast security scan on every PR

### Architecture Skill

```yaml
# skills/upstream/adr-decision-quality/SKILL.md
id: adr-decision-quality
name: ADR Decision Quality
phase: upstream
applyTo: ['docs/adr/*.md']
inputContext: [fullFile, adr]
modelHint: high-accuracy
severity: info
```

**Use Case:** Thorough architecture decision review

### Test Coverage Skill

```yaml
# skills/downstream/coverage-gap/SKILL.md
id: coverage-gap
name: Test Coverage Gap Detection
phase: downstream
applyTo: ['src/**/*.{ts,js}']
inputContext: [diff, tests, coverage_report]
modelHint: balanced
severity: minor
```

**Use Case:** Identify untested code paths

## Migration from Legacy Format

Have existing markdown-based skills? Migrate gradually:

```bash
# 1. Create registry format skill
npm run create:skill

# 2. Copy prompt content
cp skills/midstream/old-skill.md \
   skills/new-skill/prompt/system.md

# 3. Add metadata
# Edit skills/new-skill/skill.yaml

# 4. Add fixtures
# Create skills/new-skill/fixtures/*.md

# 5. Test
cd skills/new-skill
npx promptfoo eval

# 6. Retire old skill
# (Keep it until new skill is validated)
```

## Resources

- **[Architecture](./river-architecture.en.md)** - How skills fit into the framework
- **[Skill Schema Reference](../reference/skill-schema.en.md)** - Complete schema reference
- **[Skill Template](../reference/skill-template.en.md)** - Starting point for new skills
- **[promptfoo Docs](https://www.promptfoo.dev/)** - Evaluation framework
- **[Skills Catalog](../reference/skills-catalog.md)** - Registry overview

## Next Steps

1. **Explore existing skills** - Browse `skills/` for examples
2. **Create your first skill** - Use `npm run create:skill`
3. **Test with fixtures** - Add test cases and run `promptfoo eval`
4. **Share with your team** - Skills are shareable across projects

Skills are the heart of River Review. By encoding team knowledge as reproducible, testable assets, you build a living library of code review expertise that grows with your team.
