#!/usr/bin/env node
// bot レビュー頻出指摘の機械化ガード。
// Copilot / gemini が PR レビューで繰り返し指摘してきた 3 class を lint で決定論的に検出する:
//
//   1. duplicate-import: 同一モジュール指定子からの重複 import（#1343 で 4 件指摘）
//   2. tmp-literal: tests/** での '/tmp' ハードコード文字列
//      （Windows 非対応 + テスト間干渉の flake 源。#1346 で両 bot が同一指摘）
//      → mkdtempSync(path.join(os.tmpdir(), 'prefix-')) を使う
//   3. mkdtemp-cleanup: tests/** で mkdtemp / mkdtempSync を使うのに、
//      cleanup（rm / rmSync / after / finally）が同一ファイルに 1 つも無い
//      （#1335 ×2、#1375 で再発）
//   5. heredoc-size: シェルスクリプトの heredoc 本体が 512 バイトを超える
//      （homebrew の bash 5.3.15 は本体が 512B を超える heredoc で決定論的に
//      deadlock する。#1951 が 3 本を printf へ書き換えたがガードを残さず、
//      16 日後に追加された scripts/pr-unstall.sh で再発した = #2144）
//      → printf '%s\n' の連なりへ置き換える
//   4. phantom-dep: src/lib/** の import が package.json の dependencies に
//      未宣言（transitive 依存に依存する phantom dependency）。src/lib は
//      publish/bundle される production コードなので、直接 import は必ず
//      dependencies に宣言されていなければ transitive 依存の消失で壊れる（#1401）
//
// 誤検出（false-positive）は tests/check-code-hygiene.test.mjs の canary で回帰防止する
// （.claude/rules/review-core.md の責務分界 #1070 に従う）。
// 意図的な '/tmp' リテラルは行末に `code-hygiene-ignore` コメントで抑制できる。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isBuiltin } from 'node:module';
import { isDirectRun } from './lib/is-direct-run.mjs';

const ROOT = process.cwd();

// package.json の production dependencies（phantom-dep 判定の許可リスト）。
// package.json が無い場所（テスト fixture 等）では空集合とし、phantom-dep 判定を
// 事実上スキップする（src/lib/** が存在しなければどのみち走らない）。
function loadDeclaredDeps() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return new Set(Object.keys(pkg.dependencies ?? {}));
  } catch {
    return null; // package.json 不在 → phantom-dep 判定を無効化
  }
}
const DECLARED_DEPS = loadDeclaredDeps();

// phantom-dep を判定する scope。src/lib は CLI 本体の production ライブラリで、
// site（src/components の docusaurus）や生成物（dist）を含めると外部提供前提の
// import が false-positive になるため、意図的に src/lib のみに絞る。
const PHANTOM_SCAN_PREFIX = `src${sep}lib${sep}`;

// import 指定子から npm パッケージ名（scope 付きは @scope/pkg）を取り出す。
// 相対 / 絶対 / node: builtin は対象外（null を返す）。
export function packageBaseOf(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || isBuiltin(spec)) return null;
  const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (isBuiltin(base)) return null;
  return base;
}

const SCAN_DIRS = ['src', 'scripts', 'tests', 'tools', 'runners'];
// heredoc-size の走査対象。実行されるシェルスクリプトだけを見る。
const SHELL_SCAN_DIRS = ['scripts', 'hooks', join('.claude', 'hooks')];
const SHELL_EXTS = new Set(['.sh', '.bash']);
// bash 5.3.15（homebrew）が deadlock する下限。510 は通り 520 は止まる実測から、
// 既知の記述（#1951）と合わせて 512 を境界にする。
const HEREDOC_MAX_BYTES = 512;
const EXTS = new Set(['.mjs', '.js', '.cjs']);
// 除外 path（生成物 / 依存 / 意図的 fixture / worktree）
const EXCLUDE = [
  'node_modules',
  `.git${sep}`,
  `.claude${sep}worktrees`,
  `${sep}dist${sep}`,
  `${sep}build${sep}`,
  `${sep}fixtures${sep}`,
  `${sep}__fixtures__${sep}`,
];

