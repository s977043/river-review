// renderer 共通のブロック生成（ADR-006 / #1859）
//
// renderer が変えてよいのは「節の順序」と「system / user のどちらへ置くか」
// だけである。節の文面は src/prompt/sections.mjs が唯一の出典であり、
// ここはその戻り値を連結するだけで、文言を書き換えない。
//
// このモジュールを挟む理由は、generic と openai の 2 renderer が同じ
// ブロックを別配置で使うためである。ブロック生成を各 renderer に複製すると、
// 配置だけを変えたいのに文面が枝分かれし得る。

import { buildRepoContextSection } from '../../lib/repo-context.mjs';
import {
  buildADRContextSection,
  buildFileSummary,
  buildFindingContractSection,
  buildHandoffSection,
  buildPrDescriptionSection,
  buildProjectRulesSection,
  buildReviewObligationsSection,
  buildRiskAssessmentSection,
  buildSkillSummary,
  buildSystemMessage,
  buildWalkthroughSection,
} from '../sections.mjs';

/** モデルに与える役割宣言。language 以外の入力を取らない。 */
export function renderRoleMessage(ir) {
  return buildSystemMessage(ir.outputContract.language);
}

/** レビュー対象の宣言。phase と変更ファイル、関連する観点の一覧。 */
export function renderSubjectBlock(ir) {
  return `You are River Review, an AI code review agent.
Phase: ${ir.subject.phase}

Changed files:
${buildFileSummary(ir.subject.changedFiles)}

Relevant skills:
${buildSkillSummary(ir.judgment.plan)}
`;
}

/** 判断のために渡す証跡。順序は legacy の並びを保つ。 */
export function renderContextBlock(ir) {
  const c = ir.context;
  return [
    buildProjectRulesSection(c.projectRules),
    buildRiskAssessmentSection(c.riskAssessment),
    buildADRContextSection(c.relatedADRs),
    buildRepoContextSection(c.repoContext),
    buildPrDescriptionSection(c.prDescription),
    buildWalkthroughSection(ir.constraints.walkthrough),
    buildHandoffSection(ir.constraints.agentHandoff),
    buildReviewObligationsSection(c.reviewObligations, ir.outputContract.language),
  ].join('');
}

/**
 * 出力契約。sections.mjs の戻り値をそのまま返す。
 *
 * depthConfig は IR の constraints から組む。ここで既定値を発明すると
 * 判断側の値を renderer が決めることになるため、欠けていても補わない。
 */
export function renderContractBlock(ir) {
  return buildFindingContractSection({
    language: ir.outputContract.language,
    severity: ir.judgment.severity,
    depthConfig: {
      maxFindings: ir.constraints.maxFindings,
      focusHint: ir.constraints.focusHint,
    },
    additionalInstructions: ir.constraints.additionalInstructions,
  });
}

/** 差分本体。IR には既に上限適用後の本文が入っている。 */
export function renderDiffBlock(ir) {
  return `Diff:
${ir.context.diff}`;
}
