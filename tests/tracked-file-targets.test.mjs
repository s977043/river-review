import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyTrackedTarget } from '../scripts/lib/tracked-file-targets.mjs';

// scripts/lib/tracked-file-targets.mjs は scripts/check-control-characters.mjs と
// scripts/validate-plugin-manifest.mjs（RA-1）が共有する読み取り前ガードの SSoT。
// 両利用者側の振る舞いは各々のテストが押さえているので、ここは
// 「利用者を通しては測れない契約」だけを対象にする。
//
// その筆頭が `maxBytes` の必須性である。2 つの利用者は別々の上限を持つ
// （RA-1 = 1 MiB、制御文字チェック = 8 MiB）ため、この関数は既定値を持たない。
// 既定値を置くと引数を省いた 3 番目の利用者が黙ってその値を踏み、8 MiB を想定した
// 呼び出し元では package-lock.json が育った時点で必須チェックが落ちる。
// 利用者側のテストは常に上限を渡すので、この契約は利用者を通しては測れない。

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-targets-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('classifyTrackedTarget: maxBytes は必須（省略・非数値は TypeError）', () => {
  withTempDir((dir) => {
    const abs = join(dir, 'file.txt');
    writeFileSync(abs, 'x');
    for (const bad of [undefined, null, '1024', NaN, Infinity, -1]) {
      assert.throws(
        () => classifyTrackedTarget(abs, bad),
        /maxBytes は必須の非負数/,
        `maxBytes=${String(bad)} を受け入れてしまっている`
      );
    }
    assert.deepEqual(classifyTrackedTarget(abs, 1024), { kind: 'file', size: 1 });
  });
});

test('classifyTrackedTarget: 通常ファイル / symlink / ディレクトリ / 上限超過を区別する', () => {
  withTempDir((dir) => {
    const real = join(dir, 'real.txt');
    writeFileSync(real, 'hello');
    mkdirSync(join(dir, 'sub'));
    symlinkSync(real, join(dir, 'link.txt'));

    assert.equal(classifyTrackedTarget(real, 1024).kind, 'file');
    // lstat なので symlink は辿らず symlink として判定される。
    assert.equal(classifyTrackedTarget(join(dir, 'link.txt'), 1024).kind, 'skip');
    assert.equal(classifyTrackedTarget(join(dir, 'sub'), 1024).kind, 'skip');

    const oversize = classifyTrackedTarget(real, 4);
    assert.equal(oversize.kind, 'oversize');
    assert.equal(oversize.size, 5);
    // 境界: ちょうど上限と等しいサイズは超過ではない。
    assert.equal(classifyTrackedTarget(real, 5).kind, 'file');
  });
});
