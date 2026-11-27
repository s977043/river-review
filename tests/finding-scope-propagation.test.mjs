// #1644 の中核機構の回帰テスト: verifier が差分から機械判定した scope が
// `generateReview` の返す `findings[].scope` まで伝播することを固定する。
//
// なぜ `generateReview` を通すのか。伝播の唯一の経路は review-engine.mjs の
// `runVerifierStage` にある `withScope`（`{ ...r.comment, scope: r.verification.scope }`）
// であり、そこが外れると finding の scope は LLM の自己申告、さらに無ければ
// fail-safe 既定値 `in-diff` へ静かに落ちる。出力は「もっともらしいが誤った
// scope」になり、利用者からは区別できない。`withScope` や `resolveFindingScope`
// を直接呼ぶテストは実装と同じ層を両側から参照するため、経路が外れても緑のまま
// 通る（自己整合）。よってパイプライン全体の観測可能な出力で測る。
//
// なぜ機械判定と自己申告を食い違わせるのか。両者が一致していると、採用された
// のがどちらだったか出力から区別できない。`resolveFindingScope` は機械判定を
// 自己申告より優先すると決めているので、食い違わせて初めてその優先順位が測れる。
//
// fail-safe 経路も別に覆う。`withScope` は通常経路と「verifier が全件棄却して
// heuristic / fallback へ degrade する」経路の 2 箇所で使われており、通常経路
// だけを固定すると degrade 側は無防備なままになる。
//
// 期待値は実装から導かない。差分と finding の行番号から読み手が手で決められる
// 値（下表）をリテラルで書く。
//
//   | 行 | 差分上の位置        | 自己申告        | 期待 scope     |
//   | -- | ------------------- | --------------- | -------------- |
//   |  9 | 文脈行（追加でない）| in-diff         | pre-existing   |
//   | 11 | 追加行              | pre-existing    | in-diff        |
//   | 10 | 文脈行（追加でない）| なし            | pre-existing   |

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { generateReview } from '../src/lib/review-engine.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

// 追加行は 11 / 12 のみ。8-10 と 13-14 は文脈行で、#1644 の契約では
// pre-existing（文脈行は「この差分が変更した行」ではない）。
const NORMAL_DIFF_TEXT = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -8,6 +8,8 @@ export function run() {
   const existing = 1;
   const alsoExisting = 2;
   const stillExisting = 3;
+  const added = 4;
+  console.log(added);
   return existing;
 }
`;

// 追加行は 23（`return;`）のみ。silent-catch 検出器が finding を立てるのは
// その catch 節の行 22 で、これは文脈行なので pre-existing になる。
// fail-safe 経路の degrade 先（heuristic）で scope が既定値と異なる値を持つ
// 状況を作るために、この形の差分を使う。
const FAILSAFE_DIFF_TEXT = `diff --git a/src/handler.ts b/src/handler.ts
index 3333333..4444444 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -20,6 +20,7 @@ export function handle() {
   try {
     doWork();
   } catch (err) {
+    return;
   }
 }
