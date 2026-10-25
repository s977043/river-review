---
id: 'plangate-gc-deterministic'
name: PlanGate 決定論的 GC 判定
description: River Review の artifact / memory / log に対して、retention 設定 + hard guards + excludes から決定論的に KEEP/REMOVE を判定する GC skill
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '.river/memory/**'
  - 'artifacts/evals/**'
  - 'artifacts/review-artifact*.json'
tags: [plangate, gc, maintenance, deterministic, upstream]
severity: minor
inputContext: [repoConfig, fullFile]
outputKind: [summary, findings, actions]
modelHint: cheap
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: `river gc` から呼び出され、retention 設定・hard guards・excludes を基準に artifact inventory を突き合わせて決定論的に KEEP/REMOVE を出力する照合型 skill。必須入力が欠ければ実行を止めるゲート（Inversion）も担う。

## Goal / 目的

- `river gc` CLI が供給する file inventory（path / sizeBytes / mtimeEpoch）と retention 設定・hard guards・excludes から、各パスを KEEP または REMOVE に**決定論的**に分類する。
- REMOVE と判定したエントリには、根拠となったルール名（`age` / `count` / `size`）を 1 つだけ紐付け、`river gc` の JSON 出力 `removed[]` にそのまま流せる形で返す。
- 下流（`river gc` の削除実行段）が retention policy を再現可能に適用できるよう、判定順序とタイブレークを固定する。

## Non-goals / 扱わないこと

- ファイルシステムの走査（inventory 生成は CLI 側の責務）。このスキルは渡された inventory だけを評価する。
- 実際の削除操作（副作用は `river gc --force` の実行段で行う）。
- retention 値そのものの妥当性判断（`--retention-days` / `--max-entries` / `--max-size-mb` の設計は `pages/reference/cli-gc-spec.md` と CLI に委ねる）。
- review / midstream / downstream 観点の品質指摘（GC 専任）。
- PlanGate 固有のディレクトリ構成や内部コマンドへの依存判定（`pages/reference/artifact-input-contract.md` に従い artifact-driven で判断）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 入力 inventory `{ "paths": [...], "scope": "..." }` が存在し、`paths` が空でない
- [ ] 各 `paths[]` 要素に `path` / `sizeBytes` / `mtimeEpoch` が揃っている
- [ ] retention 設定 `{ "days": N, "maxEntries": N, "maxSizeMb": N }` のすべてのキーが数値として与えられている
- [ ] 基準時刻 `now` が epoch 秒として明示的に与えられている（呼び出し時刻へのフォールバックは決定論を破るため禁止）

ゲート不成立時の出力: `NO_REVIEW: plangate-gc-deterministic — inventory / retention config が不足`

**Gate と抑制条件の違い:**

- Gate = 入力不足で判定ロジック自体が成立しないので実行しない。
- 抑制条件 = 実行した上で個別の指摘を黙らせる。

## False-positive guards / 抑制条件

- `hardGuards` に列挙された single-source ファイル（例: `.river/memory/index.json`、`artifacts/evals/latest`、schema 本体）は、どの retention policy にヒットしても REMOVE に分類しない。`removed[]` には一切現れない。
- `--exclude` glob に一致したパスも同様に常に KEEP とし、`removed[]` には現れない。
- `scope` に該当しないパス（呼び出し側が誤って混入させた場合）は判定対象から外す。混入そのものは warning としても良いが、再現性を崩さないため severity は据え置く。
- inventory が同一スコープの異なる粒度（ファイル / ディレクトリ）を混在して渡してきた場合、ディレクトリは判定対象から外し、ファイル単位のみで評価する。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

GC 判定は以下の順序で**固定適用**する。順序を変えると同一入力で出力が変わりうるため、この順序自体が決定論契約の一部。

### 1. Hard guard（最優先・常に KEEP）

- `hardGuards` に列挙されたパスは retention policy のヒット状況に関わらず KEEP。
- 判定記録に `reason` は付けず、`removed[]` に絶対に出さない。

### 2. Exclude glob（常に KEEP）

- `--exclude` glob に一致するパスは KEEP。hard guard と同じ扱い。
- 複数の exclude glob に一致してもカウントは 1 件。

### 3. Age（`reason: "age"` で REMOVE）

- `mtimeEpoch` が `now - days * 86400` より古いパスを REMOVE。
- 基準時刻 `now` は **入力として CLI から明示的に与えられる必須フィールド**（実行開始時に固定された epoch 秒）。呼び出し時刻へのフォールバックはしない — 同一入力で再実行したとき `removed[]` が変わらないよう、`now` が欠損していれば Pre-execution Gate で `NO_REVIEW` とする。

### 4. Count（`reason: "count"` で REMOVE）

