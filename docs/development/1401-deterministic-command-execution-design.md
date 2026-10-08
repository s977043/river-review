# deterministicGate.command 安全実行機構の設計（#1401）

> Status: Design（設計のみ・実装未着手）。本ドキュメントは #1401 の 6 タスクを具体化する設計であり、
> コード実装は伴わない。実装 PR はこの設計を DoD として参照する。
>
> **敵対的セキュリティレビュー結果（assume-breach）: CONDITIONAL / 67 点**。
> 6 機構は層状で fail-safe 方向は一貫するが、中核防御（機構 1 trusted-ref pin + 機構 2 allowlist）が
> canonical 例 `npm run lint:ci` によって二重に骨抜きになる。実装前に次の 3 ブロッカーを設計で確定すること。
>
> 1. **ゲート健全性の崩壊を「未確定」で流さない**: allowlist に載せた command の実体（`package.json`
>    scripts / tsconfig・eslintrc 等の config autoload）は PR head 制御。`exit 0` に書換れば
>    決定論ゲートが常時グリーンになり、RCE 以前に**ゲートが権威たり得ない**。Phase 1 の allowlist は
>    「PR head の設定・スクリプト・`node_modules` を一切読まない自己完結 command（絶対パス・config
>    autoload 無効）」に限定し、素の `npm`/`npx`/`bash`/`node` 登録を schema/実装で拒否する。
> 2. **on-disk secret の遮断**: `actions/checkout` 既定（`persist-credentials: true`）で GITHUB_TOKEN が
>    `.git/config` に永続化され、env スクラブを迂回して読める。`persist-credentials: false`、`.git` を
>    晒さない clean cwd、`HOME` を空一時ディレクトリへ差し替え（現 SAFE_ENV は本物の `$HOME`＝`~/.aws`
>    等が見える）。
> 3. **stdout / findings の exfil チャネルを閉じる**: レビュー対象を `~/.aws` 等へ symlink すると
>    linter が読み PR コメント/findings へ露出。command は symlink 追跡せず、stdout を PR へ生出力せず
>    判定は exit code のみとする。DoS の 1 MiB 上限は機密性を守らない。
>
> 詳細は §6（残る攻撃面）に反映済み。**この 3 点が設計で解決されるまで実装しない。**
> 3 ブロッカーの具体的な解決設計は §10 に深掘りした。判定は **CONDITIONAL 据え置き**だが、
> §10.5 の DoD 3 条件を実装 PR で固定できれば **Phase 1（opt-in・既定 OFF・advisory）に限り GO 相当**へ
> 引き上げ可（無制限実行・`npm run` 許可は CONDITIONAL のまま）。

## 1. 背景と本ドキュメントの位置づけ

Epic #1347 S4（#1351）で `deterministicGate.command` の**任意コマンド実行は RCE 面**であると判明し、
S4 では command 実行を descope した。strict_block ルーティングは既存 finding 入力ベース
（`src/lib/deterministic-gate.mjs` の `computeStrictBlock`）で実装済みであり、command を実際に
子プロセスとして起動する機構は**まだ存在しない**。

現状の到達点は次のとおりです。

- `schemas/skill.schema.json` の `deterministicGate` は `command`（string, minLength 1）と
  `failSeverity`（`strict_block` | `bypass_warning`, default `strict_block`）を宣言のみで定義する。
  同スキーマの `description` は明示的に「`command` is an arbitrary command specified by a repo-owned
  file—the agent under review can edit it」と TRUST BOUNDARY を警告している。
- `src/lib/skillYamlSchema.mjs` の zod 側 `deterministicGate` も同形で `.strict()` を付ける。（#1399 の
  skill-schema-parity canary が ajv 側 `additionalProperties: false` との整合を守る）。
- `src/lib/gate-decision.mjs` の `deriveGateDecision` は純関数で、`strictBlock === true` を
  受け取ると rule 5b で無条件 `NO_GO`（reasonCode `STRICT_BLOCK`）に倒す。rule 0（`.river/**` 変更は
  無条件 `ESCALATE`）が唯一の in-contract な trust boundary 防御である。
- ADR-003 は「リスクマップ・config・plan テキストは被レビュー変更の著者（=エージェント）の書き込み
  権限下にあり、gate は host / CI checkout で導出されて初めて信頼できる」と明記し、
  `skills/**` の `deterministicGate.command` 実行を「広い攻撃面」として本 issue（#1401）に委ねている。

つまり本設計の中心課題は、「**被レビュー PR 著者の書き込み権限下にある command 文字列を、
CI の secret を守りながら決定論ゲートとして安全に実行する**」ことです。

## 2. 脅威モデル

### 2.1 攻撃者の能力

攻撃者は**被レビュー PR の著者**です。fork からの PR を含む。攻撃者は次を制御できる。

- `skills/**/SKILL.md`（および skill が読む付随ファイル）の内容全体。したがって
  `deterministicGate.command` / `args` の値、`evaluationType`、`failSeverity` を任意に書ける。
- 被レビューツリー（PR head）配下の任意ファイル。`package.json` の `scripts`、
  `Makefile`、`node_modules` に混入させたバイナリ、リポジトリ内の任意スクリプトを含む。
- PR の diff がゲート判定へ与える入力の一部（ただし gate-decision 自体は host 側で導出される）。

攻撃者が制御**できない**もの（信頼境界の外側 = host / CI 側）。

- base ref（`main` / protected branch）のツリー内容。branch protection により PR は base を
  直接書き換えられない。
- CI ランナー上の環境変数（`GITHUB_TOKEN`、OIDC 経由のクラウド資格情報、`RIVER_*` secret 等）。
- River Review 本体のコード（`src/**`、`runners/github-action/**`）。ただしこれ自体を PR で
  書き換える攻撃は別途 CODEOWNERS / required review で守る前提とする（本設計のスコープ外）。

> **脅威強度の訂正（敵対レビュー）**: 現行 `.github/workflows/plangate-review.yml` は
> `on: pull_request`（`pull_request_target` ではない）で `permissions: contents:read /
pull-requests:write`。したがって **fork PR には secret が注入されず `GITHUB_TOKEN` は read-only**。
> 最悪ケース（secret 有り + 書込トークン）が成立するのは主に **same-repo ブランチ（＝collaborator）**。
> 本設計は保守的に一括「攻撃者」として扱うが、「fork でも token write」という想定は実構成より過大。
> ただし same-repo ブランチ経由の secret 窃取は現実的脅威として残るため、防御の必要性は変わらない。
> なお same-repo PR では既に `npm ci` と `node -e "require('./plan.json')"` が PR head で走るため、
> deterministic-exec 以前に npm ライフサイクルスクリプト経由の RCE 面が既存である点も併記する
> （本機構はその面を拡大しないことが最低条件）。

### 2.2 保護資産

1. **CI ランナー上の secret**: `GITHUB_TOKEN`（same-repo ブランチ構成では write 権限を持ちうる）、
   クラウド資格情報、レジストリトークン。**env 経由だけでなく on-disk（`.git/config` の永続化
   token、`$HOME` 配下の `~/.aws` 等）と stdout/findings 経由の外部送信も**防ぐ（後者2つは
   敵対レビューが env スクラブの構造的迂回として指摘）。
2. **CI 実行環境の完全性**: 任意コード実行（RCE）そのもの。攻撃者が CI 上で任意プロセスを
   起動できること自体を最小化する。
3. **ゲート判定の健全性**: 攻撃者が `command: "true"` 等でゲートを常時グリーン化して
   strict_block を無効化できないこと（判定の integrity）。
4. **可用性**: NO_GO ストーム（全 PR 巻き込みブロック）や DoS（無限ループ command、巨大 stdout、
   fork 爆弾）で正当な PR がブロック/停止されないこと。

### 2.3 信頼境界（trust boundary）

```text
         ┌─────────────────────────────────────────────┐
         │  信頼境界の外側 = agent 書込権限外            │
         │  ・base ref (main) のツリー                   │
         │  ・CI env (GITHUB_TOKEN, cloud creds)         │
         │  ・River Review 本体 (src/**)                 │
         │  ・host が解決する allowlist / trusted config │
         ├─────────────────────────────────────────────┤
         │  信頼境界の内側 = 被レビュー PR 著者が制御    │
         │  ・skills/**/SKILL.md (command/args/gate)     │
         │  ・PR head ツリー全体 (package.json 等)       │
         │  ・.river/** (PR は書けるが rule 0 で検出)    │
         └─────────────────────────────────────────────┘
```

設計の全ハードニングは「**command の定義と、実行される中身の双方を、可能な限り信頼境界の外側の
値で pin する**」ことに帰着する。execFile（shell 非経由）は「信頼コマンドへの引数注入」しか防がず、
command 文字列そのものが攻撃者制御という本脅威には無力である点を最初に確認しておく。

## 3. 設計判断（6 機構）

### 3.1 機構 1: trusted-ref pin

**方針**: 実行対象の command 定義（および allowlist）を、PR head ツリーではなく
**base ref（`main` / protected branch）の checkout から解決**する。PR head の
`skills/**/SKILL.md` が書き換えた `command` / `args` は**実行判定に一切用いない**。

具体機構は次のとおり。

1. CI が base ref を明示 checkout する。GitHub Actions では `pull_request` イベントの
   `github.event.pull_request.base.sha` を `actions/checkout` の別 path へ取得し、
   River Review に `RIVER_TRUSTED_TREE=<base checkout path>` として渡す。
2. deterministic 実行器は skill メタデータのうち **command/args/allowlist に関わる部分を
   `RIVER_TRUSTED_TREE` 側からのみ読む**。被レビュー対象の diff / ファイル内容
   （command が lint する対象）は PR head ツリーから読むが、**何を実行するか**は base 側で決まる。
3. host（CI）ツリーと PR ツリーを物理的に別ディレクトリに分離し、実行器は「実行定義の出所」と
   「レビュー対象の出所」を混同しない。base に存在しない skill id の command 実行は拒否する
   （新規 skill を PR で持ち込んで即実行させる経路を塞ぐ）。

**トレードオフ**: PR が新しい deterministic skill を追加しても、その command はマージされて
base に入るまで実行されない。これは意図的な制約であり、「新しい実行コードは人間レビューを経て
base に入る」という不変条件と一致する。skill の追加自体は agentic/heuristic レビューで
評価されるため、レビュー機能が失われるわけではない。

**却下した代替案**:

- _署名済み ref のみ許可（GPG/sigstore 署名 commit の command のみ実行）_: 最も強力だが、
  署名鍵運用・検証パイプラインの導入コストが大きく、opt-in の初期段階には過剰。将来の
  拡張ポイントとして残す（§7 段階導入 Phase 3）。
