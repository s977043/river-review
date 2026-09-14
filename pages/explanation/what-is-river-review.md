---
id: what-is-river-review
title: River Review とは
---

River Review は、**チーム固有のレビュー判断を、要件・設計・計画・差分・レポートにまたがって実行できる OSS フレームワーク**です。

中核思想は **Review Judgment as Code** です。現在のプロダクトは **Review Judgment Platform / team-owned audit layer** として、チームの判断基準を所有・実行・観測・改善できる形にします。

このページは、機能・利用方法・実行モデルの概要を扱います。課題認識・コアモデル・責任境界を含むコンセプトの全体像は [コンセプト](./concept.md) にまとめています。

一般的な AI レビューツールは、PR diff を主な入力として扱います。River Review はそれだけではありません。AI エージェントが実装に入る前の要件・設計・計画もレビュー対象に含め、実装後の差分・テスト・完了レポートまで一貫して確認します。

このアプローチは _Context Engineering_（レビュー判断に必要な文脈を構造化して LLM へ渡す設計手法）とも呼ばれます。River Review は次の 3 つを中核に据えています。

- **capability pack**: AI のレビュー能力を強化するスキル / エージェント定義のまとまり。
- **Skill Registry**: チームの判断基準を versioned / repo-owned な Skill として共有資産化する仕組み。
- **レビュー用エージェントとレビューチーム**: レビュー専用エージェントと、観点別レビュアーを並列実行する review team。

暗黙知を versioned / repo-owned な Skill へ落とし込み、共有資産として再利用する考え方は変わりません。3 つ目の軸は、その資産を「誰がどう動かすか」を担います。

## 一言で言うと

River Review は、**コードだけでなく、開発の流れそのものをレビューする**ためのフレームワークです。

- 要件は、目的・成功条件・スコープが明確か
- 設計は、既存アーキテクチャや制約と整合しているか
- 計画は、作業分割・リスク・検証方針が揃っているか
- 差分は、要件・設計・計画から逸脱していないか
- レポートは、判断根拠・検証結果・未解決事項を残しているか

## 目的

- 実装前に、要件・設計・計画の曖昧さを減らす
- 実装中・実装後に、計画と差分のズレを検出する
- テスト/リリース前の回帰やカバレッジ漏れを抑える
- レビュー判断をチーム所有の Skill として再利用可能にする
- AI エージェントの作業結果を、チームの基準で監査できるようにする
- findings の有無とレビュー実行の完遂性を分離し、false clean を避ける

## 位置付け

River Review は人のレビューを置き換えるものではありません。スキル化されたチェックで抜け漏れを減らし、人間は意図・責任・事業判断・チーム固有の判断へ集中できるようにします。

また、PlanGate とも役割が異なります。River Review は **レビューする**、PlanGate は **止める / 通す** 役割を担います。

River Review / 人間 / AI 実装エージェント / PlanGate・Caller の 4 主体による責任分担は [コンセプト](./concept.md) にまとめています。人間監督を崖・丘・原っぱの 3 階層で配分する考え方は [Human Judgment Focus](./human-judgment-focus.md) を参照してください。

## 実行モデル（誰がレビューを実行するか）

River Review のスキルは、River Review 自身が LLM を呼ぶための設定ではなく、**AI のレビュー能力を強化する capability pack（スキル / エージェント定義）**です。実行のされ方は 3 通りあり、**LLM キーが必要かどうかは「実行面」ではなくこのモデルで決まります**。

