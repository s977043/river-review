// src/prompt/sections.mjs の回帰テスト。
//
// このモジュールは review-engine.mjs から切り出した「プロンプトの節を組み立てる
// 純関数」の集合であり、ADR-006 の Prompt Compiler が同じ節を別配置で描画する
// ときに import する SSoT である。したがって守るべき性質は 2 つある。
//
//   1. buildPrompt の出力が切り出し前と同一であること（挙動不変の refactor）
//   2. 節の生成規則が review-engine 側と compiler 側で分岐しないこと
//
// 1 は golden で pin する。tests/fixtures/prompt-golden/*.txt は、節を切り出す
// **前** の review-engine.mjs が出力した文字列そのものであり、実装から再生成
// していない。期待値を現在の実装から作ると自己整合になり、契約文を書き換えても
// テストが緑のまま通る（実際に切り出し当日、構造一致だけを見る版では変異が
// 検出できなかった）。
//
// 2 は「buildPrompt の出力が、各節を個別に呼んだ結果を含む」形で検証する。
// これは配線の検証であって文面の検証ではない。文面を守るのは golden の役割。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt } from '../src/lib/review-engine.mjs';
import { CASES } from './fixtures/prompt-golden/cases.mjs';
import { getReviewDepthConfig } from '../src/lib/review-plan-generator.mjs';
import {
  MAX_PR_BODY_CHARS,
  buildADRContextSection,
  buildAdditionalSection,
  buildFileSummary,
  buildFindingContractSection,
  buildHandoffSection,
  buildLanguageInstruction,
  buildPrDescriptionSection,
  buildProjectRulesSection,
  buildRiskAssessmentSection,
  buildSeverityInstruction,
  buildSkillSummary,
  buildSystemMessage,
  buildWalkthroughSection,
} from '../src/prompt/sections.mjs';

const GOLDEN_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'prompt-golden'
);

const diffFiles = [
  { path: 'src/a.ts', hunks: [1, 2] },
  { path: 'src/b.ts', hunks: [] },
];
const plan = {
  selected: [
    { id: 's1', name: 'Skill One', phase: 'midstream', severity: 'high', modelHint: 'balanced' },
  ],
};

test('buildPrompt output is byte-identical to the pre-extraction golden', () => {
  assert.ok(CASES.length > 0, 'golden cases must not be empty');
  for (const c of CASES) {
    const expected = fs.readFileSync(path.join(GOLDEN_DIR, `${c.name}.txt`), 'utf8');
    const { prompt } = buildPrompt(structuredClone(c.args));
    assert.equal(prompt, expected, `prompt drifted from golden for case "${c.name}"`);
  }
});

test('each section builder is the single source used by buildPrompt', () => {
  const args = {
    diffText: 'diff body',
    diffFiles,
    plan,
    phase: 'upstream',
    projectRules: 'rule text',
    prBody: 'PR body text',
    relatedADRs: [{ title: 'ADR-1', path: 'docs/adr/001.md', matchReason: 'touches x' }],
    riskAssessment: { escalatedFiles: ['a.ts'], humanReviewFiles: ['b.ts'] },
    reviewMode: 'deep',
    config: {
      review: {
        language: 'ja',
        severity: 'strict',
        walkthrough: true,
        agentHandoff: true,
        additionalInstructions: ['add1', 'add2'],
      },
    },
  };
  const { prompt } = buildPrompt(args);

  // 各節が「その節を単独で呼んだ結果」として prompt に現れる。文面を片側だけ
  // 変えると、この includes がすべて落ちる。
  assert.ok(prompt.includes(buildFileSummary(diffFiles)));
  assert.ok(prompt.includes(buildSkillSummary(plan)));
  assert.ok(prompt.includes(buildProjectRulesSection('rule text')));
  assert.ok(prompt.includes(buildRiskAssessmentSection(args.riskAssessment)));
  assert.ok(prompt.includes(buildADRContextSection(args.relatedADRs)));
  assert.ok(prompt.includes(buildPrDescriptionSection('PR body text')));
  assert.ok(prompt.includes(buildWalkthroughSection(true)));
  assert.ok(prompt.includes(buildHandoffSection(true)));
  assert.ok(
    prompt.includes(
      buildFindingContractSection({
        language: 'ja',
        severity: 'strict',
        depthConfig: getReviewDepthConfig('deep'),
        additionalInstructions: ['add1', 'add2'],
      })
    )
  );
});

