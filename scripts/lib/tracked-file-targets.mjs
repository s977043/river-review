// `git ls-files` 由来の走査対象を列挙し、読み取ってよい対象かを判定する SSoT。
//
// 背景: `scripts/validate-plugin-manifest.mjs`（必須チェック `Meta consistency` の中核、
// RA-1）は `execFileSync('git', ['ls-files', '-z', '--', ...])` で対象を列挙したあと、
// 読み取り前に 2 つのガードを掛けている。
//   1. `lstat`（`stat` ではない。symlink を symlink として判定するため）+ `isFile()`
//      — 通常ファイル以外（symlink / gitlink / ディレクトリ）は読まずに skip する。
//        追跡された symlink を辿ると「対象集合の外」を読むことになるため。
//   2. サイズ上限 — 攻撃者が内容を決められる入力を、時間制限のある CI job の中で
//      有限の作業量に収めるため。
// `scripts/check-control-characters.mjs`（#2055 / PR #2062）は同じ列挙を書き直した際に
// 両方のガードを落としており、追跡 symlink 経由で次の 3 つが起きる状態だった
// （2026-09-04 実測。一時 git リポジトリに symlink を 1 本 commit して直接呼んだ結果）:
//   - `/dev/zero` へのリンク → `readFileSync` が返らない。45 秒で強制終了（exit 124）
//   - `/etc/hosts` へのリンク → リポジトリ外のファイルを黙って読む（scanned=2 に計上）
//   - ディレクトリへのリンク → `EISDIR` エラーで exit 1 の誤検出
// `.github/workflows/test.yml` は `pull_request:` トリガであり、fork PR から
// 必須チェックを止められる形だった。
//
// CLAUDE.md「Import the SSoT, never re-derive it」に従い、列挙とガードをここへ一本化して
// 両者が import する。判定関数は同期版（`lstatSync`）で、非同期の呼び出し元からも
// そのまま使える（結果は `fs.lstat` と同一で、例外も同じく呼び出し元の try/catch が拾う）。

import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';

/** `git ls-files` の出力を受け取る既定の maxBuffer。 */
const DEFAULT_LS_FILES_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * `git ls-files -z` で追跡ファイルを列挙する（ROOT 相対 path、git の出力順）。
 *
 * 失敗時は `execFileSync` の例外がそのまま伝播する。エラー文言は用途ごとに異なるので、
 * ここでは握らず呼び出し元の try/catch に任せる。
 *
 * @param {string} root リポジトリ（または worktree）のルート
 * @param {readonly string[]} pathspecs
 * @param {{ maxBuffer?: number }} [options]
 * @returns {string[]}
 */
export function listTrackedPaths(root, pathspecs, options = {}) {
  const maxBuffer = options.maxBuffer ?? DEFAULT_LS_FILES_MAX_BUFFER;
  const out = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer,
  });
  return out
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry !== '');
}

/**
 * 走査対象を読んでよいか判定する。
 *
 * - `lstat` なので symlink は「symlink として」判定される（辿らない）。
 * - 通常ファイル以外（symlink / gitlink / ディレクトリ / デバイス）は `'skip'`。
 * - 上限超過は `'oversize'`。読むかどうかは呼び出し元が決める。
 *
 * `lstat` 自体が失敗した場合は例外がそのまま伝播する（呼び出し元が既に
 * 「読めなかった」経路の扱いを持っているため、ここでは握らない）。
 *
 * `maxBytes` は**必須**で、既定値を置かない。2 つの呼び出し元は対象集合が違うため
 * 別々の上限を持つ（RA-1 = `RA1_MAX_TARGET_BYTES` の 1 MiB、制御文字チェック =
 * `MAX_TARGET_BYTES` の 8 MiB）。ここに既定値を置くと「文書化されていない第 3 の値」に
 * なり、引数を省いた呼び出し元が黙ってそれを踏む。上限は呼び出し元が宣言する。
 *
 * @param {string} absPath 絶対 path
 * @param {number} maxBytes 走査を許す最大バイト数（必須）
 * @returns {{ kind: 'file' | 'skip' | 'oversize', size: number }}
 */
export function classifyTrackedTarget(absPath, maxBytes) {
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new TypeError(
      `classifyTrackedTarget: maxBytes は必須の非負数（受け取った値: ${String(maxBytes)}）`
    );
  }
  const st = lstatSync(absPath);
  if (!st.isFile()) return { kind: 'skip', size: st.size };
  if (st.size > maxBytes) return { kind: 'oversize', size: st.size };
  return { kind: 'file', size: st.size };
}