- _PR head の command を実行しつつ diff で command 変更を検出したら ESCALATE_: 検出漏れ
  （難読化・間接呼び出し）に弱く、fail-open になりやすい。base pin の方が構造的に堅い。

### 3.2 機構 2: 実行 allowlist

**方針**: 自由文字列の command 実行を全面禁止し、**host が信頼するリポジトリ側の
allowlist に登録された command のみ**実行する。allowlist に無い command を宣言した
deterministic skill は「実行不能」として扱い、strict_block を発火させず reasonCode で可視化する
（§3.5 の `DETERMINISTIC_UNRUNNABLE` 寄り）。

**allowlist の置き場所**: `.river/deterministic-allowlist.yaml`（`.river/` 配下）とする。

- `.river/**` は gate-decision.mjs rule 0 の保護領域であり、PR が allowlist を書き換えると
  **その diff 自体が無条件 `ESCALATE`（`GATE_CONFIG_CHANGED`）を発火**する。つまり
  「allowlist を緩めて悪意ある command を通す」PR は必ず人間承認に回る。これが
  「allowlist を PR が書き換えられるなら意味がない」という論点（§6 で再掲）への構造的回答である。
- ただし rule 0 は「gate 判定を host 側で導出する」ことが前提。したがって allowlist の
  **読み取りも `RIVER_TRUSTED_TREE`（base checkout）側から行う**（機構 1 と一体）。PR head の
  allowlist は実行判定に使わない。rule 0 は「気づける」保証、trusted-ref pin は「そもそも
  PR 版を使わない」保証で、二重防御にする。

**形式（案）**: 実行可能な argv を**完全一致**で列挙する。glob やワイルドカードは
入れない（部分一致は攻撃面を広げる）。

```yaml
# .river/deterministic-allowlist.yaml
version: 1
commands:
  - command: npm
    args: ['run', 'lint:ci']
  - command: npx
    args: ['tsc', '--noEmit']
```

**照合方法**: skill の `deterministicGate.{command,args}`（base 側から解決した値）を
allowlist のエントリと**構造的な完全一致**（command 文字列一致 かつ args 配列の要素ごと一致）で
突合する。一致しなければ実行しない。

**却下した代替案**:

- _command を allowlist の「名前」で間接参照（`command: lint` → allowlist が実体を定義）_:
  一段安全だが schema の後方互換を大きく壊す。argv 完全一致方式で十分な強度が得られるため見送る。
- _allowlist を CI の env / workflow に置く_: workflow は base で保護されるが、リポジトリ利用者が
  River Review 導入時に毎回 workflow を書く負担が増える。`.river/` 配下 + rule 0 保護が
  River Review の既存 trust モデルと一貫する。

### 3.3 機構 3: env スクラブ

**方針**: 子プロセスへ**明示 allowlist した環境変数のみ**を渡す。`process.env` を継承させない
（`spawn` の既定である env 継承を無効化する）。

**構築方法（案）**: 実行器は空の env から始め、実行に最低限必要な変数だけを積む。

```js
// 概念コード（実装時の指針。本ドキュメントでは実装しない）
// HOME は「実 $HOME をコピーしない」。~/.aws・~/.npmrc・~/.git-credentials 等の
// on-disk secret を晒さないため、空の一時ディレクトリを HOME として与える（ブロッカー 2）。
const SAFE_ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'TZ']; // HOME/NODE_OPTIONS は含めない
const childEnv = { HOME: freshEmptyTempDir() };
for (const k of SAFE_ENV_ALLOWLIST) {
  if (process.env[k] !== undefined) childEnv[k] = process.env[k];
}
// GITHUB_TOKEN / AWS_* / *_SECRET / *_TOKEN / NODE_OPTIONS 等は一切継承しない
```

- **denylist ではなく allowlist**。`GITHUB_*` を除去する denylist 方式は新種の secret 変数名
  （`VERCEL_TOKEN` 等）へ追随できず fail-open になる。既定は空で、必要分だけ足す。
- **`HOME` は実 `$HOME` をコピーしない**（ブロッカー 2 と整合）。`~/.aws` / `~/.npmrc` /
  `~/.git-credentials` 等の on-disk secret を子プロセスに晒さないため、空の一時ディレクトリを
  HOME として渡す。`NODE_OPTIONS`（`--require ./evil.js` 等の実行時コード注入）も allowlist に
  含めない。
- allowlist するキー集合は host 設定（`.river/deterministic-allowlist.yaml` の
  トップレベル `env:` 等）で拡張可能にするが、**既定に secret 系は一切含めない**。
- `PATH` は必要だが、これ自体が「PATH 上の悪意あるバイナリ実行」経路になりうる（§6 残攻撃面）。
  機構 1 の base pin と機構 2 の allowlist で「何を起動するか」を縛ることで緩和する。

**却下した代替案**: _env をそのまま渡し、command 側で secret を使わない規約にする_—規約は
攻撃者が破るので不可。スクラブは機械的強制でなければ意味がない。

### 3.4 機構 4: argv 契約

**方針**: schema を `command`（文字列）+ `args`（文字列配列, optional）に変更し、
**`execFile`（shell 非経由）**で実行する。Codex 指摘のとおり、単一文字列 `"npm run lint"` を
execFile にそのまま渡すと `"npm run lint"` という 1 つの実行ファイル名として解釈され壊れる。

**schema 変更案（後方互換）**: §4 に詳細。要点は次のとおり。

- `args`（`type: array, items: string`）を追加する。
- 既存の単一文字列 `command`（`"npm run lint"` 形式）は**後方互換のため受理するが、
  実行はしない**扱いとする。具体的には「`args` 未指定 かつ `command` に空白を含む」command は
  「argv 形式未移行」として実行不能（`DETERMINISTIC_UNRUNNABLE` 相当）にし、警告で移行を促す。
  これにより「文字列を shell で分割実行」という危険なフォールバックを**作らない**。
- shell は一切経由しない（`shell: false`、execFile 既定）。

**却下した代替案**: _`command` 文字列を空白で split して argv 化_—クォート・変数展開の
解釈が曖昧で、`;` `&&` `$()` 等を含む文字列の扱いが実装依存になる。明示 `args` を必須方向に
倒す方が安全。

### 3.5 機構 5: spawn error / timeout の区別

**方針**: 「**command が違反を検出して非ゼロ終了した**（= レビュー上の違反）」と
「**command を実行できなかった**（= 環境障害 / 設定不備）」を別 reasonCode に分離する。
前者のみ strict_block（`NO_GO`）に倒し、後者は `ESCALATE` 寄り（人間へ）に倒す。

理由は #1401 の敵対レビュー④で挙がった **NO_GO ストーム**の回避です。allowlist に載った
command が CI の一時障害（ネットワーク断・依存未インストール・timeout）で実行不能になると、
それを「違反」と解釈すれば**全 PR が一斉に NO_GO でブロック**される。実行不能は「判定できない」
であり、fail-safe の方向は「人間に上げる（ESCALATE）」であって「機械的にブロック（NO_GO）」ではない。

**区別の判定基準（案）**:

| 事象                                            | 分類                      | gate 方向                      |
| ----------------------------------------------- | ------------------------- | ------------------------------ |
| command 起動成功・exit code 非ゼロ              | 違反                      | `NO_GO`（`STRICT_BLOCK`）      |
| command 起動成功・exit code 0                   | パス                      | ブロックしない                 |
| ENOENT（実行ファイル無し）/ EACCES / spawn 失敗 | 実行不能（設定/環境障害） | `ESCALATE`                     |
| timeout（§3.6 の上限超過で kill）               | 実行不能（判定不可）      | `ESCALATE`                     |
| allowlist 不一致で実行せず                      | 実行不能（設定不備）      | `ESCALATE` 寄り（§6 で要検討） |

**reasonCode 追加案**: §5 参照。中心は `DETERMINISTIC_UNRUNNABLE`（実行不能 → ESCALATE）を
新設し、既存 `STRICT_BLOCK`（違反 → NO_GO）と分ける。

**却下した代替案**: _実行不能も NO_GO にして「安全側」とする_—一見 fail-safe だが、
可用性を破壊し（NO_GO ストーム）、かつ攻撃者が「わざと実行不能にして特定 skill の
strict_block を回避」する余地を残す。ESCALATE（人間判断）が真の fail-safe。

### 3.6 機構 6: DoS 制限（stdout 上限・timeout・プロセス数）

**方針**: 子プロセスに資源上限を課し、悪意ある command による CI の枯渇を防ぐ。具体値は初期案
（host 設定で上書き可能）とする。

| 制限項目              | 初期値（案）                                     | 超過時の扱い                                            |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| 実行 timeout          | 60 秒 / command                                  | kill（SIGKILL）→ `DETERMINISTIC_UNRUNNABLE`（ESCALATE） |
| stdout/stderr 上限    | 各 1 MiB                                         | 超過分を打ち切り、キャプチャを停止                      |
| 同時実行プロセス数    | 1（逐次実行）                                    | 並列化は将来拡張。まず逐次で単純化                      |
| 総 command 実行数     | selected skill 数上限（既存の skill 上限に従う） | 上限で打ち切り                                          |
| プロセスグループ kill | detached + 負 PID kill                           | timeout 時に子孫プロセスごと終了                        |

- `execFile` の `timeout` + `maxBuffer` を第一の防御にする
  （`git.mjs` は既に `maxBuffer: 200MB` を使うが、こちらは攻撃者制御なので**逆に小さく**する）。
- timeout kill は子プロセスだけでなく**プロセスグループ全体**を対象にする（fork した子孫が
  残るのを防ぐ）。`spawn` の `detached: true` + `process.kill(-pid)` を想定。**移植性の注意
  （gemini #1423）**: 負 PID によるプロセスグループ kill は POSIX 前提で、Windows では未対応。
  River Review の CI は `ubuntu-latest`（Linux）だが、実装は「Linux 前提・Windows では
  プロセスグループ kill を行わず timeout 単体にフォールバック」を明示する。`setsid` で pgid を
  変える子には `kill(-pid)` が届かない点も残攻撃面（§6.8 Low）として既知。
- fork 爆弾・メモリ枯渇の完全防御は Node 単体では困難であり、CI ランナー側の cgroup /
  コンテナ資源制限に依存する部分が残る（§6 残攻撃面）。

**却下した代替案**: _無制限 + CI 全体 timeout に委ねる_—1 command の暴走が review 全体を
道連れにし、原因特定も困難。command 単位の上限が必要。

## 4. schema 変更案（ajv + zod, 後方互換）

### 4.1 ajv（`schemas/skill.schema.json`）

`deterministicGate` に `args` を追加する。`additionalProperties: false` は維持。

