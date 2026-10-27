// tests/cli-run-output-artifact.test.mjs
//
// #1962: `river run --output <fmt>` の**成果物の中身**を CLI 経由で検査する pin。
//
// 何を守るか:
//   `src/cli/commands/run.mjs` の `renderRunResult()` は、フォーマッタへ渡す
//   artifact をこの層で組み立てている（yaml へ渡す findings の出所、html の
//   findings の出所、`#1170 F3` の decision 伝播、JSON のインデント、text 分岐の
//   出力順）。フォーマッタ単体テスト（tests/output-formatters/yaml.test.mjs,
//   tests/output-html.test.mjs）は**手組みのオブジェクト**を渡すので、この
//   配線層を一切通らない。tests/cli-output-stream-routing.test.mjs は
//   `--output yaml` を CLI から叩く唯一のテストだが、exit code と実行ヘッダーの
//   ストリームしか見ておらず、YAML 本体は parse すらしていない。
//
// 設計上の注意（自己整合の罠を避ける）:
//   期待値を `renderRunResult` の実装から導かない。yaml / html / markdown の
//   期待値は、**同じ入力で実行した `--output json` の実出力**から取る。
//   `decision` もテスト側で与えず、CLI が返した JSON 成果物の値を使う。
//
// 意図的に覆えていない穴（#1962 実測）:
//   yaml / html 分岐の `decision` 伝播行（`#1170 F3`）を**両方削除しても、この
//   ファイルを含む全テストが通る**（実測: `# tests 3615 / # pass 3615 / # fail 0`）。
//   run 経路は `result.decision` を一切設定せず（src/lib/local-runner.mjs の
//   runLocalReview の戻り値に `decision` は無い）、`deriveRunGate` が返す
//   decision は `scoreReview(result.findings).verdict` そのものになる。yaml /
//   html のフォーマッタ側の再計算は同じ findings 集合を同じ `scoreReview` に
//   かけるので、値が一致し出力が byte 一致する。つまりこの伝播は現状 no-op で、
//   `resolveVerdict` の docstring が言う「run / diff 経路は canonical decision を
//   持たない」状態そのものである。両者が食い違う唯一の経路は
//   `noReviewerRoleSucceeded`（全 reviewer role 失敗 → decision を
//   human-review-required に固定）だが、これは LLM 呼び出しか per-role timeout の
//   競合を要し、CLI から決定論的に再現できない。上の verdict 一致 assert は
//   「将来 run 経路が canonical decision を持ったときに壊れる形」で契約を固定
//   するに留まる。ここを本当に殺すには `renderRunResult` の export か注入点が
//   必要で、それは src/ の変更になるため本 PR のスコープ外とした。

import assert from 'node:assert';
import test, { describe } from 'node:test';

import * as yaml from 'js-yaml';

import { runCliInProcess } from './helpers/cli.mjs';
import { createRepoWithSilentCatchChange, createTempGitRepo } from './helpers/temp-repo.mjs';

const RUN_ARGS = ['run', '.', '--dry-run'];

/** html.mjs の DECISION_CONFIG.label をテスト側に複製した対応表（実装から import しない）。 */
const DECISION_BANNER_LABEL = {
  'auto-approve': 'Auto Approve',
  'human-review-recommended': 'Human Review Recommended',
  'human-review-required': 'Human Review Required',
};

/** `--output <format>` を 1 回実行して stdout を返す。 */
async function runFormat(dir, format) {
  const result = await runCliInProcess([...RUN_ARGS, '--output', format], { cwd: dir });
  assert.strictEqual(result.code, 0, `${format}: ${result.stderr}`);
  return result.stdout;
}

/** YAML 分岐の stdout は ```yaml フェンス + 日本語サマリー。フェンス内だけを取り出す。 */
function parseYamlBlock(stdout) {
  const match = stdout.match(/```yaml\n([\s\S]*?)\n```/);
  assert.ok(match, 'stdout に ```yaml フェンスが無い');
  const doc = yaml.load(match[1]);
  assert.ok(doc && typeof doc === 'object', 'YAML フェンスが object にならない');
  assert.ok(doc.review && typeof doc.review === 'object', 'YAML に review キーが無い');
  return doc.review;
}

