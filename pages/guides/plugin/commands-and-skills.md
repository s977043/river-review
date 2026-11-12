# コマンド・エージェント・スキル

プラグインが配布するものの一覧です。配布定義は `.claude-plugin/plugin.json`（Claude Code）と `.codex-plugin/plugin.json`（Codex）です。

| 種類               | Claude Code | Codex                |
| ------------------ | ----------- | -------------------- |
| スラッシュコマンド | 配布する    | 配布定義に含まれない |
| サブエージェント   | 配布する    | 配布定義に含まれない |
| スキル             | 配布する    | 配布する             |

`.codex-plugin/plugin.json` は `skills` と `interface` だけを宣言し、`commands` と `agents` を宣言していません。

## コマンド（Claude Code）

`.claude-plugin/plugin.json` の `commands` に登録された 7 件です。説明は各 `commands/*.md` の frontmatter `description` を要約しています。

| コマンド                     | 内容                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `/river-review:setup-team`   | `.river/rules.md` の作成、プラグイン導入の確認、統合モードの確認                               |
| `/river-review:review-local` | 未コミットの変更をレビューし修正案を出す。未コミットの変更がなければ既定ブランチとの差分が対象 |
| `/river-review:review-team`  | 複数ロールの並列レビューを consensusLevel と Tech Lead レポートで統合する                      |
| `/river-review:challenge`    | 現在の変更に pre-mortem / war-game / logic-torturing の敵対的分析をかける                      |
| `/river-review:skill`        | `skills/` から最も合うスキル文書を読み込み、現在のタスクに適用する                             |
| `/river-review:check`        | レビュー前に lint / test を実行し、失敗とリスクを要約する                                      |
| `/river-review:pr`           | テンプレートに沿ってレビュー可能な PR 本文を下書きする                                         |

## エージェント（Claude Code）

| エージェント   | 定義                     | 内容                                                                                    |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `river-review` | `agents/river-review.md` | `river-review` スキルの手順に従い、観点別レビュアーロールを実行して指摘を差分と照合する |

## スキル（Claude Code / Codex）

`skills/agent-skills/` 配下の 12 件です。説明は各 `SKILL.md` の `description` を要約しています。

| スキル                        | 内容                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `river-review`                | メインエントリポイント。意図分類から専門スキルの選択・実行・指摘の検証までを束ねる |
| `river-review-code`           | 一般コード品質。既定のフォールバック先                                             |
| `river-review-security`       | 通常のセキュリティレビュー（認証・認可、プライバシー設計など）                     |
| `river-review-security-audit` | リポジトリやサブシステムを対象にした明示的なセキュリティ監査                       |
| `river-review-performance`    | N+1 クエリ、メモリ効率、キャッシュ戦略、可観測性                                   |
| `river-review-architecture`   | 依存関係、境界設計、データモデル、API 設計                                         |
| `river-review-testing`        | テスト網羅性、命名、フレーキーテスト、カバレッジの欠落                             |
| `river-review-frontend`       | アクセシビリティ、デザインシステム準拠、UI 状態設計など                            |
| `river-review-docs`           | README / docs / AGENTS.md と実装の整合性                                           |
| `adversarial-review`          | Pre-mortem / War Game / Logic Torturing による敵対的レビュー                       |
| `review-team`                 | 6 つの専門レビュアーロールの並列実行と結果の統合                                   |
| `unknown-coverage-review`     | 差分や検証証拠に残る未確認事項（Unknown）の横断合成                                |

Claude Code ではスキルも `/river-review:<skill-name>` で呼び出せます。

## 必要なファイルを読めないときは停止する

本文の `${CLAUDE_PLUGIN_ROOT}` は、読み込み時にプラグインのルートの絶対パスへ置換されます。エージェント・スキル・一部のコマンドはこれを使って同梱ファイルを読みます。Bash の環境変数 `$CLAUDE_PLUGIN_ROOT` は空になるため、Bash での解決は置換されなかったときの予備です。解決できない、またはファイルを読めない場合は、推測や代替基準で処理を続けずに停止します。以前は黙って代替していた場面でも、現在は停止して理由を報告します。

| 対象                                                | 停止の条件                                     | 報告される内容                                                 |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `river-review` エージェント / `river-review` スキル | `river-review` の `SKILL.md` を読めない        | 「Skill Registry が未解決のためレビューを実行できない」        |
| `/river-review:setup-team`                          | `.river/rules.template.md` を読めない          | 「テンプレートが見つからない」（`.river/rules.md` は作らない） |
| `/river-review:review-team`                         | `review-team` の `SKILL.md` を読めない         | 「スキル定義が見つからない」と、試したパスと理由               |
| `/river-review:skill`                               | 他スキルから委譲されたスキル ID を解決できない | 未解決として記録し、キーワード検索や推測で補わない             |
| PR を対象にしたレビュー                             | `gh` が使えず、`git fetch` でも差分を取れない  | PR の diff を渡すよう依頼する                                  |

