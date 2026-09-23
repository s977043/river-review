// #1713: markdown レポートの「人間向けサマリー先頭固定 + 段階的開示」の回帰テスト。
//
// Slice 1 (`src/cli/render.mjs`): 判定・件数・スコアを先頭 1 行に固定し、
// critical / major を常時展開、minor / info と実行ログを `<details>` に畳む。
// Slice 2: `teamLeadReport`（`--reviewers` 実行時のみ）の markdown 昇格。
//
// ここで機械的に固定する不変条件:
//   - 指摘 0 件時の初期表示行数（`<details>` を畳んだ状態で見える行）が 10 行以下
//   - critical / major は `<details>` の外、minor / info は `<details>` の中
//   - 畳んだ指摘は全文が残る（削除・打ち切りをしない）
//   - `<summary>` は必ず件数を持ち、直後に空行がある（GitHub の描画条件）
//   - json / yaml / html の成果物はバイト単位で不変
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildHumanDecisionSurface,
  formatHumanDecisionSurfaceMarkdown,
  formatJsonOutput,
  printMarkdownReport,
} from '../src/cli/render.mjs';
import { formatYamlOutput } from '../src/lib/output-formatters/yaml.mjs';
import { formatHtmlOutput } from '../src/lib/output-formatters/html.mjs';

/** printMarkdownReport の stdout を文字列で受け取る。 */
function renderMarkdown(result, phase = 'midstream') {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.map(String).join(' '));
  try {
    printMarkdownReport(result, phase);
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n');
}

/**
 * `<details>` をすべて畳んだ状態で読み手に見える行を返す。
 * 空行と `<details>` / `</details>` タグ自体は何も描画しないので数えず、
 * 折りたたみブロックからは（最上位の）`<summary>` の 1 行だけを数える。
 */
function initiallyVisibleLines(markdown) {
  const visible = [];
  let depth = 0;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<details')) {
      depth++;
      continue;
    }
    if (line.startsWith('</details>')) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) {
      if (depth === 1 && line.startsWith('<summary>')) visible.push(line);
      continue;
    }
    if (line === '') continue;
    visible.push(line);
  }
  return visible;
}

/** `<details>` ブロックの中身（`<summary>` 行を除く）だけを返す。 */
function collapsedBody(markdown) {
  const body = [];
  let depth = 0;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<details')) {
      depth++;
      continue;
    }
    if (line.startsWith('</details>')) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0 && !line.startsWith('<summary>')) body.push(raw);
  }
  return body.join('\n');
}

/** `<details>` の外に残っている本文（常時展開部分）。 */
function expandedBody(markdown) {
  const body = [];
  let depth = 0;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<details')) {
      depth++;
      continue;
    }
    if (line.startsWith('</details>')) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) body.push(raw);
  }
  return body.join('\n');
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function makeFinding(overrides = {}) {
  const finding = {
    id: 'rr-1',
    ruleId: 'logging-observability',
    file: 'src/app.js',
    lineStart: 5,
    lineEnd: 5,
    title: 'catch で例外が握りつぶされる',
    severity: 'major',
    confidence: 'high',
    status: 'open',
    evidence: ['catch 内で return'],
    ...overrides,
  };
  // review-engine.mjs は message の `Finding:` ラベルから title を作るので、
  // fixture でも title を message に含めて実データの関係を保つ。
  finding.message =
    overrides.message ??
    `Finding: ${finding.title} Evidence: catch 内で return Impact: 障害調査が困難 Fix: ログ+再throw Severity: warning Confidence: high`;
  return finding;
}

/** finding と 1:1 対応する comment（review-engine.mjs の構築規則に合わせる）。 */
function commentFor(finding) {
  return {
    skillId: finding.ruleId,
    file: finding.file,
    line: finding.lineStart,
    message: finding.message,
  };
}

function makeResult({
  findings = [],
  comments,
  suppressed = [],
  overflow = [],
  plan,
  teamLeadReport = null,
  reviewDebug,
} = {}) {
  return {
    findings,
    // `comments` を明示指定できるのは F1 の再現用。実行時は findings と
    // comments が別集合になりうる（--reviewers の dedup / 抑制の fingerprint 照合）。
    comments: comments ?? findings.map(commentFor),
    classified: suppressed.length || overflow.length ? { suppressed, overflow } : undefined,
    plan: plan ?? { selected: [], skipped: [] },
    changedFiles: ['src/app.js'],
    tokenEstimate: 42,
    teamLeadReport,
    ...(reviewDebug ? { reviewDebug } : {}),
  };
}

/** ヘッドライン行（`**判定: ...`）を取り出す。 */
function headlineOf(markdown) {
  return markdown.split('\n').find((line) => line.startsWith('**判定: ')) ?? '';
}

