# GitHub Actions ワークフロー

`.github/workflows/` にある 28 本のワークフローの入口ドキュメントです。「どのワークフローが何をするのか」「どれが必須チェックなのか」「新しく 1 本追加するときに何をすべきか」をここから辿れます。

各行の内容は実際の YAML の `on:` とジョブ定義から転記しています。ワークフローを追加・削除・改名したときは、この README も同じ PR で更新してください。

## 必須チェック（branch protection）

`main` の branch protection が要求する必須チェックは 7 件です。うち 6 件は `test.yml`（ワークフロー名 `CI`）のジョブで、残る 1 件が `blocked-label-guard.yml` の `Blocked label guard` です。

| 必須チェック名 (context)  | ワークフロー                                       | ジョブキー            | 実行内容                                                                                                                 |
| ------------------------- | -------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Lint`                    | `test.yml`（`CI`）                                 | `lint`                | `npm run lint`（`lint:sh` = shellcheck を含む）                                                                          |
| `Unit tests (22.x)`       | `test.yml`（`CI`）                                 | `test`                | `npm test`（`package.json` の `test` が `--experimental-test-isolation=none` を持つ）とカバレッジの Codecov アップロード |
| `Skill schema validation` | `test.yml`（`CI`）                                 | `skill-validation`    | skill / promptfoo / agent-skill / 参照 / manifest / registry の 6 検証                                                   |
| `Meta consistency`        | `test.yml`（`CI`）                                 | `meta-check`          | `npm run meta:validate` と `npm run plugin:validate`                                                                     |
| `Action dist freshness`   | `test.yml`（`CI`）                                 | `dist-check`          | `dist/` を触る変更、および鮮度判定で古いと出た変更を再ビルドしてバイト比較                                               |
| `Integration (CLI)`       | `test.yml`（`CI`）                                 | `integration-test`    | `tests/integration/local-review.test.mjs`                                                                                |
| `Blocked label guard`     | `blocked-label-guard.yml`（`Blocked Label Guard`） | `blocked-label-guard` | `blocked` などマージ阻止ラベルの有無を event payload から判定する                                                        |

間違えやすい点が 3 つあります。

- ファイル名が紛らわしい。必須チェック `Skill schema validation` は `skill-validation.yml` ではなく `test.yml` のジョブである。`skill-validation.yml` はワークフロー名が `Scheduled Validation` の週次ジョブで、必須チェックではない
- `test.yml` のジョブがすべて必須なわけではない。`engine-install`（`Engine-only install (--omit=dev)`）は必須チェックに登録されていない
- context 名はジョブの `name` に由来する。matrix があると `<ジョブ名> (<matrix 値>)` になるため、`test` ジョブの context は `Unit tests` ではなく `Unit tests (22.x)` である

`strict: true` が有効なため、PR ブランチが `main` に追随していないとマージできません。複数 PR をまとめてマージするときの手順は [CLAUDE.md](../../CLAUDE.md) の「Strict-mode batch merge」を参照してください。

### 実物を確認するコマンド

このドキュメントを信じる前に、必ず実物を確認してください。

```bash
# 必須チェックの context 一覧
gh api repos/s977043/river-review/branches/main/protection/required_status_checks \
  --jq '.checks[].context'

# strict モードの有無
gh api repos/s977043/river-review/branches/main/protection \
  --jq .required_status_checks.strict

