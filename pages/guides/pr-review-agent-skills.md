---
title: PR/品質レビュー向け Agent Skills カタログ
---

外部で公開されている Agent Skills（および周辺 OSS ツール）のうち、River Review の PR レビューやコード品質レビューに組み込めそうなものを素早く評価できるようにまとめました。Skill 形式のものは `skills/agent-skills/` に追加し、`npm run agent-skills:validate` で検証できます。`agentcheck-code-review` は、このリポジトリにパッケージとして取り込み済みです。

## 取り込みパス（リポジトリ内に内包する手順の基本）

1. `skills/agent-skills/<skill-name>/` を作成し、`SKILL.md` を配置する（必要に応じて `references/` などを同梱）。
2. River Review のフェーズや出力形式に合わせて必要な修正を行い、`npm run agent-skills:validate` で検証する。
3. ナビゲーションや導入ガイドに追記が必要な場合は `pages/guides/` 配下に補足を書く（本ページを参照）。

## 1. AI-Agent-Skills リポジトリ（汎用スキル）からの候補

コミュニティ公式カタログに含まれるスキル。`git submodule` などで取り込まずに、中身（`SKILL.md`）を確認して必要部分だけをコピーする運用を推奨します。

| スキル名                 | 主な用途                                                            | 導入時の着眼点                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-review`            | PR 差分を解析し、自動コメントや改善提案を行うコードレビュー Skill。 | - diff/ファイル単位での観察範囲が十分か。<br/>- レビュー出力フォーマットが River Review の `output.schema` に近いか。<br/>- lint や既存ルールと競合しないか。 |
| `code-refactoring`       | コード構造や可読性の改善提案を行うリファクタリング支援 Skill。      | - 大規模リファクタを避け、段階的提案を出せるか。<br/>- テスト追加を促す文言を含めるか。                                                                       |
| `webapp-testing`（参考） | Web アプリ向けのテスト観点を補完する Skill。                        | - E2E テスト依存やブラウザ環境前提の指示が過剰でないか。                                                                                                      |

評価の際は、Skill 本文のチェックリストが River Review のフェーズ（upstream/midstream/downstream）と合うか、`inputContext` に diff/テスト結果などが要求されていないかを確認します。

## 2. コミュニティ公開のレビュー特化 Skill / OSS

Agent Skills 形式またはそれに近い形で公開されているコミュニティスキル・ツール。Skill 形式なら `skills/agent-skills/` 配下で直接管理し、OSS ツールなら Runner や GitHub Actions と組み合わせて利用できます。

| 名称                            | 形式               | 主な特徴                                                                     | 導入メモ                                                                   |
| ------------------------------- | ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@bjpl/aves/github-code-review` | Claude Skill       | GitHub PR の差分を解析し、コメント提案を生成する特化 Skill。                 | 公開 PR 前提が多いため、プライベートリポジトリ利用時の権限・認可を要確認。 |
| `devlyai/AgentCheck`            | OSS エージェント群 | ローカルリポジトリ全体を読み込み、カスタムルール付きでコードレビューを行う。 | プロジェクト固有ルールを追加しやすい。Docker/Node 依存を事前に確認。       |

注記: `@bjpl/aves/github-code-review` の旧カタログURLは、2026年11月17日のCIでHTTP 402を返しました。配布元とライセンスを独立確認できるまで導入対象に含めず、参考情報として扱います。

## 3. 取り込み時のチェックリスト

1. **スキーマ適合**: `SKILL.md` フォーマットが Agent Skills 仕様に沿っているか（メタデータの必須キー、意図しない拡張フィールドがないか）。
2. **フェーズ整合性**: River Review フェーズ（upstream/midstream/downstream）に割り当てられるか。必要に応じて `phase` を再マッピングする。
3. **入力コンテキスト**: `inputContext` に要求される情報（diff, tests, fullFile）が Runner で提供できるかを確認。提供できない場合は指示を削る。
4. **出力形式**: River Review の `output.schema.json` に近い形で出力できるか。差分がある場合は post-processing スクリプトを用意する。
5. **テスト/検証**: 取り込み後に `npm run agent-skills:validate` と `npm test` を実行し、lint (`npm run lint`) で Markdown/JSON を整える。
6. **運用ルールへの適合**: セキュリティ（秘密情報の扱い）、コメントトーン（日本語優先）、過度な自動修正提案を避けるなど、River Review のガイドラインに従う。
7. **ライセンスとポリシー確認**: 取り込む Skill / OSS のライセンスが自社ポリシーに適合するか、二次配布やクローズド環境での利用制約がないかを確認する。

## 4. 短期導入プランのサンプル

1. `code-review` と `code-refactoring` を `skills/agent-skills/` に追加し、`phase: [midstream, downstream]` で試験適用。
2. Runner との統合テストを行い、既存スキルとの競合（重複コメント、冗長提案）を洗い出して調整。
3. 社内レビュー方針に合わせたカスタム Skill を作成し、上記 OSS から有用なチェックリストやプロンプト断片のみを再利用する。

## 5. 参考リンク

- Agent Skills カタログ: [https://github.com/skillcreatorai/Ai-Agent-Skills](https://github.com/skillcreatorai/Ai-Agent-Skills)
- Awesome Agent Skills（コミュニティまとめ）: [https://github.com/travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
- AgentCheck: [https://github.com/devlyai/AgentCheck](https://github.com/devlyai/AgentCheck)
