// tests/helpers/cli-option-consumers.mjs
//
// #2074 — 「受理したオプションが消費されているか」を **実装から導出する** 機構。
// 手書きの一覧を正とせず、次の 3 つを機械的に測って組み合わせる:
//
//   1. オプションの全集合: src/cli.mjs の `KNOWN_OPTION_TOKENS` 定義をソースから
//      読む（tests/cli-parse-args.test.mjs #1797 と同じ抽出。Set は module-private
//      で export しない方針なので、そのテストと同じくソースを読む）。
//   2. 面ごとの受理と、書き込まれるフィールド: 面の代表 argv に対し
//      `parseArgs(argv)` と `parseArgs([...argv, token, value])` を比較し、
//      差分のキーを「そのオプションがその面で書くフィールド」とする。
//      差分が無く usage error にもなっていなければ「受理された」と読む。
//   3. 面ごとの読み手: コマンドのハンドラ（src/cli/commands/<command>.mjs）と、
//      そこから相対 import で辿れる全ファイルを対象に `parsed.<field>` の出現を
//      集める。`main()`（src/cli.mjs）の読みは `MAIN_CONSUMED_FIELDS` に
//      根拠つきで列挙したものだけを消費と数える（下記）。
//
// 消費 = 「その面で書かれたフィールドのどれかを、そのコマンドの読み手が読む」。
// 受理されるのに消費されない (option, surface) の組が、この機構の出力である。
//
// ★ 既知の限界（false-negative 方向）:
//   - 読み手の解像度は **コマンド単位**（ファイル単位）であり、サブコマンド単位
//     ではない。`skills list --from x` は `skills` ハンドラの import 先
//     （src/lib/agent-skill-bridge.mjs）が `parsed.fromPath` を読むので「消費」
//     と数えるが、`list` 分岐は読まない。`--base` が踏んだ「面ごとに割れる」穴
//     （#2051）はこの機構では見えず、閉じるときは src/cli.mjs の
//     `COMMAND_SCOPED_OPTIONS` に面の集合を宣言して parse 層で拒否する（#2065
//     の形）。その宣言と実装のずれは tests/cli-base-option-scope.test.mjs が pin する。
//   - `parsed.<field>` の直接参照だけを読む。分解代入・動的アクセス・別名経由は
//     検出できない（tests/cli-base-option-scope.test.mjs と同じ限界）。
//   - 読み手の走査は import グラフの過大近似で、無関係なローカル変数 `parsed`
//     （src/lib/diff-processor.mjs の `parsed.files` など）も拾う。フィールド名が
//     parseArgs のフィールドと一致した場合だけ「消費」に誤って数わる。

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main, parseArgs } from '../../src/cli.mjs';
import { SURFACES } from './cli-surfaces.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI_SOURCE_PATH = join(REPO_ROOT, 'src', 'cli.mjs');
const COMMANDS_DIR = join(REPO_ROOT, 'src', 'cli', 'commands');
const PROMOTE_SOURCE_PATH = join(COMMANDS_DIR, 'promote.mjs');

/**
 * `--ensemble` の parse は src/cli.mjs が `os.tmpdir()/river-ensemble-<pid>-<ts>.md`
 * を書き、`parsed.cliArtifacts['review-external']` にその path を入れ、回収は
 * process の exit listener に任せる。導出は面ごとに parse するので、exit まで
 * 待つと runner 生存中に tmp が積み上がり、同じ tmpdir を走査する
 * tests/cli-ensemble-flag.test.mjs と同時実行したとき衝突する（#2087 finding 3）。
 * parse 直後にここで回収する。自プロセスの pid を含む名前だけを対象にし、
 * 他プロセスの生成物には触れない。
 * @param {ReturnType<typeof parseArgs>} parsed
 */
export function reclaimEnsembleTmp(parsed) {
  const tmpPath = parsed?.cliArtifacts?.['review-external'];
  if (typeof tmpPath !== 'string') return;
  const expectedPrefix = join(os.tmpdir(), `river-ensemble-${process.pid}-`);
  if (!tmpPath.startsWith(expectedPrefix) || !tmpPath.endsWith('.md')) return;
  try {
    unlinkSync(tmpPath);
  } catch {
    // 既に exit listener か別経路で消えていれば何もしない
  }
}

