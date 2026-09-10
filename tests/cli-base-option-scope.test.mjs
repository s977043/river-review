// tests/cli-base-option-scope.test.mjs
//
// #2065 — 「受理したオプションが実際に消費されているか」の機械的な検査。
//
// #2046 / #2051 / #2057 は `--base` を**読む**面での silent failure を順に
// 塞いだが、`--base` そのものは `src/cli.mjs` の単一 allowlist
// （`KNOWN_OPTION_TOKENS` と `if (arg === '--base')` の平坦な連鎖）にあり、
// 差分を扱わない面（`doctor` / `runs` / `eval` など）も受理して値を捨てていた。
// #2065 でコマンド別 allowlist（`COMMAND_SCOPED_OPTIONS`）を入れて閉じている。
//
// このファイルが担うのは、その allowlist が**実装からずれないこと**の固定である。
// exit code の全量は tests/cli-usage-error-exit-codes.test.mjs（canary）側で
// pin してあり、ここでは canary が見ない 2 つの軸を見る:
//
//   1. 宣言 vs 実装: `BASE_CONSUMING_SURFACES` に挙がっている面の集合と、
//      ソース上で実際に `parsed.base` を読むファイルの集合を、それぞれ独立に
//      固定する。新しい面が `parsed.base` を読み始めたのに allowlist を広げ
//      なければ（あるいはその逆でも）ここが落ちる。
//   2. 面ごとの受理 / 拒否: parseArgs を直接呼び、`--base main`（= 解決できる
//      正常な値）が面ごとに受理されるか拒否されるかを網羅的に確認する。
//      **解決できない ref ではなく解決できる ref で測る**のが要点で、前者だと
//      #2046 系の「値の検証」による拒否と区別がつかない。
//
// 2 の判定は parseArgs の `usageError` フラグだけで行い、実行時の副作用を持ち
// 込まない（canary の VALID_CASES と同じ方針）。

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, describe } from 'node:test';

import {
  BASE_CONSUMING_SURFACES,
  ENTRY_CONSUMING_SURFACES,
  SURFACE_SUBCOMMANDS,
  parseArgs,
} from '../src/cli.mjs';
import { runCliInProcess } from './helpers/cli.mjs';
import { USAGE_ERROR_SURFACES } from './helpers/cli-surfaces.mjs';
import { createTempGitRepo } from './helpers/temp-repo.mjs';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * `src/` 配下の `.mjs` を再帰列挙する。
 * @param {string} dir
 * @returns {string[]} 絶対パス
 */
function listSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listSourceFiles(abs));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) found.push(abs);
  }
  return found.sort();
}