```json
{
  "deterministicGate": {
    "type": "object",
    "additionalProperties": false,
    "required": ["command"],
    "properties": {
      "command": { "type": "string", "minLength": 1 },
      "args": {
        "type": "array",
        "items": { "type": "string" },
        "description": "argv (shell 非経由 execFile)。command は実行ファイル名、args がその引数。"
      },
      "failSeverity": {
        "type": "string",
        "enum": ["strict_block", "bypass_warning"],
        "default": "strict_block"
      }
    }
  }
}
```

### 4.2 zod（`src/lib/skillYamlSchema.mjs`）

`.strict()` を維持したまま `args` を足す（#1399 の parity canary が両者一致を守る）。

```js
deterministicGate: z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    failSeverity: z.enum(['strict_block', 'bypass_warning']).default('strict_block'),
  })
  .strict()
  .optional(),
```

### 4.3 後方互換の扱い

- `args` は optional。既存 skill（`args` 無し）は schema 検証を通る（破壊的でない）。
- **実行意味論**の後方互換は「受理するが実行しない」で担保する。`args` 未指定かつ `command` に
  空白を含む（旧来の `"npm run lint"` 形式）skill は schema としては valid だが、実行器が
  「argv 未移行」と判断して実行せず `DETERMINISTIC_UNRUNNABLE` を出す。これにより
  「schema は通るのに危険な shell 分割実行へフォールバックする」事態を回避する。
- parity canary（skill-schema-parity, #1399）と、`deterministicGate` を含む fixture の
  期待値更新を同一 PR で行う。ずれは `scripts/validate-skills.mjs` の drift gate が検査する。

## 5. reasonCode 追加案（`src/lib/gate-decision.mjs`）

`GATE_REASON_CODES` に実行不能系コードを追加する。fail-safe 方向（不明/未決は GO でなく
NO_GO/ESCALATE）を厳守する。

| 新 reasonCode              | decision   | 意味                                                                                                                |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `DETERMINISTIC_UNRUNNABLE` | `ESCALATE` | deterministic command が実行不能（spawn 失敗 / timeout / allowlist 不一致 / argv 未移行）。判定できないので人間へ。 |

- 既存 `STRICT_BLOCK`（`NO_GO`, rule 5b）は「command が違反を検出」の場合に限定する。
- `DETERMINISTIC_UNRUNNABLE` は escalation cliffs（rule 0-4）より後、`STRICT_BLOCK`（rule 5b）
  より**前**か後かを設計時に確定する。案: **rule 5b の直後**に置く。理由は「実行不能は違反確定より
  弱い情報」だが「NO_GO より保守的な ESCALATE」であり、cliffs(0-4) の下・STRICT_BLOCK の直後で
  「違反が確定した command はブロック、確定しない（実行不能）command は人間へ」という順序が自然。
  ただし「同一 run に strict_block 違反あり + 別 command 実行不能」の合成時の優先順位は
  §6 の未解決論点として実装時に確定する。
- 入力側は `deriveGateDecision` に新パラメータ（例 `deterministicUnrunnable: boolean` と
  対象 skill id 群）を追加する。`computeGateInputsHash` の `FIELDS` へ追加する際は、
  既存の `strictBlock` と同じ方式を使う。方式は「真のときだけ canonical に足す」で、pre-existing fixture の
  hash churn を避けられる（gate-decision.mjs の既存コメント参照）。
- パラメータ伝播は CLAUDE.md「Propagate signatures」/ `docs/development/pipeline-params-checklist.md`
  に従い、`deriveGateDecision` の全呼び出し箇所を洗う。

## 6. 残る攻撃面 / 未解決論点

正直に列挙する。本設計は攻撃面を**縮小**するが**ゼロにはしない**。

1. **allowlist 自体の trust（最重要）**: allowlist を `.river/` に置き rule 0 で「PR による
   書き換えを検出」するが、rule 0 は host 側で gate を導出して初めて機能する。allowlist の
   **読み取りを base checkout から行う**設計（機構 1・2 一体）を守らないと、PR head の
   allowlist を読んでしまい防御が崩れる。実装で最も間違えやすい箇所であり、canary で固定する。
2. **allowlist 内 command の中身は依然 PR 制御**: `npm run lint:ci` を allowlist しても、
   PR head の `package.json` の `scripts.lint:ci` は攻撃者が書ける。つまり「起動する入口」は
   base で pin できても、「入口の先で走るスクリプト」は PR ツリー側になりうる。緩和策の候補:
   (a) command が読むスクリプト定義も base 側に強制する、(b) allowlist を「PR ツリーで一切
   スクリプトを間接実行しない自己完結 command」に限る運用規約。**本設計では未確定**。実装前に
   この論点を潰さないと trusted-ref pin が骨抜きになる。
3. **PATH 経由バイナリ**: env allowlist に `PATH` を残す以上、PATH 上に PR が置いたバイナリ
   （`node_modules/.bin/` 等）を起動する余地が残る。絶対パス強制や PATH を base ツールチェーンに
   限定する案があるが、実用性とのトレードオフで未確定。
4. **NO_GO ストーム vs 実行不能の悪用**: 実行不能を ESCALATE に倒す（機構 5）と、攻撃者が
   「わざと timeout / spawn 失敗を起こして特定 skill の strict_block を回避しつつ ESCALATE で
   人間の目には触れる」挙動を作れる。ESCALATE は人間が見るので致命ではないが、常態化した
   ESCALATE はラバースタンプ化を招く（ADR-003 の懸念そのもの）。実行不能の頻度を digest で
   監視する運用が要る。
5. **strict_block と unrunnable の合成優先順位**: 同一 run で「skill A が違反（NO_GO 相当）」
   かつ「skill B が実行不能（ESCALATE 相当）」のとき、どちらを優先するか。ESCALATE の方が
   保守的なので ESCALATE 優先が素直だが、「違反が既に確定しているのに実行不能を理由に
   人間承認へ格上げ」が妥当かは要議論。§5 で rule 順を確定する。
6. **fork 爆弾 / メモリ枯渇**: Node の timeout / maxBuffer では防ぎきれない。CI ランナーの
   cgroup / コンテナ資源制限に依存する部分が残る。River Review 単体では完全防御できない旨を
   ドキュメントで明示する必要がある。
7. **base に悪意ある command をマージさせる経路**: trusted-ref pin は「base は信頼できる」を
   前提にする。base 自体に悪意ある command を仕込む PR がマージされれば防御は無効。これは
   CODEOWNERS / required human review（`.river/**` と `skills/**` の deterministic 追加を
   人間レビュー必須にする branch protection）で守る前提である。本設計のスコープ外だが**前提条件
   として明記が必須**。

### 6.8 敵対レビューが追加した攻撃面（実装前に潰す）

上記に加え、assume-breach レビューが env スクラブ／argv 契約を**構造的に迂回する**面を指摘した。
論点 2 は「ゲート健全性の崩壊」であり、RCE 以前に決定論ゲートを無意味化するため**最重要ブロッカー**へ格上げする（本 doc 冒頭の Status ボックス参照）。

- **[格上げ] ゲート健全性の崩壊（論点 2 の再分類）**: `npm run lint:ci` を allowlist しても、
  script 本体（`package.json` の `scripts.lint:ci`）を PR head が `exit 0` に書換れば決定論ゲートが
  常時グリーン化する。これは secret 窃取以前に**保護資産 #3（ゲート integrity）の直接崩壊**。
  → Phase 1 は「PR head の設定・スクリプト・`node_modules` を一切読まない自己完結 command」に限定し、
  素の `npm`/`npx`/`bash`/`node`/`sh` の allowlist 登録を schema/実装で拒否する。
  **「自己完結 command」の定義（ブロッカー 1 の解決方向、gemini #1423）**: 実装前に次のいずれかで
  具体化する。(a) allowlist の command を**絶対パスのバイナリ**に限り、`args` に `-e`/`-c`/`run`/
  `exec` 等のコード・スクリプト間接実行フラグを禁止する静的検査を入れる。(b) 実行時に config
  autoload を無効化する（`--no-config` 相当・`NODE_OPTIONS` 除去・`HOME`/`cwd` 分離で PR head の
  `tsconfig`/`.eslintrc`/`.npmrc`/`.git/hooks` を読ませない）。(c) どうしても `npm run` 系が要る
  ユースケースは、script 本体も `RIVER_TRUSTED_TREE`（base）から解決する第2段の pin を課す。
  実用性（多くの lint/test は config を読む）と安全性のトレードオフが大きいため、**Phase 1 の
  対象 command を「config 非依存の自己完結チェッカー」に絞る運用規約から始める**のが現実的。
- **[High・新規] on-disk GITHUB_TOKEN 露出**: `actions/checkout` 既定 `persist-credentials: true` は
  token を `.git/config` の `http.<host>.extraheader` に書く。cwd=PR head の command は `git config`
  / `.git/config` 読取で env スクラブを迂回して token を取得できる。→ command を走らせる checkout は
  `persist-credentials: false`、command cwd に `.git` を晒さない分離が必須。
- **[High・新規] レビュー対象 symlink → stdout/findings 経由 exfil**: PR が lint 対象を
  `~/.aws/credentials` や `/proc/self/environ` への symlink にすると、linter が中身を読んで stdout に
  出力し、それが capture され `pull-requests:write` の PR コメントへ載って外部露出する。env スクラブと
  DoS 上限（1 MiB）は機密性チャネルを塞がない（secret は 1 MiB 未満）。→ command は symlink 非追跡、
  stdout を PR/findings に生出力せず判定は exit code のみ。
- **[Med・新規] config autoload クラス**: §6.2 は `scripts` に限定する。だが実際は cwd から自動ロード
  される一切の設定（`.npmrc` / `tsconfig extends` / eslint plugin/parser / jest/vitest config /
  prettier plugin / `.git/hooks`）が RCE 経路。`npx tsc`/`eslint` を許すと package.json を触らず RCE。
- **[Med・新規] base-pin の path 解決 TOCTOU / skill-id 同定**: PR head skill の `..`/symlink や id
  衝突で「PR head 定義を base 承認扱い」にする実装ミスパターン。canary は「値が base 由来か」は守るが
  path traversal 角度は別途固定が要る。
- **[Low・新規] setsid による pgroup 回避 / same-repo cache poisoning**: 子が `setsid` で pgid を
  変えると `kill(-pid)` を回避。`actions/cache` の base scope を悪意 same-repo ブランチが汚染し得る。

**env allowlist の追加注意**: `NODE_OPTIONS`（`--require ./evil.js`）等の実行時コード注入変数を
allowlist へは**絶対に含めない**。SAFE_ENV は `PATH`（可能なら base ツールチェーンに限定）・`LANG` 等の
無害変数に限る。

