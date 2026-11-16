// tests/cli-run-output-phase-propagation.test.mjs
//
// #1962 残件: `river run --phase <p> --output <fmt>` で **CLI が受け取った phase が
// 成果物の中身に届いていること** を、サブプロセス起動 + 生成ファイルの読み戻しで固定する。
//
// 何を守るか:
//   `src/cli/commands/run.mjs` の `renderRunResult()` は `parsed.phase` を
//   4 分岐すべてへ手で渡している（json: `formatJsonOutput(result, parsed.phase)` /
//   markdown: `printMarkdownReport(result, parsed.phase)` / yaml: artifact の
//   `phase:` フィールド / html: `formatHtmlOutput(htmlResult, parsed.phase)`）。
//   この 4 本はいずれも**配線層にしか存在しない**。フォーマッタ単体テストは
//   phase を引数として直接与えるので、CLI から渡ってくる経路を一切通らない。
//
// 実測した穴（origin/main d3148cbe / Node v22.22.2）:
//   4 本すべてを `'midstream'` 直書きへ置き換えても、全テストが通る。
//   `npm test` → `# tests 3815 / # pass 3815 / # fail 0`。
//   つまり `--phase upstream` が無視されて全成果物が midstream を名乗るように
//   なっても、CI は緑のまま出荷される。
//
// 設計上の注意（自己整合の罠を避ける）:
//   - 1 層内側（`renderRunResult` / 各フォーマッタ）を import して呼ばない。
//     `src/cli.mjs` を**サブプロセスとして起動**し、stdout を成果物ファイルへ
//     書き出してから読み戻す。配線層を必ず通る。
//   - 期待値を実装から導かない。CLI へ渡した phase 文字列そのもの（golden）を
//     期待値にする。既定値の `midstream` は使わない（直書き mutation と区別が
//     つかなくなるため）。
//   - yaml は `js-yaml` で **load** して構造から読む（dump し直して比較しない）。
//     html / markdown は固定文字列で検査する。

import assert from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { describe } from 'node:test';

import * as yaml from 'js-yaml';

import { runCliAsSubprocess } from './helpers/cli.mjs';
import { createRepoWithSilentCatchChange } from './helpers/temp-repo.mjs';

/**
 * 既定 phase（midstream）と異なる 2 値。1 値だけだと「別の定数を直書きした」
 * mutation を通してしまうので、2 値で phase が実際に伝播していることを見る。
 */
const NON_DEFAULT_PHASES = ['upstream', 'downstream'];

/** レビュー対象の差分を持つ一時リポジトリ。fixture の SSoT は helpers/temp-repo.mjs 側。 */
function createRepoWithChange() {
  return createRepoWithSilentCatchChange({ prefix: 'river-phase-propagation-' });
}

/**
 * LLM 呼び出しを失敗させる env。閉じたローカルポートへ向けるので外部へは接続しない。
 * LLM を呼ばない run（dry-run / offline）は fallback を出さず（#2868）、upstream /
 * downstream には heuristic を持つ skill が無いので issues が空になる。呼び出しが
 * 失敗した run は fallback を出すので、phase を名乗る issue が残る。
 */
const LLM_FAILURE_ENV = {
  OPENAI_API_KEY: 'test-key',
  RIVER_OPENAI_API_KEY: '',
  RIVER_OFFLINE: '',
  RIVER_OPENAI_BASE_URL: 'http://127.0.0.1:9/v1/chat/completions',
};

/**
 * CLI をサブプロセスで起動し、stdout を成果物ファイルへ書き出してから読み戻す。
 *
 * @param {string} dir リポジトリ
 * @param {string} phase `--phase` に渡す値
 * @param {string} format `--output` に渡す値
 * @param {{ llmFailure?: boolean }} [options] true なら dry-run せず LLM 呼び出しを失敗させる
 * @returns {Promise<string>} 成果物ファイルの中身
 */
async function writeArtifact(dir, phase, format, { llmFailure = false } = {}) {
  const result = await runCliAsSubprocess(
    ['run', '.', ...(llmFailure ? [] : ['--dry-run']), '--phase', phase, '--output', format],
    // RIVER_PHASE が開発者環境に残っていても結果が変わらないことを明示する。
    // `--phase` は明示指定なので env より優先される（src/cli.mjs:1929）。
    {
      cwd: dir,
      env: { RIVER_PHASE: 'midstream', ...(llmFailure ? LLM_FAILURE_ENV : {}) },
    }
  );
  assert.strictEqual(result.code, 0, `${phase}/${format}: ${result.stderr}`);

  const artifactPath = join(dir, `artifact.${format}`);
  await writeFile(artifactPath, result.stdout);
  return readFile(artifactPath, 'utf8');
}

