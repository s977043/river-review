// scripts/normalize-dist.mjs の回帰テスト。
//
// このスクリプトは `npm run build:action` の第 2 段であり、ncc が出力した
// dist を「どのディレクトリでビルドしても同じバイト列」に揃える責務を持つ。
// ncc は relocate した asset を「ビルドルートの親」からの相対パスで解決する
// ため、bundle 内の `__webpack_require__.ab + "<dir>/"` と、生成される
// `dist/<dir>/` の両方にビルド時の作業ディレクトリ名が焼き込まれる。
// worktree（`.claude/worktrees/agent-<id>/`）でビルドすると CI の checkout
// 名（= リポジトリ名）と一致しなくなる（#1894 で実際に踏んだ）。
//
// 期待値は実装から生成していない。入力の asset 参照行は、この worktree で実際に
// `npm run build:action` を走らせたときに
// runners/github-action/dist/260.index.mjs:292 に現れた行そのもの（ディレクトリ
// 名だけ合成値に置換）であり、期待出力は「その行だけが正規名へ変わり、他は 1 文字
// も変わらない」という契約を手で書き下したリテラルである。実装の出力をそのまま
// 焼き直すと自己整合になり、置換範囲を広げても緑のまま通ってしまう。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FLOW_SCHEMA_FILENAMES } from '../src/lib/flow-loader.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/normalize-dist.mjs', import.meta.url));
const CANONICAL = 'river-review';
// Hand-written: the three schemas the Flow loader compiles (#2054 PR-5).
const FLOW_SCHEMA_FILES = [
  'flow-entry-map.schema.json',
  'flow.schema.json',
  'review-intent.schema.json',
];

// ncc が実際に吐いた asset 参照行（ディレクトリ名のみ合成）と、置換してはいけない
// 正当な文脈の行を混ぜた入力。最後の 1 行はビルドディレクトリ名そのものを
// asset 参照でない文脈に置いてある（sourcemap のパス等で実際に現れうる）。
const bundleInput = (dirName) =>
  [
    'async function loadRunRecord(storeDir, runId) {',
    `  const resolved = __webpack_require__.ab + "${dirName}/" + base + '/' + runId + '.json';`,
    '}',
    '// skills/agent-skills/river-review/references/FEEDBACK_TO_FIXTURE.md (SSoT)',
    "const homepage = 'https://github.com/s977043/river-review';",
    'const pkg = "river-review";',
    `// source: .claude/worktrees/${dirName}/src/lib/result-store.mjs`,
    '',
  ].join('\n');

// 期待出力（手書きの契約）: `__webpack_require__.ab` 直後の 1 箇所だけが正規名に
// なり、パッケージ名・URL・vendored パス・および同じディレクトリ名の非 asset
// 出現は 1 文字も変わらない。
const bundleExpected = (dirName) =>
  [
    'async function loadRunRecord(storeDir, runId) {',
    `  const resolved = __webpack_require__.ab + "river-review/" + base + '/' + runId + '.json';`,
    '}',
    '// skills/agent-skills/river-review/references/FEEDBACK_TO_FIXTURE.md (SSoT)',
    "const homepage = 'https://github.com/s977043/river-review';",
    'const pkg = "river-review";',
    `// source: .claude/worktrees/${dirName}/src/lib/result-store.mjs`,
    '',
  ].join('\n');

/**
 * `<tmp>/<dirName>/` に、normalize-dist.mjs が必要とする最小限のリポジトリ形状を
 * 組み立てる。スクリプト自身が `basename(repoRoot)` を見るので、テスト側は
 * ディレクトリ名を変えるだけでビルド場所の違いを再現できる。
 */
function makeFakeRepo(t, dirName, { extraAssetDir = null, withFlowAssets = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'normalize-dist-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, dirName);
  const dist = path.join(root, 'runners/github-action/dist');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.copyFileSync(scriptPath, path.join(root, 'scripts/normalize-dist.mjs'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: CANONICAL }), 'utf8');
  // Flow assets (#2054 PR-5): what the dist must ship, plus one non-asset file
  // in each directory that must NOT be copied.
  if (withFlowAssets) {
    fs.mkdirSync(path.join(root, 'flows/intents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'flows/entry-map.json'), '{"entries":{}}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'flows/x.flow.json'), '{"id":"x"}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'flows/intents/y.intent.json'), '{"purpose":"y"}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'flows/README.md'), '# not an asset\n', 'utf8');
    fs.mkdirSync(path.join(root, 'schemas'), { recursive: true });
    for (const name of FLOW_SCHEMA_FILES) {
      fs.writeFileSync(path.join(root, 'schemas', name), `{"$id":"${name}"}\n`, 'utf8');
    }
    fs.writeFileSync(path.join(root, 'schemas/output.schema.json'), '{"$id":"out"}\n', 'utf8');
  }
  fs.writeFileSync(path.join(dist, '260.index.mjs'), bundleInput(dirName), 'utf8');
  fs.writeFileSync(path.join(dist, 'crlf.cjs'), 'a\r\nb\r\n', 'utf8');
  fs.mkdirSync(path.join(dist, dirName, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(dist, dirName, 'schemas/output.schema.json'), '{}\n', 'utf8');
  if (extraAssetDir) {
    fs.mkdirSync(path.join(dist, extraAssetDir, 'schemas'), { recursive: true });
    fs.writeFileSync(
      path.join(dist, extraAssetDir, 'schemas/stale.json'),
      '{"old":true}\n',
      'utf8'
    );
  }
  return { root, dist };
}

