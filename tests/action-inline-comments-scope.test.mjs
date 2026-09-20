// #1644: finding の `scope` を GitHub Action の PR コメント経路へ届ける回帰テスト。
//
// 対象は `runners/github-action/post-inline-comments.cjs`（CommonJS の
// actions/github-script ランナー。`npm run build:action` の bundle 対象外）。
//
// 期待値は実装から導かない。post-inline-comments.cjs の関数を両側から呼ぶと
// 「pre-existing を隠す」条件を反転させても緑のままになるため、この test は
// 公開経路（module.exports の関数）だけを呼び、期待値は手書きの literal で
// 固定する。
//
// 固定する不変条件:
//   - `scope: 'pre-existing'` の finding は inline review comment にならない
//   - その finding は summary の <details> に **全文**（message / evidence /
//     suggestion）で残る = 投稿を止めても情報が失われない
//   - scope が欠損 / null / 語彙外の finding は従来どおり inline に出る（fail-safe）
//   - pre-existing が 0 件なら <details> ブロック自体を出さない

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const postInlineComments = require(
  fileURLToPath(new URL('../runners/github-action/post-inline-comments.cjs', import.meta.url))
);

const MAX_SUMMARY_BODY = postInlineComments.MAX_SUMMARY_BODY;

/**
 * Run the action entry point against a fake Octokit and return what it posted.
 *
 * @param {object} data JSON artifact the action reads
 * @param {object} [options]
 * @param {boolean} [options.failBatch] make the batched review call reject
 */
async function run(data, { failBatch = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'river-inline-scope-'));
  const jsonPath = join(dir, 'output.json');
  writeFileSync(jsonPath, JSON.stringify(data), 'utf8');

  const posted = {
    batchComments: null,
    singleComments: [],
    summaryBody: null,
    warnings: [],
    infos: [],
    failures: [],
  };

  const github = {
    rest: {
      pulls: {
        async createReview({ comments }) {
          if (failBatch) throw new Error('line not in diff');
          posted.batchComments = comments;
        },
        async createReviewComment({ path, line, body }) {
          posted.singleComments.push({ path, line, body });
        },
      },
      issues: {
        listComments: 'listComments',
        async createComment({ body }) {
          posted.summaryBody = body;
        },
        async updateComment({ body }) {
          posted.summaryBody = body;
        },
      },
    },
    async paginate() {
      return [];
    },
  };

  const context = {
    repo: { owner: 'acme', repo: 'widgets' },
    payload: { pull_request: { number: 7, head: { sha: 'deadbeef' } } },
  };

  const core = {
    info: (m) => posted.infos.push(m),
    warning: (m) => posted.warnings.push(m),
    setFailed: (m) => posted.failures.push(m),
  };

  const previous = process.env.RIVER_REVIEWER_JSON_PATH;
  process.env.RIVER_REVIEWER_JSON_PATH = jsonPath;
  try {
    await postInlineComments({ github, context, core });
  } finally {
    if (previous === undefined) delete process.env.RIVER_REVIEWER_JSON_PATH;
    else process.env.RIVER_REVIEWER_JSON_PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
  return posted;
}

/** Minimal artifact whose severity counts match the issue list. */
function artifact(issues, extra = {}) {
  const counts = {};
  for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1;
  return { issues, summary: { issueCountBySeverity: counts }, ...extra };
}

const IN_DIFF = {
  id: 'rr-in',
  title: 'null check missing on the new branch',
  message: 'The added guard clause does not cover the empty-array case.',
  severity: 'major',
  file: 'src/app.js',
  line: 12,
  evidence: ['if (!items.length) is absent'],
  suggestion: 'if (!items?.length) return [];',
  scope: 'in-diff',
};

const PRE_EXISTING = {
  id: 'rr-pre',
  title: 'legacy helper swallows exceptions',
  message: 'The surrounding catch block returns silently.',
  severity: 'critical',
  file: 'src/app.js',
  line: 3,
  evidence: ['catch (e) { return null; }'],
  suggestion: 'catch (e) { logger.error(e); throw e; }',
  scope: 'pre-existing',
};

