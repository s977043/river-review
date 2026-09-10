import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_TARGET_BYTES,
  NOTHING_SCANNED_ERROR,
  checkControlCharacters,
  formatViolationLines,
  isForbiddenByte,
  listTargetFiles,
  scanBuffer,
} from '../scripts/check-control-characters.mjs';

// check-control-characters.mjs（#2055）のガード挙動を、一時 git リポジトリを cwd にした
// 実プロセス実行で検証する。positive（検出される）と negative（誤検出しない canary）の
// 両方を持つ（.claude/rules/review-core.md の責務分界 #1070）。
//
// fixture は「制御文字を含むファイル」を必要とするが、それをこのリポジトリへ置くと
// fixture 自身が検査に落ちる（#2055 の「fixture の置き場」）。そこでリポジトリ内には
// 一切置かず、テスト実行時に一時 git リポジトリを作って書き出す。
// 期待値はエスケープ列で書くので、このテストファイル自体はテキストのまま保たれる。
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'check-control-characters.mjs'
);

const CLEAN_SOURCE = "export const ok = 'value';\n\tindented();\n";
const NUL_SOURCE = "export const bad = 'skill\u0000id';\n";
const VT_SOURCE = "export const bad = 'a\u000Bb';\n";
const UNIT_SEP_SOURCE = "export const bad = 'a\u001Fb';\n";
const DEL_SOURCE = "export const bad = 'a\u007Fb';\n";
const CRLF_SOURCE = 'export const ok = 1;\r\n\texport const also = 2;\r\n';

/**
 * 一時 git リポジトリを作り、files を書き出して `git add` する。
 *
 * `symlinks` は `<リポジトリ相対 path>` → `<symlink の指す先>` の対応で、追跡された
 * symlink（git の mode 120000）を作る。読み取り前ガードの回帰テスト用（#2055 追補）。
 */
