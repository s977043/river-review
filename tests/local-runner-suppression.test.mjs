// Integration test for #687 PR-C: applySuppressions wired into runLocalReview.
//
// runLocalReview composes a lot of subsystems (diff parsing, plan, prompt,
// LLM, fingerprint annotation, suppression filtering). Spinning up the full
// pipeline from a unit test fights every part of it. Instead this file
// exercises the *seams* that PR-C added:
//
//   1. local-runner.mjs imports applySuppressions from suppression-apply.mjs.
//   2. The piece it inserts (annotateFingerprints -> applySuppressions ->
//      return) preserves the fingerprint and produces the contract that
//      callers downstream rely on.
//
// Full end-to-end behavior (memory loading, diff parsing, etc.) is covered
// by tests/integration/local-review.test.mjs which exercises runLocalReview
// via the CLI. If that integration breaks because of PR-C, that test fails;
// this file just guards the seam logic so a regression here surfaces with a
// clear message.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { applySuppressions } from '../src/lib/suppression-apply.mjs';
import { computeFingerprint, annotateFingerprints } from '../src/lib/finding-factory.mjs';
import { filterSuppressedComments } from '../src/lib/local-runner.mjs';
import { mergeFindings } from '../src/lib/reviewer-orchestrator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localRunnerSource = readFileSync(
  resolve(__dirname, '..', 'src', 'lib', 'local-runner.mjs'),
  'utf8'
);

test('local-runner.mjs imports applySuppressions from suppression-apply.mjs', () => {
  // Guard the named import, not its exact formatting or whether other
  // imports were added from the same module.
  assert.match(
    localRunnerSource,
    /import\s*\{[^}]*\bapplySuppressions\b[^}]*\}\s*from\s*['"]\.\/suppression-apply\.mjs['"];?/,
    'applySuppressions import is missing from local-runner.mjs'
  );
});

