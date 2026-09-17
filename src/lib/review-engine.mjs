import { mergeConfig } from '../config/loader.mjs';
import { computeFindingBreakdown } from './scoring/breakdown.mjs';
import {
  classifyFindings,
  formatFindingMessage,
  validateFindingMessage,
  parseFindingMessage,
  normalizeSeverity,
  normalizeScope,
} from './finding-factory.mjs';
import { defaultConfig } from '../config/default.mjs';
import { summarizeSkill } from '../../runners/core/review-runner.mjs';
import {
  buildHeuristicComments,
  HEURISTIC_SKILL_IDS,
  HEURISTIC_KIND_PRESENTATIONS,
} from './heuristic-review.mjs';
import { isOfflineMode } from './utils.mjs';
import { getReviewDepthConfig } from './review-plan-generator.mjs';
import { buildRepoContextSection } from './repo-context.mjs';
import { redactText } from './secret-redactor.mjs';
import { callChatCompletion } from './llm-pipeline.mjs';
import { buildLlmDiffView, isGeneratedArtifactPath } from './diff-processor.mjs';
// プロンプトの節生成は src/prompt/sections.mjs が SSoT。ADR-006 の Prompt
// Compiler が同じ節を別配置で描画するため、文面の二重管理を避けて双方が
// import する（生成結果はバイト単位で従来と同一。tests/prompt-sections.test.mjs）。
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
} from '../prompt/sections.mjs';
// ADR-006 / #1859 + #1861: Prompt Compiler の配線段。既定 off では
// runPromptCompilerStage が即 null を返し、compiler 側は一切呼ばれない。
import { runPromptCompilerStage } from '../prompt/compiler-stage.mjs';
import { runReviewViewpointStage } from './review-viewpoint-stage.mjs';

const ENV_DEFAULT_MODEL = process.env.RIVER_OPENAI_MODEL || process.env.OPENAI_MODEL || null;
const MAX_PROMPT_CHARS = 12000;
// プロンプト控えの上限。ここが SSoT で、artifact / debug へ出る控えを持つ
// 他モジュール（src/lib/finding-critic-runner.mjs）は再定義せずこれを import する。
export const MAX_PROMPT_PREVIEW_CHARS = 2000;
const NO_ISSUES_REGEX = /^NO_ISSUES/i;
const LINE_COMMENT_REGEX = /^(.+?):(\d+):\s*(.+)$/;

/**
 * スキル名のサニタイズ: Markdown インジェクション対策
 */
