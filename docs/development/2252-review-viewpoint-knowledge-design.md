# Review Viewpoint Knowledge 設計

Issue #2252 の Foundation Slice に関する設計契約です。

## 背景

反復可能なレビュー観点を毎回モデルに再推論させると、同じ入力でも確認範囲が揺れます。
River Review では、既知のレビュー知識を Skill 配下の構造化データとして管理します。

参照した発想は、テスト観点を再利用可能なカタログへ分離する事例です。
本設計では、その発想を River Review の既存アーキテクチャへ適合させます。

- <https://zenn.dev/aldagram_tech/articles/316c4d944fd9d5>
- Issue #2252

## 目的

既知で反復可能なレビュー知識を、モデルの自由推論から分離します。
その知識を再現可能な Review Viewpoint として保持し、後続の Review Obligation 生成へ利用できる形にします。

## 設計判断

### Viewpoint は Skill の子にする

Skill selection は既存の `selectSkills()` を SSoT とします。
Viewpoint は独自の phase、applyTo、dependency を持ちません。
これにより、第 2 の routing system が生まれることを防ぎます。

```text
Review Intent
  -> selectSkills()
  -> Selected Skill
       -> HOW: evaluator
       -> WHAT: viewpoints
```

### Knowledge と Policy を分離する

Viewpoint は「何を確認するか」だけを保持します。
UNKNOWN の扱い、severity、gate action、human escalation は既存 Policy と Judge の責務です。

```text
Knowledge
  -> Evaluation
  -> Policy
  -> Judge
```

### Finding ではなく確認義務を表現する

Viewpoint は違反の存在を断定しません。
`question` と `requiredEvidence` を使い、評価前の Review Obligation を表します。

悪い例:

```text
Breaking API change detected
```

良い例:

```text
Review obligation: Backward compatibility
Question: 既存 consumer との互換性が維持されているか。
Evidence: changed contract / affected consumers
```

同じ懸念を別 Viewpoint に分割しすぎません。
たとえば versioning と migration path は backward compatibility の証拠として扱い、重複 Obligation を避けます。

### data-only に限定する

`viewpoints.yaml` から任意コードを実行できるようにしません。
次の要素は schema で拒否します。

- shell command
- JavaScript
- arbitrary expression
- evaluator routing
- gate action
- `onUnknown`

既存 deterministic command executor の trust boundary は変更しません。

### v1 は built-in Viewpoint のみ扱う

初期段階では、River Review 本体が配布する Viewpoint だけを対象にします。
Repository custom catalog と organization catalog は扱いません。
レビュー対象側が自分の確認義務を無効化できる経路を増やさないためです。

後続の runtime 接続では、対象 repository から任意の Viewpoint path を受け取りません。
既存 router が選択した配布済み Skill のディレクトリから `references/viewpoints.yaml` を導出します。

### Public Stable API として固定しない

`schemas/review-viewpoints.schema.json` は experimental contract です。
複数 Skill と複数 runtime で有効性を確認するまで Stable Interface に昇格させません。

## Foundation Slice の範囲

この Slice は runtime behavior を変更しません。

実装対象:

- experimental JSON Schema
- data-only loader
- duplicate viewpoint id の検出
- owning Skill id の整合チェック
- `api-compatibility/references/viewpoints.yaml`
- schema と loader の契約テスト

非対象:

- `selectSkills()` の変更
- heuristic detector の変更
- LLM context injection
- gate decision の変更
- ReviewSignal の Public Schema 化
- repository custom viewpoints

## Pilot: api-compatibility

最初の Pilot は `skills/midstream/api-compatibility` です。
既存 `SKILL.md` に記載された Rule、Heuristics、False-positive guards を構造化します。

初期 Viewpoint:

- backward compatibility
- API contract test coverage
- optional field consumer handling

この Slice では、`activatesOn` の signal vocabulary は実行へ接続しません。
後続の observe-mode で既存 detector result から内部正規化して接続します。

## Runtime Slice の進行

Foundation 後の runtime 接続は小さい Slice に分割します。

1. Phase 5: 既存 heuristic detector の neutral detection を Finding presentation から分離
2. Phase 5.5: `api-compatibility` Pilot の neutral signal producer を追加
3. Phase 6: `review.viewpoints.mode = off | observe | active` を導入
   - `off`: detector / Catalog I/O / prompt 変更なし
   - `observe`: signal → Viewpoint → Review Obligation を計算し、`debug.execution.reviewViewpoints` に記録するが prompt は変更しない
   - `active`: matched Review Obligation だけを LLM context へ追加する
4. Phase 7+: Activation Precision / Recall、Finding Precision / Recall、token / latency、provider parity を測定し、Pilot 拡大を判断

Phase 6 でも Viewpoint は Finding を断定しません。prompt へ追加するのは `question` / `requiredEvidence` / evidence hints / false-positive guards だけで、signal の一致自体を違反の証拠として扱いません。

### Runtime trust boundary

runtime は対象 repository から Viewpoint path を受け取りません。Skill discovery と同じ package-root SSoT から selected built-in Skill の実体を確認し、その Skill 配下の `references/viewpoints.yaml` だけを読み込みます。GitHub Action の bundle では host が固定する `RIVER_REPO_ROOT` を Skill loader と共用します。

Repository custom catalog / organization catalog は v1 の対象外です。

## 完了条件

Foundation Slice の完了条件は次の通りです。

- Schema が未知 field と executable field を拒否する。
- Loader が不正 YAML、schema violation、duplicate id を失敗として扱う。
- Loader が `skillId` の所有関係を検証できる。
- `api-compatibility/references/viewpoints.yaml` が schema を満たす。
- 既存 runtime の呼び出し経路へ Viewpoint loader を接続しない。
- `npm run lint` と `npm test` が通る。
