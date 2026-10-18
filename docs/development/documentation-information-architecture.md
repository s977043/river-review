# Documentation information architecture — 2026-10-18

## 目的

OSS 訪問者にとって読みやすい README と、維持可能な公開・開発ドキュメントを実現する。情報の削除や URL の変更を目的とせず、正本の判別と読み手に合った導線を優先する。

## 棚卸し時点

- Repository: `s977043/river-review`、基点 `b7139d8`（2026-10-18）
- Root: 42 files / 29 directories（うち root `*.md` 12 ファイル）
- `pages/`: 213 files、日本語 Markdown 107 / 英語 Markdown 106
- `docs/`: 169 files、うち Markdown 163
- 日本語ページで英語版がないファイル: `pages/use-cases/maintenance-evidence-review.md`
- URL 正本: `https://river-review.the3396.com/`、公開ソース: `pages/`

## 守るべき境界

1. 公式公開Docsの正本は `pages/`。リポジトリ内公開の保守資料 `docs/` とは分離する。
2. `.claude-plugin/`、`.codex-plugin/`、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`LICENSE*`、`CITATION.cff`、`CHANGELOG.md`、設定ファイル、ランタイムは表示上の整理だけでは移動しない。
3. README は価値・導入・公式Docs・貢献・セキュリティに限定する。コマンドの詳細説明は `pages/guides/` と `pages/reference/` を正本にする。
4. GitHub が認識する `CONTRIBUTING*`、`CODE_OF_CONDUCT.md`、`SECURITY.md` は `.github/` に集約できるが、相対リンク・外部直リンクの更新が前提。
5. URL と doc ID の維持。ナビゲーション変更は `scripts/check-sidebar-reachability.mjs` で検証する。

## レビュー観点（ループ）

- **L1—情報境界**: 公開 GitHub を「非公開」と誤記しない。重複した正本を増やさない。
- **L2—配置とリンク**: GitHub Communityファイルの検出、README・公開Docs・ツール内のリンク、CI のパス条件を点検する。
- **L3—利用者体験**: 日本語・英語で同じ導入方法を示す。Claude Code / Codex / GitHub Actions の入口を明確にする。主要CLI契約は既存ページに委譲する。

## 継続的な検証

```sh
npm run check:doc-placement
npm run check:bilingual
npm run check:sidebar-reachability
npm run check:links:local
npm run meta:validate
npm run build
```

移動のためにテストfixtureの参照文字列を無条件に置換しない。fixtureの参照が実際のファイルパスを指している場合のみ更新する。

## 将来の候補（今回の小さな変更と分離）

- `docs/development/` の文書ごとに現役 / 設計記録 / 古い資料を分類し、必要なものだけ `docs/adr/`・`docs/runbook/` 等へ移す。
- `ROADMAP.md` はリンク参照が多く、公開ガイドとGitHub Projectsの責務を整理してから判断する。
- `AGENT_LEARNINGS.md` はエージェント設定・回帰fixture等から参照されるので移動しない。
- `pages/` の内部専用ページの扱いは、URL維持またはリダイレクトの根拠を確認してから変更する。