# ruleset 側にも必須チェックが定義されていないかの確認
gh api repos/s977043/river-review/rulesets --jq '.[] | {id, name, enforcement}'
gh api repos/s977043/river-review/rulesets/<id> --jq '[.rules[].type]'
```

必須チェックは classic branch protection 側にのみ定義されています。ruleset「Main Branch Protection」が持つルールは `deletion` と `non_fast_forward` の 2 つだけで、`required_status_checks` は含みません（2026-08-02 時点）。

## ワークフロー一覧（28 本）

ファイル名の昇順です。「必須」列の `-` は branch protection の必須チェックではないことを示します。

| ファイル                                 | ワークフロー名                     | トリガー                                                                                                                             | 目的                                                                                                                                                        | 必須       |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `auto-fix-dashes.yml`                    | Auto Fix Dashes                    | `schedule`（`0 3 * * 6` = 毎週土 03:00 UTC）                                                                                         | `npm run fix:dashes` でダッシュ前後の空白を正規化し、差分があれば PR を自動作成する                                                                         | -          |
| `auto-milestone.yml`                     | Auto-assign milestone from labels  | `issues`（opened / labeled / reopened）                                                                                              | `m1-public` などのラベルから対応するマイルストーンを Issue に自動設定する                                                                                   | -          |
| `auto-rebuild-action-dist.yml`           | Auto Rebuild Action Dist           | `pull_request`（`runners/github-action/src/**` / `runners/core/**` / `src/**` / `package-lock.json`）                                | 同一リポジトリの PR で `dist/` が古ければ再ビルドし、PR ブランチへ push する                                                                                | -          |
| `blocked-label-guard.yml`                | Blocked Label Guard                | `pull_request`（opened / reopened / synchronize / labeled / unlabeled）                                                              | `blocked` などマージ阻止ラベルが付いた PR でジョブを落とし、マージを機械的に止める                                                                          | 1 件       |
| `build.yml`                              | Build Docusaurus Site              | `pull_request`（`pages/**` / `docs/**` / `docusaurus.config.js` / `sidebars.js` / `package.json` / `package-lock.json`）             | ドキュメントサイトが `npm run build` でビルドできることを確認する                                                                                           | -          |
| `codeql.yml`                             | CodeQL                             | `push`（main）/ `pull_request`（main）/ `schedule`（`30 2 * * 1` = 毎週月 02:30 UTC）                                                | JavaScript の静的セキュリティ解析を実行する                                                                                                                 | -          |
| `deploy.yml`                             | Deploy to GitHub Pages             | `push`（main）/ `workflow_dispatch`                                                                                                  | Docusaurus をビルドして GitHub Pages へデプロイする                                                                                                         | -          |
| `diataxis-docs-check.yml`                | Diátaxis Docs Check                | `pull_request`（opened / edited / synchronize）                                                                                      | `pages/` を触る PR に Diátaxis 種別の記載を促すコメントを付ける                                                                                             | -          |
| `doc-quality.yml`                        | Doc Quality                        | `pull_request`（`*.md` 系）/ `schedule`（`30 2 * * 1`）/ `workflow_dispatch`                                                         | `check:bilingual` と `check:doc-placement` を実行する。ジョブを落とすのは配置違反のみ                                                                       | -          |
| `hol-plugin-scanner.yml`                 | HOL Plugin Scanner                 | `push`（main）/ `pull_request`（main）                                                                                               | AI プラグインスキャナで走査し、SARIF を GitHub Security へ送る                                                                                              | -          |
| `link-check.yml`                         | Link Check                         | `pull_request`（`**/*.md` / `.lychee.toml` / `.lycheeignore`）/ `schedule`（`0 2 * * 1`）/ `workflow_dispatch`                       | lychee で Markdown のリンク切れを検出する                                                                                                                   | -          |
| `nightly-audit.yml`                      | Nightly Measure & Audit            | `schedule`（`0 18 * * *` = 毎日 18:00 UTC / 03:00 JST）/ `workflow_dispatch`                                                         | レビュー品質シグナルを計測し、監査レポートと台帳を artifact に残す                                                                                          | -          |
| `nightly-eval.yml`                       | Nightly Eval                       | `schedule`（`0 19 * * *` = 毎日 19:00 UTC / 04:00 JST）/ `workflow_dispatch`                                                         | 統合 eval を実行し、KPI 退行を検出したら Issue を作る                                                                                                       | -          |
| `plugin-scanner-ignore-paths-notice.yml` | Plugin Scanner Ignore Paths Notice | `pull_request`（`.plugin-scanner.toml`）                                                                                             | `.plugin-scanner.toml` の `ignore_paths` 差分と、それが検査対象から外す・戻すファイルを PR コメントへ出す。注意喚起のみでマージは止めない                   | -          |
| `plangate-review.yml`                    | PlanGate Review (PR)               | `pull_request`（main 宛て、opened / synchronize / reopened）                                                                         | PlanGate 成果物に `river review plan` / `exec` / `verify` を適用する。CLI 実装待ちの feature flag 付き                                                      | -          |
| `promptfoo-eval.yml`                     | Promptfoo Eval (community skills)  | `workflow_dispatch`                                                                                                                  | community skill の promptfoo eval を手動実行し、golden 候補を artifact に出す                                                                               | -          |
| `prose-lint.yml`                         | Prose Lint                         | `pull_request`                                                                                                                       | Vale で追加行の文章スタイルを検査する                                                                                                                       | -          |
| `release-please-kick.yml`                | [DEPRECATED] Release Please Kick   | `workflow_dispatch`                                                                                                                  | **deprecated（refs #1800）**。`RELEASE_KICK_PAT` 未登録のため実行しても CI を再発火できない。kick は `scripts/release-please-kick.sh` を使う                | -          |
| `release-please.yml`                     | Release Please                     | `push`（main）/ `workflow_dispatch`                                                                                                  | リリース PR の生成、タグ付け、major alias タグ更新、リリースノートへの skill 差分追記を行う                                                                 | -          |
| `river-review-upstream.yml`              | River Review (upstream)            | `workflow_dispatch` / `pull_request`（要件・仕様・ADR・OpenAPI などのパス）                                                          | upstream フェーズの River Review を dry-run で実行する                                                                                                      | -          |
| `river-review.yml`                       | River Review                       | `workflow_dispatch` / `pull_request`（main 宛て、opened / synchronize / reopened / labeled）                                         | `river-review` ラベル付き PR に midstream レビューを実行する。advisory であり、ジョブは落とさない                                                           | -          |
| `riverbed-persist.yml`                   | Riverbed Memory Persist            | `workflow_call`                                                                                                                      | Riverbed Memory の index を artifact として引き継ぐ再利用ワークフロー                                                                                       | -          |
| `scorecard.yml`                          | OpenSSF Scorecard                  | `push`（main）/ `schedule`（`30 1 * * 6` = 毎週土 01:30 UTC）/ `branch_protection_rule`                                              | OpenSSF Scorecard を実行し、SARIF を送る                                                                                                                    | -          |
| `skill-eval.yml`                         | Skill Evaluation                   | `push`（main）/ `pull_request`（skill の `eval` / `prompt` / `fixtures` / `golden`）/ `schedule`（`0 0 * * 1`）/ `workflow_dispatch` | eval 設定を持つ skill を検出し、matrix で検証してサマリーを出す。API キー未登録のため実際の eval は skip され、設定検証まで縮退する（必須チェックではない） | -          |
| `skill-validation.yml`                   | Scheduled Validation               | `schedule`（`0 3 * * 1` = 毎週月 03:00 UTC）/ `workflow_dispatch`                                                                    | validate / test / lint / build を定期実行し、失敗ごとに Issue を作る                                                                                        | -          |
| `test.yml`                               | CI                                 | `push`（main）/ `pull_request` / `workflow_dispatch`                                                                                 | lint、単体テスト、skill schema、meta、dist 鮮度、CLI 統合、engine-only install を実行する                                                                   | 6 件すべて |
| `validate-agents.yml`                    | Validate Agent Specs               | `pull_request` / `push`（main）（`agents/**` などのパス）                                                                            | agent 定義のスキーマ検証を実行する                                                                                                                          | -          |
| `weekly-gc.yml`                          | Weekly GC                          | `schedule`（`0 0 * * 1` = 毎週月 00:00 UTC）/ `workflow_dispatch`                                                                    | lint / test / build を週次で回し、失敗したら Issue を作る                                                                                                   | -          |
| `zenn-watch.yml`                         | Zenn Watch                         | `schedule`（`0 20 * * 2` = 毎週火 20:00 UTC）/ `workflow_dispatch`                                                                   | Zenn RSS の新着を digest Issue に追記する                                                                                                                   | -          |

複数ジョブを持つワークフローのジョブ構成は次のとおりです。

- `test.yml`: `lint` / `test` / `skill-validation` / `meta-check` / `dist-check` / `integration-test` / `engine-install`（`lint` 以外は `lint` に `needs` で依存）
- `deploy.yml`: `build` / `deploy`
- `plangate-review.yml`: `plan-review` / `exec-review` / `verify`
- `skill-eval.yml`: `discover-skills` / `evaluate`（matrix）/ `summary`

## 新しいワークフローを追加する

### 1. 必須チェックにするかを決める

必須チェックにしてよいのは、**すべての PR で必ず起動し、決定論的に緑になる**ジョブだけです。次のいずれかに当てはまるものは必須チェックにしないでください。

- `paths:` フィルタが付いている。そのパスを触らない PR ではジョブが起動せず、context が永久に未報告のままマージ不能になる
- `schedule` や `workflow_dispatch` のみで動く
- LLM の API を呼ぶ、外部サービスに依存するなど結果が非決定論的である
- advisory な指摘のみを目的とし、失敗させる意図がない（例: `river-review.yml`）
- fork からの PR で権限不足により動作しない

必須チェック 7 件のうち 6 件が `test.yml` に集中しているのは、この基準を満たすジョブが `test.yml` に固まっているからです。例外の `Blocked label guard` は `paths:` フィルタを持たず、event payload だけで決定論的に判定するため基準を満たします。

### 2. 必須チェックにしない場合

ワークフローを追加し、この README の一覧に 1 行足して PR を出すだけです。branch protection の変更は不要です。

### 3. 必須チェックにする場合の登録順序

未報告の context が 1 つでもあると、すべての PR が `N of N required status checks are expected` で止まります。この事故を避けるため、**新規に必須チェックを増やすときはワークフローを先にマージ**し、`main` と PR の両方で実際に context が報告されて緑になることを確認してから、branch protection に登録します。

```bash
# 1. ワークフローをマージしたあと、context が実際に報告されるか確認する
gh pr checks <PR番号>

# 2. 既存の必須チェック一覧を取得する
gh api repos/s977043/river-review/branches/main/protection/required_status_checks \
  --jq '.checks'

# 3. 取得した配列に新しい context を足して PATCH する（既存要素の app_id は保持する）
gh api -X PATCH repos/s977043/river-review/branches/main/protection/required_status_checks \
  --input - <<'JSON'
{
  "strict": true,
  "checks": [
    { "context": "Lint", "app_id": 15368 },
    { "context": "<新しい context 名>", "app_id": 15368 }
  ]
}
JSON
```

`app_id` は GitHub Actions のアプリ ID（現状 `15368`）です。この配列は全置換なので、既存の 7 件を省略すると必須チェックから外れてしまいます。手順 2 で取得した配列へ追記する形が安全です。

一方、**既存の必須チェックの名前を変える場合（matrix leg の増減・改名・ジョブ名の変更）は逆で、branch protection を先に更新します**。この順序と背景は [CLAUDE.md](../../CLAUDE.md) の AI Misoperation Guards「CI matrix leg ↔ branch-protection required-check sync」が SSoT です。ここでは重複させないので、必ずそちらを読んでください。

### 4. context 名の決まり方に注意する

必須チェックの context 名はジョブの `name`（未指定ならジョブキー）です。matrix があると `<ジョブ名> (<matrix 値>)` になります。つまり **ジョブの `name` を書き換えるだけでも必須チェックは壊れます**。`name` を変えるときは、必須チェックに登録済みかどうかを先に確認してください。

## 共通の約束事

- Node をセットアップするのは 28 本中 15 本で、うち 13 本は `./.github/actions/setup-node-deps`（composite action）を使う
- ただし composite の既定は `.nvmrc` ではなくリテラル `22.x` である（`.nvmrc` は `22.22.2`）。ncc の出力が Node メジャーで変わるため、dist を再ビルドする `auto-rebuild-action-dist.yml` と `test.yml`（`dist-check` / `engine-install`）だけは `node-version-file: '.nvmrc'` を厳密に指定する。composite を使わない `promptfoo-eval.yml` も同じ指定である
- サードパーティ action は commit SHA でピン留めする。現状 `scorecard.yml` の `ossf/scorecard-action@v2.4.4` だけがタグ参照である
- `permissions:` は 28 本すべてが top-level で宣言している。読み取りだけで済むものには `read-all` か `contents: read` を置き、書き込みが要るジョブにだけスコープを足す。`auto-milestone.yml` は `issues: write` のみを与える最小例である
- 共有状態（ref・デプロイ・Issue・外部リソース）に触れるワークフローには `concurrency:` グループを設定する。読み取り専用のジョブでは省略してよい。現状 28 本中 26 本が設定済みで、例外は `hol-plugin-scanner.yml` と `blocked-label-guard.yml` の 2 本である
- **必須チェックのワークフローには `concurrency:` を設定しない。** グループ内で cancel された run は `cancelled` の check-run を残し、pass でも fail でもない結論として必須チェックの判定を止める。`cancel-in-progress: false` にしても避けられない。グループ内に pending の run がある状態で新しい run が queue に入ると、既存の pending が cancel されて新しい run が置き換わる仕様のためである（[workflow-syntax#concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)）。`blocked-label-guard.yml` はこの事故（#1778）を受けて `concurrency:` を外している
- `GITHUB_TOKEN` による push は下流の `pull_request` ワークフローを再発火させない（GitHub の再帰防止仕様）。dist 再ビルドや release-please のキックでこの制約に当たった場合の脱出手順は [CLAUDE.md](../../CLAUDE.md) の「`N of N required checks are expected` = bot/`GITHUB_TOKEN` push」を参照する
- ワークフローや CI 自動化をマージする前のレビュー観点（並行実行・既定値の結合・部分失敗）は [AGENTS.md](../../AGENTS.md) の「Code-gen review」に従う

## 関連ドキュメント

- [../../docs/runbook/dev.md](../../docs/runbook/dev.md) — ローカル開発と PR 前チェック
- [../../docs/governance.md](../../docs/governance.md) — PR レビューとマージ前チェックリスト
- [../../docs/development/dist-check-rebuild-guide.md](../../docs/development/dist-check-rebuild-guide.md) — `Action dist freshness` が落ちたときの対処
- [../../docs/runbook/bot-pushed-head-kick.md](../../docs/runbook/bot-pushed-head-kick.md) — release-please ブランチの kick 手順（正は `scripts/release-please-kick.sh`、`release-please-kick.yml` は deprecated）
- [../../docs/development/link-checking.md](../../docs/development/link-checking.md) — `link-check.yml` と lychee の設定
- [../../docs/development/skill-eval-kpi.md](../../docs/development/skill-eval-kpi.md) — `skill-eval.yml` / `nightly-eval.yml` が測る KPI
- [../../docs/runbook/community-skill-eval.md](../../docs/runbook/community-skill-eval.md) — `promptfoo-eval.yml` の運用手順
- [../../docs/runbook/zenn-watch.md](../../docs/runbook/zenn-watch.md) — `zenn-watch.yml` の digest 運用