/**
 * `parsed` を受け取れない経路（`runCliInProcess` で `main()` を同一プロセスで
 * 走らせたとき）向けの回収。自プロセスの pid を名前に含む
 * `river-ensemble-<pid>-*.md` だけを os.tmpdir() から消す。
 * @returns {number} 消した件数
 */
export function reclaimOwnEnsembleTmpFiles() {
  const prefix = `river-ensemble-${process.pid}-`;
  let names;
  try {
    names = readdirSync(os.tmpdir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.md')) continue;
    try {
      unlinkSync(join(os.tmpdir(), name));
      removed += 1;
    } catch {
      // 既に消えていれば何もしない
    }
  }
  return removed;
}

/**
 * src/cli/commands/promote.mjs `runPromoteCommand` の `includes([...])` に並ぶ
 * サブコマンド語彙をソースから読む（`readKnownOptionTokens` と同型）。
 * tests/helpers/cli-surfaces.mjs の `PROMOTE_SUBCOMMANDS` はこの写しなので、
 * 両方向の増減を tests/cli-option-consumer-check.test.mjs が突き合わせる
 * （#2087 finding 1: src 側に語を足しても写しが落ちなかった）。
 * @returns {string[]}
 */
export function readPromoteSubcommandsFromSource() {
  const source = readFileSync(PROMOTE_SOURCE_PATH, 'utf8');
  const fnStart = source.indexOf('export async function runPromoteCommand');
  const listStart = source.indexOf('![', fnStart);
  const listEnd = source.indexOf('].includes(sub)', listStart);
  if (!(fnStart >= 0 && listStart > fnStart && listEnd > listStart)) {
    throw new Error('runPromoteCommand の `includes([...])` が promote.mjs に見つからない');
  }
  return [...source.slice(listStart, listEnd).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

/**
 * `-h` / `--help` は値を消費するオプションではなく、どの面でも `command` を
 * 'help' へ倒して help を表示させるメタオプション。行列からは外し、
 * 「`command` 以外を書かないこと」だけを呼び出し側で pin する。
 */
export const META_OPTIONS = new Set(['-h', '--help']);

/**
 * `main()`（src/cli.mjs）だけが読み、ハンドラは読まないが、**全コマンドに効く**
 * フィールド。根拠を書けるものだけをここに置く。`main()` が読む他のフィールド
 * （`gate` / `advisoryOnly` / `planFile` の矛盾検査など）は「そのオプションの
 * 意味を適用した」読みではないので消費に数えない — `doctor --gate` は
 * 矛盾検査を通過した後は何もしない。
 *
 * ここに挙げたフィールドが `main()` で実際に読まれていることは
 * tests/cli-option-consumer-check.test.mjs が `main.toString()` で pin する。
 */
export const MAIN_CONSUMED_FIELDS = Object.freeze({
  // `--offline` / `--rules-only`: main() が RIVER_OFFLINE=1 を環境へ書き、
  // isLlmEnabled() が全経路でそれを見る（ADR-002 / #1071）。
  offline: 'main() sets RIVER_OFFLINE=1 for every command',
});

/**
 * 値を取るオプションの代表値。`pre` は既定値と同じ値を書くオプション
 * （`--strict` は既定の validationMode='strict' を書く）で差分を観測するために
 * 先に付ける argv。値はどれも parse 層の検証を通る形にしてある。
 *
 * これは **検査の入力** であり、消費の有無を語る一覧ではない。値が要らない
 * オプションは載せない（載っていないトークンは flag として単独で付ける）。
 * @type {Record<string, {value?: string[], pre?: string[]}>}
 */
export const OPTION_SAMPLES = {
  // suppression
  '--fingerprint': { value: ['fedcba9876543210'] },
  '--fingerprint-algo': { value: ['v2'] },
  '--finding': { value: ['finding-1'] },
  '--feedback': { value: ['false_negative'] },
  '--scope': { value: ['repo'] },
  '--rationale': { value: ['why'] },
  '--severity': { value: ['major'] },
  '--files': { value: ['a.txt,b.txt'] },
  '--expires': { value: ['2027-01-01'] },
  '--pr': { value: ['12'] },
  // skills resolve
  '--path': { value: ['b.txt'] },
  // feedback
  '--type': { value: ['false_negative'] },
  '--skill': { value: ['other-skill'] },
  '--trigger': { value: ['manual'] },
  '--evidence': { value: ['evidence'] },
  '--reviewer': { value: ['reviewer'] },
  '--model': { value: ['model'] },
  '--reversed-by': { value: ['someone'] },
  '--run-id': { value: ['run-1'] },
  // promote
  '--approver': { value: ['approver'] },
  '--reason': { value: ['reason'] },
  '--index': { value: ['index.json'] },
  '--threshold': { value: ['2'] },
  '--feedback-root': { value: ['feedback-root'] },
  '--input': { value: ['input.jsonl'] },
  '--cluster-key': { value: ['skill::false_positive'] },
  '--policy-version': { value: ['v1'] },
  // evolve
  '--min': { value: ['2'] },
  '--month': { value: ['2026-01'] },
  '--spec': { value: ['spec.json'] },
  '--expect-manifest': { value: ['manifest-1'] },
  // shared / review
  '--fail-on': { value: ['major'] },
  '--warn-on': { value: ['minor'] },
  '--plan': { value: ['plan.json'] },
  '--output-file': { value: ['out.json'] },
  '--summary-file': { value: ['summary.md'] },
  '--artifacts-dir': { value: ['artifacts'] },
  '--artifact': { value: ['plan=./plan.md'] },
  // `--ensemble` はディレクトリを parse 時に読むので、呼び出し側が実在の
  // ディレクトリを `ensembleDir` で渡す（deriveOptionConsumerMatrix の引数）。
  '--ensemble': { value: [] },
  '--phase': { value: ['upstream'] },
  // #2054 PR-3: a real entry name, so parse-layer validation passes and the
  // matrix measures acceptance rather than the unknown-entry rejection.
  '--entry': { value: ['review-plan'] },
  '--cases': { value: ['cases.json'] },
  '--planner': { value: ['order'] },
  '--max-cost': { value: ['1'] },
  '--output': { value: ['json'] },
  '--format': { value: ['json'] },
  '--context': { value: ['diff'] },
  '--dependency': { value: ['node'] },
  '--reviewers': { value: ['bug-hunter'] },
  '--baseline': { value: ['baseline.json'] },
  '--base': { value: ['main'] },
  '--skill-set': { value: ['comprehensive'] },
  '--depth': { value: ['quick'] },
  '--from': { value: ['from-dir'] },
  '--to': { value: ['to-dir'] },
  '--strict': { pre: ['--loose'] },
  '--source': { value: ['rr'] },
};

/**
 * src/cli.mjs の `KNOWN_OPTION_TOKENS` 定義をソースから読む
 * （tests/cli-parse-args.test.mjs #1797 と同じ抽出）。
 * @returns {string[]}
 */
export function readKnownOptionTokens() {
  const source = readFileSync(CLI_SOURCE_PATH, 'utf8');
  const setStart = source.indexOf('const KNOWN_OPTION_TOKENS');
  const setEnd = source.indexOf('function takeFreeTextValue');
  if (!(setStart > 0 && setEnd > setStart)) {
    throw new Error('KNOWN_OPTION_TOKENS の定義が src/cli.mjs に見つからない');
  }
  return [...source.slice(setStart, setEnd).matchAll(/'(-[a-z0-9-]+)'/g)].map((m) => m[1]);
}

/**
 * `file` から相対 import で辿れる全ファイル（自身を含む）。
 * @param {string} file 絶対パス
 * @param {Set<string>} [seen]
 * @returns {Set<string>}
 */
function importClosure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  // 静的 import（`from '…'`）と動的 import（`import('…')`。skills.mjs は
  // agent-skill-bridge.mjs をこの形で読む）の両方を辿る。
  for (const match of source.matchAll(/(?:from\s+|import\()\s*'(\.[^']+)'/g)) {
    const target = resolve(dirname(file), match[1]);
    if (existsSync(target)) importClosure(target, seen);
  }
  return seen;
}

const FIELD_READ_RE = /\bparsed\??\.([A-Za-z_$][\w$]*)/g;

/**
 * `main()` が読む `parsed.<field>` の集合（`Function.prototype.toString` で
 * 本体を読む）。
 * @returns {Set<string>}
 */
export function mainReadFields() {
  return new Set([...main.toString().matchAll(FIELD_READ_RE)].map((m) => m[1]));
}

/**
 * コマンドごとの読み手ファイルと、そこで読まれるフィールド。
 * @param {string} command
 * @returns {{files: string[], fields: Set<string>}}
 */
export function commandReaders(command) {
  const handler = join(COMMANDS_DIR, `${command}.mjs`);
  if (!existsSync(handler)) {
    throw new Error(`ハンドラが無い: ${relative(REPO_ROOT, handler)}`);
  }
  const files = [...importClosure(handler)].sort();
  const fields = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(FIELD_READ_RE)) {
      fields.add(match[1]);
    }
  }
  return { files: files.map((f) => relative(REPO_ROOT, f).split('\\').join('/')), fields };
}

