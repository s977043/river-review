// `parseArgs` のオプション連鎖。src/cli.mjs から順序を保ったまま純粋に移設して
// いる（リファクタリング Step 4）。判定も副作用も変えていない。
//
// 連鎖は上から順に評価される。移設は必ず**残りの連鎖の先頭から**行うこと。
// 途中の分岐だけを持ち出すと評価順が変わる。
//
// `usageError` は移していない。usage hint を stdout へ出しつつ
// `parsed.usageError` を立てる副作用で、`parseArgs` の 70 箇所以上から呼ばれる。
// 引数で渡すと依存注入になるため、本関数は stderr への出力までを行い、
// ループを抜けるべきことを `'break'` で返す。呼び出し側が続けて `usageError` を
// 呼ぶので、出力の順序は移設前と同じである。

import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { SEVERITY_RANK } from '../../lib/finding-factory.mjs';
import { PHASES, PLANNER_MODES } from '../../lib/planner-utils.mjs';
import { DEPTH_TO_REVIEW_MODE } from '../../lib/review-plan-generator.mjs';
import { listFlowEntryNames } from '../../lib/flow-loader.mjs';
import { parseList } from '../../lib/utils.mjs';

const SEVERITY_VALUES = Object.keys(SEVERITY_RANK);

/** Values accepted by `--output`. */
const OUTPUT_MODES = ['text', 'markdown', 'json', 'yaml', 'html'];

/** Values accepted by `--format` (review plan|exec|verify|route). */
const REVIEW_FORMATS = ['text', 'markdown', 'json'];

/** Values accepted by `skills list --source`. */
const SKILLS_LIST_SOURCES = ['rr', 'agent', 'all'];

/**
 * 1 トークン分のオプションを読み取る。
 *
 * @param {object} parsed
 * @param {string} arg 読み取り済みのトークン
 * @param {string[]} args 残りの argv（破壊的に shift する）
 * @returns {'continue'|'break'|null}
 *   `'continue'` 呼び出し側はループを継続する。
 *   `'break'` 呼び出し側は `usageError(parsed)` を呼んでループを抜ける。
 *   `null` 本関数は扱わない。呼び出し側の連鎖へ落とす。
 */
