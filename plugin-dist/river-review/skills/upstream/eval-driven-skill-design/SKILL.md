---
id: 'eval-driven-skill-design'
name: 'Eval-Driven Skill Design'
description: '新規・変更 skill の fixture/eval と、WITH/WITHOUT の paired ablation による限界寄与の評価可能性を確認し、activation と effectiveness を分離して案内する。'
version: 0.2.0
category: upstream
phase: upstream
applyTo:
  - 'skills/**/SKILL.md'
  - 'skills/**/prompt/**'
  - 'skills/**/scripts/**'
inputContext:
  - diff
  - repoConfig
outputKind:
  - findings
  - actions
modelHint: balanced
tags:
  - skill-authoring
  - eval
  - process
  - upstream
severity: minor
dependencies:
  - repo_metadata
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Tool Wrapper
Why: skill 追加・重要変更時に happy-path / guard fixture、eval 配線、paired ablation の評価可能性を診断し、存在・発火と実効性を混同しないための educator スキル。fixture-only / docs-only PR では起動しない。

## Goal / 目的

- 新規 `skills/**/SKILL.md` を追加する PR が **検出ケース (happy-path) と抑制ケース (guard) のペア** を fixture として持つことを確認する。
- `eval/promptfoo.yaml` 相当の評価設定または `tests/fixtures/repo-wide-eval/` への登録が用意されているかを確認する。
- 欠けている場合は `npm run eval:fixtures` / `npm run eval:repo-context` をどう通すかを案内する。
- 新規・重要変更された skill について、同じ case / runtime / model / effort で **WITH skill と WITHOUT skill（または旧版 baseline と candidate）** を比較できるか確認する。
- `installed` / `selected` / `fired` を effectiveness の証拠にせず、寄与が不明なら `INCONCLUSIVE` として追加 Evidence を要求する。

## Guidance

### Eval cycle 全体像 (#688 で整備済)

```text
new SKILL.md
  ├─ fixtures/
  │   ├─ <NN>-happy.md        # 検出されるべき diff（必須 1 件以上）
  │   └─ <NN>-guard.md        # 検出してはいけない diff（必須 1 件以上）
  ├─ golden/<NN>-*.md         # promptfoo similar 評価用の代表出力
  ├─ prompt/{system,user}.md  # promptfoo prompts:
  └─ eval/promptfoo.yaml      # contains / not-contains / llm-rubric / similar
```

または `tests/fixtures/repo-wide-eval/` に同じ skill の {happy, guard} ケースを追加し、`tests/fixtures/repo-wide-eval/cases.json` に登録する形でも eval lift が測定できる。

### Marginal contribution / paired ablation

fixture / golden output は「壊れていないか」を見る regression evidence です。skill が**存在する価値そのもの**は、可能な範囲で baseline と candidate の差分として測ります。

```text
same case / runtime / model / effort
  ├─ WITHOUT skill (or previous-version baseline)
  └─ WITH skill    (or candidate)
       ↓
compare delta
```

原則:

- **Usage != Effectiveness**: `installed` / `selected` / `fired` は availability / activation evidence であり、品質改善の証拠ではない。
- 比較では skill 以外の条件を固定する。model / runtime / effort / input が違う結果を skill の寄与として扱わない。
- 非決定的な実行は単発結果で断定せず、複数 trial と paired case を使う。
- 最低限、detection / false positive / critical regression を比較し、取得可能なら time / token / cost / human intervention も見る。
- candidate 側が実際に発火していない、paired case が不足している、sample が足りない場合は `INCONCLUSIVE`。自動的に「効果なし」へ倒さない。
- River Review 内の Harness 改善では、独自比較器を増やさず既存の Experiment Manifest / paired replay（`src/lib/paired-replay.mjs`、`docs/development/1574-p2-paired-replay.md`）を優先して再利用する。
- model / runtime の major update、skill の責務・prompt・routing の大幅変更時は再評価する。旧モデルで有効だった skill が新モデルでは冗長になる可能性を前提にする。

判定は `PASS | FAIL | INCONCLUSIVE` とし、採用・廃止・自動 merge の authority はこのスキルに持たせません。

### happy-path × guard ペア convention

- **happy-path fixture**: 「このパターンを必ず検出すること」を保証する。fixture ファイル名に `happy` / `should-detect` を含める。
- **guard fixture**: 「このパターンを誤検出してはいけない」を保証する。fixture ファイル名に `guard` / `false-positive` / `should-not-detect` を含める。
- ペアにすることで `falsePositiveRateWith / detectionRateWith` (`evaluateRepoWideFixtures` メトリクス) が両方測れ、後の改善で **片方だけが破綻するケース** を検知できる。

### eval コマンドと役割

| 対象            | コマンド                    | 何が回るか                                                            |
| --------------- | --------------------------- | --------------------------------------------------------------------- |
| skill schema    | `npm run skills:validate`   | YAML frontmatter / 必須キー検証                                       |
| review fixtures | `npm run eval:fixtures`     | `tests/fixtures/review-eval/cases.json` に登録された skill の出力検証 |
| repo-wide eval  | `npm run eval:repo-context` | `tests/fixtures/repo-wide-eval/` の context-lift / FP rate メトリクス |
| 集約 driver     | `npm run eval:all`          | 上記 + planner / regression / meta を一括実行                         |

