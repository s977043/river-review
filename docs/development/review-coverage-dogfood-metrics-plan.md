# Review Coverage dogfood metrics plan

Issue: #2212

## Goal

Review Coverage Phase 1 の observe-only telemetry を、既存の saved run / dashboard 経路で集計できるようにする。

Gate / decision / auto-approve / Human Review の挙動は変更しない。

## Scope

`src/lib/result-store.mjs` の既存 `computeDashboard()` を集計の SSoT とする。

saved run に保存済みの `reviewCoverage` から、次を集計する。

- Review Coverage を持つ run 数
- coverage status distribution (`complete` / `partial` / `not_executed`)
- required unit completion rate
- required unit failure / timeout count and rate
- `0 findings + partial` run 数

`formatDashboard()` では Review Coverage を持つ run が存在する場合だけ observe-only セクションを表示する。

## Metric definitions

### Observed runs

`reviewCoverage` object を持つ run を対象とする。coverage が存在しない legacy / single-reviewer run を incomplete とみなさない。

### Required unit completion rate

```text
sum(completedRequiredUnits) / sum(requiredUnits)
```

分母が 0 の場合は `N/A` とする。

### Required unit failure / timeout rate

`units[]` のうち `required === true` かつ `status in {failed, timed_out}` の unit 数を `sum(requiredUnits)` で割る。

### Partial review rate

```text
status == partial の observed run 数 / observed run 数
```

### Zero findings + partial

`findings.length === 0` かつ `reviewCoverage.status === partial` の run 数。

## Explicit non-goals

- Gate integration
- new reasonCode
- auto escalation
- file-level `covered`
- file coverage percentage
- ContextCoverage / SecurityAuditCoverage との統合
- new top-level CLI command
- new persistence format

`fileScope.selected / excluded` は LLM-facing selection scope であり execution completion ではないため、file coverage rate の分母・分子には使わない。

## Backward compatibility

- saved run format は変更しない
- `computeDashboard()` の既存 metric は維持する
- Review Coverage の集計値は additive に追加する
- legacy records に coverage がなくても既存 dashboard は成立する
- Review Coverage セクションは observed run が 0 のとき表示しない

## Tests

- coverage absent records are not counted as incomplete
- complete / partial / not_executed status distribution
- required completion rate across multiple runs
- required failed / timed_out units are counted separately
- zero findings + partial is counted
- zero required units yields N/A rather than divide-by-zero
- dashboard markdown renders the new section only when observations exist
- existing dashboard metrics remain unchanged

## Plan review

### Architecture / responsibility boundaries — APPROVE

既存の run store → `computeDashboard()` → `formatDashboard()` の一方向経路に載せる。新しい metrics subsystem は作らない。

### Contract / SSoT — APPROVE WITH GUARD

`reviewCoverage` の shape は `schemas/review-coverage.schema.json` が SSoT。dashboard はその観測値を再計算せず集計する。`fileScope` を execution coverage と解釈しない。

### Reliability / fail-safe — APPROVE

coverage absent を `complete` / `partial` のどちらにも捏造しない。0 denominator は `null` / `N/A` とする。

### Backward compatibility — APPROVE

保存形式・Gate・decision を変更せず additive な dashboard metric のみ追加する。

### Security / trust boundary — APPROVE

saved run は引き続き self-reported / untrusted observation。集計によって trust level を引き上げない。

### Operations / observability — APPROVE

既存 `river runs summary` / job-summary surface で dogfood可能になる。新しい運用面を増やさない。

### Testing / regression — APPROVE

legacy absence、partial、timeout/failure、0 findings、0 denominator を固定し、required CI green を必須とする。

## Completion rule

- focused/full tests green
- required CI green
- branch is current with `main`
- unresolved blocking review threads = 0
- latest-head seven-perspective review: blocking findings = 0
- only then merge
