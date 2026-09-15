# パイプラインパラメータ追加チェックリスト

`generateReview` / `verifyFinding` / `buildPrompt` / `buildExecutionPlan` に新しいパラメータを追加する際は、以下の全 call site を確認すること。

## 背景

パイプラインの関数シグネチャは複数の独立した call site から呼ばれており、単一のパラメータ伝播点が存在しない。新パラメータを追加する際、どこか1箇所の更新を忘れると下流で `undefined` として渡り、機能がサイレントに no-op 化する。PR レビューで検出されるが、事後修正はリベースコストを伴う。

リポジトリ内の検索で `generateReview` は AI client interface (`src/ai/factory.mjs`, `src/core/skill-dispatcher.mjs`) にも存在するが、これらはパイプライン関数ではなく LLM クライアントのメソッドで別物。混同しないこと。

## チェックリスト

### 必須: `generateReview` / `buildPrompt` に新パラメータを追加した場合

- [ ] `src/lib/review-engine.mjs`—関数シグネチャと内部ロジック
- [ ] `src/lib/local-runner.mjs`—`runLocalReview` 内の `generateReview` 呼び出し
- [ ] `src/lib/review-fixtures-eval.mjs`—eval 呼び出し
- [ ] `src/lib/repo-wide-fixtures-eval.mjs`—repo-wide eval 呼び出し（#688）
- [ ] `tests/review-engine.test.mjs`—新パラメータ有無のテスト最低2件
- [ ] `tests/review-eval.test.mjs`—既存の eval テスト
- [ ] `tests/finding-format.test.mjs`—フォーマット検証テスト
- [ ] `tests/finding-scope-propagation.test.mjs`—verifier の機械判定 scope が `findings[].scope` へ伝播することの回帰テスト（#1644）
- [ ] `tests/prompt-sections.test.mjs`—節生成の SSoT（`src/prompt/sections.mjs`）と golden の突合
- [ ] `tests/prompt-compiler.test.mjs`—Prompt Compiler の描画と `buildPrompt` 出力の突合（ADR-006）
- [ ] `tests/prompt-compiler-observe.test.mjs`—`review.promptCompiler.mode` の observe 配線テスト（ADR-006）
- [ ] `tests/prompt-compiler-active.test.mjs`—`review.promptCompiler.mode` の active 配線テスト（ADR-006 / #1861）
- [ ] `tests/prompt-compiler-paired.test.mjs`—observe の観測を legacy / compiled の 2 系統として取り出す導線のテスト（ADR-006 / #1860）
- [ ] `tests/prompt-compiler-ab.test.mjs`—legacy を送った run と compiled を送った run の A/B 比較経路のテスト（ADR-006 / #1880）
- [ ] `tests/review-viewpoint-active-mode.test.mjs`—Review Viewpoint active/observe 配線と `generateReview` / `buildPrompt` への Obligation 伝播テスト（#2252）
- [ ] `tests/integration/local-review.test.mjs`—統合テスト（関連する場合）

### 必須: `verifyFinding` に新パラメータを追加した場合

- [ ] `src/lib/verifier.mjs`—関数シグネチャと checks オブジェクト
- [ ] `src/lib/review-engine.mjs`—`generateReview` 内の `verifyFinding` 呼び出し（`await import('./verifier.mjs')` 箇所）
- [ ] `src/lib/finding-critic.mjs`—`preVerifyFinding` と `isCriticEvidenceGrounded` の 2 箇所（#1978 Phase 1a）
- [ ] `tests/verifier.test.mjs`—新チェックの pass/fail/lenient 3パターン
- [ ] `tests/finding-critic.test.mjs`—`preVerifyFinding` の `reasons` が `verifyFinding` と一致することの突合
- [ ] `tests/finding-critic-phase1b.test.mjs`—Critic 由来 finding でも同じ突合が成り立つことの確認（#1978 Phase 1b fixture ⑥）

### 必須: `buildExecutionPlan` に新パラメータを追加した場合