`;

const PLAN = {
  selected: [
    {
      metadata: {
        id: 'logging-observability',
        name: 'Logging and Observability',
        phase: 'midstream',
        applyTo: ['src/**'],
      },
    },
  ],
  skipped: [],
};

/** verifier を通過する完全なラベル付き finding 本文を組む。 */
function verifiableMessage({ finding, scopeLabel }) {
  const scope = scopeLabel ? ` Scope: ${scopeLabel}` : '';
  return `Finding: ${finding} Evidence: 該当箇所の実装がそのまま残っている Impact: 障害調査が難しくなる Fix: ログを追加し、失敗時は上位へ伝播させる Severity: warning Confidence: high${scope}`;
}

/** verifier に必ず棄却される本文（必須ラベルは満たすが Evidence:/Fix: が無い）。 */
function unverifiableMessage(finding) {
  return `${finding} Severity: warning Confidence: high`;
}

let originalFetch;
let originalOffline;

function isolateFetchAndOffline() {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalOffline = process.env.RIVER_OFFLINE;
    delete process.env.RIVER_OFFLINE;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.RIVER_OFFLINE;
    else process.env.RIVER_OFFLINE = originalOffline;
  });
}

/** LLM 応答を固定して generateReview を 1 回走らせる。 */
async function runReview({ diffText, llmOutput }) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: llmOutput } }] }),
    text: async () => '',
  });
  return generateReview({
    diff: parseUnifiedDiff(diffText),
    plan: PLAN,
    phase: 'midstream',
    apiKey: 'test-key-not-a-real-credential',
    includeFallback: true,
  });
}

/** 行番号で finding を引く（findings は重要度順に並び替えられるため index では引けない）。 */
function findingAtLine(result, line) {
  const hit = result.findings.filter((f) => f.lineStart === line);
  assert.equal(hit.length, 1, `expected exactly one finding at line ${line}`);
  return hit[0];
}

describe('#1644: 機械判定した scope が findings[].scope へ伝播する（通常経路）', () => {
  isolateFetchAndOffline();

  it('機械判定が自己申告に勝ち、申告が無い場合も機械判定が載る', async () => {
    const llmOutput = [
      `src/app.ts:9: ${verifiableMessage({ finding: '文脈行の実装に問題がある', scopeLabel: 'in-diff' })}`,
      `src/app.ts:11: ${verifiableMessage({ finding: '追加行の実装に問題がある', scopeLabel: 'pre-existing' })}`,
      `src/app.ts:10: ${verifiableMessage({ finding: '文脈行の別の箇所に問題がある' })}`,
    ].join('\n');

    const result = await runReview({ diffText: NORMAL_DIFF_TEXT, llmOutput });

    // 前提: fail-safe には落ちていない（この test が測るのは通常経路）。
    assert.equal(result.debug.verifierAllRejected, undefined);
    assert.equal(result.findings.length, 3);

    // 機械判定 pre-existing が、自己申告 in-diff に勝つ。
    assert.equal(findingAtLine(result, 9).scope, 'pre-existing');
    // 逆向き。機械判定 in-diff が、自己申告 pre-existing に勝つ。
    assert.equal(findingAtLine(result, 11).scope, 'in-diff');
    // 自己申告が無い場合、既定値 in-diff ではなく機械判定 pre-existing が載る。
    assert.equal(findingAtLine(result, 10).scope, 'pre-existing');

    // 食い違いは観測値としても残る（9 行目と 11 行目の 2 件）。
    assert.equal(result.debug.scopeStats.mismatch, 2);
    assert.equal(result.debug.scopeStats['pre-existing'], 2);
    assert.equal(result.debug.scopeStats['in-diff'], 1);
  });
});

describe('#1644: fail-safe 経路（verifier 全件棄却）でも scope が伝播する', () => {
  isolateFetchAndOffline();

  it('degrade 先の heuristic finding にも機械判定の scope が載る', async () => {
    const llmOutput = [
      `src/handler.ts:23: ${unverifiableMessage('Evidence も Fix も無いので verifier に棄却される')}`,
    ].join('\n');

    const result = await runReview({ diffText: FAILSAFE_DIFF_TEXT, llmOutput });

    // 前提: 一次集合は全件棄却され、fail-safe の degrade が走った。
    assert.equal(result.debug.verifierAllRejected, true);
    assert.equal(result.debug.heuristicsUsed, true);
    assert.equal(result.findings.length, 1);

    // degrade 先の finding は catch 節の文脈行 22 を指す。追加行は 23 だけなので
    // 機械判定は pre-existing であり、既定値 in-diff とは異なる。
    const finding = findingAtLine(result, 22);
    assert.equal(finding.scope, 'pre-existing');
    assert.equal(result.debug.scopeStats['pre-existing'], 1);
    assert.equal(result.debug.scopeStats['in-diff'], 0);
  });
});
