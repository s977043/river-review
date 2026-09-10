#!/usr/bin/env node
// ドキュメントが書いている「列挙・件数」主張を実体と機械照合するチェッカー。
//
// 背景:
//   機械が検証している参照はほとんど壊れない一方、CI 非対象の「列挙・件数・構成」主張は実体とずれ、
//   docs 側のチェックリストでも止まらなかった。実測値（分子・分母）と測定コマンドは
//   docs/development/doc-enumeration-checks.md が SSoT なので、ここには数値を複製しない。
//   docs/development/improvement-flow.md の「mechanical に検証できるか」基準に従い、script + CI に倒す。
//
// 設計方針:
//   - 誤検出でメイン開発を止めないことを最優先とする。曖昧な対象は登録しない（後から足せる）。
//   - 宣言側のマーカー（表・行）が見つからない場合は「一致」ではなく **エラー** にする。
//     regex がすり抜けて検証が空振りする方が、落ちるより危険なため
//     （validate-meta-consistency.mjs の extractLatestRelease === null と同じ扱い）。
//   - 意図的に概数で書きたい箇所は 2 通りで除外できる（いずれも理由が必須）。
//       1. doc 側インラインコメント `<!-- doc-enum:ignore <specId> -- <理由> -->`（spec 全体を除外）
//       2. spec テーブル側の `ignoreKeys: { '<key>': '<理由>' }`（キー単位で除外）
//     どちらも理由が空ならエラーとし、理由なしの黙殺を作れないようにしている。
//     ただし全 spec が ignore されて検証ゼロになった場合は OK にせずエラーとする
//     （NOTHING_CHECKED_ERROR）。「落ちない script」は目的ではない。
//
// 運用手順は docs/development/doc-enumeration-checks.md を参照。

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import * as yaml from 'js-yaml';

import { isDirectRun } from './lib/is-direct-run.mjs';
// 「トップレベルの *.md を列挙する」実装は validate-plugin-manifest.mjs が既に持つ。
// 同じ概念を再実装せず import する（CLAUDE.md「Import the SSoT, never re-derive it」）。
import { listMarkdownFiles } from './validate-plugin-manifest.mjs';
// stream（phase）名の SSoT。
import { PHASES } from '../src/lib/planner-utils.mjs';
// パイプライン関数の call site 実測（#1827）。
import {
  PIPELINE_FUNCTION_GROUPS,
  findCallSiteFiles,
  parseChecklistPaths,
} from './lib/pipeline-call-sites.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/** doc 側の除外ディレクティブ。理由（`--` 以降）が空なら不許可とする。 */
const IGNORE_DIRECTIVE_RE = /<!--\s*doc-enum:ignore\s+([a-z0-9-]+)\s*(?:--\s*([^]*?))?-->/g;

/**
 * doc 本文から `<!-- doc-enum:ignore <specId> -- <理由> -->` を拾う。
 *
 * @param {string} text
 * @returns {Map<string, string>} specId -> 理由（未記載なら空文字）
 */
export function parseIgnoreDirectives(text) {
  const found = new Map();
  for (const match of String(text ?? '').matchAll(IGNORE_DIRECTIVE_RE)) {
    found.set(match[1], (match[2] ?? '').trim());
  }
  return found;
}

/**
 * Markdown のテーブル行を単純にセル配列へ分解する。テーブル行でなければ null。
 *
 * @param {unknown} line
 * @returns {string[] | null}
 */
function splitTableRow(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * ヘッダーセル名が完全一致する最初のテーブルから、その列のデータセルを取り出す。
 * 該当テーブルが無ければ null（＝マーカー消失としてエラーにする）。
 *
 * @param {string} text
 * @param {string} header
 * @returns {string[] | null}
 */
export function parseMarkdownTableColumn(text, header) {
  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const headerCells = splitTableRow(lines[i]);
    if (!headerCells) continue;
    const column = headerCells.indexOf(header);
    if (column < 0) continue;
    const separator = splitTableRow(lines[i + 1]);
    if (!separator || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;

    const values = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const row = splitTableRow(lines[j]);
      if (!row) break;
      if (column < row.length) values.push(row[column]);
    }
    return values;
  }
  return null;
}

/** `` `foo` `` 形式のセルからコードスパンを外す。 */
export function unwrapCodeSpan(cell) {
  const match = /^`([^`]+)`$/.exec(String(cell ?? '').trim());
  return match ? match[1] : String(cell ?? '').trim();
}

/**
 * docs/skills-structure.md のツリー内コメント（`├── upstream/  # 46 スキル`）から
 * stream ごとの件数宣言を拾う。
 *
 * 同一 stream の件数宣言が 2 回以上あると throw する。この doc には
 * `upstream/ midstream/ downstream/` を含むツリーが複数あり、単純な last-wins に
 * すると 2 本目に件数が付いた瞬間、読者が最初に見る 1 本目のツリーが
 * いくら古くても検証を通ってしまうため（どちらが正か機械には決められない）。
 *
 * @param {string} text
 * @returns {Map<string, number>}
 * @throws {Error} 同一 stream の件数宣言が重複している場合
 */