function stable(value) {
  return JSON.stringify(value);
}

/**
 * 2 つの parse 結果の差分キー（`usageError` を除く）。
 * @param {object} before
 * @param {object} after
 * @returns {string[]}
 */
function changedFields(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('usageError');
  return [...keys].filter((key) => stable(before[key]) !== stable(after[key])).sort();
}

/**
 * parse 結果が「受理された」か。`promote` / `evolve` は範囲外オプションを
 * `usageError` ではなく専用フィールドへ記録するので、そちらも見る。
 * @param {object} parsed
 * @returns {boolean}
 */
export function isAccepted(parsed) {
  return (
    !parsed.usageError &&
    parsed.promoteUnknownOption === null &&
    parsed.evolveUnknownOption === null &&
    parsed.command !== 'help'
  );
}

/**
 * @typedef {object} OptionCell
 * @property {'rejected' | 'accepted'} status
 * @property {string[]} writes そのオプションがその面で書いたフィールド
 * @property {boolean} consumed writes のどれかをコマンドの読み手が読む
 */

/**
 * @typedef {object} OptionRow
 * @property {string[]} writes 全面での書き込みフィールドの和集合
 * @property {string[]} readBy writes のどれかを読むコマンド（`main` を含む）
 * @property {string[]} acceptedOn 受理される面
 * @property {string[]} acceptedUnconsumedOn 受理されるが消費されない面
 * @property {Record<string, OptionCell>} cells 面ごとの詳細
 */

