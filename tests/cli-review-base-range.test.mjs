// tests/cli-review-base-range.test.mjs
//
// #2046: `river review plan --base <ref>` は値を parse するだけで誰も読まず、
// commit 済みの差分があっても `no-changes` を返していた。同じ `--base` を
// `river review route` へ渡すと反映されるため、route が案内する「次のコマンド」に
// 従うと結果が食い違う silent failure だった。
//
// ここで固定するのは次の 5 点。1〜3 が #2046 本体、4〜5 が PR #2049 の
// レビュー指摘（major 1 / major 2）への対応にあたる。
//   1. plan が `--base <ref>` の範囲を実際に見ること（git の答えと一致する）
//   2. 同じ `--base` に対する route と plan の変更ファイル集合が一致すること
//   3. 解決した範囲が `artifact.context`（schema 既定の場所）に載ること
//   4. `diff` artifact との優先順位。明示指定（`--artifact diff=` / config）が
//      `--base` に勝ち、cwd 自動検出の `diff.patch` には `--base` が勝つ。
//      どちらの向きでも負けた側を stderr で告知する（無警告の上書きは不可）
//   5. 解決できない `--base`・空白のみの `--base` は exit 1
//      （黙って空の範囲をレビューしない）
//   6. rename / binary を含む range でも、plan の変更ファイル集合が git の
//      答えと一致すること（parseUnifiedDiff は両者を落とす）
//   7. replay（`review exec --plan <f> --base <ref>`）も同じ range を見ること
//   8. route の nextCommand が `--base` を引き継ぐこと（#2046 の「なぜ問題か」）
//
// 判定は CLI 面（runCliInProcess）で行う。両経路の配線そのものを検査する必要が
// あり、`runReviewPlan` を直接呼ぶと配線層が無検査のまま緑になるため。

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before, describe } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit, writeFileRelative } from './helpers/temp-repo.mjs';

/** `git diff --name-only <ref>`（working tree 込み）の答え = 突合の一次ソース。 */
async function gitChangedFiles(dir, ref) {
  const { stdout } = await runGit(['diff', '--name-only', ref], dir);
  return stdout.split('\n').filter(Boolean).sort();
}

async function revParse(dir, ref) {
  const { stdout } = await runGit(['rev-parse', ref], dir);
  return stdout.trim();
}

/**
 * `river review plan` を CLI 面で実行し、artifact と stderr を返す。
 * plan の artifact は console.log ではなく process.stdout.write で出るため
 * （src/cli/commands/review.mjs）、runCliInProcess では捕捉できない。
 * `--output-file` に書かせて読む。出力先を repo の外へ置くのは、artifact
 * ファイル自体が次の実行の差分に混ざらないようにするため。
 */
const outDir = mkdtempSync(join(tmpdir(), 'river-plan-out-'));
let planCounter = 0;

after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function runPlanRaw(dir, extraArgs) {
  const outFile = join(outDir, `plan-${planCounter++}.json`);
  const res = await runCliInProcess(
    ['review', 'plan', '.', ...extraArgs, '--plan-only', '--debug', '--output-file', outFile],
    { cwd: dir }
  );
  return { res, outFile };
}

async function runPlan(dir, extraArgs) {
  const { res, outFile } = await runPlanRaw(dir, extraArgs);
  assert.equal(res.code, 0, res.stderr);
  return { artifact: JSON.parse(readFileSync(outFile, 'utf8')), stderr: res.stderr };
}

