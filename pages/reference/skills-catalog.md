# Skills Catalog

River Review に同梱されているスキル一覧です。フェーズ別に分類しています。

複数のフェーズで動作するスキルは、実際に起動するフェーズすべてに掲載しています。そのため見出しの総数は同梱スキル数より多くなります。

## Skill Packs

梱包済みレビューナレッジの配布単位です。`--skill-set <id>` で導入できます（詳細は [Skill Pack を使う](../guides/use-skill-packs.md) を参照）。

| id             | name                                     | axis        | tier      | skills                                                                             |
| -------------- | ---------------------------------------- | ----------- | --------- | ---------------------------------------------------------------------------------- |
| `typescript`   | TypeScript Review Pack                   | technology  | official  | `typescript-strict` / `typescript-nullcheck` / `type-driven-design`                |
| `ddd`          | Domain-Driven Design Review Pack         | methodology | community | `bounded-context-language` / `type-driven-design` / `ubiquitous-language-naming`   |
| `react-router` | React Router Review Pack                 | technology  | community | `react-router-loader-boundary` / `react-router-action-contract`                    |
| `laravel`      | Laravel Review Pack                      | technology  | community | `laravel-eloquent-nplus1` / `laravel-migration-safety` / `laravel-mass-assignment` |
| `gha-security` | GitHub Actions Security Pack             | concern     | community | `gha-workflow-security`                                                            |
| `tailwind`     | Tailwind CSS Review Pack                 | technology  | community | `tailwind-class-hygiene`                                                           |
| `vitest`       | Vitest Review Pack                       | technology  | community | `vitest-mock-isolation`                                                            |
| `firebase`     | Firebase / Supabase (BaaS) Security Pack | concern     | community | `firebase-security-rules` / `supabase-rls-policy`                                  |
| `nextjs`       | Next.js Review Pack                      | technology  | community | `nextjs-app-router-boundary` / `nextjs-server-action-security`                     |

## upstream

### `adr-decision-quality`

- 名前: `ADR Decision Quality`
- 概要: `Ensure ADRs capture context; decision; alternatives; tradeoffs; and follow-ups in a way that prevents future
drift.`
- 対象:
  - `docs/adr/**/*`
  - `adr/**/*`
  - `**/*.adr`
  - `**/*adr*.md`
- 重要度: major
- タグ: architecture / adr / decision / upstream
- 依存関係: adr_lookup / repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `adversarial-review`

- 名前: `adversarial-review`
- 概要: `敵対的分析手法を統合したレビューの entry skill。認知バイアス対策の3手法 （Pre-mortem / War Game / Logic Torturing）と、宣言・主張と実態の乖離を突く
claim-vs-actual 検出3パターン（Self-Contradiction / Refactor-Claim Audit / Cross-File
Leakage）へルーティングし、通常のレビューでは見えない設計の盲点・ 防御の穴・論理の弱点・宣言と実装のズレを可視化する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `docs/**/*design*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
- 重要度: major
- タグ: adversarial / pre-mortem / war-game / logic-torturing / self-contradiction / refactor-claim / cross-file-leakage / claim-vs-actual / cognitive-bias / entry / routing
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions / actions

### `ai-agent-review-readiness`

- 名前: `AI Agent Review Readiness`
- 概要: `Checks whether AI-assisted work defines review criteria; accessible context; explicit review loop; human
judgment boundary; and feedback capture before delegating to an agent.`
- 対象:
  - `docs/**/*`
  - `**/*plan*.md`
  - `**/*task*.md`
  - `**/*spec*.md`
  - `**/*agent*.md`
  - `**/*workflow*.md`
  - `**/*pbi*.md`
  - `**/*todo*.md`
  - `.github/ISSUE_TEMPLATE/**/*.md`
- 重要度: major
- タグ: ai-agent / delegation / review-design / human-in-the-loop / upstream
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `api-design`

- 名前: `API Design Consistency`
- 概要: `Ensure API design follows RESTful naming and consistent conventions.`
- 対象:
  - `**/api/**`
  - `**/routes/**`
- 重要度: major
- タグ: api / design / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / summary / actions

### `api-versioning-compat`

- 名前: `API Versioning & Backward Compatibility`
- 概要: `Ensure API/contract changes specify versioning strategy; backward compatibility; deprecation plan; and
migration guidance.`
- 対象:
  - `docs/**/*api*.md`
  - `docs/**/*openapi*.{yml,yaml,json}`
  - `docs/**/*contract*.md`
  - `docs/**/*interface*.md`
  - `docs/adr/**/*`
  - `pages/**/*api*.md`
  - `pages/**/*contract*.md`
  - `pages/**/*interface*.md`
  - `**/*openapi*.{yml,yaml,json}`
  - `**/*api*.{yml,yaml,json}`
  - `**/*.adr`
- 重要度: major
- タグ: api / compatibility / versioning / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `architecture-boundaries`

- 名前: `Architecture Boundaries & Dependencies`
- 概要: `Ensure architecture/design docs define clear boundaries; ownership; dependency direction; and change impact to
avoid tight coupling.`
- 対象:
  - `docs/architecture/**/*`
  - `docs/adr/**/*`
  - `docs/**/*architecture*.md`
  - `docs/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
  - `**/*c4*.{md,png,svg}`
  - `**/*diagram*.{md,png,svg}`
- 重要度: major
- タグ: architecture / boundaries / dependencies / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `architecture-diagrams`

- 名前: `Architecture Diagrams Readiness`
- 概要: `Ensure architecture diagrams are readable; consistent with text; and clear on scope; boundaries; and data
flow.`
- 対象:
  - `docs/architecture/**/*`
  - `docs/adr/**/*`
  - `docs/**/*diagram*.md`
  - `docs/**/*c4*.md`
  - `docs/**/*sequence*.md`
  - `docs/**/*flow*.md`
  - `pages/**/*diagram*.md`
  - `pages/**/*c4*.md`
  - `pages/**/*sequence*.md`
  - `pages/**/*flow*.md`
  - `**/*diagram*.{md,png,svg}`
  - `**/*c4*.{md,png,svg}`
  - `**/*sequence*.{md,png,svg}`
  - `**/*flow*.{md,png,svg}`
- 重要度: major
- タグ: architecture / diagrams / c4 / sequence / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / adr

チェック項目の例:

- summary / findings / actions / questions

### `architecture-risk-register`

- 名前: `Architecture Risks, Assumptions & Open Questions`
- 概要: `Ensure design docs explicitly capture risks; assumptions; and open questions with owners; deadlines; and
mitigation plans.`
- 対象:
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/adr/**/*`
  - `docs/architecture/**/*`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
- 重要度: major
- タグ: architecture / risk / assumptions / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `architecture-traceability`

- 名前: `Architecture Traceability & Consistency`
- 概要: `Ensure design changes stay consistent across ADRs; diagrams; and specs; decisions are traceable; and drift is
explicitly managed.`
- 対象:
  - `docs/architecture/**/*`
  - `docs/adr/**/*`
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
  - `**/*c4*.{md,png,svg}`
  - `**/*diagram*.{md,png,svg}`
- 重要度: major
- タグ: architecture / adr / traceability / upstream
- 依存関係: adr_lookup / repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `architecture-validation-plan`

- 名前: `Architecture Validation Plan Guard`
- 概要: `Detect missing validation plans (how to verify the design is correct) in design documents and ADRs.`
- 対象:
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/adr/**/*`
  - `docs/architecture/**/*`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
- 重要度: minor
- タグ: architecture / validation / verification / slo / upstream
- 依存関係: adr_lookup / repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / actions / questions

### `availability-architecture`

- 名前: `Availability & Resilience Architecture`
- 概要: `Ensure architecture docs capture availability targets; failover strategy; capacity headroom; and resilience
trade-offs for critical services.`
- 対象:
  - `docs/architecture/**/*`
  - `docs/adr/**/*`
  - `docs/**/*design*.md`
  - `docs/**/*availability*.md`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
- 重要度: major
- タグ: availability / resilience / sre / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `bounded-context-language`

- 名前: `Bounded Context & Ubiquitous Language`
- 概要: `Ensure architecture docs define bounded contexts; ownership; and a consistent ubiquitous language to prevent
domain drift and coupling.`
- 対象:
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/adr/**/*`
  - `docs/architecture/**/*`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
- 重要度: major
- タグ: architecture / domain / boundaries / language / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / adr

チェック項目の例:

- summary / findings / actions / questions

### `cache-strategy-consistency`

- 名前: `Cache Strategy Consistency Guard`
- 概要: `Detect undefined or inconsistent cache strategies (layers; consistency; invalidation; TTL; failure handling)
in design documents.`
- 対象:
  - `docs/**/*.md`
  - `design/**/*.md`
  - `specs/**/*.md`
  - `rfc/**/*.md`
  - `**/*design*.md`
  - `**/*spec*.md`
  - `**/*architecture*.md`
- 重要度: minor
- タグ: cache / consistency / architecture / upstream / design-review
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / actions

### `capacity-cost-design`

- 名前: `Capacity, Performance & Cost Assumptions`
- 概要: `Ensure architecture/design docs state traffic assumptions; performance budgets; resource limits; and cost
risks for critical paths.`
- 対象:
  - `docs/**/*performance*.md`
  - `docs/**/*capacity*.md`
  - `docs/**/*scal*.md`
  - `docs/**/*cost*.md`
  - `docs/**/*design*.md`
  - `pages/**/*performance*.md`
  - `pages/**/*capacity*.md`
  - `pages/**/*scal*.md`
  - `pages/**/*cost*.md`
- 重要度: major
- タグ: architecture / performance / capacity / cost / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `change-communication`

- 名前: `Architecture Change Communication`
- 概要: `Ensure architecture updates document affected stakeholders; notification plan; and deprecation/retirement
signals to keep knowledge aligned.`
- 対象:
  - `docs/architecture/**/*`
  - `docs/adr/**/*`
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
  - `**/*.adr`
- 重要度: major
- タグ: architecture / communication / governance / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / adr

チェック項目の例:

- summary / findings / questions

### `code-nextjs`

- 名前: `Component Test Scaffold (Next.js)`
- 概要: `Generate React/Next.js component test skeletons (RTL) from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / nextjs / react / testing-library
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-php-laravel`

