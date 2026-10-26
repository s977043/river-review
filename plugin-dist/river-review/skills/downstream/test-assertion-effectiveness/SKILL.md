---
id: 'test-assertion-effectiveness'
name: 'Test Assertion Effectiveness 常に PASS するテストの検出'
description: 'テストは存在するがアサーションが実質何も検証しておらず、実装が壊れても落ちない（常に PASS する）構造を diff-time で検出する。Check 1 missing assertion（テスト本体にアサーションが無い）、Check 2 tautological assertion（定数同士・入力自身・mock の戻り値自身を assert し SUT に依存しない）、Check 3 nonexistent expected literal（assertDontSee / assertNotContains 等の期待文字列が対象ファイルに実在しない）、Check 4 stale expected value（同一 diff で対象の出力が変わったのに期待値が据え置き）、Check 5 unscoped expectation（汎用的な属性・クラスを応答全体に対して assert し対象要素にスコープされていない）、Check 6 swallowed failure（例外の握り潰しや到達しない位置のアサーションで判定が成立しない）、の 6 Check を対象とする report-only。テストの有無は test-existence、未テスト経路の量は coverage-gap、非決定性は flaky-test、命名は test-naming、JS/TS の un-awaited resolves / rejects は vitest-mock-isolation、tdd-ledger artifact ベースの RED/GREEN 検証は plangate-tdd-evidence、.only / .skip / xit / @ts-ignore と空の catch は heuristic-review.mjs の決定論検出器へ委譲する'
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - '**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}'
  - '**/*Test.php'
  - '**/test_*.py'
  - '**/*_test.{py,go,rb}'
  - 'tests/**/*'
  - 'test/**/*'
  - '__tests__/**/*'
tags:
  [
    tests,
    assertion,
    assertion-effectiveness,
    vacuous-test,
    always-passing,
    test-quality,
    downstream,
  ]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, questions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Naming / 命名

`skills/README.md` の Naming Q0–Q5 に従って決定した。Q0 では外部プロジェクトの成果物を取り込んでいないため「概念の再実装」に分類され、リネーム（新規命名）が既定となる。Q1 は衝突なし（`assertion` を含む skill id は既存に無い）、Q2・Q3 は参照元の原語が存在しないため適用外、Q4 で既存の `test-*` 命名ファミリ（`test-existence` / `test-naming` / `test-plan-review`）に整合することを確認し、Q5 で「価値（アサーションが有効であること）を名指す」名として `test-assertion-effectiveness` を採用した。機構名（tautology 検出・grep 照合）ではなく価値を名指す点が Q5 の要件である。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: アサーションの形はパターンとして拾えるが、「そのアサーションが SUT の挙動に依存しているか」の判定は意味的であり、期待値の照合先（テンプレート・コンポーネント）が discover できない差分では実行を止めるゲートが必要である。

## Goal / 目的

テストの「有無」や「粒度」は既存 skill が見るが、**書かれたアサーションが実際に失敗しうるか**は誰も見ていない。アサーションが無効なテストは行を通過するためカバレッジ指標にも現れず、CI が緑であることも有効性の証明にならない（レビュー時点の CI が古い sha で緑だった実例が #1684 に記録されている）。この盲点を diff-time の静的観点として埋める。

次の 6 Check のいずれかに該当し、**そのテストが実装の退行を検知できない**と読み取れる場合に指摘する。report-only（ADR-005）であり、finding / question のみを出力して自動修正はしない。

## Non-goals / 扱わないこと（委譲表）