describe('river review --base <ref> (#2046)', () => {
  let dir;
  let cleanup;
  /** 初期コミット（schemas/ を含む変更より前）。 */
  let base0;
  /** schemas/ の追加を取り込んだあとのコミット。 */
  let base1;

  before(async () => {
    ({ dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'README.md': '# base\n' },
    }));
    base0 = await revParse(dir, 'HEAD');

    // C1: schema ファイルを含むコミット。base0 からの範囲にだけ現れる。
    writeFileRelative(dir, 'schemas/thing.schema.json', '{ "type": "object" }\n');
    writeFileRelative(dir, 'src/a.js', 'export const a = 1;\n');
    await runGit(['add', '.'], dir);
    await runGit(['commit', '-m', 'add schema and a'], dir);
    base1 = await revParse(dir, 'HEAD');

    // working tree の変更。どちらの base 範囲にも現れる。
    writeFileRelative(dir, 'src/a.js', 'export const a = 2;\n');
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('plan --base <ref> reviews that ref range (was: silently no-changes)', async () => {
    const expected = await gitChangedFiles(dir, base0);
    assert.ok(expected.includes('schemas/thing.schema.json'), '前提: base0 の範囲に schema がある');

    const { artifact } = await runPlan(dir, ['--base', base0]);
    assert.equal(artifact.status, 'ok', '--base の範囲に差分があるのに no-changes を返している');
    assert.deepEqual([...(artifact.context?.changedFiles ?? [])].sort(), expected);
  });

  test('plan honors the ref it was given (a narrower base yields a narrower set)', async () => {
    const expected = await gitChangedFiles(dir, base1);
    assert.ok(
      !expected.includes('schemas/thing.schema.json'),
      '前提: base1 の範囲に schema は含まれない'
    );

    const { artifact } = await runPlan(dir, ['--base', base1]);
    assert.deepEqual([...(artifact.context?.changedFiles ?? [])].sort(), expected);
  });

  test('the resolved range lands in artifact.context, not a debug-only field', async () => {
    // schemas/review-artifact.schema.json の `context` が既存の置き場所。
    // `--debug` 無しでも見えることまで含めて固定する。
    const outFile = join(outDir, `plan-ctx-${planCounter++}.json`);
    const res = await runCliInProcess(
      ['review', 'plan', '.', '--base', base0, '--plan-only', '--output-file', outFile],
      { cwd: dir }
    );
    assert.equal(res.code, 0, res.stderr);
    const artifact = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(artifact.context.repoRoot, realpathSync(dir));
    assert.equal(artifact.context.defaultBranch, 'main');
    assert.equal(artifact.context.mergeBase, base0, 'mergeBase が --base の解決結果と違う');
    assert.ok(artifact.context.changedFiles.length > 0);
    assert.equal(artifact.debug, undefined, '--debug 無しで debug が付いている');
  });

  test('route and plan see the same file set for the same --base', async () => {
    // route の JSON は変更ファイル一覧を出さないので、集合の一致は
    // 「同じ集合から導かれる観測」で突き合わせる: schema ファイルが範囲に
    // 入っているかどうかは route 側では matchedTriggers に現れ、plan 側では
    // context.changedFiles に現れる。2 経路が違う範囲を見ていれば食い違う。
    for (const base of [base0, base1]) {
      const expected = await gitChangedFiles(dir, base);
      const schemaInRange = expected.some((f) => f.startsWith('schemas/'));

      const routeRes = await runCliInProcess(
        ['review', 'route', '.', '--base', base, '--format', 'json'],
        { cwd: dir }
      );
      assert.equal(routeRes.code, 0, routeRes.stderr);
      const route = JSON.parse(routeRes.stdout);
      assert.equal(
        route.matchedTriggers.includes('fileType:schema'),
        schemaInRange,
        `route が base ${base} の範囲を見ていない`
      );

      const { artifact } = await runPlan(dir, ['--base', base]);
      assert.deepEqual(
        [...(artifact.context?.changedFiles ?? [])].sort(),
        expected,
        `plan が base ${base} の範囲を見ていない`
      );
    }
  });

  test('an unresolvable --base is a usage error, not an empty review', async () => {
    // findMergeBase は解決できない ref を HEAD へフォールバックさせるため、
    // 修正前は typo が exit 0 + no-changes（= 差分が無い、と読める）になっていた。
    const { res } = await runPlanRaw(dir, ['--base', 'no-such-ref-xyz']);
    assert.equal(res.code, 1, `exit 1 になっていない: ${res.stdout}`);
    assert.match(res.stderr, /no-such-ref-xyz/);

    const routeRes = await runCliInProcess(
      ['review', 'route', '.', '--base', 'no-such-ref-xyz', '--format', 'json'],
      { cwd: dir }
    );
    assert.equal(routeRes.code, 1, 'route 側も同じ ref 解釈でなければ 2 経路が食い違う');
    assert.match(routeRes.stderr, /no-such-ref-xyz/);
  });

  test('a padded --base value is trimmed, not rejected', async () => {
    // trim が無いと "  <sha>  " は解決できない ref として扱われ、
    // 正当な指定まで usage error になる（trim と拒否は一体で意味を持つ）。
    const expected = await gitChangedFiles(dir, base0);
    const { artifact } = await runPlan(dir, ['--base', `  ${base0}  `]);
    assert.deepEqual([...artifact.context.changedFiles].sort(), expected);
  });

  test('a whitespace-only --base is a usage error too', async () => {
    // 空白のみの値は trim 前は「非空の ref」として扱われ、解決できないまま
    // HEAD へフォールバックしていた（解決できない ref と同じ根）。
    const { res } = await runPlanRaw(dir, ['--base', '   ']);
    assert.equal(res.code, 1, `exit 1 になっていない: ${res.stdout}`);
    assert.match(res.stderr, /--base/);
  });

  test('route suggests a next command that carries --base', async () => {
    // #2046 の「なぜ問題か」= 案内どおりに実行すると結果が食い違う。
    const routeRes = await runCliInProcess(
      ['review', 'route', '.', '--base', base0, '--format', 'json'],
      { cwd: dir }
    );
    assert.equal(routeRes.code, 0, routeRes.stderr);
    const route = JSON.parse(routeRes.stdout);
    assert.match(
      route.nextCommand,
      new RegExp(`--base ${base0}`),
      `nextCommand が --base を引き継いでいない: ${route.nextCommand}`
    );
  });
});

