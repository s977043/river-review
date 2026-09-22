# Human Attention Evaluation Contract (#2378)

> Status: evaluation design contract.  
> Parent: #2368 Human Attention Architecture.  
> Cross-layer metric semantics: s977043/PlanGate#1349 / PR #1356.  
> Runtime dependency: #2369 ADR-012 + #2371 Decision Surface.

## Decision Summary

この評価では「Decision Surfaceが短いか」ではなく、次を検証します。

1. Humanが必要な判断を正しく抽出できるか
2. material informationを失っていないか
3. Human Attentionが減る、または少なくとも悪化しないか
4. compressionが新しいjudgment / suppressionを発生させていないか

評価は同じunderlying review stateを使うpaired comparisonです。

```text
Baseline renderer
vs
Decision Surface renderer
```

review qualityそのものは比較しません。presentationだけを比較します。

---

## 1. Hard dependencies

実行開始前に以下を満たします。

- #2369 accepted
- #2371 accepted
- baseline commit SHAを固定
- candidate commit SHAを固定
- fixture manifestを固定
- material reference setを固定
- rubricを固定
- evaluatorへconditionを開示するか、blind / counterbalanceするかを固定

本ドキュメントとfixture manifestのレビューはruntime merge前でも実施できます。

---

## 2. Canonical fixture manifest

Machine-readable fixture set:

`tests/fixtures/human-attention/decision-surface-eval-cases.json`

v1は10ケースです。

| Case | Purpose |
| --- | --- |
| HA-01 | clean |
| HA-02 | critical + major |
| HA-03 | minor / info only |
| HA-04 | human-review-required |
| HA-05 | partial coverage |
| HA-06 | not_executed coverage |
| HA-07 | failed / timeout units |
| HA-08 | Team Lead blind spot |
| HA-09 | mixed risk + incomplete coverage |
| HA-10 | legacy result without coverage |

fixture数10は統計的十分性を意味しません。最初のcontract / regression coverageです。

---

## 3. Material reference set

### Rule

**Baseline outputをoracleにしません。**

各fixtureの `materialReference` が事前固定したexpected material stateです。

Baseline / Candidateの両方を同じreferenceへ照合します。

### Material items

最低限、以下をmaterialとします。

- required action
- critical / major finding identity
- human review / human decision requirement
- incomplete / partial / not_executed coverage
- failed / timed-out reviewer unit
- blind spot
- verification uncertainty when available
- evidence / provenance navigation
- lower-severity finding reachability when relevant

### Visibility result

各material itemを次で判定します。

- `visible`: L1で直接確認可能
- `reachable`: L1からL2/L3へ明確に辿れる
- `missing`: Humanが確認できない
- `misleading`: clean / resolved等と誤認させる

`visible` と `reachable` はどちらもvisibilityを満たし得ます。

ただしcritical / major / incomplete coverageの存在自体が、複数step探索をしないと分からない状態はDecision Surfaceの目的に反します。

---

## 4. Decision Extraction rubric

各fixtureについてHuman evaluatorへ次の4問を出します。

1. 今、対応が必要なものは何か
2. Human review / Human decisionは必要か
3. incomplete / uncertain / failed / timed outなものは何か
4. full detail / provenanceへどこから辿るか

### Scoring

各問:

- `1`: correct
- `0`: incorrect / missed
- `NA`: fixture上not applicable

fixture score:

```text
correct applicable answers
/
applicable questions
```

### Success

Primary successは全fixture平均だけで決めません。

以下を両方確認します。

- overall extraction rate
- material safety caseのmiss count

critical / major / human-required / incomplete coverageのmissは平均値で相殺しません。

---

## 5. Human Attention measurement

### Phase A

精密telemetryを要求しません。

許容:

- `explicit`
- `bounded_approximation`
- `unavailable`

`unavailable != 0`

### Timing protocol

可能ならbaseline / candidateをcounterbalancedします。

例:

- evaluator A: baseline → candidate
- evaluator B: candidate → baseline

同一evaluatorが連続して同一fixtureを見る場合、2回目は内容を記憶して速くなるため、raw timeをそのまま効果量と解釈しません。

### Measure

最低限:

- time to answer all applicable extraction questions
- clarification needed
- navigation steps to L2/L3
- measurement mode

### Do not measure as attention

- LLM latency
- CI latency
- PR open → merge wall-clock
- queue / meeting wait
- unrelated multitasking time

---

## 6. Presentation proxies

以下は診断用proxyです。

- initially visible lines
- duplicated visible information
- visible section count
- navigation steps
- summary character count

**採用KPIにはしません。**

文字数を短くするだけで重要情報を消せるためです。

---

## 7. Baseline / Candidate freeze

実行直前にmanifestへ次を記録します。

```yaml
baseline:
  commit: <sha>
candidate:
  commit: <sha>

environment:
  node: <version>
  rendererEntry: src/cli/render.mjs

fixture:
  path: tests/fixtures/human-attention/decision-surface-eval-cases.json
  sha256: <hash>

rubric:
  document: docs/development/2378-human-attention-evaluation-contract.md
  commit: <sha>
```

