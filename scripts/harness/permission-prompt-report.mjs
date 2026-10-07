#!/usr/bin/env node
// 開発エージェント向けルールの効果測定（agent harness の第 1 ループ）。
//
// PermissionRequest hook が追記する確認ダイアログのログ（jsonl）を読み、
//   (a) 確認ダイアログの多いパターン
//   (b) docs/development/harness-signals.yaml の各ルールについて、導入前後の signal 割合と判定
//   (c) 退役候補（reviewAfter を過ぎたガード・ルール、効果の無いルール）
// を表示する。判定の定義は docs/development/agent-harness-design.md の「効果測定」が SSoT。
//
// 使い方: npm run harness:report -- [--log <path>] [--repo <path-prefix>] [--today YYYY-MM-DD] [--check]
// 既定では常に exit 0。--check は no-effect のルールがあれば exit 1（将来の CI / cron 用）。

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import * as yaml from 'js-yaml';

import { isDirectRun } from '../lib/is-direct-run.mjs';
import { GUARD_LEDGER_PATH, parseGuardLedger } from '../check-doc-enumerations.mjs';
import { firstCommandWord } from './shell-segments.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

export const SIGNAL_REGISTRY_PATH = 'docs/development/harness-signals.yaml';
export const DEFAULT_LOG_PATH = path.join(os.homedir(), '.claude/state/permission-prompts.jsonl');

/** 各窓に必要な確認ダイアログの最小件数（分母）。 */
export const MIN_WINDOW_SAMPLES = 50;
/** effective と判定する、signal 割合の最小相対減少率。 */
export const MIN_RELATIVE_DROP = 0.3;
/** 導入前・導入後それぞれの窓の上限日数。 */
export const MAX_WINDOW_DAYS = 14;

const SIGNAL_KINDS = new Set(['permission-prompt-first-command']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 効果測定台帳を読み、形式を検証したルール配列を返す。形式違反は throw する。
 *
 * @param {string} text
 */
export function parseSignalRegistry(text) {
  const doc = yaml.load(String(text ?? ''));
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.rules)) {
    throw new Error(`${SIGNAL_REGISTRY_PATH}: トップレベルに配列 \`rules\` が無い`);
  }
  const ids = new Set();
  for (const [index, rule] of doc.rules.entries()) {
    const where = `rules[${index}]`;
    if (!rule || typeof rule !== 'object') throw new Error(`${where}: エントリがマップではない`);
    if (typeof rule.id !== 'string' || !/^[a-z0-9-]+$/.test(rule.id)) {
      throw new Error(`${where}: id は kebab-case の文字列で書く`);
    }
    if (ids.has(rule.id)) throw new Error(`${where}: id "${rule.id}" が重複している`);
    ids.add(rule.id);
    if (typeof rule.source !== 'string' || rule.source === '') {
      throw new Error(`${where} (${rule.id}): source が空`);
    }
    if (!/^#\d+$/.test(String(rule.introducedIn))) {
      throw new Error(`${where} (${rule.id}): introducedIn は \`#1234\` 形式で書く`);
    }
    if (!ISO_INSTANT_RE.test(String(rule.introducedAt))) {
      throw new Error(
        `${where} (${rule.id}): introducedAt は UTC の YYYY-MM-DDTHH:MM:SSZ（実際: ${JSON.stringify(rule.introducedAt)}）`
      );
    }
    if (!ISO_DATE_RE.test(String(rule.reviewAfter))) {
      throw new Error(`${where} (${rule.id}): reviewAfter は YYYY-MM-DD`);
    }
    const signal = rule.signal;
    if (!signal || !SIGNAL_KINDS.has(signal.kind)) {
      throw new Error(
        `${where} (${rule.id}): signal.kind は ${[...SIGNAL_KINDS].join(' / ')} のいずれか`
      );
    }
    if (typeof signal.toolName !== 'string' || typeof signal.command !== 'string') {
      throw new Error(`${where} (${rule.id}): signal.toolName と signal.command は文字列で書く`);
    }
  }
  return doc.rules;
}

/**
 * jsonl を読む。JSON として読めない行と ts を持たない行は invalid として数えて捨てる。
 *
 * @param {string} text
 * @returns {{ rows: object[], invalid: number }}
 */