describe('river review plan: rename / binary changes (#2046 review major 1)', () => {
  let dir;
  let cleanup;
  let base0;

  before(async () => {
    ({ dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/old-name.js': 'export const a = 1;\n', 'keep.txt': 'keep\n' },
    }));
    base0 = await revParse(dir, 'HEAD');

    // 100% rename（内容を変えない）と binary の追加。どちらも
    // parseUnifiedDiff の `---`/`+++` エントリを持たない。
    await runGit(['mv', 'src/old-name.js', 'src/new-name.js'], dir);
    writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 2, 3, 0, 255]));
    await runGit(['add', '.'], dir);
    writeFileRelative(dir, 'keep.txt', 'keep changed\n');
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('changedFiles matches git even when the diff text has no ---/+++ entries', async () => {
    const expected = await gitChangedFiles(dir, base0);
    assert.ok(expected.includes('src/new-name.js'), '前提: rename が範囲にある');
    assert.ok(expected.includes('bin.dat'), '前提: binary が範囲にある');

    const { artifact } = await runPlan(dir, ['--base', base0]);
    assert.deepEqual(
      [...artifact.context.changedFiles].sort(),
      expected,
      'rename / binary が plan 側だけ欠落している'
    );
    assert.equal(artifact.status, 'ok');
  });
});

