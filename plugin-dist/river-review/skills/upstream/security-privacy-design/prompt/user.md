# Security & Privacy Design Review - User Prompt

Review the provided design document or ADR diff and identify missing or incomplete security and privacy considerations based on the rules and heuristics in the system prompt.

## Input

You will receive:

- Diff showing changes to design documents or ADRs
- File context (file paths and surrounding content if available)

## Task

1. Analyze the diff for security/privacy design issues:
   - Missing data retention policies
   - Lack of deletion request handling (GDPR right to erasure)
   - No consideration of PII in backups
   - Undefined data residency / cross-border transfer
   - Missing audit log design
   - Lack of encryption requirements
   - Missing access control design

2. For each finding:
   - Verify it is relevant to the actual diff (not speculative)
   - Check against false-positive guards
   - Assess confidence level based on context

3. Provide actionable feedback with evidence and fix templates

## Output Format

For each security/privacy finding, provide:

```text
**Finding:** [Brief description of the missing security/privacy consideration]
**Evidence:** [Specific section or line reference from diff]
**Impact:** [What could go wrong without this consideration]
**Fix:** [Concrete suggestion with template]
**Severity:** [warning/major]
**Confidence:** [high/medium/low]
```

### Important Notes

- **DO NOT** require full security design for trivial changes
- **DO NOT** make speculative findings about content outside the diff
- **DO NOT** require enterprise-level security for small-scope designs
- **DO** scale expectations to the risk level of the change
- **DO** suggest specific fix templates that can be copied into the document
- **DO** accept security requirements in referenced documents if the reference is clear
- **DO** lower Confidence when context is insufficient

### Example Output

```text
**Finding:** データ保持ポリシーが定義されていません
**Evidence:** Line 15-20: ユーザーデータ（メール、氏名、電話番号）を保存する設計ですが、保持期間の定義がありません
**Impact:** 不要なデータが蓄積し、データ侵害時のリスクが増大。GDPR/個人情報保護法の遵守が困難
**Fix:** 追記テンプレート: `## データ保持ポリシー\n- アクティブユーザー: 無期限\n- 非アクティブユーザー: 最終ログインから2年で削除\n- ログ: 90日\n- バックアップ: 30日ローテーション`
**Severity:** major
**Confidence:** high
```

```text
**Finding:** バックアップにおけるPII残存が考慮されていません
**Evidence:** Line 25-30: 日次バックアップの設計がありますが、PII削除時のバックアップ対応が記載されていません
**Impact:** 削除リクエスト対応後もバックアップにPIIが残存し、GDPR違反のリスク
**Fix:** 追記テンプレート: `## バックアップPII対応\n- バックアップ保持期間: 30日\n- PII削除時: バックアップからも削除対象\n- リストア時: 削除済みPIIの復活を防ぐチェック`
**Severity:** warning
**Confidence:** medium
```

```text
**Finding:** データレジデンシが明示されていません
**Evidence:** Line 10-15: クラウド上でデータを保存する設計ですが、保存リージョンの記載がありません
**Impact:** GDPR等の地域規制への対応が不明確。越境転送問題の発生リスク
**Fix:** 追記テンプレート: `## データレジデンシ\n- 保存リージョン: ap-northeast-1 (東京)\n- 越境転送: なし（日本国内のみ）\n- 規制対応: 個人情報保護法準拠`
**Severity:** warning
**Confidence:** medium
```

## 評価指標（Evaluation）

- 合格基準: 設計のセキュリティ/プライバシーリスクに見合った指摘を、追記テンプレ付きで提供している
- 不合格基準: 差分と無関係な指摘、過剰な要求、根拠のない断定
