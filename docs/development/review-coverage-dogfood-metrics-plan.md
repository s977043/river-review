# Review Coverage dogfood metrics plan

Issue: #2300  
Parent: #2212

## Goal

Review Coverage Phase 1 の observe-only telemetry を、既存の saved run / dashboard 経路で集計できるようにする。

Gate / decision / auto-approve / Human Review の挙動は変更しない。

## Scope

`src/lib/result-store.mjs` の既存 `computeDashboard()` を集計の SSoT とする。

saved run に保存済みの `reviewCoverage` から、次を集計する。

- Review Coverage を持つ run 数
- classified / unclassified run 数
- coverage status distribution (`complete` / `partial` / `not_executed`)
- required unit completion rate
- required unit failure / timeout count and rate
- `0 findings + partial` run 数

`formatDashboard()` では Review Coverage を持つ run が存在する場合だけ observe-only セクションを表示する。

## Metric definitions

### Observed / classified runs

`reviewCoverage` object を持つ run を observed とする。coverage が存在しない legacy run、または dry-run / offline / credential missing で意図的に未実行の single-reviewer run を incomplete とみなさない。#2410 以降、LLM call を実際に試行した single-reviewer run は成功時 `complete`、transport / response / parse failure 時 `not_executed` の observation を持つ。

`status` が current v1 vocabulary (`complete` / `partial` / `not_executed`) に入らない observation は unclassified として明示し、rate の分母や required-unit 集計へ混ぜない。これにより self-reported / stale / future-shaped record が現在の dogfood rate を黙って歪めるのを避ける。

### Required unit completion rate

```text
sum(completedRequiredUnits) / sum(requiredUnits)
```

classified observation のみを対象とし、分母が 0 の場合は `N/A` とする。

### Required unit failure / timeout rate

classified observation の `units[]` のうち `required === true` かつ `status in {failed, timed_out}` の unit 数を `sum(requiredUnits)` で割る。

### Partial review rate

```text
status == partial の classified run 数 / classified run 数
```

### Zero findings + partial

`findings.length === 0` かつ `reviewCoverage.status === partial` の classified run 数。

## Explicit non-goals

- Gate integration
- new reasonCode
- auto escalation
- file-level `covered`
- file coverage percentage
- ContextCoverage / SecurityAuditCoverage との統合
- new top-level CLI command
- new persistence format
- saved record の trust elevation / full schema re-validation

`fileScope.selected / excluded` は LLM-facing selection scope であり execution completion ではないため、file coverage rate の分母・分子には使わない。

## Backward compatibility

- saved run format は変更しない
- `computeDashboard()` の既存 metric は維持する
- Review Coverage の集計値は additive に追加する
- legacy records に coverage がなくても既存 dashboard は成立する
- Review Coverage セクションは observed run が 0 のとき表示しない
- unknown / future status は unclassified として可視化し、既存v1 rateから除外する

## Tests

- coverage absent records are not counted as incomplete
- complete / partial / not_executed status distribution
- required completion rate across multiple runs
- required failed / timed_out units are counted separately
- optional unit failure is excluded from required failure metrics
- unclassified status does not alter dogfood rate denominators
- zero findings + partial is counted
- zero required units yields N/A rather than divide-by-zero
- dashboard markdown renders the new section only when observations exist
- existing dashboard metrics remain unchanged

## Plan review

### Architecture / responsibility boundaries—APPROVE

既存の run store → `computeDashboard()` → `formatDashboard()` の一方向経路に載せる。新しい metrics subsystem は作らない。

### Contract / SSoT—APPROVE WITH GUARD

`reviewCoverage` の shape は `schemas/review-coverage.schema.json` が SSoT。dashboard は coverage を再導出しない。`fileScope` を execution coverage と解釈しない。

### Reliability / fail-safe—APPROVE

coverage absent を `complete` / `partial` のどちらにも捏造しない。契約外 status は unclassified として rate から除外する。0 denominator は `null` / `N/A` とする。

### Backward compatibility—APPROVE

保存形式・Gate・decision を変更せず additive な dashboard metric のみ追加する。

### Security / trust boundary—APPROVE

saved run は引き続き self-reported / untrusted observation。集計によって trust level を引き上げない。unclassified observation を明示して、壊れた観測を正常母集団へ黙って混ぜない。

### Operations / observability—APPROVE

既存 `river runs summary` / job-summary surface で dogfood可能になる。新しい運用面を増やさない。

### Testing / regression—APPROVE

legacy absence、partial、timeout/failure、optional failure、unclassified status、0 findings、0 denominator を固定し、required CI green を必須とする。

## Completion rule

- focused/full tests green
- required CI green
- branch is current with `main`
- unresolved blocking review threads = 0
- latest-head seven-perspective review: blocking findings = 0
- only then merge
