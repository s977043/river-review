# Heuristic Detector Checklist

`src/lib/heuristic-review.mjs` に regex ベースの no-key 検出器（LLM キー無しで動く機械的チェック）を追加・変更するときのチェックリスト。

これらの検出器は **LLM の判断なしに決定論で動く**ため、false positive / false negative がそのままレビューの質に直結する。本チェックリストは、過去に reviewer（gemini）が **検出器 1 本につきほぼ毎回**指摘した同一 class の不具合を front-load するためのもの。

## いつ使うか

- `heuristic-review.mjs` に `findXxx` 検出器を追加する
- 既存検出器の正規表現を変更する
- `HEURISTIC_REGISTRY` にエントリを追加する

> 配線は `heuristic-review.mjs` の単一レジストリ `HEURISTIC_REGISTRY` に集約されている。detector の追加はこのレジストリの 1 エントリで完結し、`SKILL_HEURISTIC_MAP` / `HEURISTIC_SKILL_IDS` / `HEURISTIC_KIND_PRESENTATIONS` はそこから導出される（`review-engine.mjs` の switch は廃止済み）。

## 1. コメント行・文字列の扱い（最頻出の FP/FN 源）

- [ ] **matcher 内で 2 段構えにする**（既存 `matchesDangerousEval` を参照）。① 先頭がコメントの行は早期 return（`trimmed.startsWith('//')` 等）。② 残りは `stripTrailingLineComment(trimmed).trim()` で行末コメントを除去してから判定する。①のみだと行末コメント FP が再発する（gemini が毎 PR 指摘した class）。
- [ ] **行末コメント除去は quote-aware な共有ヘルパー `stripTrailingLineComment(code)` を使う**。素朴な `code.replace(/\/\/.*$/, '')` は **禁止**—文字列リテラル内の `//`（例 `"http://x"; eval(y)`）でコメント開始を誤判定し、後続の本物（`eval`）を取りこぼす（false negative）。
- [ ] パターンのキーワードが「コメント内に登場しただけ」で発火しないことを negative テストで確認する。
- [ ] **位置を報告するときは単位を明示する**。`readFileSync(path, 'utf8')` が返す文字列の index は UTF-16 コード単位で、byte offset とは一致しない。byte offset が必要なら `readFileSync(path)` の Buffer で測る。#2068 の委託指示で utf8 index（16436）を byte と報告し、ワーカー側の実測（16480）と食い違った。

## 2. メソッド呼び出しと関数呼び出しの衝突

- [ ] 関数名が他オブジェクトのメソッドと衝突しないか確認する。例: `exec` は `child_process.exec` だけでなく `RegExp.prototype.exec` / DB の `.exec` にも一致する。
- [ ] 衝突する場合は **負の後読み** `(?<![.\w])exec\s*\(` で素の関数呼び出しに限定し、曖昧性のない alias（`execSync` / `spawn` / `spawnSync`）は `\b` で許容する。

## 3. alias / 異形の網羅

- [ ] 検出対象に異形がないか洗い出す。漏れがちな例:
  - disabled test: `.skip` だけでなく `xit` / `xdescribe` / `xtest` / `xcontext`
  - focused test: `describe` / `context` / `it` / `test` / `suite` / `bench` の `.only`
  - merge conflict: `<<<<<<<` / `>>>>>>>` に加え diff3/zdiff3 の base marker `|||||||`（`=======` は Markdown h1 下線と衝突するため**使わない**）
  - DOM 注入: `document.write` だけでなく `document.writeln`
- [ ] **日本語語彙を含む正規表現で `\b` を使わない。** `\b` は単語構成文字（`[A-Za-z0-9_]`）の境界としてしか成立せず、CJK 文字との境界を作らない。`/\b(?:findings?|指摘)\b/` では `指摘` の枝が死にコードになり、日本語の実文で発火しない。2026-09-04 に `scripts/validate-plugin-manifest.mjs` の証跡要件規則で実際に起きた。fixture が英語 `finding` だけだったため、テストもこの枝に触れていなかった。ASCII 側の語境界が必要なら `(?<![A-Za-z0-9_])` / `(?![A-Za-z0-9_])` を明示し、CJK 側には境界を付けない。**日本語の入力を positive fixture へ必ず 1 行入れる。**
- [ ] 「設定値で危険になる」ものは条件を限定する。例: 環境変数 `NODE_TLS_REJECT_UNAUTHORIZED` は **`=0` に代入された場合のみ**（read や `=1` は除外）。オブジェクトリテラルの `rejectUnauthorized: false` は別 sink として扱う。

## 4. スコープと上限