## 7. 段階導入案

ADR-003 の Non-Goals「既定を advisory から enforced へ勝手に変えない」を厳守し、**既定は無効**を
維持する。

- **Phase 0（現状）**: command 実行機構なし。strict_block は既存 finding 入力のみ。
- **Phase 1（本設計の最小実装, opt-in・既定 OFF）**: `RIVER_DETERMINISTIC_EXEC=1` 等の明示
  opt-in でのみ command 実行を有効化。有効時も機構 1-6 を全て通す。allowlist が無い / base pin
  未設定なら実行せず `DETERMINISTIC_UNRUNNABLE`。CI では `gate: false`（advisory）と組み合わせ、
  digest で実行実績・unrunnable 率を観測する。
  **Phase 1 の必須前提条件（敵対レビュー・3 ブロッカー、これらを満たすまで実装しない）**:
  1. allowlist は「自己完結 command」限定（絶対パス・config autoload 無効・PR head の
     scripts/config/`node_modules` を読まない）。素の `npm`/`npx`/`bash`/`node`/`sh` は schema/実装で拒否。
  2. `persist-credentials: false` + `.git` 非露出の clean cwd + `HOME` を空一時ディレクトリへ差し替え
     （on-disk token / `~/.aws` 遮断）。SAFE_ENV に `NODE_OPTIONS` 等を含めない。
  3. command は symlink 非追跡、stdout を PR/findings に生出力せず判定は exit code のみ
     （symlink→stdout exfil の遮断）。
     「dark-launch（advisory・digest 観測）でも same-repo ブランチからの secret 窃取は成立する」ため、
     観測フェーズでも上記 3 点は先に満たす。
- **Phase 2**: 観測で誤爆・NO_GO ストームが無いことを確認したチームが、`gate: true` +
  deterministic exec を有効化。
- **Phase 3（将来）**: 署名済み ref のみ実行（機構 1 の却下代替案の格上げ）、PATH ハードニング、
  スクリプト間接実行の禁止（残攻撃面 2・3 への対処）。

各 Phase は River Review の既存 2 段階導入（advisory → enforced）と整合させる。

## 8. 完了条件（DoD）と検証方法

本設計を実装する PR は次を満たすこと。

### 8.1 機能 DoD

- [ ] schema（ajv + zod）に `args` を追加し、parity canary（#1399）green。
- [ ] deterministic 実行器が `RIVER_TRUSTED_TREE`（base）から command/args/allowlist を解決する。
- [ ] allowlist 不一致 command を実行せず `DETERMINISTIC_UNRUNNABLE` を出す。
- [ ] 子プロセス env が allowlist のみ（`GITHUB_TOKEN` 等が継承されないことをテストで実証）。
- [ ] `execFile`（shell 非経由）で実行、`args` 未指定の空白入り旧 command は実行しない。
- [ ] spawn 失敗 / timeout → `ESCALATE`（`DETERMINISTIC_UNRUNNABLE`）、非ゼロ exit → `NO_GO`
      （`STRICT_BLOCK`）に分岐。
- [ ] timeout / stdout 上限 / プロセスグループ kill が効く。
- [ ] `deriveGateDecision` に unrunnable 入力を追加し、rule 順・inputsHash を確定。opt-in 既定 OFF。

### 8.2 テスト観点（canary / 敵対テストを含む）

- **env スクラブ**: `GITHUB_TOKEN=secret` を親に設定した状態で command を起動し、子が
  それを読めない（空 / 未定義）ことを assert。allowlist した `PATH` のみ渡ることを確認。
- **trusted-ref pin canary**: PR head の `deterministicGate.command` を `evil` に書き換えた
  fixture で、実行されるのは base 側の command であることを assert。base に無い skill id の
  command が実行されないことも。
- **allowlist 照合**: allowlist 完全一致のみ実行、args 1 要素違い / 部分一致 / glob 風文字列は
  実行しないことを網羅（false-positive canary としても機能）。
- **argv 契約**: `command: "npm run lint"`（args 無し・空白入り）が実行されず unrunnable に
  なること。`{ command: "npm", args: ["run", "lint:ci"] }` は正しく起動すること。
- **spawn error / timeout 分離**: ENOENT command → ESCALATE、`sleep 999`（timeout）→ kill →
  ESCALATE、`exit 1` → NO_GO を各々 assert。**NO_GO ストーム回帰テスト**: 複数 skill が
  一斉に実行不能でも全体が NO_GO でなく ESCALATE に倒れること。
- **DoS**: 巨大 stdout（>1 MiB）で打ち切り、子孫プロセスが timeout kill 後に残らないこと。
- **rule 0 連動**: `.river/deterministic-allowlist.yaml` を触る diff が `GATE_CONFIG_CHANGED`
  で ESCALATE することを既存 rule 0 テストに追加。
- **fixture / description drift**: `deterministicGate` を含む skill fixture と schema
  `description`、parity canary を同一 PR で更新（CLAUDE.md 対応ガード）。

### 8.3 ドキュメント DoD

- [ ] ADR-003 の follow-up 参照（#1401）を本設計の結論で更新、または新 ADR/pages に反映。
- [ ] 残攻撃面（§6）を利用者向けドキュメントに明示（特に「allowlist 内 command の中身は
      PR 制御」「fork 爆弾は CI 資源制限依存」「base の人間レビュー必須が前提」）。

## 9. 参照

- Issue: #1401（本設計の対象）、Epic #1347 S4 = #1351（descope の経緯）
- `schemas/skill.schema.json`（`deterministicGate` 現定義・TRUST BOUNDARY 警告）
- `src/lib/skillYamlSchema.mjs`（zod 側 `deterministicGate`, `.strict()`, #1399 parity）
- `src/lib/gate-decision.mjs`（`deriveGateDecision`, rule 0-12, `STRICT_BLOCK`, fail-safe 方向）
- `src/lib/deterministic-gate.mjs`（`computeStrictBlock`, `isStrictBlockSkill`, opt-in 原則）
- `src/lib/git.mjs`（既存 `execFile` 利用パターン・`maxBuffer` の先例）
- `runners/github-action/action.yml`（CI 実行構成・env・`--gate` 2 段階導入）
- `docs/adr/003-risk-tiered-human-supervision.md`（trust boundary・#1401 への委譲）
- `docs/development/pipeline-params-checklist.md`（`deriveGateDecision` 引数伝播）

## 10. ブロッカー解決設計（設計のみ）

> Status: 本セクションは冒頭 Status ボックスの 3 ブロッカーに対する**実装前に確定すべき設計**である。
> コードは書かない。冒頭の「この 3 点が設計で解決されるまで実装しない」方針は維持し、§10 は
> その解決仕様を先に固定するためのものである。以下はいずれも**攻撃面をゼロにはせず縮小する緩和
> （mitigation）**であり、「絶対に安全」を主張しない。各ブロッカーの残余リスクを §10.4 に集約する。

### 10.1 ブロッカー 1: ゲート健全性の崩壊（command 実体が PR 制御）

#### 10.1.1 解決方針

「自己完結 command」を**運用規約ではなく schema/実装で機械判定**できる形に落とす。核は 2 段。

1. **入口の pin（既存機構 1・2 の徹底）**: 何を起動するか（argv）は base checkout から解決する。
2. **入口の先の pin（本ブロッカーの新規部分）**: 起動した command が **PR head の設定・スクリプト・
   `node_modules` を一切読まない**ことを強制する。強制の手段は (a) argv 静的検査（危険フラグ拒否）、(b) 実行時の config
   autoload 無効化（env / cwd / フラグ）、(c) 素の interpreter 登録の禁止、の 3 点である。

これにより「`npm run lint:ci` を allowlist したが `scripts.lint:ci` を `exit 0` に書換える」経路
（保護資産 #3 の直接崩壊）を塞ぐ。ただし後述のとおり `npm run`/`npx` 系はこの規約を満たせないため
Phase 1 の対象から外す。

#### 10.1.2 具体仕様

##### (A) allowlist エントリの形式強化（`.river/deterministic-allowlist.yaml`）

既存 §3.2 の argv 完全一致に加え、各エントリへ次のフィールドを必須化する。

```yaml
version: 1
commands:
  - id: eslint-flat # skill 側から名前参照する識別子（任意運用）
    command: /usr/bin/actionlint # 絶対パス必須（PATH 探索を許さない）
    args: ['-color', 'never']
    selfContained: true # 自己完結宣言。true 以外は Phase 1 で実行しない
```

- `command` は**絶対パス必須**。`npm` / `npx` / `bash` / `sh` / `node` / `python` 等の
  「素の interpreter 名」および相対パスは schema 検証で拒否する（下記 (C)）。
- `selfContained: true` を必須とし、これが立っていないエントリは実行器が
  `DETERMINISTIC_UNRUNNABLE` に倒す。将来 `selfContained: false` を許す拡張余地のためフィールド化する
  が、Phase 1 では true のみ実行可能とする。

##### (B) 危険フラグの静的拒否リスト（argv インジェクション検査）

allowlist ロード時（base 側）に、各エントリの `args` を次の denylist と照合し、1 つでも一致したら
そのエントリを**ロード時に無効化**（`DETERMINISTIC_UNRUNNABLE`、reasonCode に対象 id を載せる）する。
denylist は「コード/スクリプトを間接実行する、または config を外部から差し込むフラグ」を対象とする。

| 分類                          | 拒否トークン（例、完全一致 or プレフィックス一致）                         |
| ----------------------------- | -------------------------------------------------------------------------- |
| インライン評価                | `-e`, `--eval`, `-c`, `--command`, `-p`（node の print eval 経路）         |
| スクリプト/モジュール強制読込 | `-r`, `--require`, `--import`, `--loader`, `--experimental-loader`         |
| 間接サブコマンド実行          | `run`, `exec`, `run-script`, `dlx`, `-x`（npx exec）                       |
| shell 委譲                    | `-lc`, `-ic`, `--rcfile`, `--init-file`                                    |
| config 差込                   | `--config`, `--rc`, `--require-config` 等（後述 (D) と重複するが二重防御） |

- 照合は「トークン完全一致」を基本とし、`--eval=...` 形式の取りこぼしを防ぐため `=` より左を
  正規化してから比較する。
- denylist は**追加漏れが fail-open** になる（新種フラグを見逃す）。したがってこの denylist 単体を
  信頼せず、(A) の絶対パス限定・(C) の interpreter 禁止・(D) の autoload 無効化と**多層**で守る。
  denylist は「素の interpreter を誤って登録した場合の第二の網」と位置づける。

##### (C) 素の interpreter 登録の拒否（schema/実装レベル）

