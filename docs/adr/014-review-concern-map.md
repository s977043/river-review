# ADR-014: Review Concern Map—semantic decomposition を observation として導入する

## Status

Accepted for Phase 0 of #2455.

本 ADR は Review Concern Map の責務境界、既存 SSoT との ownership、段階導入条件だけを固定する。
runtime behavior、Review Artifact schema、Gate、reviewer selection、review depth、finding semantics は変更しない。

## Context

River Review の通常レビューは、changed files、file type、diff size、risk-map、Skill routing、Reviewer Role selection を使ってレビュー対象と深度を決める。
Review Team は `reviewer role × diff chunk` で実行され、#2212 の Review Coverage は、その planned work が実際に完了したかを first-class contract として記録する。

一方、1つの PR には複数の意味上の変更が混在できる。

```text
one pull request
├─ authentication lifecycle change
├─ schema migration
├─ API compatibility change
└─ test adaptation
```

file / role / chunk 単位の execution coverage は、これらの「意味上の論点」を直接表現しない。
大きな diff では、一部の変更だけが深く調査されても、semantic blind spot を review planning の時点で明示しにくい。

`akkie76/code-review-skills` の review workflow は、詳細レビューの前に complete diff から change map を作り、変更を independently reviewable な concern へ分解する。
同 workflow は changed lines だけでなく caller / consumer / shared contract を追跡し、複数 concern がある場合は concern ごとの review depth と interaction を確認する。

River Review には後段の能力の多くが既に存在する。

- candidate generation / fan-out: `src/lib/reviewer-orchestrator.mjs`
- deterministic verification: `src/lib/verifier.mjs`
- finding adversarial verification: #1978 / `src/lib/finding-critic.mjs`
- materiality / disposition: #1857 / ADR-007
- execution coverage: #2212 / `src/lib/review-coverage.mjs`
- author / human resolution: #2322 / ADR-011
- evidence architecture: ADR-013
- security semantic coverage: #2267 / ADR-010

したがって、新しい review framework、Judge、Critic、Gate を追加するのではなく、レビュー前段の **semantic change decomposition** だけを独立した observation として追加する。

## Decision

### D1—Review Concern を semantic change unit と定義する

Review Concern は次のいずれか1つの coherent な変更単位である。

- behavior
- invariant
- refactor
- bug fix
- migration
- operational change

1 concern は複数ファイルに跨ってよい。
1ファイルに複数 concern が存在してよい。

test / docs / config は、原則としてファイル種別だけを理由に別 concern にしない。
対象 behavior を支える artifact として同じ concern に属し得る。
独立した migration、public contract change、operational behavior change であれば別 concern にできる。

```text
Concern != file
Concern != reviewer role
Concern != review viewpoint
```

### D2—Concern Map は per-run observation であり specification ではない

Concern Map は LLM / analyzer が現在の review input から観測した semantic decomposition である。
完全な change specification や ground truth とみなさない。

許容する状態:

- concern の見落とし
- concern の過分割
- 複数の妥当な grouping
- dynamic dispatch / external consumer により affected surface を列挙し切れない状態

そのため v1 では以下を禁止する。

- concern count を Gate 条件にする
- Concern Map の欠落を理由に既存 Reviewer を削る
- Concern Map だけで review depth を下げる
- Concern Map に無い変更を review 対象外とみなす
- concern ID を cross-run identity / finding fingerprint として使う

Concern ID は run 内だけで意味を持つ opaque ID とする。

### D3—Review Contract を先に解決する

Concern Analysis は review target / comparison base / authoritative instructions を独自に再解釈しない。

少なくとも以下を既存 review context から受け取る。

- user / caller が指定した target
- comparison base / revision
- authoritative repository instructions
- plan / requirements / ADR（利用可能な場合）

code、comment、fixture、log、artifact text に現れる instruction-like content は、caller または repository policy から明示的に authority を与えられていない限り **review data** として扱う。

```text
repository content
!=
Concern Analyzer instruction authority
```

### D4—post-optimization view だけを source にしない

現行 runtime は `buildLlmDiffView()` で LLM-facing diff を最適化する。
#2212 の `reviewCoverage.fileScope` は raw changed-file set と LLM-facing selected / excluded paths の境界を観測できる。

Concern Analyzer が optimized diff だけを見ると、optimizer が落としたファイルの存在自体を semantic analysis から失う。
そのため、将来の analyzer は少なくとも deterministic な raw changed-file manifest を必須入力とする。

