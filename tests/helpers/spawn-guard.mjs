// 子プロセスを起動するテストが孤児プロセスを残さないようにするヘルパー（#1950）。
//
// 背景: `node --test` のタイムアウトは node 自身しか終わらせない。`spawnSync` が
// ブロックしている最中にランナーが node を殺すと、起動済みの子は kill されずに
// ppid=1 の孤児として残る。bash 5.3.15 の heredoc deadlock では、5 時間以上生き
// 残った孤児が 14 個観測された（#1950）。
//
// 対策は 2 段構えである。
//
//   1. `timeout` + `killSignal: 'SIGKILL'` — spawnSync 自身に子を殺させる。これで
//      テスト実行そのものは必ず有限時間で終わる。
//   2. `detached: true` + プロセスグループへの止め — 1 だけでは足りない。spawnSync
//      が SIGKILL を送るのは自分が起動した pid だけで、その子が fork していると
//      孫は生き残る。実測: `timeout` + `killSignal` のみで hang した bash を殺すと、
//      fork された側が ppid=1 の孤児として残った。しかも hang した bash は heredoc
//      パイプの両端を自分で握る（`lsof` で fd 3 と fd 4 が同一パイプ）ため、
//      読み手が消えても EPIPE を受け取れず永久に解放されない。
//      `detached: true` で子をプロセスグループのリーダーにしておき、タイムアウト
//      時にグループ全体へ SIGKILL を送ると孫まで確実に消える。
import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';

export const SPAWN_TIMEOUT_MS = 30_000;

const OUTPUT_TAIL_LIMIT = 2_048;
const PS_TIMEOUT_MS = 1_000;
const SIGNALS_TO_REPORT = ['SIGPIPE', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGCHLD'];
let invocationCount = 0;

function outputTail(output) {
  if (output == null) return '(none)';
  const text = String(output);
  return text.length > OUTPUT_TAIL_LIMIT ? `…${text.slice(-OUTPUT_TAIL_LIMIT)}` : text;
}

function childProcessState(pid) {
  if (typeof pid !== 'number') return '(pid unavailable)';
  try {
    const result = spawnSync('/bin/ps', ['-o', 'pid=,stat=,wchan=,command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: PS_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.error) return `(ps unavailable: ${result.error.code ?? result.error.message})`;
    if (result.status !== 0)
      return `(ps exited ${result.status}: ${outputTail(result.stderr).trim() || 'no output'})`;
    return result.stdout.trim() || '(process no longer listed)';
  } catch (error) {
    return `(ps unavailable: ${error instanceof Error ? error.message : String(error)})`;
  }
}

function timeoutDiagnostics(command, args, options, res, elapsedMs, callNumber) {
  try {
    const env = options.env ?? process.env;
    const path = env.PATH ?? '(unset)';
    const pathHead = path.split(delimiter).slice(0, 3).join(delimiter) || '(empty)';
    const signalListeners = SIGNALS_TO_REPORT.map(
      (signal) => `${signal}=${process.listenerCount(signal)}`
    ).join(', ');
    return [
      `call=${callNumber}`,
      `command=${JSON.stringify(command)}`,
      `args=${JSON.stringify(args)}`,
      `cwd=${JSON.stringify(options.cwd ?? process.cwd())}`,
      `elapsed_ms=${elapsedMs}`,
      `child_ps=${childProcessState(res.pid)}`,
      `stdout_tail=${JSON.stringify(outputTail(res.stdout))}`,
      `stderr_tail=${JSON.stringify(outputTail(res.stderr))}`,
      `signals=SIGPIPE(default=ignored; js_listeners=${process.listenerCount('SIGPIPE')}), ${signalListeners}`,
      `env_path_head=${JSON.stringify(pathHead)}`,
      `env_shell=${JSON.stringify(env.SHELL ?? '(unset)')}`,
      `env_tmpdir=${JSON.stringify(env.TMPDIR ?? '(unset)')}`,
    ].join('\n');
  } catch (error) {
    return `diagnostics_unavailable=${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * `spawnSync` のうち、タイムアウト時にプロセスグループごと確実に終了させる版。
 * タイムアウトした場合は例外を投げる（黙って pass させない）。
 *
 * @param {string} command 実行するコマンド
 * @param {string[]} args 引数
 * @param {import('node:child_process').SpawnSyncOptions} [options] spawnSync のオプション
 * @returns {import('node:child_process').SpawnSyncReturns<string>} spawnSync の戻り値
 */
export function spawnSyncGuarded(command, args, options = {}) {
  const callNumber = ++invocationCount;
  const startedAt = process.hrtime.bigint();
  const res = spawnSync(command, args, {
    ...options,
    timeout: options.timeout ?? SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    detached: true,
  });
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const diagnostics =
    res.error?.code === 'ETIMEDOUT'
      ? timeoutDiagnostics(command, args, options, res, elapsedMs, callNumber)
      : null;
  if (res.signal === 'SIGKILL' && typeof res.pid === 'number') {
    try {
      // 負の pid = プロセスグループ全体。リーダーは既に死んでいてもグループは残る。
      process.kill(-res.pid, 'SIGKILL');
    } catch {
      // グループが既に消えている場合は ESRCH になる。想定内なので無視する。
    }
  }
  if (res.error && res.error.code === 'ETIMEDOUT') {
    throw new Error(
      `spawnSyncGuarded timed out after ${options.timeout ?? SPAWN_TIMEOUT_MS}ms: ` +
        `${command} ${args.join(' ')}\n${diagnostics}`
    );
  }
  return res;
}