candidateを見た後にfixture / rubric / oracleを書き換えた場合、そのrunは同一experimentとして扱いません。

---

## 8. Phase A execution

各caseで同じstructured inputからbaseline / candidate markdownを生成します。

保存対象:

```text
artifacts/evals/human-attention/<experiment-id>/
  manifest.json
  HA-01/
    baseline.md
    candidate.md
    score.json
  ...
  HA-10/
    baseline.md
    candidate.md
    score.json
  summary.json
```

保存pathは評価runの提案です。runtime artifact contractには追加しません。

### Required raw result

`score.json` concept:

```json
{
  "caseId": "HA-05-partial-coverage",
  "condition": "candidate",
  "decisionExtraction": {
    "requiredAction": 1,
    "humanRequired": 1,
    "uncertainty": 1,
    "provenance": 1
  },
  "visibility": {
    "missing": [],
    "misleading": []
  },
  "attention": {
    "seconds": null,
    "mode": "unavailable"
  },
  "navigationSteps": 1
}
```

このshapeは評価結果のconceptです。新しいruntime schemaではありません。

---

## 9. Phase A adoption gate

Candidateは次を満たした場合だけdogfoodへ進めます。

```text
Decision Extraction >= baseline

AND

Material Visibility Regression = 0
Critical / Major miss = 0
Human-required miss = 0
Incomplete coverage miss = 0
Misleading clean state = 0
Provenance loss = 0
```

Attentionについては:

- measurableならbaselineより改善、または実質同等
- unavailableならPhase Aを自動FAILにはしない
- ただしattention改善を主張しない

つまり、visibility / extractionが成立していてattentionが未測定なら `SAFE_TO_DOGFOOD / ATTENTION_INCONCLUSIVE` とします。

---

## 10. Phase B dogfood

Phase Aを通過した場合のみ実施します。

初期sample:

10〜20 PRを目安にします。

sample selectionには以下を含めます。

- no finding
- blocking finding
- advisory only
- human-review-required
- partial coverage
- timeout / failed reviewer
- multi-review
- mixed case

easy PRだけを選びません。

### Observe

- Human Attention Time
- Human Intervention Count
- Time to Human Required
- Decision Extraction incidents
- Human Reverse
- repeated explanation burden
- visibility / provenance incident

個人のperformance評価には使用しません。

---

## 11. Decision vocabulary

最終結果は次の4語に限定します。

### ADOPT

Safety / visibilityを維持し、Human decision experienceに改善Evidenceがあります。

### REVISE

基本仮説は維持できるものの、重複表示・navigation・wording等の改善が必要です。

### REJECT

material visibility / correctness / Human authorityを悪化させます。

### INCONCLUSIVE

主要metricの欠測、sample不足、evaluation contamination等により判断できません。

---

## 12. Known hypothesis risk

#2371 v1はadditiveです。

```text
Headline
Decision Surface
Risk
Team Lead
Findings
...
```

既存sectionを削除していないため:

- Decision Extractionは改善する可能性があります
- initially visible information / duplicationは増える可能性があります

したがってv1評価で「Decision Surfaceがある = Attention低下」と仮定しません。

もしDecision Extractionが改善し、visibilityが安全でもattentionが悪化した場合、次candidateとして:

- Risk section pointer化
- Team Lead summary再配置
- duplicated status削減
- progressive disclosure調整

を試します。

この再配置candidateは#2371と混ぜません。

---

## 13. Anti-gaming checklist

- [ ] baselineをoracleにしていない
- [ ] material reference setを実行前に固定した
- [ ] metric start / end anchorを実行前に固定した
- [ ] unavailableを0にしていない
- [ ] easy caseだけ選んでいない
- [ ] top-N / character countを成功条件にしていない
- [ ] early escalationでtime metricだけ改善していない
- [ ] candidate確認後にrubricを変更していない
- [ ] evaluator order / familiarity biasを記録した
- [ ] Human Attention telemetryを個人performance KPIにしていない

---

## 14. Review checklist

### Architecture

- Presentation evaluationだけを扱っているか
- semantic judgmentを評価runnerへ追加していないか
- Review Artifact / Resolutionを新SSoTへ複製していないか

### Safety

- critical / major / human-required / coverage uncertaintyを平均scoreで隠していないか
- baselineの誤りをoracle化していないか
- missing dataを成功扱いしていないか

### Experiment

- paired conditionか
- fixture / oracle / rubricがpre-frozenか
- baseline / candidate SHAが固定されるか
- raw outputを保持するか

### Human factors

- Decision Extractionとspeedを分けているか
- learning / order effectを考慮しているか
- telemetryがsurveillanceへ転用されないか

---

## 15. Non-goals

- Human Attention専用runtime schema
- production telemetry DB
- new Judge / Gate
- reviewer quality比較
- model quality比較
- auto adoption
- individual productivity measurement
- #1337 Plan evaluationとの統合

## 16. Exit

#2378を完了できるのは、Phase Aだけではありません。

```text
Phase A fixed-fixture result
+
Phase B dogfood result
+
ADOPT / REVISE / REJECT / INCONCLUSIVE
+
source evidence
```

を#2368へ返し、PlanGate #1343 WS2の入力Evidenceにします。