test('local-runner.mjs runLocalReview return surfaces suppressedFindings + suppressionsApplied', () => {
  // Likewise grep for the contract keys. Future readers can rely on the
  // names below being part of the public return shape.
  assert.match(localRunnerSource, /\bsuppressedFindings\b/, 'suppressedFindings key missing');
  // reviewDebug spreads review.debug and always includes suppressionsApplied;
  // #692 PR-C may layer repoContextSecurity in alongside it.
  assert.match(
    localRunnerSource,
    /reviewDebug:\s*\{[\s\S]*\.\.\.\(review\.debug \?\? \{\}\)[\s\S]*suppressionsApplied/,
    'reviewDebug.suppressionsApplied wiring missing'
  );
});

test('local-runner.mjs filters review.comments alongside findings (no leak)', () => {
  // Regression guard for the gemini-code-assist[bot] high-priority finding on
  // PR #701: if the suppression filter only applied to `findings` and left
  // `comments` as the raw `review.comments`, suppressed findings still
  // surfaced verbatim in the PR review thread.
  assert.match(
    localRunnerSource,
    /comments:\s*keptComments,/,
    'comments must use the suppression-filtered keptComments, not review.comments'
  );
  assert.match(localRunnerSource, /const keptComments\s*=/, 'keptComments derivation missing');
});

test('comment filtering by fingerprint matches finding fingerprint algo', () => {
  // The filter computes a fingerprint from the comment's fields and rejects
  // comments whose fingerprint matches a suppressed finding. If the algo
  // ever drifts between the two paths, comments and findings desync.
  const finding = { ruleId: 'rule-x', file: 'src/x.ts', message: 'msg', severity: 'minor' };
  const comment = { skillId: 'rule-x', file: 'src/x.ts', message: 'msg', line: 42 };
  const fpFinding = computeFingerprint(finding);
  const fpComment = computeFingerprint({
    ruleId: comment.skillId || 'unknown',
    file: comment.file,
    message: comment.message,
  });
  assert.equal(fpFinding, fpComment, 'comment-derived fingerprint must equal finding fingerprint');
});

test('applySuppressions+annotateFingerprints integration: matched finding moves to suppressedFindings', () => {
  // Reproduce the exact composition runLocalReview uses. If applySuppressions
  // ever stops accepting findings annotated by annotateFingerprints, this
  // test fails with a precise diff between expected and actual shape.
  const rawFindings = [
    { ruleId: 'r1', file: 'src/x.ts', message: 'leak detected', severity: 'minor' },
    { ruleId: 'r2', file: 'src/y.ts', message: 'unrelated finding', severity: 'major' },
  ];
  const annotated = annotateFingerprints(rawFindings);
  assert.equal(annotated[0].fingerprint.length, 16);
  assert.equal(annotated[1].fingerprint.length, 16);

  const suppression = {
    id: 'suppression-' + annotated[0].fingerprint + '-1',
    type: 'suppression',
    content: 'accepted',
    metadata: {
      createdAt: '2026-04-01T00:00:00Z',
      author: 't',
      tags: ['suppression', 'active', 'file'],
      relatedFiles: ['src/x.ts'],
    },
    context: {
      scope: 'file',
      active: true,
      fingerprint: annotated[0].fingerprint,
      feedbackType: 'false_positive',
    },
  };

  const { keptFindings, suppressedFindings, applied } = applySuppressions(annotated, {
    suppressions: [suppression],
  });

  // r1 (minor + matching fingerprint + false_positive) → suppressed.
  // r2 (no matching suppression) → kept.
  assert.equal(suppressedFindings.length, 1);
  assert.equal(suppressedFindings[0].ruleId, 'r1');
  assert.equal(suppressedFindings[0].suppressionRef, suppression.id);

  assert.equal(keptFindings.length, 1);
  assert.equal(keptFindings[0].ruleId, 'r2');

  assert.equal(applied.length, 1);
  assert.equal(applied[0].action, 'suppressed');
});

test('applySuppressions deterministic with computeFingerprint inputs', () => {
  // Sanity: computeFingerprint must round-trip identically. Without this,
  // suppression matching becomes non-deterministic and the entire #687 P1
  // policy degrades into best-effort matching.
  const finding = { ruleId: 'r1', file: 'src/x.ts', message: 'leak detected' };
  assert.equal(computeFingerprint(finding), computeFingerprint(finding));
});

// ---------------------------------------------------------------------------
// #1797: fingerprintAlgo v2（行アンカー）でのコメント絞り込み
// ---------------------------------------------------------------------------
// v2 の抑制はコメント側も同じ粒度で落とさなければ意味がない。逆に v1 の粒度で
// 落とすと、v2 が区別するために存在している「同ファイル・同 kind の別の行」の
// コメントまで消える。この分岐は runLocalReview の内部にあり未テストだったため、
// filterSuppressedComments として切り出して直接 pin する。
//
// v2 の正しさは「comment 側の `c.line` と finding 側の `lineStart` が同じ行を
// 指すこと」に依存している（review-engine.mjs が `lineStart: c.line ?? null` と
// して finding を作る）。読めば整合しているが pin されていなかった前提なので、
// ここで明示的に assert する。

const v2Comments = [
  { skillId: 'rule-x', file: 'src/x.ts', message: 'msg', line: 10 },
  { skillId: 'rule-x', file: 'src/x.ts', message: 'msg', line: 200 },
];

/** review-engine.mjs が comment から finding を作る形の最小再現。 */
const findingsFromComments = (comments) =>
  annotateFingerprints(
    comments.map((c) => ({
      ruleId: c.skillId,
      file: c.file,
      message: c.message,
      lineStart: c.line,
      severity: 'minor',
    }))
  );

test('#1797: comment の line と finding の lineStart は同じ v2 fingerprint を導く', () => {
  const [finding] = findingsFromComments([v2Comments[0]]);
  const [kept] = filterSuppressedComments(v2Comments.slice(0, 1), [
    { ...finding, suppressionAlgo: 'v2' },
  ]);
  // 突合の形: 該当行のコメントは落ちる（kept が undefined になる）。
  assert.equal(kept, undefined, 'comment 側の line から導いた v2 値が finding と一致していない');
});

test('#1797: v2 抑制は同ファイル・同 kind でも別の行のコメントを残す', () => {
  const findings = findingsFromComments(v2Comments);
  const suppressed = [{ ...findings[0], suppressionAlgo: 'v2' }];
  const kept = filterSuppressedComments(v2Comments, suppressed);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].line, 200);
});