describe('#1644: pre-existing findings never become inline review comments', () => {
  it('posts the in-diff finding inline and withholds the pre-existing one', async () => {
    const posted = await run(artifact([IN_DIFF, PRE_EXISTING]));

    assert.deepEqual(
      posted.batchComments.map((c) => `${c.path}:${c.line}`),
      ['src/app.js:12']
    );
    assert.equal(posted.batchComments.length, 1);
    assert.ok(!JSON.stringify(posted.batchComments).includes('legacy helper swallows exceptions'));
  });

  it('withholds it on the per-comment fallback path too', async () => {
    const posted = await run(artifact([IN_DIFF, PRE_EXISTING]), { failBatch: true });

    assert.deepEqual(
      posted.singleComments.map((c) => `${c.path}:${c.line}`),
      ['src/app.js:12']
    );
  });

  it('posts inline when scope is absent (fail-safe: never demote the unclassified)', async () => {
    const { scope, ...noScope } = PRE_EXISTING;
    assert.equal(scope, 'pre-existing');
    const posted = await run(artifact([noScope]));

    assert.equal(posted.batchComments.length, 1);
    assert.equal(posted.batchComments[0].line, 3);
    assert.ok(!posted.summaryBody.includes('<details>'));
  });

  it('posts inline for null and out-of-vocabulary scope values', async () => {
    // The whitespace-padded and non-string entries pin the comparison as a
    // strict `===` against the exact literal. Without them, relaxing the check
    // to `String(scope ?? '').trim() === 'pre-existing'` or to
    // `String(scope) === 'pre-existing'` passes every other case here — the
    // casing entries alone do not catch either widening.
    for (const scope of [
      null,
      '',
      'preexisting',
      'PRE-EXISTING',
      'unknown',
      ' pre-existing ',
      'pre-existing\n',
      '\tpre-existing',
      0,
      1,
      true,
      false,
      ['pre-existing'],
      { value: 'pre-existing' },
    ]) {
      const posted = await run(artifact([{ ...PRE_EXISTING, scope }]));
      assert.equal(posted.batchComments.length, 1, `scope=${JSON.stringify(scope)} was demoted`);
      assert.ok(
        !posted.summaryBody.includes('<details>'),
        `scope=${JSON.stringify(scope)} was folded`
      );
    }
  });
});

