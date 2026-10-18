# Community and first contributor paths

River Review に関心を持った人が、Star のあとに質問・相談・小さな貢献へ進めるようにするための導線を整理します。Star で終わらせず、試用 / Issue / Discussion / 小さな貢献につなげることで、継続的な認知を作ります。

> 親エピック: [#1276](https://github.com/s977043/river-review/issues/1276) / 追跡 Issue: [#1280](https://github.com/s977043/river-review/issues/1280)

## Star のあとの次の一歩

1. **試す**: [はじめる](../../pages/guides/quickstart.md)（プラグイン / GitHub Actions、API キー不要のデモあり）。
2. **読む**: [plan-conformance デモ](../../examples/plan-conformance-demo/README.md)で中核価値を 5 分で把握する。
3. **相談する**: 導入の質問は Discussions の Q&A へ。
4. **貢献する**: `good first issue` から小さく始める（下記）。

## Issue と Discussion の使い分け

| 種類       | 使う場面                                                                         |
| ---------- | -------------------------------------------------------------------------------- |
| Discussion | 質問・相談・アイデア出し・利用例の共有など、まだ「やること」が確定していない対話 |
| Issue      | バグ・機能提案・タスクなど、対応すべき作業が具体化したもの                       |

迷ったら Discussion から始め、対応方針が固まった段階で Issue 化する運用とします。

## Discussions カテゴリ（提案）

| カテゴリ      | 用途                         |
| ------------- | ---------------------------- |
| Announcements | リリース・記事の告知         |
| Q&A           | 導入・設定の質問             |
| Show and Tell | River Review の利用例の共有  |
| Ideas         | skill 案・ユースケースの提案 |

> カテゴリの有効化はリポジトリ管理者の操作です（Settings → Features → Discussions、および各カテゴリ作成）。

## 最初の Discussion 案

Q&A もしくは Ideas に、議論の口火を切る投稿を用意します。

```text
How would you use River Review in your AI-assisted development workflow?
```

日本語併記案:

```text
あなたの AI 支援開発ワークフローで、River Review をどう使いますか？
```

## good first issue 候補

初めての貢献者が着手しやすい、スコープの小さい候補です（起票はメンテナが行います）。

- `docs: add a README diagram for Review Judgment as Code`（README 図解の追加）
- `docs: improve GitHub Topics and repository metadata`（Topics / メタデータ整備）
- `docs: expand examples/ with another minimal scenario`（最小シナリオの追加）

## メンテナンス負荷への配慮

- Discord / Slack など外部コミュニティの常時運用は行わない。
- 大規模なコントリビューター制度は設けず、Issue / Discussion / CONTRIBUTING の 3 点で導線を完結させる。
- 常時サポート体制は約束しない。対応は best-effort とし、その旨を明示する。