// -----------------------------------------------------------------------------
// Slice 1: サマリー先頭固定 + 段階的開示
// -----------------------------------------------------------------------------

describe('#1713 Slice 1: markdown headline and progressive disclosure', () => {
  it('keeps the initial view of a zero-finding run to 10 lines or fewer', () => {
    const plan = {
      selected: Array.from({ length: 15 }, (_, i) => ({ id: `skill-${i}` })),
      skipped: Array.from({ length: 113 }, (_, i) => ({
        skill: { id: `skipped-${i}` },
        reasons: ['dry-run: LLM必須スキル'],
      })),
    };
    const markdown = renderMarkdown(makeResult({ plan }));
    const visible = initiallyVisibleLines(markdown);

    assert.ok(
      visible.length <= 10,
      `expected <= 10 initially visible lines, got ${visible.length}:\n${visible.join('\n')}`
    );
    // 実行ログ（113 行のスキップ一覧）は初期表示に出ない。
    assert.doesNotMatch(expandedBody(markdown), /skipped-0/);
    assert.match(collapsedBody(markdown), /skipped-112/);
  });

  it('puts the verdict, the finding count and the score on the first content line', () => {
    const markdown = renderMarkdown(makeResult());
    const visible = initiallyVisibleLines(markdown);

    assert.strictEqual(visible[0], '<!-- river-review -->');
    assert.strictEqual(visible[1], '## River Review');
    assert.match(visible[2], /^\*\*判定: /);
    assert.match(visible[2], /指摘 0 件/);
    assert.match(visible[2], /スコア \d+\/100/);
    assert.match(visible[2], /フェーズ `midstream`/);
  });

  it('does not present an empty LLM failure as a clean or auto-approved review (#2410)', () => {
    const markdown = renderMarkdown(
      makeResult({
        plan: {
          selected: [],
          skipped: [],
          riskAssessment: {
            aggregateAction: 'require_human_review',
            humanReviewFiles: ['src/app.js'],
          },
        },
        reviewDebug: {
          llmUsed: false,
          llmError: 'response envelope could not be parsed',
          heuristicsUsed: true,
          heuristicsCount: 0,
        },
      })
    );

    assert.match(markdown, /LLM semantic review は未完了/);
    assert.match(markdown, /「指摘なし」「auto-approve」「マージ可能」を意味しません/);
    assert.doesNotMatch(markdown, /\*\*判定: auto-approve\*\*/);
    assert.doesNotMatch(markdown, /指摘 0 件/);
    assert.doesNotMatch(markdown, /スコア 100\/100/);
    assert.doesNotMatch(markdown, /スコア内訳/);
    assert.doesNotMatch(markdown, /優先度サマリー/);
    assert.doesNotMatch(markdown, /✅ マージ前に対応が必要な指摘はありません/);
    assert.match(markdown, /人間レビュー: \*\*必須\*\*/);
    assert.ok(markdown.includes('src/app\\.js'));
  });

  it('keeps a successful empty LLM review on the normal clean surface (#2410)', () => {
    const markdown = renderMarkdown(
      makeResult({
        reviewDebug: {
          llmUsed: true,
          llmModel: 'gpt-4o-mini',
        },
      })
    );

    assert.match(markdown, /指摘 0 件/);
    assert.doesNotMatch(markdown, /LLM semantic review は未完了/);
  });

  it('leaves critical / major findings outside <details> and folds minor / info in', () => {
    const findings = [
      makeFinding({ id: 'rr-1', severity: 'critical', file: 'src/a.js', title: 'クリティカル' }),
      makeFinding({ id: 'rr-2', severity: 'major', file: 'src/b.js', title: 'メジャー' }),
      makeFinding({ id: 'rr-3', severity: 'minor', file: 'src/c.js', title: 'マイナー' }),
      makeFinding({ id: 'rr-4', severity: 'info', file: 'src/d.js', title: 'インフォ' }),
    ];
    const markdown = renderMarkdown(makeResult({ findings }));
    const expanded = expandedBody(markdown);
    const collapsed = collapsedBody(markdown);

    assert.match(expanded, /### 要対応 \(2 件: 🔴 1 \/ 🟠 1\)/);
    assert.match(expanded, /src\/a\.js:5/);
    assert.match(expanded, /src\/b\.js:5/);
    assert.doesNotMatch(expanded, /src\/c\.js:5/);
    assert.doesNotMatch(expanded, /src\/d\.js:5/);

    assert.match(markdown, /<summary>軽微・参考の指摘 \(2 件: 🟡 1 \/ ℹ️ 1\)<\/summary>/);
    assert.match(collapsed, /src\/c\.js:5/);
    assert.match(collapsed, /src\/d\.js:5/);
  });

  it('keeps the folded findings complete — no deletion and no truncation', () => {
    const findings = [
      makeFinding({ id: 'rr-1', severity: 'minor', title: 'マイナー' }),
      makeFinding({ id: 'rr-2', severity: 'info', file: 'src/d.js', title: 'インフォ' }),
    ];
    const markdown = renderMarkdown(makeResult({ findings }));
    const collapsed = collapsedBody(markdown);

    for (const label of ['Finding', 'Evidence', 'Impact', 'Fix', 'Severity', 'Confidence']) {
      assert.strictEqual(
        countOccurrences(collapsed, `- **${label}:**`),
        2,
        `${label} must survive folding for both findings`
      );
    }
    assert.doesNotMatch(markdown, /\.\.\.$/m, 'no truncation marker may appear');
  });

  it('gives every <summary> a count and a blank line right after it', () => {
    const findings = [
      makeFinding({ id: 'rr-1', severity: 'critical' }),
      makeFinding({ id: 'rr-2', severity: 'minor', file: 'src/c.js' }),
    ];
    const markdown = renderMarkdown(
      makeResult({ findings, suppressed: [{ suppressReason: 'x' }] })
    );
    const lines = markdown.split('\n');

    const summaryIndexes = lines
      .map((line, i) => (line.trim().startsWith('<summary>') ? i : -1))
      .filter((i) => i >= 0);
    assert.ok(summaryIndexes.length >= 3, 'expected the collapsible sections to exist');

    for (const i of summaryIndexes) {
      assert.match(lines[i], /\d/, `<summary> must carry a count: ${lines[i]}`);
      // GitHub renders markdown inside <details> only when a blank line
      // separates it from </summary>.
      assert.strictEqual(
        lines[i + 1],
        '',
        `<summary> must be followed by a blank line: ${lines[i]}`
      );
    }
  });

  it('reports the suppressed count only in the priority summary, never in the headline', () => {
    const suppressed = [
      { suppressReason: 'insufficient_evidence' },
      { suppressReason: 'insufficient_evidence' },
    ];
    const markdown = renderMarkdown(makeResult({ findings: [makeFinding()], suppressed }));

    // F5: suppressed findings are NOT displayed, so their count must not sit
    // next to the counts of what is — it read as "2 of these are hidden".
    assert.doesNotMatch(headlineOf(markdown), /抑制/);
    assert.strictEqual(countOccurrences(markdown, '抑制済み: 2 件'), 1);
    // 旧実装の重複表示（末尾の blockquote）は消えている。
    assert.doesNotMatch(markdown, /件の指摘を抑制しました/);
  });

  // #1857 / ADR-007: the report does NOT apply the overview cap — its sections
  // come from `result.comments`, the full emitted set. So the overflow must not
  // be announced as hidden: the reader would go looking for findings that are
  // printed, with their bodies, further up the same report.
  it('never claims the overview-cap overflow is hidden (#1857)', () => {
    const findings = Array.from({ length: 8 }, (_, i) =>
      makeFinding({ id: `rr-${i + 1}`, ruleId: `rule-${i}`, title: `overflow-title-${i}` })
    );
    const markdown = renderMarkdown(
      makeResult({
        findings,
        suppressed: [{ suppressReason: 'insufficient_evidence' }],
        // 表示枠から溢れた 3 件。render はこれを読まない。
        overflow: findings.slice(5),
      })
    );
    assert.doesNotMatch(markdown, /表示上限/);
    assert.doesNotMatch(markdown, /非表示/);
    // The overflow findings are in the report body, which is why no line may
    // say otherwise.
    for (const f of findings.slice(5)) {
      assert.ok(markdown.includes(f.title), `${f.title} should be rendered`);
    }
    // The suppression breakdown itself is unaffected.
    assert.strictEqual(countOccurrences(markdown, '抑制済み: 1 件'), 1);
    assert.doesNotMatch(markdown, /undefined\(\d+\)/);
  });

  it('cannot be restructured by <details> markup in a finding message', () => {
    const finding = makeFinding({
      severity: 'minor',
      // F2: 閉じタグだけでなく開始タグも無害化する。開始タグは以降の節を
      // depth 2 に沈め、文書末で未閉のまま残す（=以降が畳まれて消える）。
      message:
        'Finding: </details> and <details><summary>pwn</summary> injected Severity: nit Confidence: high',
    });
    const markdown = renderMarkdown(makeResult({ findings: [finding] }));

    // `<` はエンティティ化されるので閉じタグ・開始タグとして解釈されない。
    // 文字列自体は削らず全文が残る。
    assert.match(collapsedBody(markdown), /&lt;\/details> and &lt;details>&lt;summary>pwn/);
    assert.strictEqual(
      countOccurrences(markdown, '\n</details>'),
      countOccurrences(markdown, '<details>'),
      'details tags must stay balanced'
    );
  });

  it('cannot be restructured by <details> markup in the expanded section or a file path', () => {
    // F2: 展開側（要対応節）と top3 ポインタ行の file はどちらも
    // wrapInDetails を通らないため、無害化はテキスト境界で行う必要がある。
    const finding = makeFinding({
      severity: 'critical',
      message: 'Finding: <details>expanded pwn</details> Severity: blocker Confidence: high',
    });
    const markdown = renderMarkdown(
      makeResult({
        findings: [finding],
        teamLeadReport: {
          top3Findings: [
            {
              id: 'rr-9',
              severity: 'major',
              title: 'pointer',
              // code span はバッククォートで閉じられるため安全な容れ物ではない。
              file: 'src/`<details>`evil.js',
              lineStart: 2,
              consensusLevel: 'single',
            },
          ],
          blindSpots: [],
          consensusSummary: { consensus: 0, multi: 0, single: 1, total: 1 },
        },
      })
    );

    assert.match(expandedBody(markdown), /&lt;details>expanded pwn&lt;\/details>/);
    assert.match(markdown, /&lt;details>`evil\.js/);
    assert.strictEqual(
      countOccurrences(markdown, '\n</details>'),
      countOccurrences(markdown, '<details>'),
      'details tags must stay balanced'
    );
  });

  it('orders the 要対応 body by severity, not by skill id (F4)', () => {
    const findings = [
      // skillId 昇順では aaa-skill(major) が先に来るが、severity 降順では
      // zzz-skill(critical) が先でなければ見出しの内訳と本文が食い違う。
      makeFinding({ id: 'rr-1', ruleId: 'aaa-skill', severity: 'major', title: 'メジャー' }),
      makeFinding({
        id: 'rr-2',
        ruleId: 'zzz-skill',
        severity: 'critical',
        file: 'src/b.js',
        title: 'クリティカル',
      }),
    ];
    const markdown = renderMarkdown(makeResult({ findings }));
    const body = expandedBody(markdown);

    assert.match(body, /### 要対応 \(2 件: 🔴 1 \/ 🟠 1\)/);
    assert.ok(
      body.indexOf('zzz\\-skill') < body.indexOf('aaa\\-skill'),
      'the critical group must render above the major group'
    );
  });

  it('normalizes a severity outside the four-word vocabulary instead of dropping it (F7)', () => {
    // 内部語彙（blocker）がそのまま届いても内訳が空にならないこと。
    const findings = [makeFinding({ severity: 'blocker' })];
    const markdown = renderMarkdown(makeResult({ findings }));

    assert.match(headlineOf(markdown), /🔴 1（計 1 件）/);
    assert.doesNotMatch(headlineOf(markdown), /· *（計/, 'the breakdown must not be empty');
    assert.match(expandedBody(markdown), /### 要対応 \(1 件: 🔴 1\)/);
  });

  it('does not print the risk-map file list twice when リスク評価 already listed it (F6)', () => {
    const plan = {
      selected: [],
      skipped: [],
      riskAssessment: {
        aggregateAction: 'require_human_review',
        humanReviewFiles: ['src/api/orders.ts'],
        escalatedFiles: [],
      },
      riskMap: { require_human_review: ['src/api/orders.ts'] },
    };
    const markdown = renderMarkdown(makeResult({ plan }));

    assert.match(markdown, /\*\*人間レビュー必須\*\*/);
    assert.doesNotMatch(markdown, /Human review required/);
    assert.strictEqual(countOccurrences(markdown, 'src/api/orders\\.ts'), 1);
  });

  it('treats a comment with no matching finding as major (fail-safe: stays expanded)', () => {
    const result = makeResult({
      comments: [{ skillId: 'orphan', file: 'src/x.js', line: 1, message: 'Finding: orphan' }],
    });
    const markdown = renderMarkdown(result);

    assert.match(expandedBody(markdown), /### 要対応 \(1 件: 🟠 1\)/);
    assert.match(expandedBody(markdown), /src\/x\.js:1/);
    // F1: 旧実装はここで `findings: []` を根拠に ✅ を出し、直下の 要対応 節と
    // 矛盾していた。ヘッドラインも 要対応 節と同じ集合から導出される。
    assert.doesNotMatch(markdown, /✅/);
    assert.match(headlineOf(markdown), /🟠 1（計 1 件）/);
  });
});

// -----------------------------------------------------------------------------
// F1: ヘッドライン / ✅ / 優先度サマリー / 節見出しは同じ「描画対象集合」から導く
// -----------------------------------------------------------------------------

describe('#1713 F1: the headline describes exactly what is rendered below it', () => {
  /** ✅ の安全宣言と 要対応 節は、どんな入力でも共存してはならない。 */
  function assertNoContradiction(markdown, label) {
    const hasSafe = markdown.includes('✅ マージ前に対応が必要な指摘はありません');
    const hasAction = /### 要対応/.test(markdown);
    assert.ok(
      !(hasSafe && hasAction),
      `${label}: "✅ no findings" must never sit above a 要対応 section\n${markdown.slice(0, 400)}`
    );
  }

  it('does not claim "no findings" when --reviewers dedup left comments unmatched', () => {
    // 再現 1: reviewer orchestration では mergeFindings が findings を dedup する
    // 一方 allComments は連結のみ。findings 側にだけ消えた指摘が comments に残る。
    const markdown = renderMarkdown(
      makeResult({
        findings: [],
        comments: [
          {
            skillId: 'trust-boundaries-authz',
            file: 'src/api/orders.ts',
            line: 42,
            message: 'Finding: 認可チェックが無い Severity: blocker Confidence: high',
          },
        ],
      })
    );

    assertNoContradiction(markdown, 'reviewers dedup');
    assert.match(markdown, /### 要対応 \(1 件: 🟠 1\)/);
    assert.match(headlineOf(markdown), /🟠 1（計 1 件）/);
  });

  it('counts every rendered comment when suppression removed only the finding', () => {
    // 再現 2: 抑制は fingerprint 一致でしか comment を落とさないため、
    // findings 1 件 / comments 2 件という食い違いが起きる。
    const kept = makeFinding({ id: 'rr-1', severity: 'minor' });
    const markdown = renderMarkdown(
      makeResult({
        findings: [kept],
        comments: [
          commentFor(kept),
          {
            skillId: 'trust-boundaries-authz',
            file: 'src/api/orders.ts',
            line: 42,
            message: 'Finding: 認可チェックが無い Severity: blocker Confidence: high',
          },
        ],
        suppressed: [{ suppressReason: 'insufficient_evidence' }],
      })
    );

    assertNoContradiction(markdown, 'suppression');
    // 旧実装は findings 由来で「🟡 1（計 1 件）」と表示し、直下に 要対応 1 件を出していた。
    assert.match(headlineOf(markdown), /🟠 1 \/ 🟡 1（計 2 件）/);
    assert.match(markdown, /### 要対応 \(1 件: 🟠 1\)/);
    assert.match(markdown, /<summary>軽微・参考の指摘 \(1 件: 🟡 1\)<\/summary>/);
    // 優先度サマリーも同じ集合から導く。
    assert.match(markdown, /<summary>優先度サマリー \(P1 0 \/ P2 1 \/ P3 1 \/ P4 0\)<\/summary>/);
  });

  it('keeps the ✅ line only when nothing at all is rendered', () => {
    const empty = renderMarkdown(makeResult());
    assert.match(empty, /✅ マージ前に対応が必要な指摘はありません/);
    assert.doesNotMatch(empty, /### 要対応/);

    const minorOnly = renderMarkdown(
      makeResult({ findings: [makeFinding({ severity: 'minor' })] })
    );
    assert.match(minorOnly, /✅ マージ前必須（P1 \/ P2）の指摘はありません/);
    assert.doesNotMatch(minorOnly, /✅ マージ前に対応が必要な指摘はありません/);
    assertNoContradiction(minorOnly, 'minor only');
  });
});

// -----------------------------------------------------------------------------
// #2370: Human Decision Surface — display-only deterministic projection
// -----------------------------------------------------------------------------

// These tests protect visibility and fail-safe display invariants.
// They intentionally do not define new judgment semantics.
describe('#2370: Human Decision Surface', () => {
  it('adds no Decision Surface to a clean run with no attention signal', () => {
    const markdown = renderMarkdown(makeResult());

    assert.doesNotMatch(markdown, /### 判断が必要な項目/);
    assert.match(markdown, /✅ マージ前に対応が必要な指摘はありません/);
  });

  it('counts exactly the existing expanded findings as action required', () => {
    const findings = [
      makeFinding({ id: 'rr-1', severity: 'critical', title: 'critical issue' }),
      makeFinding({ id: 'rr-2', severity: 'major', file: 'src/b.js', title: 'major issue' }),
      makeFinding({ id: 'rr-3', severity: 'minor', file: 'src/c.js', title: 'minor issue' }),
      makeFinding({ id: 'rr-4', severity: 'info', file: 'src/d.js', title: 'info issue' }),
    ];
    const markdown = renderMarkdown(makeResult({ findings }));
    const expanded = expandedBody(markdown);
    const collapsed = collapsedBody(markdown);

    assert.match(expanded, /### 判断が必要な項目/);
    assert.match(expanded, /- 要対応: \*\*2 件\*\*/);
    assert.match(expanded, /### 要対応 \(2 件:/);

    // Decision Surface is a pointer only. Lower-severity findings remain fully
    // available through the existing progressive-disclosure surface.
    assert.match(collapsed, /src\/c\.js:5/);
    assert.match(collapsed, /src\/d\.js:5/);
  });

  it('surfaces existing human-review requirements without creating a new judgment', () => {
    const surface = buildHumanDecisionSurface({
      rendered: { expanded: [] },
      artifact: {
        decision: 'human-review-required',
        gate: { decision: 'ESCALATE' },
      },
      result: {
        plan: {
          riskAssessment: {
            aggregateAction: 'require_human_review',
            humanReviewFiles: ['src/api/orders.ts'],
          },
          riskMap: {
            require_human_review: ['src/api/orders.ts', 'src/api/payments.ts'],
          },
        },
      },
    });

    assert.strictEqual(surface.humanReviewRequired, true);
    assert.strictEqual(surface.humanReviewFileCount, 2);
    assert.strictEqual(surface.actionRequiredCount, 0);

    const markdown = formatHumanDecisionSurfaceMarkdown(surface);
    assert.match(markdown, /人間レビュー: \*\*必須\*\*（対象ファイル 2 件）/);
  });

  it('shows partial coverage, timeout and blind spots instead of presenting a clean surface', () => {
    const result = makeResult({
      teamLeadReport: {
        top3Findings: [],
        blindSpots: [{ role: 'security-reviewer', label: 'Security Reviewer' }],
        consensusSummary: { consensus: 0, multi: 0, single: 0, total: 0 },
      },
    });
    result.reviewCoverage = {
      schemaVersion: '1',
      status: 'partial',
      expectedUnits: 2,
      completedUnits: 1,
      requiredUnits: 2,
      completedRequiredUnits: 1,
      incompleteRequiredUnitIds: ['reviewer:security/chunk:2'],
      units: [
        {
          id: 'reviewer:security/chunk:1',
          kind: 'diff-chunk',
          subjects: ['src/a.js'],
          reviewerRole: 'security-reviewer',
          required: true,
          status: 'completed',
          reasonCode: null,
          findingsCount: 0,
        },
        {
          id: 'reviewer:security/chunk:2',
          kind: 'diff-chunk',
          subjects: ['src/b.js'],
          reviewerRole: 'security-reviewer',
          required: true,
          status: 'timed_out',
          reasonCode: 'reviewer_timeout',
          findingsCount: 0,
        },
      ],
    };

    const markdown = renderMarkdown(result);
    const expanded = expandedBody(markdown);

    assert.match(expanded, /### 判断が必要な項目/);
    assert.match(expanded, /レビュー網羅性: \*\*partial\*\*（未完了 1 unit、timeout 1）/);
    assert.match(expanded, /未実行のレビュー観点: \*\*1 件\*\*/);
    assert.doesNotMatch(expanded, /✅ マージ前に対応が必要な指摘はありません/);
  });

  it('shows not_executed coverage without inventing missing unit details', () => {
    const result = makeResult();
    result.reviewCoverage = {
      schemaVersion: '1',
      status: 'not_executed',
      expectedUnits: 0,
      completedUnits: 0,
      requiredUnits: 0,
      completedRequiredUnits: 0,
      incompleteRequiredUnitIds: [],
      units: [],
    };

    const markdown = renderMarkdown(result);
    const expanded = expandedBody(markdown);

    assert.match(expanded, /レビュー網羅性: \*\*not_executed\*\*/);
    assert.doesNotMatch(expanded, /未完了 \d+ unit/);
    assert.doesNotMatch(expanded, /✅ マージ前に対応が必要な指摘はありません/);
  });

  it('does not invent coverage or resolution state when upstream data is absent', () => {
    const surface = buildHumanDecisionSurface({
      rendered: { expanded: [] },
      artifact: { decision: 'auto-approve' },
      result: { plan: {}, teamLeadReport: null },
    });

    assert.strictEqual(surface.coverageStatus, null);
    assert.strictEqual(surface.incompleteUnitCount, 0);
    assert.strictEqual(surface.failedUnitCount, 0);
    assert.strictEqual(surface.timedOutUnitCount, 0);
    assert.strictEqual(surface.humanReviewRequired, false);
    assert.strictEqual(surface.hasAttentionRequired, false);
    assert.strictEqual(formatHumanDecisionSurfaceMarkdown(surface), null);
  });

  it('keeps the canonical marker single and leaves all finding bodies present', () => {
    const findings = [
      makeFinding({ id: 'rr-1', severity: 'major', title: 'major-one' }),
      makeFinding({ id: 'rr-2', severity: 'minor', file: 'src/minor.js', title: 'minor-one' }),
    ];
    const markdown = renderMarkdown(makeResult({ findings }));

    assert.strictEqual(countOccurrences(markdown, '<!-- river-review -->'), 1);
    assert.strictEqual(countOccurrences(markdown, '- **Evidence:**'), 2);
    assert.match(markdown, /major-one/);
    assert.match(markdown, /minor-one/);
  });
});

// -----------------------------------------------------------------------------
// Slice 1 制約: json / yaml / html はバイト単位で不変
// -----------------------------------------------------------------------------

describe('#1713 Slice 1: machine-readable surfaces stay byte-identical', () => {
  // 固定入力に対する成果物のハッシュ。markdown の段階的開示は
  // json / yaml / html に一切影響してはならない（#1713 制約）。
  // 期待値は変更前（origin/main）のコードで実測して固定した。
  //
  // #1915 B: 入力は scope 無しの finding 1 件だけだったため、#1644 / #1915 A の
  // scope 出力を 1 バイトも検知しなかった。additive な意図的変更として scope 付き
  // finding を 1 件足し、3 本の pin 値を更新した。以後この pin が守る不変条件は
  // 2 つある: scope 欠損時に何も出さない（rr-1）／scope がある finding では chip・
  // YAML 行・JSON キーが出て、HTML 本文からは自己申告 `Scope:` が消える（rr-2）。
  // JSON / YAML の `message` / `detail` は自己申告を保持する（監査証跡）。
  const FIXED_RESULT = {
    findings: [
      {
        id: 'rr-1',
        ruleId: 'logging-observability',
        reviewer: 'logging-observability',
        file: 'src/app.js',
        lineStart: 5,
        lineEnd: 5,
        title: 'catch で例外が握りつぶされる',
        message: 'Finding: catch で例外が握りつぶされる Severity: warning Confidence: high',
        severity: 'major',
        confidence: 'high',
        status: 'open',
        evidence: ['catch 内で return'],
        suggestion: 'ログ+再throw',
      },
      // #1915 B: the pin covered only scope-less findings, so every scope
      // behaviour (#1644 の値出力・#1915 A の自己申告除去) was invisible to it.
      // This second finding exercises both at once: it carries a resolved
      // `pre-existing` scope AND a self-reported `Scope: in-diff` in its body,
      // which is the mismatch state `debug.scopeStats.mismatch` counts. The
      // first finding stays scope-less on purpose — the "emit nothing when the
      // field is absent" contract is what the original pin protected.
      {
        id: 'rr-2',
        ruleId: 'error-handling',
        reviewer: 'error-handling',
        file: 'src/legacy.js',
        lineStart: 12,
        lineEnd: 12,
        title: '既存の握りつぶし',
        message: 'Finding: 既存の握りつぶし Severity: nit Confidence: high Scope: in-diff',
        severity: 'minor',
        confidence: 'high',
        status: 'open',
        evidence: ['legacy catch'],
        suggestion: 'ログを足す',
        scope: 'pre-existing',
      },
    ],
    plan: { selected: [], skipped: [] },
    changedFiles: ['src/app.js'],
    tokenEstimate: 42,
    status: 'ok',
  };

  function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  it('formatJsonOutput emits the same bytes', () => {
    const json = JSON.stringify(formatJsonOutput(FIXED_RESULT, 'midstream'), null, 2);
    assert.strictEqual(
      sha256(json),
      'fdcc209be238c0823151776fbd2372662ab36fb12d4c39b0b70cb36e31f12f81',
      `JSON output changed (${Buffer.byteLength(json)} bytes). This surface is governed by schemas/output.schema.json — only update this pin for an intentional, additive schema change.\n${json}`
    );
  });

  it('formatYamlOutput emits the same bytes', () => {
    const jsonOutput = formatJsonOutput(FIXED_RESULT, 'midstream');
    const yaml = formatYamlOutput({
      phase: 'midstream',
      timestamp: '2026-01-01T00:00:00.000Z',
      findings: jsonOutput.issues,
      plan: FIXED_RESULT.plan,
      ...(jsonOutput.decision !== undefined ? { decision: jsonOutput.decision } : {}),
    });
    assert.strictEqual(
      sha256(yaml),
      '6b9586181b48c1bb4615968c55fc21016d3d9b91847897c46701eed8f9ebb06e',
      `YAML output changed (${Buffer.byteLength(yaml)} bytes).\n${yaml}`
    );
  });

  it('formatHtmlOutput emits the same bytes', () => {
    const jsonOutput = formatJsonOutput(FIXED_RESULT, 'midstream');
    const html = formatHtmlOutput(
      {
        findings: FIXED_RESULT.findings,
        plan: FIXED_RESULT.plan,
        timestamp: '2026-01-01T00:00:00.000Z',
        ...(jsonOutput.decision !== undefined ? { decision: jsonOutput.decision } : {}),
      },
      'midstream'
    );
    assert.strictEqual(
      sha256(html),
      '19cd5d1fddedb0bc312b9cc91f5a8a23912d42777bf6c2258cbfe5d40d48e102',
      `HTML output changed (${Buffer.byteLength(html)} bytes).\n${html}`
    );
  });
});

// -----------------------------------------------------------------------------
// Slice 2: teamLeadReport の markdown 昇格
// -----------------------------------------------------------------------------

describe('#1713 Slice 2: teamLeadReport in markdown', () => {
  const findings = [
    makeFinding({ id: 'rr-1', severity: 'critical', title: '認可チェックが無い' }),
    makeFinding({ id: 'rr-2', severity: 'minor', file: 'src/c.js', title: '命名が不揃い' }),
  ];

  it('produces output identical to Slice 1 when teamLeadReport is null', () => {
    const withoutReport = renderMarkdown(makeResult({ findings, teamLeadReport: null }));
    const withoutField = renderMarkdown(makeResult({ findings }));
    assert.strictEqual(withoutReport, withoutField);
    assert.doesNotMatch(withoutReport, /優先確認の指摘/);
    assert.doesNotMatch(withoutReport, /未実行のレビュー観点/);
    assert.doesNotMatch(withoutReport, /合意度/);
  });

  it('renders top3 as one-line pointers, consensus badges and blind spots', () => {
    const teamLeadReport = {
      top3Findings: [
        { ...findings[0], consensusLevel: 'consensus' },
        { ...findings[1], consensusLevel: 'multi' },
      ],
      blindSpots: [{ role: 'security-reviewer', label: 'Security Reviewer' }],
      consensusSummary: { consensus: 1, multi: 1, single: 0, total: 2 },
    };
    const markdown = renderMarkdown(makeResult({ findings, teamLeadReport }));

    assert.match(markdown, /### 優先確認の指摘 \(2 件\)/);
    assert.match(markdown, /- 🔴 ★★★ \*\*認可チェックが無い\*\* \(`src\/app\.js:5`\)/);
    assert.match(markdown, /- 🟡 ★★ \*\*命名が不揃い\*\* \(`src\/c\.js:5`\)/);
    assert.match(markdown, /_合意度: ★★★ 合意 1 \/ ★★ 複数 1 \/ ★ 単独 0（計 2 件）_/);
    assert.match(markdown, /_未実行のレビュー観点 \(1\): Security Reviewer_/);
  });

  it('omits the blind-spot line when blindSpots is empty', () => {
    const teamLeadReport = {
      top3Findings: [],
      blindSpots: [],
      consensusSummary: { consensus: 0, multi: 0, single: 2, total: 2 },
    };
    const markdown = renderMarkdown(makeResult({ findings, teamLeadReport }));

    assert.doesNotMatch(markdown, /未実行のレビュー観点/);
    assert.doesNotMatch(markdown, /優先確認の指摘/);
    assert.match(markdown, /_合意度: /);
  });

  it('does not duplicate a top3 finding body — the digest is a pointer only', () => {
    const teamLeadReport = {
      top3Findings: [{ ...findings[0], consensusLevel: 'consensus' }],
      blindSpots: [],
      consensusSummary: { consensus: 1, multi: 0, single: 1, total: 2 },
    };
    const markdown = renderMarkdown(makeResult({ findings, teamLeadReport }));

    // 指摘の全文（Evidence 以下）は 要対応 / 軽微 節にそれぞれ 1 度だけ出る。
    // top3 のポインタ行には本文が無いので、finding 2 件で 2 回のまま増えない。
    assert.strictEqual(countOccurrences(markdown, '- **Evidence:**'), 2);
    // タイトルと位置は「ポインタ行」と「本文」の 2 箇所に出る（それがポインタの役目）。
    assert.strictEqual(countOccurrences(markdown, '認可チェックが無い'), 2);
    assert.strictEqual(countOccurrences(markdown, '`src/app.js:5`'), 2);
  });

  it('keeps the digest above the findings sections', () => {
    const teamLeadReport = {
      top3Findings: [{ ...findings[0], consensusLevel: 'consensus' }],
      blindSpots: [{ role: 'security-reviewer', label: 'Security Reviewer' }],
      consensusSummary: { consensus: 1, multi: 0, single: 1, total: 2 },
    };
    const markdown = renderMarkdown(makeResult({ findings, teamLeadReport }));

    assert.ok(markdown.indexOf('### 優先確認の指摘') < markdown.indexOf('### 要対応'));
  });
});