export function parsePromptLog(text) {
  const rows = [];
  let invalid = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (line.trim() === '') continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      invalid += 1;
      continue;
    }
    if (!row || typeof row.ts !== 'string' || Number.isNaN(Date.parse(row.ts))) {
      invalid += 1;
      continue;
    }
    rows.push(row);
  }
  rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { rows, invalid };
}

/**
 * cwd が repo 接頭辞と一致するか、その配下にある行だけを残す。
 *
 * @param {object[]} rows
 * @param {string | undefined} repo
 */
export function filterByRepo(rows, repo) {
  if (!repo) return rows;
  const prefix = repo.replace(/\/+$/, '');
  return rows.filter(
    (row) => typeof row.cwd === 'string' && (row.cwd === prefix || row.cwd.startsWith(`${prefix}/`))
  );
}

/** 行の表示用パターン。Bash は最初のコマンド語まで、それ以外は tool_name。 */
export function promptPattern(row) {
  if (row.tool_name !== 'Bash') return String(row.tool_name ?? '(unknown)');
  return `Bash: ${firstCommandWord(row.tool_input?.command) ?? '(none)'}`;
}

/** 行が signal に該当するか。 */
export function matchesSignal(row, signal) {
  return (
    row.tool_name === signal.toolName &&
    firstCommandWord(row.tool_input?.command) === signal.command
  );
}

/**
 * 多い順のパターン上位を返す。
 *
 * @param {object[]} rows
 * @param {number} limit
 */
