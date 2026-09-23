# Human Attention Decision Surface Evaluation Plan

> Tracking: #2368 / #2378
> Cross-layer metrics: s977043/PlanGate#1349
> Runtime dependency: #2369 + #2371

## Decision Summary

Phase Aでは、同じunderlying review resultに対してbaseline / candidateの表示だけを変えます。

評価対象は次の3点です。

1. Humanが必要な判断を正しく抽出できるか
2. material informationが失われていないか
3. Human Attentionが減る、または同等であるか

Runtime merge前にfixture / oracle / rubricだけを固定できます。実測は#2369 / #2371 accepted後に開始します。

## Baseline / Candidate

### Baseline

Decision Surfaceを持たない既存Markdown表示。

Phase Aでは、現行実装が持たない`human decision required` semanticsを新たに評価対象へ持ち込みません。評価するのは既存の`human-review-required` signalです。

### Candidate

同じreview stateにDecision Surfaceを追加したMarkdown表示。

review generation / finding set / gate / decision / coverageは同一にします。

## Frozen fixture set

Machine-readable oracle: `docs/eval/human-attention-fixtures.yaml`

| ID    | Case                  | Material state                                |
| ----- | --------------------- | --------------------------------------------- |
| HA-01 | clean                 | no finding / complete coverage                |
| HA-02 | critical + major      | 2 action-required findings                    |
| HA-03 | minor + info only     | no action-required finding                    |
| HA-04 | human review required | existing human-review signal                  |
| HA-05 | partial coverage      | incomplete review unit                        |
| HA-06 | not executed          | reviewCoverage=not_executed                   |
| HA-07 | timeout + failed      | incomplete coverage with failure reason       |
| HA-08 | blind spot            | Team Lead blind spot present                  |
| HA-09 | mixed                 | major finding + partial coverage + blind spot |
| HA-10 | legacy compatible     | reviewCoverage absent                         |

Fixture追加はPhase A開始前まで可能です。開始後はcase setをfreezeします。

## Material reference set

baselineをoracleにしません。

各fixtureごとに以下を事前固定します。

```yaml
required_actions: []
human_review_required: true | false
human_decision_required: unavailable
material_findings: []
coverage_state: complete | partial | not_executed | unavailable
blind_spots: []
verification_uncertainty: []
evidence_locations: []
```

materiality / expected stateはcandidate表示を見る前に固定します。

## Extraction rubric

Evaluatorは表示を読み、以下へ回答します。

1. 今対応が必要な項目はあるか
2. Human reviewが必要か
3. incomplete / timeout / blind spotはあるか
4. critical / major findingを列挙できるか
5. 詳細Evidenceへ辿れる場所を特定できるか

### Per-item scoring

- `correct`
- `incorrect`
- `not_answered`

### Fixture pass

以下をすべて満たします。

```text
required action correct
AND
human review state correct
AND
coverage/uncertainty correct
AND
material finding identities correct
AND
evidence location identifiable
```

## Attention measurement

Phase Aではproduction telemetryを要求しません。

優先順位:

1. explicit manual timing
2. bounded approximation
3. unavailable

`unavailable != 0`

計測開始:

- MarkdownをHumanへ提示した時点

計測終了:

- rubric回答を完了した時点

timer操作のoverheadは可能なら別記します。

## Secondary proxies

次は参考値です。採用条件には単独利用しません。

- initially visible lines
- duplicated visible information
- navigation steps to L2/L3
- clarification required count

## Visibility Regression

Material reference setを分母にします。

候補:

```text
lost
misleading
trace_unavailable
```

のいずれかが発生したmaterial item数を記録します。

Target:

```text
material_visibility_regression = 0
```

L1に全文が無いこと自体はregressionではありません。L2/L3へ明確に追跡できればvisibilityは維持されています。

## Evaluation procedure

各fixtureについて:

```text
1. frozen review stateを用意
2. baseline Markdown生成
3. candidate Markdown生成
4. presentation順を記録
5. extraction rubric回答
6. attention measurement
7. visibility oracle照合
8. raw result保存
```

presentation orderはcounterbalanceします。

例:

- odd fixtures: baseline → candidate
- even fixtures: candidate → baseline

Attentionの改善を採用根拠に使う場合は、最低2つのcounterbalanced evaluator sessionを要求します。同一Humanが繰り返す場合もorderを反転し、1回目の学習効果だけで改善判定しません。

1 sessionしか得られない場合:

- Decision Extraction / Visibilityは評価可能
- Attention Timeはdescriptive observation
- Attention改善を採用条件として確定しない。必要なら `INCONCLUSIVE`

## Result record

```yaml
fixture_id: HA-01
variant: baseline | candidate
presentation_order: 1 | 2
measurement_mode: explicit | bounded_approximation | unavailable
attention_seconds: null
extraction:
  required_action: correct
  human_review: correct
  uncertainty: correct
  material_findings: correct
  evidence_location: correct
visibility:
  material_total: 0
  lost: 0
  misleading: 0
  trace_unavailable: 0
notes: ""
```

これはeval recordの概念例です。Phase Aでは新runtime schemaを追加しません。

## Adoption rule

Candidateは次の場合にのみ採用候補です。

Attention比較を採用根拠に使う場合、counterbalanced measurement requirementを満たしていることを前提にします。

```text
Decision Extraction >= baseline
AND
Material Visibility Regression = 0
AND
Critical / Major visibility >= baseline
AND
Incomplete coverage visibility = 100%
AND
Provenance loss = 0
AND
No gate / decision semantic regression
AND
Human Attention improves or is meaningfully unchanged
```

主要metricが欠測する場合は`INCONCLUSIVE`を許容します。

Phase Aの小標本では統計的有意差を主張しません。Human Attention Timeは方向性とmeasurement modeをEvidenceとして保存し、差が測定ノイズと区別できない場合は`meaningfully unchanged`または`INCONCLUSIVE`とします。判定基準は実測値を見る前に固定します。

## Interpretation guard

次は成功とみなしません。

- text lengthだけ短い
- initial line countだけ少ない
- Humanへ早くescalateしただけ
- material findingをfoldして見えなくした
- missing measurementを0秒扱いした
- baselineの見落としをcandidateも踏襲した

## Phase B—Repository Dogfood

Phase Aでmaterial regressionが0の場合だけ進みます。

対象はRiver Review自身の10〜20 PRを目安にします。

最低限含めます。

- multi-review
- blocking / advisory
- human-review-required
- incomplete coverage
- timeout / failure
- no-finding clean run

観測:

- Human Attention Time
- Human Intervention Count
- Time to Human Required
- Decision Extraction issue
- Human Reverse
- repeated explanation
- visibility / provenance incident

## Privacy

Human Attention metricを個人のperformance KPIに利用しません。

- run / fixture単位を基本とする
- 個人識別情報は最小限にする
- aggregateで十分なら個人別値を保持しない
- retention / consent / measurement overheadを必要に応じて明示する

## Exit

Phase A終了時に次のいずれかを記録します。

- `ADOPT_CANDIDATE`
- `REVISE`
- `REJECT`
- `INCONCLUSIVE`

Phase B終了後に#2368へEvidenceを返し、s977043/PlanGate#1345 ai-loop V2展開の入力にします。