describe('#2065 --base command-scoped allowlist', () => {
  test('the declared consuming surfaces are exactly the five diff-reading ones', () => {
    assert.deepEqual(
      [...BASE_CONSUMING_SURFACES].sort(),
      ['review exec', 'review plan', 'review route', 'run', 'skills'].sort(),
      '`--base` を読む面を増減させたなら、この期待値と pages/reference/runner-cli-reference.md（ja/en）も同じ PR で更新すること'
    );
  });

  // ★ この検査の限界（false-negative 方向は未実証）:
  //   下の正規表現はソースの **コメントにも当たる**。変異注入 D
  //   （doctor.mjs のコメントへ `parsed.base` を書き足す）が落ちるのはその
  //   ためで、実証できているのは false-positive 方向だけである。逆に
  //   `const { base } = parsed` のような分解代入、`const ref = parsed[key]`
  //   のような動的アクセス、別名に束ねてから読む形は **検出できない**。
  //   新しい消費経路をそういう書き方で足した場合、この検査は黙って通る。
  //   grep を厳密化しても書き方の抜け道は残るため、実装は変えず限界を明記して
  //   ある。消費の有無そのものは下の面ごとの受理 / 拒否と canary の
  //   end-to-end で担保する。
  test('the files that read `parsed.base` are exactly the pinned set', () => {
    // `--base` の値がソース上でどこへ流れるかの実測。ここが増えたのに
    // BASE_CONSUMING_SURFACES が変わっていなければ、新しい面が値を読んでいる
    // のに parse 層が拒否している（またはその逆）ことになる。
    // src/lib/git.mjs は解決ヘルパー（resolveBaseMergeBase）の実装そのもの、
    // src/lib/local-runner.mjs は `run` 面の実体で、いずれも面ではない。
    const readers = listSourceFiles(SRC_DIR)
      .filter((abs) => {
        const source = readFileSync(abs, 'utf8');
        return /parsed\??\.base\b/.test(source) || /resolveBaseMergeBase/.test(source);
      })
      .map((abs) => relative(REPO_ROOT, abs).split('\\').join('/'))
      .sort();
    // src/cli/parse/options.mjs はオプション連鎖の移設先で、面ではなく parse 層の
    // 一部である（リファクタリング Step 4）。値を読むのではなく `--base` を
    // 受理して `parsed.base` へ書く側にあたる。
    assert.deepEqual(readers, [
      'src/cli.mjs',
      'src/cli/commands/review.mjs',
      'src/cli/commands/run.mjs',
      'src/cli/commands/skills.mjs',
      'src/cli/parse/options.mjs',
      'src/lib/git.mjs',
      'src/lib/local-runner.mjs',
    ]);
  });

  // 面ごとの代表 argv は tests/helpers/cli-surfaces.mjs に一本化してある
  // （#2074）。`promote` / `evolve` は自前の共有オプション集合
  // （PROMOTE_SHARED_OPTIONS / EVOLVE_SHARED_OPTIONS）で `--base` を先に弾き、
  // parseArgs の `usageError` ではなく専用フィールドへ記録するため、`usageError`
  // だけで判定するこの表では扱わない（canary 側の end-to-end で確認済み）。
  // 一覧が src/cli.mjs の語彙（SURFACE_SUBCOMMANDS）からずれていないことは
  // tests/cli-option-consumer-check.test.mjs が pin する。
  const SURFACES = USAGE_ERROR_SURFACES;

  test('every listed surface parses cleanly without --base (control)', () => {
    for (const { surface, argv } of SURFACES) {
      assert.equal(
        parseArgs(argv).usageError,
        false,
        `${surface}: --base 抜きの代表 argv が usage error になっている（測定の前提が崩れている）`
      );
    }
  });

  for (const { surface, argv } of SURFACES) {
    const consumes = BASE_CONSUMING_SURFACES.has(surface);
    test(`\`river ${surface} --base main\` is ${consumes ? 'accepted' : 'rejected'}`, () => {
      const parsed = parseArgs([...argv, '--base', 'main']);
      assert.equal(
        parsed.usageError,
        !consumes,
        consumes
          ? `${surface} は --base を読む面なので受理され続けなければならない`
          : `${surface} は --base を読まないので usage error にならなければならない`
      );
    });
  }

  test('the option is rejected regardless of where it is written in argv', () => {
    // `review` はサブコマンドを前後どちらにも書ける（#1755）。判定を parse
    // ループ内ではなく post-loop に置いたのはこのためで、語順で結論が割れない
    // ことを固定する。
    assert.equal(parseArgs(['review', '--base', 'main', 'verify']).usageError, true);
    assert.equal(parseArgs(['review', 'verify', '--base', 'main']).usageError, true);
    assert.equal(parseArgs(['review', '--base', 'main', 'route']).usageError, false);
    assert.equal(parseArgs(['review', 'route', '--base', 'main']).usageError, false);
  });

  // -------------------------------------------------------------------------
  // #2065 レビュー minor 1: 未知サブコマンド語のエラーを覆い隠さないこと
  // -------------------------------------------------------------------------
  // `runs` / `feedback` / `suppression` のサブコマンド語は eager branch が
  // 検証せずそのまま取るので、`checkCommandScopedOptions` を無条件に走らせると
  // `river runs nosuch` という存在しない面を名乗り、ハンドラの有用な
  // メッセージ（`Unknown runs subcommand: …` / ``only `river feedback add` is
  // supported``）を潰してしまう。exit code はどちらも 1 なので canary では
  // 検出できない。そのため `isNamedSurface` で先にガードしている。
  //
  // ここは CLI を実際に起動して stderr の文言まで見る。parseArgs の
  // `usageError` だけでは「新チェックが黙ったこと」しか分からず、
  // 「ハンドラのメッセージが残ったこと」までは分からないため。
  describe('unknown or missing subcommand words keep the handler message', () => {
    let repoDir;
    let cleanupRepo;

    before(async () => {
      const { dir, cleanup } = await createTempGitRepo({
        prefix: 'river-2065-scope-',
        initialFiles: { 'a.txt': 'a\n', 'skills/.gitkeep': '' },
        changedFiles: { 'a.txt': 'a\nb\n' },
      });
      repoDir = dir;
      cleanupRepo = cleanup;
    });

    after(async () => {
      if (cleanupRepo) await cleanupRepo();
    });

    const HANDLER_CASES = [
      { argv: ['runs', 'nosuch'], expect: 'Unknown runs subcommand: nosuch' },
      { argv: ['feedback'], expect: 'only `river feedback add` is supported' },
      { argv: ['feedback', 'nosuch'], expect: 'only `river feedback add` is supported' },
      { argv: ['suppression'], expect: 'only `river suppression add` is supported' },
      { argv: ['suppression', 'nosuch'], expect: 'only `river suppression add` is supported' },
    ];

    for (const { argv, expect } of HANDLER_CASES) {
      test(`\`river ${argv.join(' ')} --base main\` still reports the handler error`, async () => {
        const result = await runCliInProcess([...argv, '--base', 'main'], {
          cwd: repoDir,
          env: { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' },
        });
        assert.equal(result.code, 1);
        assert.ok(
          result.stderr.includes(expect),
          `ハンドラのメッセージが失われた。stderr: ${result.stderr.slice(0, 300)}`
        );
        assert.ok(
          !result.stderr.includes('is not supported by'),
          `存在しない面を名乗るコマンド別 allowlist のエラーが出ている。stderr: ${result.stderr.slice(0, 300)}`
        );
      });
    }

    // SURFACE_SUBCOMMANDS は runs / feedback / suppression のサブコマンド語を
    // ハンドラから写している（src/cli.mjs のコメント参照）。写しが実装から
    // ずれていないことを、実際に CLI を起動して確かめる。既知の語なら
    // 「未知サブコマンド」系のメッセージは出ない、が検査内容。
    const HANDLER_ERROR_MARKERS = [
      'Unknown runs subcommand',
      'only `river feedback add` is supported',
      'only `river suppression add` is supported',
    ];

    for (const command of ['runs', 'feedback', 'suppression']) {
      const { known } = SURFACE_SUBCOMMANDS.get(command);
      for (const subcommand of known) {
        test(`\`river ${command} ${subcommand}\` is a real subcommand (mirror pin)`, async () => {
          const result = await runCliInProcess([command, subcommand], {
            cwd: repoDir,
            env: { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' },
          });
          for (const marker of HANDLER_ERROR_MARKERS) {
            assert.ok(
              !result.stderr.includes(marker),
              `SURFACE_SUBCOMMANDS がハンドラの語彙からずれている（${command} ${subcommand} が未知扱い）。stderr: ${result.stderr.slice(0, 300)}`
            );
          }
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // #2076: 拒否メッセージに復旧手順が含まれること
  // -------------------------------------------------------------------------
  // #2065 のメッセージは「なぜ拒否したか」と「受理する面の一覧」は伝えるが、
  // 「ではどう打ち直せばよいか」を書いていなかった。`--base` を読まない面は
  // 値を一度も読んでいないので、flag を外せば従来と同じ結果になる。
  //
  // 期待文面は **実装から import せずリテラルで書く**（自己整合で緑になるのを
  // 避けるため）。canary（tests/cli-usage-error-exit-codes.test.mjs）は exit
  // code の 2 軸だけを見て文言を固定しない方針なので、文言の pin はここに置く。
  describe('the rejection tells the caller how to recover (#2076)', () => {
    const RECOVERY_SENTENCE = 'Drop --base to get the previous behavior.';
    const REJECTED_SURFACES = SURFACES.filter(
      ({ surface }) => !BASE_CONSUMING_SURFACES.has(surface)
    );

    let repoDir;
    let cleanupRepo;

    before(async () => {
      const { dir, cleanup } = await createTempGitRepo({
        prefix: 'river-2076-recovery-',
        initialFiles: { 'a.txt': 'a\n', 'skills/.gitkeep': '' },
        changedFiles: { 'a.txt': 'a\nb\n' },
      });
      repoDir = dir;
      cleanupRepo = cleanup;
    });

    after(async () => {
      if (cleanupRepo) await cleanupRepo();
    });

    test('all 14 non-consuming surfaces are covered by this check', () => {
      assert.equal(
        REJECTED_SURFACES.length,
        14,
        '面の増減があったなら期待件数と pages/reference/runner-cli-reference.md（ja/en）も同じ PR で更新すること'
      );
    });

    for (const { surface, argv } of REJECTED_SURFACES) {
      test(`\`river ${surface} --base main\` states the recovery step`, async () => {
        const result = await runCliInProcess([...argv, '--base', 'main'], {
          cwd: repoDir,
          env: { RIVER_OFFLINE: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', NO_COLOR: '1' },
        });
        assert.equal(result.code, 1);
        assert.ok(
          result.stderr.includes(RECOVERY_SENTENCE),
          `復旧手順の文が出ていない。stderr: ${result.stderr.slice(0, 400)}`
        );
        // 順序: Error 行（末尾が復旧手順）→ Usage → full help への誘導。
        const recoveryAt = result.stderr.indexOf(RECOVERY_SENTENCE);
        const usageAt = result.stderr.indexOf('Usage: river ');
        assert.ok(usageAt >= 0, `Usage 行が消えている。stderr: ${result.stderr.slice(0, 400)}`);
        assert.ok(
          recoveryAt < usageAt,
          `復旧手順が Usage 行より後ろに出ている。stderr: ${result.stderr.slice(0, 400)}`
        );
        assert.ok(
          result.stderr.includes('Run `river --help` for the full option list.'),
          `full help への誘導が消えている。stderr: ${result.stderr.slice(0, 400)}`
        );
        // 1 回だけ（Error 行と footer で二重に出ていない）。
        assert.equal(
          result.stderr.split(RECOVERY_SENTENCE).length - 1,
          1,
          `復旧手順が重複して出ている。stderr: ${result.stderr.slice(0, 400)}`
        );
      });
    }
  });

  test('--help and the bare command keep their exit-0 contract', () => {
    // `-h` / `--help` は argv のどこにあっても command を 'help' へ倒すため、
    // ここで拒否すると `river run . --base main --help` が usage error になる。
    assert.equal(parseArgs(['doctor', '.', '--base', 'main', '--help']).usageError, false);
    assert.equal(parseArgs(['--base', 'main']).usageError, false);
  });
});

// -----------------------------------------------------------------------------
// #2054 PR-3: `--entry` は同じ機構（COMMAND_SCOPED_OPTIONS）で `review plan` と
// `review exec`（Epic #2011 AC7 P2 で追加）が受理する。`--base` と同じ 2 軸で
// pin する: 宣言の集合と、面ごとの受理 / 拒否の全走。canary は `doctor` 1 形
// しか収録していないので、`ENTRY_CONSUMING_SURFACES` の増減はここでしか落ちない。
// -----------------------------------------------------------------------------
describe('#2054 --entry command-scoped allowlist', () => {
  test('the declared consuming surfaces are exactly `review exec` and `review plan`', () => {
    assert.deepEqual(
      [...ENTRY_CONSUMING_SURFACES].sort(),
      ['review exec', 'review plan'],
      '`--entry` を読む面を増減させたなら、この期待値と pages/reference/runner-cli-reference.md（ja/en）も同じ PR で更新すること'
    );
  });

  test('the files that read `parsed.entry` are exactly the pinned set', () => {
    const readers = listSourceFiles(SRC_DIR)
      .filter((abs) => /parsed\??\.entry\b/.test(readFileSync(abs, 'utf8')))
      .map((abs) => relative(REPO_ROOT, abs).split('\\').join('/'))
      .sort();
    // src/cli/parse/options.mjs は上と同じ理由で parse 層の一部。
    assert.deepEqual(readers, [
      'src/cli.mjs',
      'src/cli/commands/review.mjs',
      'src/cli/parse/options.mjs',
    ]);
  });

  for (const { surface, argv } of USAGE_ERROR_SURFACES) {
    const consumes = ENTRY_CONSUMING_SURFACES.has(surface);
    test(`\`river ${surface} --entry review-plan\` is ${consumes ? 'accepted' : 'rejected'}`, () => {
      // 解決できる entry 名で測る。未知の名前だと値検証による拒否と区別がつかない。
      const parsed = parseArgs([...argv, '--entry', 'review-plan']);
      assert.equal(
        parsed.usageError,
        !consumes,
        consumes
          ? `${surface} は --entry を読む面なので受理され続けなければならない`
          : `${surface} は --entry を読まないので usage error にならなければならない`
      );
      if (consumes) assert.equal(parsed.entry, 'review-plan');
    });
  }

  test('the option is rejected regardless of where it is written in argv', () => {
    assert.equal(parseArgs(['review', '--entry', 'review-plan', 'route']).usageError, true);
    assert.equal(parseArgs(['review', '--entry', 'review-plan', 'plan']).usageError, false);
    assert.equal(parseArgs(['review', '--entry', 'review-plan', 'exec']).usageError, false);
  });
});
