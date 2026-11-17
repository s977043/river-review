---
title: Agent Skills Catalog for PR/Quality Review
---

This page summarizes publicly available Agent Skills (and surrounding OSS tools) suitable for River Review's PR review or code quality review for quick evaluation. Skills in Skill format can be added to `skills/agent-skills/` and validated with `npm run agent-skills:validate`. `agentcheck-code-review` is already included as a package in this repository.

## Import Path (Basic Internalization Steps)

1. Create `skills/agent-skills/<skill-name>/` and place `SKILL.md` (bundle `references/` if needed).
2. Modify it to fit River Review's phases and output formats, then validate with `npm run agent-skills:validate`.
3. Add supplementary notes under `pages/guides/` if navigation or setup guides are needed (refer to this page).

## 1. Candidates from AI-Agent-Skills Repository (General Skills)

Skills included in the official community catalog. We recommend checking the content (`SKILL.md`) and copying only necessary parts instead of using `git submodule`.

| Skill Name             | Main Use                                                   | Evaluation Points for Adoption                                                                                                                         |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-review`          | Code review Skill analyzing PR diffs for comments/fixes.   | - Is scope (diff/file) sufficient?<br/>- Is output format close to River Review's `output.schema`?<br/>- Does it conflict with lint or existing rules? |
| `code-refactoring`     | Refactoring support Skill proposing structure/readability. | - Can it propose gradual steps avoiding big refactors?<br/>- Does it include wording to encourage adding tests?                                        |
| `webapp-testing` (Ref) | Skill supplementing test perspectives for Web Apps.        | - Are instructions depending on E2E tests or browser environments excessive?                                                                           |

When evaluating, check if the Skill body's checklist matches River Review phases (upstream/midstream/downstream) and if `inputContext` requires diff/test results.

## 2. Community Public Review-Specific Skills / OSS

Community skills/tools published in Agent Skills format or similar. Manage Skill formats directly under `skills/agent-skills/`, and use OSS tools in combination with Runner or GitHub Actions.

| Name                            | Format           | Main Features                                                        | Import Notes                                                                   |
| ------------------------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `@bjpl/aves/github-code-review` | Claude Skill     | Specialized Skill analyzing GitHub PR diffs for comment suggestions. | Often assumes public PRs; check permissions/auth for private repos.            |
| `devlyai/AgentCheck`            | OSS Agent Bundle | Reads entire local repo and performs code review with custom rules.  | Easy to add project-specific rules. Check Docker/Node dependencies beforehand. |

Note: The former catalog URL for `@bjpl/aves/github-code-review` returned HTTP 402 during CI on November 17, 2026. Treat this as an unverified reference rather than an adoption candidate until the upstream source and license have been independently checked.

## 3. Import Checklist

1. **Schema Compliance**: Does `SKILL.md` format follow Agent Skills spec (required metadata keys, no unintended extension fields)?
2. **Phase Consistency**: Can it be mapped to River Review phases (upstream/midstream/downstream)? Remap `phase` if needed.
3. **Input Context**: Can Runner provide information required in `inputContext` (diff, tests, fullFile)? Remove instructions if unavailable.
4. **Output Format**: Can it output in a form close to River Review's `output.schema.json`? Prepare post-processing scripts if there are gaps.
5. **Test/Validation**: Run `npm run agent-skills:validate` and `npm test` after import, and tidy Markdown/JSON with lint (`npm run lint`).
6. **Operational Fit**: Follow River Review guidelines: Security (handling secrets), Tone (Japanese preferred), Avoid excessive auto-fix suggestions.
7. **License and Policy**: Check if the imported Skill/OSS license fits company policy and allows redistribution or closed environment usage.

## 4. Sample Short-term Adoption Plan

1. Add `code-review` and `code-refactoring` to `skills/agent-skills/` and test with `phase: [midstream, downstream]`.
2. Run integration tests with Runner to identify conflicts with existing skills (duplicate comments, redundant suggestions).
3. Create custom Skills matching internal review policy, reusing useful checklists or prompt fragments from the above OSS.

## 5. Reference Links

- Agent Skills Catalog: [https://github.com/skillcreatorai/Ai-Agent-Skills](https://github.com/skillcreatorai/Ai-Agent-Skills)
- Awesome Agent Skills (Community list): [https://github.com/travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
- AgentCheck: [https://github.com/devlyai/AgentCheck](https://github.com/devlyai/AgentCheck)