export function parseSkillStreamCounts(text) {
  const counts = new Map();
  const pattern = /[├└]──\s*(upstream|midstream|downstream)\/\s*#\s*(\d+)\s*スキル/g;
  for (const match of String(text ?? '').matchAll(pattern)) {
    const stream = match[1];
    if (counts.has(stream)) {
      throw new Error(
        `"${stream}" の件数宣言が重複している（${counts.get(stream)} と ${match[2]}） — ` +
          '件数を書くツリーは 1 本に絞り、他のツリーからは件数コメントを外すこと'
      );
    }
    counts.set(stream, Number(match[2]));
  }
  return counts;
}

/**
 * README のインストール節「得られるもの / What you get」にある箇条書きから、
 * ラベル行に並ぶコードスパンを名前集合として拾う。
 *
 * README は散文が多く表も無いため、`parseMarkdownTableColumn` は使えない。
 * 代わりに (1) 節の目印行、(2) 箇条書きのラベル、(3) 名前の形の 3 点で対象を絞る。
 * `pattern` に合わないコードスパン（例: 呼び出し方の説明にある
 * `` `/river-review:<skill-name>` `` のようなプレースホルダ）は無視する。
 *
 * 目印行・ラベル行のいずれかが消えた場合は null を返し、マーカー消失として
 * エラーにする（他の spec と同じく、すり抜けて空振りする方を危険とみなす）。
 *
 * @param {string} text
 * @param {{ anchor: RegExp, label: RegExp, pattern: RegExp }} options
 * @returns {Set<string> | null}
 */
export function parseSurfaceBulletNames(text, { anchor, label, pattern }) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((line) => anchor.test(line));
  if (start < 0) return null;

  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) break; // 次の見出しで打ち切る
    if (!label.test(lines[i])) continue;
    const names = new Set();
    for (const span of lines[i].matchAll(/`([^`]+)`/g)) {
      const matched = pattern.exec(span[1].trim());
      if (matched) names.add(matched[1]);
    }
    return names.size > 0 ? names : null;
  }
  return null;
}

/** README の配布サーフェス節を照合する spec を組み立てる。 */
function readmeSurfaceSpec({ id, doc, summary, marker, anchor, label, pattern, measure }) {
  return {
    id,
    doc,
    summary,
    marker,
    kind: 'names',
    declare: (text) => parseSurfaceBulletNames(text, { anchor, label, pattern }),
    measure,
  };
}

/** `/river-review:<name>` 形式のコマンド名。 */
const PLUGIN_COMMAND_SPAN_RE = /^\/river-review:([a-z0-9-]+)$/;

/** 素の agent-skill 名（`/river-review:<skill-name>` のプレースホルダは弾く）。 */
const AGENT_SKILL_SPAN_RE = /^([a-z0-9-]+)$/;

/** 配布コマンド名（拡張子なし）の実測。 */
async function measureDistributedCommandNames() {
  return new Set((await listCommandFiles('commands')).map((file) => file.replace(/\.md$/, '')));
}

/** 配布 agent-skill 名の実測。 */
async function measureAgentSkillNames() {
  return new Set(await listDirectories('skills/agent-skills'));
}

/** ガード台帳（SSoT）の位置。CLAUDE.md 側はここから照合される従属側。 */
export const GUARD_LEDGER_PATH = 'docs/development/guard-ledger.yaml';

/** 台帳が許す mechanized の語彙。 */
const GUARD_MECHANIZED_LEVELS = new Set(['full', 'partial', 'none']);

/** `YYYY-MM-DD` 形式の日付。 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CLAUDE.md の「AI Misoperation Guards」節から `- **<見出し>**:` を拾う。
 *
 * 節を限定するのは、Decision Policy など他の節も `- **...**:` 形式の箇条書きを
 * 持つため。節見出しが消えた場合は null を返し、マーカー消失としてエラーにする。
 *
 * @param {string} text
 * @returns {Set<string> | null}
 * @throws {Error} 同じ見出しが 2 回以上現れた場合（照合キーが一意でなくなるため）
 */
export function parseGuardTitles(text) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((line) => /^##\s+AI Misoperation Guards\s*$/.test(line));
  if (start < 0) return null;

  const titles = new Set();
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    const match = /^-\s+\*\*(.+?)\*\*:\s/.exec(lines[i]);
    if (!match) continue;
    const title = match[1].trim();
    if (titles.has(title)) {
      throw new Error(
        `ガード見出し "${title}" が重複している — 見出しは台帳との照合キーなので一意にすること`
      );
    }
    titles.add(title);
  }
  return titles.size > 0 ? titles : null;
}

/**
 * ガード台帳の YAML を読み、形式を検証したうえでエントリ配列を返す。
 *
 * 形式違反は throw する（呼び出し元の spec が「実測に失敗した」として報告する）。
 * ここで緩く受けると、台帳が壊れたまま照合だけ通る＝検証が空振りする状態になる。
 *
 * @param {string} text
 * @returns {{ id: string, title: string, mechanized: string, verifiedBy: string[], addedAt: string, reviewAfter: string }[]}
 */
export function parseGuardLedger(text) {
  const doc = yaml.load(String(text ?? ''));
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.guards)) {
    throw new Error(`${GUARD_LEDGER_PATH}: トップレベルに配列 \`guards\` が無い`);
  }

  const ids = new Set();
  const titles = new Set();
  for (const [index, entry] of doc.guards.entries()) {
    const where = `guards[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${where}: エントリがマップではない`);
    }
    if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id)) {
      throw new Error(
        `${where}: id は kebab-case の文字列で書く（実際: ${JSON.stringify(entry.id)}）`
      );
    }
    if (ids.has(entry.id)) throw new Error(`${where}: id "${entry.id}" が重複している`);
    ids.add(entry.id);

    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      throw new Error(`${where} (${entry.id}): title が空`);
    }
    if (titles.has(entry.title)) {
      throw new Error(`${where} (${entry.id}): title "${entry.title}" が重複している`);
    }
    titles.add(entry.title);

    if (!GUARD_MECHANIZED_LEVELS.has(entry.mechanized)) {
      throw new Error(
        `${where} (${entry.id}): mechanized は full / partial / none のいずれか（実際: ${JSON.stringify(entry.mechanized)}）`
      );
    }
    if (!Array.isArray(entry.verifiedBy) || entry.verifiedBy.some((p) => typeof p !== 'string')) {
      throw new Error(`${where} (${entry.id}): verifiedBy は文字列の配列で書く`);
    }
    if (entry.mechanized === 'none' && entry.verifiedBy.length > 0) {
      throw new Error(`${where} (${entry.id}): mechanized: none なのに verifiedBy がある`);
    }
    if (entry.mechanized !== 'none' && entry.verifiedBy.length === 0) {
      throw new Error(
        `${where} (${entry.id}): mechanized: ${entry.mechanized} なら verifiedBy に所在を 1 件以上書く`
      );
    }
    if (entry.addedAt !== 'unknown' && !ISO_DATE_RE.test(String(entry.addedAt))) {
      throw new Error(
        `${where} (${entry.id}): addedAt は YYYY-MM-DD か 'unknown'（実際: ${JSON.stringify(entry.addedAt)}）`
      );
    }
    if (!ISO_DATE_RE.test(String(entry.reviewAfter))) {
      throw new Error(
        `${where} (${entry.id}): reviewAfter は YYYY-MM-DD（実際: ${JSON.stringify(entry.reviewAfter)}）`
      );
    }
  }
  return doc.guards;
}

