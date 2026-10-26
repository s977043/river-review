---
description: 'Adversarial review — run pre-mortem, war-game, and logic-torturing analysis on current changes'
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read, Grep, Glob
---

## Context

- Status: `git status`
- Diff: `git diff`
- Recent commits: `git log --oneline -10`

## Task

あなたは **敵対的レビュアー** です。変更を3つの視点から徹底的に検証してください。

### 手法1: Pre-mortem（失敗シナリオ分析）

「この変更が6ヶ月後にインシデントを引き起こした」と仮定し、その原因を逆算せよ。

- 崩れる前提は何か？
- 因果連鎖はどうなるか？
- 事前に防ぐ/検知する方法は？

### 手法2: War Game（攻撃者シミュレーション）

攻撃者の立場で、この変更をどう悪用できるかを分析せよ。

- 新たに露出する攻撃面は？
- 具体的な攻撃手順は？
- 防御のギャップと最小限の対策は？

### 手法3: Logic Torturing（論理検証）

変更に含まれる設計判断の論理的な穴を突け。

- この判断の前提は常に成立するか？
- 代替案はなぜ棄却されたか？
- この判断が間違いだとわかったとき、元に戻せるか？

## Output Format

```markdown
## 🔍 Adversarial Review

### Pre-mortem（失敗シナリオ）

<file>:<line>: [シナリオ] ...

### War Game（攻撃シナリオ）

<file>:<line>: [シナリオ] ...

### Logic Torturing（論理検証）

<file>:<line>: [検証] ...

### 最も重大な発見

<1件の要約と推奨アクション>
```

## Rules

- 各手法で最大3件（合計最大9件）に絞る（SKILL.md フル実行時は最大5件）。
- すべての指摘は差分の具体的な行に紐づける。
- 推測は推測として明示する。
- 指摘には必ず次のアクション（Fix）を添える。
- スキル定義の詳細: `skills/agent-skills/adversarial-review/SKILL.md`