`command` の basename が interpreter denylist に一致するエントリがある。denylist は
`npm` / `npx` / `pnpm` / `yarn` / `node` / `deno` / `bun` / `bash` / `sh` / `zsh` の 10 個です。
加えて `python` / `python3` / `ruby` / `perl` / `make` / `env` / `xargs` の 7 個も denylist に含まれる。
そのエントリは、絶対パス指定であっても Phase 1 では `selfContained` を満たせないものとして拒否する。
理由: これらは本質的に「引数で任意コードを走らせる」設計であり、(B) の denylist を完全化できない。

##### (D) config autoload 無効化（実行時 env / cwd / フラグ）

実行器が子プロセスを起動する際、cwd から自動ロードされる設定を読ませない。§10.2 の HOME/cwd 分離と
一体で効かせる。

- cwd を **base checkout でも PR head でもない、レビュー対象を read-only bind した専用ディレクトリ**に
  する（§10.2.2）。`.npmrc` / `tsconfig` / `.eslintrc` / `.git/hooks` を cwd から拾わせない。
- env から `NODE_OPTIONS` / `NODE_PATH` / `*_CONFIG` / `XDG_CONFIG_HOME` を除去し、
  `XDG_CONFIG_HOME` は空一時ディレクトリを指す（§10.2 の HOME 差替と同型）。
- config 明示フラグ（`--no-config` 等）はツール依存で一般化できないため、**規約ではなく「config を
  そもそも読ませない環境」で担保**する（フラグに頼らない）。

##### (E) `npm run`/`npx` が必要なユースケースの第 2 段 pin（Phase 3 送り）

どうしても script 経由が要る場合の設計は、script 本体も `RIVER_TRUSTED_TREE`（base）から解決する
第 2 段 pin（§3.1 却下代替案の格上げ）とし、Phase 1 では**採用しない**。Phase 1 の対象 command は
「config 非依存の自己完結チェッカー（例: 単一バイナリで完結する構文チェッカー）」に限定する。

#### 10.1.3 処理順（ロード時 → 実行時）

1. base checkout から `.river/deterministic-allowlist.yaml` を読む（§3.2）。
2. 各エントリを検証: 絶対パス (A) → interpreter 拒否 (C) → 危険フラグ denylist (B) →
   `selfContained: true` (A)。1 つでも失格なら当該エントリを無効化し理由を記録。
3. skill の `deterministicGate.{command,args}`（base 側解決値）を、生き残った allowlist エントリと
   argv 完全一致で突合。
4. 一致した command のみ、(D) の autoload 無効化環境で実行。

#### 10.1.4 CI 側要件

- CI 追加要件は基本なし（allowlist は `.river/` 配下、base checkout から読む）。ただし
  「絶対パスで参照するバイナリ（例 `actionlint`）は CI ランナーに存在すること」を利用者が保証
  しなければならない。存在しなければ ENOENT → `DETERMINISTIC_UNRUNNABLE`（§3.5）に倒れ、fail-open しない。

#### 10.1.5 却下した代替案

- **AI レビューに「config 依存かどうか」を都度判定させる**: `.claude/rules/review-core.md` §#1070 の
  責務分界に反する。決定論で判定できる領域は静的検査 + canary で守るべきで、AI に委ねると誤検出の
  回帰に気づけない。
- **allowlist を許すが script 本体を diff 検査して変更を ESCALATE**: §3.1 却下と同型。難読化・間接
  呼び出しで fail-open。base pin（構造的）に劣る。
- **`--no-config` 系フラグを規約で必須化**: ツールごとにフラグ名が異なり網羅不能。フラグに頼らず
  「config を読ませない環境」で担保する (D) を採る。

### 10.2 ブロッカー 2: on-disk secret の遮断

#### 10.2.1 解決方針

env スクラブ（§3.3）が塞げない **on-disk 経路**を 2 系統で閉じる。

1. **`.git` 経由の token 露出**: `actions/checkout` 既定 `persist-credentials: true` は
   `GITHUB_TOKEN` を `.git/config` の `http.<host>.extraheader` に永続化する。command の cwd から
   `.git` を到達不能にし、かつ checkout 時に credentials を永続化させない。
2. **`$HOME` 配下の資格情報**: `~/.aws` / `~/.npmrc` / `~/.git-credentials` / `~/.config/gh` 等。
   子プロセスの `HOME`（および `XDG_CONFIG_HOME`）を**空の一時ディレクトリ**へ差し替える。

#### 10.2.2 具体仕様（command 専用の clean cwd）

##### (A) レビュー対象を read-only で見せる専用 cwd を作る

command は「PR head そのもの」ではなく、**レビュー対象ファイルだけを含み `.git` を含まない専用
ディレクトリ**を cwd として与える。データ形と手順:

1. `mktemp -d` で `RIVER_EXEC_ROOT` を作る（空・実行器のみ書込可）。
2. レビュー対象（lint 対象ファイル群）を `RIVER_EXEC_ROOT` に **copy**（symlink ではなくコピー、
   §10.3 の symlink 遮断と一体）で配置する。`.git` ディレクトリはコピーしない。
3. 子プロセスの cwd を `RIVER_EXEC_ROOT` にする。したがって `git config` / `.git/config` は
   到達不能になり、`.npmrc` / `tsconfig` 等の cwd autoload も発生しない（§10.1 (D) と一体）。

> **`git worktree` vs 別 checkout vs copy の選択**: `git worktree` は `.git`（gitdir リンク）を
> 経由して元リポジトリの `.git/config`（token）に到達し得るため**不採用**。別 checkout
> （`actions/checkout` を第 2 path へ `persist-credentials: false` で）でも `.git` は残るため、
> command の cwd はさらにその中の作業ツリーではなく `.git` を含まない copy とする。copy コストは
> レビュー対象ファイル数に比例するが、Phase 1 は逐次・小規模を前提に許容する。

##### (B) `HOME` / `XDG_CONFIG_HOME` の差し替え

§3.3 の SAFE_ENV 構築を次のとおり確定する。

- `HOME` = `mktemp -d` の空ディレクトリ（実 `$HOME` を継承しない）。
- `XDG_CONFIG_HOME` = 同上または `HOME/.config` を空で作る。
- `NODE_OPTIONS` / `NODE_PATH` / `AWS_*` / `*_TOKEN` / `*_SECRET` / `GITHUB_*` は継承しない
  （allowlist 方式、既定は空 + `PATH`/`LANG`/`LC_ALL`/`TZ` のみ）。

#### 10.2.3 CI 側要件（action.yml / workflow の具体変更）

現行 `.github/workflows/plangate-review.yml` は全 job で `actions/checkout@…v7` を
`persist-credentials` 未指定（＝既定 true）・`fetch-depth: 0` で実行している。deterministic exec を
有効化する構成では次を要求する。

1. **command を走らせる checkout は `persist-credentials: false`**。既存の plan/exec/verify job の
   checkout は River 本体を動かすためのもので、token 永続化を要することがあるものの、**command 実行専用の
   checkout step を分離**し、そこは `persist-credentials: false` にする。
2. `runners/github-action/action.yml` 側は、command 実行を有効化する入力
   （例 `deterministic_exec: 'false'` 既定、Phase 1 opt-in）を追加し、有効時に実行器へ
   `RIVER_TRUSTED_TREE`（base checkout path）と `RIVER_EXEC_ROOT`（clean cwd の親）を環境変数で渡す。
   これらの実ディレクトリ生成（`mktemp -d`・copy・base checkout）は composite action の bash step で
   行い、実行器は「与えられたパスを使うだけ」にする（実行器に checkout 権限を持たせない）。
3. base checkout は `github.event.pull_request.base.sha` を明示 ref に取得する（§3.1）。fork PR では
   secret 非注入・token read-only である（§2.1 訂正）。だが same-repo ブランチ構成では上記 1・2 を満たさない
   限り on-disk token 窃取が成立するため、**dark-launch（advisory）段階でも 1・2 を先に満たす**
   （§7 Phase 1 前提条件）。

#### 10.2.4 却下した代替案

- **env スクラブだけで足りるとする**: `.git/config` / `~/.aws` は env 経由でないため塞げない。
  構造的迂回として敵対レビューが指摘済み。
- **`persist-credentials: true` のまま `.git` を chmod で隠す**: 権限操作は取りこぼしやすく、
  同一 runner の別 step が戻す可能性は残る。cwd から `.git` を**物理的に含めない**方が堅い。

### 10.3 ブロッカー 3: stdout / findings exfil の遮断

#### 10.3.1 解決方針

2 経路で機密の外部露出を閉じる。

1. **symlink 非追跡**: レビュー対象を `~/.aws/credentials` や `/proc/self/environ` への symlink に
   すると、linter が実体を読んで stdout に載せ、それが PR コメント/findings へ露出する。
2. **stdout を PR/findings に生出力しない**: 判定は **exit code のみ**に還元し、command の stdout/stderr
   を PR コメント・findings の本文へそのまま載せない。

#### 10.3.2 具体仕様

##### (A) symlink 非追跡（clean cwd 構築時に検査）

§10.2.2 の copy 手順で、レビュー対象を `RIVER_EXEC_ROOT` へ配置する前に各エントリを検査する。

1. `lstat` で各対象パスを検査し、**symlink は copy しない**（スキップし、記録）。
2. ディレクトリを再帰コピーする場合も symlink をたどらない（`cp -R` ではなく symlink 非追跡の
   コピー、または各ファイルを `lstat` 判定してから通常ファイルのみコピー）。
3. コピー後の `RIVER_EXEC_ROOT` 内に絶対パス参照・`..` を含む symlink が残っていないことを
   再検査する（TOCTOU 緩和。§6.8 の path traversal 角度と一体で canary 固定）。

これにより command が「レビュー対象に見せかけた secret ファイル」を開く経路を、実行前の環境構築で
断つ。command 自身の symlink 追跡挙動に依存しない（linter に `--no-follow` 相当があっても信頼しない）。

##### (B) exit code のみで判定・stdout は host 側で隔離

- gate 判定への入力は **exit code のみ**（§3.5 の分岐: 0=パス / 非ゼロ=違反 / spawn 失敗・timeout=
  unrunnable）。command の stdout/stderr 文字列を finding の `message` や PR コメント本文へ**転記しない**。
- stdout/stderr は**捨てず、secret を載せない形で隔離保存**する。設計上の既定:
  - PR コメント・inline findings には **1 バイトも生出力しない**。
  - デバッグ用途には、`RUNNER_TEMP` 配下の**アーティファクトとして host 側のみに保存**し、
    PR には「command X が exit=N で違反」の**メタ情報のみ**を出す。アーティファクトは
    `pull-requests:write` 経由の外部露出面に載らない（Actions のアーティファクトはリポジトリ
    アクセス権限に閉じる）。
  - さらに保存前に既知 secret パターン（`GITHUB_TOKEN` 値・`AKIA[0-9A-Z]{16}` 等）を host 側で
    マスクする二重防御を推奨とする（完全性は主張せず、あくまで生 stdout を露出面から外すことが主）。