/** 台帳をディスクから読んで検証済みエントリを返す。 */
async function loadGuardLedger() {
  return parseGuardLedger(await fs.readFile(path.join(ROOT, GUARD_LEDGER_PATH), 'utf8'));
}

/** 台帳 `decisions:` が許す kind の語彙（#1843）。 */
const DECISION_KINDS = new Set(['deprecation', 'observation', 'temporary-exclusion']);

/** decidedIn は `#<Issue/PR 番号>` で書く。 */
const DECIDED_IN_RE = /^#\d+$/;

/**
 * 台帳の `decisions:`（期限付きの決定）を読み、形式を検証してエントリ配列を返す。
 *
 * `guards:` とはキーを分けている。ガードは CLAUDE.md の見出しと 1:1 で照合される一方、
 * 期限付きの決定は CLAUDE.md に対応する散文を持たないため、同じ配列に混ぜると
 * spec `claude-md-guard-ledger` が「CLAUDE.md に無い」側で必ず落ちる。
 * キーを分けることで、既存のガードエントリと照合ロジックはそのまま残る。
 *
 * `decisions:` が無い台帳は空配列を返す（キー自体は任意）。
 *
 * @param {string} text
 * @returns {{ id: string, kind: string, target: string, decidedIn: string, decidedAt: string, reviewAfter: string, notes?: string }[]}
 */