- [ ] `runners/core/review-runner.mjs`—options destructuring と返却オブジェクト（planner あり/なし両方）
- [ ] `runners/core/review-runner.d.ts`—`BuildExecutionPlanOptions` の型宣言（`.mjs` の実装と対で更新する）
- [ ] `src/lib/local-runner.mjs`—`planLocalReview` の2箇所（main path + collectLocalContext path）の `buildExecutionPlan` 呼び出し
- [ ] `runners/node-api/src/types.ts`—`ReviewOptions` interface へ新フィールドを追加し、node-api 経由で `review()` へ渡す
- [ ] `runners/node-api/src/index.ts`—TypeScript wrapper の 2 箇所の forward。(1) `buildExecutionPlan(options: {...})` ラッパー自体の型宣言と `coreBuildExecutionPlan` への引き渡し（`index.ts:205-225`）。(2) `review(options: ReviewOptions)` 関数内部の `buildExecutionPlan({...})` 呼び出し（`index.ts:266-275`）。どちらも明示的に destructure するため、新フィールドを追加しないとサイレントに drop される
- [ ] `runners/cli/src/commands/review.mjs`—`reviewCommand` 内の `buildExecutionPlan` 呼び出し（`runners/cli/` 独立 CLI パッケージ）
- [ ] `src/cli/commands/skills.mjs`—`skills plan` サブコマンド内の `buildExecutionPlan` 呼び出し
- [ ] `src/lib/planner-dataset-eval.mjs`—planner dataset eval 用の `buildExecutionPlan` 呼び出し
- [ ] `tests/review-runner.test.mjs`—`buildExecutionPlan` の主要ユニットテスト（order/prune/planner fallback/fileTypes/llmEnabled など）
- [ ] `tests/review-runner.snapshot.test.mjs`—スナップショットテスト
- [ ] `tests/review-runner-snapshot-field.test.mjs`—plan の snapshot フィールドの producer/consumer 突合テスト
- [ ] `tests/review-runner-inferred-phase.test.mjs`—phase 推論経路のテスト
- [ ] `tests/heuristic-review.test.mjs`—本番 plan 経路を通したヒューリスティック検出器のテスト
- [ ] `tests/skill-routing-regression.test.mjs`—ADR/依存有無による routing 回帰テスト
- [ ] plan 経由で下流関数に渡される場合は下流関数のチェックリストも確認

## 機械検証（#1827）

上のチェックリストが挙げるファイルと、リポジトリ内の実際の call site は
`scripts/check-doc-enumerations.mjs` の spec `pipeline-callsites-*` が機械照合する。
実測は `scripts/lib/pipeline-call-sites.mjs` が担当する。`src/` `runners/` `tests/` `scripts/`
配下のソースを走査して、コメントと文字列リテラルを除いた素の呼び出し
（`name(`。`client.generateReview(` のようなメソッド呼び出しは対象外）を持つファイルを数える。

```bash
npm run check:doc-enum   # 単体
npm run meta:validate    # 必須チェック `Meta consistency` と同じ経路
```

このチェックが守るのは「チェックリストが実体と一致していること」であって、
個々のパラメータが各 call site で転送されているかではない。
呼び出しはすべて options オブジェクト 1 個で渡されるため、
どのキーが必須かは決定論では判定できない。転送漏れ自体は引き続き上のチェックリストと
producer/consumer 双方を assert するテスト（`tests/review-runner-snapshot-field.test.mjs` の型）で守る。

走査に現れない宣言（型定義だけのファイルなど）と、パイプライン関数ではない同名関数は
spec 側の `ignoreKeys` に理由付きで登録してある。理由が空の除外は登録できない。

## 確認方法

パラメータ名を決めたら、まず grep で全出現箇所を列挙する:

```bash
rg "generateReview\b" src/ runners/ tests/ scripts/
rg "buildExecutionPlan\b" src/ runners/ tests/ scripts/
rg "verifyFinding\b" src/ runners/ tests/ scripts/
```

各ヒット箇所で「この call site は新パラメータを渡す必要があるか」を判定する。`src/ai/` と `src/core/skill-dispatcher.mjs` の `generateReview` は AI client メソッドで別物のため除外する。

## 設計上の制約

`src/lib/` は AGENTS.md の "Ask before editing" スコープに該当するため、大規模なシグネチャ変更は事前にユーザー承認を得ること。

## 関連

- AGENTS.md の Edit Scope セクション
- `src/lib/review-engine.mjs:generateReview`
- `src/lib/verifier.mjs:verifyFinding`
- `runners/core/review-runner.mjs:buildExecutionPlan`