test('#1797: v1 抑制は従来どおり同ファイル・同 kind のコメントを全部落とす', () => {
  const findings = findingsFromComments(v2Comments);
  const suppressed = [{ ...findings[0], suppressionAlgo: 'v1' }];
  assert.deepEqual(filterSuppressedComments(v2Comments, suppressed), []);
  // suppressionAlgo が無い（v2 以前の呼び出し元）場合も v1 として扱う。
  const legacy = [{ ...findings[0] }];
  delete legacy[0].suppressionAlgo;
  assert.deepEqual(filterSuppressedComments(v2Comments, legacy), []);
});

test('#1797: 抑制が無ければコメントは素通りする（同一配列を返す）', () => {
  assert.equal(filterSuppressedComments(v2Comments, []), v2Comments);
});

test('#1797: v1 と v2 の抑制が混在しても互いの粒度を壊さない', () => {
  const comments = [
    ...v2Comments,
    { skillId: 'rule-y', file: 'src/x.ts', message: 'other', line: 5 },
    { skillId: 'rule-y', file: 'src/x.ts', message: 'other', line: 300 },
  ];
  const findings = findingsFromComments(comments);
  const kept = filterSuppressedComments(comments, [
    { ...findings[0], suppressionAlgo: 'v2' }, // rule-x の 10 行目だけ
    { ...findings[2], suppressionAlgo: 'v1' }, // rule-y は全部
  ]);
  assert.deepEqual(
    kept.map((c) => [c.skillId, c.line]),
    [['rule-x', 200]]
  );
});

// ---------------------------------------------------------------------------
// #1823 残件1: reviewer orchestration のクラスタ統合で消えた行のコメント
// ---------------------------------------------------------------------------
// `--reviewers` 経路では mergeFindings が「同一ファイル・lineStart 差 ±2・
// message 編集距離 10 以内」の finding を 1 件へ畳む。畳まれた側の comment は
// 自分の行に残るため、代表 finding の行から導いた v2 hex とは一致せず、v2 抑制
// をすり抜けていた（再現: 代表 100 行に対しコメント 101 行が残存）。
//
// 対策は代表 finding へ統合元の行（mergedLineStarts）を持たせ、抑制時にその各行
// の v2 hex を computeFingerprintV2（SSoT）で導いて掃くこと。行の窓を広げる案
// （±2 で掃く）ではないため、統合されなかった近接 finding のコメントは残る。
//
// 検証は production 経路そのもの（mergeFindings → annotateFingerprints →
// applySuppressions → filterSuppressedComments）を通す。片側だけを見た自己整合な
// テストにしないため。

/** orchestration が作る finding の最小再現（reviewerRole 付き）。 */
const orchestratedFinding = ({ line, role, message = 'duplicated logic here' }) => ({
  ruleId: 'rule-m',
  file: 'src/m.ts',
  message,
  lineStart: line,
  lineEnd: line,
  severity: 'minor',
  reviewerRole: role,
});

/** finding と 1:1 で並ぶ comment 側の形。 */
const orchestratedComment = ({ line, message = 'duplicated logic here' }) => ({
  skillId: 'rule-m',
  file: 'src/m.ts',
  message,
  line,
});