- 名前: `Test Scaffold (Laravel/PHPUnit)`
- 概要: `Generate PHP/Laravel (PHPUnit) test skeletons from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / php / laravel / phpunit
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-react`

- 名前: `Component Test Scaffold (React)`
- 概要: `Generate generic React component test skeletons (RTL) from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / react / testing-library / vite
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-remix`

- 名前: `Route/Function Test Scaffold (Remix)`
- 概要: `Generate Remix loader/action and route component test skeletons.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / remix / react / vitest
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-unit-python-pytest`

- 名前: `Unit Test Scaffold (Python/pytest)`
- 概要: `Generate Python/pytest unit test skeletons from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / python
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-unit-ts-jest`

- 名前: `Unit Test Scaffold (TypeScript)`
- 概要: `Generate TypeScript unit test skeletons (Jest/Vitest) from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / typescript / jest / vitest
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `code-vue`

- 名前: `Component Test Scaffold (Vue.js)`
- 概要: `Generate Vue.js component test skeletons (Vue Test Utils) from specifications.`
- 対象:
  - `docs/**/*.md`
  - `specs/**/*.md`
- 重要度: major
- タグ: review-support / unit-test / tdd / vue / vitest / vue-test-utils
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- tests

### `context-budget-tuning`

- 名前: `Context Budget Tuning`
- 概要: `.river-review.{yaml; json} の context.budget / ranking / reviewMode 設定をモデル仕様とリポジトリ規模に合わせて調整するレビュー観点。`
- 対象:
  - `.river-review.yaml`
  - `.river-review.yml`
  - `.river-review.json`
- 重要度: minor
- タグ: configuration / context / process / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / repoConfig

チェック項目の例:

- findings / actions

### `data-flow-state-ownership`

- 名前: `Data Flow & State Ownership`
- 概要: `Ensure designs define data flow; state ownership; consistency boundaries; and cross-boundary writes to prevent
drift and incidents.`
- 対象:
  - `docs/**/*flow*.md`
  - `docs/**/*sequence*.md`
  - `docs/**/*data-flow*.md`
  - `docs/**/*state*.md`
  - `docs/**/*design*.md`
  - `pages/**/*flow*.md`
  - `pages/**/*sequence*.md`
  - `**/*sequence*.{md,png,svg}`
  - `**/*flow*.{md,png,svg}`
  - `**/*dfd*.{md,png,svg}`
  - `**/*diagram*.{md,png,svg}`
- 重要度: major
- タグ: architecture / dataflow / state / ownership / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `data-model-db-design`

- 名前: `Data Model & DB Design Review`
- 概要: `Ensure data model/DB designs cover constraints; integrity; indexes; migrations; rollback; and operational
impacts.`
- 対象:
  - `**/*schema*.{sql,prisma}`
  - `**/*migrate*/**/*.sql`
  - `**/*migration*/**/*.sql`
  - `**/*ddl*.sql`
  - `**/*erd*.{md,png,svg}`
  - `docs/**/*db*.md`
  - `docs/**/*schema*.md`
- 重要度: major
- タグ: database / schema / migration / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `dr-multiregion`

- 名前: `Disaster Recovery & Multi-Region Readiness`
- 概要: `Ensure architecture docs define RPO/RTO; failover paths; data consistency; and DR drillability.`
- 対象:
  - `docs/**/*dr*.md`
  - `docs/**/*disaster*.md`
  - `docs/**/*business-continuity*.md`
  - `docs/**/*multi-region*.md`
  - `docs/**/*resilien*.md`
  - `pages/**/*dr*.md`
  - `pages/**/*disaster*.md`
  - `pages/**/*business-continuity*.md`
  - `pages/**/*multi-region*.md`
  - `pages/**/*resilien*.md`
  - `**/*.adr`
- 重要度: major
- タグ: reliability / dr / resiliency / multiregion / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / adr

チェック項目の例:

- summary / findings / actions / questions

### `eval-driven-skill-design`

- 名前: `Eval-Driven Skill Design`
- 概要: `新規 skill SKILL.md PR で `fixtures/`と`eval/` の happy-path × guard ペアが揃っているかを確認し、欠けている場合は eval cycle (#688)
に乗せる手順を案内する。`
- 対象:
  - `skills/**/SKILL.md`
- 重要度: minor
- タグ: skill-authoring / eval / process / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / repoConfig

チェック項目の例:

- findings / actions

### `event-driven-semantics`

- 名前: `Event-Driven Semantics & Delivery Guarantees`
- 概要: `Ensure event-driven designs specify delivery guarantees; ordering; idempotency; schema evolution; and
replay/backfill strategy.`
- 対象:
  - `docs/**/*event*.md`
  - `docs/**/*message*.md`
  - `docs/**/*queue*.md`
  - `docs/**/*stream*.md`
  - `docs/**/*kafka*.md`
  - `docs/**/*pubsub*.md`
  - `pages/**/*event*.md`
  - `pages/**/*message*.md`
  - `**/*asyncapi*.{yml,yaml,json}`
  - `**/*schema*.{avsc,json}`
  - `**/*.proto`
- 重要度: major
- タグ: architecture / events / messaging / reliability / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `external-dependencies`

- 名前: `External Dependencies & Vendor Risks`
- 概要: `Ensure designs document third-party dependencies; SLAs; quotas; failure modes; and vendor lock-in mitigation.`
- 対象:
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/**/*dependency*.md`
  - `docs/**/*integration*.md`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
- 重要度: major
- タグ: architecture / dependencies / vendor / risk / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `failure-modes-observability`

- 名前: `Failure Modes & Observability in Design`
- 概要: `Ensure designs specify failure modes; timeouts; error contracts; and observability for critical flows.`
- 対象:
  - `**/api/**`
  - `**/routes/**`
  - `docs/**/*`
  - `pages/**/*`
- 重要度: major
- タグ: reliability / observability / api / design / upstream
- 依存関係: repo_metadata / tracing
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / actions / questions / summary

### `integration-contracts`

- 名前: `Service Integration & Contracts`
- 概要: `Ensure cross-service integration defines contracts; ownership; failure handling; versioning; and
rollout/rollback expectations.`
- 対象:
  - `docs/**/*integration*.md`
  - `docs/**/*interface*.md`
  - `docs/**/*contract*.md`
  - `docs/**/*event*.md`
  - `docs/**/*message*.md`
  - `pages/**/*integration*.md`
  - `**/*openapi*.{yml,yaml,json}`
  - `**/*asyncapi*.{yml,yaml,json}`
  - `**/*schema*.{avsc,json}`
  - `**/*.proto`
- 重要度: major
- タグ: integration / contract / api / events / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `laravel-migration-safety`

- 名前: `Laravel Migration Safety Review`
- 概要: `Reviews Laravel migrations for destructive operations; change() dropping modifiers; locking index creation on
large tables (PostgreSQL); and asymmetric down().`
- 対象:
  - `database/migrations/**/*.php`
- 重要度: major
- タグ: laravel / migration / database / postgresql / safety / upstream
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `logic-torturing`

- 名前: `Logic Torturing 論理検証`
- 概要: `変更に含まれる設計判断・実装選択の論理的整合性を徹底的に検証し、確証バイアスを排除して判断精度を高める`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `docs/**/*design*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
- 重要度: major
- タグ: adversarial / logic-torturing / decision-quality / critical-thinking / midstream / cognitive-bias
- 依存関係: code_search / repo_metadata
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile / commitMessage / adr

チェック項目の例:

- findings / questions

### `migration-rollout-rollback`

- 名前: `Migration, Rollout & Rollback Plan`
- 概要: `Ensure design/ADR changes include a concrete migration plan; rollout strategy; rollback conditions; and
compatibility considerations.`
- 対象:
  - `docs/**/*`
  - `pages/**/*`
  - `**/*migration*.md`
  - `**/*rollout*.md`
  - `**/*rollback*.md`
  - `**/*release*.md`
  - `**/*deploy*.md`
- 重要度: major
- タグ: migration / rollout / rollback / release / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `migration-safety`

- 名前: `Migration Safety Review (framework-agnostic)`
- 概要: `スキーマ/データ移行の安全性を framework 非依存で審査する。破壊的スキーマ変更・ロック誘発・backfill・ロールバック可逆性・expand-contract の段階適用を、prisma / typeorm
/ Rails / Django / Alembic / 生 SQL などに横断適用する。`
- 対象:
  - `**/migrations/**/*`
  - `**/migrate/**/*`
  - `prisma/schema.prisma`
  - `db/**/*.sql`
- 重要度: major
- タグ: migration / database / schema / safety / rollback / upstream
- 依存関係: code_search
- 適用条件: phase=upstream / midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `multitenancy-isolation`

- 名前: `Multitenancy Isolation Guard`
- 概要: `マルチテナント前提の設計差分から、テナント分離（データ/権限/リソース/障害影響）の抜けや越境リスクを検出`
- 対象:
  - `docs/**/*`
  - `design/**/*`
  - `architecture/**/*`
  - `specs/**/*`
  - `config/**/*`
  - `infrastructure/**/*`
- 重要度: major
- タグ: multitenancy / isolation / security / architecture / upstream
- 依存関係: code_search
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- findings / actions

### `openapi-contract`

- 名前: `OpenAPI Contract Completeness`
- 概要: `Ensure OpenAPI specs define consistent request/response schemas; error model; auth; pagination; and backward
compatibility.`
- 対象:
  - `**/openapi/**/*.{yml,yaml,json}`
  - `**/*openapi*.{yml,yaml,json}`
  - `**/*swagger*.{yml,yaml,json}`
  - `**/*api*.{yml,yaml,json}`
  - `docs/**/*api*.md`
- 重要度: major
- タグ: api / openapi / contract / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `operability-slo`

- 名前: `Operability, SLO & Runbook Readiness`
- 概要: `Ensure designs define operability basics: SLO/SLI; monitoring; alerting; on-call actions; and incident
handling expectations.`
- 対象:
  - `docs/**/*`
  - `pages/**/*`
  - `**/*slo*.md`
  - `**/*sli*.md`
  - `**/*runbook*.md`
  - `**/*operat*.md`
  - `**/*monitor*.md`
  - `**/*alert*.md`
- 重要度: major
- タグ: reliability / sre / operability / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `plan-review-gate`

