// Prompt Compiler の配線段（ADR-006 / #1859 + #1861）。
//
// generateReview（src/lib/review-engine.mjs）から抽出した。抽出前は
// generateReview の本体に直接書かれていたが、Prompt Compiler の関心事
// （IR 組み立て → profile 解決 → compile → 来歴の記録）は compiler.mjs /
// profile-resolver.mjs / review-request.mjs と同じ層に属するため、
// src/prompt/ 側へ置く。review-engine 側に残るのは呼び出し 1 箇所だけである。
//
// 責務の境界:
//   - 純関数である。debug へは書かない。呼び出し側へ観測値を返し、
//     debug への配置は generateReview（debug を組み立てている側）が行う。
//   - 既定 off。off のときは何もせず null を返す。IR も profile も作らない。

import { createHash } from 'node:crypto';

import { getReviewDepthConfig } from '../lib/review-plan-generator.mjs';
import { estimateTokens } from '../lib/token-estimator.mjs';
import { compileReviewPrompt, PROMPT_COMPILER_VERSION } from './compiler.mjs';
import { resolveProfile } from './profile-resolver.mjs';
import { buildReviewRequest } from './review-request.mjs';
import { buildSystemMessage } from './sections.mjs';

/** debug へ載せる hash の長さ。理由は promptFingerprint の JSDoc を参照。 */
const PROMPT_HASH_CHARS = 16;

/**
 * プロンプトの指紋。sha256 hex の先頭 16 文字だけを載せる。
 *
 * 全長 64 文字を持つ必要がない。この値の用途は「legacy と compiled が同じ
 * 文字列か」「同条件の 2 run で同じ文字列を作れているか」の等値比較だけであり、
 * 参照キーにも検索キーにもしない。artifact を人が読むときの見通しを優先して
 * 切り詰める。原文そのものは載せない（ADR-006 の observe 不変条件）。
 */
function promptFingerprint(text) {
  return createHash('sha256')
    .update(String(text), 'utf8')
    .digest('hex')
    .slice(0, PROMPT_HASH_CHARS);
}

/**
 * observe / active モードの記録を組む。
 *
 * 記録するのは hash と推定長と profile の来歴だけである。原文（prompt 本体、
 * diff 本文）は返り値に含めない。これは active でも変わらない。
 *
 * 推定長は src/lib/token-estimator.mjs の estimateTokens をそのまま使う。
 * 独自の概算を置くと legacy 側の既存計測（context budget）と単位が食い違う。
 *
 * legacy 側は system message と user prompt を連結して数える。compiled 側は
 * profile によって契約節の置き場所が system / user のどちらにもなるため、
 * 片方だけを数えると比較が成立しない。
 */
function buildPromptCompilerObservation({ mode, profile, legacyText, compiledText }) {
  return {
    mode,
    // どちらのプロンプトを provider 向けに選んだかである（#1861）。mode から
    // 決まり、実際に送信が起きたかどうかは表さない。dryRun / offline / API キー
    // 未設定では呼び出し自体が起きないが、その事実は既存の debug.llmSkipped と
    // debug.llmUsed が持つ。observe が dryRun でも 'legacy' を記録してきた
    // 従来の意味づけをそのまま延長している。
    sentPrompt: mode === 'active' ? 'compiled' : 'legacy',
    compilerVersion: PROMPT_COMPILER_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    legacyPromptEstimate: estimateTokens(legacyText),
    compiledPromptEstimate: estimateTokens(compiledText),
    legacyPromptHash: promptFingerprint(legacyText),
    compiledPromptHash: promptFingerprint(compiledText),
  };
}

/**
 * Prompt Compiler を 1 回走らせ、送信候補と観測記録を返す。
 *
 * 既定は off。off のとき何も作らず null を返すため、buildPrompt から下流の
 * 挙動は導入前と 1 バイトも変わらない。
 *
 * observe は compiled を生成するだけで送らない（activeCompiledPrompt は null）。
 * active（opt-in、既定では選ばれない）だけが compiled を返し、呼び出し側が
 * それを provider へ送る。既定を active へ動かす条件は ADR-006 の段 2 であり、
 * 本段はそれを変更しない。
 *
 * 引数は 1 個のオブジェクトにまとめてある。generateReview のローカル値を
 * 14 個受け取るため位置引数では順序事故が避けられない。専用の型を新設せず
 * 分解代入で受けるのは、buildPrompt / buildReviewRequest と同じ書き方に
 * 揃えるためである。
 *
 * @param {object} params
 * @param {object} params.reviewConfig  マージ済み config の review 節
 * @param {object} params.promptInfo    buildPrompt の戻り値（truncated / severity / prompt）
 * @param {object} params.llmDiff       buildLlmDiffView の戻り値（diffText / files）
 * @param {object} params.openAIConfig  resolveOpenAIConfig の戻り値（provider / model）
 * @returns {{activeCompiledPrompt: object|null, observation: object}|null}
 *   off のときは null。
 */
export function runPromptCompilerStage({
  reviewConfig,
  phase,
  plan,
  llmDiff,
  promptInfo,
  maxPromptChars,
  reviewMode,
  projectRules,
  relatedADRs,
  riskAssessment,
  repoContext,
  prBody,
  reviewObligations,
  language,
  openAIConfig,
}) {
  const mode = reviewConfig?.promptCompiler?.mode ?? 'off';
  if (mode === 'off') return null;

  // 差分本文の上限適用。buildPrompt（src/lib/review-engine.mjs）の同じ式を
  // 写している。buildPrompt 側は ADR-006 の実装方針により無改変で残すため
  // 共通化せず、両者が一致していることを tests/prompt-compiler-observe.test.mjs
  // が legacy prompt の末尾との突合で pin する。
  const compiledDiffBody = promptInfo.truncated
    ? `${llmDiff.diffText.slice(0, maxPromptChars)}\n...[truncated]`
    : llmDiff.diffText;
  const compiledDepthConfig = getReviewDepthConfig(reviewMode ?? 'medium');
  const ir = buildReviewRequest({
    subject: { phase, changedFiles: llmDiff.files },
    // 判断側の値は buildPrompt が解決したものをそのまま使う。ここで別経路
    // から取り直すと legacy と compiled で判断の入力が分岐する。
    judgment: {
      skillIds: (plan?.selected ?? []).map((s) => s.metadata?.id ?? s.id),
      severity: promptInfo.severity,
      plan,
    },
    context: {
      diff: compiledDiffBody,
      diffTruncated: promptInfo.truncated,
      projectRules,
      relatedADRs,
      riskAssessment,
      repoContext,
      prDescription: prBody,
      reviewObligations,
    },
    constraints: {
      maxFindings: compiledDepthConfig.maxFindings,
      focusHint: compiledDepthConfig.focusHint,
      walkthrough: reviewConfig?.walkthrough ?? false,
      agentHandoff: reviewConfig?.agentHandoff ?? false,
      additionalInstructions: reviewConfig?.additionalInstructions,
    },
    outputContract: { language },
    execution: { provider: openAIConfig.provider, model: openAIConfig.model },
  });
  const profile = resolveProfile({
    provider: openAIConfig.provider,
    model: openAIConfig.model,
  });
  const compiled = compileReviewPrompt(ir, profile);
  return {
    activeCompiledPrompt: mode === 'active' ? compiled : null,
    observation: buildPromptCompilerObservation({
      mode,
      profile,
      legacyText: `${buildSystemMessage(language)}\n${promptInfo.prompt}`,
      compiledText: `${compiled.systemMessage}\n${compiled.prompt}`,
    }),
  };
}