ローカルで失敗したまま push しない（CI 通過のみに頼らない）。

### 判断フロー

新規 `skills/**/SKILL.md` の追加 diff を見たとき、次の順で確認する。

1. `fixtures/` ディレクトリが追加されているか？
   - なし → 「happy / guard fixture が必要」を指摘する。
2. happy-path ペアが揃っているか？
   - guard だけ / happy だけ → 片側欠落として指摘する。
3. `eval/promptfoo.yaml` か `tests/fixtures/repo-wide-eval/cases.json` への配線があるか？
   - なし → どちらかを選んで配線する手順を提示する（per-skill promptfoo か repo-wide cases.json か）。
4. baseline / candidate の比較方法が定義されているか？
   - 新規 skill なら WITHOUT skill、既存 skill の重要変更なら旧版を baseline にする。
5. activation と effectiveness が分離されているか？
   - `fired` だけを成功条件にしている場合は指摘する。
6. paired comparison が実行不能または sample 不足か？
   - `INCONCLUSIVE` と追加 Evidence の取得条件を明示する。推測で PASS / FAIL にしない。
7. fixture / eval / contribution path が揃っている → 何も指摘しない（このスキルは silent でよい）。

## Non-goals / 扱わないこと

- skill の **検出ロジックの妥当性** 自体（それは各 skill の領分）。
- typo / wording / reference link だけの docs-like 変更など、skill の責務・trigger・判断ロジック・routing・modelHint・実行ロジックを変えない軽微変更。
- `prompt/` や `golden/` 内容のスタイル指摘（fixture / eval の有無のみを確認する）。
- 個別 fixture の diff 内容のレビュー（`scripts/evaluate-review-fixtures.mjs` などが回す）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下を **すべて** 満たさない限り `NO_REVIEW` を返す。

- [ ] 差分に新規 `skills/**/SKILL.md`、または **実質変更された** `SKILL.md` / `prompt/**` / `scripts/**` が含まれている
- [ ] fixture / eval / paired contribution のいずれかに未確定がある、または責務・trigger・判断ロジック・routing・modelHint・実行ロジックの変更によって既存 Evidence の再利用可否を確認する必要がある

ゲート不成立時の出力:

```text
NO_REVIEW: eval-driven-skill-design — skill の実質変更がない、または fixture / eval / contribution evidence が既に十分
```

## False-positive guards / 抑制条件

Pre-execution Gate を通過した後の **個別指摘の抑制条件** に絞る。

- 同 PR 内に別の eval 配線（`tests/fixtures/repo-wide-eval/cases.json` 編集等）がある場合、`fixtures/` ディレクトリが skill 配下になくても "missing eval" として指摘しない。
- 新規 skill の `applyTo` が `**/*` のみで真の対象パターンが空のドラフトであることが明らか（`severity: info` + `tags: [draft]` 等）なケースでは、fixture 必須化を促さない。代わりに「ドラフト解除前に eval を整備する」と案内する。
- 既存 skill の copy-and-rename だけで実質 fixture も流用される PR（同 commit で `git mv` の rename detected）では片側 fixture でも許容する。

## Output / 出力例

```yaml
findings:
  - severity: minor
    file: skills/midstream/rr-midstream-newcheck-001/SKILL.md
    line: 1
    issue: |
      新規 skill `rr-midstream-newcheck-001` が追加されましたが、
      `fixtures/` ディレクトリが見当たりません。happy-path × guard
      のペア fixture が無いと #688 の repo-wide eval で
      detectionRate / falsePositiveRate を測定できず、
      後続改修時の regression を検知できません。
    suggestion: |
      最低限以下を追加してください。
      - skills/midstream/rr-midstream-newcheck-001/fixtures/01-should-detect.md
      - skills/midstream/rr-midstream-newcheck-001/fixtures/02-should-not-detect.md
      評価配線は per-skill promptfoo (`eval/promptfoo.yaml`) か、
      `tests/fixtures/repo-wide-eval/cases.json` への追加のいずれかを選び、
      ローカルで `npm run eval:fixtures` または
      `npm run eval:repo-context` が exit 0 で通ることを確認してください。
actions:
  - type: 'verify'
    description: 'PR merge 前にローカルで `npm run eval:all` が通ることを確認する'
```

## References

- Repo-wide eval 実装: `src/lib/repo-wide-fixtures-eval.mjs` / `scripts/evaluate-review-fixtures.mjs`
- Fixture 構造の参考: `skills/midstream/security-basic/`
- Schema: `schemas/skill.schema.json`
- 改善ループ: `skills/agent-skills/river-review/references/IMPROVEMENT_LOOP.md`
- paired comparison: `docs/development/1574-p2-paired-replay.md` / `src/lib/paired-replay.mjs`