### 停止したときの確認手順

1. 停止の報告に書かれた「試したパス」を確認する。Read が作業ディレクトリ外として拒否されていれば、プラグインのルートを `--add-dir <plugin root>` または `permissions.additionalDirectories` に追加して再実行する。急ぐ場合は、依頼文で `SKILL.md` の絶対パス（例: `~/.claude/plugins/cache/<marketplace>/river-review/<version>/skills/agent-skills/river-review/SKILL.md`）を指定する。なお、Bash の `echo "$CLAUDE_PLUGIN_ROOT"` はプラグインが正しく読み込まれていても空になるため、確認には使えない。
2. `claude plugin list` で `river-review@river-review-marketplace` が導入済みで有効になっているか確認する。無効なら `claude plugin enable`、古いなら `claude plugin update` を実行し、Claude Code を再起動する（[更新・無効化・アンインストール](./update-and-uninstall.md)）。
3. それでも解決しない場合は、アンインストールしてから[導入手順](./install.md)に沿って入れ直し、再起動後にもう一度実行する。
4. PR を対象にしたレビューで止まった場合は、`gh` を使えるようにするか、`git diff <base>...<head>` の出力を渡す。

プラグインのルートを解決できないときにリポジトリのルートを代わりに使うのは、river-review リポジトリ自身の中で動かす場合だけです。

## 実利用の証拠を残す

この手順では、導入先での利用は Plugin を前提とし、River Review CLI は River Review 本体の開発・検証で使います。スキル本文の手動適用は、実際の Plugin ランタイム呼び出しとは区別して記録します。

同じ変更で改善前後を比べるときは、次の短い記録を使えます。これは任意の利用メモです。[Review Artifact](../../reference/review-artifact.md) のスキーマや承認記録を新設しません。既存の出力があれば参照します。

### 導入とレビューを分けて確認する

- **登録**: 設定や marketplace に名前がある。セッションで読み込まれた証拠にはならない。
- **読込**: 対象セッションが同梱スキルを読めた。対象への適用や完了は別に確認する。
- **実行**: 入力 revision と適用したスキル、実際の出力を照合できる。自己レビュー・別セッション・手動委譲・自動 dispatch を区別する。
- **効果確認**: 指摘の正答ラベルまたは人間による評価がある範囲だけで判断する。finding 0 件や反復回数だけで品質を保証しない。

配布定義の静的確認や mock は、Plugin ランタイムでの実行として数えません。停止・skip・unsupported・モデル未実行は理由とともに残し、成功へ読み替えません。観測できない状態は「不明」とします。通常の Plugin 利用ではホストのモデルがスキルを適用するため、River Review 用 API キーが無いことだけでは「モデル未実行」と判定できません。

### 記録テンプレート

```text
事例 ID / 日時:
製品 version / commit SHA / 利用経路 / ホスト version:
モデル / effort / 実行条件: 不明なら不明
タスク種別 / 安全な入力 ID / 対象 revision:
期待した挙動:
観測した挙動 / 証拠の参照:
登録 / 読込 / 実行 / 効果確認: 各段階の観測と未確認
工程別の適用: 上流定義 / 要求・要件 / 計画 / 設計 / コード / QA
  各工程: 対象外・未実行・実行済みを区別し、入力と出力を参照
指摘の採用・棄却・保留 / 判断者と理由:
誤検知 / 見逃し / 役立ち度 / 人手時間: 実測または未測定
公開可能な最小再現手順 / 改善前後の revision と結果:
残る限界 / 次の確認:
```

工程名は利用メモ用で、Flow の入口名や実行済みの証明ではありません。コードレビューを完了しても、要件や QA のレビューまで完了したとは扱いません。スキル本文を手動で適用した場合も、その事実を記録し、Plugin のロードや自動委譲を検証したと主張しません。

### 記録例とフィードバック

独立した説明用の例（実行ログではありません）:

- `example-load-only`: 登録とスキル読込の証拠はあるが対象入力へ未適用。実行は未実行、効果は未測定。
- `example-zero-findings`: 対象 revision とレビュー出力を確認し、指摘は 0 件。実行は確認できるが、正答ラベルや人間評価が無ければ効果は未測定。
- `example-unsupported`: ホストが要求されたサブエージェントをサポートしない。未実行として制約を記録し、手動で補った結果と分ける。

フィードバックは既存 Issue / PR を調べ、同じ問題なら証拠を追記します。公開には独立した最小入力と再現できた製品挙動を使い、private repository のリンク・内部パス・ソース・会話・認証情報を転載しません。非公開証跡の公開が必要なら所有者に確認します。再検証は同じ入力・条件で比較し、条件が変わった部分と未測定を残します。利用メモやレビューの証拠から、Human / Host の承認や merge 権限を作りません。

## 関連ページ

- [プラグインを導入する](./install.md)
- [AI エージェントから River Review を使う](../agent-workflow.md)