export function parseDecisionLedger(text) {
  const doc = yaml.load(String(text ?? ''));
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${GUARD_LEDGER_PATH}: トップレベルがマップではない`);
  }
  if (doc.decisions === undefined) return [];
  if (!Array.isArray(doc.decisions)) {
    throw new Error(`${GUARD_LEDGER_PATH}: \`decisions\` が配列ではない`);
  }

  // id はガードと同じ名前空間として扱う。両方を横断する棚卸しコマンドが
  // id で結果を突き合わせるため、guards と decisions で重複させない。
  const guardIds = new Set(Array.isArray(doc.guards) ? doc.guards.map((g) => g?.id) : []);
  const ids = new Set();
  for (const [index, entry] of doc.decisions.entries()) {
    const where = `decisions[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${where}: エントリがマップではない`);
    }
    if (typeof entry.id !== 'string' || !/^[a-z0-9-]+$/.test(entry.id)) {
      throw new Error(
        `${where}: id は kebab-case の文字列で書く（実際: ${JSON.stringify(entry.id)}）`
      );
    }
    if (ids.has(entry.id) || guardIds.has(entry.id)) {
      throw new Error(`${where}: id "${entry.id}" が重複している`);
    }
    ids.add(entry.id);

    if (!DECISION_KINDS.has(entry.kind)) {
      throw new Error(
        `${where} (${entry.id}): kind は ${[...DECISION_KINDS].join(' / ')} のいずれか（実際: ${JSON.stringify(entry.kind)}）`
      );
    }
    if (typeof entry.target !== 'string' || entry.target.trim() === '') {
      throw new Error(`${where} (${entry.id}): target に repo 相対パスを 1 件書く`);
    }
    if (typeof entry.decidedIn !== 'string' || !DECIDED_IN_RE.test(entry.decidedIn)) {
      throw new Error(
        `${where} (${entry.id}): decidedIn は "#<番号>"（実際: ${JSON.stringify(entry.decidedIn)}）`
      );
    }
    if (!ISO_DATE_RE.test(String(entry.decidedAt))) {
      throw new Error(
        `${where} (${entry.id}): decidedAt は YYYY-MM-DD（実際: ${JSON.stringify(entry.decidedAt)}）`
      );
    }
    // 期日が未定の決定を台帳から締め出すと、追跡手段が無い状態（#1843）に戻る。
    // 'undecided' を許すかわりに、なぜ決められないかを notes に必ず書かせる。
    if (entry.reviewAfter !== 'undecided' && !ISO_DATE_RE.test(String(entry.reviewAfter))) {
      throw new Error(
        `${where} (${entry.id}): reviewAfter は YYYY-MM-DD か 'undecided'（実際: ${JSON.stringify(entry.reviewAfter)}）`
      );
    }
    if (
      entry.reviewAfter === 'undecided' &&
      (typeof entry.notes !== 'string' || entry.notes.trim() === '')
    ) {
      throw new Error(
        `${where} (${entry.id}): reviewAfter: undecided なら notes に期日を決められない理由を書く`
      );
    }
    if (entry.reviewAfter !== 'undecided' && entry.reviewAfter < entry.decidedAt) {
      throw new Error(
        `${where} (${entry.id}): reviewAfter (${entry.reviewAfter}) は decidedAt (${entry.decidedAt}) 以降であること`
      );
    }
  }
  return doc.decisions;
}

/** 台帳の `decisions:` をディスクから読んで検証済みエントリを返す。 */
async function loadDecisionLedger() {
  return parseDecisionLedger(await fs.readFile(path.join(ROOT, GUARD_LEDGER_PATH), 'utf8'));
}

/** 台帳が挙げる verifiedBy パスの集合。 */
function collectVerifiedByPaths(entries) {
  return new Set(entries.flatMap((entry) => entry.verifiedBy));
}

/**
 * repo 相対パスの集合のうち、実在するものだけを返す。
 *
 * 「宣言されたパスが実在するか」を見る spec（`guard-ledger-verified-by` /
 * `decision-ledger-target`）の実測側。テストから直接叩けるよう export する
 * （spec 経由では measure が実ディスクを読むため、実在しないパスを注入できない）。
 */
export async function filterExistingPaths(relPaths) {
  const existing = new Set();
  for (const rel of relPaths) {
    const found = await fs.stat(path.join(ROOT, rel)).then(
      () => true,
      () => false
    );
    if (found) existing.add(rel);
  }
  return existing;
}

/**
 * git が追跡しているパス（index 込み）の集合。追跡外なら null を返す。
 *
 * 列挙をファイルシステムだけで行うと、**作業ツリーに落ちた未追跡ファイルが「実体」に混じる**。
 * CI は clean checkout なので緑のまま、手元だけが赤くなり、ローカル検証が信用できなくなる。
 * 実際に 2026-09-08 の実測で、旧版 CLI が書いた `skills/agent-skills/as-*` 5 件が
 * この経路で 3 件の失敗を出していた（同一コミットの CI は緑）。
 *
 * 判定を index 込みの `git ls-files` にすると、CI と pre-commit（lint-staged は stage 済み
 * ファイルを見る）が同じ集合を見る。新規スキルは `git add` した時点で数えられるので、
 * 「宣言と実体を突き合わせる」目的は保たれる。
 *
 * git が無い / repo でない配布形（tarball 等）では null を返し、従来どおり FS を直接見る。
 */
let trackedPathsCache;
function trackedPaths() {
  if (trackedPathsCache !== undefined) return trackedPathsCache;
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const set = new Set(out.split('\0').filter(Boolean));
    trackedPathsCache = set.size > 0 ? set : null;
  } catch {
    trackedPathsCache = null;
  }
  return trackedPathsCache;
}

/** テスト用。`trackedPaths()` のキャッシュを捨てる。 */
export function resetTrackedPathsCache() {
  trackedPathsCache = undefined;
}

/** `relDir/name` 配下に追跡ファイルが 1 つでもあるか。 */
function isTrackedDir(tracked, relDir, name) {
  const prefix = `${relDir}/${name}/`;
  for (const file of tracked) if (file.startsWith(prefix)) return true;
  return false;
}