describe('#1644: the summary keeps every pre-existing finding in full', () => {
  it('folds it into a details block carrying message, evidence and fix', async () => {
    const posted = await run(artifact([IN_DIFF, PRE_EXISTING]));
    const body = posted.summaryBody;

    assert.ok(body.includes('<details>'));
    assert.ok(
      body.includes(
        "<summary>🔍 1 pre-existing finding — outside this diff's added lines</summary>"
      )
    );
    assert.ok(
      body.includes('🔴 **[critical]** legacy helper swallows exceptions `src/app.js:3`'),
      body
    );
    assert.ok(body.includes('The surrounding catch block returns silently.'));
    assert.ok(body.includes('**Evidence:** catch (e) { return null; }'));
    assert.ok(body.includes('catch (e) { logger.error(e); throw e; }'));
    assert.ok(body.includes('</details>'));
  });

  it('pluralises the count label', async () => {
    const posted = await run(
      artifact([PRE_EXISTING, { ...PRE_EXISTING, id: 'rr-pre2', line: 4, severity: 'minor' }])
    );
    assert.ok(
      posted.summaryBody.includes(
        "<summary>🔍 2 pre-existing findings — outside this diff's added lines</summary>"
      )
    );
  });

  it('renders the fix as a plain fence, not a dead suggestion widget', async () => {
    const posted = await run(artifact([IN_DIFF, PRE_EXISTING]));

    assert.ok(posted.batchComments[0].body.includes('```suggestion'));
    assert.ok(!posted.summaryBody.includes('```suggestion'));
    assert.ok(posted.summaryBody.includes('**Suggested fix:**\n```\ncatch (e) { logger.error'));
  });

  it('keeps an unlocated pre-existing finding in the folded block, not the inline-failure list', async () => {
    const unlocated = { ...PRE_EXISTING, file: undefined, line: undefined };
    const posted = await run(artifact([unlocated]));

    assert.ok(!posted.summaryBody.includes('### Findings not posted inline'));
    assert.ok(posted.summaryBody.includes('<details>'));
    assert.ok(posted.summaryBody.includes('🔴 **[critical]** legacy helper swallows exceptions\n'));
  });

  it('places the folded block below the in-diff inline-failure list', async () => {
    const unlocatedInDiff = {
      ...IN_DIFF,
      id: 'rr-unlocated',
      file: undefined,
      line: undefined,
    };
    const posted = await run(artifact([unlocatedInDiff, PRE_EXISTING]));

    const listAt = posted.summaryBody.indexOf('### Findings not posted inline');
    const detailsAt = posted.summaryBody.indexOf('<details>');
    assert.ok(listAt >= 0);
    assert.ok(detailsAt > listAt);
  });

  it('emits no details block when nothing is pre-existing', async () => {
    const posted = await run(artifact([IN_DIFF]));
    assert.ok(!posted.summaryBody.includes('<details>'));
    assert.ok(!posted.summaryBody.includes('pre-existing'));
  });

  it('neutralises details markup smuggled through finding text', async () => {
    const posted = await run(
      artifact([{ ...PRE_EXISTING, message: 'closes early </details> and reopens <summary>x' }])
    );

    // Only the opening `<` of the tag is escaped, matching neutralizeDetailsMarkup
    // in src/cli/render.mjs — enough to stop the tag from being parsed.
    assert.ok(posted.summaryBody.includes('&lt;/details> and reopens &lt;summary>x'));
    assert.equal(posted.summaryBody.split('</details>').length - 1, 1);
  });

  it('degrades to pointer lines instead of exceeding the comment size limit', async () => {
    const bulky = Array.from({ length: 60 }, (_, i) => ({
      ...PRE_EXISTING,
      id: `rr-bulk-${i}`,
      line: i + 1,
      message: 'x'.repeat(2000),
    }));
    const posted = await run(artifact(bulky));

    assert.ok(posted.summaryBody.length <= MAX_SUMMARY_BODY);
    assert.ok(posted.summaryBody.includes('<details>'));
    assert.ok(
      posted.summaryBody.includes('- 🔴 **legacy helper swallows exceptions** `src/app.js:1`')
    );
    assert.ok(!posted.summaryBody.includes('**Evidence:**'));
  });
});

describe('#1644: the Tech Lead pointer list marks pre-existing only', () => {
  it('appends the marker to a pre-existing entry', async () => {
    const posted = await run(
      artifact([PRE_EXISTING], {
        teamLeadReport: { top3Findings: [PRE_EXISTING] },
      })
    );

    assert.ok(
      posted.summaryBody.includes(
        '- 🔴 **legacy helper swallows exceptions** (src/app.js) _(pre-existing)_'
      ),
      posted.summaryBody
    );
  });

  it('adds no marker for in-diff or for a finding without scope', async () => {
    const { scope, ...noScope } = IN_DIFF;
    assert.equal(scope, 'in-diff');
    const posted = await run(
      artifact([IN_DIFF], {
        teamLeadReport: { top3Findings: [IN_DIFF, { ...noScope, id: 'rr-noscope' }] },
      })
    );

    assert.ok(!posted.summaryBody.includes('_(pre-existing)_'));
    assert.equal(
      posted.summaryBody.split('- 🟠 **null check missing on the new branch** (src/app.js)')
        .length - 1,
      2
    );
  });
});

