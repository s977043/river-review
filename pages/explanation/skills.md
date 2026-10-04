---
id: skills
---

# スキル—River Reviewの心臓部

## スキルとは

**スキル**とは、チームの知識を再利用可能でバージョン管理されたコードレビューパターンとして体系化したものです。

スキルは以下のように捉えることができます。

- **プレイブック**—チームが従うレビュー手順を文書化したもの
- **ツール**—自動的に実行されるレビューロジック
- **アーティファクト**—バージョン管理され、テスト可能で、共有可能な資産

スキルは暗黙知（「普段Xを確認している」）を明示的かつ自動化されたチェックに変換し、毎回一貫して実行します。

## スキルが重要な理由

### 問題: 暗黙知への依存

従来のコードレビューは人間の記憶と経験に依存しています。

- 「SQLインジェクションを確認したか？」
- 「エラーハンドリングの検証を忘れずに」
- 「アクセシビリティ監査を忘れないように」

この結果、以下の問題が生じます。

- **一貫性の欠如**—レビューの質が担当者に依存する
- **知識の喪失**—エキスパートが離れると知識も消える
- **スケーリングの困難**—すべてを徹底的にレビューすることが難しい

### 解決策: 資産としてのスキル

スキルは暗黙知を明示的かつ実行可能にします。

```yaml
# Before: 「SQLインジェクションを確認すること」
# After:  バージョン管理されテスト可能なスキル
id: security-basic
name: Baseline Security Checks
version: 0.1.0
```

利点は以下のとおりです。

- **再現性**—毎回同じチェックを実行する
- **改善可能**—フィクスチャーでテストし改良できる
- **共有可能**—チーム間でスキルを交換できる
- **スケーラブル**—人的ボトルネックなしに全PRをレビューできる

## スキルの構造

スキルは主に以下の5つのコンポーネントで構成されます。最小構成ではスキル定義の`.md`ファイルのみで動作し、評価用アセットは必要に応じて同梱できます。

### 1. メタデータ（skill.yaml）

スキルの内容と実行タイミングを宣言します。

```yaml
id: security-basic # 一意の識別子
name: Baseline Security Checks # 人間が読める名前
version: 0.1.0 # セマンティックバージョン
description: Detects common vulnerabilities

# 起動条件
phase: midstream # SDLCフェーズ
applyTo: # ファイルパターン
  - 'src/**/*.ts'
  - 'src/**/*.js'

# 入出力
inputContext: [diff] # 入力要件
outputKind: [findings] # 出力タイプ

# 最適化ヒント
modelHint: cheap # コスト/精度バランス
severity: major # 検出の重要度
```

### 2. プロンプト（prompt/）

自然言語によるレビューロジックです。

**prompt/system.md**—役割を設定:

```markdown
You are a security-focused code reviewer.
Your task is to identify common vulnerabilities.

Focus on:

- SQL injection
- XSS vulnerabilities
- Hardcoded secrets
```

**prompt/user.md**—コードに適用:

```markdown
Review this diff for security issues:

{{diff}}

Report findings using this format:
**Finding:** [description]
**Fix:** [suggestion]
**Severity:** [info|minor|major|critical]
```

### 3. フィクスチャー（fixtures/）

テスト用のサンプル入力です。

**fixtures/01-sql-injection.md:**

```markdown
+const query = `SELECT * FROM users WHERE id = ${userId}`;
+const result = await db.query(query);
```

### 4. ゴールデン出力（golden/）

各フィクスチャーに対する期待結果です。

**golden/01-sql-injection.md:**

```markdown
**Finding:** SQL injection vulnerability in user lookup
**Fix:** Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
**Severity:** major
```

### 5. 評価設定（eval/）

スキルのテスト方法です。

**eval/promptfoo.yaml:**

```yaml
prompts:
  - file://../prompt/system.md
  - file://../prompt/user.md

tests:
  - vars:
      diff: file://../fixtures/01-sql-injection.md
    assert:
      - type: contains
        value: 'SQL injection'
      - type: similar
        value: file://../golden/01-sql-injection.md
        threshold: 0.7
```

## スキルのライフサイクル

詳細は [スキルのライフサイクル](./skill-lifecycle.md) も参照してください。

### 1. 作成

```bash
# インタラクティブなスキャフォールディング
npm run create:skill

# 手動作成
cp -r scripts/templates/skill skills/my-skill
```

### 2. 実装

プロンプトを編集してレビュー知識をエンコードします。

