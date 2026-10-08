import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  MIN_WINDOW_SAMPLES,
  SIGNAL_REGISTRY_PATH,
  buildReport,
  filterByRepo,
  listOverdueGuards,
  main,
  parsePromptLog,
  parseSignalRegistry,
} from '../scripts/harness/permission-prompt-report.mjs';
import { firstCommandWord, splitShellSegments } from '../scripts/harness/shell-segments.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const INTRODUCED_AT = '2026-10-06T12:00:00Z';
const MINUTE = 60 * 1000;

function registryText(introducedAt = INTRODUCED_AT, reviewAfter = '2026-12-01') {
  return [
    'rules:',
    '  - id: no-cd-in-bash',
    '    source: docs/development/worker-discipline-template.md',
    "    introducedIn: '#2559'",
    `    introducedAt: '${introducedAt}'`,
    `    reviewAfter: '${reviewAfter}'`,
    '    signal:',
    '      kind: permission-prompt-first-command',
    '      toolName: Bash',
    '      command: cd',
  ].join('\n');
}

const LEDGER_TEXT = [
  'guards:',
  '  - { id: past, title: Past, mechanized: none, verifiedBy: [], addedAt: unknown, reviewAfter: "2026-09-01" }',
  '  - { id: today, title: Today, mechanized: none, verifiedBy: [], addedAt: unknown, reviewAfter: "2026-10-07" }',
  '  - { id: future, title: Future, mechanized: none, verifiedBy: [], addedAt: unknown, reviewAfter: "2026-11-01" }',
].join('\n');

/**
 * 導入時刻の前後に 1 分おきの行を作る。cdShare は Bash `cd` 始まりの割合。
 */
function makeRows({ count, cdShare, side, cwd = '/repo/a' }) {
  const at = Date.parse(INTRODUCED_AT);
  const cdCount = Math.round(count * cdShare);
  return Array.from({ length: count }, (_, i) => ({
    ts: new Date(side === 'before' ? at - (i + 1) * MINUTE : at + (i + 1) * MINUTE)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
    cwd,
    tool_name: 'Bash',
    tool_input: { command: i < cdCount ? 'cd /repo/a && npm test' : 'npm test' },
  }));
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

function report(logRows, extra = {}) {
  return buildReport({
    logText: toJsonl(logRows),
    registryText: registryText(),
    ledgerText: LEDGER_TEXT,
    today: '2026-10-07',
    ...extra,
  });
}

describe('firstCommandWord / splitShellSegments', () => {
  test('先頭の cd を拾う', () => {
    assert.equal(firstCommandWord('cd /x && ls'), 'cd');
    assert.equal(firstCommandWord('ls && cd /x'), 'ls');
  });

  test('先頭の環境変数代入と代入だけの segment を読み飛ばす', () => {
    assert.equal(firstCommandWord('FOO=1 BAR="a b" cd /x'), 'cd');
    assert.equal(firstCommandWord('R=/p; cd $R'), 'cd');
    assert.equal(firstCommandWord('X=$(git -C a rev-parse HEAD); echo $X'), 'echo');
    assert.equal(firstCommandWord('( cd x && make )'), 'cd');
  });

  test('クォート内の && や ; では分けない', () => {
    assert.deepEqual(splitShellSegments('echo "a && cd b"; ls'), ['echo "a && cd b"', 'ls']);
    assert.deepEqual(splitShellSegments("echo 'x; cd y' || true"), ["echo 'x; cd y'", 'true']);
  });

  test('heredoc 本体は segment に含めない', () => {
    assert.deepEqual(splitShellSegments('cat <<EOF > f\ncd nowhere\nEOF\nls'), [
      'cat <<EOF > f',
      'ls',
    ]);
    assert.deepEqual(splitShellSegments("cat <<-'E' | sh\nx; y\n  E\ncd z"), [
      "cat <<-'E'",
      'sh',
      'cd z',
    ]);
    assert.equal(firstCommandWord('cat <<EOF\ncd a\nEOF'), 'cat');
  });

  test('リダイレクトの & と行継続では分けない', () => {
    assert.deepEqual(splitShellSegments('ls 2>&1 | grep a'), ['ls 2>&1', 'grep a']);
    assert.deepEqual(splitShellSegments('cmd >&2; cd a'), ['cmd >&2', 'cd a']);
    assert.deepEqual(splitShellSegments('ls \\\n && cd b'), ['ls', 'cd b']);
  });

  test('コメント行と空入力', () => {
    assert.equal(firstCommandWord('# note\ncd a'), 'cd');
    assert.equal(firstCommandWord(''), null);
    assert.equal(firstCommandWord(undefined), null);
  });
});

describe('analyzeRule の判定', () => {
  test('導入後に割合が 30% 以上下がれば effective', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0.1, side: 'after' }),
    ];
    const [result] = report(rows).results;
    assert.equal(result.verdict, 'effective');
    assert.equal(result.before.hits, 30);
    assert.equal(result.after.hits, 6);
  });

  test('割合が変わらなければ no-effect', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0.45, side: 'after' }),
    ];
    assert.equal(report(rows).results[0].verdict, 'no-effect');
  });

  test('窓の件数が最小件数に満たなければ insufficient-data', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: MIN_WINDOW_SAMPLES - 1, cdShare: 0, side: 'after' }),
    ];
    assert.equal(report(rows).results[0].verdict, 'insufficient-data');
  });

  test('導入前に signal が 0 件なら insufficient-data', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0, side: 'after' }),
    ];
    assert.equal(report(rows).results[0].verdict, 'insufficient-data');
  });

  test('窓は導入時刻を挟む同じ長さに揃える', () => {
    // 導入前 120 分・導入後 60 分 → 窓は 60 分。導入前の古い 60 分は数えない
    const rows = [
      ...makeRows({ count: 120, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0.1, side: 'after' }),
    ];
    const [result] = report(rows).results;
    assert.equal(result.windowMs, 60 * MINUTE);
    assert.equal(result.before.total, 60);
    assert.equal(result.after.total, 60);
  });
});