function gitFixture(files, symlinks = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-ctrl-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'pipe' });
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    for (const [rel, target] of Object.entries(symlinks)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      symlinkSync(target, abs);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

function withFixture(files, fn, symlinks = {}) {
  const dir = gitFixture(files, symlinks);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** リポジトリの外に 1 ファイル作る（追跡 symlink の指す先として使う）。 */
function withOutsideFile(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-outside-'));
  const abs = join(dir, 'secret.txt');
  writeFileSync(abs, content);
  try {
    fn(abs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 実プロセスで CLI を起動し、exit code と stderr を返す。 */
function runIn(dir) {
  try {
    const stdout = execFileSync('node', [SCRIPT], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    if (typeof e.status !== 'number') throw e;
    return { status: e.status, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
}

test('isForbiddenByte: TAB / LF / CR は許可、その他の C0 と DEL は違反', () => {
  for (const allowed of [0x09, 0x0a, 0x0d]) {
    assert.equal(isForbiddenByte(allowed), false, `0x${allowed.toString(16)} は許可のはず`);
  }
  for (const code of [0x00, 0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1b, 0x1f, 0x7f]) {
    assert.equal(isForbiddenByte(code), true, `0x${code.toString(16)} は違反のはず`);
  }
  // 通常の可読文字・UTF-8 の後続バイトは違反にしない。
  for (const code of [0x20, 0x41, 0x7e, 0x80, 0xe3, 0xff]) {
    assert.equal(isForbiddenByte(code), false, `0x${code.toString(16)} は許可のはず`);
  }
});

test('scanBuffer: 正常なファイル（TAB / LF / CR のみ）は検出なし', () => {
  assert.deepEqual(scanBuffer(Buffer.from(CLEAN_SOURCE, 'utf8')), []);
  assert.deepEqual(scanBuffer(Buffer.from(CRLF_SOURCE, 'utf8')), []);
});

test('scanBuffer: NUL を offset / 行 / 列つきで検出する', () => {
  const text = `line1\n${NUL_SOURCE}`;
  const hits = scanBuffer(Buffer.from(text, 'utf8'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 0x00);
  assert.equal(hits[0].name, 'NUL');
  assert.equal(hits[0].line, 2);
  assert.equal(hits[0].offset, Buffer.from(text, 'utf8').indexOf(0x00));
  assert.equal(hits[0].column, NUL_SOURCE.indexOf('\u0000') + 1);
});

test('scanBuffer: TAB / LF / CR 以外の C0 と DEL も検出する', () => {
  for (const [source, code] of [
    [VT_SOURCE, 0x0b],
    [UNIT_SEP_SOURCE, 0x1f],
    [DEL_SOURCE, 0x7f],
  ]) {
    const hits = scanBuffer(Buffer.from(source, 'utf8'));
    assert.equal(hits.length, 1, `0x${code.toString(16)} を 1 件検出するはず`);
    assert.equal(hits[0].code, code);
  }
});

test('CLI: 正常な fixture のみなら exit 0', () => {
  withFixture(
    {
      'scripts/ok.mjs': CLEAN_SOURCE,
      'src/lib/ok.mjs': CRLF_SOURCE,
      'tests/ok.test.mjs': CLEAN_SOURCE,
    },
    (dir) => {
      const { status, stdout } = runIn(dir);
      assert.equal(status, 0, stdout);
      assert.match(stdout, /3 ファイル走査/);
    }
  );
});

test('CLI: NUL を含む fixture で exit 1（PR #2050 の事故と同形）', () => {
  withFixture({ 'scripts/bad.mjs': NUL_SOURCE, 'src/ok.mjs': CLEAN_SOURCE }, (dir) => {
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /scripts\/bad\.mjs:1:/);
    assert.match(stderr, /\(NUL\)/);
  });
});

test('CLI: TAB / LF / CR 以外の C0 を含む fixture で exit 1', () => {
  withFixture({ 'src/vt.mjs': VT_SOURCE, 'tests/us.test.mjs': UNIT_SEP_SOURCE }, (dir) => {
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /src\/vt\.mjs:/);
    assert.match(stderr, /tests\/us\.test\.mjs:/);
  });
});

test('CLI: 除外した場所（assets/ と action dist）の NUL は検出しない', () => {
  withFixture(
    {
      'scripts/ok.mjs': CLEAN_SOURCE,
      'assets/bad.bin': NUL_SOURCE,
      'runners/github-action/dist/index.mjs': NUL_SOURCE,
    },
    (dir) => {
      const { status, stdout } = runIn(dir);
      assert.equal(status, 0, stdout);
      assert.match(stdout, /1 ファイル走査/);
    }
  );
});

test('CLI: scripts/ src/ tests/ の外（skills/ docs/ .github/ ルート）も既定で保護される', () => {
  // 初版は scripts/ src/ tests/ の許可リストで、skills/ 549 件などが無防備だった。
  // 「全部から除外を引く」形にしたので、これらは追加設定なしで対象に入る。
  const files = {
    'skills/upstream/foo/SKILL.md': NUL_SOURCE,
    'commands/bar.md': NUL_SOURCE,
    'agents/baz.md': NUL_SOURCE,
    'runners/github-action/src/main.mjs': NUL_SOURCE,
    '.github/workflows/ci.yml': NUL_SOURCE,
    'docusaurus.config.js': NUL_SOURCE,
  };
  withFixture(files, (dir) => {
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    for (const rel of Object.keys(files)) {
      assert.ok(stderr.includes(rel), `${rel} が報告されていない`);
    }
  });
});

test('列挙は git ls-files 基準（未追跡ファイルは走査しない）', () => {
  withFixture({ 'scripts/ok.mjs': CLEAN_SOURCE }, (dir) => {
    // `git add` の後に書いたので未追跡のまま。ここが find ベースだと
    // .claude/worktrees/ のフルコピーまで拾ってしまう（ADR-009 D3-3 項番 1）。
    writeFileSync(join(dir, 'scripts', 'untracked.mjs'), NUL_SOURCE);
    assert.deepEqual(listTargetFiles(dir), ['scripts/ok.mjs']);
    const { status } = runIn(dir);
    assert.equal(status, 0);
  });
});

test('走査対象が 0 件なら OK ではなくエラーにする（すり抜け防止）', () => {
  // 除外だけで構成されたリポジトリ ＝ 走査対象ゼロ。
  withFixture({ 'assets/only.png': CLEAN_SOURCE }, (dir) => {
    const { errors, scanned } = checkControlCharacters({ root: dir });
    assert.equal(scanned, 0);
    assert.deepEqual(errors, [NOTHING_SCANNED_ERROR]);
    const { status, stderr } = runIn(dir);
    assert.equal(status, 1);
    assert.match(stderr, /走査対象が 0 件/);
  });
});

test('ALLOWED_FILES: 理由つきなら除外、理由が空・非文字列ならエラー', () => {
  withFixture({ 'scripts/bad.mjs': NUL_SOURCE, 'src/ok.mjs': CLEAN_SOURCE }, (dir) => {
    const excused = checkControlCharacters({
      root: dir,
      allowedFiles: new Map([['scripts/bad.mjs', '検証用の意図的な制御文字']]),
    });
    assert.deepEqual(excused.violations, []);
    assert.deepEqual(excused.errors, []);
    assert.equal(excused.ignored.length, 1);

    for (const reason of ['  ', 0, null, undefined]) {
      const bad = checkControlCharacters({
        root: dir,
        allowedFiles: new Map([['scripts/bad.mjs', reason]]),
      });
      const found = bad.errors.filter((e) => /理由が書かれていない/.test(e));
      assert.equal(found.length, 1, `reason=${JSON.stringify(reason)} を弾けていない`);
    }
  });
});

test('ALLOWED_FILES: 走査対象に存在しない path の除外はエラー（期限切れ検知）', () => {
  withFixture({ 'scripts/ok.mjs': CLEAN_SOURCE }, (dir) => {
    const { errors } = checkControlCharacters({
      root: dir,
      allowedFiles: new Map([['scripts/gone.mjs', '昔あったファイル']]),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /期限切れの除外/);
  });
});

test('formatViolationLines: 1 ファイルあたりの出力を上限で切り、残件をサマリにする', () => {
  const hits = Array.from({ length: 12 }, (_, i) => ({
    file: 'scripts/many.mjs',
    line: i + 1,
    column: 1,
    offset: i,
    code: 0x00,
    name: 'NUL',
  }));
  const lines = formatViolationLines(hits, 5);
  assert.equal(lines.length, 6, '5 行 + 残件サマリ 1 行');
  assert.match(lines[5], /ほか 7 件/);
  assert.match(lines[5], /全 12 件/);
});

// ---- 読み取り前ガード（追跡 symlink / サイズ上限）: #2055 追補 ----
//
// scripts/validate-plugin-manifest.mjs（RA-1）は同じ `git ls-files` 列挙に対して
// `lstat` + `isFile()` + サイズ上限を既に持っていたが、この script は初版でそれを
// 持っていなかった。一時 git リポジトリに symlink を 1 本 commit して直接呼んだ実測
// （2026-09-04、修正前）:
//   - /dev/zero へのリンク        → readFileSync が返らない（45 秒で強制終了 / exit 124）
//   - リポジトリ外ファイルへのリンク → 黙って読む（scanned=2 に計上される）
//   - ディレクトリへのリンク        → EISDIR エラーで exit 1 の誤検出
// 以下はその 3 経路とサイズ上限の回帰テストで、対照群（通常ファイルは従来どおり検出）を伴う。

test('ガード: 追跡 symlink（リポジトリ内の通常ファイル向け）は走査せず skip する', () => {
  withFixture(
    { 'src/real.mjs': NUL_SOURCE },
    (dir) => {
      const { violations, errors, scanned, skipped } = checkControlCharacters({ root: dir });
      // symlink を辿ると同じ実体を 2 回走査し、違反も 2 件になる。
      assert.deepEqual(
        violations.map((v) => v.file),
        ['src/real.mjs']
      );
      assert.equal(scanned, 1);
      assert.deepEqual(skipped, ['src/link.mjs']);
      assert.deepEqual(errors, []);
    },
    { 'src/link.mjs': 'real.mjs' }
  );
});

test('ガード: 追跡 symlink（リポジトリ外のファイル向け）は読まない', () => {
  withOutsideFile(NUL_SOURCE, (outside) => {
    withFixture(
      { 'src/ok.mjs': CLEAN_SOURCE },
      (dir) => {
        const { violations, errors, scanned, skipped } = checkControlCharacters({ root: dir });
        // リポジトリ外の内容が 1 バイトでも読まれていたら violation として現れる。
        assert.deepEqual(violations, [], 'リポジトリ外のファイルが読まれている');
        assert.equal(scanned, 1, 'リポジトリ外のファイルが走査に計上されている');
        assert.deepEqual(skipped, ['src/outside-link.mjs']);
        assert.deepEqual(errors, []);
      },
      { 'src/outside-link.mjs': outside }
    );
  });
});

test('ガード: 追跡 symlink（ディレクトリ向け）はエラーにならず skip する', () => {
  withFixture(
    { 'sub/ok.mjs': CLEAN_SOURCE },
    (dir) => {
      const { errors, scanned, skipped } = checkControlCharacters({ root: dir });
      // 修正前は EISDIR で errors が 1 件立ち、CLI が exit 1 の誤検出になっていた。
      assert.deepEqual(errors, []);
      assert.equal(scanned, 1);
      assert.deepEqual(skipped, ['dir-link']);
      const { status } = runIn(dir);
      assert.equal(status, 0);
    },
    { 'dir-link': 'sub' }
  );
});

test('ガード: 追跡 symlink（キャラクタデバイス向け）でも有限時間で終了する', (t) => {
  // /dev/zero が無い環境（Windows など）では検証できないので skip する。
  if (!existsSync('/dev/zero')) {
    t.skip('/dev/zero が無い環境');
    return;
  }
  withFixture(
    { 'src/ok.mjs': CLEAN_SOURCE },
    (dir) => {
      // ガードが無いと readFileSync が返らないため、必ず子プロセス + timeout で測る
      // （インプロセスで呼ぶと、失敗時にテストランナーごとハングする）。
      let result;
      try {
        const stdout = execFileSync('node', [SCRIPT], {
          cwd: dir,
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 30_000,
        });
        result = { status: 0, stdout };
      } catch (e) {
        assert.ok(
          !e.killed && e.signal !== 'SIGTERM',
          `30 秒以内に終了しなかった（キャラクタデバイスを読んでいる）: ${e.message}`
        );
        assert.equal(typeof e.status, 'number', `想定外の失敗: ${e.message}`);
        result = { status: e.status, stdout: String(e.stdout ?? '') };
      }
      assert.equal(result.status, 0);
      assert.match(result.stdout, /\(skipped\) dev-zero-link/);
    },
    { 'dev-zero-link': '/dev/zero' }
  );
});

test('ガード: サイズ上限を超えるファイルは読まずにエラーにする（fail-safe）', () => {
  // 実際に 8 MiB を書かずに済むよう、上限を注入して経路だけを検証する。
  withFixture({ 'src/ok.mjs': CLEAN_SOURCE, 'src/big.mjs': NUL_SOURCE }, (dir) => {
    const { violations, errors, scanned } = checkControlCharacters({
      root: dir,
      maxBytes: 5,
    });
    // 上限超過は skip（黙って検査から外れる）ではなくエラーにする。RA-1 と同じ扱い。
    assert.equal(scanned, 0);
    assert.deepEqual(violations, []);
    assert.equal(errors.length, 2, `errors=${JSON.stringify(errors)}`);
    for (const err of errors) {
      assert.match(err, /走査上限 5 バイトを超えている/);
    }
  });
  // 既定値は package-lock.json（2026-09-04 実測で 859,422 バイト）が自然に育っても
  // 必須チェックを落とさない大きさにしてある。
  assert.equal(MAX_TARGET_BYTES, 8 * 1024 * 1024);
});

test('対照群: symlink が混ざっていても通常ファイルの違反は従来どおり検出する', () => {
  withFixture(
    { 'scripts/bad.mjs': NUL_SOURCE, 'src/ok.mjs': CLEAN_SOURCE },
    (dir) => {
      const { status, stderr } = runIn(dir);
      assert.equal(status, 1);
      assert.ok(stderr.includes('scripts/bad.mjs'), 'scripts/bad.mjs が報告されていない');
    },
    { 'src/link.mjs': 'ok.mjs' }
  );
});

test('CLI: エラーと違反が同時に起きても違反を隠さない', () => {
  withFixture({ 'scripts/bad.mjs': NUL_SOURCE }, (dir) => {
    // 存在しない path の除外を混ぜてエラーを 1 件作る。
    const { violations, errors } = checkControlCharacters({
      root: dir,
      allowedFiles: new Map([['scripts/gone.mjs', '期限切れ']]),
    });
    assert.equal(violations.length, 1, '違反は握り潰されない');
    assert.equal(errors.length, 1);
  });
});