describe('#1644: a zero severity count must not swallow the folded block', () => {
  // `summary.issueCountBySeverity` is read from the artifact, not derived from
  // `issues`, so the two can disagree. Withholding pre-existing findings from
  // inline made that disagreement lossy: the early return below the count line
  // used to drop them from the summary too.
  const ZERO_COUNTS = { critical: 0, major: 0, minor: 0, info: 0 };

  it('keeps the pre-existing finding when every severity count is zero', async () => {
    const posted = await run({
      issues: [PRE_EXISTING],
      summary: { issueCountBySeverity: ZERO_COUNTS },
    });

    assert.equal(posted.batchComments, null);
    assert.ok(posted.summaryBody.includes('<details>'));
    assert.ok(posted.summaryBody.includes('legacy helper swallows exceptions'));
    assert.ok(posted.summaryBody.includes('**Evidence:** catch (e) { return null; }'));
  });

  it('keeps it when the artifact carries no summary key at all', async () => {
    const posted = await run({ issues: [PRE_EXISTING] });

    assert.ok(posted.summaryBody.includes('<details>'));
    assert.ok(posted.summaryBody.includes('legacy helper swallows exceptions'));
  });

  it('does not claim "No issues found" above a block that lists findings', async () => {
    const posted = await run({
      issues: [PRE_EXISTING],
      summary: { issueCountBySeverity: ZERO_COUNTS },
    });

    assert.ok(!posted.summaryBody.includes('✅ No issues found.'));
    assert.ok(posted.summaryBody.includes("✅ No findings on this diff's added lines."));
  });

  it('still reports the clean result verbatim when nothing is pre-existing', async () => {
    const posted = await run({ issues: [], summary: { issueCountBySeverity: ZERO_COUNTS } });

    assert.equal(
      posted.summaryBody,
      '<!-- river-review -->\n## River Reviewer\n\n✅ No issues found.'
    );
  });
});

// -----------------------------------------------------------------------------
// #1915: 「指摘なし」の判定を counts でなく手元の finding 実体から行う
//
// #1644 が足した `preExistingIssues.length === 0` は、バケットが増えるたびに
// 条件を 1 つ足す形だった。そして次のバケットを取りこぼしていた: `file` / `line`
// を持たない in-diff finding は inline から意図的に外され（unlocatedIssues）、
// 早期 return で summary からも消えていた。
//
// 期待値は手書きの literal で固定する。ここも公開経路（module.exports）だけを
// 呼ぶ。
// -----------------------------------------------------------------------------

describe('#1915: the summary decides from the findings it holds, not from counts', () => {
  const ZERO_COUNTS = { critical: 0, major: 0, minor: 0, info: 0 };

  /** in-diff だが file / line を持たないため inline に出せない finding。 */
  const UNLOCATED = {
    id: 'rr-unlocated',
    title: 'race between the two new writers',
    message: 'Both new call sites write the cache without a lock.',
    severity: 'major',
    evidence: ['no lock around cache.set'],
    suggestion: 'Serialize the writes behind the existing mutex.',
    scope: 'in-diff',
  };

  it('keeps an unlocated in-diff finding when every severity count is zero', async () => {
    const posted = await run({
      issues: [UNLOCATED],
      summary: { issueCountBySeverity: ZERO_COUNTS },
    });

    // inline には出ない（file / line が無いので出せない）。
    assert.equal(posted.batchComments, null);
    assert.deepEqual(posted.singleComments, []);
    // だが summary からは消えない。
    assert.ok(
      !posted.summaryBody.includes('✅ No issues found.'),
      `the finding was swallowed:\n${posted.summaryBody}`
    );
    assert.ok(posted.summaryBody.includes('### Findings not posted inline'));
    assert.ok(posted.summaryBody.includes('race between the two new writers'));
  });

  it('keeps it when the artifact carries no summary key at all', async () => {
    const posted = await run({ issues: [UNLOCATED] });

    assert.ok(!posted.summaryBody.includes('✅ No issues found.'));
    assert.ok(posted.summaryBody.includes('race between the two new writers'));
  });

  it('headlines the entity count when the artifact declares none', async () => {
    const posted = await run({
      issues: [UNLOCATED],
      summary: { issueCountBySeverity: ZERO_COUNTS },
    });

    // 内訳が無いので severity の列挙は出さない。`— ` を垂らさない。
    assert.ok(
      posted.summaryBody.includes('**1 finding**\n'),
      `headline did not match the expected literal:\n${posted.summaryBody}`
    );
    assert.ok(!posted.summaryBody.includes('**1 finding** —'));
  });

  it('still reports the clean result verbatim when there is genuinely nothing', async () => {
    const posted = await run({ issues: [], summary: { issueCountBySeverity: ZERO_COUNTS } });

    assert.equal(
      posted.summaryBody,
      '<!-- river-review -->\n## River Reviewer\n\n✅ No issues found.'
    );
  });

  it('keeps the artifact breakdown as the headline when the artifact declares one', async () => {
    const posted = await run(artifact([IN_DIFF]));

    assert.ok(
      posted.summaryBody.includes('**1 finding** — 🟠 1 major'),
      `headline did not match the expected literal:\n${posted.summaryBody}`
    );
  });
});