function run(root) {
  return execFileSync(process.execPath, [path.join(root, 'scripts/normalize-dist.mjs')], {
    encoding: 'utf8',
  });
}

test('作業ディレクトリ名が正規名と一致するとき bundle を書き換えない', (t) => {
  const { root, dist } = makeFakeRepo(t, CANONICAL);
  const before = fs.readFileSync(path.join(dist, '260.index.mjs'), 'utf8');
  const stdout = run(root);

  assert.equal(fs.readFileSync(path.join(dist, '260.index.mjs'), 'utf8'), before);
  assert.equal(before, bundleExpected(CANONICAL));
  // asset ディレクトリはそのまま残る（リネームも削除もしない）。
  assert.ok(fs.existsSync(path.join(dist, CANONICAL, 'schemas/output.schema.json')));
  assert.ok(!stdout.includes('Rewrote build directory name'));
});

test('作業ディレクトリ名が異なるとき asset 参照だけを正規名へ書き換える', (t) => {
  const dirName = 'agent-a358e5d2d4e8dfefe';
  const { root, dist } = makeFakeRepo(t, dirName);
  const stdout = run(root);

  assert.equal(fs.readFileSync(path.join(dist, '260.index.mjs'), 'utf8'), bundleExpected(dirName));
  assert.ok(stdout.includes('Rewrote build directory name'));
});

test('作業ディレクトリ名が異なるとき asset ディレクトリを正規名へ移す', (t) => {
  const dirName = 'agent-a358e5d2d4e8dfefe';
  const { root, dist } = makeFakeRepo(t, dirName);
  run(root);

  assert.equal(fs.existsSync(path.join(dist, dirName)), false);
  assert.equal(
    fs.readFileSync(path.join(dist, CANONICAL, 'schemas/output.schema.json'), 'utf8'),
    '{}\n'
  );
});

test('正規名の asset ディレクトリが既にあるときは統合して残骸を残さない', (t) => {
  const dirName = 'agent-a358e5d2d4e8dfefe';
  const { root, dist } = makeFakeRepo(t, dirName, { extraAssetDir: CANONICAL });
  run(root);

  assert.equal(fs.existsSync(path.join(dist, dirName)), false);
  assert.ok(fs.existsSync(path.join(dist, CANONICAL, 'schemas/output.schema.json')));
  assert.ok(fs.existsSync(path.join(dist, CANONICAL, 'schemas/stale.json')));
});

test('CRLF の LF 正規化は作業ディレクトリ名によらず行われる', (t) => {
  for (const dirName of [CANONICAL, 'agent-a358e5d2d4e8dfefe']) {
    const { root, dist } = makeFakeRepo(t, dirName);
    run(root);
    assert.equal(fs.readFileSync(path.join(dist, 'crlf.cjs'), 'utf8'), 'a\nb\n');
  }
});

test('flows/ の Flow asset と loader が使う schema 3 本だけを dist に同梱する (#2054 PR-5)', (t) => {
  const { root, dist } = makeFakeRepo(t, CANONICAL);
  const stdout = run(root);

  assert.ok(stdout.includes('Copied flows/ and 3 schema(s) into dist/'));
  const list = (dir) =>
    fs
      .readdirSync(path.join(dist, dir), { recursive: true })
      .map((f) => String(f))
      .sort();
  assert.deepEqual(list('flows'), [
    'entry-map.json',
    'intents',
    'intents/y.intent.json',
    'x.flow.json',
  ]);
  assert.deepEqual(list('schemas'), FLOW_SCHEMA_FILES);
  // Contents are copied verbatim.
  assert.equal(
    fs.readFileSync(path.join(dist, 'flows/entry-map.json'), 'utf8'),
    '{"entries":{}}\n'
  );
  // Re-running replaces rather than accumulates (a renamed asset does not linger).
  fs.writeFileSync(path.join(dist, 'flows/stale.flow.json'), '{}\n', 'utf8');
  run(root);
  assert.deepEqual(list('flows'), [
    'entry-map.json',
    'intents',
    'intents/y.intent.json',
    'x.flow.json',
  ]);
});

test('flows/ が無い checkout では黙って同梱を省かず失敗する (#2054 PR-5)', (t) => {
  const { root } = makeFakeRepo(t, CANONICAL, { withFlowAssets: false });
  assert.throws(() => run(root), /flows\/ not found at .*the dist cannot ship --entry without it/);
});

test('同梱する schema の一覧は flow-loader の FLOW_SCHEMA_FILENAMES と一致する (#2054 PR-5)', () => {
  // The script cannot import the loader (it must run without node_modules), so
  // the list is duplicated there; this pins the duplicate to the SSoT.
  const source = fs.readFileSync(scriptPath, 'utf8');
  const block = /const FLOW_SCHEMA_FILES = \[([^\]]+)\];/.exec(source);
  assert.ok(block, 'FLOW_SCHEMA_FILES not found in normalize-dist.mjs');
  const inScript = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inScript, Object.values(FLOW_SCHEMA_FILENAMES).sort());
  assert.deepEqual(inScript, [...FLOW_SCHEMA_FILES].sort());
});