```markdown
# prompt/system.md

You are a React code reviewer checking for common pitfalls.

Rules:

1. State updates must be immutable
2. Event handlers should be memoized
3. Lists must have stable keys
```

### 3. テスト

フィクスチャーとゴールデン出力を追加します。

```bash
# テストケース追加
echo "..." > fixtures/01-state-mutation.md
echo "..." > golden/01-state-mutation.md

# 評価実行
cd skills/my-skill
npx promptfoo eval
```

### 4. 検証

スキルがスキーマ要件を満たしていることを確認します。

```bash
npm run validate:skill-yaml
```

### 5. デプロイ

以下の条件を満たすとスキルが自動的に起動します。

- フェーズが一致（upstream/midstream/downstream）
- ファイルパターンが一致（`applyTo`グロブ）
- 必要なコンテキストが利用可能（`inputContext`）

デプロイ手順は不要です。リポジトリにコミットするだけで完了します。

### 6. 改善

スキルの効果をモニタリングし反復改善します。ここでは **「実行された」ことと「役に立った」ことを分離**します。

`installed / selected / fired` は availability / activation evidence です。effectiveness は、可能な範囲で同じ case / runtime / model / effort を固定した **WITH skill vs WITHOUT skill**（既存 skill の更新では旧版 baseline vs candidate）として確認します。単発の成功例だけで判断せず、非決定的な実行では複数 trial を使います。

比較では detection / false positive / critical regression を最低限確認し、取得可能なら time / token / cost / human intervention も合わせて見ます。candidate が発火していない、paired case が不足している、sample が足りない場合は `INCONCLUSIVE` とし、「効果なし」と推測しません。

model / runtime の major update、skill の責務・prompt・routing の大幅変更時は再評価します。モデル本体の能力向上によって、以前は有効だった skill の限界寄与が小さくなる可能性があるためです。River Review 自身の Harness 改善では、既存の Experiment Manifest / paired replay を再利用します。

```bash
# 回帰テスト実行
npx promptfoo eval

# 結果に基づきプロンプトを更新
# エッジケースのフィクスチャーを追加
# skill.yamlのバージョンをバンプ
```

## 最初のスキルを作成する

### ステップバイステップの例

TypeScriptのnullチェック漏れを検出するスキルを作成します。

**1. スキャフォールド:**

```bash
npm run create:skill

# 入力:
# ID: typescript-nullcheck
# Name: TypeScript Null Safety
# Phase: midstream
# Files: src/**/*.ts
```

**2. システムプロンプトを記述:**

```markdown
# prompt/system.md

You are a TypeScript code reviewer focused on null safety.

Check for:

- Optional chaining (?.) vs explicit null checks
- Nullish coalescing (??) vs || for defaults
- Non-null assertions (!) without validation
```

**3. ユーザープロンプトを記述:**

```markdown
# prompt/user.md

Review this TypeScript code for null safety issues:

{{diff}}

For each issue, provide:

- **Issue:** What's wrong
- **Line:** Line number
- **Fix:** Corrected code
- **Severity:** minor|major
```

**4. フィクスチャーを追加:**

```diff
# fixtures/01-unsafe-property-access.md

+function getName(user) {
+  return user.profile.name;
+}
```

**5. ゴールデン出力を追加:**

```markdown
# golden/01-unsafe-property-access.md

**Issue:** Unsafe property access without null check
**Line:** 2
**Fix:** Use optional chaining: `return user?.profile?.name;`
**Severity:** major
```

**6. 評価を設定:**

```yaml
# eval/promptfoo.yaml
prompts:
  - file://../prompt/system.md
  - file://../prompt/user.md

providers:
  - id: openai:gpt-4o
    config:
      temperature: 0.1

tests:
  - description: Unsafe property access
    vars:
      diff: file://../fixtures/01-unsafe-property-access.md
    assert:
      - type: contains
        value: 'optional chaining'
      - type: llm-rubric
        value: |
          Score 1 if the output correctly identifies the null safety issue
          and suggests optional chaining. Score 0 otherwise.
```

**7. テスト:**

```bash
cd skills/midstream/typescript-nullcheck
npx promptfoo eval

# eval/results.jsonで結果を確認
```

**8. コミット:**

```bash
git add skills/typescript-nullcheck
git commit -m "feat: add TypeScript null safety skill"
```

以上でスキルはTypeScriptのPRに対して自動的に実行されます。

## スキル設計の原則

### 1. 単一責任

- 悪い例: 「コード品質、セキュリティ、パフォーマンスをチェック」
- 良い例: 「SQLインジェクション脆弱性を検出」

