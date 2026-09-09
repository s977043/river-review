# コンフィグ / スキーマ概要

## `.river-review.json`（実行時コンフィグ）

リポジトリ直下に置く `.river-review.json` で、レビュー時のモデル設定や除外条件をカスタマイズできる。`src/config/schema.mjs` の Zod スキーマで検証し、存在しない場合は `src/config/default.mjs` のデフォルト値を使用する。

### サポート項目とデフォルト

- `model`
  - `provider`: `openai`（デフォルト）。スキーマは `google` / `anthropic` も受理する。ただしレビュー実行経路で実際に動く値は `openai` だけである（[#490](https://github.com/s977043/river-review/pull/490)）。
    - レビュー実行経路（`river review` と GitHub Action）では、`src/lib/review-engine.mjs` の `resolveOpenAIConfig` が `model.provider` をそのまま採用する。`openai` 以外だと LLM 呼び出しに進まず、`provider <値> is not supported yet` という skip 理由が記録される。`modelName` の prefix からクライアントを自動選択する挙動は、この経路には存在しない。
    - multi-provider クライアント（OpenAI / Gemini / Anthropic）が効くのは `river skills <path>` 経路だけである（`src/core/skill-dispatcher.mjs` → `src/ai/factory.mjs`）。同経路はモデル名を `model.provider` ではなく skill 側の `model` / `modelHint` から解決し、その prefix（`gpt|o1` → OpenAI, `gemini` → Gemini, `claude` → Anthropic）でクライアントを選ぶ。Anthropic 対応の追加は [#804](https://github.com/s977043/river-review/issues/804) である。
  - `modelName`: `gpt-4o-mini`（デフォルト）。スキーマは `claude-sonnet-4-6` や `gemini-2.0-flash` のような prefix も受理する。ただしレビュー実行経路の可否を決めるのは `provider` であり、モデル名を差し替えても `provider` が `openai` でなければ skip される。
  - `temperature`: `0`
  - `maxTokens`: `600`。レビュー実行経路の OpenAI 呼び出しへ渡る値である。`river skills` 経路の Anthropic クライアントはこのキーを参照せず、skill 側の `maxTokens` を使う。skill 側が未指定なら、モデル別の既定値（`claude-opus-4-7` と `claude-sonnet-4-6` は 8192、それ以外は 4096）になる。
- `review`
  - `language`: `ja`（日本語）/`en`（英語）。プロンプトの本文と出力言語を切り替える。
  - `severity`: `normal`（デフォルト）/`strict`/`relaxed`
  - `additionalInstructions`: 追加のレビューポリシー（配列）。プロンプト末尾に列挙される。
  - `specDirs`: 変更ファイルと関連する設計文書をリンクする際に追加で走査する spec/ADR ディレクトリ（リポジトリ相対パスの配列）。組み込みの既定（`docs/adr` / `pages/explanation` / `specs`）にマージされる。
  - `walkthrough`: `true` で、レビュー出力に変更ファイルごとの walkthrough（要約・リスク・推奨読み順）セクションを追加するようプロンプトに依頼する（既定 `false`）。
  - `agentHandoff`: `true` で、blocking 指摘を別 AI エージェントが修正できる provider 非依存の Agent Handoff セクション（目的/対象/制約/手順/テスト/完了条件）を出力するようプロンプトに依頼する（既定 `false`）。
  - `promptCompiler`（[#1859](https://github.com/s977043/river-review/issues/1859)）: Prompt Compiler の実行モード設定。設計の出典は ADR-006（`docs/adr/006-model-aware-review-prompt-compiler.md`）である。
    - `mode`: `off`（既定）/ `observe` / `active`。`off` は Prompt Compiler を通らず、導入前と同一の挙動になる。`observe` は compiled プロンプトを生成するが LLM へ送らず、hash と推定トークン数と profile の来歴だけを `debug.execution.promptCompiler` へ記録する。追加の LLM 呼び出しは発生しない。`active` は compiled プロンプトを実際に LLM へ送る（[#1861](https://github.com/s977043/river-review/issues/1861)）。opt-in であり、既定は `off` のままである。`active` の run では `debug.execution.promptCompiler.sentPrompt` が `compiled` になる。この値を持つ run を `river evolve prompt-compare` は受け取らず、2 系統の A/B 比較は `river evolve prompt-ab` が扱う（[#1880](https://github.com/s977043/river-review/issues/1880)）。なお `shadow` という値は採用していない。
  - `orchestrator`（[#1689](https://github.com/s977043/river-review/issues/1689)）: `--reviewers` による並列ロール実行の観測設定。CLI フラグ `--reviewers`（ロール名の配列）と紛れないよう、キー名を `reviewers` ではなく `orchestrator` にしている。
    - `timeoutMs`: ロール 1 件あたりの上限ミリ秒（`1`〜`3600000` の整数）。既定は未設定＝無制限であり、全ロールの完了を待つ。超過したロールは失敗として記録され、残りのロールの findings で処理を続行する（fail-soft）。環境変数 `RIVER_REVIEWER_TIMEOUT` が本項目より優先される。範囲外・非整数の値は警告を出して無視する（`setTimeout` の 32bit クランプにより、上限超過の値は 1ms 扱いとなって全ロールを即座に打ち切ってしまうため）。
    - `progress`: `false` でロール単位の進捗行を抑止する（既定 `true`）。進捗は stderr のみへ出力し、stdout の成果物は汚さない。CLI の `--quiet` は本項目より優先される。
- `exclude`
  - `files`: 変更差分から除外する glob パターン。
  - `prLabelsToIgnore`: Pull Request ラベル名に対象キーワードが含まれていればスキップする設定。`RIVER_PR_LABELS`（カンマ区切り）または GitHub Actions の `GITHUB_EVENT_PATH` から取得したラベルと照合し、大文字小文字を無視した部分一致で判定する。
- `security`（[#692](https://github.com/s977043/river-review/issues/692)）
  - `redact.enabled`: `true`（デフォルト）。LLM へ送る前段で repo-wide context とプロンプトの secret を伏字化する。
  - `redact.categories`: カテゴリ単位で個別 ON/OFF。キーは以下。
    - 鍵類: `githubToken` / `openaiKey` / `anthropicKey` / `googleApiKey` / `awsAccessKey` / `awsSecretKey` / `privateKey`
    - 認証: `bearerToken` / `databaseUrl` / `webhookUrl` / `oauthSecret` / `envAssignment`
    - フォールバック: `highEntropy`
  - `redact.extraPatterns`: 追加正規表現（`{ id, pattern, replacement? }`）。プロジェクト固有の鍵フォーマットに使う。
  - `redact.allowlist`: 一致するトークンは redact しない（テスト固定値などの保護）。
  - `redact.denyFiles`: コンテキスト収集の前段で読み飛ばす glob 追加分（既定の `.env*` / `*.pem` / `*.key` / `secrets.*` 等に上乗せ）。
  - `redact.entropyThreshold`: `3.0`〜`6.0`（既定 `4.5`）。Shannon entropy を使った fallback 検出の閾値。
  - `redact.entropyMinLength`: 既定 `24`。fallback 検出の対象とする最小文字数。
- `memory`（[#687](https://github.com/s977043/river-review/issues/687)）
  - `suppressionEnabled`: `true`（デフォルト）。Riverbed Memory に登録された suppression entry を反映する。`false` で gate を完全バイパス（緊急対応用）。
  - **suppression entry の `feedbackType`** (`schemas/suppression-context.schema.json`):
    - `accepted_risk`: リスクを認識した上で残すと決めた指摘。**HIGH_SEVERITY guard を通過できる唯一の値**で、`major` / `critical` の自動抑止にはこの値が必須（`src/lib/suppression-apply.mjs` の HIGH_SEVERITY guard）。
    - `false_positive`: 誤検知。`major` / `critical` は guard でブロックされ自動抑止されない（manual-handle 扱い）。`minor` / `info` は自動抑止する。
    - `wont_fix`: 修正しないと決めた指摘。`false_positive` と同じく `major` / `critical` は guard でブロックされる。
    - `not_relevant`: 当該 PR / ファイルの文脈で関連が薄い指摘。`major` / `critical` は guard でブロックされる。
    - `duplicate`: 別エントリの fingerprint への参照。`duplicateOfFingerprint` フィールドで参照先を示せる（schema 上は任意だが運用上は記録推奨）。`major` / `critical` は guard でブロックされる。
  - CLI: `river suppression add` で対話的に登録できる。
    - 必須フラグ: `--fingerprint <fp>` / `--feedback <type>` / `--rationale <text>`
    - 任意フラグ: `--scope <pattern>` / `--severity <level>` / `--files <glob>` / `--expires <date>` / `--pr <num>` / `--fingerprint-algo <v1|v2>`
- `context`（[#689](https://github.com/s977043/river-review/issues/689)）
  - `reviewMode`: `tiny` / `medium` / `large`。budget を省略すると `src/lib/context-presets.mjs` のプリセットを適用する。`budget` を明示するとプリセットより優先される。
  - `budget.maxTokens`: `256`〜`64000`。
  - `budget.maxChars`: `1024`〜`200000`。char 上限と token 上限の両方が同時に効く。
  - `budget.perSectionCaps`: `fullFile` / `tests` / `usages` / `config` ごとの char 上限を個別指定する。
  - `ranking.enabled`: `true` で変更ファイルへの近接度に基づいた候補並び替えを有効化する。
  - `ranking.weights`: `pathProximity` / `symbolUsage` / `siblingTest` / `commitRecency` を `0.0`〜`1.0` で指定する。省略時は等重みを使用する。
  - `tokenizer`: `heuristic` のみ受理する（将来拡張用）。
- `artifacts`
  - 入力アーティファクトのパスを宣言するセクション。受け付ける ID は次の 14 件である。
    - Markdown 系: `pbi-input` / `plan` / `design` / `todo` / `test-cases` / `review-self` / `review-external`
    - 差分・ツール出力系: `diff` / `junit` / `coverage` / `lint` / `typecheck` / `findings-pool` / `tdd-ledger`
  - 各値は文字列パス、または `{ "path": "...", "optional": <boolean> }` のオブジェクトで指定する（`optional` は真偽値）。
  - 未知のキーは将来互換のため受理される（catchall）。解決順序と各アーティファクトの契約は [Artifact Input Contract](./artifact-input-contract.md) を参照。

- `selection`（skill pack の導入宣言）
  - `packs`: 導入する pack id の配列（例: `[typescript, ddd]`）。複数指定は skill id で set-union され、各 skill は 1 回だけ実行される。
  - `tags`: tag による横断追加。指定 tag を持つ skill が選択対象に加わる。
  - `skills.include` / `skills.exclude`: 個別 skill の追加・除外。優先順位は `exclude > include > packs / tags の union`。
  - `minTier`: `official` / `community` / `experimental`。明示した `packs` が minTier 未満でも実行される（警告のみ）。
  - CLI の `--skill-set` を指定した実行では、config の selection より CLI 指定が優先される。サンプルは [examples/selection/](https://github.com/s977043/river-review/tree/main/examples/selection) を参照。

### 設定例

```json
{
  "model": { "provider": "openai", "modelName": "gpt-4o", "temperature": 0.2 },
  "review": {
    "language": "en",
    "severity": "strict",
    "additionalInstructions": ["Focus on security", "Prefer readable variable names"]
  },
  "exclude": {
    "files": ["**/*.md", "docs/**"],
    "prLabelsToIgnore": ["no-review", "wip"]
  }
}
```

### 詳細設定例

`security` / `memory` / `context` など複雑なセクションを使う場合の設定例:

```json
{
  "security": {
    "redact": {
      "enabled": true,
      "extraPatterns": [
        {
          "id": "my-api-key",
          "pattern": "MYAPP_[A-Z0-9]{32}",
          "replacement": "[REDACTED_MYAPP_KEY]"
        }
      ],
      "allowlist": ["test_token_placeholder"],
      "denyFiles": ["config/secrets/**", "**/*.vault"],
      "entropyThreshold": 4.5
    }
  },
  "memory": {
    "suppressionEnabled": true
  },
  "context": {
    "reviewMode": "medium",
    "budget": {
      "maxTokens": 16000,
      "perSectionCaps": {
        "fullFile": 4000,
        "tests": 2000,
        "usages": 2000,
        "config": 1000
      }
    },
    "ranking": {
      "enabled": true,
      "weights": {
        "pathProximity": 0.4,
        "symbolUsage": 0.3,
        "siblingTest": 0.2,
        "commitRecency": 0.1
      }
    }
  }
}
```

`river suppression add` コマンド呼び出し例:

```bash
river suppression add \
  --fingerprint abc123def456 \
  --feedback accepted_risk \
  --rationale "Intentional use of high-entropy token in test fixture" \
  --scope "src/auth/**" \
  --severity major
```

期待される出力例:

```text
Suppression entry added.
  fingerprint : abc123def456
  feedback    : accepted_risk
  scope       : src/auth/**
  severity    : major
```

`--fingerprint-algo` は指摘の照合方式を選ぶオプションです。既定の `v1` は行番号を含まないため、同じファイル内で同種の指摘をまとめて抑制します。`v2` を指定すると行番号込みの照合になり、その行の指摘だけが抑制対象です。ただし行がズレた時点で v2 の抑制は外れます。行ズレに強い抑制が必要な場合は v1 のまま使ってください。

### バリデーションエラーの例

`src/config/schema.mjs` の Zod スキーマによる検証が失敗した場合、以下のようなエラーが出力される。

| エラーメッセージ例                                                                 | 原因と修正方法                                                                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Invalid enum value. Expected 'google' \| 'openai' \| 'anthropic', received 'xyz'` | `model.provider` に未サポートの値を指定している。`google` / `openai` / `anthropic` のいずれかに修正する。 |
| `Number must be less than or equal to 6` (`security.redact.entropyThreshold`)      | `entropyThreshold` の範囲は `3.0`〜`6.0`。範囲内の値に修正する。                                          |
| `Unrecognized key(s) in object: 'unknownKey'` (`security.redact`)                  | スキーマに存在しないキーを追加している。キー名のタイポを確認し、不要なキーを削除する。                    |

### 運用のヒント

- CI でスキップさせたいラベルを `prLabelsToIgnore` に記載し、`RIVER_PR_LABELS`（例: `RIVER_PR_LABELS=no-review,wip`）または GitHub のイベントペイロードから読み取れるようにしておくと安全である。
- 設定変更後は `npm test` や `npm run lint` でスキーマ整合性と挙動を確認する。

## JSON Schema（スキル／出力）

River Review では、スキルや出力を JSON Schema で定義する。スキルは YAML frontmatter、出力は JSON を想定している。

- `schemas/skill.schema.json`
  - 必須: `id` / `name` / `description` / `category` （加えて `phase` / `category` / `trigger` のいずれか、`applyTo` / `files` / `path_patterns` / `trigger` のいずれかが必要）
  - 任意: `tags` / `severity` / `inputContext` / `outputKind` / `modelHint` / `dependencies`
  - `category` は `core` / `upstream` / `midstream` / `downstream` で、ルーティングの第一キー。`phase` は後方互換のため残されている。

- `schemas/output.schema.json`
  - 必須: `issue` / `rationale` / `impact` / `suggestion` / `priority` / `skill_id`
  - `priority` は `P0`〜`P3` のいずれか

スキルは Markdown ファイルとして `skills/{category}/` に配置し、`npm run skills:validate` でスキーマ検証ができる。