test('optional sections stay empty when their input is absent', () => {
  assert.equal(buildProjectRulesSection(''), '');
  assert.equal(buildRiskAssessmentSection(null), '');
  assert.equal(buildRiskAssessmentSection({ escalatedFiles: [], humanReviewFiles: [] }), '');
  assert.equal(buildADRContextSection([]), '');
  assert.equal(buildPrDescriptionSection('   '), '');
  assert.equal(buildPrDescriptionSection(undefined), '');
  assert.equal(buildWalkthroughSection(false), '');
  assert.equal(buildHandoffSection(false), '');
  assert.equal(buildAdditionalSection([], 'ja'), '');
});

test('language and severity instructions switch on language', () => {
  assert.equal(buildLanguageInstruction('en'), '- Write the <message> in English.');
  assert.equal(buildLanguageInstruction('ja'), '- <message>は日本語で記述すること。');
  assert.match(buildSeverityInstruction('strict', 'en'), /^- Severity focus \(strict\): /);
  assert.match(buildSeverityInstruction('strict', 'ja'), /^- 厳格度 \(strict\): /);
  // 未知の severity は normal の文面へ落とす（fail-safe）。
  assert.equal(
    buildSeverityInstruction('unknown', 'ja'),
    buildSeverityInstruction('normal', 'ja').replace('(normal)', '(unknown)')
  );
});

test('system message declares the response language', () => {
  assert.match(buildSystemMessage('en'), /Respond in English\./);
  assert.match(buildSystemMessage('ja'), /Respond in Japanese\./);
});

test('PR description asks to verify safety claims with file:line evidence', () => {
  const section = buildPrDescriptionSection('fsync は不要なので安全');
  assert.match(section, /保証・安全性の主張/);
  assert.match(section, /`file:line`/);
  assert.match(section, /major 以上/);
  assert.match(section, /PR 本文の主張: 検証 N 件 \/ 根拠なし M 件/);
});

test('PR description is truncated at MAX_PR_BODY_CHARS', () => {
  const long = 'x'.repeat(MAX_PR_BODY_CHARS + 100);
  const section = buildPrDescriptionSection(long);
  assert.ok(section.includes('...[truncated]'));
  assert.ok(!section.includes('x'.repeat(MAX_PR_BODY_CHARS + 1)));
});

test('file summary reports at least one hunk per file', () => {
  assert.equal(buildFileSummary([]), 'No files changed');
  const summary = buildFileSummary(diffFiles);
  assert.ok(summary.includes('- src/a.ts (hunks: 2)'));
  // hunks が空でも 1 と表示する既存挙動（|| 1）を pin する。
  assert.ok(summary.includes('- src/b.ts (hunks: 1)'));
});

test('skill summary caps the listed skills and reports the remainder', () => {
  assert.equal(
    buildSkillSummary({ selected: [] }),
    'No skills selected; provide general review notes.'
  );
  const many = {
    selected: Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      name: `Skill ${i}`,
      phase: 'midstream',
      severity: 'high',
      modelHint: 'balanced',
    })),
  };
  const summary = buildSkillSummary(many);
  assert.ok(summary.includes('...and 3 more skills.'));
  assert.ok(summary.includes('- s5:'));
  assert.ok(!summary.includes('- s6:'));
});

test('the finding contract carries the review output vocabulary', () => {
  const contract = buildFindingContractSection({
    language: 'ja',
    severity: 'normal',
    depthConfig: getReviewDepthConfig('medium'),
    additionalInstructions: undefined,
  });
  // severity 語彙・証跡の必須項目・ID 捏造の禁止は判断側の契約であり、
  // profile 側で書き換えてはならない（ADR-006 の不変条件）。ここで pin する。
  assert.ok(contract.includes('Severity: blocker|warning|nit'));
  assert.ok(contract.includes('Confidence: high|medium|low'));
  assert.ok(contract.includes('"Evidence:" (>=5 chars)'));
  assert.ok(contract.includes('"Fix:" (>=10 chars)'));
  assert.ok(contract.includes('never invent, guess, abbreviate, or renumber an ID'));
  assert.ok(contract.includes('NO_ISSUES'));
});
