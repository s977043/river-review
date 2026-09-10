#!/usr/bin/env node
// ソースへの C0 制御文字混入ガード（#2055）。
//
// 背景: PR #2050 の実装中に scripts/validate-plugin-manifest.mjs へ 1 バイトの NUL(U+0000)
// が混入した。`'\0'` というエスケープ列（2 文字）を書いたつもりが制御文字そのものが
// 入った形で、**機能面の影響はゼロ**（NUL も未知の 1 文字なので挙動は変わらない）だった。
// 壊れたのは検索性で、NUL を含むファイルは grep / ripgrep がバイナリと判定して
// 黙って走査対象から外す。実測（2026-09-04、混入していた間）:
//     $ file scripts/validate-plugin-manifest.mjs
//     scripts/validate-plugin-manifest.mjs: data
//     $ grep -c ra1Sink scripts/validate-plugin-manifest.mjs   # 出力なし / exit 1
// つまり 651 行のコードが検索へ一切映らない。探す人やエージェントは「存在しない」と
// 結論する。npm test / prettier / markdownlint / textlint / meta:validate はすべて素通しした。
//
// 判定は完全に決定論で、誤検出の余地がほぼない。docs/development/improvement-flow.md の
// 「mechanical に検証できるか」基準に従い、散文でなく script + 必須 CI（Meta consistency）へ倒す。
//
// 設計上の決定（PR 本文と同じ内容をここにも残す）:
//   1. 対象 pathspec: **git 追跡ファイル全部から、明示した除外だけを引く**（許可リストではない）。
//      初版は scripts/ src/ tests/ の許可リストだったが、それでは skills/ commands/ agents/
//      runners/ .github/ とルート直下の設定ファイルがまるごと無防備で、しかも
//      「新しいディレクトリが増えても誰も気づかない」形だった。とくに skills/ は
//      Skill Registry 本体でエージェントが最も grep する場所であり、tests/ を含める
//      根拠（「事故の本質は grep から消えること」）がそのまま、より強く当てはまる。
//      除外は 2 つだけ:
//        - assets/          … バイナリ資産の置き場（PNG などが正当に存在する）
//        - runners/github-action/dist/ … ncc の生成物。人手の編集対象ではなく、
//          ビルド元の runners/github-action/src/ は走査対象に入っている
//      件数はここに書かない（このコメントは check-doc-enumerations.mjs の検査対象外で、
//      書けばドリフトするため）。走査した実件数は毎回の実行サマリ（"N ファイル走査"）が出す。
//      対象を測り直すコマンド:
//        git ls-files -- . ':(exclude)assets/' ':(exclude)runners/github-action/dist/' | wc -l
//   2. 許可する制御文字: TAB(0x09) / LF(0x0A) / CR(0x0D) のみ。
//      それ以外の C0（0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F）と DEL(0x7F) を違反とする。
//      これは grep/ripgrep がバイナリ判定へ倒す条件に合わせた最小集合で、
//      NFC 正規化や全角/半角の統一（#2055 の Non-goals）には踏み込まない。
//   3. 非 UTF-8 / バイナリの扱い: 本チェックは **生バイト**を見るので UTF-8 デコードをしない。
//      除外していない場所にバイナリが置かれれば違反として落ちるが、それは意図した挙動である
//      （バイナリ資産は assets/ に置くのがこのリポジトリの方針）。どうしても他所に置く必要が
//      あるなら ALLOWED_FILES に理由付きで宣言する。
//   4. 列挙基準: `git ls-files`。`find` や再帰 readdir は .claude/worktrees/ の
//      フルコピーを拾ってしまうため使わない（ADR-009 D3-3 項番 1 / RA-1 実装と同じ理由）。
//   5. 読み取り前のガード: 列挙とガードは scripts/lib/tracked-file-targets.mjs へ寄せ、
//      RA-1（scripts/validate-plugin-manifest.mjs）と同じ実装を import する。
//      初版はこのガードを持っておらず、追跡 symlink 経由で 3 つの事故が起きる状態だった
//      （2026-09-04 実測。詳細は tracked-file-targets.mjs の冒頭コメント）。
//      通常ファイル以外（symlink / gitlink / ディレクトリ）は skip し、
//      サイズ上限超過は fail-safe でエラーにする。
//
// 意図的に制御文字を含む文字列をテストしたい場合は、生バイトではなく
// エスケープ列（'skill\u0000id'）で書く。実行時の文字列は同じで、ファイルはテキストのまま残る。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { isDirectRun } from './lib/is-direct-run.mjs';
import { classifyTrackedTarget, listTrackedPaths } from './lib/tracked-file-targets.mjs';