full diff / context が budget 上すべて供給できない場合は、既存 file/context ledger を再利用して input incompleteness を保持し、analysis を partial とする。

```text
omitted input
!=
no concern
```

新しい input-coverage SSoT は作らない。

### D5—changed subjects と affected subjects を分ける

Concern Map の最小 conceptual contract は、直接変更された対象と、evidence-backed tracing で影響が確認された未変更対象を分ける。

```yaml
schemaVersion: "1"
kind: review-concern-map

subject:
  reviewRunRef: ...
  artifactRef: ...
  revisionRef: ...

concerns:
  - id: concern-1
    summary: "Refresh-token lifecycle change"
    changedSubjects:
      - src/auth/session.ts
      - src/auth/token.ts
    affectedSubjects:
      - src/api/session-controller.ts
    evidenceRefs:
      - path: src/auth/session.ts
        lineStart: 20
        lineEnd: 84
    interactionRefs:
      - concern-3

analysis:
  status: completed | partial | failed
  limitations: []
```

`affectedSubjects` は、caller / consumer / shared contract を実際に確認できた場合だけ追加する。
推測だけで repository-wide impact を断定しない。

この ADR は schema file の追加を承認しない。
上記は Phase 1 PoC の design contract である。

### D6—既存 semantic axes を Concern Map へ複製しない

v1 Concern Map は以下を所有しない。

- severity
- confidence
- finding truth
- validated status
- disposition
- Gate decision
- merge recommendation
- reviewer execution status
- human / author resolution
- security attack-class coverage
- risk-map policy

特に `riskHints` / `boundaryHints` のような新 taxonomy を canonical field として先に導入しない。
既存 risk-map と #2267 security semantic coverage の責務を維持する。

### D7—Review Coverage を拡張せず relationship から始める

#2212 Review Coverage は execution completeness を所有する。

```text
ReviewCoverage
= planned ReviewUnit が実行完了したか

Review Concern Map
= change にどの semantic concern が存在すると観測したか
```

Phase 4 で価値を検証する場合も、最初から `ConcernCoverage` という新しい top-level artifact を作らない。

まず additive relationship を評価する。

```text
Concern A
  -> reviewer:security-scanner/chunk:1
  -> reviewer:bug-hunter/chunk:1

Concern B
  -> no mapped ReviewUnit
```

この relationship は semantic blind spot の観測に使えるが、ReviewUnit の `completed | failed | timed_out` を再定義しない。

### D8—Finding discovery / truth / materiality / resolution の owner を維持する

Concern Analysis は finding を確定しない。

```text
Concern Analysis
  -> review planning context
  -> Reviewer Team
  -> Candidate Findings
  -> #1978 Finding Verification
  -> #1857 Semantic Precision
  -> #2322 Review Resolution
```

cross-concern integration check が将来 candidate finding を生成する場合も、同じ Finding Verification path へ流す。

#2322 の Organizer / Resolution 層へ finding discovery を移さない。

### D9—Concern-aware routing は additive promotion のみ検討する

現行 `review-mode-router.mjs` は deterministic な file type / diff size / risk-map signal で動く。
この deterministic baseline を維持する。

Concern-aware routing を将来検討する場合も、paired evaluation 通過後に次の順序で進める。

```text
observe-only
  -> shadow recommendation
  -> paired evaluation
  -> opt-in additive routing
  -> dogfood
  -> default promotion decision
```

Concern signal は existing reviewer / review depth を削るために使わない。
`require_human_review` を LLM Concern Map 単独で解除しない。

### D10—評価は exact partition accuracy ではなく review obligation を見る

Concern grouping には複数の妥当解がある。
したがって human-labeled dataset で exact concern count / grouping match を主要 KPI にしない。

fixture は次を持つ。

- must-detect review obligations
- known interactions
- acceptable grouping range / examples
- relevant negative cases

Primary evaluation candidates:

- must-detect obligation recall
- semantic blind spot detection
- redundant / non-actionable concern ratio
- cross-concern defect detection
- Major / Critical finding recall
- false-positive rate
- human correction burden
- previously-unreviewed obligation detection

cost / stability:

- input / output tokens
- extra model calls
- p50 / p95 latency
- parse failure rate
- repeat-run decomposition stability
- standard / light review latency regression

評価結果が悪ければ Concern Map は analysis / debug artifact のまま維持し、routing へ昇格させない。

