# Architecture Validation Plan Guard - User Prompt

Review the provided design document or ADR diff and identify missing or incomplete validation plans based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Diff showing changes to design documents or ADRs
- File context (file paths and surrounding content if available)

## Task

1. Analyze the diff for validation plan issues:
   - Missing SLO/SLI definitions
   - Lack of load testing plans for performance requirements
   - No canary/gradual rollout strategy
   - Missing DR (disaster recovery) plans
   - Absent rollback procedures
   - No observability planning (metrics, logs, alerts)
   - Missing contract tests for APIs/interfaces
   - No PoC/spike for technical uncertainties

2. For each finding:
   - Verify it is relevant to the actual diff (not speculative)
   - Check against false-positive guards
   - Assess confidence level based on context

3. Provide actionable feedback with evidence and fix templates

## Output Format

For each validation plan finding, provide:

```text
**Finding:** [Brief description of the missing validation plan]
**Evidence:** [Specific section or line reference from diff]
**Impact:** [What could go wrong without this validation]
**Fix:** [Concrete suggestion with template]
**Severity:** [minor/major]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** require full validation plans for trivial changes
- **DO NOT** make speculative findings about content outside the diff
- **DO NOT** require enterprise-level validation for small-scope designs
- **DO** scale expectations to the risk level of the change
- **DO** suggest specific fix templates that can be copied into the document
- **DO** accept validation plans in referenced documents if the reference is clear
- **DO** lower Confidence when context is insufficient

### Example Output

```text
**Finding:** SLO/SLIの定義が欠如しています
**Evidence:** Line 45-60: 可用性とレイテンシ要件は記載されていますが、具体的なSLO目標と計測方法がありません
**Impact:** 本番リリース後、何をもって「正常」とするかの基準がなく、障害判断が曖昧になります
**Fix:** 追記テンプレート: `## SLO/SLI\n- 可用性: 99.9% (月次)\n- P99レイテンシ: 200ms以下\n- 計測: Datadogダッシュボード xxx-service-health`
**Severity:** minor
**Confidence:** high
```

```text
**Finding:** ロールバック計画が記載されていません
**Evidence:** Line 80-95: 新機能のリリース計画はありますが、失敗時の切り戻し手順がありません
**Impact:** 障害発生時、切り戻しに時間がかかり、影響が拡大する恐れがあります
**Fix:** 追記テンプレート: `## ロールバック計画\n- 条件: エラー率 1%超過 または P99 500ms超過\n- 手順: 1. フィーチャーフラグOFF 2. 旧Pod再デプロイ\n- 所要時間目安: 5分`
**Severity:** minor
**Confidence:** medium
```

## 評価指標（Evaluation）

- 合格基準: 設計のリスクに見合った検証計画の不足を、追記テンプレ付きで指摘している
- 不合格基準: 差分と無関係な指摘、過剰な要求、根拠のない断定