/**
 * 走査対象の git pathspec。「全部から除外を引く」形にしてあるので、
 * 新しいトップレベルディレクトリが増えても自動で保護対象に入る。
 */
export const SCAN_PATHSPECS = Object.freeze([
  '.',
  ':(exclude)assets/',
  ':(exclude)runners/github-action/dist/',
]);

/** 実行サマリに出す、人間向けの scope 表記。 */
const SCOPE_LABEL =
  '追跡ファイル全部 − assets/ − runners/github-action/dist/ − 通常ファイル以外（symlink / gitlink）';

/** 1 ファイルあたり stderr へ出す違反行の上限（超過分は件数だけ出す）。 */
export const MAX_VIOLATION_LINES_PER_FILE = 5;

/**
 * 走査する 1 ファイルの上限バイト数。超過は読まずにエラーとする（fail-safe）。
 *
 * RA-1 の `RA1_MAX_TARGET_BYTES`（1 MiB）と同じ**扱い**（超過 = エラー）にしつつ、
 * **値だけ** 8 MiB へ上げてある。RA-1 の対象は `RA1_TARGET_PATHSPECS`
 * （`.claude/**` / `.codex/**` / `.claude-plugin/*.json` / `.codex-plugin/*.json`）が示す
 * host 固有ファイルで、2026-09-04 実測で 46 件・最大 15,234 バイト（`.claude/commands/merge-check.md`）。
 * `skills/` は RA-1 の対象ではなく `RA1_SSOT_PREFIXES` 側、つまり参照される側にあたる。
 * 一方こちらは追跡ファイル全部が対象で、既に package-lock.json が 859,422 バイト（2026-09-04 実測、
 * `git ls-files -z -- . ':(exclude)assets/' ':(exclude)runners/github-action/dist/' | xargs -0 stat -f '%z %N' | sort -rn | head -1`）
 * ある。1 MiB では lockfile が自然に育つだけで必須チェック `Meta consistency` が落ちる。
 * 8 MiB は現在の最大に対して約 10 倍の余裕があり、かつ 1 ファイルの線形走査を
 * job の timeout（10 分）に対して十分小さく抑える。
 * 超過を skip でなくエラーにするのは、黙って検査対象から外れる穴を作らないため
 * （どうしても必要なら ALLOWED_FILES へ理由付きで宣言する）。
 */
export const MAX_TARGET_BYTES = 8 * 1024 * 1024;

/** 許可する制御文字（TAB / LF / CR）。 */
export const ALLOWED_CONTROL_BYTES = Object.freeze([0x09, 0x0a, 0x0d]);

const ALLOWED_SET = new Set(ALLOWED_CONTROL_BYTES);

/**
 * 恒久的な例外。`<ROOT 相対 path>` → 理由。
 * 空の理由は受け付けない（理由なしの黙殺を作れないようにする）。
 * @type {Map<string, string>}
 */
export const ALLOWED_FILES = new Map();

/** 対象が 1 件も無いまま OK を返さないためのエラー文言。 */
export const NOTHING_SCANNED_ERROR =
  '走査対象が 0 件だった — git ls-files が空を返している（リポジトリ外での実行、' +
  'または SCAN_PATHSPECS の指定ミス）。「落ちない script」は目的ではないのでエラーとする';

/**
 * 1 バイトが違反かどうか。
 *
 * @param {number} code 0-255
 * @returns {boolean}
 */