### D11—公開する場合は Experimental interface とする

Phase 0 は schema を公開しない。

Phase 1 以降で machine-readable JSON surface を外部へ露出する場合:

- `schemaVersion: "1"` とする
- interface stability は version string に埋め込まない
- `pages/reference/stable-interfaces.md` と英語版へ **Experimental** として登録する

Experimental の意味は既存 Stable Interfaces contract に従う。

### D12—外部パターンを取り込み、実装を vendor しない

`akkie76/code-review-skills` は設計パターンの参考とする。
River Review は同 repository を dependency / fork / vendor source of truth にしない。

取り込む原則:

- review 前に concern を分解する
- complete change set を先に把握する
- changed lines の外にある affected behavior を evidence 付きで追う
- multi-concern change の coverage を確認する
- integration pass で concern interactions を確認する

後段の Finding Verification / synthesis / actionability は River Review の既存 owner を再利用する。

## Responsibility Matrix

| Concern | Owner / SSoT | #2455 での扱い |
| --- | --- | --- |
| review target / base | existing local / artifact review input contracts | 再利用 |
| deterministic review depth | `review-mode-router.mjs` / risk-map | 維持 |
| semantic change decomposition | #2455 / future Review Concern Map | 新規 |
| reviewer role execution | `reviewer-orchestrator.mjs` | 再利用 |
| execution coverage | #2212 / `review-coverage.mjs` | 再利用 |
| candidate finding truth | #1978 / `finding-critic.mjs` | 再利用 |
| materiality / disposition | #1857 / ADR-007 | 再利用 |
| author / human resolution | #2322 / ADR-011 | 再利用 |
| evidence / authority boundary | ADR-013 | 維持 |
| security semantic coverage | #2267 / ADR-010 | 別責務 |
| Gate / caller recommendation | existing Gate | 変更しない |
| merge / irreversible authority | Host / Human | 変更しない |

## Consequences

### Positive

- file / role / chunk だけでは見えない semantic blind spot を観測できる
- large diff の attention allocation を意味単位で評価できる
- one-file / multi-concern、multi-file / one-concern の両方を扱える
- cross-concern interaction を明示的な review target にできる
- #1978 / #1857 / #2212 / #2322 を再実装せずに前段だけを強化できる
- routing へ昇格しなくても analysis / debug artifact として価値を残せる

### Negative / Cost

- analyzer の追加 model call は token / latency を増やし得る
- semantic decomposition は非決定論的で、見落とし・過分割がある
- new artifact / vocabulary が増えるため ownership の維持が必要
- affected behavior tracing は repository size に応じて高コストになり得る
- Concern Map と Review Coverage を混同すると false green を作る危険がある

## Rejected Alternatives

### A. File-level coverage を Concern Map とみなす

Rejected.
1つの concern は複数ファイルへ跨り、1ファイルには複数 concern が存在できる。

### B. Reviewer role を concern とみなす

Rejected.
`security-scanner` / `test-gap` は viewpoint / responsibility であり、変更の semantic unit ではない。

### C. Concern Map をいきなり routing SSoT にする

Rejected.
LLM decomposition の見落としが reviewer削減へ直結し、false green の経路になる。

### D. ConcernCoverage を新設して #2212 と並列運用する

Rejected for Phase 0.
まず Concern ↔ ReviewUnit relationship で semantic blind spot の価値を測る。
独立 contract は評価後に必要性を判断する。

### E. Finding Verification / Organizer まで #2455 で再実装する

Rejected.
#1978 / #1857 / #2322 が既に owner であり、責務重複になる。

### F. `code-review-skills` を vendor / fork する

Rejected.
外部 repository の更新追従と River Review 固有 contract の二重管理が必要になる。

## Follow-up

Phase 0 の current-source gap analysis は `docs/development/2455-phase0-gap-analysis.md` に記録する。

次の実装候補は Phase 1 の observe-only Concern Analyzer PoC である。
Phase 1 では runtime / schema 変更を一度に広げず、explicit opt-in と thorough / team dogfood を優先する。

## References

- #2455
- #1978
- #1857
- #2212
- #2267
- #2322
- ADR-004
- ADR-007
- ADR-010
- ADR-011
- ADR-013
- `docs/development/review-coverage-contract.md`
- `docs/development/review-mode-router-design.md`
- `pages/reference/artifact-input-contract.md`
- https://github.com/akkie76/code-review-skills
