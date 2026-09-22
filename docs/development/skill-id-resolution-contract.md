# Skill-ID resolution / Experience Knowledge ownership contract

Issue: #2372 / #2383

## Purpose

River Review は、Agent Skill と Review Skill の二層を持つ。

- Agent Skill: `skills/agent-skills/`。Claude Code / Codex などの entry / routing surface。
- Review Skill: `skills/core/` / `skills/upstream/` / `skills/midstream/` / `skills/downstream/`。レビュー判断・fixture の canonical owner。

同じ Experience Knowledge を両方へ手書きで複製すると、修正・fixture・review finding の正本が分裂する。
この契約は **knowledge owner を一つに保ちながら、host ごとの配置差を skill ID で吸収する**。

## Decision

### 1. Canonical owner

レビュー判断そのもの、false-positive guard、failure mode、fixture と結びつく Experience Knowledge は、原則として **その判断を所有する Review Skill** を canonical owner とする。

Agent entry skill は次だけを所有する。

- activation / intent classification
- routing
- entry-level hard guard
- output / handoff contract
- entry skill 固有の orchestration knowledge

Review Skill がすでに所有する知識を、Agent Skill の `references/` へ手書きコピーしない。

### 2. Portable identity

Skill 間の durable reference は **skill ID** とする。

物理パスは host / export 形態で変わるため、knowledge contract として保存しない。

悪い例:

```text
../../midstream/nullability-contract/SKILL.md
```

良い例:

```text
nullability-contract
existing-pattern-conformance
```

物理パスは resolver の実装詳細です。

## Resolution order

Host は skill ID を次の順で解決する。

### Source repository / full plugin root

1. `skills/agent-skills/<skill-id>/SKILL.md`
2. `skills/core/**/<skill-id>/SKILL.md`
3. `skills/upstream/**/<skill-id>/SKILL.md`
4. `skills/midstream/**/<skill-id>/SKILL.md`
5. `skills/downstream/**/<skill-id>/SKILL.md`

directory 名と metadata id が異なる import / compatibility case は、registry / loader の解決結果を優先する。

Claude Marketplace は `.claude-plugin/marketplace.json` で `source: "./"` を使うため、full plugin root には native Review Skill tree が存在する。
一方で plugin manifest の discoverable skill surface は `skills/agent-skills/` に限定されるため、**discoverability と file availability を同一視しない**。

### `river skills export`

`river skills export` は Review Skill をそれぞれ Agent Skill package として export する。
export 後は、次の sibling package path を解決先として扱います。

```text
<export-root>/<skill-id>/SKILL.md
```

を解決先とする。

`--include-assets` を使う場合も、各 owner skill 自身の `references/` / `scripts/` / `prompt/` を同 package に含める。
他 skill の knowledge をコピーして dependency を flatten しない。

## Dependency rule

Agent entry skill が specialist skill を使う場合、本文には次を記述する。

- いつ委譲するか
- owner skill ID
- owner が見つからない場合の degradation

owner skill の本文そのものは転記しない。

例:

```text
fallback / config / IO 境界の判断が必要:
  -> nullability-contract を解決して False-positive guards を読む
```

## Missing owner behavior

Skill ID を解決できない場合、エージェントは owner knowledge を推測で再構築しない。

- owner skill を `skippedSkills` / equivalent trace に残す
- generic entry checklist だけで継続可能なら degrade する
- critical / security / compliance の必須判断なら、人間確認または既存 gate へ handoff する
- 「Reference を読んだ」ことにしない

## Generated bridge

Host が skill-ID resolution を提供できず、portable standalone package が必要な場合に限り generated bridge を許容する。

generated bridge は手書きの第二正本にしない。最低限次を持つ。

- canonical owner skill ID
- source path or source artifact identifier
- source content hash / version
- generatedAt
- generator version
- freshness check in CI

source hash が一致しない generated artifact は release / validation で fail させる。

## Progressive Disclosure

Progressive Disclosure は「ファイルを細かく分けること」ではない。

1. entry skill が intent / risk から owner skill ID を選ぶ
2. owner skill の実行契約を読む
3. owner skill が必要と判断した local reference / fixture だけを追加で読む

したがって、すでに specialist Review Skill が正本を持つ場合は、Agent Skill 側に同じ Reference を増やすより **owner skill への委譲を明示する方を優先する**。

## Current dogfood precedent

`river-review-code` の次の詳細は、entry skill 側の canonical knowledge にしない。

- `scripts/` の JSDoc `unknown -> any` FP 境界
  - owner: `existing-pattern-conformance`
  - evidence: PR #1476 review + existing fixture
- internal invariant の fail-fast と external IO fallback の境界
  - owner: `nullability-contract`
  - evidence: PR #1475 / #1480 / #1483 reviews + existing fixtures

`river-review-code` は詳細説明を縮め、owner skill ID と loading condition を残す。

## Implementation gap

現時点の `commands/skill.md` は `skills/agent-skills/` のみを検索する。
そのため full plugin root に native Review Skill が存在していても、直接の `/skill` surface では skill-ID resolution が不完全です。

この gap は別 Issue で resolver を追加する。
Issue #2381 の dogfood は resolver contract が実装されるまで、knowledge を複製して回避しません。

## Non-goals

- Agent Skill と Review Skill を1つのディレクトリ体系へ統合する
- 全 Review Skill を `.claude-plugin/plugin.json` の discoverable skill に直接列挙する
- cross-skill knowledge を build 時に無条件 flatten する
- physical path を stable interface にする

## Verification

resolver 実装では最低限次を確認する。

- plugin/source tree で agent skill / native Review Skill の両方を ID 解決できる
- unknown ID は fail/degrade が明示される
- traversal を含む ID を path として解釈しない
- export 後の sibling package を ID で解決できる
- owner knowledge の手書き複製が増えない