/** repo-relative なディレクトリ直下のサブディレクトリ名を返す（存在しなければ throw）。 */
async function listDirectories(relDir) {
  const entries = await fs.readdir(path.join(ROOT, relDir), { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const tracked = trackedPaths();
  if (!tracked) return names;
  return names.filter((name) => isTrackedDir(tracked, relDir, name));
}

/** コマンドディレクトリ直下の *.md（README.md を除く）を返す。 */
async function listCommandFiles(relDir) {
  const files = await listMarkdownFiles(relDir);
  const named = files.filter((file) => file !== 'README.md');
  const tracked = trackedPaths();
  if (!tracked) return named;
  return named.filter((file) => tracked.has(`${relDir}/${file}`));
}

/** repo-relative なディレクトリ直下の workflow ファイル名（*.yml / *.yaml）を返す。 */
async function listWorkflowFiles(relDir) {
  const entries = await fs.readdir(path.join(ROOT, relDir), { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name);
  const tracked = trackedPaths();
  if (!tracked) return names;
  return names.filter((name) => tracked.has(`${relDir}/${name}`));
}

/** パイプライン call site チェックリストの所在（#1827）。 */
export const PIPELINE_CHECKLIST_DOC = 'docs/development/pipeline-params-checklist.md';

/**
 * call site 走査に現れない宣言 / パイプライン関数ではない同名関数の除外（理由必須）。
 * グループ id -> { パス: 理由 }。
 */
const PIPELINE_IGNORE_KEYS = {
  'generate-review': {
    'src/ai/factory.mjs':
      'AI クライアントの generateReview メソッドで、パイプライン関数とは別物（チェックリスト冒頭に明記）',
    'tests/integration/local-review.test.mjs':
      '統合テストは generateReview を直接呼ばず CLI 経由で叩くため走査に現れない。チェックリストでも「関連する場合」の注意書き',
  },
  'verify-finding': {},
  'build-execution-plan': {
    'runners/node-api/src/types.ts':
      'ReviewOptions interface の型定義のみで buildExecutionPlan の識別子が現れないため走査対象外',
  },
};

/**
 * 宣言的な spec テーブル。ドキュメントの列挙・件数と実体の対応をここに 1 行で登録する。
 *
 * 各 spec:
 *   id        … doc-enum:ignore で参照する識別子
 *   doc       … 検査対象ドキュメント（repo-relative）
 *   summary   … エラーメッセージに出す「何の列挙か」
 *   marker    … 宣言側の目印（消失時のエラー文に出す）
 *   kind      … 'counts'（キー→数値）か 'names'（名前の集合）
 *   declare   … doc 本文から宣言値を取り出す純関数。マーカー消失時は 'names' なら null を返す
 *   measure   … 実測値を返す async 関数
 *   ignoreKeys… キー単位の除外（値は理由。空の理由はエラーになり、除外として採用されない）
 */
export const DOC_ENUMERATION_SPECS = [
  {
    id: 'skills-stream-counts',
    doc: 'docs/skills-structure.md',
    summary: 'skills/<stream>/ のスキル件数',
    marker: '`├── <stream>/  # <n> スキル` のツリー行',
    kind: 'counts',
    declare: parseSkillStreamCounts,
    // ツリー図はディレクトリ構成の記述なので、ローダーが読める件数ではなく
    // 実ディレクトリ数（skills/<stream>/<skill-id>/）を実体とする。
    measure: async () => {
      const counts = new Map();
      for (const phase of PHASES) {
        counts.set(phase, (await listDirectories(`skills/${phase}`)).length);
      }
      return counts;
    },
  },
  {
    id: 'distributed-commands-table',
    doc: 'docs/development/distributed-commands.md',
    summary: '配布コマンド表の File 列',
    marker: '`Command | File | Purpose` 表',
    kind: 'names',
    declare: (text) => {
      const column = parseMarkdownTableColumn(text, 'File');
      return column && new Set(column.map(unwrapCodeSpan));
    },
    measure: async () => new Set(await listCommandFiles('commands')),
  },
  {
    id: 'repo-dev-commands-table',
    doc: '.claude/commands/README.md',
    summary: 'repo-dev コマンド表の File 列',
    marker: '`Command | File | Purpose` 表',
    kind: 'names',
    declare: (text) => {
      const column = parseMarkdownTableColumn(text, 'File');
      return column && new Set(column.map(unwrapCodeSpan));
    },
    measure: async () => new Set(await listCommandFiles('.claude/commands')),
  },
  {
    // validate-plugin-manifest.mjs の checkClaudeMdCommandParity が見るのは
    // 「Details: distributed commands (...)」の散文だけで、Custom Commands 表は未検証だった。
    id: 'claude-md-command-table',
    doc: 'CLAUDE.md',
    summary: 'CLAUDE.md `Custom Commands` 表のコマンド名',
    marker: '`Command | Purpose` 表',
    kind: 'names',
    declare: (text) => {
      const column = parseMarkdownTableColumn(text, 'Command');
      return column && new Set(column.map(unwrapCodeSpan));
    },
    measure: async () => {
      const distributed = await listCommandFiles('commands');
      const repoDev = await listCommandFiles('.claude/commands');
      return new Set([...distributed, ...repoDev].map((file) => `/${file.replace(/\.md$/, '')}`));
    },
  },
  {
    // #1725 で新設した workflow 入口 README（#1728 で登録）。README は本数（27 本）も
    // 書いているが、counts は「1 本消して 1 本足す」を素通りさせるため names だけを
    // 登録する。counts の spec を重ねて足さないこと。
    id: 'workflows-readme-table',
    doc: '.github/workflows/README.md',
    summary: 'ワークフロー一覧表のファイル列',
    marker: '`ファイル | ワークフロー名 | ...` 表',
    kind: 'names',
    declare: (text) => {
      const column = parseMarkdownTableColumn(text, 'ファイル');
      return column && new Set(column.map(unwrapCodeSpan));
    },
    measure: async () => new Set(await listWorkflowFiles('.github/workflows')),
  },
  {
    // ガード台帳（#1821）。CLAUDE.md の編集は「Always ask」なので、台帳側を SSoT にして
    // CLAUDE.md を従属側として照合する。ガードの追加・改名・削除のいずれでも、
    // 台帳と CLAUDE.md を同じ PR で更新しない限りこの spec が落ちる。
    id: 'claude-md-guard-ledger',
    doc: 'CLAUDE.md',
    summary: 'AI Misoperation Guards の見出し',
    marker: '`## AI Misoperation Guards` 節の `- **<見出し>**:` 行',
    kind: 'names',
    declare: parseGuardTitles,
    measure: async () => new Set((await loadGuardLedger()).map((entry) => entry.title)),
  },
  {
    // 台帳の verifiedBy が実在しないパスを指した瞬間に落とす。
    // 「必須チェックに載る job から実行されるか」までは見ていない（follow-up）。
    id: 'guard-ledger-verified-by',
    doc: GUARD_LEDGER_PATH,
    summary: '台帳 verifiedBy が挙げるパス',
    marker: '`verifiedBy:` の項目',
    kind: 'names',
    declare: (text) => collectVerifiedByPaths(parseGuardLedger(text)),
    measure: async () => filterExistingPaths(collectVerifiedByPaths(await loadGuardLedger())),
  },
  {
    // 期限付きの決定（#1843）。deprecate した資産の削除期日は、これまで対象ファイル自身の
    // コメントにしか無く、そのファイルを開く動機は「削除するとき」しか無かった。
    // target の実在を照合することで、資産を消したのに台帳のエントリが残る／
    // エントリのパスを打ち間違える、のどちらも `Meta consistency` で落ちる。
    id: 'decision-ledger-target',
    doc: GUARD_LEDGER_PATH,
    summary: '台帳 decisions の target が指すパス',
    marker: '`decisions:` の `target:` 行',
    kind: 'names',
    // 決定がすべて片付いて `decisions:` が空になる状態は正常なので、空集合を null（マーカー
    // 消失）扱いにはしない。宣言側が台帳そのものであり、doc へ写した列挙ではないため、
    // regex のすり抜けで検証が空振りする経路も無い。
    declare: (text) => new Set(parseDecisionLedger(text).map((entry) => entry.target)),
    measure: async () =>
      filterExistingPaths(new Set((await loadDecisionLedger()).map((entry) => entry.target))),
  },
  // README のインストール節「得られるもの / What you get」（#1846）。
  // 配布サーフェス（コマンド 7 件・agent-skill 11 件）の宣言はここにしか無く、
  // check-doc-enumerations の spec にも validate-plugin-manifest の
  // checkClaudeMdCommandParity（CLAUDE.md の散文 1 行だけを見る）にも載っていなかったため、
  // コマンド 2 件・skill 3 件の欠落が検出されないまま残っていた。
  readmeSurfaceSpec({
    id: 'readme-ja-plugin-commands',
    doc: 'README.md',
    summary: '「得られるもの」のコマンド列挙',
    marker: '`得られるもの` に続く `- コマンド:` の箇条書き',
    anchor: /^得られるもの/,
    label: /^-\s+コマンド\s*[:：]/,
    pattern: PLUGIN_COMMAND_SPAN_RE,
    measure: measureDistributedCommandNames,
  }),
  readmeSurfaceSpec({
    id: 'readme-ja-plugin-skills',
    doc: 'README.md',
    summary: '「得られるもの」のスキル列挙',
    marker: '`得られるもの` に続く `- スキル:` の箇条書き',
    anchor: /^得られるもの/,
    label: /^-\s+スキル\s*[:：]/,
    pattern: AGENT_SKILL_SPAN_RE,
    measure: measureAgentSkillNames,
  }),
  readmeSurfaceSpec({
    id: 'readme-en-plugin-commands',
    doc: 'README.en.md',
    summary: 'the "What you get" command list',
    marker: '`- Commands:` bullet under `What you get`',
    anchor: /^What you get/,
    label: /^-\s+Commands\s*:/,
    pattern: PLUGIN_COMMAND_SPAN_RE,
    measure: measureDistributedCommandNames,
  }),
  readmeSurfaceSpec({
    id: 'readme-en-plugin-skills',
    doc: 'README.en.md',
    summary: 'the "What you get" skill list',
    marker: '`- Skills:` bullet under `What you get`',
    anchor: /^What you get/,
    label: /^-\s+Skills\s*:/,
    pattern: AGENT_SKILL_SPAN_RE,
    measure: measureAgentSkillNames,
  }),
  // パイプライン関数の call site チェックリスト（#1827）。
  // CLAUDE.md「Propagate signatures」が参照する散文チェックリストは、call site が
  // 新設されても追記されず陳腐化する。実体側の call site を走査して集合一致を要求し、
  // 「チェックリストを見たのに載っていなかった」経路を塞ぐ。
  // 個々のパラメータの転送有無は見ない（options オブジェクト 1 個で渡るため、
  // どのキーが必須かを決定論では判定できない）。
  ...PIPELINE_FUNCTION_GROUPS.map((group) => ({
    id: `pipeline-callsites-${group.id}`,
    doc: PIPELINE_CHECKLIST_DOC,
    summary: `${group.names.join(' / ')} の call site チェックリスト`,
    marker: `\`### 必須: \\\`${group.heading}\\\` …\` 節の \`- [ ] \\\`<path>\\\`\` 行`,
    kind: 'names',
    declare: (text) => parseChecklistPaths(text, group.heading),
    measure: () => findCallSiteFiles(group.names),
    ignoreKeys: PIPELINE_IGNORE_KEYS[group.id],
  })),
];

// 除外判定は素の `key in ignoreKeys` ではなく Object.hasOwn を使う。`in` は
// Object.prototype を辿るため、toString / constructor / valueOf / hasOwnProperty /
// __proto__ などの名前が **理由の登録なしに黙って除外扱い**となり、
// 「理由なしの黙殺を作らない」という resolveIgnoreKeys の保証をキー名次第で迂回できてしまう
// （= CI が通っているのに検証されていない状態を作る）。`in` に戻さないこと。
function isIgnoredKey(ignoreKeys, key) {
  return Object.hasOwn(ignoreKeys, key);
}

/** 件数系の差分。 */
function diffCounts(spec, declared, measured, ignoreKeys) {
  const errors = [];
  for (const [key, actual] of measured) {
    if (isIgnoredKey(ignoreKeys, key)) continue;
    if (!declared.has(key)) {
      errors.push(
        `${spec.doc} [${spec.id}]: "${key}" の件数宣言が見つからない（マーカー: ${spec.marker}）`
      );
      continue;
    }
    const claimed = declared.get(key);
    if (claimed !== actual) {
      errors.push(
        `${spec.doc} [${spec.id}]: ${spec.summary} の "${key}" は ${claimed} と書かれているが実測は ${actual}`
      );
    }
  }
  for (const key of declared.keys()) {
    if (isIgnoredKey(ignoreKeys, key)) continue;
    if (!measured.has(key)) {
      errors.push(`${spec.doc} [${spec.id}]: "${key}" を宣言しているが実測対象に存在しない`);
    }
  }
  return errors;
}

/** 名前集合の差分。 */
function diffNames(spec, declared, measured, ignoreKeys) {
  const errors = [];
  const isIgnored = (name) => isIgnoredKey(ignoreKeys, name);
  const declaredNames = [...declared].filter((name) => !isIgnored(name));
  const measuredNames = [...measured].filter((name) => !isIgnored(name));
  const declaredSet = new Set(declaredNames);
  const measuredSet = new Set(measuredNames);

  for (const name of measuredNames.sort()) {
    if (!declaredSet.has(name)) {
      errors.push(
        `${spec.doc} [${spec.id}]: 実体に "${name}" があるが ${spec.summary} に載っていない（行を追加する）`
      );
    }
  }
  for (const name of declaredNames.sort()) {
    if (!measuredSet.has(name)) {
      errors.push(
        `${spec.doc} [${spec.id}]: ${spec.summary} が "${name}" を挙げているが実体に存在しない（行を削除する）`
      );
    }
  }
  return errors;
}

/**
 * spec テーブル側の `ignoreKeys` を検証し、理由が書かれたものだけを除外として採用する。
 * doc 側の `doc-enum:ignore` と同じ「理由必須」を spec 側にも課すためのガード。
 * 理由が空のエントリは**除外として採用しない**ので、そのキーは通常どおり比較され、
 * 検証が黙って空振りすることがない。
 *
 * @param {{ doc: string, id: string }} spec
 * @param {Record<string, unknown> | undefined} ignoreKeys
 * @returns {{ accepted: Record<string, string>, errors: string[] }}
 */
export function resolveIgnoreKeys(spec, ignoreKeys) {
  const accepted = {};
  const errors = [];
  for (const [key, reason] of Object.entries(ignoreKeys ?? {})) {
    if (typeof reason === 'string' && reason.trim() !== '') {
      accepted[key] = reason;
      continue;
    }
    errors.push(
      `${spec.doc} [${spec.id}]: ignoreKeys["${key}"] に理由が無い — ` +
        `除外理由を空でない文字列で書く（理由なしの除外は許可しない）`
    );
  }
  return { accepted, errors };
}

/**
 * 1 件も検証しないまま OK を返さないための最後の防波堤。
 * 全 spec が ignore / マーカー欠落 / 読み取り失敗で脱落すると、
 * 「落ちないが何も守っていない」= 検証が空振りしている状態になる。
 * 本 script は「空振りする方が落ちるより危険」を設計方針にしているため、
 * これは OK ではなくエラーとして扱う。
 */
export const NOTHING_CHECKED_ERROR =
  '1 件も検証していない（全 spec が ignore またはスキップされた） — ' +
  'doc-enum:ignore を外すか spec を修正すること。検証ゼロで OK にはしない';

/** `Map` でも `Set` でもキー（名前）の配列を返す。 */
function keysOf(value) {
  return value instanceof Map ? [...value.keys()] : [...value];
}

/** 既定の doc リーダー。テストからは差し替えて注入できるようにしておく。 */
async function readDocFromDisk(docPath) {
  return fs.readFile(path.join(ROOT, docPath), 'utf8');
}

/**
 * spec テーブルを走らせて宣言と実体を突き合わせる。
 *
 * @param {{ specs?: typeof DOC_ENUMERATION_SPECS, readDoc?: (doc: string) => Promise<string> }} [options]
 * @returns {Promise<{ errors: string[], skipped: string[], checked: number }>}
 */
export async function checkDocEnumerations({
  specs = DOC_ENUMERATION_SPECS,
  readDoc = readDocFromDisk,
} = {}) {
  const errors = [];
  const skipped = [];
  let checked = 0;

  for (const spec of specs) {
    let text;
    try {
      text = await readDoc(spec.doc);
    } catch (err) {
      errors.push(`${spec.doc} [${spec.id}]: ドキュメントを読めない (${err.message})`);
      continue;
    }

    const ignores = parseIgnoreDirectives(text);
    if (ignores.has(spec.id)) {
      const reason = ignores.get(spec.id);
      if (!reason) {
        errors.push(
          `${spec.doc} [${spec.id}]: doc-enum:ignore に理由が無い — ` +
            `\`<!-- doc-enum:ignore ${spec.id} -- <理由> -->\` の形式で理由を書く`
        );
      } else {
        skipped.push(`${spec.doc} [${spec.id}]: ${reason}`);
      }
      continue;
    }

    // kind の typo（'count' 等）は黙って diffNames に落ちるので、ここで弾く。
    if (spec.kind !== 'counts' && spec.kind !== 'names') {
      errors.push(
        `${spec.doc} [${spec.id}]: kind "${spec.kind}" は未知 — 'counts' か 'names' を指定する`
      );
      continue;
    }

    let measured;
    try {
      measured = await spec.measure();
    } catch (err) {
      errors.push(`${spec.doc} [${spec.id}]: 実測に失敗した (${err.message})`);
      continue;
    }

    // declare も measure と同じく包む。1 つの spec の throw で全 spec が
    // 中断すると、どの spec が原因か分からなくなるため。
    let declared;
    try {
      declared = spec.declare(text);
    } catch (err) {
      errors.push(`${spec.doc} [${spec.id}]: 宣言の解析に失敗した (${err.message})`);
      continue;
    }
    if (declared === null || declared === undefined) {
      errors.push(
        `${spec.doc} [${spec.id}]: 宣言側のマーカー（${spec.marker}）が見つからない — ` +
          `doc の形式を戻すか、scripts/check-doc-enumerations.mjs の spec を更新する`
      );
      continue;
    }

    checked += 1;
    const { accepted: ignoreKeys, errors: ignoreKeyErrors } = resolveIgnoreKeys(
      spec,
      spec.ignoreKeys
    );
    errors.push(...ignoreKeyErrors);

    // 期限切れ除外の検知。除外キーは declared / measured の両方向をマスクするため、
    // 実体にも宣言にも無いキーの除外が残ると、そのファイルが将来復活しても
    // 永久に検査されない。
    const universe = new Set([...keysOf(declared), ...keysOf(measured)]);
    for (const key of Object.keys(ignoreKeys)) {
      if (!universe.has(key)) {
        errors.push(
          `${spec.doc} [${spec.id}]: ignoreKeys["${key}"] は宣言にも実体にも存在しない — ` +
            `期限切れの除外なので削除する（残すと復活時に検査されない）`
        );
      }
    }

    errors.push(
      ...(spec.kind === 'counts'
        ? diffCounts(spec, declared, measured, ignoreKeys)
        : diffNames(spec, declared, measured, ignoreKeys))
    );
  }

  if (specs.length > 0 && checked === 0) {
    errors.push(NOTHING_CHECKED_ERROR);
  }

  return { errors, skipped, checked };
}

// CLI entry point
if (isDirectRun(import.meta.url)) {
  checkDocEnumerations()
    .then(({ errors, skipped, checked }) => {
      for (const note of skipped) {
        console.log(`  (ignored) ${note}`);
      }
      if (errors.length === 0) {
        console.log(`Doc enumerations: OK (${checked} spec(s) checked, ${skipped.length} ignored)`);
        return 0;
      }
      console.error(`Doc enumerations: ${errors.length} error(s) found`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      console.error('');
      console.error('spec: scripts/check-doc-enumerations.mjs (DOC_ENUMERATION_SPECS)');
      console.error('運用: docs/development/doc-enumeration-checks.md');
      return 1;
    })
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Doc enumeration check failed: ${err.message}`);
      process.exitCode = 1;
    });
}