1つのスキルに1つの関心事を持たせます。焦点を絞ったスキルには以下の利点があります。

- テストが容易
- 理解が容易
- 保守が容易

### 2. 明確な契約

入出力を明示的に宣言します。

```yaml
inputContext: [diff, fullFile] # diffとファイル全体の両方が必要
outputKind: [findings, metrics] # findingsとmetricsを出力
```

これにより以下が実現します。

- スマートなスキル選択（コンテキストが利用可能な場合のみ実行）
- より良いエラーメッセージ（コンテキスト不足時はスキップ、失敗ではない）
- 将来の最適化（依存関係に基づく並列実行）

### 3. フィクスチャーによるテスト

すべてのスキルに以下を用意します。

- 少なくとも2つのフィクスチャー（ハッピーパス + エッジケース）
- 対応するゴールデン出力
- 動作を検証するアサーション

```text
fixtures/
  01-happy-path.md        → golden/01-happy-path.md
  02-edge-case-null.md    → golden/02-edge-case-null.md
  03-false-positive.md    → golden/03-false-positive.md
```

### 4. 慎重なバージョニング

セマンティックバージョニングを使用します。

- **パッチ（0.1.1）:** タイポ修正、例の改善
- **マイナー（0.2.0）:** 新しいチェック追加、スコープ拡大
- **メジャー（1.0.0）:** 出力フォーマット変更、互換性の破壊

### 5. 適切なモデルヒント

コスト/精度のバランスを選択します。

```yaml
modelHint: cheap # 高速な構文チェック、スタイルガイド
modelHint: balanced # 標準的なコードレビュー
modelHint: high-accuracy # セキュリティ監査、アーキテクチャレビュー
```

cheapスキルが最初に実行され（高速フィードバック）、high-accuracyが最後に実行されます（徹底的な分析）。

## 高度な概念

### 入力コンテキスト

スキルはさまざまな入力タイプを要求できます。

```yaml
inputContext:
  - diff # Gitのdiff（最速、コンテキスト最小）
  - fullFile # ファイル全体
  - tests # 関連テストファイル
  - adr # アーキテクチャ決定記録
  - commitMessage # コンテキストとしてのコミットメッセージ
```

フレームワークが要求されたコンテキストを提供するか、スキルをスキップします。

### 出力タイプ

スキルはさまざまな出力を生成できます。

```yaml
outputKind:
  - findings # 標準的なレビューコメント
  - questions # 著者への確認質問
  - metrics # 定量的な計測
  - actions # 自動修正の提案
```

出力フォーマッターが宣言された種類に応じて適応します。

### 依存関係

スキルは必要なツールを宣言できます。

```yaml
dependencies:
  - test_runner # テスト実行が必要
  - coverage_report # カバレッジデータが必要
  - custom:sonarqube # カスタムツール連携
```

フレームワークがスキル実行前に利用可能性を検証します。

### スキルの合成（将来）

> **注意**: これは将来の設計コンセプトであり、現在は実装されていません。`skill:` プレフィックスは現時点で有効な依存関係の値ではありません。有効な値は `DependencyEnum` に定義された文字列（例: `test_runner`、`coverage_report`）と `custom:<name>` 形式のみです。

スキルが他のスキルを参照できるようになると、以下が実現します。

- 段階的チェック（基本 → 高度）
- スキルの再利用（セキュリティスキルが認証スキルを呼び出す）
- ワークフローオーケストレーション

## 評価の哲学

### 評価の目的

スキルはコードです。他のコードと同様にテストが必要です。

評価は以下の問いに答えます。

- **動作するか？**（回帰テスト）
- **効果的か？**（品質測定）
- **一貫しているか？**（再現性チェック）

### 評価戦略

#### 1. 完全一致（厳密）

```yaml
assert:
  - type: contains
    value: 'SQL injection'
```

用途: 特定の技術用語、必須フレーズです。

#### 2. 類似度（柔軟）

```yaml
assert:
  - type: similar
    value: file://../golden/01-expected.md
    threshold: 0.7 # 70%の意味的類似度
```

用途: 自然言語出力、表現のバリエーションです。

#### 3. LLM-as-Judge（ルーブリック）

```yaml
assert:
  - type: llm-rubric
    value: |
      Score 1 if the output identifies the vulnerability
      and provides a concrete fix. Score 0 otherwise.
```

用途: 複雑な基準、主観的な品質です。