- 名前: `実装計画レビューゲート`
- 概要: `実装計画（plan.md / pbi-input.md）に含まれる危険操作・触れてはならないスコープ・人間承認必須条件を検出し、AI 自律実行前のゲートとして機能する`
- 対象:
  - `**/plan.md`
  - `**/pbi-input.md`
- 重要度: major
- タグ: plangate / plan-review / human-approval / safety / upstream / stop-work
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `plangate-exec-conformance`

- 名前: `PlanGate Exec Conformance Guard`
- 概要: `実装差分が plan / todo / test-cases アーティファクトの方針と一致しているかを検査し、逸脱・漏れ・意図外変更を検知する`
- 対象:
  - `**/*`
- 重要度: major
- タグ: plangate / conformance / exec / plan / todo / test-cases / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / repoConfig

チェック項目の例:

- findings / summary / questions

### `plangate-gc-deterministic`

- 名前: `PlanGate 決定論的 GC 判定`
- 概要: `River Review の artifact / memory / log に対して、retention 設定 + hard guards + excludes から決定論的に KEEP/REMOVE を判定する GC
skill`
- 対象:
  - `.river/memory/**`
  - `artifacts/evals/**`
  - `artifacts/review-artifact*.json`
- 重要度: minor
- タグ: plangate / gc / maintenance / deterministic / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=repoConfig / fullFile

チェック項目の例:

- summary / findings / actions

### `plangate-plan-integrity`

- 名前: `PlanGate 計画整合性チェック`
- 概要: `pbi-input; plan; todo; test-cases 間の整合性をチェックし、実装着手前の仕様漏れを検知する`
- 対象:
  - `**/pbi-input.md`
  - `**/plan.md`
  - `**/todo.md`
  - `**/test-cases.md`
- 重要度: major
- タグ: plangate / planning / integrity / traceability / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `plangate-rule-promotion`

- 名前: `PlanGate ルール昇格判定`
- 概要: `運用で発見されたレビューパターン (findings / retrospective) を分析し、新 skill への昇格候補 / 既存 skill 更新候補 / 人間判断が必要な項目に分類する`
- 対象:
  - `**/review-self.md`
  - `**/review-external.md`
  - `**/retrospective.md`
  - `**/decision-log.md`
- 重要度: info
- タグ: plangate / rule-promotion / governance / skill-registry / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=fullFile / repoConfig

チェック項目の例:

- summary / findings / actions / questions

### `plangate-tdd-evidence`

- 名前: `PlanGate TDD Evidence Review`
- 概要: `TDD を主張する実装の RED/GREEN/REFACTOR VERIFY 証跡（tdd-ledger）の妥当性を検査し、フェーズ順序・exitCode・test-cases との対応の欠落や偽装を検知する`
- 対象:
  - `**/*`
- 重要度: major
- タグ: plangate / tdd / evidence / verification / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / repoConfig

チェック項目の例:

- findings / summary / questions

### `plangate-verification-audit`

- 名前: `PlanGate 検証監査 (W チェック)`
- 概要: `既存のレビュー結果 (review-self / review-external) を再点検し、漏れ・誤検知・ハルシネーション・根拠欠落を検出する W チェック skill`
- 対象:
  - `**/review-self.md`
  - `**/review-external.md`
- 重要度: major
- タグ: plangate / verification / w-check / audit / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions / review-audit

### `pr-template-qa`

- 名前: `PRテンプレート品質チェック`
- 概要: `PRテンプレートの必須項目（日本語記載、Diátaxis、検証コマンド、チェックリスト）が明確かを確認し、抜けや誤解を生む文言を指摘する`
- 対象:
  - `.github/pull_request_template.md`
  - `.github/PULL_REQUEST_TEMPLATE.md`
- 重要度: minor
- タグ: process / documentation / upstream
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / summary

### `pre-mortem`

- 名前: `Pre-mortem 失敗シナリオ分析`
- 概要: `変更が将来インシデントや技術的負債を引き起こすと仮定し、その原因と経路を逆算して設計の盲点を可視化する`
- 対象:
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
  - `**/*.adr`
- 重要度: major
- タグ: adversarial / pre-mortem / risk / design / upstream / cognitive-bias
- 依存関係: repo_metadata / code_search
- 適用条件: phase=upstream, inputContext=diff / fullFile / adr / commitMessage

チェック項目の例:

- findings / questions / actions

### `requirements-acceptance`

- 名前: `Requirements Clarity & Acceptance Criteria`
- 概要: `Ensure requirement docs define scope; terminology; acceptance criteria; edge cases; and non-functional
requirements.`
- 対象:
  - `docs/**/*`
  - `pages/**/*`
  - `**/*prd*.md`
  - `**/*requirements*.md`
  - `**/*user-story*.md`
  - `**/*spec*.md`
- 重要度: major
- タグ: requirements / product / specification / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `review-policy-standard-upstream`

- 名前: `Standard Review Policy for Upstream`
- 概要: `Applies standard AI review policy guidelines for upstream (design) phase reviews.`
- 対象:
  - `**/*.md`
  - `**/*.adr`
  - `**/docs/**/*`
  - `**/design/**/*`
- 重要度: info
- タグ: policy / upstream / design / architecture
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- findings / summary

### `review-team`

- 名前: `review-team`
- 概要: `6つの専門レビュアーロールを並列実行し、consensusLevel（複数ロールの合意度）と Tech Lead レポート（top3指摘・blindSpots・consensusSummary）で結果を統合する
マルチエージェントレビュー entry skill。 Parallel multi-role review with consensus scoring (consensusLevel) and Tech Lead
report. Use when a major release needs exhaustive multi-angle review; or when a single-perspective review is
not enough and you want confidence that no reviewer angle was missed（重要リリース前の網羅レビュー・多視点の確証が 欲しいとき）。`
- 対象:
  - `**/*`
- 重要度: major
- タグ: entry / routing / multi-agent / parallel / consensus / team / orchestration
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review`

- 名前: `river-review`
- 概要: `River Review のメインエントリポイント。 レビュー依頼の intent classification → 専門 skill 選択 → 実行 → finding verification → feedback
classification → fixture / reference / suppression への還元までを束ねる improvement-loop orchestrator。`
- 対象:
  - `**/*`
- 重要度: minor
- タグ: entry / routing / orchestrator / improvement-loop
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review-architecture`

- 名前: `river-review-architecture`
- 概要: `設計・アーキテクチャ観点のレビューエージェント。 依存関係、境界設計、データモデル、API設計等の個別スキルへルーティングする。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `docs/**/*design*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
- 重要度: major
- タグ: architecture / design / entry / routing
- 依存関係: none
- 適用条件: phase=upstream, inputContext=diff / fullFile / adr

チェック項目の例:

- findings / questions / actions

### `river-review-security-audit`

- 名前: `river-review-security-audit`
- 概要: `Repository または subsystem を対象に、source-only で明示的なセキュリティ監査を行う entry skill。 通常の PR
セキュリティレビューとは分離し、reconnaissance、scope 固定、既存 security skill への委譲、 evidence と unresolved hypothesis
の記録を行う。target-controlled code は実行しない。`
- 対象:
  - `**/*`
- 重要度: critical
- タグ: security / audit / entry / routing / source-only
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `security-privacy-design`

- 名前: `Security & Privacy Design Review`
- 概要: `Review data retention; deletion; backup residency; and cross-border data transfer.`
- 対象:
  - `docs/**/*.md`
  - `**/design/**/*`
  - `**/rfc/**/*`
  - `docs/architecture/**/*`
- 重要度: minor
- タグ: security / privacy / upstream / design / gdpr / pii
- 依存関係: code_search
- 適用条件: phase=upstream, inputContext=fullFile

チェック項目の例:

- findings / actions

### `trust-boundaries-authz`

- 名前: `Trust Boundaries & Authorization Architecture`
- 概要: `Ensure designs define trust boundaries; authn/authz responsibilities; and propagation of identity/claims
across services.`
- 対象:
  - `docs/**/*security*.md`
  - `docs/**/*auth*.md`
  - `docs/**/*design*.md`
  - `docs/**/*architecture*.md`
  - `docs/adr/**/*`
  - `pages/**/*security*.md`
  - `pages/**/*auth*.md`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
- 重要度: critical
- タグ: architecture / security / authz / trust-boundary / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream, inputContext=diff

チェック項目の例:

- summary / findings / actions / questions

### `unknown-coverage-review`

- 名前: `unknown-coverage-review`
- 概要: `完成した差分・PR・検証証拠に残る Unknown（未確認の前提・調査されていない影響・ 不足している証拠）を横断合成する evidence-sufficiency のメタ観点。個別 defect の 検出は既存
skill へ委譲し、本 skill は「そのリスク種別を調査した証拠が残っているか」 の meta 評価のみを行う。finding verification 後の合成ステップとして report-only で
実行し、残存 Unknown を output-format §4「Unverified / Residual Risk」の Unknown Coverage 下位構造へ、判定を既存 verdict
語彙（GO/ESCALATE/NO_GO）へ写像する。 新しい語彙・schema は作らない。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `**/migrations/**`
  - `**/*.sql`
  - `**/*.{yaml,yml,json,toml}`
- 重要度: major
- タグ: unknown-coverage / evidence-sufficiency / grill-for-unknowns / unknown-unknowns / map-territory / meta / synthesis
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=diff / fullFile / reviewSelf / reviewExternal

チェック項目の例:

- findings / questions / actions

## midstream

### `a11y-accessible-name`

- 名前: `a11y Accessible Name Basics`
- 概要: `画像・ボタン・フォーム要素に適切なアクセシブルネームがあるか確認する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,html}`
  - `app/**/*.{ts,tsx,js,jsx,html}`
  - `components/**/*.{ts,tsx,js,jsx,html}`
- 重要度: minor
- タグ: community / accessibility / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `adversarial-review`

- 名前: `adversarial-review`
- 概要: `敵対的分析手法を統合したレビューの entry skill。認知バイアス対策の3手法 （Pre-mortem / War Game / Logic Torturing）と、宣言・主張と実態の乖離を突く
claim-vs-actual 検出3パターン（Self-Contradiction / Refactor-Claim Audit / Cross-File
Leakage）へルーティングし、通常のレビューでは見えない設計の盲点・ 防御の穴・論理の弱点・宣言と実装のズレを可視化する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `docs/**/*design*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
- 重要度: major
- タグ: adversarial / pre-mortem / war-game / logic-torturing / self-contradiction / refactor-claim / cross-file-leakage / claim-vs-actual / cognitive-bias / entry / routing
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions / actions

### `agent-skill-bridge`

- 名前: `Agent Skill Bridge Review`
- 概要: `Review changes to the Agent Skills import/export bridge for path safety; round-trip fidelity; and validation
correctness.`
- 対象:
  - `src/lib/agent-skill-bridge.mjs`
  - `tests/agent-skill-bridge.test.mjs`
  - `schemas/agent-skill-loose.schema.json`
  - `scripts/validate-agent-skills.mjs`
- 重要度: major
- タグ: bridge / skills / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `ai-agent-review-readiness`

- 名前: `AI Agent Review Readiness`
- 概要: `Checks whether AI-assisted work defines review criteria; accessible context; explicit review loop; human
judgment boundary; and feedback capture before delegating to an agent.`
- 対象:
  - `docs/**/*`
  - `**/*plan*.md`
  - `**/*task*.md`
  - `**/*spec*.md`
  - `**/*agent*.md`
  - `**/*workflow*.md`
  - `**/*pbi*.md`
  - `**/*todo*.md`
  - `.github/ISSUE_TEMPLATE/**/*.md`
- 重要度: major
- タグ: ai-agent / delegation / review-design / human-in-the-loop / upstream
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `altitude-generalization`

- 名前: `Altitude Generalization Guard`
- 概要: `Detects per-caller special-cases (bandaids) bolted onto shared infrastructure/common functions; and when two
or more same-kind special-cases exist proposes generalizing the lower-level mechanism instead.`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `runners/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- 重要度: minor
- タグ: simplify / altitude / generalization / maintainability / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `api-compatibility`

