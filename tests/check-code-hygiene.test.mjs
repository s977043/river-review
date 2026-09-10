import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFile, packageBaseOf } from '../scripts/check-code-hygiene.mjs';

// check-code-hygiene.mjs のガード挙動を、一時 fixture を cwd にして実プロセス実行で検証する。
// positive（検出される）と negative（誤検出しない canary）の両方を持つ
// （.claude/rules/review-core.md の責務分界 #1070）。
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'check-code-hygiene.mjs'
);

function runIn(dir) {
  try {
    execFileSync('node', [SCRIPT], { cwd: dir, stdio: 'pipe' });
    return 0;
  } catch (e) {
    if (typeof e.status === 'number') return e.status;
    throw e;
  }
}

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-hygiene-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

test('duplicate-import: 同一モジュールからの重複 import を検出して exit 1', () => {
  const dir = fixture({
    'src/a.mjs': "import { x } from 'node:fs';\nimport { y } from 'node:fs';\nexport { x, y };\n",
  });
  try {
    assert.equal(runIn(dir), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('duplicate-import: 複数行 import でも検出する（exit 1）', () => {
  const dir = fixture({
    'src/a.mjs':
      "import { x } from 'node:fs';\nimport {\n  y,\n  z,\n} from 'node:fs';\nexport { x, y, z };\n",
  });
  try {
    assert.equal(runIn(dir), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('duplicate-import canary: 別モジュール / コメント行 / side-effect import は誤検出しない', () => {
  const dir = fixture({
    'src/a.mjs':
      "// import { y } from 'node:fs';\nimport { x } from 'node:fs';\nimport { p } from 'node:path';\nimport './side-effect.mjs';\nexport { x, p };\n",
    'src/side-effect.mjs': 'export {};\n',
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tmp-literal: tests/** の /tmp ハードコードを検出して exit 1', () => {
  const dir = fixture({
    'tests/a.test.mjs': "const p = '/tmp/out.json';\nexport { p };\n", // code-hygiene-ignore
  });
  try {
    assert.equal(runIn(dir), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tmp-literal canary: os.tmpdir() 使用 / コメント内 / 抑制コメント / tests 外は誤検出しない', () => {
  const dir = fixture({
    'tests/a.test.mjs':
      "import { tmpdir } from 'node:os';\nimport { join } from 'node:path';\n// '/tmp' はコメント内なので対象外\nconst ok = join(tmpdir(), 'out.json');\nconst intentional = '/tmp/legacy'; // code-hygiene-ignore\nexport { ok, intentional };\n",
    'src/b.mjs': "export const p = '/tmp/in-src-is-out-of-scope';\n", // code-hygiene-ignore
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mkdtemp-cleanup: cleanup の無い mkdtempSync を検出して exit 1', () => {
  const dir = fixture({
    'tests/a.test.mjs':
      "import { mkdtempSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { join } from 'node:path';\nexport const d = mkdtempSync(join(tmpdir(), 'x-'));\n",
  });
  try {
    assert.equal(runIn(dir), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mkdtemp-cleanup canary: rmSync / t.after / finally があれば pass（exit 0）', () => {
  const dir = fixture({
    'tests/a.test.mjs':
      "import { mkdtempSync, rmSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { join } from 'node:path';\nconst d = mkdtempSync(join(tmpdir(), 'x-'));\nrmSync(d, { recursive: true, force: true });\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fixtures ディレクトリ配下は scan 対象外（exit 0）', () => {
  const dir = fixture({
    'tests/fixtures/bad.mjs':
      "import { x } from 'node:fs';\nimport { y } from 'node:fs';\nconst p = '/tmp/x';\nexport { x, y, p };\n", // code-hygiene-ignore
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// gemini #1382 指摘: ドットディレクトリ（.git 等）は extOf が拡張子と誤判定して
// ディレクトリ段階の prune に失敗し、内部まで再帰走査していた。Dirent ベースの
// prune で、scan dir 内の .git / node_modules がディレクトリ段階で除外されることを固定する。
test('scan dir 内の .git ディレクトリはディレクトリ段階で prune される（exit 0）', () => {
  const dir = fixture({
    'src/.git/bad.mjs':
      "import { x } from 'node:fs';\nimport { y } from 'node:fs';\nexport { x, y };\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan dir 内の node_modules ディレクトリは prune される（exit 0）', () => {
  const dir = fixture({
    'src/node_modules/pkg/bad.mjs':
      "import { x } from 'node:fs';\nimport { y } from 'node:fs';\nexport { x, y };\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// phantom-dep（#1401）: src/lib/** の import が package.json の dependencies に
// 未宣言なら exit 1。fixture に package.json を置いて deps を制御する。
const PKG = (deps) => JSON.stringify({ name: 'fx', dependencies: deps });

test('phantom-dep: src/lib/** の未宣言 import を検出して exit 1', () => {
  const dir = fixture({
    'package.json': PKG({}),
    'src/lib/a.mjs': "import YAML from 'yaml';\nexport default YAML;\n",
  });
  try {
    assert.equal(runIn(dir), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phantom-dep canary: 宣言済み dep / scope 付き / node builtin / 相対 import は誤検出しない（exit 0）', () => {
  const dir = fixture({
    'package.json': PKG({ yaml: '^2.9.0', '@scope/pkg': '^1.0.0' }),
    'src/lib/a.mjs':
      "import YAML from 'yaml';\nimport { z } from '@scope/pkg';\nimport { readFileSync } from 'node:fs';\nimport { local } from './b.mjs';\nimport sub from 'yaml/util';\nexport { YAML, z, readFileSync, local, sub };\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phantom-dep canary: src/lib 外（src/components 等）の未宣言 import は対象外（exit 0）', () => {
  const dir = fixture({
    'package.json': PKG({}),
    'src/components/Widget.mjs':
      "import useData from '@docusaurus/useGlobalData';\nexport default useData;\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phantom-dep canary: package.json 不在（fixture）では phantom-dep 判定を無効化（exit 0）', () => {
  const dir = fixture({
    'src/lib/a.mjs': "import YAML from 'yaml';\nexport default YAML;\n",
  });
  try {
    assert.equal(runIn(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- in-process 単体テスト（export した純関数を直接呼ぶ。#1473 Step 5） ---
// 上の subprocess テストは canary として維持し、検出ロジックの中核関数を
// プロセス起動なしで直接検証する（境界は subprocess 側と重複させない）。

test('analyzeFile: 重複 import の無いファイルは findings 空（in-process happy）', () => {
  const found = analyzeFile(
    'src/a.mjs',
    "import { x } from 'node:fs';\nimport { p } from 'node:path';\nexport { x, p };\n",
    null
  );
  assert.deepEqual(found.duplicateImports, []);
  assert.deepEqual(found.tmpLiterals, []);
  assert.deepEqual(found.mkdtempNoCleanup, []);
  assert.deepEqual(found.phantomDeps, []);
});

test('analyzeFile: 同一モジュールの重複 import を 1 件検出（in-process violation）', () => {
  const found = analyzeFile(
    'src/a.mjs',
    "import { x } from 'node:fs';\nimport { y } from 'node:fs';\nexport { x, y };\n",
    null
  );
  assert.equal(found.duplicateImports.length, 1);
  assert.equal(found.duplicateImports[0].spec, 'node:fs');
});

test('packageBaseOf: パッケージ名の抽出と対象外（相対 / builtin）判定（in-process）', () => {
  assert.equal(packageBaseOf('yaml'), 'yaml');
  assert.equal(packageBaseOf('@scope/pkg/sub'), '@scope/pkg');
  assert.equal(packageBaseOf('./local.mjs'), null);
  assert.equal(packageBaseOf('node:fs'), null);
});

// -----------------------------------------------------------------------------
// heredoc-size（#2144）
// -----------------------------------------------------------------------------
// homebrew の bash 5.3.15 は本体が 512 バイトを超える heredoc で決定論的に
// deadlock する。#1951 が 3 本を printf へ書き換えたがガードを残さず、16 日後に
// 追加された scripts/pr-unstall.sh で再発した。境界（510 は通り 520 は止まる）は
// #2144 のコメントに実測を残してある。
const heredoc = (bytes) => `#!/usr/bin/env bash\ncat >&2 <<PROBE\n${'x'.repeat(bytes)}\nPROBE\n`;

test('heredoc-size: 512 バイトを超える heredoc を検出する（exit 1）', () => {
  const dir = fixture({ 'scripts/probe.sh': heredoc(600) });
  assert.equal(runIn(dir), 1);
});

test('heredoc-size canary: 帯の下 / コメント内の <<EOF / 終端なしは誤検出しない（exit 0）', () => {
  const dir = fixture({
    'scripts/small.sh': heredoc(400),
    // 手当ての経緯を書いたコメントには `cat >&2 <<EOF` という**説明のための
    // 文字列**が残る。素朴に正規表現を当てるとこれを実物として数えてしまう
    // （2026-09-09 に自作の計測スクリプトで実際に踏んだ）。
    // コメント除外を外すと、この行の `<<EOF` から下の 600 バイトが heredoc の
    // 本体として数えられ、閾値を超えて検出される。**本文の量が閾値を超えて
    // いないと、この canary は除外の有無を弁別できない。**
    'scripts/commented.sh':
      '#!/usr/bin/env bash\n' +
      '# 以下は #1950 まで `cat >&2 <<EOF` の heredoc だった。printf へ書き換え済み\n' +
      `printf '%s\\n' '${'y'.repeat(600)}'\n` +
      'EOF\n',
    // 終端タグが無い行は heredoc ではない（`echo a << b` のような誤解析を防ぐ）。
    'scripts/unterminated.sh': "#!/usr/bin/env bash\necho 'a <<NOPE b'\n",
  });
  assert.equal(runIn(dir), 0);
});