export function topPatterns(rows, limit = 10) {
  const counts = new Map();
  for (const row of rows) {
    const key = promptPattern(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([pattern, count]) => ({ pattern, count, share: rows.length ? count / rows.length : 0 }));
}

/**
 * 1 ルールの導入前後を比べる。
 *
 * 窓は導入時刻を挟む同じ長さ W の 2 区間で、W = min(ログ開始〜導入, 導入〜ログ終了, MAX_WINDOW_DAYS)。
 * ログの記録期間は repo で絞る前の全行で決める（記録期間は repo の活動量とは別の性質のため）。
 *
 * @param {object} rule
 * @param {object[]} rows repo で絞った行
 * @param {{ start: number, end: number } | null} coverage ログ全体の最初と最後の ts（ms）
 */
export function analyzeRule(rule, rows, coverage) {
  const at = Date.parse(rule.introducedAt);
  const windowMs = coverage
    ? Math.min(at - coverage.start, coverage.end - at, MAX_WINDOW_DAYS * DAY_MS)
    : 0;
  const tally = (from, to) => {
    const inWindow = rows.filter((row) => {
      const ts = Date.parse(row.ts);
      return ts >= from && ts < to;
    });
    const hits = inWindow.filter((row) => matchesSignal(row, rule.signal)).length;
    return { total: inWindow.length, hits, share: inWindow.length ? hits / inWindow.length : 0 };
  };
  const before = windowMs > 0 ? tally(at - windowMs, at) : { total: 0, hits: 0, share: 0 };
  // after の終端はログ最後の行を含めるため 1ms 先まで取る
  const after = windowMs > 0 ? tally(at, at + windowMs + 1) : { total: 0, hits: 0, share: 0 };

  let verdict;
  let relativeDrop = null;
  if (before.total < MIN_WINDOW_SAMPLES || after.total < MIN_WINDOW_SAMPLES || before.hits === 0) {
    verdict = 'insufficient-data';
  } else {
    relativeDrop = 1 - after.share / before.share;
    verdict = relativeDrop >= MIN_RELATIVE_DROP ? 'effective' : 'no-effect';
  }
  return { id: rule.id, windowMs: Math.max(windowMs, 0), before, after, relativeDrop, verdict };
}

/**
 * reviewAfter が today 以前のガードを返す（improvement-flow.md Step 9 の列挙条件と同じ `<=`）。
 *
 * @param {string} ledgerText
 * @param {string} today YYYY-MM-DD
 */
export function listOverdueGuards(ledgerText, today) {
  return parseGuardLedger(ledgerText)
    .filter((guard) => String(guard.reviewAfter) <= today)
    .sort((a, b) => String(a.reviewAfter).localeCompare(String(b.reviewAfter)))
    .map((guard) => ({
      id: guard.id,
      reviewAfter: guard.reviewAfter,
      mechanized: guard.mechanized,
    }));
}

/**
 * レポートを組み立てる（I/O なし）。
 *
 * @param {{ logText: string | null, registryText: string, ledgerText: string, repo?: string, today: string }} input
 */
export function buildReport({ logText, registryText, ledgerText, repo, today }) {
  const rules = parseSignalRegistry(registryText);
  const { rows: allRows, invalid } = parsePromptLog(logText ?? '');
  const coverage = allRows.length
    ? { start: Date.parse(allRows[0].ts), end: Date.parse(allRows.at(-1).ts) }
    : null;
  const rows = filterByRepo(allRows, repo);
  const results = rules.map((rule) => analyzeRule(rule, rows, coverage));
  const retireCandidates = [
    ...listOverdueGuards(ledgerText, today).map((guard) => ({
      kind: 'guard',
      id: guard.id,
      reason: `reviewAfter ${guard.reviewAfter} 到来（mechanized: ${guard.mechanized}）`,
    })),
    ...rules
      .filter((rule) => String(rule.reviewAfter) <= today)
      .map((rule) => ({
        kind: 'rule',
        id: rule.id,
        reason: `reviewAfter ${rule.reviewAfter} 到来`,
      })),
    ...results
      .filter((result) => result.verdict === 'no-effect')
      .map((result) => ({ kind: 'rule', id: result.id, reason: '効果なし（no-effect）' })),
  ];
  return {
    logFound: logText !== null,
    totalRows: allRows.length,
    invalid,
    coverage,
    repo: repo ?? null,
    rows: rows.length,
    patterns: topPatterns(rows),
    results,
    retireCandidates,
  };
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const hours = (ms) => `${(ms / (60 * 60 * 1000)).toFixed(1)}h`;

/** レポートを人が読むテキストにする。 */
export function formatReport(report) {
  const lines = [];
  if (!report.logFound) {
    lines.push(
      'ログが見つからない（PermissionRequest hook が未設定か、まだ 1 件も記録されていない）'
    );
  }
  const span = report.coverage
    ? `${new Date(report.coverage.start).toISOString()} .. ${new Date(report.coverage.end).toISOString()}`
    : '-';
  lines.push(
    `ログ: ${report.totalRows} 件（読めない行 ${report.invalid} 件）、期間 ${span}`,
    `対象: ${report.repo ?? '全リポジトリ'} → ${report.rows} 件`,
    '',
    '## 確認ダイアログの多いパターン'
  );
  for (const { pattern, count, share } of report.patterns) {
    lines.push(`- ${pattern}: ${count} 件（${pct(share)}）`);
  }
  lines.push(
    '',
    `## ルールの効果（各窓 ${MIN_WINDOW_SAMPLES} 件以上・相対減少 ${pct(MIN_RELATIVE_DROP)} 以上で effective）`
  );
  for (const r of report.results) {
    const drop = r.relativeDrop === null ? '-' : pct(r.relativeDrop);
    lines.push(
      `- ${r.id}: ${r.verdict}（窓 ${hours(r.windowMs)}／導入前 ${r.before.hits}/${r.before.total} = ${pct(r.before.share)}` +
        `／導入後 ${r.after.hits}/${r.after.total} = ${pct(r.after.share)}／相対減少 ${drop}）`
    );
  }
  lines.push('', '## 退役候補（判断は improvement-flow.md Step 9 に従い人が行う）');
  if (report.retireCandidates.length === 0) lines.push('- なし');
  for (const c of report.retireCandidates) lines.push(`- [${c.kind}] ${c.id}: ${c.reason}`);
  return lines.join('\n');
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * CLI の本体。終了コードを返す。
 *
 * @param {string[]} argv
 */
export async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      log: { type: 'string', default: DEFAULT_LOG_PATH },
      repo: { type: 'string' },
      today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
      check: { type: 'boolean', default: false },
    },
  });
  if (!ISO_DATE_RE.test(values.today)) throw new Error('--today は YYYY-MM-DD');
  const report = buildReport({
    logText: await readOptional(values.log),
    registryText: await fs.readFile(path.join(ROOT, SIGNAL_REGISTRY_PATH), 'utf8'),
    ledgerText: await fs.readFile(path.join(ROOT, GUARD_LEDGER_PATH), 'utf8'),
    repo: values.repo === undefined ? undefined : path.resolve(values.repo),
    today: values.today,
  });
  console.log(formatReport(report));
  return values.check && report.results.some((r) => r.verdict === 'no-effect') ? 1 : 0;
}

if (isDirectRun(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 2;
    }
  );
}