// import 文（from 付きのみ。side-effect import は対象外）。
// 複数行 import（named import の改行）も [^'"] が改行を跨ぐため一致する。
const IMPORT_RE = /^import\s[^'"]*?from\s*['"]([^'"]+)['"]/gm;

// クォート直後に /tmp が続くリテラル（'/tmp' そのもの、'/tmp/...' の両方）
const TMP_LITERAL_RE = /['"`]\/tmp(?=[/'"`])/;

const MKDTEMP_RE = /\bmkdtemp(?:Sync)?\s*\(/;
const CLEANUP_RE = /\brmSync\s*\(|\brm\s*\(|\bafter\s*\(|\.after\s*\(|\bfinally\b/;

// 判定は ROOT からの相対 path で行う（絶対 path だと、repo 自体が
// .claude/worktrees/ 配下にある worktree で全ファイルが除外されてしまう）。
// ディレクトリは末尾に sep を付けて判定するため、呼び出し側で dir か file かを
// Dirent.isDirectory() で確定させてから渡す（`.git` 等のドットディレクトリを
// 拡張子と誤認しない）。
function isExcluded(relPath) {
  return EXCLUDE.some((e) => relPath.includes(e));
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i);
}

function* walk(dir) {
  let entries;
  try {
    // withFileTypes で Dirent を得て、statSync のファイル毎 I/O を排除する。
    // isDirectory() で確実に判定するため、`.git` / `.claude` / `node_modules`
    // 等のドットディレクトリもディレクトリ段階で確実に prune できる。
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full);
    if (entry.isDirectory()) {
      // ディレクトリは末尾 sep 付きで prune 判定（`.git${sep}` 等と整合）
      if (isExcluded(rel + sep)) continue;
      yield* walk(full);
    } else if (entry.isFile() && EXTS.has(extOf(entry.name))) {
      if (isExcluded(rel)) continue;
      yield full;
    }
  }
}

function collectFiles() {
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d);
    try {
      if (statSync(abs).isDirectory()) files.push(...walk(abs));
    } catch {
      /* dir absent: skip */
    }
  }
  return files;
}

/**
 * シェルスクリプトの heredoc 本体のバイト数を測る。
 *
 * **コメント行と行内コメントは走査しない。** 手当ての経緯を書いたコメントには
 * `cat >&2 <<EOF` のような**説明のための文字列**が残っており、素朴に正規表現を
 * 当てるとそれを実物の heredoc として数えてしまう（2026-09-09 に実際に踏んだ）。
 *
 * @param {string} rel repo からの相対パス
 * @param {string} text ファイル内容
 * @returns {{file: string, line: number, tag: string, bytes: number}[]}
 */
function findLargeHeredocs(rel, text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // コメントを落としてから探す。行頭コメントも行内コメントも同じ扱いでよい
    // （行頭コメントは `split('#')[0]` が空文字になる）。判定を 1 本にしておくと、
    // canary が「除外が効いているか」を 1 つの変異で弁別できる。
    const code = line.split('#')[0];
    const m =
      /<<-?\s*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(
        code
      );
    if (!m) continue;
    const tag = m[1] ?? m[2] ?? m[3];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== tag) j++;
    if (j >= lines.length) continue; // 終端が見つからない: heredoc ではない
    let bytes = 0;
    for (let k = i + 1; k < j; k++) bytes += Buffer.byteLength(lines[k], 'utf8') + 1;
    if (bytes > HEREDOC_MAX_BYTES) out.push({ file: rel, line: i + 1, tag, bytes });
    i = j;
  }
  return out;
}

function collectShellFiles() {
  const files = [];
  for (const d of SHELL_SCAN_DIRS) {
    const abs = join(ROOT, d);
    try {
      if (!statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of readdirSync(abs)) {
      const ext = name.slice(name.lastIndexOf('.'));
      if (SHELL_EXTS.has(ext)) files.push(join(abs, name));
    }
  }
  return files;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

// ファイル 1 つ分の検出を行う純関数。CLI 実行時は main() から、in-process
// テストからは直接呼び出せるよう export する（rel: ROOT からの相対 path、
// declaredDeps: production dependencies の Set か null）。
export function analyzeFile(rel, text, declaredDeps) {
  const duplicateImports = [];
  const tmpLiterals = [];
  const mkdtempNoCleanup = [];
  const phantomDeps = [];

  const isTestFile = rel.startsWith(`tests${sep}`);

  // import 文は 1 度だけ materialize し、Check 1 / Check 4 で共有する
  // （同一 IMPORT_RE の二重 matchAll を避ける）。
  const imports = [...text.matchAll(IMPORT_RE)];

  // Check 1: duplicate imports（全 scan 対象）
  const seen = new Map();
  for (const m of imports) {
    const spec = m[1];
    const line = lineOf(text, m.index);
    if (seen.has(spec)) {
      duplicateImports.push({ file: rel, line, spec, first: seen.get(spec) });
    } else {
      seen.set(spec, line);
    }
  }

  // Check 4: phantom-dep（src/lib/** の import が dependencies 未宣言）
  if (declaredDeps != null && rel.startsWith(PHANTOM_SCAN_PREFIX)) {
    for (const m of imports) {
      const base = packageBaseOf(m[1]);
      if (base == null || declaredDeps.has(base)) continue;
      phantomDeps.push({ file: rel, line: lineOf(text, m.index), pkg: base });
    }
  }

  if (isTestFile) {
    // Check 2: tests/** の '/tmp' リテラル（コメント行と明示抑制行は除外）
    text.split('\n').forEach((line, idx) => {
      if (isCommentLine(line)) return;
      if (line.includes('code-hygiene-ignore')) return;
      if (TMP_LITERAL_RE.test(line)) {
        tmpLiterals.push({ file: rel, line: idx + 1, text: line.trim() });
      }
    });

    // Check 3: tests/** の mkdtemp なのに cleanup 無し（ファイル単位）
    if (MKDTEMP_RE.test(text) && !CLEANUP_RE.test(text)) {
      mkdtempNoCleanup.push({ file: rel });
    }
  }

  return { duplicateImports, tmpLiterals, mkdtempNoCleanup, phantomDeps };
}

function main() {
  const duplicateImports = [];
  const tmpLiterals = [];
  const mkdtempNoCleanup = [];
  const phantomDeps = [];

  for (const file of collectFiles()) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(ROOT, file);
    const found = analyzeFile(rel, text, DECLARED_DEPS);
    duplicateImports.push(...found.duplicateImports);
    tmpLiterals.push(...found.tmpLiterals);
    mkdtempNoCleanup.push(...found.mkdtempNoCleanup);
    phantomDeps.push(...found.phantomDeps);
  }

  const largeHeredocs = [];
  for (const file of collectShellFiles()) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    largeHeredocs.push(...findLargeHeredocs(relative(ROOT, file), text));
  }

  let hasError = false;

  if (duplicateImports.length > 0) {
    console.error(
      `❌ duplicate-import: 同一モジュールからの重複 import を ${duplicateImports.length} 件検出:`
    );
    for (const v of duplicateImports) {
      console.error(
        `  ${v.file}:${v.line}  '${v.spec}'（初出: line ${v.first}）→ 1 つの import 文に統合してください`
      );
    }
    hasError = true;
  }

  if (tmpLiterals.length > 0) {
    console.error(
      `\n❌ tmp-literal: tests/** の '/tmp' ハードコードを ${tmpLiterals.length} 件検出:`
    );
    for (const v of tmpLiterals) {
      console.error(`  ${v.file}:${v.line}  ${v.text}`);
    }
    console.error(
      "\n実 FS を使う場合は mkdtempSync(path.join(os.tmpdir(), 'prefix-'))、純粋な fixture 文字列も path.join(os.tmpdir(), ...) を使ってください。"
    );
    console.error('意図的な場合は行末に // code-hygiene-ignore を付けて抑制できます。');
    hasError = true;
  }

  if (mkdtempNoCleanup.length > 0) {
    console.error(
      `\n❌ mkdtemp-cleanup: mkdtemp を使うのに cleanup が無いテストを ${mkdtempNoCleanup.length} 件検出:`
    );
    for (const v of mkdtempNoCleanup) {
      console.error(
        `  ${v.file}  → rmSync(dir, { recursive: true, force: true }) を t.after() / finally で必ず実行してください`
      );
    }
    hasError = true;
  }

  if (phantomDeps.length > 0) {
    console.error(`\n❌ phantom-dep: src/lib/** の未宣言 import を ${phantomDeps.length} 件検出:`);
    for (const v of phantomDeps) {
      console.error(
        `  ${v.file}:${v.line}  '${v.pkg}' は package.json の dependencies 未宣言（transitive 依存頼み）`
      );
    }
    console.error(
      '\n直接 import するパッケージは package.json の dependencies に宣言してください（transitive 依存の消失で production が壊れます）。'
    );
    hasError = true;
  }

  if (largeHeredocs.length > 0) {
    console.error(
      `\n❌ heredoc-size: ${HEREDOC_MAX_BYTES} バイトを超える heredoc を ${largeHeredocs.length} 件検出:`
    );
    for (const v of largeHeredocs) {
      console.error(`  ${v.file}:${v.line}  <<${v.tag} の本体が ${v.bytes} バイト`);
    }
    console.error(
      '\nhomebrew の bash 5.3.15 は本体が 512 バイトを超える heredoc で決定論的に deadlock します（#2144）。' +
        "printf '%s\\n' の連なりへ置き換えてください（#1951 と同じ書き換え）。"
    );
    hasError = true;
  }

  if (hasError) process.exit(1);

  console.log(
    '✅ code hygiene OK（duplicate-import / tmp-literal / mkdtemp-cleanup / phantom-dep / heredoc-size）'
  );
}

if (isDirectRun(import.meta.url)) {
  main();
}