**ベストプラクティス:** 複数のアサーションを組み合わせます。

```yaml
assert:
  - type: contains
    value: 'SQL injection' # 問題への言及が必須
  - type: llm-rubric
    value: 'Suggests parameterized queries' # 修正案が必須
  - type: similar
    value: file://../golden/01.md
    threshold: 0.6 # 期待出力に類似すべき
```

### 継続的な評価

定期的に評価を実行します。

```bash
# コミット前
npm run eval:fixtures

# CIで（オプション—APIキーが必要）
# .github/workflows/skills-and-tests.ymlを参照
```

スキルの品質をコード品質と同様に扱い、マージ前にテストします。

## ベストプラクティス

### 推奨事項

- **小さく始める**—1つのシンプルなスキルは1つの複雑なスキルより優れている
- **徹底的にテストする**—エッジケースや誤検知のフィクスチャーを追加する
- **意図を文書化する**—スキルが何をするかだけでなく、なぜ存在するかを説明する
- **慎重にバージョニングする**—破壊的変更にはメジャーバージョンバンプが必要
- **フィードバックに基づき反復する**—評価結果を活用して改善する

### 避けるべきこと

- **曖昧にしない**—「コード品質をチェック」は範囲が広すぎる
- **フィクスチャーを省略しない**—テストされていないスキルはドリフトする
- **固有値をハードコードしない**—ファイルパス・名前には変数を使用する
- **誤検知を無視しない**—防止するためのフィクスチャーを追加する
- **重要度を忘れない**—ユーザーが検出結果を優先順位付けできるようにする

## レジストリからの例

### セキュリティスキル

```yaml
# skills/midstream/security-basic/SKILL.md（frontmatter）
id: security-basic
name: Baseline Security Checks
phase: midstream
applyTo: ['src/**/*.{ts,js}']
inputContext: [diff]
modelHint: cheap
severity: major
```

**ユースケース:** すべてのPRに対する高速セキュリティスキャンです。

### アーキテクチャスキル

```yaml
# skills/upstream/adr-decision-quality/SKILL.md
id: adr-decision-quality
name: ADR Decision Quality
phase: upstream
applyTo: ['docs/adr/*.md']
inputContext: [fullFile, adr]
modelHint: high-accuracy
severity: info
```

**ユースケース:** アーキテクチャ決定の徹底的なレビューです。

### テストカバレッジスキル

```yaml
# skills/downstream/coverage-gap/SKILL.md
id: coverage-gap
name: Test Coverage Gap Detection
phase: downstream
applyTo: ['src/**/*.{ts,js}']
inputContext: [diff, tests, coverage_report]
modelHint: balanced
severity: minor
```

**ユースケース:** テストされていないコードパスの特定です。

## レガシーフォーマットからの移行

既存のMarkdownベースのスキルがある場合は段階的に移行します。

```bash
# 1. レジストリフォーマットのスキルを作成
npm run create:skill

# 2. プロンプト内容をコピー
cp skills/midstream/old-skill.md \
   skills/new-skill/prompt/system.md

# 3. メタデータを追加
# skills/new-skill/skill.yamlを編集

# 4. フィクスチャーを追加
# skills/new-skill/fixtures/*.mdを作成

# 5. テスト
cd skills/new-skill
npx promptfoo eval

# 6. 旧スキルを廃止
# （新スキルが検証されるまで保持）
```

## リソース

- **[アーキテクチャ](./river-architecture.md)**—スキルがフレームワークにどう適合するか
- **[スキルスキーマリファレンス](../reference/skill-schema.md)**—完全なスキーマリファレンス
- **[スキルテンプレート](../reference/skill-template.md)**—新しいスキルの出発点
- **[promptfooドキュメント](https://www.promptfoo.dev/)**—評価フレームワーク
- **[スキルカタログ](../reference/skills-catalog.md)**—レジストリ概要
- **[代表スキルのショーケース](../guides/representative-skills.md)**—代表スキルを目的・指示・出力まで通しで解説

## 次のステップ

1. **既存スキルを探索する**—`skills/`ディレクトリで例を確認する
2. **最初のスキルを作成する**—`npm run create:skill`を使用する
3. **フィクスチャーでテストする**—テストケースを追加し`promptfoo eval`を実行する
4. **チームと共有する**—スキルはプロジェクト間で共有可能

スキルはRiver Reviewの心臓部です。チームの知識を再現可能でテスト可能な資産としてエンコードすることで、チームと共に成長するコードレビューの専門知識ライブラリを構築します。