- 名前: `API Compatibility and Test Gap Review`
- 概要: `Detect breaking API contract changes; DTO modifications without compatibility handling; and missing tests for
changed API boundaries.`
- 対象:
  - `src/**/*.{ts,tsx,js}`
  - `app/**/*.{ts,tsx,js}`
  - `lib/**/*.{ts,tsx,js}`
  - `packages/**/*.{ts,tsx,js}`
  - `pages/api/**/*.{ts,js}`
- 重要度: major
- タグ: api / compatibility / dto / breaking-change / test-coverage / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `assumption-resolution-trace`

- 名前: `Assumption Resolution Trace Plan の前提解消トレーサビリティ`
- 概要: `plan artifact がある時のみ、plan 中の assumption / open question が実装で解消された証拠を diff・PR 本文と突合する evidence-sufficiency
観点。解消されないまま残った前提・未記録の新規 Unknown を検出する。plan 欠損時は発火しない（Pre-execution Gate）。plan 欠損でも PR 本文に前提が inline
列挙されていれば列挙分のみ部分評価し、計画 issue の bare 参照だけなら skip する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `**/migrations/**`
  - `**/*.sql`
- 重要度: major
- タグ: assumption-resolution-trace / evidence-sufficiency / plan-traceability / assumption / open-question / unknown-coverage / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile / prDescription / reviewSelf

チェック項目の例:

- findings / questions / actions

### `async-correctness`

- 名前: `Async Correctness 非同期処理の正しさ検証`
- 概要: `await 漏れ・floating promise・並行競合など、非同期処理の correctness バグを検出する。並列化の効率提案（SIMPLIFY
Efficiency）や配線断点（e2e-wiring）ではなく、「await を忘れて結果・順序・エラー伝播が壊れる」実装バグに限定する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
- 重要度: major
- タグ: async / await / promise / race-condition / correctness / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions

### `behavior-structure-separation`

- 名前: `Behavior-Structure Separation 振る舞い変更と構造変更の分離・外部挙動維持`
- 概要: `リファクタリング（構造変更）と機能変更（behavior change）が同一 diff に混在していないかを識別し、structural change に対する external behavior
preservation の証拠（テスト・型・静的解析）が揃っているかを diff-time で確認する。証拠不足のときは Characterization Test 追加を促すか question とする。DTO/公開
API の破壊的変更検出は api-compatibility、完了主張の反証や抽出リファクタの性能特性退行は refactor-claim-audit、新知識の命名・責務・境界への反映は
knowledge-to-code-alignment、投機的抽象化・スコープ逸脱は altitude-generalization / fix-scope-integrity へ委譲する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs}`
- 重要度: minor
- タグ: behavior-preservation / refactoring / characterization-test / structural-change / safety-net / midstream
- 依存関係: code_search / test_runner
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `closure-scope-retention`

- 名前: `Closure Scope Retention Guard`
- 概要: `Detects long-lived objects (caches; listeners; singletons) that capture an entire enclosing scope via
closures/environment capture; keeping large arrays or buffers alive; and proposes copying only the needed
fields.`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `runners/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- 重要度: major
- タグ: simplify / memory / closure / retention / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `component-variants-states`

- 名前: `Component Variants / States Documentation コンポーネント状態の文書化`
- 概要: `新規追加された UI コンポーネントに、variants（種類）とインタラクティブ状態（hover / focus / disabled / loading /
error）が定義・文書化されているかを確認し、状態設計の欠落を検出する`
- 対象:
  - `src/**/*.{tsx,jsx}`
  - `app/**/*.{tsx,jsx}`
  - `components/**/*.{tsx,jsx}`
- 重要度: minor
- タグ: design-system / component / variants / states / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `config-json`

- 名前: `Configuration File Review`
- 概要: `Review JSON/YAML configuration files for common issues and best practices.`
- 対象:
  - `**/*.json`
  - `**/*.yml`
  - `**/*.yaml`
- 重要度: minor
- タグ: config / json / yaml / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings

### `cross-file-leakage`

- 名前: `Cross-File Leakage リファクタ後の caller 側残骸検出`
- 概要: `モジュール/スキルの構造変更で当該ファイルは更新したが、caller 側が古い構造（旧参照・旧シグネチャ・旧採番）を参照したまま残るパターンを検出する`
- 対象:
  - `**/*.{ts,tsx,js,jsx,mjs}`
  - `**/*.md`
  - `**/SKILL.md`
  - `**/*.{yaml,yml,json}`
- 重要度: major
- タグ: adversarial / cross-file-leakage / claim-vs-actual / refactor / caller-drift / midstream / cognitive-bias
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `data-model-db-design`

- 名前: `Data Model & DB Design Review`
- 概要: `Ensure data model/DB designs cover constraints; integrity; indexes; migrations; rollback; and operational
impacts.`
- 対象:
  - `**/*schema*.{sql,prisma}`
  - `**/*migrate*/**/*.sql`
  - `**/*migration*/**/*.sql`
  - `**/*ddl*.sql`
  - `**/*erd*.{md,png,svg}`
  - `docs/**/*db*.md`
  - `docs/**/*schema*.md`
- 重要度: major
- タグ: database / schema / migration / upstream
- 依存関係: repo_metadata
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `design-source-conformance`

- 名前: `Design Source-of-Truth Conformance デザイン定義準拠`
- 概要: `リポジトリに DESIGN.md やデザイントークン定義が存在する場合に、新規 UI 実装の色・余白・フォントサイズ・角丸・シャドウがその定義済みスケールに準拠しているかを照合する。定義が無ければ実行しない`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,css,scss}`
  - `app/**/*.{ts,tsx,js,jsx,css,scss}`
  - `components/**/*.{ts,tsx,js,jsx,css,scss}`
- 重要度: minor
- タグ: design-system / design-source / conformance / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `design-system-component-reuse`