- finding の生成は「command 名（base 側 allowlist の id）+ exit code + 分類」から host が組み立てる。
  攻撃者が stdout 経由で finding 本文を制御する余地をなくす。

##### (C) DoS 上限（1 MiB）の位置づけの訂正

§3.6 の stdout 1 MiB 上限は**可用性（DoS）対策であって機密性を守らない**（secret は 1 MiB 未満）。
機密性は (B) の「そもそも stdout を露出面に載せない」で守る。両者は目的が異なる別レイヤであることを
ドキュメントに明記する（§8.3 DoD へ追加）。

#### 10.3.3 CI 側要件

- inline findings / PR コメントを生成する step
  （action.yml の `Post inline review comments` / `Post PR comment`、workflow の comment step）に、
  **command stdout を渡さない**ことを配線で保証する。
  command 実行結果は「exit code + 分類 + command id」の構造化データのみを River 本体へ返す。
- デバッグ用 stdout アーティファクトを保存する場合は `actions/upload-artifact` で
  `retention-days` を短く設定し、PR コメント経路とは分離する。

#### 10.3.4 却下した代替案

- **stdout を丸ごと PR に貼り、secret は 1 MiB 上限で防ぐ**: 上限は機密性に無関係。生出力は不可。
- **command 側に「secret を出力しない」規約を課す**: 攻撃者が破る規約は無効（§3.3 と同型）。
- **stdout を完全破棄しデバッグ不能にする**: 運用性が落ち、実行不能の原因究明が困難になる。
  host 側隔離保存 + マスクで、露出面から外しつつデバッグ性を残す。

### 10.4 この深掘りでも残る攻撃面（正直な列挙）

§10 は 3 ブロッカーを**縮小**するが、次は Phase 1 の緩和後も残る。

1. **allowlist 内 command が読むツールチェーン自体の完全性**: 絶対パスバイナリ
   （例 `actionlint`）が CI イメージ側で汚染される供給網リスクは River 単体では守れない
   （§6 論点、CI イメージ・pin の責務）。
2. **copy コスト・大規模ツリーでの TOCTOU**: clean cwd の copy + 再検査は実行前一時点の保証で、
   極端に大きいツリーやコピー中の競合は残余。Phase 1 を逐次・小規模に絞ることで緩和。
3. **PATH 経由バイナリ**: 絶対パス強制 (10.1 A) で allowlist 側は縛れるが、`PATH` を env に残す限り
   command が内部で子プロセスを PATH 解決する余地は残る（§6 論点 3）。Phase 3 で PATH ハードニング。
4. **マスク漏れ**: §10.3 (B) の secret マスクは既知パターンのみで、未知形式の secret が
   デバッグアーティファクトに残る可能性。露出面（PR）からは外れるが host 側保存には残る。
5. **base への悪意 command 混入**: trusted-ref pin の大前提。CODEOWNERS / required review
   （§6 論点 7）が崩れれば全防御が無効。本設計のスコープ外だが前提条件として明記。
6. **`setsid` による pgroup 回避 / fork 爆弾**: §3.6・§6.8 の既知残余。cgroup/コンテナ資源制限依存。
7. **OS サンドボックス不在での絶対パス直読み（gemini #1426, security）**: `HOME`/`cwd` の差し替えは
   **config autoload を防ぐだけ**で、プロセス自体は OS レベルで隔離されていない。悪意ある command や
   脆弱なリンターが `/home/runner/.aws/credentials`・`/etc/passwd`・元 checkout（`.git` が残る場所）を
   **絶対パスで直接読む**ことは防げない。真の隔離（Docker / chroot / gVisor 等のコンテナサンドボックス）は
   Phase 3 以降の課題。Phase 1 は「絶対パス直読みは緩和できない」ことを明記して advisory・既定 OFF で運用。
8. **`@file` 引数構文による argv denylist バイパス（gemini #1426, security）**: `tsc`/`javac` 等は
   引数をファイルから読む `@filename` 構文を持つ。allowlist の command がこれを解釈すると、攻撃者は
   PR 内に `--eval`/`--require` を書いたファイルを置き `@path` を渡すことで §10.1.2 (B) の危険フラグ
   静的拒否を**完全に回避**できる。対策候補（実装時に確定）: `@` で始まる引数の静的拒否、`@file`
   構文をサポートする command の除外。denylist 単体を信頼しない多層防御の一部として扱う。
9. **public repo の Actions アーティファクト公開性（gemini #1426, security）**: §10.3.2 (B) は stdout を
   PR コメントに載せず `RUNNER_TEMP` アーティファクトへ隔離する。だが **public repo では Actions
   アーティファクトはフォーク PR 著者を含め誰でも DL 可能**。secret が stdout に漏れてアーティファクト化
   されれば取得され得る。アーティファクト隔離は「PR コメント露出」を防ぐだけで機密保護の完結ではない。
   → host 側の既知 secret マスク（§10.3.2）を**二重防御**として必須化し、public repo では
   アーティファクト保存自体を最小化/無効化する運用を推奨。

> **コピー範囲のトレードオフ（gemini #1426, §10.2 補足）**: clean cwd に「変更ファイルのみ」を置くと
> `tsc`/`eslint`/テストランナーが未変更ファイル・型定義・共通設定を解決できず `Module not found` で
> 実行失敗しやすい。一方「`.git` 除くリポジトリ全体」を毎回 copy すると大規模リポジトリで I/O・時間の
> オーバーヘッドが大きい。Phase 1 は「config 非依存の自己完結チェッカー」に絞る（§10.1）ため
> 全体 copy を要さないが、`npm run` 系を許す将来 Phase では「必要最小の依存サブツリーのみ copy」か
> 「読み取り専用 bind mount + サンドボックス」を実装時に確定する。

### 10.5 実装 GO 判定（本セクションの結論）

- **ブロッカー 1**: 「絶対パス限定 + interpreter 拒否 + 危険フラグ denylist + `selfContained` 必須 +
  cwd/env による autoload 無効化」で、素の interpreter と config 差込経路を機械判定で塞ぐ設計を確定。
  ただし `npm run`/`npx` 系は Phase 1 対象外（Phase 3 の第 2 段 pin 送り）とする**適用範囲の縮小**が
  前提。
- **ブロッカー 2**:
  「command 専用 clean cwd（`.git` 非露出・copy）+ `persist-credentials: false` + `HOME`/`XDG_CONFIG_HOME` 空一時ディレクトリ」
  で on-disk 経路を塞ぐ設計を確定。CI 側は
  command 実行専用 checkout の分離が必須。
- **ブロッカー 3**: 「clean cwd 構築時の symlink 非追跡コピー + exit code のみ判定 + stdout を
  露出面に載せず host 側隔離保存 + マスク」で exfil を塞ぐ設計を確定。1 MiB 上限は可用性専用と再定義。

**総合所感**: 3 ブロッカーはいずれも**実装可能な設計仕様まで具体化**でき、canary で回帰固定できる
形になった。しかし §10.4 の残余（供給網・PATH・base 前提・fork 爆弾）は Phase 1 の緩和では潰れず、
かつブロッカー 1 は「対象 command を config 非依存の自己完結チェッカーに絞る」という**適用範囲の
大幅縮小**を代償にしている。したがって判定は **GO ではなく CONDITIONAL（据え置き）**。GO 相当に
上げる条件は次の 3 点です。

1. §10.1〜10.3 の各仕様に対する canary/敵対テスト（§8.2 に追記済みの観点 + 本節の
   symlink・clean cwd・interpreter 拒否・stdout 非露出）の実装計画が DoD に組み込まれること。
2. Phase 1 の allowlist 対象を「config 非依存の自己完結バイナリ」に限る運用規約が
   `.river/deterministic-allowlist.yaml` の schema（`selfContained: true` 必須・interpreter 拒否）で
   強制されること。
3. §10.4 残余（特に base の人間レビュー必須・供給網・PATH）を利用者向けドキュメント（§8.3）へ
   明示し、既定 OFF・advisory 先行（§7）を維持すること。

上記 3 点を実装 PR の DoD に固定できれば、Phase 1（opt-in・既定 OFF・advisory）に限り GO 相当へ
引き上げてよい。無制限の command 実行や `npm run` 系の許可は引き続き CONDITIONAL のままとする。

## 11. Executor 実装仕様と DoD

> Status: Design（設計のみ）。本セクションは #1401 の**実行層（executor）**を確定するものである。
> **executor の実装コードは書かない**。検証層（`src/lib/deterministic-command-allowlist.mjs`,
> §10.1 の parseAllowlist / validateAllowlistEntry / loadValidAllowlist / matchCommand）は実装済みで、
> 子プロセスを起動しない。残るのは「valid entry を実際に子プロセスとして起動し exit code を得る」
> RCE 面の本体であり、本セクションはその I/F・環境構築・gate 接続・DoD・実装増分を固定する。
> §1-10 の判定（CONDITIONAL・Phase 1 opt-in・既定 OFF）は無改変で、本セクションはその上に載る。

### 11.1 Executor の I/F（純設計）

#### 11.1.1 関数シグネチャ

executor は「valid entry を 1 件受け取り、clean cwd と scrub 済み env で起動し、exit code を
分類して返す」単一責務の関数とする。

```js
// 概念シグネチャ（実装はしない）。stdout を返り値に含めないのが要点（§10.3）。
executeDeterministicCommand({
  entry,        // matchCommand が返した valid entry（絶対パス command + args + selfContained:true）
  targetDir,    // レビュー対象（PR head）ツリーの絶対パス。ここから clean cwd へ copy する
  limits,       // { timeoutMs=60000, maxBufferBytes=1<<20 }（host 設定で上書き可、§3.6）
  trustedTree,  // RIVER_TRUSTED_TREE（base checkout）。entry はここ由来である前提の再確認に使う
}) => {
  // return {
  //   status: 'pass' | 'fail' | 'unrunnable',
  //   exitCode?: number,          // 起動成功時のみ。unrunnable では undefined
  //   reasonCode: string,         // 'STRICT_BLOCK' 相当 | 'DETERMINISTIC_UNRUNNABLE'
  //   durationMs: number,
  //   commandId?: string,         // entry.id（finding 生成用のメタ。stdout は含めない）
  //   unrunnableCause?: 'spawn_error' | 'timeout' | 'not_allowlisted' | 'argv_unmigrated'
  //                    | 'symlink_rejected' | 'setup_error',
  // }
}
```