export function consumeOption(parsed, arg, args) {
  if (arg === '--plan-only') {
    parsed.planOnly = true;
    return 'continue';
  }
  if (arg === '--fail-on' || arg === '--warn-on') {
    const value = args.shift();
    const sev = value ? value.toLowerCase() : '';
    if (!SEVERITY_VALUES.includes(sev)) {
      console.error(
        `Error: ${arg} must be one of: ${SEVERITY_VALUES.join(', ')} (got "${value ?? ''}").`
      );
      return 'break';
    }
    if (arg === '--fail-on') parsed.failOn = sev;
    else parsed.warnOn = sev;
    return 'continue';
  }
  if (arg === '--advisory-only') {
    parsed.advisoryOnly = true;
    return 'continue';
  }
  if (arg === '--gate') {
    parsed.gate = true;
    return 'continue';
  }
  if (arg === '--offline' || arg === '--rules-only') {
    parsed.offline = true;
    return 'continue';
  }
  if (arg === '--plan') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --plan option requires a path.');
      return 'break';
    }
    parsed.planFile = value;
    return 'continue';
  }
  if (arg === '--output-file') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --output-file option requires a path.');
      return 'break';
    }
    parsed.outputFile = value;
    return 'continue';
  }
  if (arg === '--summary-file') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --summary-file option requires a path.');
      return 'break';
    }
    parsed.summaryFile = value;
    return 'continue';
  }
  if (arg === '--quiet') {
    parsed.quiet = true;
    return 'continue';
  }
  if (arg === '--artifacts-dir') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --artifacts-dir option requires a path.');
      return 'break';
    }
    parsed.artifactsDir = value;
    return 'continue';
  }
  if (arg === '--artifact') {
    const value = args.shift();
    const eq = value ? value.indexOf('=') : -1;
    if (!value || value.startsWith('-') || eq <= 0) {
      console.error('Error: --artifact requires <id>=<path> (e.g. --artifact plan=./plan.md).');
      return 'break';
    }
    parsed.cliArtifacts[value.slice(0, eq)] = value.slice(eq + 1);
    return 'continue';
  }
  if (arg === '--ensemble') {
    // #911 Phase 3 Slice B. Sugar for "concatenate every *.md file under
    // <dir> into a single review-external artifact". The synthesis skill
    // (`independent-review-synthesis`) consumes the merged
    // file. We deliberately do NOT pin specific reviewer names (Claude /
    // Codex / Cursor) in the flag — file names carry that information, so
    // the CLI stays provider-agnostic.
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error(
        'Error: --ensemble requires a directory path (e.g. --ensemble ./.river/reviews).'
      );
      return 'break';
    }
    if (parsed.cliArtifacts['review-external']) {
      console.warn(
        'Warning: --ensemble ignored because --artifact review-external=... is already set. Remove the --artifact flag or drop --ensemble.'
      );
      return 'continue';
    }
    const dir = path.resolve(process.cwd(), value);
    let files;
    try {
      files = readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort();
    } catch (err) {
      console.error(`Error: --ensemble cannot read directory ${value}: ${err.message}`);
      return 'break';
    }
    if (files.length === 0) {
      console.error(`Error: --ensemble found no *.md files in ${value}.`);
      return 'break';
    }
    const merged = files
      .map((f) => `\n\n---\nFrom: ${f}\n---\n\n${readFileSync(path.join(dir, f), 'utf8')}`)
      .join('');
    const tmpPath = path.join(os.tmpdir(), `river-ensemble-${process.pid}-${Date.now()}.md`);
    writeFileSync(tmpPath, merged);
    process.on('exit', () => {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors — OS will reclaim tmpdir
      }
    });
    parsed.cliArtifacts['review-external'] = tmpPath;
    return 'continue';
  }
  if (arg === '--phase') {
    if (!args[0] || args[0].startsWith('-')) {
      console.error('Error: --phase option requires a value.');
      return 'break';
    }
    const value = args.shift();
    // #1746 follow-up: an invalid phase used to exit 0 and fall back to the
    // default (`midstream`) downstream in normalizePhase, so the run silently
    // reviewed a different phase than the one that was typed. PHASES is the
    // shared vocabulary in src/lib/planner-utils.mjs.
    //
    // Case-insensitive, and the lowercased value is what gets stored. That is
    // `normalizePhase`'s (src/lib/local-runner.mjs) semantics, pinned by
    // tests/local-runner-internals.test.mjs "normalizes case" — so
    // `--phase Upstream` really did run as `upstream` and MUST keep working.
    // `normalizePhase` itself cannot be the validator here: its contract is to
    // fall back to `midstream` for anything invalid, which is exactly the
    // silent fallback this guard removes. It also matches the shape the
    // sibling enum options in this parser already use (--planner / --output /
    // --format / --fail-on all lowercase before comparing).
    const phase = value.toLowerCase();
    if (!PHASES.includes(phase)) {
      console.error(`Error: --phase must be one of: ${PHASES.join(', ')} (got "${value}").`);
      return 'break';
    }
    parsed.phase = phase;
    // #1759 C2: marks that --phase already validated and set parsed.phase,
    // so the post-loop RIVER_PHASE check below must not re-derive it from
    // the (possibly invalid) env var and must not report a second error.
    parsed.phaseExplicit = true;
    return 'continue';
  }
  if (arg === '--cases') {
    const value = args.shift();
    // #1709 Slice 3 (B3): a trailing `--cases` used to null the field, so
    // eval silently fell back to the DEFAULT fixtures and printed [PASS].
    if (!value || value.startsWith('-')) {
      console.error('Error: --cases option requires a path.');
      return 'break';
    }
    parsed.fixturesCasesPath = value;
    return 'continue';
  }
  if (arg === '--verbose') {
    parsed.verbose = true;
    return 'continue';
  }
  if (arg === '--planner') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --planner option requires a value.');
      return 'break';
    }
    const mode = value.toLowerCase();
    if (!PLANNER_MODES.includes(mode)) {
      console.error(
        `Error: --planner must be one of: ${PLANNER_MODES.join(', ')} (got "${value}").`
      );
      return 'break';
    }
    parsed.plannerMode = mode;
    return 'continue';
  }
  if (arg === '--dry-run') {
    parsed.dryRun = true;
    return 'continue';
  }
  if (arg === '--debug') {
    parsed.debug = true;
    return 'continue';
  }
  if (arg === '--explain') {
    parsed.explain = true;
    return 'continue';
  }
  if (arg === '--estimate') {
    parsed.estimate = true;
    return 'continue';
  }
  if (arg === '--max-cost') {
    const value = args.shift();
    parsed.maxCost = value ? Number.parseFloat(value) : null;
    if (!Number.isFinite(parsed.maxCost) || parsed.maxCost < 0) {
      console.error('Error: --max-cost requires a non-negative numeric value.');
      return 'break';
    }
    return 'continue';
  }
  if (arg === '--output') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --output option requires a value.');
      return 'break';
    }
    const mode = value.toLowerCase();
    if (!OUTPUT_MODES.includes(mode)) {
      console.error(`Error: --output must be one of: ${OUTPUT_MODES.join(', ')} (got "${value}").`);
      return 'break';
    }
    parsed.output = mode;
    parsed.outputExplicit = true;
    return 'continue';
  }
  if (arg === '--format') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --format option requires a value.');
      return 'break';
    }
    const mode = value.toLowerCase();
    if (!REVIEW_FORMATS.includes(mode)) {
      console.error(
        `Error: --format must be one of: ${REVIEW_FORMATS.join(', ')} (got "${value}").`
      );
      return 'break';
    }
    parsed.format = mode;
    parsed.formatExplicit = true;
    return 'continue';
  }
  if (arg === '--context') {
    const value = args.shift();
    // #1709 Slice 3: a trailing `--context` used to become parseList(undefined)
    // = [] in silence (same for --dependency below).
    if (!value || value.startsWith('-')) {
      console.error('Error: --context option requires a comma-separated list.');
      return 'break';
    }
    // Deliberately NOT warned here: `--context` is last-wins (this is a plain
    // assignment, not a merge), so warning per occurrence reports values that
    // the run never uses — `--context BOGUS --context diff` warned about
    // BOGUS even though `diff` is what survives. The warning is emitted once
    // after the loop, against the surviving list (#1958 review, nit 5).
    parsed.availableContexts = parseList(value);
    return 'continue';
  }
  if (arg === '--dependency') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --dependency option requires a comma-separated list.');
      return 'break';
    }
    parsed.availableDependencies = parseList(value);
    return 'continue';
  }
  if (arg === '--reviewers') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error(
        'Error: --reviewers option requires a value (e.g. bug-hunter,security-scanner).'
      );
      return 'break';
    }
    parsed.reviewers = parseList(value);
    return 'continue';
  }
  if (arg === '--baseline') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --baseline option requires a file path.');
      return 'break';
    }
    parsed.baseline = value;
    return 'continue';
  }
  if (arg === '--base') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --base option requires a branch or ref (e.g. --base main).');
      return 'break';
    }
    parsed.base = value;
    return 'continue';
  }
  if (arg === '--entry') {
    const value = args.shift();
    if (!value || value.startsWith('-') || value.trim() === '') {
      console.error(
        'Error: --entry option requires a review Flow entry name (e.g. --entry review-plan).'
      );
      return 'break';
    }
    // #2054 PR-3: an unknown entry name is a usage error here, listing the
    // accepted names, rather than a handler-level exit 3 — the vocabulary is
    // data (the entry map), so it is read through the single Flow reader.
    // If the assets cannot be loaded at all the handler reports that with
    // its own message; parse only validates when it can.
    let known = null;
    try {
      known = listFlowEntryNames();
    } catch {
      known = null;
    }
    if (known !== null && !known.includes(value)) {
      console.error(`Error: unknown --entry "${value}". Accepted entries: ${known.join(', ')}.`);
      return 'break';
    }
    parsed.entry = value;
    return 'continue';
  }
  if (arg === '--skill-set') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --skill-set option requires a name (e.g. --skill-set comprehensive).');
      return 'break';
    }
    parsed.skillSet = value;
    return 'continue';
  }
  if (arg === '--depth') {
    const value = args.shift();
    const valid = Object.keys(DEPTH_TO_REVIEW_MODE);
    if (!value || !valid.includes(value)) {
      console.error(`Error: --depth must be one of: ${valid.join(', ')} (got "${value ?? ''}").`);
      return 'break';
    }
    parsed.depth = value;
    return 'continue';
  }
  if (arg === '--save') {
    parsed.save = true;
    return 'continue';
  }
  // Skills subcommand options
  if (arg === '--from') {
    const value = args.shift();
    // #1709 Slice 3: a trailing `--from` / `--to` used to null the field in
    // silence, so `skills import --from` ran against the default instead.
    if (!value || value.startsWith('-')) {
      console.error('Error: --from option requires a path.');
      return 'break';
    }
    parsed.fromPath = value;
    return 'continue';
  }
  if (arg === '--to') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --to option requires a path.');
      return 'break';
    }
    parsed.toPath = value;
    return 'continue';
  }
  if (arg === '--strict') {
    parsed.validationMode = 'strict';
    return 'continue';
  }
  if (arg === '--loose') {
    parsed.validationMode = 'loose';
    return 'continue';
  }
  if (arg === '--source') {
    const value = args.shift();
    if (!value || !SKILLS_LIST_SOURCES.includes(value)) {
      console.error(
        `Error: --source must be one of: ${SKILLS_LIST_SOURCES.join(', ')} (got "${value}").`
      );
      return 'break';
    }
    parsed.listSource = value;
    return 'continue';
  }
  if (arg === '--include-assets') {
    parsed.includeAssets = true;
    return 'continue';
  }
  return null;
}