describe('river run --output artifacts (#1962 wiring pins)', () => {
  test('json stdout keeps the 2-space indentation contract', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const stdout = await runFormat(dir, 'json');
    const parsed = JSON.parse(stdout);

    // 正規化した再シリアライズと byte 一致させる。インデント幅を変えると落ちる。
    // 期待値は実装の呼び出し（JSON.stringify(..., null, 2)）ではなく、
    // 「2 スペースの整形 JSON を 1 行の改行付きで出す」という成果物側の契約から導く。
    assert.strictEqual(stdout, `${JSON.stringify(parsed, null, 2)}\n`);
    assert.ok(Array.isArray(parsed.issues) && parsed.issues.length > 0, 'issues が空');
  });

  test('yaml artifact carries the JSON issue shape, not the raw findings', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const jsonOutput = JSON.parse(await runFormat(dir, 'json'));
    const review = parseYamlBlock(await runFormat(dir, 'yaml'));

    assert.strictEqual(review.phase, 'midstream');
    assert.match(review.timestamp, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    assert.ok(Array.isArray(review.findings), 'review.findings が配列でない');
    assert.strictEqual(review.findings.length, jsonOutput.issues.length);

    for (const [i, issue] of jsonOutput.issues.entries()) {
      const f = review.findings[i];
      assert.strictEqual(f.severity, issue.severity, `findings[${i}].severity`);
      assert.strictEqual(f.file, issue.file, `findings[${i}].file`);
      assert.strictEqual(f.title, issue.title, `findings[${i}].title`);
      assert.strictEqual(f.detail, issue.message, `findings[${i}].detail`);
      assert.strictEqual(f.suggestion, issue.suggestion, `findings[${i}].suggestion`);
      assert.strictEqual(f.scope, issue.scope, `findings[${i}].scope`);
      // `line` は JSON 成果物側の形にしか存在しない（生の finding は lineStart /
      // lineEnd を持つ）。yaml 分岐が渡す findings の出所を生の
      // `result.findings` に差し替えると、この行だけが undefined になる。
      assert.strictEqual(f.line, issue.line, `findings[${i}].line`);
      assert.ok(Number.isInteger(f.line), `findings[${i}].line が整数でない`);
    }
  });

  test('yaml verdict / html banner / markdown 判定 all match the JSON decision (#1170 F3)', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const jsonOutput = JSON.parse(await runFormat(dir, 'json'));
    const decision = jsonOutput.decision;
    assert.ok(
      typeof decision === 'string' && decision.length > 0,
      'JSON 成果物に decision が無い（この fixture では非 undefined になるはず）'
    );

    const review = parseYamlBlock(await runFormat(dir, 'yaml'));
    assert.strictEqual(review.verdict, decision, 'yaml verdict が JSON decision と不一致');

    const html = await runFormat(dir, 'html');
    const bannerLabel = DECISION_BANNER_LABEL[decision];
    assert.ok(bannerLabel, `未知の decision: ${decision}`);
    // #2812: without an LLM run the verdict appears only as a labelled reference value.
    assert.match(
      html,
      new RegExp(
        `<div class="banner"[^>]*>\\n. ${bannerLabel}\\n</div>|参考値（LLM 未実行）: 判定 ${bannerLabel}<`
      )
    );
    assert.doesNotMatch(html, /Decision: N\/A/);

    const markdown = await runFormat(dir, 'markdown');
    assert.ok(
      markdown.includes(`**判定: ${decision}**`),
      `markdown の判定が JSON decision と不一致: ${decision}`
    );
  });

  test('html artifact renders the same findings the JSON artifact reports', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const jsonOutput = JSON.parse(await runFormat(dir, 'json'));
    const html = await runFormat(dir, 'html');

    assert.match(html, /^<!DOCTYPE html>/);
    for (const issue of jsonOutput.issues) {
      assert.ok(html.includes(`${issue.file}:${issue.line}`), `html に ${issue.file} 行が無い`);
      assert.ok(html.includes(issue.title), `html に title が無い: ${issue.title}`);
    }
    const severityChip = `minor: ${jsonOutput.summary.issueCountBySeverity.minor}`;
    assert.ok(html.includes(severityChip), `html の件数チップが JSON と不一致: ${severityChip}`);
  });

  test('yaml artifact derives high_risk_reasons from the plan it is handed', async (t) => {
    // plan.impactTags が security を含む差分（auth/ 配下）でのみ high_risk_reasons が出る。
    // yaml 分岐が artifact に `plan` を載せなくなると、この節ごと消える。
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-cli-authfix-',
      initialFiles: { 'auth/session.js': 'export const value = 1;\n' },
      changedFiles: {
        'auth/session.js': `export const value = 2;
export function refresh() {
  try {
    rotate();
  } catch(e) {
    return;
  }
}
`,
      },
    });
    t.after(cleanup);

    const review = parseYamlBlock(await runFormat(dir, 'yaml'));
    assert.ok(
      Array.isArray(review.high_risk_reasons) && review.high_risk_reasons.includes('security'),
      `high_risk_reasons に security が無い: ${JSON.stringify(review.high_risk_reasons)}`
    );
  });

  test('text output prints the plan before the review comments', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange();
    t.after(cleanup);

    const stdout = await runFormat(dir, 'text');
    const planIndex = stdout.indexOf('Selected skills (');
    const commentsIndex = stdout.indexOf('Review comments:');

    assert.ok(planIndex >= 0, 'text 出力に plan 節が無い');
    assert.ok(commentsIndex >= 0, 'text 出力に review comments 節が無い');
    assert.ok(
      planIndex < commentsIndex,
      `text 出力の順序が plan → comments でない (plan=${planIndex}, comments=${commentsIndex})`
    );
  });
});
