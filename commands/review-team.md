---
description: 'Run review-team skill: parallel multi-role review with consensusLevel and Tech Lead report'
argument-hint: '[pr-number] [role1,role2,...]'
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git fetch:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh repo view:*), Bash(npm run river:*)
---

スキル定義: `skills/agent-skills/review-team/SKILL.md`

## Context

- Status: `git status`
- Recent commits: `git log --oneline -10`

## 対象の解決

引数: `$ARGUMENTS`

引数のうち数字だけのトークンを PR 番号 `N`、それ以外をロール指定（Step 1）として扱う。対象の差分は次の順で決める。

1. 引数に PR 番号 `N` がある場合: `gh pr diff N` を diff とし、`gh pr view N --json headRefOid,files` を対象コミットと変更統計とする。ローカルの作業ツリーやブランチの diff は使わない。
2. 引数に PR 番号が無く、現ブランチに open の PR がある場合（`gh pr view --json number,state --jq 'select(.state=="OPEN") | .number'` が番号を出力する場合）: その PR を対象にし、1 と同じコマンドで取得する。`gh pr view` は同名ブランチのマージ済み・クローズ済み PR にも一致するため、open 以外は使わない。未コミットの変更（`git diff` / `git diff --cached`）があれば、PR の diff に加えてレビューする。
3. 引数に PR 番号が無く、現ブランチに open の PR が無い場合（上のコマンドが何も出力しないか失敗する場合）: `git diff <base>...HEAD` と未コミットの変更（`git diff` / `git diff --cached`）を合わせて diff とする。`<base>` は `origin/<デフォルトブランチ>` とし、デフォルトブランチ名は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で得る。ローカルのブランチは遅れていることがあるため、先に `git fetch origin <デフォルトブランチ>` を実行する。

どの経路でも diff が空の場合だけ、「差分がありません」と伝えて終了する。

出力の 1 行目に、使った対象を次のいずれかで書く。

- `対象: PR #N（gh pr diff N / head <headRefOid>）`
- `対象: 現ブランチの PR #N（gh pr diff N / head <headRefOid>）`（未コミットの変更を含めた場合は `+ 未コミットの変更` を付ける）
- `対象: ローカル diff（git diff <base>...HEAD + 未コミットの変更）`

## Task

`review-team` スキルの手順に従い、上で決めた対象の差分をレビュー・チームで検査する。

### Step 1: ロールを決定する

引数でロールが指定された場合はそれを使う。なければ `auto`（差分から自動選択）。

### Step 2: レビューを実行する

River Review は npm 未公開のため `npx river-review` は使えない。**エージェントがこのスキルの手順を直接実行する**（CLI 不要）。上記 Step 1 で決めたロールを並列に走らせ、Union-Find で finding を統合し、consensusLevel と teamLeadReport を生成する。

リポジトリ内で作業していて `river` CLI をアクセラレータとして使える場合のみ、次を利用してよい（任意）。コスト確認が必要なら先に `--dry-run`。

```bash
# auto モード（推奨）
npm run river -- run . --reviewers auto --output json

# ロール明示指定
npm run river -- run . --reviewers <role1,role2,...> --output json
```

CLI が存在しない、または失敗した場合は、スキル駆動のレビューで継続する。

### Step 3: 結果を報告する

用語（`skills/agent-skills/review-team/SKILL.md` の「Output Interpretation / 結果の読み方」が出典）:

- `scope`: 指摘が本 PR の追加行に由来するかを示す finding のメタデータ。値は `in-diff` / `pre-existing` の 2 つ
- `in-diff`: 本 PR が追加行で持ち込んだ問題。既定値であり fail-safe でもあるため、値が無い finding もこの扱いになる
- `pre-existing`: 変更ファイル内だが追加行の外にある既存コードへの指摘。文脈参考として扱い、本 PR のスコープを超えた修正を招かないようにする
- `consensusLevel`: 同じ finding を挙げたロール数のバケット。`consensus`（3 以上）/ `multi`（2）/ `single`（1 以下）
- 並び順のキーは `consensusLevel` → `severity` → `scope` である。`consensusLevel` が `severity` に優先し、`severity` は同値のときだけ次のキーへ進む

JSON 出力（`teamLeadReport` / `issues`）をもとに以下の形式で報告する。

```markdown
## レビュー・チーム 結果

### 実行ロール

<reviewerRole の一覧>

### 優先確認の指摘（top3）

<consensusLevel → severity → scope 順の上位3件。multi は ★★、consensus は ★★★ を付ける。scope は上位2キーが同値のときだけ in-diff を先に置く。pre-existing の finding には file:line の直後に `_(pre-existing)_` を付ける>

### 全指摘（severity 降順）

<critical → major → minor → info の順。scope が pre-existing の finding には file:line の直後に `_(pre-existing)_` を付ける。in-diff（本 PR の追加行由来）は既定値なので印を付けず、pre-existing（変更ファイル内だが追加行の外）だけを示す>

### 見落とし可能性

<blindSpots の label。空なら「なし（全ロールを実行済み）」>

### コンセンサス集計

consensus: N件 / multi: N件 / single: N件
```