| 隣接領域                                                   | 委譲先                                        | 分界                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| テストが存在しない                                         | `test-existence`                              | 委譲先は「変更コードに対応するテストが差分に無い」。本 skill は逆に**テストがある差分にだけ働く**（委譲先はテスト差分があると黙る前提のため） |
| 未テスト経路・分岐・境界の量                               | `coverage-gap`                                | 委譲先は「その経路のテストが存在しない」。本 skill は「テストは存在するがアサーションが落ちない」                                             |
| 実行ごとに結果が変わる不安定さ                             | `flaky-test`                                  | 委譲先は非決定性。本 skill は**決定論的に必ず PASS する**構造                                                                                 |
| `describe` / `it` の命名・構造                             | `test-naming`                                 | 命名の明瞭さは対象外。名前が適切でもアサーションが無効なら本 skill が扱う                                                                     |
| JS / TS の un-awaited `expect(...).resolves` / `.rejects`  | `vitest-mock-isolation`                       | 委譲先が「常に pass する空 assertion」として既に所有する。`async-correctness` も本番コード側からここへ委譲済みであり、三重管理にしない        |
| `tdd-ledger` artifact による RED / GREEN 証跡の検証        | `plangate-tdd-evidence`                       | 委譲先は artifact 駆動（artifact 非供給の adopter では常に `NO_REVIEW`）。本 skill は**artifact に依存しない diff-time 観点**                 |
| 影響・失敗系・外部依存を調査した証拠の有無                 | `impact-evidence-coverage`                    | 委譲先は同一 diff のテストを「証拠あり」として充足扱いにする。本 skill はその**テスト自体が有効か**を見る（矛盾ではなく補完関係）             |
| 本番経路の例外握り潰し・配線切れ                           | `e2e-wiring` / `logging-observability`        | 委譲先は `src/**` 等の本番経路。本 skill が見る握り潰しは**テスト本体の中で判定を無効化するもの**に限る                                       |
| `.only` / `.skip` / `xit` / `@ts-ignore` / 空の `catch {}` | `src/lib/heuristic-review.mjs` の決定論検出器 | 決定論で判定済みのため**重複指摘しない**（`.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」）           |

さらに次はスコープ外とする。

- **ミューテーションテストの導入**: 実行時にアサーション有効性を測る仕組みの導入は静的レビュー観点の責務ではない（#1684 Non-goals）。
- **カバレッジ閾値の変更**: 閾値・ゲートの設定変更は扱わない（#1684 Non-goals）。
- **snapshot テストであること自体**: snapshot は意図を明示しないという批判があるが、正当な用途（意図的な回帰固定・大きな出力の差分検知）が多く誤検出になりやすいため指摘しない。snapshot に加えて Check 1〜6 のいずれかに該当する場合のみ、その Check として扱う。
- **アサーションライブラリの選定**やマッチャーの好み（`toBe` と `toEqual` の使い分け等）。

## 決定論と LLM 判断の分界（#1070）

`.claude/rules/review-core.md` の責務分界に従い、本 skill が扱う範囲を次の 3 層に分ける。

1. **既に決定論で守られている領域（本 skill は触れない）**: `.only` / `.skip` / `xit` / `xdescribe` / `@ts-ignore` / `@ts-nocheck` / 空の `catch (...) {}` / コード変更に対するテストファイルの不在。これらは `src/lib/heuristic-review.mjs` の検出器が構文的に判定済みであり、重複指摘は禁止する。
2. **構文的に決定論化できるが現時点は本 skill が見る領域（canary で回帰防止）**: Check 1 の「テスト本体に assert トークンが 1 つも無い」、Check 3 の「期待文字列リテラルが対象ファイルに grep でヒットしない」。将来この 2 つがカスタム linter 化された場合、本 skill は当該 Check を委譲し、`fixtures/` の canary が誤検出の回帰防止を引き継ぐ。
3. **LLM 判断が必須の領域（本 skill の中核）**: Check 2 の「その値が SUT の出力に依存しているか」、Check 4 の「据え置きが追従漏れか意図的か」、Check 5 の「スコープが対象要素を特定できているか」、Check 6 の「その構造が失敗判定を無効化しているか」。いずれも周辺コードと変更意図の読解を要し、パターン照合では判定できない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り `NO_REVIEW` を返す。

- [ ] inputContext に `diff` が含まれている。
- [ ] 差分にテストファイルの追加・変更が含まれている（本 skill はテストが存在する差分のみを対象とする）。
- [ ] 変更されたテストにアサーション、またはアサーションを含むテストケースの追加・変更が含まれている（セットアップ・fixture・import のみの変更では実行しない）。
- [ ] Check 3〜5 を判定する場合、期待値の照合先（テンプレート・コンポーネント・レンダリング結果）が差分・`fullFile`・`code_search` のいずれかで到達できる。到達できない場合、その Check は finding を出さず question に留める。

ゲート不成立時の出力: `NO_REVIEW: test-assertion-effectiveness — アサーションの追加・変更を含むテスト差分が無い`

## False-positive guards / 抑制条件

正当なテストを FP にしないため、次を厳守する。

- **ヘルパー経由の assert は指摘しない**: アサーションが共通ヘルパー・カスタムマッチャー・`expect.extend`・trait / base class に切り出されている場合、テスト本体に assert トークンが無くても Check 1 に該当しない。呼び出し先を確認できないときは question に留める。
- **パラメタライズドテストは指摘しない**: `it.each` / `test.each` / `@dataProvider` / `pytest.mark.parametrize` の入力テーブルは「入力自身を assert している」ように見えるが、実行はケースごとに SUT を通る。表側の定数を Check 2 として扱わない。
- **正当な snapshot テストは指摘しない**: 上記 Non-goals のとおり、snapshot であることのみを理由に指摘しない。
- **否定アサーションが常に正当な文脈を除外する**: 「削除された文言が今後も出ないこと」を回帰テストとして固定するケースでは、期待文字列が対象に存在しないことが**期待どおり**である。同一 diff またはコメント・テスト名で「削除の回帰固定」であることが読み取れる場合、Check 3 として指摘しない。指摘するのは、そのアサーションが**新機能・変更後の挙動を検証する意図で書かれている**と読み取れる場合に限る。
- **意図的な smoke test は指摘しない**: 「例外を投げずに完走すること」自体が検証内容であると、テスト名・コメント・PR 本文で明示されている場合は Check 1 として指摘しない。
- **照合先が discover できなければ question**: 期待値の照合先ファイルを特定できない、または動的生成（i18n キー解決・テンプレート合成）で静的に照合できない場合は、finding ではなく question とする（false-positive-first）。
- **委譲先の領分は指摘しない**: 上記委譲表の各行、特に `.only` / `.skip` / `@ts-ignore` / 空の `catch {}` / JS・TS の un-awaited `.resolves` / `.rejects` は本 skill から出力しない。
- **指摘上限**: Check ごとに finding と question の合算で最大 2 件、全体で最大 5 件とする。保持の優先順は findings（severity 降順）→ questions とし、上限超過分は優先度の低い側から切り捨てる。

抑制時の出力: 該当する指摘を出力しない（黙る）。

## Rule / ルール

### Check 1 — Missing assertion / アサーション不在

テスト本体が SUT を呼び出すのみで、アサーションが 1 つも存在しない。例外が投げられた場合しか落ちないため、戻り値・副作用の退行を検知できない。ヘルパー経由の assert と意図的な smoke test は抑制条件で除外する。

### Check 2 — Tautological assertion / 恒真・SUT 非依存のアサーション

アサーションの結果が SUT の挙動に依存しない。次を含む。

- 定数同士の比較（`expect(true).toBe(true)` / `assertTrue(true)` / `assertSame(1, 1)`）。
- テスト自身が組み立てた入力・fixture リテラルをそのまま assert している。
- mock に設定した戻り値を、その mock 自身から取り出して assert している（SUT を通っていない）。

### Check 3 — Nonexistent expected literal / 期待値が対象に実在しない

否定系アサーション（`assertDontSee` / `assertNotContains` / `not.toContain` 等）の期待文字列が、照合先のテンプレート・コンポーネントに元から存在しない。存在しないものが「無いこと」を検証しているため常に PASS する。肯定系（`assertSee` 等）で期待文字列が照合先に一度も存在しない場合も同じ根拠で扱う。

### Check 4 — Stale expected value / 出力変更への追従漏れ

同一 diff で照合先の出力（マークアップ・レンダリング結果・シリアライズ形式）が変更されているのに、その出力を検証するアサーションの期待値が据え置かれている。連結された文字列が複数要素へ分割された場合など、変更後は一致しなくなる形が典型である。

### Check 5 — Unscoped expectation / 期待値のスコープ不足

汎用的すぎる属性・クラス・トークン（`rel=` / `target=` / 汎用ユーティリティクラス / 共通ヘッダーの文言等）を応答全体に対して単独で assert しており、検証対象の要素から当該属性を除去しても他の箇所が供給するため PASS してしまう。

### Check 6 — Swallowed failure / 失敗の握り潰し・到達しないアサーション

テスト本体の構造が失敗判定を無効化している。次を含む。

- `catch` 節が再 throw も明示的な失敗（`fail()` / `expect.unreachable()` / `$this->fail()`）も行わず、例外発生時に PASS してしまう。
- 期待していた例外が発生しなかった場合に落ちる仕組み（`expect.assertions(n)` / `expectException` / `assertThrows`）が無いまま、アサーションを `try` 節にのみ置いている。
- 早期 `return` や到達しない分岐の後ろにアサーションが置かれている。

なお空の `catch (...) {}` は決定論検出器（`silent-catch`）が既に検出するため、本 Check からは重複指摘しない。本 Check が扱うのは、**catch 節に何らかのコード（コメント・ログ出力等）があるため決定論検出器が黙る**が、失敗判定は成立していないケースである。

### 検出ロジック

1. **Check の特定**: 変更されたアサーションがどの Check に該当するかを判定する。該当しないアサーションは調査しない。
2. **照合先の解決**: Check 3〜5 では期待文字列の照合先（テンプレート・コンポーネント・レンダリング経路）を `code_search` または `fullFile` で特定する。特定できなければ question に落とす。
3. **有効性の判定**: 「実装側を意図的に壊したとき、このアサーションは落ちるか」を 1 ケースだけ具体的に述べられるかで判定する。述べられなければ無効と扱う。
4. **正当化の棄却**: 抑制条件（ヘルパー経由・パラメタライズド・削除の回帰固定・意図的 smoke test）に該当しないことを確認する。判断できなければ question とする。
5. **resolution の付与**: 各 finding に最小修正案を添える。「期待値を変更後の出力に合わせる」「対象要素にスコープした正規表現 / DOM 選択へ置換する」「SUT の戻り値・副作用を assert する」「`expect.assertions` / `expectException` で失敗経路を固定する」のいずれかを明示する。

### severity 較正

- 検証対象の挙動を壊しても落ちず、その挙動がクリティカルパス（認証・課金・データ保存・公開ページの出力契約）に属するものは `blocker`。
- アサーションが無効で退行を検知できないが、影響範囲が限定的で merge 前に修正すれば足りるものは `warning`。
- 有効性は保たれているがスコープが広く、将来の誤検知・見逃しの温床になる程度のものは `nit`。
- 照合先が discover できず、無効と断定できないものは question（`info` 相当）。

## Evidence / 根拠の取り方

- finding の `file:line` は差分内のアサーション行にアンカーする。差分外の推測に基づく指摘は question として返す。
- Check 3〜5 では、照合先ファイルのパスと**照合に使った検索語**を併記し、第三者が同じ grep で再現できるようにする。
- 「このアサーションは常に PASS する」と述べる場合、**どの実装変更を加えても落ちないか**を 1 ケース具体的に示す。示せない場合は question とする。
- テスト作者の意図（手抜き・ごまかし）を断定しない。アサーションの構造と照合結果の事実のみを述べる（`.claude/rules/review-core.md`）。

## Output / 出力フォーマット

すべて日本語。標準の finding フォーマットに従い、各指摘に `check`（1〜6）と `resolution` を含める。

```text
(test-assertion-effectiveness):1: [要約] 最も影響の大きい無効アサーションは〈1文〉