- Age 判定を通過した（= まだ KEEP 候補の）パスを scope 内で `(mtime DESC, path DESC)` で並べ、`maxEntries` 番目を超える末尾側（＝古いもの）を REMOVE。
- 同一 mtime のタイブレークは **path 降順**。新しい順で並べるときの補助キーを path 降順にすることで、後段の最終出力を path 昇順に再ソートしても「切り捨て境界」のどちら側にどのエントリが入るかが決定論的に一意化される。

### 5. Size（`reason: "size"` で REMOVE）

- Count 判定を通過したパスを scope 内で `(mtime DESC, path DESC)` に並べ、cumulative `sizeBytes` が `maxSizeMb * 1024 * 1024` を超えた時点以降のエントリを REMOVE。タイブレークは Count と同じ。

### 6. ルール衝突は構造上発生しない

- Step 3 / 4 / 5 はいずれも「前ステップを通過した KEEP 候補」に対して適用するため、1 パスが複数の `reason` にヒットすることはロジック上起こらない。`cli-gc-spec.md` の「複数ルールヒット時は `age > count > size`」記述は将来ルール追加時の保険として残すが、現時点の判定順では deduplicate は不要。

## 決定論契約（Determinism Contract）

- 同一 inventory + 同一 retention 設定 + 同一 `hardGuards` + 同一 excludes + 同一 `now` を与えれば、`removed[]` の**内容・順序・`reason`** が完全に一致する。
- 評価ロジック内のタイブレーク: Count / Size を判定する際は `(mtime DESC, path DESC)` で並べる。mtime が同じエントリが複数ある場合、path 降順で補助キーを取ることで「切り捨て境界」が決定論的になる（末尾に入る古いものが常に一意）。
- 最終出力の `removed[]` は評価ロジック上の順序に関わらず、**path の昇順（lexicographic）で再ソート**してから返す。これにより呼び出し順やハッシュマップ走査順に依存しない。

## Evidence / 根拠の取り方

- 各 REMOVE 指摘は inventory 上の `path` と、ヒットしたルールの根拠（age なら `mtimeAge`、count なら scope 内順位、size なら cumulative bytes）を 1 行で示す。
- `hardGuards` や exclude により KEEP された件数は `keptSummary` 用のカウントとして要約に含める。個別の KEEP 指摘は出さない。
- 推測（inventory に無いパスへの言及、mtime が欠ける場合の補完など）は禁止。欠落データは Human Handoff に回す。

## Output / 出力

すべて日本語。River Review の `<file>:<line>: <message>` 形式。

- severity は内部語彙 `blocker|warning|nit` を使用し、スキーマ側 `critical|major|minor|info` への変換は `review-core` ルールに委ねる。本スキルの既定は `nit`（= `minor`）で、下記 Severity 節の条件でのみ `warning`（= `major`）に昇格する。
- サマリ行: `(summary):1: scope <name>: keep <N>, remove <N>, hard-guarded <N>, excluded <N>`
- 個別 REMOVE: `<path>:0: [severity=minor] reason=<rule>, sizeBytes=<n>, mtimeAge=<days>日`
- 警告: `(warning):1: [severity=major] <issue description>`
- 出力順は `removed[]` のソート規則（path 昇順）に従い、サマリ → 警告 → REMOVE 一覧の順で並べる。

例:

- `(summary):1: scope memory: keep 42, remove 7, hard-guarded 1, excluded 2`
- `(warning):1: [severity=major] hard guard .river/memory/index.json が exclude glob と重複しています。保持は維持されますが設定を整理してください。`
- `.river/memory/snapshots/2025-11-01T12-00-00Z.json:0: [severity=minor] reason=age, sizeBytes=1048576, mtimeAge=120日`

## Severity の割り当て方針

- `nit`（→ `minor`）: 通常の age / count / size ルールによる REMOVE。GC の定常運用としての削除は情報レベル扱い。
- `warning`（→ `major`）: 以下のいずれかに該当する場合のみ昇格。
  - `hardGuards` が exclude glob や retention 設定と重複している（設定汚染の兆候）。
  - 単一 scope で REMOVE 判定が全 inventory の **80% 超** を占めた（retention が過度に攻撃的な可能性）。
  - inventory のうち `mtimeEpoch` が欠けていたため評価から除外したエントリがある。
- `blocker`（→ `critical`）: 既定では使用しない。GC は原則として非致命。ただしスキルが `hardGuards` を無視して削除判定を出した場合（実装バグ）は呼び出し側テストで `critical` として扱う。
- 内部語彙との対応は `docs/review/output-format.md`（severity の SSoT）を参照。

## Heuristics / 判定の手がかり