- **stdout / stderr を返り値に含めない**（§10.3.2 (B)）。判定は exit code のみに還元する。
  stdout/stderr は host 側で `RUNNER_TEMP` アーティファクトへ隔離保存し（後述 11.4）、返り値・
  finding 本文・PR コメントには 1 バイトも載せない。攻撃者が stdout 経由で finding を制御する
  余地をなくす。
- 返り値は **3 状態**（`pass` / `fail` / `unrunnable`）に閉じる。gate 方向はこの状態から一意に
  決まる（11.5）。`fail` = 違反 → NO_GO 相当、`unrunnable` = 判定不能 → ESCALATE。

#### 11.1.2 入力の多層再確認（executor 側でも実行不能条件を再チェック）

executor は検証層 `matchCommand` の出力（valid entry）を入力とするが、**起動直前に実行不能条件を
再確認**してから spawn する（多層防御。検証層と executor の間で entry が差し替わる・path が
すり替わる経路を塞ぐ）。再確認項目:

1. `entry.command` が絶対パス・basename が interpreter denylist 非該当・`args` に危険フラグ /
   `@file` を含まない・`selfContained === true`（= `validateAllowlistEntry` を executor 側でも
   再評価する。検証層と同じ関数を再利用し、二重評価の一貫性を canary で固定）。
2. `entry` が `trustedTree` 由来であること（base pin。11.6）。base に無い skill id / PR head 由来の
   entry は起動しない。
3. clean cwd 構築（11.2）が成功したこと。symlink 検出・copy 失敗時は spawn せず
   `unrunnable`（`setup_error` / `symlink_rejected`）。

いずれか失格なら **spawn せず `unrunnable`** を返す（fail-open しない）。

### 11.2 clean cwd の構築（§10.2.2 の具体化）

レビュー対象のみを含み `.git` を含まない専用ディレクトリを cwd として与える。

1. `fs.mkdtemp` で `RIVER_EXEC_ROOT` を作る（実行器のみ書込可の空ディレクトリ）。
2. `targetDir` のレビュー対象ファイルを `RIVER_EXEC_ROOT` へ **copy**（symlink 非追跡）で配置する。
   各エントリを `lstat` で検査し、**symlink はコピーせず記録**（§10.3.2 (A)）。再帰コピーも symlink を
   たどらない（`cp -R` に頼らず、各ファイルを `lstat` 判定してから通常ファイルのみコピー）。
   `.git` ディレクトリは**コピー対象から除外**する（on-disk token 遮断、§10.2）。
3. コピー後、`RIVER_EXEC_ROOT` 内に絶対パス参照・`..` を含む symlink が残っていないことを**再検査**
   する（TOCTOU 緩和、§6.8 path traversal 角度）。1 つでも残れば `unrunnable`（`symlink_rejected`）。
4. 子プロセスの cwd を `RIVER_EXEC_ROOT` にする。`git config` / `.git/config`（persist された token）は
   到達不能になり、`.npmrc` / `tsconfig` 等の cwd autoload も発生しない（§10.1 (D) と一体）。

**ライフサイクル・後始末**: `RIVER_EXEC_ROOT` と後述の空 `HOME` は executor が作成し、
`try/finally` で**必ず削除**する（timeout kill・spawn 失敗・例外の全経路で残さない）。
削除失敗はログのみで gate 判定に影響させない。**コピー範囲は Phase 1 の「config 非依存の自己完結
チェッカー」前提で最小化**する（§10.4 補足。`tsc`/`eslint` 等の依存解決を要する command は Phase 1
対象外なので全体 copy を要さない）。

### 11.3 env の構築（§3.3 / §10.2）

`process.env` を継承させず、空 env から SAFE_ENV allowlist のみを積む。

- **SAFE_ENV allowlist**: `PATH`, `LANG`, `LC_ALL`, `TZ` のみ（親に存在するときだけ積む）。
- **`HOME`**: 実 `$HOME` を継承せず、`fs.mkdtemp` の**空一時ディレクトリ**を割り当てる
  （`~/.aws` / `~/.npmrc` / `~/.git-credentials` 遮断）。`XDG_CONFIG_HOME` も同じ空ディレクトリ
  （または `HOME/.config` を空で作成）を指す。
- **継承しないもの（明示）**: `NODE_OPTIONS`（`--require ./evil.js` 実行時コード注入）,
  `NODE_PATH`, `XDG_CONFIG_HOME`（上書きで空へ）, `GITHUB_*`, `AWS_*`, `*_TOKEN`, `*_SECRET`,
  `*_CONFIG`。denylist ではなく **allowlist 方式**（新種 secret 変数に fail-open しない）。
- SAFE_ENV allowlist は host 設定（`.river/deterministic-allowlist.yaml` の将来 `env:` 拡張）で
  足せるが、**既定に secret 系・`NODE_OPTIONS` を一切含めない**不変条件を実装で固定する。

### 11.4 実行（§3.4 / §3.6）

- **`execFile`（shell 非経由 / `shell: false`）**で `entry.command`（絶対パス）+ `entry.args` を起動する。
  単一文字列を shell 解釈させる経路は**作らない**（argv 契約、§3.4）。
- **`timeout`**: 既定 60s（`limits.timeoutMs`）。超過で kill。
- **`maxBuffer`**: 各 1 MiB（`limits.maxBufferBytes`）。**stdout/stderr は判定に使わず**、
  host artifact へ隔離（11.1.1）。上限超過は打ち切り（DoS 対策であって機密性ではない、§10.3.2 (C)）。
- **プロセスグループ kill**: `spawn` の `detached: true` + `process.kill(-pid, 'SIGKILL')` で
  子孫プロセスごと終了させる。**Linux 前提**（CI は `ubuntu-latest`）。Windows では負 PID kill を
  行わず timeout 単体にフォールバックする旨を実装コメントで明示（§3.6 移植性注意）。`setsid` で
  pgid を変える子には届かない点は既知残余（§6.8 Low）。
- **逐次実行**（同時 1 プロセス、§3.6）。並列化は将来拡張。

### 11.5 結果 → reasonCode → gate 接続（§3.5）

#### 11.5.1 status → reasonCode → gate 方向

| executor status | 事象                                                                              | reasonCode                 | gate 方向              |
| --------------- | --------------------------------------------------------------------------------- | -------------------------- | ---------------------- |
| `pass`          | 起動成功・exit 0                                                                  | （なし）                   | gate へ何も足さない    |
| `fail`          | 起動成功・exit 非0                                                                | `STRICT_BLOCK` 相当        | `NO_GO`（strictBlock） |
| `unrunnable`    | spawn 失敗 / timeout / allowlist 不一致 / argv 未移行 / symlink 拒否 / setup 失敗 | `DETERMINISTIC_UNRUNNABLE` | `ESCALATE`             |

- `pass` は「gate へ何も足さない」（既存判定を素通し）。deterministic の合格は「ブロックしない」
  だけで GO を積極的に押さない（fail-safe 非対称性の維持）。
- `fail` は既存 `strictBlock` 入力へ合流させる。executor は `computeStrictBlock`（§既存）が
  finding ベースで立てる `strictBlock` と**同じ真偽入力に写像**する。すなわち executor の `fail` は
  「deterministic skill が違反を検出した」ことの別経路の証拠であり、`deriveGateDecision` の
  `strictBlock` パラメータへ **OR 合成**する（どちらか true なら NO_GO STRICT_BLOCK）。
- `unrunnable` は新パラメータ `deterministicUnrunnable: boolean`（+ 対象 skill/command id 群）で
  `deriveGateDecision` に渡し、新 reasonCode `DETERMINISTIC_UNRUNNABLE` → `ESCALATE` に写像する。

#### 11.5.2 deriveGateDecision への配線（rule 順の確定）

§5 で「rule 5b の直後」と仮置きした位置を、executor 接続に合わせて確定する。

- `deriveGateDecision` に **`deterministicUnrunnable`（boolean）** を追加する。既存
  `strictBlock`（rule 5b, `NO_GO STRICT_BLOCK`）の**直後に rule 5c** を新設する。

  ```text
  5b. strictBlock (finding OR executor fail) → NO_GO     STRICT_BLOCK
  5c. deterministicUnrunnable               → ESCALATE  DETERMINISTIC_UNRUNNABLE
  ```

- **合成順序の確定（§6.8-5 の論点）**: 同一 run で「skill A が違反（strictBlock=true）」かつ
  「skill B が実行不能（deterministicUnrunnable=true）」の状況を想定する。このとき、**strictBlock（NO_GO）を優先**する
  （5c より 5b が先）。理由: **違反はすでに確定した情報**であり、確定した block を「別 command が
  実行不能だから」という弱い情報で ESCALATE へ格上げするのは、攻撃者が「わざと別 skill を
  実行不能にして strict_block を人間承認フローへ逃がす」余地を生む。escalation cliffs（rule 0-4）は
  従来どおり 5b/5c の**両方に優先**する（`.river/**` 変更・humanApprovalRequired 等は最優先）。
  この非対称は「cliffs(0-4) > 確定違反(5b) > 実行不能(5c)」という一貫した保守順を保つ。
  - 補足: この判断は §3.5 表「ESCALATE の方が保守的」と一見矛盾するが、**ESCALATE が保守的なのは
    "GO/NO_GO を確定できないとき" に限る**。違反が確定している 5b はすでに最も安全な NO_GO に
    倒れており、5c で人間承認へ緩めるのは可用性・回避耐性の両面で劣る。§6 論点 5 をこの順で解決する。

- **inputsHash の扱い**: `computeGateInputsHash` の `FIELDS` へ `deterministicUnrunnable` を
  「**真のときだけ canonical に足す**」方式で加える（既存 `strictBlock === true` と同型）。
  これで pre-existing fixture の hash churn を避ける（gate-decision.mjs の既存コメント準拠）。
- **パラメータ伝播**: `deriveGateDecision` に引数を足すため、CLAUDE.md「Propagate signatures」/
  `docs/development/pipeline-params-checklist.md` に従い全呼び出し箇所を洗う。`strictBlock` を組む
  既存経路（`computeStrictBlock` の呼び出し元）と同じ場所で executor 結果を合流させる。

#### 11.5.3 executor 結果の合流点

- executor は review-engine のパイプライン内で、`computeStrictBlock` が finding ベースで
  `strictBlock` を組む**直後**に呼ぶ。executor の `fail` を既存 `strictBlock` へ OR し、
  `unrunnable` を `deterministicUnrunnable` へ集約する。
- gate 接続は `deriveGateDecision`（`deriveRunGate` 相当の呼び出し元）でのみ行い、executor 自体は
  gate を知らない（executor は exit code の分類までで責務を閉じ、gate 写像は純関数側に集約する）。