<file>:<line>: [Ineffective assertion] <タイトル>
  check: 1 | 2 | 3 | 4 | 5 | 6
  Finding: どのアサーションがなぜ失敗しえないか
  Evidence: 照合先 `<file>` と検索語 `<query>`、または差分内の該当行
  Impact: どの退行を見逃すか（1文）
  Fix: <最小修正案>
  Confidence: high | medium | low
  Severity: blocker | warning | nit（較正基準に従う）
  resolution: <解消手順>
```

## Good / Bad Examples

### Good

```text
tests/Feature/ComparisonPageTest.php:48: [Ineffective assertion] 期待文字列がテンプレートに存在せず assertDontSee が常に PASS する
  check: 3
  Finding: `assertDontSee('要件整理シート付き比較表をダウンロード')` の期待文字列が、照合先テンプレートに 1 件も存在しない
  Evidence: 照合先 resources/views/comparison/show.blade.php、検索語 `要件整理シート付き比較表をダウンロード`（0 件）。分割後の文言は同ファイル 31-32 行に 2 要素で存在する
  Impact: 対象文言が再び出力されるようになっても、このテストは落ちない
  Fix: 分割後のマークアップに合わせ、対象要素へスコープした正規表現で検証する
  Confidence: high
  Severity: warning
  resolution: 期待値を変更後の出力に合わせるか、検証意図が「削除の回帰固定」であればテスト名とコメントにその旨を明記する