/**
 * 行列を導出する。
 * @param {{ensembleDir: string, tokens?: string[]}} options
 * @returns {Record<string, OptionRow>} token -> row（token 順）
 */
export function deriveOptionConsumerMatrix({ ensembleDir, tokens = readKnownOptionTokens() }) {
  const readersByCommand = new Map();
  const mainConsumed = new Set(Object.keys(MAIN_CONSUMED_FIELDS));
  const matrix = {};

  for (const token of [...tokens].sort()) {
    if (META_OPTIONS.has(token)) continue;
    const sample = OPTION_SAMPLES[token] ?? {};
    const value = token === '--ensemble' ? [ensembleDir] : (sample.value ?? []);
    const pre = sample.pre ?? [];
    const cells = {};
    const writes = new Set();
    const readBy = new Set();

    for (const { surface, argv } of SURFACES) {
      const command = argv[0];
      const after = parseArgs([...argv, ...pre, token, ...value]);
      reclaimEnsembleTmp(after);
      if (!isAccepted(after)) {
        cells[surface] = { status: 'rejected', writes: [], consumed: false };
        continue;
      }
      let cellWrites = changedFields(parseArgs([...argv, ...pre]), after);
      if (cellWrites.length === 0 && argv.includes(token)) {
        // 代表 argv が既にそのオプションを含む面（`review plan --plan-only` /
        // `review exec --dry-run`）では追加しても差分が出ない。オプションを
        // 外した argv を before に取り直して、書くフィールドを観測する。
        const at = argv.indexOf(token);
        const stripped = [...argv.slice(0, at), ...argv.slice(at + 1 + value.length)];
        cellWrites = changedFields(parseArgs([...stripped, ...pre]), after);
      }
      if (!readersByCommand.has(command)) readersByCommand.set(command, commandReaders(command));
      const { fields } = readersByCommand.get(command);
      let consumed = false;
      for (const field of cellWrites) {
        writes.add(field);
        if (fields.has(field)) {
          consumed = true;
          readBy.add(command);
        }
        if (mainConsumed.has(field)) {
          consumed = true;
          readBy.add('main');
        }
      }
      cells[surface] = { status: 'accepted', writes: cellWrites, consumed };
    }

    const acceptedOn = Object.keys(cells).filter((s) => cells[s].status === 'accepted');
    matrix[token] = {
      writes: [...writes].sort(),
      readBy: [...readBy].sort(),
      acceptedOn,
      acceptedUnconsumedOn: acceptedOn.filter((s) => !cells[s].consumed),
      cells,
    };
  }
  return matrix;
}