1. **AI エージェント駆動（主）** — Claude Code / Cursor / Codex などのエージェントがスキル（`skills/agent-skills/`）やサブエージェント（`agents/river-review.md`）を読み込み、**自身のモデルでレビューを実行する**。エージェント自体が LLM なので、**River Review 用の LLM キーは不要**。`/review-local`、サブエージェント委譲、Agent Skills のロードなどがこれにあたる。
2. **機械的チェック（heuristic / モデル不要）** — 正規表現などで決定論的に判定できる観点は、**LLM・API キーなしで動作する**。対応観点（セキュリティ系）は、secret 直書き / `eval`・XSS / TLS 検証無効化 / 弱いハッシュ / コマンドインジェクション / GitHub Actions のリスク / 不可視 Unicode 注入（GlassWorm・Trojan Source 型）。品質・テスト系は、例外の握り潰し / `debugger` 残し / マージコンフリクト / 型チェック抑制 / テスト欠落 / フォーカス・無効化テスト / caller special-case の積み上がり / closure による大きな scope の保持 / 一時対応コメントの撤去条件欠落。担当は security / logging / typescript / test / simplify / knowledge-alignment 系の 9 スキルで、機械的に判定できる観点は今後さらに拡張できる。
3. **ヘッドレス LLM（GitHub Action / standalone `river run`）** — 対話エージェントがいない環境では、River Review が**自前で LLM を呼んで**スキルを実行する。**この経路だけ LLM キー**（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` のいずれか）が必要になる（機械的チェック (2) はキー無しでも動く）。

> まとめ: 通常の AI 駆動開発ではエージェントがスキルを適用するため **LLM キーは不要**です。LLM キーが要るのは **GitHub Action / standalone CLI のヘッドレス実行**で、かつ機械的チェック以外のスキルを動かす場合だけです。

## レビュー用エージェントとレビューチーム

River Review はスキルを束ねるだけでなく、それを動かす**レビュー専用エージェント**を備えています。これは上の実行モデルのうち「AI エージェント駆動」を具体化したものです。

- **レビュー専用エージェント** — サブエージェント定義（`agents/river-review.md`）として配布され、`/review-local` などから呼び出せる。ホストのエージェントがこの定義を読み込み、自身のモデルでレビューを実行する。
- **観点別レビュアーの並列実行とマージ（review team）** — `src/lib/reviewer-orchestrator.mjs` が観点別レビュアーロールを並列に走らせ、各 finding を connected-components でマージする。ロールは bug-hunter / security-scanner / test-gap / dependency-reviewer / frontend-reviewer / ci-cd-reviewer の 6 種類。`--reviewers auto` なら差分内容に応じてロールが選ばれる。

ここでいう「マルチエージェント」は、1 つの orchestrator が観点別レビュアーのロールを並列に動かして結果をマージする仕組みです。完全に自律した独立エージェント群ではなく、あくまで**観点別レビュアーの並列実行とマージ**を指します。

## Review Coverage

River Review は、**「findings が 0 件だった」と「必要なレビューが完了した」を別の概念として扱います**。

Experimental な Review Coverage Contract は、review unit ごとの実行結果を machine-readable に残します。現在の最小単位は reviewer role × diff chunk です。unit は `completed` / `failed` / `timed_out` などの状態を持ちます。

集約結果は `complete` / `partial` / `not_executed` として表現します。これにより、一部の reviewer や chunk が失敗した状態を「レビュー完了」と誤認しにくくします。

現段階では observe-only です。Review Coverage は JSON artifact / saved run に保存されますが、既存の Gate / decision の挙動は変更しません。Gate 連携は、観測と回帰テストを経て別段階で扱います。

## 反復ループと判定素材の critic

River Review は、generate → review → revise の反復ループの中で **review ステージ**を担います。

- ループの各周回で、レビュー結果を **判定素材（findings / verdict / suggestedLoopSignal）**として返す。
- verdict はあくまで判定素材であり、GO / NO-GO・自動承認・自動マージを主張しない。反復を続けるか止めるかの判断は **caller の責務**である。
- `auto-approve` のような仕組みも助言であり、人間の確認（HITL）をバイパスしない。崖では人間承認を必須とし、原っぱの自律継続はマージ権限ではない。

この契約と参照実装は、[反復収束の契約](../reference/loop-convergence-contract.md) と、リポジトリ内の参照エージェント（`examples/loop-reference-agent/`）で定義しています。

## フローの繋がり

- **Upstream**: 要件・設計・ADR・計画を確認し、後続フェーズのリスクを減らす。
- **Midstream**: コードやPRをレビューし、設計意図と差分の整合を保つ。
- **Downstream**: テスト、QA、完了レポート、リリース準備をチェックし、回帰と品質劣化を防ぐ。

詳しくは [レビュー対象と使いどころ](./review-scope.md) と [上流、中流、下流](./upstream-midstream-downstream.md) を参照してください。