describe('--repo の絞り込み', () => {
  test('接頭辞と一致する cwd とその配下だけを残す', () => {
    const rows = [
      { cwd: '/repo/a' },
      { cwd: '/repo/a/.claude/worktrees/x' },
      { cwd: '/repo/ab' },
      { cwd: '/other' },
    ];
    assert.deepEqual(
      filterByRepo(rows, '/repo/a/').map((row) => row.cwd),
      ['/repo/a', '/repo/a/.claude/worktrees/x']
    );
    assert.equal(filterByRepo(rows, undefined).length, 4);
  });

  test('判定は絞り込んだ行で行う', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0.1, side: 'after' }),
      ...makeRows({ count: 60, cdShare: 0, side: 'before', cwd: '/other' }),
    ];
    const result = report(rows, { repo: '/repo/a' });
    assert.equal(result.rows, 120);
    assert.equal(result.results[0].before.total, 60);
  });
});

describe('ログと台帳の読み込み', () => {
  test('読めない行は invalid として数えて捨てる', () => {
    const { rows, invalid } = parsePromptLog(
      '{"ts":"2026-10-06T00:00:00Z"}\nnot json\n{"no":"ts"}\n'
    );
    assert.equal(rows.length, 1);
    assert.equal(invalid, 2);
  });

  test('reviewAfter が today 以前のガードを列挙する', () => {
    assert.deepEqual(
      listOverdueGuards(LEDGER_TEXT, '2026-10-07').map((guard) => guard.id),
      ['past', 'today']
    );
  });

  test('退役候補に期日到来のガード・ルールと no-effect のルールを載せる', () => {
    const rows = [
      ...makeRows({ count: 60, cdShare: 0.5, side: 'before' }),
      ...makeRows({ count: 60, cdShare: 0.5, side: 'after' }),
    ];
    const candidates = buildReport({
      logText: toJsonl(rows),
      registryText: registryText(INTRODUCED_AT, '2026-10-01'),
      ledgerText: LEDGER_TEXT,
      today: '2026-10-07',
    }).retireCandidates.map((c) => `${c.kind}:${c.id}`);
    assert.deepEqual(candidates, [
      'guard:past',
      'guard:today',
      'rule:no-cd-in-bash',
      'rule:no-cd-in-bash',
    ]);
  });

  test('実台帳の harness-signals.yaml は形式検証を通る', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, SIGNAL_REGISTRY_PATH), 'utf8');
    assert.ok(parseSignalRegistry(text).length > 0);
  });

  test('introducedAt が UTC 形式でなければ throw する', () => {
    assert.throws(() => parseSignalRegistry(registryText('2026-10-07T07:19:55+09:00')));
  });
});

describe('main の終了コード', () => {
  let dir;
  let logs;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-report-'));
    logs = {
      noEffect: path.join(dir, 'no-effect.jsonl'),
      missing: path.join(dir, 'missing.jsonl'),
    };
    const at = Date.parse('2026-10-06T22:19:55Z');
    const rows = Array.from({ length: 120 }, (_, i) => ({
      ts: new Date(at + (i - 60) * MINUTE + 1000).toISOString(),
      cwd: '/repo/a',
      tool_name: 'Bash',
      tool_input: { command: i % 2 === 0 ? 'cd /x && ls' : 'ls' },
    }));
    fs.writeFileSync(logs.noEffect, toJsonl(rows));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function run(args) {
    const original = console.log;
    console.log = () => {};
    try {
      return await main(args);
    } finally {
      console.log = original;
    }
  }

  test('--check なしは no-effect でも 0', async () => {
    assert.equal(await run(['--log', logs.noEffect, '--today', '2026-10-07']), 0);
  });

  test('--check は no-effect のルールがあれば 1', async () => {
    assert.equal(await run(['--log', logs.noEffect, '--today', '2026-10-07', '--check']), 1);
  });

  test('ログが無くても 0', async () => {
    assert.equal(await run(['--log', logs.missing, '--today', '2026-10-07', '--check']), 0);
  });
});
