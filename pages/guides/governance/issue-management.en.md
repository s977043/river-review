# River Review—Issue / Project Operation Rules

## 🌟 Purpose

To sustainably proceed with feature development, skill design, and agent foundation expansion in River Review, we define **consistent formats and flows for Issues and GitHub Projects**.

This document summarizes operation rules so that Issue creators, reviewers, and maintainers can proceed with the same premises.

For reversible small-batch triage and work that can proceed before an owner decision, see the [Issue Triage Living Playbook](./issue-triage.en.md). That page describes an adaptable practice; it does **not** override the labels, approval, CI or merge rules below.

## 📍 1. Issue Creation Rules (Mandatory)

### 1-1. Always Use Issue Templates

For new Issues, use the matching `.github/ISSUE_TEMPLATE/*` (Use `.github/ISSUE_TEMPLATE/task.yaml` if unsure). The template includes:

- **Summary**: What this task does (Required)
- **Prev Task**: Previous Issue number (Optional)
- **Next Task**: Next Issue number to start (Optional)
- **Acceptance Criteria**: Clear completion conditions (Required)

### 1-2. Always Add "Type" Label

Add one `type:` label when creating an Issue to make the type visible at a glance.

Examples:

- `type:task`
- `type:bug`
- `type:feature`
- `type:enhancement`
- `type:docs`
- `type:content`

### 1-3. Add Priority Label

Add `P0` / `P1` / `P2` when creating an Issue to align priorities.

### 1-4. Unify Milestone to SemVer (Optional but Recommended)

To align "visibility" of progress, unified Milestones to SemVer (e.g., `v0.2.0 – Developer Experience`).

(Optional) Adding `m1-public` / `m2-dx` / `m3-smart` / `m4-community` can auto-set Milestones (`.github/workflows/auto-milestone.yml`).

Auto-assignment table:

| Label          | Milestone Title (Exact match required) |
| -------------- | -------------------------------------- |
| `m1-public`    | `v0.1.0 – Public Ready`                |
| `m2-dx`        | `v0.2.0 – Developer Experience`        |
| `m3-smart`     | `v0.3.0 – Smart Reviewer`              |
| `m4-community` | `v1.0.0 – Community Edition`           |

Refer to `ROADMAP.md` for backlog (Issue titles/labels/acceptance criteria).

## 📍 2. Dependency Rules (Visualizing Continuity)

### 2-1. Describe "Prev Task / Next Task"

Fill in the **Prev Task** and **Next Task** fields in the template as much as possible.

- `Prev Task`: Issue number to be completed before this Issue.
- `Next Task`: Next Issue number to start after this Issue is completed.

### 2-2. Explicitly State Dependencies in Body

Explicitly state dependencies in the template's **Prev/Next Task** and links (Label operation is not mandatory by default as it requires additional tools).

- Example: `Prev Task: #123`, `Next Task: #124`

## 📍 3. GitHub Projects Auto-add and Sync Rules

### 3-1. Register Issue to Project

Register Issues to GitHub Projects as needed and manage progress with Status (Automation is optional).

### 3-2. Fields on Project (Example)

Add custom fields to Roadmap Project and sync with Issue labels/dependencies.

| Field Name | Type          | Description                   |
| ---------- | ------------- | ----------------------------- |
| Status     | Single select | Todo / Doing / Blocked / Done |
| Priority   | Single select | P0 / P1 / P2                  |
| Type       | Single select | Corresponds to `type:` label  |
| Milestone  | Single select | SemVer milestone (Optional)   |
| Prev Task  | Text          | Prev Task number (Optional)   |
| Next Task  | Text          | Next Task number (Optional)   |

### 3-3. Sorting in Project

Recommended sort order:

1. Priority (P0 -> P2)
2. Milestone (Optional)
3. Issue Title (Ascending)

## 📍 4. Issue Lifecycle

Definition of progress status on Roadmap Project.

| Column | Description                                    |
| ------ | ---------------------------------------------- |
| Idea   | Just created. Phase and summary are described. |
| Build  | Assignee has started work.                     |
| Review | Pull Request has been created.                 |
| Done   | Issue is closed.                               |

## 📍 5. Epic (Parent Issue) Rules

When creating a parent Issue (Epic) to group large initiatives or entire phases, list related Issues in a checklist (Label operation introduced as needed).

List related task Issues as a checklist in the Epic Issue to grasp overall progress.

## 📍 6. Example: Sample of Correct Issue

```text
Title: Create Metadata Spec Draft

Summary:
Define extensions for skill metadata (inputContext, outputKind, modelHint, tools, etc.).

Prev Task: None
Next Task: #12 [Update skill.schema.json]

Acceptance Criteria:
- Items listed in pages/reference/skill-metadata.md
- Described with one existing skill as example
- Format easy to schematize

Labels:
- type:task
- P1
```

## 📍 7. Document Revision Rules

When changing this document, always create a Pull Request and get approval from a maintainer. Link changes affecting project operation to the Epic Issue.