/**
 * production 経路を通して「残ったコメントの行」を返す。
 *
 * @param {object[]} rawFindings mergeFindings への入力
 * @param {object[]} comments review.comments 相当
 * @param {'v1'|'v2'} algo 代表 finding へ効かせる抑制アルゴリズム
 * @returns {Array<number>} 残ったコメントの line
 */
function keptCommentLines(rawFindings, comments, algo) {
  const annotated = annotateFingerprints(mergeFindings(rawFindings));
  const suppression = {
    id: 's-1823',
    context: {
      fingerprint: algo === 'v2' ? annotated[0].fingerprintV2 : annotated[0].fingerprint,
      fingerprintAlgo: algo,
      feedbackType: 'false_positive',
    },
  };
  const { suppressedFindings } = applySuppressions(annotated, { suppressions: [suppression] });
  assert.equal(suppressedFindings.length, 1, '前提: 代表 finding が 1 件だけ抑制されること');
  return filterSuppressedComments(comments, suppressedFindings).map((c) => c.line);
}

test('#1823: 統合された隣接行の comment も v2 抑制で消える', () => {
  const raw = [
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 101, role: 'performance' }),
  ];
  const merged = mergeFindings(raw);
  assert.equal(merged.length, 1, '前提: 行差 1 は 1 クラスタへ統合される');
  assert.deepEqual(merged[0].mergedLineStarts, [100, 101]);
  const comments = [100, 101].map((line) => orchestratedComment({ line }));
  assert.deepEqual(keptCommentLines(raw, comments, 'v2'), []);
});

test('#1823: 統合されない行差（±2 超）の comment は v2 抑制でも残る', () => {
  const raw = [
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 103, role: 'performance' }),
  ];
  const merged = mergeFindings(raw);
  assert.equal(merged.length, 2, '前提: 行差 3 は統合されない');
  assert.equal(merged[0].mergedLineStarts, undefined);
  const comments = [100, 103].map((line) => orchestratedComment({ line }));
  assert.deepEqual(keptCommentLines(raw, comments, 'v2'), [103]);
});

test('#1823: 統合されない message 差（編集距離 10 超）の comment は v2 抑制でも残る', () => {
  const far = 'completely different observation about naming';
  const raw = [
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 101, role: 'performance', message: far }),
  ];
  const merged = mergeFindings(raw);
  assert.equal(merged.length, 2, '前提: message が遠いので統合されない');
  const comments = [
    orchestratedComment({ line: 100 }),
    orchestratedComment({ line: 101, message: far }),
  ];
  assert.deepEqual(keptCommentLines(raw, comments, 'v2'), [101]);
});

test('#1823: v1 抑制はクラスタ統合の有無に関わらず同ファイル・同 kind を全部落とす', () => {
  const raw = [
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 101, role: 'performance' }),
  ];
  // 400 行目は統合対象外だが、v1 はファイル全体を畳む既存挙動のまま。
  const comments = [100, 101, 400].map((line) => orchestratedComment({ line }));
  assert.deepEqual(keptCommentLines(raw, comments, 'v1'), []);
});

test('#1823: mergedLineStarts は情報を足すときだけ生える（単独 / 同一行では付かない）', () => {
  const [single] = mergeFindings([orchestratedFinding({ line: 100, role: 'security' })]);
  assert.equal(single.mergedLineStarts, undefined, '単一メンバーには付けない');
  const [sameLine] = mergeFindings([
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 100, role: 'performance' }),
  ]);
  assert.equal(sameLine.mergedLineStarts, undefined, '行が 1 種類なら lineStart と重複するだけ');
});

test('#1823: 2 パス目の mergeFindings でも mergedLineStarts が失われない', () => {
  const pass1 = mergeFindings([
    orchestratedFinding({ line: 100, role: 'security' }),
    orchestratedFinding({ line: 101, role: 'performance' }),
  ]);
  const pass2 = mergeFindings(pass1);
  assert.deepEqual(pass2[0].mergedLineStarts, [100, 101]);
});