/** YAML 分岐の stdout は ```yaml フェンス + 日本語サマリー。フェンス内だけを load する。 */
function loadYamlReview(artifact) {
  const match = artifact.match(/```yaml\n([\s\S]*?)\n```/);
  assert.ok(match, 'stdout に ```yaml フェンスが無い');
  const doc = yaml.load(match[1]);
  assert.ok(doc?.review && typeof doc.review === 'object', 'YAML に review キーが無い');
  return doc.review;
}

describe('river run --phase reaches every --output artifact (#1962 wiring pins)', () => {
  for (const phase of NON_DEFAULT_PHASES) {
    test(`json artifact reports the requested phase (${phase})`, { timeout: 30_000 }, async (t) => {
      const { dir, cleanup } = await createRepoWithChange();
      t.after(cleanup);

      const parsed = JSON.parse(await writeArtifact(dir, phase, 'json', { llmFailure: true }));

      assert.ok(Array.isArray(parsed.issues) && parsed.issues.length > 0, 'issues が空');
      for (const [i, issue] of parsed.issues.entries()) {
        assert.strictEqual(issue.phase, phase, `issues[${i}].phase`);
      }
      // 件数サマリーも phase 単位に積まれる。直書きすると別キーへ積まれる。
      assert.strictEqual(
        parsed.summary.issueCountByPhase[phase],
        parsed.issues.length,
        `summary.issueCountByPhase.${phase} が issues 件数と不一致`
      );
    });

    test(`yaml artifact reports the requested phase (${phase})`, async (t) => {
      const { dir, cleanup } = await createRepoWithChange();
      t.after(cleanup);

      const review = loadYamlReview(await writeArtifact(dir, phase, 'yaml'));
      assert.strictEqual(review.phase, phase, 'yaml の review.phase が --phase と不一致');
    });

    test(`html artifact reports the requested phase (${phase})`, async (t) => {
      const { dir, cleanup } = await createRepoWithChange();
      t.after(cleanup);

      const html = await writeArtifact(dir, phase, 'html');

      assert.match(html, /^<!DOCTYPE html>/);
      // title と meta 行の 2 箇所へ届く。片方だけの検査だと、もう片方が
      // 別経路で埋まっていた場合に気づけない。
      assert.ok(
        html.includes(`<title>River Review Report — ${phase}</title>`),
        `html の <title> が --phase と不一致: ${phase}`
      );
      assert.ok(
        html.includes(`Phase: <strong>${phase}</strong>`),
        `html の meta 行が --phase と不一致: ${phase}`
      );
    });

    test(`markdown artifact reports the requested phase (${phase})`, async (t) => {
      const { dir, cleanup } = await createRepoWithChange();
      t.after(cleanup);

      const markdown = await writeArtifact(dir, phase, 'markdown');
      assert.ok(
        markdown.includes(`フェーズ \`${phase}\``),
        `markdown のフェーズ表示が --phase と不一致: ${phase}`
      );
    });
  }

  test('the default phase is midstream, so a hardcoded midstream is not what these pins observe', async (t) => {
    // 上の pin が「たまたま既定値と一致しているだけ」でないことを固定する。
    // 既定（--phase 無し）は midstream であり、NON_DEFAULT_PHASES はそれと
    // 異なる値であることをここで明示しておく。
    const { dir, cleanup } = await createRepoWithChange();
    t.after(cleanup);

    const result = await runCliAsSubprocess(['run', '.', '--dry-run', '--output', 'yaml'], {
      cwd: dir,
      env: { RIVER_PHASE: '' },
    });
    assert.strictEqual(result.code, 0, result.stderr);

    const review = loadYamlReview(result.stdout);
    assert.strictEqual(review.phase, 'midstream', '既定 phase が midstream でない');
    assert.ok(
      !NON_DEFAULT_PHASES.includes('midstream'),
      'NON_DEFAULT_PHASES に既定値が混ざっている'
    );
  });
});
