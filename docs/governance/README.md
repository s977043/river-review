# River Review: Governance Layer Index

EOS 5-layer ([`docs/ai/eos-overview.md`](../ai/eos-overview.md)) の **Governance** layer 索引。river-review の運用ルール / ownership / approval / deprecation は既存 doc に分散しているため、本 index を起点として辿れるようにする。

> 本 index は **既存 doc を移動しない**。記述の重複を避けるため、各セクションは「どこを読めばよいか」のポインタを提供する。

## Ownership

| 領域                      | owner                                                            | 文書                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills (workflow + agent) | [`skills/CODEOWNERS`](../../skills) (将来)、当面は repo メンテナ | [`skills/README.md`](../../skills/README.md), [`skills/registry.yaml`](../../skills/registry.yaml)                                                                                       |
| Planner / runner          | repo メンテナ                                                    | [`runners/core/`](../../runners/core/), [`src/lib/planner-*.mjs`](../../src/lib/)                                                                                                        |
| Eval fixtures             | repo メンテナ                                                    | [`tests/fixtures/`](../../tests/fixtures/), [`docs/development/skill-eval-kpi.md`](../development/skill-eval-kpi.md)                                                                     |
| Review policy             | repo メンテナ                                                    | [`pages/reference/review-policy.md`](../../pages/reference/review-policy.md), [`docs/review/`](../review/)                                                                               |
| Severity / applyTo policy | repo メンテナ                                                    | [`docs/development/skill-severity-rubric.md`](../development/skill-severity-rubric.md), [`docs/development/skill-applyto-scoping.md`](../development/skill-applyto-scoping.md)           |
| Memory / suppression      | repo メンテナ                                                    | [`skills/agent-skills/river-review/references/`](../../skills/agent-skills/river-review/references/), [`pages/guides/use-riverbed-memory.md`](../../pages/guides/use-riverbed-memory.md) |

## Experience Knowledge authoring

Experience Knowledge と `SKILL.md` / `references/` / fixture / rule / Riverbed の責務境界は [`docs/development/experience-knowledge-authoring.md`](../development/experience-knowledge-authoring.md) を正本とする。

## Approval policy

PR / merge / release の承認ルールは [`docs/governance.md`](../governance.md) に集約されている。要点:

- main は branch protection 下にある。必須 status checks は Lint / Unit tests (22.x) / Skill schema validation / Meta consistency の 4 点である。加えて Action dist freshness / Integration (CLI) / Blocked label guard も必須 status checks である
- merge 前 checklist は CI 緑 / line comments と issue comments の両方を確認 / マージ阻止ラベル確認 / preflight の 4 点である。加えて `.nvmrc` 一致 dist rebuild / git 出力の検証 / PR 本文の closing keyword 確認も含まれる
- 詳細: [`docs/governance.md`](../governance.md) § "PR レビューとマージ"

## Skill PR checklist

新規 skill / 既存 skill 改修の PR では以下を確認する:

1. **`npm run skills:validate`** が ✅—schema 適合
2. **`npm run agent-skills:validate`** が ✅（agent-skills を touch する場合）
3. **`npm run planner:eval:dataset`** で `coverage / top1Match` が before/after 同等以上
4. **fixture / golden / promptfoo の整備**（新規 skill の場合は [`skills/agent-skills/river-review/references/IMPROVEMENT_LOOP.md`](../../skills/agent-skills/river-review/references/IMPROVEMENT_LOOP.md) Step 6-7）
5. **severity** が [`skill-severity-rubric.md`](../development/skill-severity-rubric.md) に整合
6. **applyTo** が [`skill-applyto-scoping.md`](../development/skill-applyto-scoping.md) に整合（over-broad でない）
7. **`registry.yaml` 同期**—entry がある skill は SKILL.md と registry の severity / tags を揃える
8. **memory entry**—再発防止知見が出たら [`AGENT_LEARNINGS.md`](../../AGENT_LEARNINGS.md) または `~/.claude/projects/.../memory/` に追記

## Deprecation policy

skill を非推奨化する場合の手順:

1. SKILL.md 冒頭に「DEPRECATED: replaced by ...」を明示
2. `tags:` に `deprecated` を追加（`excludedTags` で planner load から除外される `process` / `policy` / `routing` / `sample` / `hello` と同じ機構）
3. `tests/fixtures/planner-dataset/cases.json` で対象 skill を expected から外す
4. CHANGELOG.md / release note で告知
5. 1 minor version 後に物理削除（or 別 PR で「物理削除」を明示）

deprecated skill を残す場合は、後継 skill への移行 PR と同時に出すことが望ましい。

## Migration decisions

skill 構造 / planner / runner の大きな変更は、**判断の根拠を残す** ために以下を実施:

- **Epic 起票**: 影響範囲と理由を Issue body に記載（例: [Epic #743](https://github.com/s977043/river-review/issues/743)）
- **改善フロー**: [`docs/development/improvement-flow.md`](../development/improvement-flow.md) の retrospect → classify → draft → self-review → multi-agent review → PR → save memory に従う
- **memory entry**: 再現可能な操作上の知見は `~/.claude/projects/.../memory/` の `feedback_*.md` として永続化

過去の主要 migration:

| 時期    | 変更                                                                    | 参照                                                                                   |
| ------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-04 | Epic #507 PlanGate v6 完了                                              | [Issue #507](https://github.com/s977043/river-review/issues/507)                       |
| 2026-05 | Epic #743 Skill Improvement Loop (river-review entry skill 再定義)      | [Issue #743](https://github.com/s977043/river-review/issues/743)                       |
| 2026-05 | applyTo scoping rules codify (#762)                                     | [`docs/development/skill-applyto-scoping.md`](../development/skill-applyto-scoping.md) |
| 2026-05 | severity rubric codify (#775)                                           | [`docs/development/skill-severity-rubric.md`](../development/skill-severity-rubric.md) |
| 2026-05 | EOS 5-layer codify (本 index + `eos-overview.md` + `skill-eval-kpi.md`) | この index                                                                             |

## 関連

- 上位設計: [`docs/ai/eos-overview.md`](../ai/eos-overview.md)
- 運用 SSoT: [`docs/governance.md`](../governance.md)
- KPI: [`docs/development/skill-eval-kpi.md`](../development/skill-eval-kpi.md)
- Severity / applyTo: [`docs/development/skill-severity-rubric.md`](../development/skill-severity-rubric.md), [`docs/development/skill-applyto-scoping.md`](../development/skill-applyto-scoping.md)
- Improvement flow: [`docs/development/improvement-flow.md`](../development/improvement-flow.md)
- Memory: [`skills/agent-skills/river-review/references/`](../../skills/agent-skills/river-review/references/)