- [ ] **テストファイル / fixture を除外**すべきか判断する（`looksLikeTestFile(filePath)` と `/fixtures/` + `/__fixtures__/` チェック）。セキュリティ系・debug 系は通常テストファイルを除外する。
- [ ] 1 検出器あたりの件数上限を設ける（既存の多くは `MAX_*_COMMENTS = 3`。例外: `findSilentCatch` はハードコードの `>= 3`）。
- [ ] **実効範囲は最小 diff と混在 diff の 2 通りで測る**。skill 選択は「diff が applyTo に 1 件でも該当するか」で PR 単位に決まる。一方、選択後の `buildHeuristicComments` は diff 中の全ファイルを検出器へ渡す。対象外ファイル単独の diff で `skill=not selected` を確認しても、同じ PR に対象内ファイルが混ざれば発火する。合格条件は「混在 diff（対象内 1 ファイル + 対象外 1 ファイル）で対象外ファイルが発火しないこと」。この条件そのものを検証する既存テストは `tests/heuristic-review.test.mjs:1232` にある。テスト名は `temporary-without-exit: stays quiet for scripts/** on the real plan path`。3 ファイル混在の diff を `buildExecutionPlan` へ通し、発火 0 を assert している。新しい検出器ではこれと同じ型を足す。簡易な確認は §6 の drift guard canary で代替してよいが、canary は `temporaryComments` を 1 ファイルずつ直接呼ぶ形なので plan 経路は通らない。
- [ ] **全体出力は `buildHeuristicComments` 末尾で `.slice(0, 8)` に bounded** である点を意識する。高頻度に発火する検出器を足すと、既存検出器が 8 枠を食い合って starve する。発火頻度が高い検出器は上限を低めにするか、配線順序を検討する。

## 5. severity / confidence の較正

- [ ] レジストリエントリの `findings[kind]` に finding / evidence / impact / fix / severity / confidence を埋める（`review-engine.mjs` に case を足す必要はない。メッセージ生成はレジストリから導出される）。
- [ ] severity は内部語彙（blocker / warning / nit）。確実な危険は `blocker`、レビュー喚起レベルは `warning`、任意保留があり得るものは `nit`（例: `.skip` は意図的な保留がありうるため nit）。confidence は regex の確度に合わせる。
- [ ] **同じ `HEURISTIC_REGISTRY` 内の同系統 kind と severity を並べて確認する**。ここでの「同系統」はレジストリ上の機械的な同値類（skillId が同じ、等）ではなく、**指摘の性質が同じもの**を指す。具体例は [`retrospectives/2026-08-09-10.md`](./retrospectives/2026-08-09-10.md) の「severity の不整合」表を参照する。そこに並ぶ 4 件（`silent-catch` / `ts-suppression` / `caller-special-case` / `temporary-without-exit`）は skillId こそ異なるものの、いずれも「動くが後で困る書き方」を指摘する系統である。`warning` は出力 `major` に写り `run-gate.mjs` の `blockingFindings` に計上されて gate を NO_GO へ倒しうるため、姉妹検出器が `nit` で揃っている系統に `warning` を 1 件だけ混ぜない。
- [ ] 選んだ severity の**理由をレジストリエントリのコメントとして残す**。散文チェックリスト側に理由を書くと二重管理になるため、SSoT は実装コメントに置く（実例: `src/lib/heuristic-review.mjs` の `temporary-without-exit` エントリにある `severity: 'nit'` 直前のコメント）。

## 6. 配線

- [ ] `heuristic-review.mjs` の `HEURISTIC_REGISTRY` に 1 エントリ（`{ skillId, detect, findings }`）を追加する。配列順が `buildHeuristicComments` の出力順序（golden/fixtures が pin）になるため、既存スキルのブロック内の適切な位置に挿入する。
- [ ] 1 つの検出関数が複数 kind を emit する場合（例: `findGitHubActionsIssues`）は `findings` に複数 kind を列挙する。複数スキルが同一検出器を共有する場合（例: `test-existence` / `coverage-gap`）は presentation を const に切り出して参照し、二重定義を避ける。上位スキル優先で重複実行を避けたい場合は `skipIfSkill` を使う。
- [ ] 新スキルを heuristic 化する場合は、そのスキルの `applyTo`（`SKILL.md`）を読むだけで終わらせない。次の 2 つを同じ PR で行う。
  - [ ] **検出器側にも applyTo と同じディレクトリ条件を実装する**。拡張子だけを見る述語は、applyTo 外のディレクトリ（`scripts/` / リポジトリ直下の config / `tools/` / `migrations/`）で発火する。`temporary-without-exit` の `TEMPORARY_SCOPE_PATH_RE` が実装例。
  - [ ] **その一致を機械検証で pin する**。`tests/heuristic-review.test.mjs` の drift guard canary （`detector scope stays in sync with the skill applyTo`）と同じ型を足す。期待値をハードコードせず、`parseSkillFile` で `SKILL.md` の applyTo を読み、本番と同じ `minimatch(file, pattern, { dot: true })` で導出する。サンプルパス表を置く型なので、**全 glob が 1 件以上のサンプルで覆われていること**を assert する行を必ず含める。これが無いと、表に無いディレクトリが applyTo へ足される向き（宣言だけが広がる向き）で緑のまま通る。既存 glob の拡張子だけを増やした場合はこの assert でも捕まらないため、拡張子を触るときはサンプル表へ 1 行足す。