export function isForbiddenByte(code) {
  if (ALLOWED_SET.has(code)) return false;
  return code < 0x20 || code === 0x7f;
}

/** 制御文字の可読名。 */
function controlName(code) {
  if (code === 0x00) return 'NUL';
  if (code === 0x0b) return 'VT';
  if (code === 0x0c) return 'FF';
  if (code === 0x1b) return 'ESC';
  if (code === 0x7f) return 'DEL';
  return `C0 U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * バッファを走査して違反位置を返す。
 *
 * 行番号は LF の数で数える（生バイト基準。CR 単独改行は行を分けない）。
 * column は「その行の先頭からのバイト数（1 始まり）」。
 *
 * @param {Buffer | Uint8Array} buffer
 * @returns {Array<{offset: number, line: number, column: number, code: number, name: string}>}
 */
export function scanBuffer(buffer) {
  const bytes = buffer;
  const found = [];
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const code = bytes[i];
    if (code === 0x0a) {
      line += 1;
      lineStart = i + 1;
      continue;
    }
    if (isForbiddenByte(code)) {
      found.push({
        offset: i,
        line,
        column: i - lineStart + 1,
        code,
        name: controlName(code),
      });
    }
  }
  return found;
}

/**
 * 走査対象のファイルを列挙する（ROOT 相対 path、ソート済み）。
 *
 * @param {string} root リポジトリ（または worktree）のルート
 * @param {readonly string[]} [pathspecs]
 * @returns {string[]}
 */
export function listTargetFiles(root, pathspecs = SCAN_PATHSPECS) {
  return listTrackedPaths(root, pathspecs, { maxBuffer: 64 * 1024 * 1024 }).sort();
}

/**
 * チェック本体。
 *
 * @param {{ root?: string, pathspecs?: readonly string[], allowedFiles?: Map<string, string>, maxBytes?: number }} [options]
 * @returns {{ violations: Array<object>, errors: string[], scanned: number, ignored: string[], skipped: string[] }}
 */
export function checkControlCharacters(options = {}) {
  const root = options.root ?? process.cwd();
  const pathspecs = options.pathspecs ?? SCAN_PATHSPECS;
  const allowedFiles = options.allowedFiles ?? ALLOWED_FILES;
  const maxBytes = options.maxBytes ?? MAX_TARGET_BYTES;

  const errors = [];
  const ignored = [];
  const skipped = [];
  for (const [file, reason] of allowedFiles) {
    // 理由は「非空の文字列」でなければならない。String(0) は '0' になり trim を
    // 素通りするので、typeof で先に弾く（数値 0 を理由として通さない）。
    if (typeof reason !== 'string' || reason.trim() === '') {
      errors.push(`ALLOWED_FILES["${file}"] に理由が書かれていない — 理由なしの除外は許可しない`);
    }
  }

  let files;
  try {
    files = listTargetFiles(root, pathspecs);
  } catch (err) {
    return {
      violations: [],
      errors: [...errors, `対象の列挙に失敗した (${err.message})`],
      scanned: 0,
      ignored,
      skipped,
    };
  }

  // 期限切れ除外の検知。実体の無い path の除外が残ると、同名ファイルが将来復活したときに
  // 黙って免除される（check-doc-enumerations.mjs が ignoreKeys に対してしているのと同じ扱い）。
  const universe = new Set(files);
  for (const file of allowedFiles.keys()) {
    if (!universe.has(file)) {
      errors.push(
        `ALLOWED_FILES["${file}"] は走査対象に存在しない — ` +
          '期限切れの除外なので削除する（残すと復活時に検査されない）'
      );
    }
  }

  const violations = [];
  let scanned = 0;
  for (const file of files) {
    if (allowedFiles.has(file)) {
      ignored.push(`${file} — ${allowedFiles.get(file)}`);
      continue;
    }
    const abs = path.join(root, file);
    let buffer;
    try {
      // 読む前に「読んでよい対象か」を判定する（RA-1 と同じ実装を import）。
      // lstat なので symlink は辿らない。追跡 symlink を辿ると (a) キャラクタデバイス
      // （/dev/zero）で readFileSync が返らず、(b) リポジトリ外のファイルを読み、
      // (c) ディレクトリで EISDIR の誤検出になる。
      const target = classifyTrackedTarget(abs, maxBytes);
      if (target.kind === 'skip') {
        skipped.push(file);
        continue;
      }
      if (target.kind === 'oversize') {
        errors.push(
          `${file}: ${target.size} バイトで走査上限 ${maxBytes} バイトを超えている — ` +
            '分割するか、ALLOWED_FILES へ理由付きで宣言する'
        );
        continue;
      }
      buffer = readFileSync(abs);
    } catch (err) {
      // 追跡されているのに読めない（sparse-checkout・symlink 切れ等）。
      // 素通しさせず、エラーとして報告する。
      errors.push(`${file}: 読み取りに失敗した (${err.message})`);
      continue;
    }
    scanned += 1;
    for (const hit of scanBuffer(buffer)) {
      violations.push({ file, ...hit });
    }
  }

  if (scanned === 0 && errors.length === 0) {
    errors.push(NOTHING_SCANNED_ERROR);
  }

  return { violations, errors, scanned, ignored, skipped };
}

/**
 * 違反をファイル単位にまとめ、1 ファイルあたり先頭 N 件だけを行として返す。
 *
 * 上限を設けるのは、対象にバイナリが 1 つ混ざるだけで数千行が stderr へ流れ、
 * CI ログが埋まって他の情報が読めなくなるため（PNG 1 枚で 8000 行超を実測）。
 *
 * @param {Array<{file: string, line: number, column: number, offset: number, code: number, name: string}>} violations
 * @param {number} [limit]
 * @returns {string[]}
 */
export function formatViolationLines(violations, limit = MAX_VIOLATION_LINES_PER_FILE) {
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  const lines = [];
  for (const [file, hits] of byFile) {
    for (const v of hits.slice(0, limit)) {
      lines.push(
        `  ${file}:${v.line}:${v.column}  byte offset ${v.offset}  ` +
          `0x${v.code.toString(16).padStart(2, '0')} (${v.name})`
      );
    }
    if (hits.length > limit) {
      lines.push(`  ${file}: ほか ${hits.length - limit} 件（同一ファイル。全 ${hits.length} 件）`);
    }
  }
  return lines;
}

function main() {
  const { violations, errors, scanned, ignored, skipped } = checkControlCharacters();

  for (const note of ignored) {
    console.log(`  (ignored) ${note}`);
  }

  // skip は黙って行わない。symlink / gitlink が追跡へ入ったこと自体は
  // 見えるようにしておく（落とさないが、気づけるようにする）。
  for (const file of skipped) {
    console.log(`  (skipped) ${file} — 通常ファイルではない（symlink / gitlink / ディレクトリ）`);
  }

  // errors があっても violations を先に出す。読めないファイル 1 件と本物の混入が
  // 同時に起きたときに、後者が見えないまま終わらせないため。
  if (violations.length > 0) {
    console.error(`❌ ソースへの C0 制御文字混入を ${violations.length} 件検出:`);
    for (const line of formatViolationLines(violations)) {
      console.error(line);
    }
    console.error('');
    console.error(
      '制御文字を含むファイルは grep / ripgrep がバイナリ判定で走査対象から外すため、' +
        'コードが検索へ映らなくなります（#2055）。'
    );
    console.error(
      "意図的に制御文字を含む文字列を扱う場合は、生バイトではなくエスケープ列（例 'skill\\u0000id'）で書いてください。"
    );
    console.error(
      '恒久的な例外は scripts/check-control-characters.mjs の ALLOWED_FILES へ理由付きで追記してください。'
    );
  }

  if (errors.length > 0) {
    console.error(`制御文字チェック: ${errors.length} 件のエラー`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
  }

  if (violations.length > 0 || errors.length > 0) {
    process.exit(1);
  }

  console.log(`✅ C0 制御文字なし（${scanned} ファイル走査 / ${SCOPE_LABEL}）`);
}

if (isDirectRun(import.meta.url)) {
  main();
}