- 名前: `Design System Component Reuse Guard`
- 概要: `既存デザインシステムコンポーネント（Button / Input / Modal / Card 等）を再実装していないかを検出する。Figma→コード実装時に既存コンポーネントを無視した実装を防ぐ。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx}`
  - `app/**/*.{ts,tsx,js,jsx}`
  - `components/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: community / design-system / component-reuse / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `design-token-enforcement`

- 名前: `Design Token Enforcement`
- 概要: `デザイントークンを使わずに直書きされた色・余白・フォントサイズ・角丸・シャドウを検出する。Figma Variables / Tailwind config / CSS custom properties
のルールに違反する実装を指摘する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,css,scss}`
  - `app/**/*.{ts,tsx,js,jsx,css,scss}`
  - `components/**/*.{ts,tsx,js,jsx,css,scss}`
- 重要度: minor
- タグ: community / design-system / tokens / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `detector-detection-power`

- 名前: `Detector Detection Power 検査器の検出力の検証`
- 概要: `検査器（linter / ガード / CI ゲート / バリデータ / フィルタ）そのものの検出力が差分で静かに落ちていないか、また新設した検査が実際に検出できることが実証されているかを diff-time
で検出する。Check 1 unverified detection
reduction（検査器の検出ロジック（正規表現・除外パターン・解決集合・allowlist・baseline）を変更して検出件数が減ったのに、減った 1
件ずつが誤検出であった根拠が示されないまま「誤検出を潰した」「N → M 件に減少」と改善として主張している）、Check 2 unproven guard detection power（新しい検査ロジック・CI
ゲート・バリデーションを追加・変更したのに、検出すべき入力を注入して検出されること／検出すべきでない入力で黙ることを示す変異注入の証跡が無く、「追加した」「CI が緑」を検出力の証拠として扱っている）、の 2 Check
を対象とする report-only。テスト自身のアサーションが実質何も検証していない構造は
test-assertion-effectiveness、レビュー基準・品質ゲートの明示的な弱体化（ルールの削除・閾値の引き下げ・suppression entry 追加・lint ルールの無効化）は
review-criteria-integrity、リファクタ完了主張一般の検証は refactor-claim-audit、workflow の permissions と action pin は
gha-workflow-security、設定ファイルの構文・型の妥当性は config-json へ委譲する`
- 対象:
  - `scripts/**/*.{mjs,cjs,js,ts,sh,py,rb}`
  - `tools/**/*.{mjs,cjs,js,ts,sh,py,rb}`
  - `.github/scripts/**/*.{mjs,cjs,js,ts,sh,py,rb}`
  - `.github/workflows/**/*.{yml,yaml}`
  - `**/*lint*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*guard*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*validat*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*check*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*detect*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*scan*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*audit*.{mjs,cjs,js,ts,py,rb,sh}`
  - `**/*baseline*.{json,yaml,yml,txt}`
  - `**/*allowlist*.{json,yaml,yml,txt}`
  - `**/*ignorelist*.{json,yaml,yml,txt}`
- 重要度: major
- タグ: detector-quality / detection-power / guard / linter / ci-gate / validator / mutation-evidence / false-negative / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / prDescription / fullFile

チェック項目の例:

- findings / questions

### `doc-hygiene`

- 名前: `Documentation Hygiene ドキュメント衛生`
- 概要: `AGENTS.md などの恒久ドキュメントに一過性のタスクログが混入していないか、SOP / decision / log / learned の役割が混同されていないか、公開物（README / docs /
記事）に内部メモ・ローカルパス・AI 会話断片が残っていないかを差分で検出する`
- 対象:
  - `**/*.md`
  - `**/*.mdx`
- 重要度: major
- タグ: documentation / hygiene / maintainability / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `e2e-wiring`

- 名前: `End-to-End Wiring 末端到達・貫通の検証`
- 概要: `宣言した処理（計測 / 通知 / 保存 / 検証 / 例外通知）が起点から末端まで途切れず配線されているかを確認し、「実装したつもり」で経路が途中で止まっている欠落を検出する`
- 対象:
  - `**/*.{ts,tsx,js,jsx,mjs,cjs,py,rb,go,php,java}`
- 重要度: major
- タグ: wiring / end-to-end / correctness / integration / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `existing-pattern-conformance`

- 名前: `Existing-Pattern Conformance 既存パターン準拠の確認`
- 概要: `新実装が、同種の先行実装（同レイヤ・同責務・同概念）に在る防御 / バリデーション / エラー処理 / 規約 / 共通化ロジック / 概念定義を、欠落・重複・食い違いなく継承しているかを grep で先行特定して確認する`
- 対象:
  - `**/*.{ts,tsx,js,jsx,mjs,cjs,py,rb,go,php,java}`
  - `**/migrations/**/*`
- 重要度: major
- タグ: conformance / prior-art / consistency / maintainability / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `firebase-security-rules`

- 名前: `Firebase Security Rules Review`
- 概要: `Detects over-permissive Firestore/Storage rules (allow read; write: if true / auth-only without ownership);
missing auth checks on writes; and admin SDK private key exposure to client bundles.`
- 対象:
  - `**/*.rules`
  - `**/firestore.rules`
  - `**/storage.rules`
  - `**/firebase*.{ts,js}`
- 重要度: critical
- タグ: firebase / security / baas / authorization / midstream / community
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `fix-scope-integrity`

- 名前: `Fix Scope Integrity 指摘対応ループのスコープ逸脱・前提破壊検出`
- 概要: `指摘対応の反復（レビューコメント→修正→再レビュー）で、個別には正しい修正の蓄積が当初スコープを逸脱した（scope creep）、または成立済みの前提（"動いていた"状態）を破壊した（premise break）連鎖を
diff-time で検出する。技術的正しさとスコープ整合性を別軸で評価し、report-only で finding/question のみ出力する。1コメント単位のトリアージ・構造変更後の caller
残骸・plan 前提解消は隣接 skill へ委譲する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `app/**/*.{ts,tsx,js,jsx,php}`
- 重要度: major
- タグ: fix-scope-integrity / scope-creep / premise-break / fix-scope-guard / review-response-loop / scope-consistency / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions

### `gh-address-comments`

- 名前: `GitHubレビューコメント対応（修正案つき）`
- 概要: `PRレビューコメントを重要度ごとに整理し、対応方針・修正案・質問をまとめて返信案を作る`
- 対象:
  - `src/**/*`
  - `lib/**/*`
  - `apps/**/*`
  - `packages/**/*`
  - `tests/**/*`
  - `docs/**/*`
  - `pages/**/*`
- 重要度: info
- タグ: review / github / midstream
- 依存関係: custom:github
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- actions / questions / summary

### `gha-workflow-security`

- 名前: `GitHub Actions Workflow Security Review`
- 概要: `Reviews GitHub Actions workflow diffs for script injection of untrusted input; pull_request_target with
untrusted checkout; over-broad GITHUB_TOKEN permissions; and unpinned third-party actions.`
- 対象:
  - `.github/workflows/**/*.{yml,yaml}`
- 重要度: major
- タグ: github-actions / security / ci / supply-chain / downstream
- 依存関係: none
- 適用条件: phase=midstream / downstream, inputContext=diff

チェック項目の例:

- findings / questions

### `hallucinated-reference`

- 名前: `Hallucinated Reference 幻覚的参照の実在確認`
- 概要: `差分で新規に導入された import・メソッド呼び出し・ライブラリ API 参照が実在するかを code_search で検証し、AI
生成コード特有の幻覚的参照（存在しない関数・メソッド・モジュール・引数シグネチャ）を検出する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
- 重要度: major
- タグ: hallucination / reference-existence / ai-generated-code / correctness / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions

### `hello-skill`

- 名前: `Hello Skill (Always-On Sample)`
- 概要: `Minimal always-on sample skill to guarantee an end-to-end review experience.`
- 対象:
  - `**/*`
- 重要度: info
- タグ: sample / hello / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / summary

### `i18n-unused-key`

- 名前: `i18n Unused Key Review`
- 概要: `Detect i18n/locale keys that are removed from source but remain in locale files; or keys added to locale files
without source usage.`
- 対象:
  - `**/i18n/**`
  - `**/locales/**`
  - `**/messages/**`
  - `**/*.json`
- 重要度: minor
- タグ: i18n / localization / dead-code / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings

### `impact-evidence-coverage`

- 名前: `Impact Evidence Coverage 影響・失敗系・外部依存の証拠充足`
- 概要: `diff-time で「影響範囲を repo 全体で調査した証拠」「失敗系を検証した証拠」「外部依存・レート制限・キャッシュ整合を確認した証拠」の欠落を検出する evidence-sufficiency
観点。defect そのものは既存 skill へ委譲し、本 skill は「そのリスク種別を調査した証拠が差分・PR 本文・テストに残っているか」の meta 評価のみを行う。証拠が同一 diff
に同梱（テスト・canary・grep 記録）されていれば充足とみなす`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `**/migrations/**`
  - `**/*.sql`
- 重要度: major
- タグ: impact-evidence-coverage / evidence-sufficiency / impact-analysis / failure-modes / external-dependencies / unknown-coverage / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `independent-review-synthesis`

- 名前: `Independent Review Synthesis`
- 概要: `複数の AI / 人間レビュー結果 (review-self / review-external / findings-pool) を統合し、実在性・重大度・対応優先度・merge 可否を検証する。`
- 対象:
  - `**/*`
- 重要度: major
- タグ: community / review / synthesis / multi-agent / validation / hallucination-guard / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile / reviewSelf / reviewExternal / findingsPool

チェック項目の例:

- findings / summary / actions

### `invisible-unicode-injection`

- 名前: `Invisible Unicode Injection Scan 不可視 Unicode コード注入検出`
- 概要: `差分に追加されたソースコードへ混入した不可視・危険な Unicode 文字（タグ文字・異体字セレクター・ゼロ幅文字・双方向制御/マーク・変則空白）を検出する。GlassWorm 型サプライチェーン攻撃・ASCII
smuggling・Trojan Source（CVE-2021-42574）でコードを不可視化する手口を、決定論的な静的解析（列挙した code point 集合に限定）として捕捉し、canary
テストで誤検出の再発を防ぐ`
- 対象:
  - `**/*`
- 重要度: major
- タグ: unicode / supply-chain / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `knowledge-to-code-alignment`

- 名前: `Knowledge-to-Code Alignment 新知識のコード反映・設計知識の保全`
- 概要: `リファクタリングを「更新されたチームの理解と、コードが表現する過去の理解の差分同期」と捉え、今回得た新知識（要求・ドメイン知識・制約）が naming と responsibility
へ反映されているか、boundary が現在の understanding を表現しているか、diff の削除行やコメントに現れる過去の design history と constraint を失っていないかを
diff-time で確認する。Knowledge Delta の signal は diff（追加/削除された hunk・コメント・ADR 参照）を一次情報とし、PR 本文が供給されるときは補助に用い、不確実なら
question に留める。ドメイン用語の一貫性は ubiquitous-language-naming、集約/コンテキスト境界の設計判断は bounded-context-language、投機的抽象化・caller
special-case は altitude-generalization、スコープ逸脱/前提破壊は fix-scope-integrity、振る舞い変更と構造変更の分離は
behavior-structure-separation、完了主張の反証は refactor-claim-audit へ委譲する`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs}`
- 重要度: minor
- タグ: knowledge-to-code / knowledge-delta / refactoring / naming / responsibility / design-history / midstream
- 依存関係: code_search / adr_lookup
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `laravel-eloquent-nplus1`

- 名前: `Laravel Eloquent N+1 and Query Efficiency Review`
- 概要: `Detects N+1 query patterns (relation access inside loops without eager loading); full-table get()/all() loads;
and unsafe chunk()/cursor() usage in Laravel Eloquent code.`
- 対象:
  - `app/**/*.php`
  - `src/**/*.php`
- 重要度: major
- タグ: laravel / eloquent / performance / n-plus-1 / php / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `laravel-mass-assignment`

- 名前: `Laravel Mass Assignment and Authorization Review`
- 概要: `Detects mass assignment via create/update($request->all()); unguarded models; and missing authorization on
mutating controller actions in Laravel.`
- 対象:
  - `app/**/*.php`
  - `src/**/*.php`
- 重要度: major
- タグ: laravel / security / mass-assignment / authorization / php / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `laravel-migration-safety`

- 名前: `Laravel Migration Safety Review`
- 概要: `Reviews Laravel migrations for destructive operations; change() dropping modifiers; locking index creation on
large tables (PostgreSQL); and asymmetric down().`
- 対象:
  - `database/migrations/**/*.php`
- 重要度: major
- タグ: laravel / migration / database / postgresql / safety / upstream
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `loading-state`

- 名前: `Loading State Transition Review`
- 概要: `Detect missing loading/error/empty state handling that could trap users in spinners or disabled states.`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx}`
  - `app/**/*.{ts,tsx,js,jsx}`
  - `lib/**/*.{ts,tsx,js,jsx}`
  - `packages/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: ux / loading-state / error-handling / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings

### `logging-observability`

- 名前: `Logging and Observability Guard`
- 概要: `Ensure code changes keep logs/metrics/traces useful for debugging failures and regressions.`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- 重要度: minor
- タグ: observability / logging / reliability / midstream
- 依存関係: tracing / code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `logic-torturing`

- 名前: `Logic Torturing 論理検証`
- 概要: `変更に含まれる設計判断・実装選択の論理的整合性を徹底的に検証し、確証バイアスを排除して判断精度を高める`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `docs/**/*design*.md`
  - `docs/adr/**/*`
  - `pages/**/*design*.md`
  - `pages/**/*architecture*.md`
- 重要度: major
- タグ: adversarial / logic-torturing / decision-quality / critical-thinking / midstream / cognitive-bias
- 依存関係: code_search / repo_metadata
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile / commitMessage / adr

チェック項目の例:

- findings / questions

### `migration-safety`

- 名前: `Migration Safety Review (framework-agnostic)`
- 概要: `スキーマ/データ移行の安全性を framework 非依存で審査する。破壊的スキーマ変更・ロック誘発・backfill・ロールバック可逆性・expand-contract の段階適用を、prisma / typeorm
/ Rails / Django / Alembic / 生 SQL などに横断適用する。`
- 対象:
  - `**/migrations/**/*`
  - `**/migrate/**/*`
  - `prisma/schema.prisma`
  - `db/**/*.sql`
- 重要度: major
- タグ: migration / database / schema / safety / rollback / upstream
- 依存関係: code_search
- 適用条件: phase=upstream / midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `modern-web-a11y-interactive`

- 名前: `Modern Web Accessibility for Interactive UI`
- 概要: `キーボード操作 / focus 管理 / 動的コンテンツ更新 / ARIA role など、インタラクティブ UI のアクセシビリティ観点を suggestion で提示する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,html,css}`
  - `app/**/*.{ts,tsx,js,jsx,html,css}`
  - `components/**/*.{ts,tsx,js,jsx,html,css}`
  - `pages/**/*.{ts,tsx,js,jsx,html,css}`
  - `styles/**/*.css`
  - `public/**/*.html`
- 重要度: minor
- タグ: community / modern-web / accessibility / a11y / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `modern-web-browser-compat`

- 名前: `Modern Web Browser Compatibility + Baseline Awareness`
- 概要: `新しい Web API / CSS の利用追加に対し、Baseline 状態とブラウザ互換性 / progressive enhancement の有無を suggestion で示す。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,html,css}`
  - `app/**/*.{ts,tsx,js,jsx,html,css}`
  - `components/**/*.{ts,tsx,js,jsx,html,css}`
  - `pages/**/*.{ts,tsx,js,jsx,html,css}`
  - `styles/**/*.css`
  - `public/**/*.html`
- 重要度: minor
- タグ: community / modern-web / browser-compatibility / baseline / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `modern-web-performance`

- 名前: `Modern Web Performance + Core Web Vitals`
- 概要: `画像・スクリプト・スタイル・interaction 変更が LCP / INP / CLS / リソースコストに与える影響を suggestion で提示する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,html,css}`
  - `app/**/*.{ts,tsx,js,jsx,html,css}`
  - `components/**/*.{ts,tsx,js,jsx,html,css}`
  - `pages/**/*.{ts,tsx,js,jsx,html,css}`
  - `styles/**/*.css`
  - `public/**/*.html`
- 重要度: minor
- タグ: community / modern-web / performance / core-web-vitals / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `modern-web-semantic`

- 名前: `Modern Web Semantic + Platform-Native`
- 概要: `legacy workaround を避け、semantic HTML / Web Platform Native API / modern CSS の利用機会を提示する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,html,css}`
  - `app/**/*.{ts,tsx,js,jsx,html,css}`
  - `components/**/*.{ts,tsx,js,jsx,html,css}`
  - `pages/**/*.{ts,tsx,js,jsx,html,css}`
  - `styles/**/*.css`
  - `public/**/*.html`
- 重要度: minor
- タグ: community / modern-web / semantic-html / accessibility / ui / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `nextjs-app-router-boundary`

- 名前: `Next.js App Router Client/Server Boundary`
- 概要: `App Router の Server Component でクライアント専用APIを使っていないか確認する。`
- 対象:
  - `app/**/*.{ts,tsx,js,jsx}`
  - `components/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: community / nextjs / midstream / react
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `nextjs-server-action-security`

- 名前: `Next.js Server Action Security Review`
- 概要: `Checks Next.js Server Actions ('use server') for missing authentication/authorization before mutations;
missing input validation; and untrusted client-supplied IDs — treating each action as a public HTTP endpoint.`
- 対象:
  - `app/**/*.{ts,tsx}`
  - `**/actions.{ts,tsx}`
  - `**/*.action.{ts,tsx}`
- 重要度: critical
- タグ: nextjs / security / server-actions / authorization / midstream / community
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `normalization-consistency`

- 名前: `Normalization Consistency Review`
- 概要: `Detect inconsistencies in ID formatting; date/time display; monetary amounts; and enum/status labels compared
to existing patterns in the codebase.`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx}`
  - `app/**/*.{ts,tsx,js,jsx}`
  - `lib/**/*.{ts,tsx,js,jsx}`
  - `packages/**/*.{ts,tsx,js,jsx}`
- 重要度: minor
- タグ: consistency / normalization / formatting / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings

### `nullability-contract`

- 名前: `Nullability Contract Review`
- 概要: `Detect null/undefined/empty handling gaps where callers or consumers may receive unexpected nullish values.`
- 対象:
  - `src/**/*.{ts,tsx}`
  - `app/**/*.{ts,tsx}`
  - `lib/**/*.{ts,tsx}`
  - `packages/**/*.{ts,tsx}`
- 重要度: major
- タグ: nullability / contract / type-safety / defensive-programming / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `pr-description`

- 名前: `PR Description Review`
- 概要: `Review whether the PR description is review-ready and consistent with the diff (Why/What; impact; tests;
linked issues).`
- 対象:
  - `**/*`
- 重要度: minor
- タグ: pr-description / consistency / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / prDescription

チェック項目の例:

- findings / actions

### `react-router-action-contract`

- 名前: `React Router Action Contract Review`
- 概要: `Checks React Router v7 action conventions: validation errors returned as data with 4xx status (not thrown);
redirect on success; and 3-branch ErrorBoundary handling.`
- 対象:
  - `app/**/*.{ts,tsx,js,jsx}`
  - `src/routes/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: react-router / remix / actions / validation / frontend / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `react-router-loader-boundary`

- 名前: `React Router Loader Boundary Review`
- 概要: `Detects route data fetched in useEffect instead of loaders; server/client API leaks across loader boundaries;
and missing HydrateFallback in React Router v7 framework mode.`
- 対象:
  - `app/**/*.{ts,tsx,js,jsx}`
  - `src/routes/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: react-router / remix / data-loading / frontend / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `refactor-claim-audit`

- 名前: `Refactor-Claim Audit リファクタ完了主張の検証`
- 概要: `コミット/PR の「全部置換した」「-N%削減」等の完了主張を grep で反証できる残骸や best/typical/worst
試算で検証し、抽出・集約リファクタでは並列度(Promise.all)/fast-path/遅延評価の性能特性退行と、Map/Set 集約キーの cross-kind 衝突による検出漏れも監査する`
- 対象:
  - `**/*.{ts,tsx,js,jsx,mjs}`
  - `**/*.md`
  - `**/*.{yaml,yml,json}`
- 重要度: major
- タグ: adversarial / refactor-claim / claim-vs-actual / verification / midstream / cognitive-bias / performance-regression / key-collision
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `review-automation-boundary`

- 名前: `Review Automation Boundary Guard`
- 概要: `Detect review findings that belong in CI/lint/formatter rather than human review.`
- 対象:
  - `**/*`
- 重要度: minor
- タグ: review-process / automation / ci / meta-review / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions / metrics

### `review-comment-triage`

- 名前: `Review Comment Triage (No-Code-Fix Mode)`
- 概要: `レビューコメントの重要度ラベリングと対応方針・返信案を整理する。AI はコード修正やパッチ提案を行わない。`
- 対象:
  - `**/*`
- 重要度: info
- タグ: review / process / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / summary / questions

### `review-criteria-integrity`

- 名前: `Review Criteria Integrity レビュー基準・品質ゲートの自己弱体化検出`
- 概要: `差分が「その差分自身を審査するレビュー基準・品質ゲート」を弱めていないかを diff-time で検出する。Check 1 レビュールールの削除・弱体化（.river/rules.md /
.river/rules.d/*）、Check 2 実行時コンフィグの閾値・ゲート緩和（.river-review.{json; yaml; yml} の review.severity 引き下げ / exclude
拡大 / memory.suppressionEnabled 無効化 / selection.skills.exclude 追加）、Check 3 suppression entry の新規追加、Check 4
lint・静的解析設定からのルール削除や無効化、Check 5 branch protection・required check の緩和、の 5 Check を対象とし、これらが機能変更と同一 PR
に混在し、かつ意図の宣言が無い場合に指摘する。report-only。workflow の permissions / action pin は gha-workflow-security、既存 suppression
entry の使い分けは suppression-feedback、設定ファイルの一般的妥当性は config-json、.only / .skip / @ts-ignore / @ts-nocheck は
heuristic-review.mjs の決定論検出器、リファクタと機能追加の混在は behavior-structure-separation へ委譲する`
- 対象:
  - `.river/rules.md`
  - `.river/rules.d/**/*.md`
  - `.river-review.{json,yaml,yml}`
  - `.river/**/*.{json,yaml,yml}`
  - `**/.eslintrc*`
  - `eslint.config.{js,mjs,cjs,ts}`
  - `.textlintrc*`
  - `**/*textlintrc*`
  - `**/.textlintignore`
  - `.markdownlint*`
  - `**/tsconfig*.json`
  - `.github/workflows/**/*.{yml,yaml}`
  - `.github/**/*.{yml,yaml,json}`
- 重要度: major
- タグ: review-criteria-integrity / review-definition / quality-gate / rules-provenance / self-weakening / suppression / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / prDescription / fullFile

チェック項目の例:

- findings / questions

### `review-policy-standard-midstream`

- 名前: `Standard Review Policy for Midstream`
- 概要: `Applies standard AI review policy guidelines for midstream (implementation) phase reviews.`
- 対象:
  - `src/**/*.ts`
  - `src/**/*.js`
  - `src/**/*.py`
  - `src/**/*.go`
  - `src/**/*.java`
  - `src/**/*.rb`
  - `lib/**/*`
  - `app/**/*`
- 重要度: info
- タグ: policy / midstream / implementation / code-quality
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / summary / actions

### `review-team`

- 名前: `review-team`
- 概要: `6つの専門レビュアーロールを並列実行し、consensusLevel（複数ロールの合意度）と Tech Lead レポート（top3指摘・blindSpots・consensusSummary）で結果を統合する
マルチエージェントレビュー entry skill。 Parallel multi-role review with consensus scoring (consensusLevel) and Tech Lead
report. Use when a major release needs exhaustive multi-angle review; or when a single-perspective review is
not enough and you want confidence that no reviewer angle was missed（重要リリース前の網羅レビュー・多視点の確証が 欲しいとき）。`
- 対象:
  - `**/*`
- 重要度: major
- タグ: entry / routing / multi-agent / parallel / consensus / team / orchestration
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review`

- 名前: `river-review`
- 概要: `River Review のメインエントリポイント。 レビュー依頼の intent classification → 専門 skill 選択 → 実行 → finding verification → feedback
classification → fixture / reference / suppression への還元までを束ねる improvement-loop orchestrator。`
- 対象:
  - `**/*`
- 重要度: minor
- タグ: entry / routing / orchestrator / improvement-loop
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review-code`

