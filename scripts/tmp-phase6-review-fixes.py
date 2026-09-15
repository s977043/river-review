from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}")
    p.write_text(text.replace(old, new, 1))


jp_anchor = """  - `promptCompiler`（[#1859](https://github.com/s977043/river-review/issues/1859)）: Prompt Compiler の実行モード設定。設計の出典は ADR-006（`docs/adr/006-model-aware-review-prompt-compiler.md`）である。
    - `mode`: `off`（既定）/ `observe` / `active`。`off` は Prompt Compiler を通らず、導入前と同一の挙動になる。`observe` は compiled プロンプトを生成するが LLM へ送らず、hash と推定トークン数と profile の来歴だけを `debug.execution.promptCompiler` へ記録する。追加の LLM 呼び出しは発生しない。`active` は compiled プロンプトを実際に LLM へ送る（[#1861](https://github.com/s977043/river-review/issues/1861)）。opt-in であり、既定は `off` のままである。`active` の run では `debug.execution.promptCompiler.sentPrompt` が `compiled` になる。この値を持つ run を `river evolve prompt-compare` は受け取らず、2 系統の A/B 比較は `river evolve prompt-ab` が扱う（[#1880](https://github.com/s977043/river-review/issues/1880)）。なお `shadow` という値は採用していない。
"""
jp_add = jp_anchor + """  - `viewpoints`（[#2252](https://github.com/s977043/river-review/issues/2252)）: Skill 配下の Review Viewpoint Catalog を runtime へ接続するモード。Prompt Compiler とは独立した設定である。
    - `mode`: `off`（既定）/ `observe` / `active`。`off` は signal 検出・Catalog 読み込み・prompt 変更を行わない。`observe` は selected built-in Skill の signal → Viewpoint → Review Obligation を計算し、`debug.execution.reviewViewpoints` へ記録するが prompt は変更しない。`active` は一致した Review Obligation だけを prompt へ追加する。Review Obligation は Finding ではなく確認義務であり、required evidence を確認して実際の問題を裏付ける証拠がある場合だけ Finding を出すようモデルへ指示する。v1 は River Review が配布する built-in Skill の `references/viewpoints.yaml` だけを対象とし、レビュー対象 repository の custom catalog は読み込まない。
"""
replace_once("pages/reference/config-schema.md", jp_anchor, jp_add)

en_anchor = """  - `promptCompiler` ([#1859](https://github.com/s977043/river-review/issues/1859)): execution mode for the Prompt Compiler. The design source is ADR-006 (`docs/adr/006-model-aware-review-prompt-compiler.md`).
    - `mode`: `off` (default) / `observe` / `active`. `off` bypasses the Prompt Compiler entirely and behaves exactly as before it was introduced. `observe` builds the compiled prompt but does **not** send it to the LLM; it records only the hash, the estimated token count, and the profile provenance under `debug.execution.promptCompiler`. No additional LLM call is made. `active` actually sends the compiled prompt to the LLM ([#1861](https://github.com/s977043/river-review/issues/1861)). It is opt-in; the default stays `off`. A run in `active` records `debug.execution.promptCompiler.sentPrompt` as `compiled`, and `river evolve prompt-compare` rejects runs carrying that value; the two-sided A/B comparison is handled by `river evolve prompt-ab` instead ([#1880](https://github.com/s977043/river-review/issues/1880)). Note that `shadow` is deliberately not used as a value.
"""
en_add = en_anchor + """  - `viewpoints` ([#2252](https://github.com/s977043/river-review/issues/2252)): runtime mode for Skill-owned Review Viewpoint Catalogs. This setting is independent from the Prompt Compiler.
    - `mode`: `off` (default) / `observe` / `active`. `off` performs no signal detection, catalog loading, or prompt changes. `observe` resolves signal → Viewpoint → Review Obligation for selected built-in Skills and records the result under `debug.execution.reviewViewpoints`, while leaving the prompt unchanged. `active` adds only matched Review Obligations to the prompt. A Review Obligation is a verification duty, not a Finding; the model is explicitly told to inspect required evidence and emit a Finding only when evidence supports a real issue. v1 reads only River Review distributed built-in Skill catalogs at `references/viewpoints.yaml`; custom catalogs from the reviewed repository are not loaded.
"""
replace_once("pages/reference/config-schema.en.md", en_anchor, en_add)

design_old = """## 次の Slice

次は observe-mode を実装します。

1. 既存 detector result の内部 signal への正規化
2. signal と Viewpoint の照合
3. Review Obligation の生成、および複数 signal 一致時の Viewpoint id 単位での dedupe
4. finding、gate、LLM context へ影響させない結果記録
5. 既存挙動との parity、および activation precision / recall の計測

observe-mode で有効性を確認した後に active-mode を検討します。
"""
design_new = """## Runtime Slice の進行

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
"""
replace_once("docs/development/2252-review-viewpoint-knowledge-design.md", design_old, design_new)

replace_once(
    "tests/review-viewpoint-active-mode.test.mjs",
    "import { buildReviewRequest } from '../src/prompt/review-request.mjs';",
    "import { REVIEW_REQUEST_IR_VERSION, buildReviewRequest } from '../src/prompt/review-request.mjs';",
)
replace_once(
    "tests/review-viewpoint-active-mode.test.mjs",
    "test('review.viewpoints mode defaults to off and rejects shadow', () => {\n",
    "test('Review Request IR version is bumped for Review Obligation context', () => {\n  assert.equal(REVIEW_REQUEST_IR_VERSION, '2');\n});\n\ntest('review.viewpoints mode defaults to off and rejects shadow', () => {\n",
)