function sanitizeSkillName(name) {
  if (!name) return '';
  return String(name).replace(/[\[\]`*_{}()#+\-.!|<>\n]/g, '');
}

function resolveOpenAIConfig(options = {}, config = defaultConfig) {
  const provider = config.model?.provider ?? 'openai';
  const modelName = options.model || ENV_DEFAULT_MODEL || config.model?.modelName;
  return {
    provider,
    apiKey: options.apiKey || process.env.RIVER_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    model: modelName,
    endpoint:
      options.endpoint ||
      process.env.RIVER_OPENAI_BASE_URL ||
      'https://api.openai.com/v1/chat/completions',
    temperature: config.model?.temperature ?? 0,
    maxTokens: config.model?.maxTokens ?? 600,
  };
}

export function buildPrompt({
  diffText,
  diffFiles,
  plan,
  phase,
  projectRules,
  riskAssessment,
  memoryContext,
  relatedADRs,
  reviewMode,
  repoContext,
  prBody,
  reviewObligations,
  maxChars = MAX_PROMPT_CHARS,
  config = defaultConfig,
}) {
  const effectiveConfig = mergeConfig(defaultConfig, config ?? {});
  const reviewConfig = effectiveConfig.review ?? defaultConfig.review;
  const language = reviewConfig.language ?? defaultConfig.review.language;
  const severity = reviewConfig.severity ?? defaultConfig.review.severity;
  const wantWalkthrough = reviewConfig.walkthrough ?? false;
  const wantHandoff = reviewConfig.agentHandoff ?? false;
  const truncated = diffText.length > maxChars;
  const diffBody = truncated ? `${diffText.slice(0, maxChars)}\n...[truncated]` : diffText;
  const depthConfig = getReviewDepthConfig(reviewMode ?? 'medium');
  const prompt = `You are River Review, an AI code review agent.
Phase: ${phase}

Changed files:
${buildFileSummary(diffFiles)}

Relevant skills:
${buildSkillSummary(plan)}

${buildProjectRulesSection(projectRules)}${buildRiskAssessmentSection(riskAssessment)}${buildADRContextSection(relatedADRs)}${buildRepoContextSection(repoContext)}${buildPrDescriptionSection(prBody)}${buildWalkthroughSection(wantWalkthrough)}${buildHandoffSection(wantHandoff)}${buildReviewObligationsSection(reviewObligations, language)}${buildFindingContractSection(
    {
      language,
      severity,
      depthConfig,
      additionalInstructions: reviewConfig.additionalInstructions,
    }
  )}
Diff:
${diffBody}`;
  return { prompt, truncated, language, severity };
}

export function parseLineComments(outputText) {
  if (!outputText) return null;
  const comments = [];
  for (const rawLine of outputText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (NO_ISSUES_REGEX.test(line)) return [];
    const match = LINE_COMMENT_REGEX.exec(line);
    if (match) {
      comments.push({
        file: match[1].trim(),
        line: Number.parseInt(match[2], 10),
        message: match[3].trim(),
      });
    }
  }
  return comments.length ? comments : null;
}

// Transient-failure retry policy and the chat-completion call moved to
// llm-pipeline.mjs (#1338). The retry helpers are re-exported here so existing
// importers (tests, downstream consumers) keep working unchanged.
export { isRetryableStatus, isRetryableNetworkError, computeBackoffMs } from './llm-pipeline.mjs';

function buildFallbackComments(diff, plan, { llmSkipReason = null } = {}) {
  const allSkills = plan?.selected ?? [];
  // ヒューリスティック対応スキルは除外（ヒューリスティックで処理済み）
  const skills = allSkills.filter((skill) => {
    const skillId = skill.metadata?.id ?? skill.id;
    return !HEURISTIC_SKILL_IDS.includes(skillId);
  });

  const firstFile = diff.files?.find((f) => f?.path && f.path !== '/dev/null') ?? null;
  if (!firstFile) {
    return [
      {
        file: '(no-files)',
        line: 1,
        message: formatFindingMessage({
          finding: 'レビュー対象ファイルが特定できない',
          evidence: '差分ファイルが空',
          impact: 'レビューの自動化ができない',
          fix: '差分がある状態で再実行する',
          severity: 'warning',
          confidence: 'low',
        }),
      },
    ];
  }

  const line =
    firstFile.addedLines?.[0] ||
    firstFile.hunks?.[0]?.newStart ||
    1; /* default to first added line or hunk start to keep pointers stable */

  // Build specific reason message
  const evidenceBase = llmSkipReason
    ? `LLM: ${llmSkipReason}`
    : 'ヒューリスティック検出パターンに該当なし';

  // スキルがない場合は1件のコメントを生成
  if (skills.length === 0) {
    return [
      {
        file: firstFile.path,
        line,
        message: formatFindingMessage({
          finding: 'マッチするスキルがなく自動指摘を生成できなかった',
          evidence: evidenceBase,
          impact: '重要なリスクを見落とす可能性がある',
          fix: 'このファイル種別に対応するスキルを追加するか、手動レビューを実施する',
          severity: 'warning',
          confidence: 'low',
        }),
      },
    ];
  }

  // スキル単位でコメントを生成
  return skills.map((skill) => {
    const skillId = skill.metadata?.id ?? skill.id;
    const rawSkillName = skill.metadata?.name ?? skillId;
    const skillName = sanitizeSkillName(rawSkillName);
    return {
      file: firstFile.path,
      line,
      skillId,
      message: formatFindingMessage({
        finding: `スキル「${skillName}」の観点で自動指摘を生成できなかった`,
        evidence: evidenceBase,
        impact: 'このスキルが検出する問題を見落とす可能性がある',
        fix: `「${skillName}」の観点で手動レビューを実施する`,
        severity: 'warning',
        confidence: 'low',
      }),
    };
  });
}

function normalizeHeuristicComments(rawComments) {
  return rawComments.map((c) => {
    // kind → プレゼンテーションは heuristic-review.mjs の単一レジストリ
    // (HEURISTIC_KIND_PRESENTATIONS) から導出する。detector の追加はレジストリ
    // 1 箇所で完結し、ここに case を足す必要はない。
    const preset = HEURISTIC_KIND_PRESENTATIONS.get(c.kind);
    if (!preset) {
      return {
        file: c.file,
        line: c.line,
        message: formatFindingMessage({
          finding: `想定外のヒューリスティック（kind=${String(c.kind ?? 'unknown')}）`,
          evidence: 'ヒューリスティック kind が未知',
          impact: 'レビュー結果が不安定になる可能性がある',
          fix: 'ヒューリスティック定義と出力の対応を見直す',
          severity: 'warning',
          confidence: 'low',
        }),
      };
    }
    return {
      file: c.file,
      line: c.line,
      skillId: c.skillId,
      message: formatFindingMessage(preset),
    };
  });
}

function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA****************')
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, 'ghp_***REDACTED***')
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, 'sk_***REDACTED***')
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, 'sk-***REDACTED***')
    .replace(/-----BEGIN [^-]* PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----')
    .replace(/-----END [^-]* PRIVATE KEY-----/g, '-----END PRIVATE KEY-----');
}

/**
 * Verifier 段。generateReview（下）から抽出した（#1901 / #1905 と同じ型の第 2 段）。
 *
 * この 1 関数が担うのは次の 4 つで、抽出前と同じ順序・同じ条件で走る:
 *   1. 品質チェック（verifyFinding）による filter
 *   2. #1644 の scope 判定を comment へ載せる（`withScope`）
 *   3. scope の集計（`summarizeScope`）
 *   4. 全件棄却時の fail-safe（heuristic / fallback へ degrade して再検証）
 *
 * 置き場所について。src/prompt/compiler-stage.mjs（段 1）は独立 module にした
 * が、この段は同じにできない。fail-safe が `buildHeuristicComments` の結果を
 * `normalizeHeuristicComments` / `buildFallbackComments` で組み直す必要があり、
 * 後者 2 つは本 module 内の private helper で、verifier 段より前の
 * fallback（`if (!comments.length)`）とも共有している。新 module へ出すには
 * それらを先に別 module へ移す必要があり、それは本段とは独立の変更になる。
 * verifier.mjs へ足す案も採れない — verifier.mjs は finding-factory.mjs しか
 * import しない per-finding の判定器であり、そこへ heuristic-review.mjs と本
 * module の helper を持ち込むと review-engine ↔ verifier の循環 import になる。
 * よって本段は module scope 関数として同一ファイルに置く。
 *
 * 副作用の扱い。段 1 は「純関数にして debug へは呼び出し側が書く」方針だが、
 * この段は debug へ 7 個の key を 2 経路（通常経路と fail-safe）から条件付きで
 * 書き、`scopeStats` に至っては 2 回代入する。そのまま返り値へ移すと
 * generateReview 側に同じ条件分岐がもう一度並ぶ。代わりに「debug へ足すべき
 * key を 1 個の patch object にまとめて返し、呼び出し側が Object.assign する」
 * 形にした。段 1 の不変条件（この関数は debug を触らない）は保ったまま、
 * key の挿入順（= JSON の並び順）も抽出前と同一になる。`scopeStats` の 2 回
 * 目の代入は patch 内の同じ key の上書きで表現され、位置は動かない。
 *
 * @param {object} params
 * @param {Array<object>} params.comments 検証対象（LLM / heuristic / fallback の一次集合）
 * @param {{diffText: string, files?: Array<object>}} params.diff 生の差分（LLM 用に間引く前）
 * @param {boolean} params.heuristicsUsed 一次集合が既に heuristic 由来か（fail-safe の抑止条件）
 * @param {string|null|undefined} params.llmSkipped debug.llmSkipped
 * @param {string|null|undefined} params.llmError debug.llmError
 * @returns {Promise<{comments: Array<object>, debugPatch: object}>}
 */
async function runVerifierStage({
  comments,
  diff,
  plan,
  fileTypes,
  includeFallback,
  heuristicsUsed,
  llmSkipped,
  llmError,
}) {
  const { verifyFinding } = await import('./verifier.mjs');
  const skill = plan?.selected?.[0] ?? {};
  const runVerifier = (cmts) =>
    cmts.map((comment) => ({
      comment,
      verification: verifyFinding({
        finding: comment,
        diff: diff.diffText,
        skill,
        fileTypes,
        // #1644: parsed diff files carry addedLines, enabling the verifier's
        // machine determination of finding scope (in-diff / pre-existing).
        diffFiles: diff.files,
      }),
    }));

  // #1644: carry the verifier's scope verdict on the comment so the findings
  // built below can adopt it. Metadata only — display and gating are unchanged.
  const withScope = (r) => ({ ...r.comment, scope: r.verification.scope });

  const verifierResults = runVerifier(comments);
  let verified = verifierResults.filter((r) => r.verification.verified).map(withScope);
  const rejected = verifierResults.filter((r) => !r.verification.verified);

  const debugPatch = {};
  // debug.verifierStats/verifierRejected describe the verifier pass over the
  // primary (LLM or first-pass heuristic) comment set — i.e. the signal for why
  // a fallback did or did not fire. The finally-emitted set is result.findings.
  debugPatch.verifierRejected = rejected.map((r) => ({
    file: r.comment.file,
    line: r.comment.line,
    reasons: r.verification.reasons,
  }));
  debugPatch.verifierStats = {
    total: comments.length,
    verified: verified.length,
    rejected: rejected.length,
  };

  // #1644: observability for the scope determination. `mismatch` counts
  // findings whose LLM self-report disagreed with the machine determination
  // (the machine verdict wins); a rising count signals prompt drift. Unlike
  // verifierStats — which intentionally keeps describing the primary (possibly
  // wholly rejected) batch — scopeStats must describe the set that actually
  // carries `scope` into the findings, so it is recomputed from the last
  // verifier pass whenever the fallback branch below re-runs the verifier.
  const summarizeScope = (results) =>
    results.reduce(
      (acc, r) => {
        acc[r.verification.scope] = (acc[r.verification.scope] ?? 0) + 1;
        acc.bySource[r.verification.scopeSource] =
          (acc.bySource[r.verification.scopeSource] ?? 0) + 1;
        if (r.verification.scopeMismatch) acc.mismatch += 1;
        return acc;
      },
      { 'in-diff': 0, 'pre-existing': 0, mismatch: 0, bySource: {} }
    );
  debugPatch.scopeStats = summarizeScope(verifierResults);

  // Fail-safe: mirror the format-validation fallback for a wholesale verifier
  // rejection. Inline-only findings (Severity:/Confidence: present but
  // Evidence:/Fix: omitted) pass format validation yet fail the verifier; the
  // heuristic fallback above only runs when the LLM produced *no* usable
  // comments (verifier runs after it), so without this branch a fully-rejected
  // LLM batch would emit an empty review. Degrade to the same safe heuristic/
  // fallback path instead. Guard on `!heuristicsUsed` so a batch that was
  // already heuristic is not reprocessed.
  if (verified.length === 0 && verifierResults.length > 0 && !heuristicsUsed) {
    debugPatch.verifierAllRejected = true;
    // 抽出前は外側の `comments` を上書きしていたが、直後に verified で置き換え
    // られるため観測されない。局所変数にして寿命を段の内側へ閉じている。
    let degraded;
    const heuristic = buildHeuristicComments({ diff, plan });
    if (heuristic.length) {
      degraded = normalizeHeuristicComments(heuristic);
      debugPatch.heuristicsUsed = true;
      debugPatch.heuristicsCount = heuristic.length;
    } else {
      const llmSkipReason = llmSkipped || llmError || null;
      const isMissingKey = llmSkipReason && llmSkipReason.includes('not set');
      degraded = isMissingKey
        ? []
        : includeFallback
          ? buildFallbackComments(diff, plan, { llmSkipReason })
          : [];
      debugPatch.heuristicsCount = 0;
      debugPatch.fallbackIncluded = includeFallback;
    }
    // Re-verify the fallback set so the emitted comments still satisfy the
    // verifier invariant (heuristic/fallback findings use the full labeled
    // format and pass). verifierStats above intentionally keeps describing the
    // rejected LLM batch.
    const fallbackResults = runVerifier(degraded);
    verified = fallbackResults.filter((r) => r.verification.verified).map(withScope);
    debugPatch.scopeStats = summarizeScope(fallbackResults);
  }

  // Verified-only set. 呼び出し側の `comments` はこれで置き換わる。
  return { comments: verified, debugPatch };
}

/**
 * Generate review comments using LLM when configured, otherwise fall back to deterministic hints.
 */
export async function generateReview({
  diff,
  plan,
  phase,
  dryRun = false,
  includeFallback = true,
  model,
  apiKey,
  projectRules,
  fileTypes,
  relatedADRs,
  riskAssessment,
  reviewMode,
  repoContext,
  prBody,
  maxPromptChars = MAX_PROMPT_CHARS,
  config,
}) {
  const effectiveConfig = mergeConfig(defaultConfig, config ?? {});
  // LLM-facing view: strip non-reviewable build artifacts (dist bundles, source
  // maps) from BOTH the diff body and the "Changed files" summary. `diff` itself
  // stays raw so heuristics/fallback below keep seeing every changed file
  // (#1543/#1547).
  const llmDiff = buildLlmDiffView(diff);
  const viewpointStage = await runReviewViewpointStage({
    reviewConfig: effectiveConfig.review,
    diff,
    plan,
  });
  const reviewObligations = viewpointStage?.activeObligations ?? [];
  const promptInfo = buildPrompt({
    diffText: llmDiff.diffText,
    diffFiles: llmDiff.files,
    plan,
    phase,
    projectRules,
    relatedADRs,
    riskAssessment,
    reviewMode,
    repoContext,
    prBody,
    reviewObligations,
    maxChars: maxPromptChars,
    config: effectiveConfig,
  });
  const openAIConfig = resolveOpenAIConfig({ model, apiKey }, effectiveConfig);
  const language = promptInfo.language ?? effectiveConfig.review.language;

  // #692 PR-D: defense-in-depth redaction at the artifact boundary.
  // PR-C already redacts repo context before it reaches the prompt, but
  // any other path (project rules with a pasted token, additional
  // instructions, etc.) could still slip a secret in. Build a single
  // redacted view of the prompt and use it everywhere the prompt would
  // otherwise leave process memory (debug.promptPreview, returned
  // `prompt`, downstream artifact writes). The LLM call still uses the
  // original `promptInfo.prompt` because it must.
  const safePrompt = redactText(promptInfo.prompt, {
    allowlist: effectiveConfig.security?.redact?.allowlist ?? [],
    ...(effectiveConfig.security?.redact?.entropyThreshold != null
      ? { entropyThreshold: effectiveConfig.security.redact.entropyThreshold }
      : {}),
    ...(effectiveConfig.security?.redact?.categories?.highEntropy === false
      ? { highEntropy: false }
      : {}),
  }).text;

  let comments = [];
  const debug = {
    promptTruncated: promptInfo.truncated,
    promptPreview: safePrompt.slice(0, MAX_PROMPT_PREVIEW_CHARS),
    llmModel: openAIConfig.model,
    llmProvider: openAIConfig.provider,
    reviewLanguage: language,
    reviewSeverity: promptInfo.severity,
    repoContext: repoContext
      ? {
          sections: repoContext.sections.map((s) => ({
            label: s.label,
            chars: s.content.length,
            file: s.file,
          })),
          totalChars: repoContext.totalChars,
          truncated: repoContext.truncated,
        }
      : null,
  };

  if (viewpointStage) {
    debug.execution = {
      ...(debug.execution ?? {}),
      reviewViewpoints: viewpointStage.observation,
    };
  }

  // --- ADR-006 / #1859 + #1861: Prompt Compiler（配線はこの 1 箇所だけ）---
  //
  // 段の本体は src/prompt/compiler-stage.mjs にある。既定は off で、そのとき
  // runPromptCompilerStage は null を返し、buildPrompt から下流の挙動は導入前と
  // 1 バイトも変わらない。
  //
  // observe は compiled を生成するだけで送らない。active（opt-in、既定では
  // 選ばれない）だけが activeCompiledPrompt を返し、それを provider へ送る。
  const promptCompilerStage = runPromptCompilerStage({
    reviewConfig: effectiveConfig.review,
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
  });
  // active のときだけ埋まる。null のままなら送信は legacy 側が担う。
  const activeCompiledPrompt = promptCompilerStage?.activeCompiledPrompt ?? null;
  if (promptCompilerStage) {
    debug.execution = {
      ...(debug.execution ?? {}),
      promptCompiler: promptCompilerStage.observation,
    };
  }

  const skipReason = dryRun
    ? 'dry-run enabled'
    : isOfflineMode()
      ? 'offline (rules-only) mode enabled'
      : openAIConfig.provider !== 'openai'
        ? `provider ${openAIConfig.provider} is not supported yet`
        : openAIConfig.apiKey
          ? null
          : 'LLM API key (ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY) not set';

  if (!skipReason) {
    try {
      // #1861: active のときだけ compiled 側を送る。off / observe では
      // activeCompiledPrompt が null のままなので、送信物は導入前と同一である。
      const output = await callChatCompletion({
        prompt: activeCompiledPrompt ? activeCompiledPrompt.prompt : promptInfo.prompt,
        apiKey: openAIConfig.apiKey,
        model: openAIConfig.model,
        endpoint: openAIConfig.endpoint,
        temperature: openAIConfig.temperature,
        maxTokens: openAIConfig.maxTokens,
        systemMessage: activeCompiledPrompt
          ? activeCompiledPrompt.systemMessage
          : buildSystemMessage(language),
      });
      // T64 follow-up (gemini security-high): redact at storage time so the
      // raw LLM output never leaves process memory unmasked. Keeps the same
      // redaction invariant already applied to parsed comment messages below.
      debug.rawLlmOutput = redactSecrets(output);
      const parsed = parseLineComments(output);
      if (parsed !== null) {
        const redacted = parsed.map((c) => ({ ...c, message: redactSecrets(c.message) }));
        if (redacted.length === 0) {
          // NO_ISSUES: a legitimate "the LLM found nothing to flag" response.
          // Not a validation failure — must not be routed through the
          // invalid/fallback branch below (there are no findings to validate).
          comments = redacted;
          debug.llmUsed = true;
        } else {
          const checks = redacted.map((c) => validateFindingMessage(c.message));
          // T64 follow-up (#1529 E2E): a single truncated/malformed finding
          // (e.g. maxTokens cutoff dropping the trailing Severity:/Confidence:
          // labels) used to invalidate the whole batch and discard
          // otherwise-valid findings. Drop only the invalid findings and keep
          // the valid ones; fail-safe fallback still applies when *none* of
          // the findings are valid (validEntries.length === 0).
          const validEntries = redacted.filter((_, i) => checks[i].ok);
          const invalidEntries = redacted
            .map((c, i) => ({ comment: c, check: checks[i] }))
            .filter(({ check }) => !check.ok);
          const invalidCount = invalidEntries.length;
          if (validEntries.length > 0) {
            comments = validEntries;
            debug.llmUsed = true;
            if (invalidCount > 0) {
              debug.droppedInvalidFindings = invalidCount;
              const firstInvalid = invalidEntries[0];
              debug.droppedInvalidFindingsSample = {
                file: firstInvalid.comment.file,
                line: firstInvalid.comment.line,
                missing: firstInvalid.check.missing,
                invalid: firstInvalid.check.invalid,
              };
              debug.llmError = `LLM findings partially violated required format (dropped ${invalidCount} of ${redacted.length}); continuing with LLM using the remaining ${validEntries.length} valid finding(s).`;
            }
          } else {
            debug.llmUsed = false;
            debug.llmError = `LLM findings violate required format (invalidCount=${invalidCount}). Falling back.`;
          }
        }
      } else {
        debug.llmUsed = false;
        debug.llmError = 'LLM output could not be parsed';
      }
    } catch (err) {
      debug.llmUsed = false;
      debug.llmError = err.message;
    }
  } else {
    debug.llmUsed = false;
    debug.llmSkipped = skipReason;
  }

  if (!comments.length) {
    const heuristic = buildHeuristicComments({ diff, plan });
    debug.heuristicsUsed = true;
    if (heuristic.length) {
      comments = normalizeHeuristicComments(heuristic);
      debug.heuristicsCount = heuristic.length;
    } else {
      const llmSkipReason = debug.llmSkipped || debug.llmError || null;
      // If skipped due to missing API key, do not generate fallback warnings (user request)
      const isMissingKey = llmSkipReason && llmSkipReason.includes('not set');

      if (isMissingKey) {
        comments = [];
      } else {
        comments = includeFallback ? buildFallbackComments(diff, plan, { llmSkipReason }) : [];
      }
      debug.heuristicsCount = 0;
      debug.fallbackIncluded = includeFallback;
    }
  }

  const formatChecks = comments.map((c) => ({
    file: c.file,
    line: c.line,
    ...validateFindingMessage(c.message),
  }));
  const invalidCount = formatChecks.filter((c) => !c.ok).length;
  debug.findingFormat = invalidCount
    ? { ok: false, invalidCount, samples: formatChecks.filter((c) => !c.ok).slice(0, 3) }
    : { ok: true };
  // Surface findings that validated but omitted recommended content labels
  // (Finding:/Evidence:/Impact:/Fix:). These pass format validation on the
  // strength of Severity:/Confidence: alone, but the omission is worth
  // observing during calibration because such findings tend to be rejected by
  // the verifier downstream (Evidence:/Fix: are required there).
  const recommendedGaps = formatChecks.filter((c) => c.ok && c.missingRecommended.length > 0);
  if (recommendedGaps.length > 0) {
    debug.findingFormat.recommendedGaps = recommendedGaps.length;
    debug.findingFormat.recommendedGapsSample = recommendedGaps.slice(0, 3).map((c) => ({
      file: c.file,
      line: c.line,
      missingRecommended: c.missingRecommended,
    }));
  }

  debug.fileClassification = fileTypes ?? null;

  // Verifier pass: filter findings that fail quality checks.
  // 段の本体は runVerifierStage（同ファイル、上）にある。#1644 の scope 判定と
  // 全件棄却時の fail-safe もその内側にある。debug への反映は patch の
  // Object.assign 1 回だけで、key の挿入順は抽出前と同一である。
  const verifierStage = await runVerifierStage({
    comments,
    diff,
    plan,
    fileTypes,
    includeFallback,
    heuristicsUsed: debug.heuristicsUsed,
    llmSkipped: debug.llmSkipped,
    llmError: debug.llmError,
  });
  Object.assign(debug, verifierStage.debugPatch);
  // Replace comments with verified-only set
  comments = verifierStage.comments;

  // #1597: Output-stage filter for findings that point at a machine-generated
  // build-artifact directory (a `dist/` path segment). #1570 excluded these
  // paths from the LLM-facing diff only; the heuristic detectors still scan the
  // raw diff.files by design (the #1070 canary boundary), so a heuristic finding
  // can still land on `runners/github-action/dist/index.mjs` and reach output.
  // Drop those findings here — the SINGLE choke point where `comments` becomes
  // both the emitted PR comments AND the source of `findings`/`classified` — so
  // display, PR comments, and score (rubric penalty is computed from `findings`)
  // all exclude them consistently. The generated artifact's quality derives from
  // its source, so scoring it would double-count. Detection stays intact;
  // suppressed findings are surfaced in debug for observability. Uses
  // `isGeneratedArtifactPath`, which is intentionally narrower than the LLM
  // diff's `isExcludedFile`: it matches only the generated directory, so real
  // findings on `.md` / lock files are NOT suppressed from output.
  const keptComments = [];
  const suppressedGeneratedPathComments = [];
  for (const c of comments) {
    if (isGeneratedArtifactPath(c.file)) {
      suppressedGeneratedPathComments.push(c);
    } else {
      keptComments.push(c);
    }
  }
  if (suppressedGeneratedPathComments.length > 0) {
    comments = keptComments;
    debug.suppressedGeneratedPathFindings = suppressedGeneratedPathComments.length;
    debug.suppressedGeneratedPathFindingsSample = suppressedGeneratedPathComments
      .slice(0, 3)
      .map((c) => ({ file: c.file, line: c.line }));
  }

  // Build structured findings from verified comments
  const findings = comments.map((c, i) => {
    const parsed = parseFindingMessage(c.message);
    const severity = normalizeSeverity(parsed.severity);
    // Confidence is guaranteed present+valid here (validateFindingMessage gates
    // it upstream), so the 'medium' branch is currently unreachable; it is kept
    // as a conservative default in case an unverified path ever reaches this.
    const confidence =
      parsed.confidence && ['high', 'medium', 'low'].includes(parsed.confidence)
        ? parsed.confidence
        : 'medium';
    return {
      id: `rr-${i + 1}`,
      ruleId: c.skillId || 'unknown',
      file: c.file,
      lineStart: c.line ?? null,
      lineEnd: c.line ?? null,
      title: parsed.title || c.message.slice(0, 80),
      message: c.message,
      severity,
      confidence,
      status: /** @type {'open'} */ ('open'),
      evidence: parsed.evidence,
      suggestion: parsed.suggestion || null,
      // #1644 Phase 1: verifier verdict (machine determination, falling back to
      // the LLM self-report and then to the fail-safe default `in-diff`).
      scope: normalizeScope(c.scope ?? parsed.scope),
      // #1666 (#1545 Phase 2): traceability refs, self-reported by the filling
      // skills. Null when the reviewer supplied no label — the artifact IDs are
      // never invented here, so a missing artifact stays missing.
      criterionRefs: parsed.criterionRefs,
      artifactRefs: parsed.artifactRefs,
    };
  });

  findings.sort((a, b) => {
    const bA = computeFindingBreakdown(a);
    const bB = computeFindingBreakdown(b);
    return bB.composite - bA.composite;
  });

  const classified = classifyFindings(findings, { reviewMode: reviewMode ?? 'medium' });
  // #1857 / ADR-007 `observe` 条件 3: the overview-cap overflow is a ranking
  // outcome, so it carries no reason code and is NOT displayed (the report
  // prints every comment — see formatPrioritySummaryMarkdown). Recording the
  // count here is what makes the cap observable without claiming that anything
  // was hidden. Conditional like the other counters above, so a run with no
  // overflow keeps the debug key set it had before.
  if (classified.overflow.length > 0) {
    debug.overviewCapOverflow = classified.overflow.length;
  }

  return {
    comments,
    findings,
    classified,
    // The returned prompt flows into local-runner result, artifacts, and
    // dashboards. Use the redacted view so a leaked secret never leaves
    // process memory through these paths. The LLM call above used the
    // original promptInfo.prompt and is unaffected.
    prompt: safePrompt,
    promptTruncated: promptInfo.truncated,
    llmModel: openAIConfig.model,
    debug,
  };
}