- 名前: `river-review-code`
- 概要: `一般コード品質のレビューエージェント。デフォルトのフォールバック先。 可読性、保守性、型安全性、ロギング等の個別スキルへルーティングする。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `runners/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- 重要度: minor
- タグ: code-quality / default / entry / routing
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `river-review-docs`

- 名前: `river-review-docs`
- 概要: `ドキュメント観点のレビューエージェント。 README / docs / AGENTS.md と実装の整合性、API ドキュメントとコードの対応、 usage
や例の正確性、i18n（JA/EN）整合性、用語統一を検証する。`
- 対象:
  - `**/*.md`
  - `**/*.mdx`
  - `README*`
  - `AGENTS.md`
  - `docs/**/*`
  - `pages/**/*`
- 重要度: minor
- タグ: docs / documentation / i18n
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `river-review-frontend`

- 名前: `river-review-frontend`
- 概要: `フロントエンド観点のレビューエージェント。 アクセシビリティ、デザインシステム準拠、Tailwind クラス衛生、UI 状態設計、 Next.js / React Router
のフレームワーク境界を個別スキルへルーティングする。`
- 対象:
  - `src/**/*.{tsx,jsx,vue,svelte}`
  - `src/routes/**/*.{ts,tsx,js,jsx}`
  - `app/**/*.{ts,tsx,js,jsx}`
  - `components/**/*.{ts,tsx,js,jsx}`
  - `**/*.{css,scss,less}`
  - `pages/**/*.{ts,tsx,js,jsx}`
  - `lib/**/*.{ts,tsx,js,jsx}`
  - `packages/**/*.{ts,tsx,js,jsx}`
- 重要度: minor
- タグ: frontend / ui / accessibility / design-system / entry / routing
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `river-review-performance`

- 名前: `river-review-performance`
- 概要: `パフォーマンス観点のレビューエージェント。 N+1クエリ、メモリ効率、キャッシュ戦略、可観測性の観点でコード変更を評価する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs,html,css}`
  - `app/**/*.{ts,tsx,js,jsx,mjs,cjs,html,css}`
  - `components/**/*.{ts,tsx,js,jsx,html,css}`
  - `pages/**/*.{ts,tsx,js,jsx,html,css}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `styles/**/*.css`
  - `public/**/*.html`
  - `**/*.sql`
- 重要度: major
- タグ: performance / optimization / entry / routing
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `river-review-security`

- 名前: `river-review-security`
- 概要: `セキュリティ観点の通常レビューエージェント。 基本的なセキュリティチェック、認証・認可設計、プライバシー設計の個別スキルへルーティングする。 repository / subsystem の明示的な security
audit は river-review-security-audit へ委譲する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `**/*.env*`
  - `**/auth/**/*`
  - `**/middleware/**/*`
- 重要度: critical
- タグ: security / entry / routing
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `river-review-security-audit`

- 名前: `river-review-security-audit`
- 概要: `Repository または subsystem を対象に、source-only で明示的なセキュリティ監査を行う entry skill。 通常の PR
セキュリティレビューとは分離し、reconnaissance、scope 固定、既存 security skill への委譲、 evidence と unresolved hypothesis
の記録を行う。target-controlled code は実行しない。`
- 対象:
  - `**/*`
- 重要度: critical
- タグ: security / audit / entry / routing / source-only
- 依存関係: none
- 適用条件: phase=upstream / midstream, inputContext=diff / fullFile

チェック項目の例:

- summary / findings / actions / questions

### `secret-credential-scan`

- 名前: `Secret / Credential Scan 機密情報の混入検出`
- 概要: `差分に追加された API キー・トークン・credential・秘密鍵・.env 値・個人ローカルパスなどの機密情報を、言語・ファイル種別に依存せず検出する。決定論的に判定できる範囲は CI（gitleaks
等）へ移譲しつつ、レビューで取りこぼしを補足する`
- 対象:
  - `**/*`
- 重要度: major
- タグ: secret / credential / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `security-basic`

- 名前: `Baseline Security Checks`
- 概要: `Check common security risks in application code (SQLi; XSS; secrets).`
- 対象:
  - `**/{api,routes,db,ui,components,auth,security,config}/**/*.{ts,tsx,js,jsx}`
- 重要度: major
- タグ: security / midstream / web
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `self-contradiction`

- 名前: `Self-Contradiction Detector 自己矛盾検出`
- 概要: `同一ファイル/隣接ファイル内で「規則Xを守れ」と宣言した直後にXを破っている、宣言と実装の乖離を検出する`
- 対象:
  - `**/*.md`
  - `**/*.{ts,tsx,js,jsx,mjs}`
  - `**/SKILL.md`
  - `**/AGENTS.md`
- 重要度: major
- タグ: adversarial / self-contradiction / claim-vs-actual / consistency / midstream / cognitive-bias
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `supabase-rls-policy`

- 名前: `Supabase RLS Policy Review`
- 概要: `Detects tables created without ROW LEVEL SECURITY enabled; over-permissive policies (USING (true) / WITH CHECK
(true) without owner conditions); and service_role key exposure in client code.`
- 対象:
  - `**/*.sql`
  - `**/migrations/**/*.sql`
  - `**/supabase/**/*.{ts,js,sql}`
- 重要度: critical
- タグ: supabase / security / baas / rls / authorization / midstream / community
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `suppression-feedback`

- 名前: `Suppression Feedback Workflow`
- 概要: `Riverbed Memory の suppression entry を活用するときの判断基準と CLI 操作を案内する。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- 重要度: minor
- タグ: suppression / process / midstream / riverbed-memory
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / commitMessage

チェック項目の例:

- findings / actions

### `tailwind-class-hygiene`

- 名前: `Tailwind CSS Class Hygiene Review`
- 概要: `Checks Tailwind utility class hygiene at the syntax level: arbitrary-value overuse that bypasses the theme
scale; conflicting/duplicate utilities on one element; and hardcoded arbitrary colors that should use design
tokens.`
- 対象:
  - `**/*.{tsx,jsx,html,vue,svelte,astro}`
- 重要度: minor
- タグ: tailwind / css / frontend / midstream / community
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `type-driven-design`

- 名前: `Type-Driven Design Guard`
- 概要: `Detect primitive obsession and missing domain/brand types; check that state is modeled via discriminated
unions.`
- 対象:
  - `src/**/*.{ts,tsx}`
  - `app/**/*.{ts,tsx}`
  - `lib/**/*.{ts,tsx}`
  - `packages/**/*.{ts,tsx}`
- 重要度: major
- タグ: typescript / type-driven-design / domain-modeling / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `typescript-nullcheck`

- 名前: `TypeScript Null Safety Guardrails`
- 概要: `Enforce null/undefined safety for changed TypeScript code and suggest safer patterns.`
- 対象:
  - `src/**/*.{ts,tsx}`
  - `app/**/*.{ts,tsx}`
  - `lib/**/*.{ts,tsx}`
  - `packages/**/*.{ts,tsx}`
- 重要度: major
- タグ: typescript / type-safety / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `typescript-strict`

- 名前: `TypeScript Strictness Guard`
- 概要: `Enforce TypeScript strictness by reducing any/unsafe assertions and ensuring null handling.`
- 対象:
  - `src/**/*.{ts,tsx}`
  - `app/**/*.{ts,tsx}`
  - `lib/**/*.{ts,tsx}`
  - `packages/**/*.{ts,tsx}`
- 重要度: major
- タグ: typescript / type-safety / midstream
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

### `ubiquitous-language-naming`

- 名前: `Ubiquitous Language Naming Consistency`
- 概要: `Detects domain terms drifting between code identifiers and the established ubiquitous language (same concept
under different names; or different concepts sharing a name).`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `app/**/*.{ts,tsx,js,jsx,mjs}`
  - `lib/**/*.{ts,tsx,js,jsx,mjs}`
- 重要度: minor
- タグ: ddd / domain / naming / ubiquitous-language / midstream
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / questions

### `unknown-coverage-review`