- `scope=memory` のとき、`.river/memory/index.json` のような single-source は原則 `hardGuards` 経由で保護されるべき。渡されていない場合は warning。
- `scope=evals` のとき、`artifacts/evals/latest/**` は CLI 側で hard guard される前提。inventory に混入していたら KEEP し、警告を出してよい。
- `scope=review-artifacts` のとき、`artifacts/review-artifact.schema.json` は schema 本体なので hard guard 必須。
- `scope=tmp` は retention を短く切って攻撃的に掃除するのが想定運用。80% 超削除でも warning を出すが blocker ではない。
- `mtimeEpoch` が 0 や未来値のエントリは inventory 不整合の兆候。evaluation から外して warning を出す。

## Good / Bad Examples

- Good: `scope=memory`、100 件の inventory、`days=90` / `maxEntries=1000` / `maxSizeMb=500` → age で 7 件 REMOVE、count / size は不発 → `removed[]` に 7 件（path 昇順）＋ summary。
- Good: hard guard `.river/memory/index.json` が inventory に含まれる → `removed[]` に現れず、summary の `hard-guarded` カウントが +1。
- Bad: 同一 scope で mtime 衝突があるのにタイブレーク規則を適用せず、呼び出しごとに `removed[]` の順序が変わる → 決定論契約違反。
- Bad: `reason` に `"age+count"` のように複数ルールを連結 → 契約違反（最初にヒットしたルール 1 つのみ）。
- Bad: inventory が空なのに `NO_REVIEW` を返さず `removed[]=[]` を生成する → Gate の誤判定。

## 評価指標（Evaluation）

- 合格基準: 同一入力に対し `removed[]` が完全一致する（内容・順序・`reason`）。`hardGuards` / excludes が例外なく KEEP される。警告は Severity 節の条件にのみ一致する。
- 不合格基準: 決定論契約違反（順序ブレ、`reason` 連結、hard guard の REMOVE）、Gate 条件の誤判定、inventory に無いパスへの推測指摘、一般論のみの警告、外部ツール（fs walk 等）への依存。

## 人間に返す条件（Human Handoff）

- retention 設定が明らかに不整合（例: `maxEntries=0`、`days < 0`、`maxSizeMb` が非数）で、Gate は通ったが評価が成立しない場合は `questions` として返す。
- `hardGuards` が渡されず、scope の性質上 single-source の保護が必須（`memory` / `review-artifacts` の schema 本体など）と判断される場合。
- inventory の 50% 超で `mtimeEpoch` が欠損しており、age 判定が信頼できない場合。
- retention の解釈が曖昧（例: union で評価すべきか intersection かの設計変更）で、CLI 側の判断を要する場合。

## Execution Steps / 実行ステップ

1. **Gate**: inventory が非空で各要素に `path` / `sizeBytes` / `mtimeEpoch` が揃い、retention config に `days` / `maxEntries` / `maxSizeMb` が数値で揃い、さらに基準時刻 `now` が epoch 秒で与えられているか確認。いずれか欠ければ `NO_REVIEW`。
2. **Classify hard**: `hardGuards` / excludes に一致するパスを KEEP リストに入れ、以降の判定から除外する。
3. **Apply age**: `mtimeEpoch < now - days * 86400` のパスを REMOVE 候補に入れ、`reason: "age"` を記録。
4. **Apply count**: Age 判定を通過した KEEP 候補を scope 内で `(mtime DESC, path DESC)` に並べ、`maxEntries` を超える末尾側を REMOVE 候補に追加（`reason: "count"`）。構造上、各パスに割り当たるルールは 1 つのみ。
5. **Apply size**: Count 判定を通過した KEEP 候補を同じ `(mtime DESC, path DESC)` 順で並べ、cumulative `sizeBytes` が `maxSizeMb * 1024 * 1024` を超えた時点以降を REMOVE 候補に追加（`reason: "size"`）。ここでも各パスは 1 ルールのみ。
6. **Sort**: `removed[]` を **path 昇順（lexicographic）** で並べ替える。Step 3–5 の構造上、同一パスが複数 `reason` を持つことはないため deduplicate は不要。
7. **Assess severity**: Severity 節の条件を評価し、必要なら warning 行を出力。
8. **Output**: サマリ → 警告 → REMOVE 一覧の順で日本語出力。Human Handoff 条件に該当する場合は `questions` として返す。

## 関連ドキュメント

- [CLI Spec — `river gc`](../../../pages/reference/cli-gc-spec.md) — 呼び出し側 CLI の契約。JSON 出力 `removed[]` / `keptSummary` / タイブレーク規則はこちら。
- [Artifact Input Contract](../../../pages/reference/artifact-input-contract.md) — 入力 artifact の契約（GC 対象 scope の前提）
- [Review Policy](../../../pages/reference/review-policy.md) — レビュー標準ポリシー
- `docs/review/output-format.md` — severity とコメント形式の SSoT
- 姉妹 skill: `plangate-plan-integrity`（#519）、`plangate-exec-conformance`（Exec Conformance Guard）
- 親: Capability #510 / Epic #507 / Task #578