describe('#1644: hard truncation leaves a readable comment', () => {
  /** Enough compact pointer lines that even the compact rendering overflows. */
  function overflowing() {
    return Array.from({ length: 400 }, (_, i) => ({
      ...PRE_EXISTING,
      id: `rr-huge-${i}`,
      line: i + 1,
      title: `🔴 leak ${String(i).padStart(4, '0')} ${'T'.repeat(200)}`,
      message: 'M'.repeat(3000),
    }));
  }

  it('closes the details block so the truncation notice stays readable', async () => {
    const posted = await run(artifact(overflowing()));
    const body = posted.summaryBody;

    assert.ok(body.length <= MAX_SUMMARY_BODY, `length was ${body.length}`);
    assert.equal(body.split('<details>').length - 1, 1);
    assert.equal(body.split('</details>').length - 1, 1);
    assert.ok(
      body.indexOf('_Summary truncated') > body.lastIndexOf('</details>'),
      'the notice must sit outside the collapsed block'
    );
    assert.ok(body.endsWith('_Summary truncated to fit GitHub’s comment size limit._'));
  });

  it('never emits a lone surrogate from cutting mid-emoji', async () => {
    // The cut offset is fixed, so one fixture only ever exercises one landing
    // spot. Three properties make the sweep actually reach an emoji:
    //   - titles are pure emoji, so half of all cut positions split a pair;
    //   - only the FIRST title is padded, because padding all of them moves the
    //     cut by a multiple of the finding count and never flips its parity;
    //   - the location is one character and there is no line number, so the
    //     non-emoji tail of a pointer line is short enough for the sweep to
    //     step past it.
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (let shift = 0; shift < 10; shift++) {
      const issues = Array.from({ length: 400 }, (_, index) => ({
        ...PRE_EXISTING,
        id: `rr-emoji-${index}`,
        file: 'f',
        line: undefined,
        title: `${index === 0 ? '.'.repeat(shift) : ''}${'🔴'.repeat(120)}`,
      }));
      const posted = await run(artifact(issues));

      assert.ok(posted.summaryBody.endsWith('size limit._'), `shift=${shift} was not truncated`);
      assert.ok(posted.summaryBody.length <= MAX_SUMMARY_BODY, `shift=${shift}`);
      assert.ok(!lone.test(posted.summaryBody), `lone surrogate at shift=${shift}`);
    }
  });
});

// #1929: 自己申告 `Scope:` ラベルは Action サマリーからも落とす。
//
// 期待値は実装から導かない。`stripSelfReportedScope` を呼んで比較すると、
// 呼び出しを外しても両辺が同じだけ変わって緑のままになる。ここでは公開経路
// （postInlineComments）だけを呼び、出力を手書きの literal で固定する。
//
// ガードは `issue.scope ?` 付き（src/cli/render.mjs の `bodyForMarkdown` と
// src/lib/output-formatters/html.mjs と同じ規則）。解決済み scope を持たない
// レガシー artifact では自己申告が唯一の scope 情報なので残す。