### 11.6 CI 側要件（action.yml / workflow）

- **`RIVER_TRUSTED_TREE`**: base ref（`github.event.pull_request.base.sha`）を第 2 の checkout path に
  取得し、その絶対パスを executor へ渡す。command/args/allowlist はここからのみ解決する（§3.1）。
- **`persist-credentials: false`**: command 実行に関わる checkout（および base checkout）で token を
  `.git/config` に永続化させない（§10.2.3）。clean cwd は `.git` 非露出なので二重防御。
- **opt-in フラグ `RIVER_DETERMINISTIC_EXEC=1`（既定 OFF）**: `action.yml` に入力
  `deterministic_exec`（既定 `'false'`）を追加し、true のときだけ executor を有効化する。
  **フラグ無しでは executor を一切呼ばない**（11.7 の「既定 OFF」DoD）。
- **advisory 先行**: Phase 1 は `gate: false`（advisory）と組み合わせ、digest で実行実績・
  unrunnable 率を観測する（§7 Phase 1）。dark-launch でも §7 の 3 前提（自己完結 command 限定 /
  clean cwd + persist-credentials:false / stdout 非露出）を先に満たす。
- **clean cwd / 空 HOME の生成主体**: `mkdtemp`・copy・base checkout の実ディレクトリ生成は
  composite action の bash step が行う。executor は「与えられたパスを使うだけ」にする
  （executor に checkout 権限を持たせない、§10.2.3）。
- **stdout をコメント経路に渡さない配線**: `Post inline review comments` / `Post PR comment` step へ
  command stdout を渡さない。デバッグ stdout は `actions/upload-artifact`（短い `retention-days`）で
  隔離し、public repo ではアーティファクト保存を最小化/無効化する（§10.3.3 / §10.4-9）。

### 11.7 DoD（executor 実装 PR が満たすべき完了条件）

§10.5 の DoD 3 条件を executor に落とす。

#### 11.7.1 機能 DoD

- [ ] executor が **valid entry のみ起動**する（起動前に `validateAllowlistEntry` を再評価。多層）。
- [ ] clean cwd（`.git` 非含・symlink 非追跡 copy・再検査）を構築し、`try/finally` で必ず後始末。
- [ ] env が SAFE*ENV allowlist のみ
      （`HOME`/`XDG_CONFIG_HOME` は空一時ディレクトリ、`NODE_OPTIONS`/`*_TOKEN`/`AWS\*_`/`GITHUB\_\_` 非継承）。
- [ ] `execFile`（shell 非経由）・timeout 60s・maxBuffer 1 MiB・detached + pgroup kill が効く。
- [ ] status → reasonCode 写像（`fail`→`STRICT_BLOCK` OR 合流 / `unrunnable`→`DETERMINISTIC_UNRUNNABLE`）。
- [ ] `deriveGateDecision` に rule 5c（`deterministicUnrunnable`→ESCALATE）を追加、合成順 5b>5c を固定、
      inputsHash は真のときだけ加算。
- [ ] **既定 OFF**: `deterministic_exec`/`RIVER_DETERMINISTIC_EXEC` 無しで executor を一切呼ばない。

#### 11.7.2 テスト計画（canary / 敵対テスト）

- **canary（検証層と executor の一貫性）**: `validateAllowlistEntry` が reject する entry を
  executor が**絶対に起動しない**こと（valid entry のみ spawn）。検証層で reject 済みの
  interpreter / 危険フラグ / `@file` / 相対パス / `selfContained:false` を executor 入口でも
  弾く二重評価の一致を assert。
- **env スクラブ実証**: 親に `GITHUB_TOKEN=secret` / `AWS_SECRET_ACCESS_KEY=…` を設定した状態で
  「env をダンプする無害バイナリ」を起動する。子がそれらを**読めない**（空/未定義）こと、
  allowlist した `PATH` のみ渡ることを assert。
- **on-disk token 到達不可**: clean cwd に `.git` が無いこと、`HOME` が空一時ディレクトリで
  `~/.aws` 等に到達できないことを、`cat $HOME/.aws/credentials` 相当が失敗することで実証。
- **symlink exfil 遮断**: レビュー対象に `~/.aws/credentials` / `/proc/self/environ` への symlink を
  仕込んだ fixture を使う。この fixture で、symlink が clean cwd に**コピーされない**こと・再検査で `symlink_rejected`
  → `unrunnable` になることを assert。
- **spawn error / timeout 分離**: ENOENT（存在しない絶対パス）→ `unrunnable`（ESCALATE）、
  `sleep 999` 相当（timeout）→ kill → `unrunnable`、`exit 1` → `fail`（NO_GO）を各々 assert。
- **NO_GO ストーム回帰**: 複数 skill が一斉に `unrunnable` でも全体が NO_GO でなく **ESCALATE** に
  倒れること。加えて「A=fail + B=unrunnable」で **NO_GO（5b 優先）** になることを assert（合成順）。
- **絶対パス直読みは緩和できない旨の明示テスト**: `HOME`/cwd 差替は config autoload を防ぐだけで、
  command が `/etc/passwd` 等を**絶対パスで直接読む**ことは防げない（§10.4-7）。この限界を
  「既知の残余」として**明示的に文書化・テストコメント化**し、Phase 1 は advisory・既定 OFF で
  運用する前提を固定する（過大な安全性主張をしないためのネガティブテスト）。
- **DoS**: 巨大 stdout（>1 MiB）で打ち切り、timeout kill 後に子孫プロセスが残らないこと。
- **既定 OFF 確認**: フラグ無しの run で executor が一度も呼ばれないこと（spy/mock で 0 回）。

#### 11.7.3 dist 影響

- executor は `src/**` に置き、action にバンドルされる（`runners/github-action/dist/index.mjs`）。
  `src/**` を触るため、`.nvmrc` に合わせた `npm run build:action` で dist を再生成し、dist-check を
  green にする（CLAUDE.md「Merge-time checks」/ `docs/development/dist-check-rebuild-guide.md`）。
- 既定 OFF のため dist に含まれても実行時フラグ無しでは起動しない。バンドルサイズ影響は
  `child_process`/`fs` 等の Node 標準のみで新規依存を増やさない（新依存を足さない DoD）。

### 11.8 実装順（executor を安全に刻む増分）

executor をさらに小さく分け、各段を単独でテスト可能にする。

1. **(a) clean cwd + env builder（実行なし・純関数）**: `RIVER_EXEC_ROOT` 構築（symlink 非追跡 copy +
   再検査）と SAFE_ENV/空 HOME 構築を、**子プロセスを起動しない純関数**として実装する。
   ここまでは検証層と同じく RCE 面ゼロで、symlink 遮断・env allowlist・後始末を canary で固定できる。
2. **(b) execFile 起動（exit code 分類）**: (a) の出力を使って `execFile`（shell 非経由・timeout・
   maxBuffer・pgroup kill）で起動し、status（`pass`/`fail`/`unrunnable`）へ分類する。**gate には
   まだ接続しない**。spawn error/timeout 分離・DoS 上限・stdout 非返却をここで固定する。
3. **(c) gate 接続**: `deriveGateDecision` に rule 5c（`deterministicUnrunnable`）を追加する。
   executor の `fail`/`unrunnable` を `strictBlock` OR / `deterministicUnrunnable` へ合流させる。
   合成順（5b>5c）・inputsHash・パラメータ伝播をこの段で確定する。
4. **(d) CI 配線 + opt-in（実装済み）**: `action.yml` に opt-in の `deterministic_exec`（既定 OFF）と
   `trusted_tree`（既定空）を追加した。両方が揃った（`deterministic_exec=true` かつ `trusted_tree` が
   実在ディレクトリ）ときだけ `RIVER_DETERMINISTIC_EXEC=1` と `RIVER_TRUSTED_TREE` を export し、
   欠ければ executor は OFF のまま（fail-safe）である。gate は既定 advisory のままなので、
   有効化しても `gate=true` を別途指定しない限りジョブは落ちない dark-launch となる。
   trusted tree は composite action が推測せず、呼び出し側が base ref を別パスに checkout して渡す。

各段は前段の canary を壊さないことを条件に進める。(a)(b) は RCE 面を持たない／持っても gate に
影響しないため、レビュー負荷を (c)(d) に集中できる。

#### (d) 呼び出し側の利用例

`trusted_tree` はホスト信頼された base checkout を指す必要があります。次のように base ref を
別パスへ `persist-credentials: false` で checkout して渡します。allowlist はこの tree の
`.river/deterministic-allowlist.yaml` からのみ読まれ、レビュー対象（PR head）からは決して読まれません。

```yaml
steps:
  - uses: actions/checkout@v4 # PR head（レビュー対象）
    with:
      persist-credentials: false # 多層防御: .git/config に GITHUB_TOKEN を残さない
  - uses: actions/checkout@v4 # base ref（ホスト信頼）
    with:
      ref: ${{ github.event.pull_request.base.sha }}
      path: .river-trusted
      persist-credentials: false
  - uses: your-org/river-review@v1
    with:
      deterministic_exec: 'true'
      trusted_tree: ${{ github.workspace }}/.river-trusted
      # gate は既定 false のまま（dark-launch）。観測後に true へ。
```

### 11.9 まだ設計で詰めきれていない論点（実装時に確定）

- **レビュー対象の copy 範囲の確定**: Phase 1 は「config 非依存の自己完結チェッカー」前提で
  「変更ファイルのみ」か「（`.git` 除く）対象サブツリー」かを、対象 command の入力仕様に合わせて
  実装時に確定する（§10.4 補足のトレードオフ）。単一バイナリ構文チェッカーなら変更ファイルのみで足りる。
- **`fail`（executor）と finding-based `strictBlock` の finding 表現**: executor の `fail` は
  stdout を持たない。そのため、finding 本文は「command id + exit code + 分類」から host が組み立てる
  （§10.3.2）。この合成 finding を既存 finding 配列にどう混ぜるか（ruleId の割当・重複排除）は
  review-engine 側で確定する。
- **base pin の path 解決 TOCTOU / skill-id 同定**（§6.8 Med）:
  executor 入口の「entry が `trustedTree` 由来」再確認を、`..`/symlink/id 衝突に耐える形で実装する具体手順は canary と
  合わせて固定する。検証層は「値が base 由来か」を守るが path traversal 角度は executor 側で追加する。
- **stdout マスクの完全性は主張しない**: host 側 secret マスク（§10.3.2）は既知パターンのみ。
  public repo のアーティファクト公開性（§10.4-9）と合わせ、Phase 1 は「露出面から外す」ことを
  主眼にし、完全な機密保護は Phase 3（OS サンドボックス）送りとする境界を実装コメントで明示する。