- [ ] 検出器のスコープは**スコープ正規表現の定数**（`TEMPORARY_SCOPE_PATH_RE`）だけでなく**述語関数**（`looksLikeGitHubWorkflowFile` / `looksLikeSourceCodeFile`）でも表現される。`grep -nE "^const [A-Z_]*(SCOPE|PATH|EXT)[A-Z_]*_RE"` は前者しか拾わないため、`grep -n "^function looksLike.*File"` も併せて見る。後者の乖離は既に本番に存在する（`findGitHubActionsIssues` × `security-basic`。#1797 で追跡）。

## 7. テスト（positive と negative の両方）

- [ ] `tests/heuristic-review.test.mjs` に **検出される** ケースを追加する。
- [ ] **検出されない** ケースを追加する: コメント内の言及 / 行末コメント / 安全な異形（例: `execFile(cmd, [args])` / `setTimeout(() => ...)` / `@ts-expect-error`）/ 条件を満たさない設定（`=1`）。
- [ ] **不変条件を守るテストは、宣言の対象ではなく実権限の所在を検査する**。「X が Y を変更してはならない」をソース文字列の走査で検査すると、X が持つ間接的な権限（別モジュールへの委譲・動的キー・文字列連結）を素通りする。守りたいのが結果なら結果を測る。対象を全列挙し、同一入力を本番経路へ通して出力が一致することを assert する。ファイル列挙は再帰で行い、列挙結果そのものをパスで pin する（件数ではなくパスで pin すると、走査漏れと新規追加を区別できる）。実例は `tests/prompt-compiler-invariants.test.mjs`。当初は profile のソース文字列だけを非再帰に走査しており、判断側の語を 1 つも含まない profile から `rendererId` 経由で severity を書き換える形が通った（#1867 の `6df05ab7` で振る舞い検査へ移した）。§6 の drift guard canary も、期待値を `SKILL.md` から導出して本番と同じ `minimatch` へ通す点で同じ型にあたる。
- [ ] **リポジトリの実体（違反件数・ファイル数）を期待値に pin しない。** 「現在このリポジトリには違反が N 件ある」をassert するテストは、検出器が正しく働いて違反が解消された瞬間に落ちる。**修正が正しいほど壊れる**構造にあたる。2026-09-04 に RA-1 の観測モード検査が「違反がちょうど 1 件」を pin しており、承認済みの 1 行を適用して 0 件にした時点で必須チェック `Unit tests (22.x)` が落ちた。検査したいのが段階遷移や経路の振る舞いなら、**注入 fixture と純関数へ pin し直す**（当該例では `ra1Sink()` を切り出して off / observe / active の 3 経路を直接固定した）。実体を走査する検査そのものの回帰を見たい場合は、件数ではなく「実体に対して例外を投げずに完走すること」を assert する。
- [ ] `npm test -- tests/heuristic-review.test.mjs` で確認後、`npm test` で全体を確認する。

## 8. dist 再ビルド（必須）

- [ ] `heuristic-review.mjs` / `review-engine.mjs` は GitHub Action の dist にバンドルされる。変更したら **docker で CI 一致 dist を再ビルド**する（詳細は [`dist-check-rebuild-guide.md`](./dist-check-rebuild-guide.md)）。
- [ ] `what-is-river-review.md`（JA/EN）の実行モデル「2. 機械的チェック」の観点リストを更新する。編集後は `npm run lint:text` で確認する（textlint: 本文=ですます / 箇条書き=である / 1 文 ≤150 字 / 同一助詞の重複回避。ローカルは cache で pass しうるため CI でも確認）。

## 関連

- `src/lib/heuristic-review.mjs`—検出器本体・`HEURISTIC_REGISTRY`（配線と kind→presentation の SSoT）・`stripTrailingLineComment` ヘルパー
- `tests/heuristic-review.test.mjs`—検出器のテスト全般と、applyTo と検出器スコープの drift guard canary（§6）。混在 diff を `buildExecutionPlan` へ通す plan 経路テスト（`temporary-without-exit: stays quiet for scripts/** on the real plan path`、§4）も同ファイルにある
- `runners/core/skill-loader.mjs`—`parseSkillFile`（`SKILL.md` frontmatter の applyTo をパースする SSoT）
- `src/lib/review-engine.mjs`—`normalizeHeuristicComments`（レジストリの `HEURISTIC_KIND_PRESENTATIONS` を参照して finding メッセージを生成）
- `docs/development/skill-severity-rubric.md`—severity 較正
- `docs/development/dist-check-rebuild-guide.md`—dist 再ビルド手順
- `pages/explanation/what-is-river-review.md`—実行モデル（no-key 観点リストの SSoT）