```

### Bad

```text
このテストは意味がありません
```

（Check の特定なし、照合先と検索語のアンカーなし、落ちない根拠の提示なし、resolution なし、作者の意図の断定）

## 評価指標（Evaluation）

- 合格基準: Check が特定され、無効と判断した根拠が差分内のアンカーと照合先の検索語で再現可能に示され、抑制条件（ヘルパー経由・パラメタライズド・削除の回帰固定・snapshot・意図的 smoke test）が棄却され、resolution が示されている。委譲表の領分を重複指摘しない。
- 不合格基準: 照合を行わずアサーションの見た目だけで指摘している、ヘルパー経由の assert を Check 1 と誤認している、パラメタライズドテストの入力テーブルを Check 2 と誤認している、決定論検出器や `vitest-mock-isolation` の領分を重複指摘している、resolution が無い。

## 人間に返す条件（Human Handoff）

- 期待値の照合先が動的生成（i18n・テンプレート合成・CMS 由来）で、静的に有効性を判定できない場合。
- アサーションが弱いのが意図的な設計判断（契約の緩さを許容する統合テスト等）かどうかの判別に、チームのテスト戦略上の合意を要する場合。

## References

- `skills/downstream/test-existence/SKILL.md` — テストの有無（委譲先）
- `skills/downstream/coverage-gap/SKILL.md` — 未テスト経路の量（委譲先）
- `skills/downstream/flaky-test/SKILL.md` — 非決定性（委譲先）
- `skills/downstream/test-naming/SKILL.md` — 命名・構造（委譲先）
- `skills/midstream/vitest-mock-isolation/SKILL.md` — JS / TS の un-awaited `.resolves` / `.rejects`（委譲先）
- `skills/upstream/plangate-tdd-evidence/SKILL.md` — `tdd-ledger` artifact ベースの証跡検証（委譲先）
- `skills/midstream/impact-evidence-coverage/SKILL.md` — 証拠の充足性（補完関係）
- `src/lib/heuristic-review.mjs` — `.only` / `.skip` / `@ts-ignore` / 空 `catch` の決定論検出器（重複指摘しない境界）
- `.claude/rules/review-core.md` §「カスタム静的解析の False-positive 責務分界（#1070）」 — 決定論と意味的判断の分界
- `docs/review/output-format.md` — 重要度ラベルと出力形式（SSoT）
