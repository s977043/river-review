#!/usr/bin/env node
// agent harness のイベントログ（jsonl）へ 1 行追記する。オーガナイザーや agent が
// 自己申告（kind: self-report）などを記録するための入口。
// 形式は docs/development/agent-harness-design.md の「追加する signal」が SSoT で、
// hook 側の書き手 .claude/hooks/harness-event.sh と同じ行を出す。
//
// 使い方: npm run harness:record -- --source command:range-review --kind self-report \
//           [--rule-id <id>] [--excerpt "..."] [--session-id <id>] [--tool-name <name>] [--cwd <path>]
// --tool-name の既定は空文字（hook 側は payload の tool_name、無ければ "Bash"）。
// 記録先は HARNESS_EVENTS_PATH、未設定なら ~/.claude/state/harness-events.jsonl。
// 成功で exit 0、引数の誤りで exit 2、書き込み失敗で exit 1。

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { isDirectRun } from '../lib/is-direct-run.mjs';
import { GUARD_LEDGER_PATH, parseGuardLedger } from '../check-doc-enumerations.mjs';
import { SIGNAL_REGISTRY_PATH, parseSignalRegistry } from './permission-prompt-report.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export const EVENT_KINDS = Object.freeze(['block', 'warn', 'self-report']);
/** detail.excerpt の最大文字数（code point）。harness-event.sh の `.[0:120]` と揃える。 */ export const EXCERPT_MAX = 120;
const SOURCE_RE = /^(hook|command|script):[a-z0-9-]+$/;

export function resolveEventsPath(env = process.env) {
  if (env.HARNESS_EVENTS_PATH) return env.HARNESS_EVENTS_PATH;
  return path.join(os.homedir(), '.claude/state/harness-events.jsonl');
}

const PLAIN_WORD_RE = /^[a-z][a-z0-9-]*$/;
const BARE_FLAG_RE = /^--?[a-z][a-z-]*$/;

/**
 * excerpt を空白で語に分け、小文字の語と値を伴わないフラグ以外を `*` に置き換えてから
 * EXCERPT_MAX 文字で切る。秘密の形を列挙する denylist は必ず形を取りこぼすため allowlist にしている。
 * harness-event.sh の jq 式と同じ規則。
 */
export function sanitizeExcerpt(text) {
  const masked = String(text ?? '')
    .split(/\s+/)
    .filter((t) => t !== '')
    .map((t) => (PLAIN_WORD_RE.test(t) || BARE_FLAG_RE.test(t) ? t : '*'))
    .join(' ');
  return Array.from(masked).slice(0, EXCERPT_MAX).join('');
}

/**
 * 1 行分のイベントを組み立てる。形式違反は throw する。
 *
 * @param {{ source: string, kind: string, ruleId?: string, excerpt?: string,
 *   cwd: string, sessionId?: string, toolName?: string, ts?: string, knownRuleIds: Set<string> }} input
 */
export function buildEvent({
  source,
  kind,
  ruleId = '',
  excerpt = '',
  cwd,
  sessionId = '',
  toolName = '',
  ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  knownRuleIds,
}) {
  if (!SOURCE_RE.test(String(source ?? ''))) {
    throw new Error(
      `--source は hook:<name> / command:<name> / script:<name> の形で書く（実際: ${JSON.stringify(source)}）`
    );
  }
  if (!EVENT_KINDS.includes(kind)) {
    throw new Error(
      `--kind は ${EVENT_KINDS.join(' / ')} のいずれか（実際: ${JSON.stringify(kind)}）`
    );
  }
  if (ruleId !== '' && !knownRuleIds.has(ruleId)) {
    throw new Error(
      `--rule-id "${ruleId}" は ${GUARD_LEDGER_PATH} の guards にも ${SIGNAL_REGISTRY_PATH} の rules にも無い（該当ルールが無ければ省略する）`
    );
  }
  return {
    ts,
    source,
    kind,
    ruleId,
    cwd,
    session_id: sessionId,
    detail: { tool_name: toolName, excerpt: sanitizeExcerpt(excerpt) },
  };
}

export async function loadKnownRuleIds(root = ROOT) {
  const [ledgerText, registryText] = await Promise.all([
    fs.readFile(path.join(root, GUARD_LEDGER_PATH), 'utf8'),
    fs.readFile(path.join(root, SIGNAL_REGISTRY_PATH), 'utf8'),
  ]);
  return new Set([
    ...parseGuardLedger(ledgerText).map((g) => g.id),
    ...parseSignalRegistry(registryText).map((r) => r.id),
  ]);
}

/**
 * CLI の本体。終了コードを返す。
 *
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function main(argv, env = process.env) {
  let event;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        source: { type: 'string' },
        kind: { type: 'string' },
        'rule-id': { type: 'string', default: '' },
        excerpt: { type: 'string', default: '' },
        'session-id': { type: 'string', default: '' },
        'tool-name': { type: 'string', default: '' },
        cwd: { type: 'string', default: process.cwd() },
      },
    });
    event = buildEvent({
      source: values.source,
      kind: values.kind,
      ruleId: values['rule-id'],
      excerpt: values.excerpt,
      cwd: path.resolve(values.cwd),
      sessionId: values['session-id'],
      toolName: values['tool-name'],
      knownRuleIds: await loadKnownRuleIds(),
    });
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const file = resolveEventsPath(env);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const stat = await fs.stat(file).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    // FIFO などは open が塞がるため、通常ファイルか未作成のときだけ追記する。
    if (stat && !stat.isFile()) throw new Error('通常ファイルではない');
    await fs.appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (error) {
    console.error(`${file} へ追記できなかった: ${error.message}`);
    return 1;
  }
  return 0;
}

if (isDirectRun(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