/** pre-existing の印と矛盾する自己申告を持つ finding。 */
const PRE_EXISTING_SELF_REPORTS_IN_DIFF = {
  id: 'rr-1929-pre',
  title: 'legacy helper swallows exceptions',
  message: 'The surrounding catch block returns silently. Scope: in-diff',
  severity: 'critical',
  file: 'src/app.js',
  line: 3,
  scope: 'pre-existing',
};

/** inline に出る finding。自己申告は解決済み scope と逆を主張している。 */
const IN_DIFF_SELF_REPORTS_PRE_EXISTING = {
  id: 'rr-1929-in',
  title: 'null check missing on the new branch',
  message: 'The added guard clause does not cover the empty-array case. Scope: pre-existing',
  severity: 'major',
  file: 'src/app.js',
  line: 12,
  scope: 'in-diff',
};

describe('#1929: the Action summary drops the self-reported Scope label', () => {
  it('strips the label from the pre-existing <details> body', async () => {
    const posted = await run(artifact([PRE_EXISTING_SELF_REPORTS_IN_DIFF]));

    assert.ok(
      posted.summaryBody.includes(
        '🔴 **[critical]** legacy helper swallows exceptions `src/app.js:3`\n' +
          '\n' +
          'The surrounding catch block returns silently.'
      ),
      posted.summaryBody
    );
    assert.ok(!posted.summaryBody.includes('Scope: in-diff'), posted.summaryBody);
    // 印そのものは残る（消したのは自己申告だけ）。
    assert.ok(posted.summaryBody.includes('1 pre-existing finding'), posted.summaryBody);
  });

  it('strips the label from an inline review comment body', async () => {
    const posted = await run(artifact([IN_DIFF_SELF_REPORTS_PRE_EXISTING]));

    assert.deepEqual(
      posted.batchComments.map((c) => c.body),
      [
        '🟠 **[major]** null check missing on the new branch\n' +
          '\n' +
          'The added guard clause does not cover the empty-array case.',
      ]
    );
  });

  it('strips the label from the "Findings not posted inline" list', async () => {
    const unlocated = {
      ...IN_DIFF_SELF_REPORTS_PRE_EXISTING,
      id: 'rr-1929-unlocated',
      line: undefined,
    };
    const posted = await run(artifact([unlocated]));

    assert.ok(
      posted.summaryBody.includes(
        '- 🟠 **null check missing on the new branch** (src/app.js)\n' +
          '  The added guard clause does not cover the empty-array case.'
      ),
      posted.summaryBody
    );
    assert.ok(!posted.summaryBody.includes('Scope: pre-existing'), posted.summaryBody);
  });

  it('keeps the label on a legacy finding that carries no resolved scope', async () => {
    const legacy = {
      id: 'rr-1929-legacy',
      title: 'legacy artifact predates the scope field',
      message: 'No resolved scope here. Scope: pre-existing',
      severity: 'minor',
      file: 'src/legacy.js',
      line: 9,
    };
    const posted = await run(artifact([legacy]));

    assert.deepEqual(
      posted.batchComments.map((c) => c.body),
      [
        '🟡 **[minor]** legacy artifact predates the scope field\n' +
          '\n' +
          'No resolved scope here. Scope: pre-existing',
      ]
    );
  });

  it('omits the body when the label was the whole message', async () => {
    const labelOnly = {
      id: 'rr-1929-label-only',
      title: 'title carries the finding',
      message: 'Scope: in-diff',
      severity: 'info',
      file: 'src/app.js',
      line: 4,
      scope: 'in-diff',
    };
    const posted = await run(artifact([labelOnly]));

    assert.deepEqual(
      posted.batchComments.map((c) => c.body),
      ['ℹ️ **[info]** title carries the finding']
    );
  });
});