describe('river review exec --plan <file> --base <ref> (#2046 review major 2)', () => {
  let dir;
  let cleanup;
  let base0;
  let planFile;

  before(async () => {
    ({ dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/a.js': 'export const a = 1;\n' },
    }));
    base0 = await revParse(dir, 'HEAD');
    writeFileRelative(dir, 'src/a.js', 'export const a = 2;\n');
    writeFileRelative(dir, 'src/b.js', 'export const b = 1;\n');
    await runGit(['add', '.'], dir);

    // replay 用の source plan を実経路で作る。
    planFile = join(outDir, `replay-source-${planCounter++}.json`);
    const res = await runCliInProcess(
      ['review', 'plan', '.', '--base', base0, '--plan-only', '--output-file', planFile],
      { cwd: dir }
    );
    assert.equal(res.code, 0, res.stderr);
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('the replay path reviews the --base range, not the auto-detected one', async () => {
    const expected = await gitChangedFiles(dir, base0);
    const outFile = join(outDir, `replay-${planCounter++}.json`);
    const res = await runCliInProcess(
      [
        'review',
        'exec',
        '.',
        '--plan',
        planFile,
        '--base',
        base0,
        '--debug',
        '--output-file',
        outFile,
      ],
      { cwd: dir }
    );
    assert.equal(res.code, 0, res.stderr);
    const artifact = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.deepEqual(
      [...(artifact.context?.changedFiles ?? [])].sort(),
      expected,
      'replay が --base の範囲を見ていない（配線が無検査だった箇所）'
    );
  });

  test('--dry-run replay announces that --base was not consumed and claims no range', async () => {
    // このブロックは diff を解決しない（echo 契約）。範囲を見ていないのに
    // `context.changedFiles: []` を宣言すると、「範囲が空だった」と
    // 「範囲を見ていない」が consumer から区別できなくなる。
    const outFile = join(outDir, `replay-dry-${planCounter++}.json`);
    const res = await runCliInProcess(
      [
        'review',
        'exec',
        '.',
        '--plan',
        planFile,
        '--base',
        base0,
        '--dry-run',
        '--output-file',
        outFile,
      ],
      { cwd: dir }
    );
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stderr, /--base has no effect on this run/, '--base を無警告で捨てている');
    const artifact = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(
      artifact.context,
      undefined,
      '差分を解決していない回に context.changedFiles を宣言している'
    );
  });

  test('an unresolvable --base fails the replay path as well', async () => {
    const outFile = join(outDir, `replay-bad-${planCounter++}.json`);
    const res = await runCliInProcess(
      [
        'review',
        'exec',
        '.',
        '--plan',
        planFile,
        '--base',
        'no-such-ref-xyz',
        '--output-file',
        outFile,
      ],
      { cwd: dir }
    );
    assert.equal(res.code, 1, `exit 1 になっていない: ${res.stdout}`);
    assert.match(res.stderr, /no-such-ref-xyz/);
  });
});

