# River Review—Issue / Project 運用ルール

## 🌟 目的

River Review プロジェクトでは、機能開発・スキル設計・エージェント基盤拡張を持続的に進めるため、**Issue と GitHub Projects を一貫したフォーマット・フローで運用する**ことを定めています。

この文書は、Issue 作成者・レビュアー・メンテナーが同じ前提で進められるようにするための運用ルールをまとめたものです。

このページに定める手続きは現在有効です。一方で運用方法は改善可能であり、手順の重複・待ち時間などの Evidence をもとに簡素化を提案できます。変更の判断は[OSS実践進化方針](./practice-evolution.md)と既存のガバナンスに従います。

Issueの小バッチ棚卸しや判断待ちでも進められる作業の扱いは、[Issue Triage Living Playbook](./issue-triage.md)を参照してください。これは**可変の実践手順**であり、以下のラベル・承認・CI・マージ規約を上書きしません。

## 📍 1. Issue 作成ルール（Mandatory）

### 1-1. Issue テンプレートを必ず利用する

新規 Issue は、目的に合った `.github/ISSUE_TEMPLATE/*` を使用します（迷ったら `.github/ISSUE_TEMPLATE/task.yaml`）。テンプレートには以下の項目が含まれます。

- **概要**—このタスクが何をするものなのか（必須）
- **前タスク**—直前の Issue 番号（任意）
- **次タスク**—次に着手する Issue 番号（任意）
- **受け入れ条件**—完了条件を明記する（必須）

### 1-2. 必ず「タイプ」ラベルを付与する

Issue の種類が一目で分かるように、Issue 作成時に `type:` ラベルを 1 つ付けます。

例:

- `type:task`
- `type:bug`
- `type:feature`
- `type:enhancement`
- `type:docs`
- `type:content`

### 1-3. 優先度ラベルを付与する

優先度を揃えるため、Issue 作成時に `P0` / `P1` / `P2` のいずれかを付けます。

### 1-4. Milestone は SemVer 系に統一する（任意だが推奨）

進捗の「見え方」を揃えるため、Milestone は SemVer 系（例: `v0.2.0 – Developer Experience`）に統一します。

（任意）`m1-public` / `m2-dx` / `m3-smart` / `m4-community` を付与すると、Milestone を自動設定できます（`.github/workflows/auto-milestone.yml`）。

自動割り当ての対応表:

| ラベル         | Milestone タイトル（完全一致が必要） |
| -------------- | ------------------------------------ |
| `m1-public`    | `v0.1.0 – Public Ready`              |
| `m2-dx`        | `v0.2.0 – Developer Experience`      |
| `m3-smart`     | `v0.3.0 – Smart Reviewer`            |
| `m4-community` | `v1.0.0 – Community Edition`         |

バックログ（Issue のタイトル/ラベル/受け入れ条件）は `ROADMAP.md` を参照してください。

## 📍 2. 依存関係ルール（連続性の可視化）

### 2-1. 「前タスク/次タスク」を記述

テンプレートの**前タスク**と**次タスク**欄は可能な限り記入します。

- `前タスク`: この Issue の前に完了すべき Issue 番号。
- `次タスク`: この Issue 完了後に着手すべき次の Issue 番号。

### 2-2. 依存関係は本文で明示する

Issue 間の依存関係は、テンプレートの**前タスク/次タスク**とリンクで明示します（ラベル運用は追加導入が必要なため、本リポジトリのデフォルトでは必須にしません）。

- 例: `前タスク: #123`, `次タスク: #124`

## 📍 3. GitHub Projects への自動追加と同期ルール

### 3-1. Issue は Project に登録する

必要に応じて Issue を GitHub Projects に登録し、Status で進行を管理します（自動化は任意）。

### 3-2. Project 上のフィールド（例）

Roadmap Project には下記のカスタムフィールドを追加し、Issue ラベルや依存関係と同期します。

| フィールド名 | 種類          | 説明                          |
| ------------ | ------------- | ----------------------------- |
| Status       | Single select | Todo / Doing / Blocked / Done |
| Priority     | Single select | P0 / P1 / P2                  |
| Type         | Single select | `type:` ラベルに対応          |
| Milestone    | Single select | SemVer milestone（任意）      |
| Prev Task    | Text          | 前タスク番号（任意）          |
| Next Task    | Text          | 次タスク番号（任意）          |

### 3-3. Project 内での並び順

以下のソート順を推奨します。

1. Priority（P0 → P2）
2. Milestone（任意）
3. Issue タイトル（昇順）

## 📍 4. Issue のライフサイクル

Roadmap Project 上での進行ステータスを定義します。

| カラム | 説明                                           |
| ------ | ---------------------------------------------- |
| Idea   | 作成直後。フェーズと概要が記述されている状態。 |
| Build  | 担当者が作業を開始した状態。                   |
| Review | プルリクエストが作成された状態。               |
| Done   | Issue がクローズされた状態。                   |

## 📍 5. Epic（親Issue）運用ルール

大規模な取り組みやフェーズ全体をまとめる親 Issue（Epic）を作成する場合は、チェックリストで関連 Issue を列挙します（ラベル運用は必要に応じて導入します）。

Epic Issue には関連タスク Issue をチェックリストとして列挙し、全体の進捗を把握できるようにします。

## 📍 6. 例: 正しい Issue のサンプル

```text
タイトル: メタデータ仕様ドラフトの作成

概要:
スキルメタデータの拡張（inputContext, outputKind, modelHint, tools など）を定義する。

前タスク: なし
次タスク: #12【skill.schema.json 更新】

受け入れ条件:
- pages/reference/skill-metadata.md に項目が一覧化されている
- 既存スキル1つを例として記述
- スキーマ化しやすい形式になっている

ラベル:
- type:task
- P1
```

## 📍 7. ドキュメントの改訂ルール

このドキュメントを変更する場合、必ず Pull Request を作成し、メンテナーの承認を得てください。プロジェクト運用に影響する変更は Epic Issue にリンクしておくこと。