- 名前: `unknown-coverage-review`
- 概要: `完成した差分・PR・検証証拠に残る Unknown（未確認の前提・調査されていない影響・ 不足している証拠）を横断合成する evidence-sufficiency のメタ観点。個別 defect の 検出は既存
skill へ委譲し、本 skill は「そのリスク種別を調査した証拠が残っているか」 の meta 評価のみを行う。finding verification 後の合成ステップとして report-only で
実行し、残存 Unknown を output-format §4「Unverified / Residual Risk」の Unknown Coverage 下位構造へ、判定を既存 verdict
語彙（GO/ESCALATE/NO_GO）へ写像する。 新しい語彙・schema は作らない。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `**/migrations/**`
  - `**/*.sql`
  - `**/*.{yaml,yml,json,toml}`
- 重要度: major
- タグ: unknown-coverage / evidence-sufficiency / grill-for-unknowns / unknown-unknowns / map-territory / meta / synthesis
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=diff / fullFile / reviewSelf / reviewExternal

チェック項目の例:

- findings / questions / actions

### `vitest-mock-isolation`

- 名前: `Vitest Mock Isolation Review`
- 概要: `Detects Vitest test-isolation hazards: unrestored vi.spyOn/vi.mock without afterEach cleanup or restoreMocks
config; un-awaited resolves/rejects assertions; and shared mutable module state across tests.`
- 対象:
  - `**/*.{test,spec}.{ts,tsx,js,jsx}`
  - `**/*.test.*`
- 重要度: major
- タグ: vitest / testing / mocks / frontend / midstream / community
- 依存関係: none
- 適用条件: phase=midstream, inputContext=diff

チェック項目の例:

- findings / actions

### `war-game`

- 名前: `War Game 敵対的シミュレーション`
- 概要: `攻撃者・競合・悪意あるユーザーの視点で変更を分析し、防御の盲点と悪用シナリオを可視化する`
- 対象:
  - `**/{api,routes,db,auth,security,config,middleware,handlers}/**/*.{ts,tsx,js,jsx,mjs}`
  - `**/migrations/**/*`
  - `**/*.env.example`
  - `**/config/**/*.{yaml,yml,json}`
- 重要度: major
- タグ: adversarial / war-game / security / attack-simulation / midstream / cognitive-bias
- 依存関係: code_search
- 適用条件: phase=midstream, inputContext=diff / fullFile

チェック項目の例:

- findings / actions

## downstream

### `coverage-gap`

- 名前: `Coverage and Failure Path Gaps`
- 概要: `Find missing tests for critical paths; edge cases; and failure handling in changed code.`
- 対象:
  - `src/**/*`
  - `lib/**/*`
  - `**/*.test.*`
  - `**/*.spec.*`
- 重要度: major
- タグ: tests / coverage / reliability / downstream
- 依存関係: test_runner / coverage_report
- 適用条件: phase=downstream, inputContext=diff / tests

チェック項目の例:

- tests / findings / actions / summary

### `flaky-test`

- 名前: `Flaky Test Risk Check`
- 概要: `Detects patterns that make tests flaky and proposes stabilization steps.`
- 対象:
  - `**/*.test.ts`
  - `**/*.test.js`
  - `**/*.spec.ts`
  - `**/*.spec.js`
  - `tests/**/*.ts`
  - `tests/**/*.js`
- 重要度: major
- タグ: tests / reliability / flakiness / downstream
- 依存関係: test_runner
- 適用条件: phase=downstream, inputContext=diff

チェック項目の例:

- findings / actions / summary

### `gha-workflow-security`

- 名前: `GitHub Actions Workflow Security Review`
- 概要: `Reviews GitHub Actions workflow diffs for script injection of untrusted input; pull_request_target with
untrusted checkout; over-broad GITHUB_TOKEN permissions; and unpinned third-party actions.`
- 対象:
  - `.github/workflows/**/*.{yml,yaml}`
- 重要度: major
- タグ: github-actions / security / ci / supply-chain / downstream
- 依存関係: none
- 適用条件: phase=midstream / downstream, inputContext=diff

チェック項目の例:

- findings / questions

### `review-policy-standard-downstream`

- 名前: `Standard Review Policy for Downstream`
- 概要: `Applies standard AI review policy guidelines for downstream (test/QA) phase reviews.`
- 対象:
  - `test/**/*`
  - `tests/**/*`
  - `**/*.test.ts`
  - `**/*.test.js`
  - `**/*.test.py`
  - `**/*.spec.ts`
  - `**/*.spec.js`
  - `**/__tests__/**/*`
- 重要度: info
- タグ: policy / downstream / testing / qa
- 依存関係: test_runner / coverage_report / code_search
- 適用条件: phase=downstream, inputContext=diff / tests

チェック項目の例:

- findings / summary / tests

### `review-team`

- 名前: `review-team`
- 概要: `6つの専門レビュアーロールを並列実行し、consensusLevel（複数ロールの合意度）と Tech Lead レポート（top3指摘・blindSpots・consensusSummary）で結果を統合する
マルチエージェントレビュー entry skill。 Parallel multi-role review with consensus scoring (consensusLevel) and Tech Lead
report. Use when a major release needs exhaustive multi-angle review; or when a single-perspective review is
not enough and you want confidence that no reviewer angle was missed（重要リリース前の網羅レビュー・多視点の確証が 欲しいとき）。`
- 対象:
  - `**/*`
- 重要度: major
- タグ: entry / routing / multi-agent / parallel / consensus / team / orchestration
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review`

- 名前: `river-review`
- 概要: `River Review のメインエントリポイント。 レビュー依頼の intent classification → 専門 skill 選択 → 実行 → finding verification → feedback
classification → fixture / reference / suppression への還元までを束ねる improvement-loop orchestrator。`
- 対象:
  - `**/*`
- 重要度: minor
- タグ: entry / routing / orchestrator / improvement-loop
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=none

チェック項目の例:

- findings

### `river-review-testing`

- 名前: `river-review-testing`
- 概要: `テスト観点のレビューエージェント。 テスト網羅性、命名規則、フレーキーテスト、カバレッジギャップの個別スキルへルーティングする。`
- 対象:
  - `**/*.test.{ts,tsx,js,jsx}`
  - `**/*.spec.{ts,tsx,js,jsx}`
  - `tests/**/*`
  - `test/**/*`
  - `__tests__/**/*`
- 重要度: minor
- タグ: testing / coverage / entry / routing
- 依存関係: none
- 適用条件: phase=downstream, inputContext=diff / fullFile / tests

チェック項目の例:

- findings / actions

### `test-assertion-effectiveness`

- 名前: `Test Assertion Effectiveness 常に PASS するテストの検出`
- 概要: `テストは存在するがアサーションが実質何も検証しておらず、実装が壊れても落ちない（常に PASS する）構造を diff-time で検出する。Check 1 missing
assertion（テスト本体にアサーションが無い）、Check 2 tautological assertion（定数同士・入力自身・mock の戻り値自身を assert し SUT に依存しない）、Check 3
nonexistent expected literal（assertDontSee / assertNotContains 等の期待文字列が対象ファイルに実在しない）、Check 4 stale expected
value（同一 diff で対象の出力が変わったのに期待値が据え置き）、Check 5 unscoped expectation（汎用的な属性・クラスを応答全体に対して assert
し対象要素にスコープされていない）、Check 6 swallowed failure（例外の握り潰しや到達しない位置のアサーションで判定が成立しない）、の 6 Check を対象とする
report-only。テストの有無は test-existence、未テスト経路の量は coverage-gap、非決定性は flaky-test、命名は test-naming、JS/TS の un-awaited
resolves / rejects は vitest-mock-isolation、tdd-ledger artifact ベースの RED/GREEN 検証は plangate-tdd-evidence、.only
/ .skip / xit / @ts-ignore と空の catch は heuristic-review.mjs の決定論検出器へ委譲する`
- 対象:
  - `**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}`
  - `**/*Test.php`
  - `**/test_*.py`
  - `**/*_test.{py,go,rb}`
  - `tests/**/*`
  - `test/**/*`
  - `__tests__/**/*`
- 重要度: major
- タグ: tests / assertion / assertion-effectiveness / vacuous-test / always-passing / test-quality / downstream
- 依存関係: code_search
- 適用条件: phase=downstream, inputContext=diff / fullFile

チェック項目の例:

- findings / questions

### `test-existence`

- 名前: `Test Presence for Changed Code`
- 概要: `Check whether changed code paths have corresponding tests and suggest minimal coverage.`
- 対象:
  - `src/**/*`
  - `lib/**/*`
  - `**/*.test.*`
  - `**/*.spec.*`
- 重要度: major
- タグ: tests / coverage / downstream
- 依存関係: test_runner / coverage_report
- 適用条件: phase=downstream, inputContext=diff / tests

チェック項目の例:

- tests / findings / actions

### `test-naming`

- 名前: `Test Naming and Structure`
- 概要: `Ensure tests use clear naming and cover edge cases with proper describe/it structure.`
- 対象:
  - `**/*.test.ts`
  - `**/*.spec.ts`
- 重要度: minor
- タグ: tests / naming / downstream
- 依存関係: none
- 適用条件: phase=downstream, inputContext=tests / diff

チェック項目の例:

- tests / findings / summary

### `test-plan-review`

- 名前: `テスト観点レビュー（差分ドリブン）`
- 概要: `変更差分から重要なテスト観点と欠落を洗い出し、優先度付きでテストケース案を提示する`
- 対象:
  - `src/**/*`
  - `lib/**/*`
  - `tests/**/*`
  - `**/*.test.*`
  - `**/*.spec.*`
- 重要度: major
- タグ: tests / coverage / downstream
- 依存関係: test_runner / code_search
- 適用条件: phase=downstream, inputContext=diff / tests

チェック項目の例:

- tests / findings / questions / actions

### `unknown-coverage-review`

- 名前: `unknown-coverage-review`
- 概要: `完成した差分・PR・検証証拠に残る Unknown（未確認の前提・調査されていない影響・ 不足している証拠）を横断合成する evidence-sufficiency のメタ観点。個別 defect の 検出は既存
skill へ委譲し、本 skill は「そのリスク種別を調査した証拠が残っているか」 の meta 評価のみを行う。finding verification 後の合成ステップとして report-only で
実行し、残存 Unknown を output-format §4「Unverified / Residual Risk」の Unknown Coverage 下位構造へ、判定を既存 verdict
語彙（GO/ESCALATE/NO_GO）へ写像する。 新しい語彙・schema は作らない。`
- 対象:
  - `src/**/*.{ts,tsx,js,jsx,mjs}`
  - `runners/**/*.{ts,js,mjs}`
  - `scripts/**/*.mjs`
  - `**/migrations/**`
  - `**/*.sql`
  - `**/*.{yaml,yml,json,toml}`
- 重要度: major
- タグ: unknown-coverage / evidence-sufficiency / grill-for-unknowns / unknown-unknowns / map-territory / meta / synthesis
- 依存関係: none
- 適用条件: phase=upstream / midstream / downstream, inputContext=diff / fullFile / reviewSelf / reviewExternal

チェック項目の例:

- findings / questions / actions