describe('river review plan: --base vs the diff artifact (#2046 review major 1)', () => {
  let dir;
  let cleanup;
  let base0;

  before(async () => {
    ({ dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/a.js': 'export const a = 1;\n' },
    }));
    base0 = await revParse(dir, 'HEAD');
    writeFileRelative(dir, 'src/a.js', 'export const a = 2;\n');

    // cwd default の diff artifact（artifact-resolver の CWD_DEFAULTS.diff）。
    writeFileSync(join(dir, 'diff.patch'), unifiedDiffFor('src/stale.js'));
    // 明示指定用（tier: cli）。
    writeFileSync(join(dir, 'explicit.patch'), unifiedDiffFor('src/explicit.js'));
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('without --base the diff artifact still drives the plan (backward compatible)', async () => {
    const { artifact } = await runPlan(dir, []);
    assert.equal(artifact.status, 'ok');
    assert.deepEqual(artifact.context.changedFiles, ['src/stale.js']);
    assert.equal(artifact.debug.resolvedArtifacts.diff.source, 'cwd');
  });

  test('an explicitly specified diff artifact wins over --base, with a warning', async () => {
    // pages/reference/artifact-input-contract.md § diff:
    // 「artifact として指定が無い場合」に限り River Review が git を実行する。
    const { artifact, stderr } = await runPlan(dir, [
      '--artifact',
      'diff=explicit.patch',
      '--base',
      base0,
    ]);
    assert.deepEqual(artifact.context.changedFiles, ['src/explicit.js']);
    assert.equal(artifact.context.mergeBase, undefined, 'artifact が勝った回に range が載っている');
    assert.match(stderr, /--base is ignored for the review diff/);
    assert.match(stderr, /explicit\.patch/);
  });

  test('a specified but missing diff artifact is announced before --base is used', async () => {
    // exists の門番だけで負けると「artifact が優先された」とも読めない。
    // 契約（artifact-input-contract.md）が無条件に「明示指定が優先」と
    // 書いている以上、実際には使われなかったことを告知する必要がある。
    const { artifact, stderr } = await runPlan(dir, [
      '--artifact',
      'diff=./missing.patch',
      '--base',
      base0,
    ]);
    assert.match(stderr, /does not exist; using the --base range instead/);
    const expected = await gitChangedFiles(dir, base0);
    assert.deepEqual([...artifact.context.changedFiles].sort(), expected);
  });

  test('--base wins over the auto-detected diff.patch, with a warning', async () => {
    const expected = await gitChangedFiles(dir, base0);
    const { artifact, stderr } = await runPlan(dir, ['--base', base0]);
    assert.deepEqual([...artifact.context.changedFiles].sort(), expected);
    assert.ok(!artifact.context.changedFiles.includes('src/stale.js'));
    assert.match(stderr, /--base takes precedence over the auto-detected diff artifact/);
  });
});

describe('river review plan: an empty --base range (#2046)', () => {
  let dir;
  let cleanup;

  before(async () => {
    // working tree はクリーンなまま。`--base HEAD` の範囲が本当に空になる。
    ({ dir, cleanup } = await createTempGitRepo({
      initialFiles: { 'src/a.js': 'export const a = 1;\n' },
    }));
    writeFileSync(join(dir, 'diff.patch'), unifiedDiffFor('src/stale.js'));
  });

  after(async () => {
    if (cleanup) await cleanup();
  });

  test('reports no-changes instead of falling back to the diff artifact', async () => {
    const { artifact, stderr } = await runPlan(dir, ['--base', 'HEAD']);
    assert.equal(
      artifact.status,
      'no-changes',
      '空の --base 範囲が on-disk の diff.patch へフォールバックしている'
    );
    assert.deepEqual(artifact.context.changedFiles, []);
    assert.match(stderr, /--base takes precedence over the auto-detected diff artifact/);
  });

  test('a ref with no common history is announced instead of passing as no-changes', async () => {
    // rev-parse では解決できるが merge-base が無い ref。findMergeBase が HEAD へ
    // フォールバックするため、範囲は空になる（exit code は変えない）。
    await runGit(['checkout', '--orphan', 'orphanbase'], dir);
    await runGit(['commit', '--allow-empty', '-m', 'orphan'], dir);
    await runGit(['checkout', 'main'], dir);

    const { artifact, stderr } = await runPlan(dir, ['--base', 'orphanbase']);
    assert.match(stderr, /shares no history with HEAD/);
    assert.equal(artifact.status, 'no-changes');
  });

  test('the same repo without --base does review the diff artifact', async () => {
    // 対照群。上の no-changes が「そもそも artifact が読めていない」ではなく
    // 「--base が勝った」結果であることを示す。
    const { artifact } = await runPlan(dir, []);
    assert.deepEqual(artifact.context.changedFiles, ['src/stale.js']);
  });
});

/** 1 ファイルだけを含む最小の unified diff。 */
function unifiedDiffFor(relPath) {
  return [
    `diff --git a/${relPath} b/${relPath}`,
    'index 0000000..1111111 100644',
    `--- a/${relPath}`,
    `+++ b/${relPath}`,
    '@@ -1 +1 @@',
    '-const value = 1;',
    '+const value = 2;',
    '',
  ].join('\n');
}
