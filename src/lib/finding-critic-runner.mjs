// Finding Critic runner (#1978 Phase 1c) — 状態機械へ応答を供給する薄い配線。
//
// 位置づけ:
//   Phase 1a/1b で src/lib/finding-critic.mjs の決定論の状態機械と、その
//   fixture 台帳（tests/fixtures/1978-phase1b/fixtures.json）が着地した。
//   足りていなかったのは「プロンプト生成 → LLM 呼び出し境界 → パース →
//   状態機械 → 振り分け」を端から端まで繋ぐ経路である。このモジュールが
//   その経路であり、それ以上のことはしない。
//
// このモジュールが持たないもの（すべて finding-critic.mjs の責務）:
//   - verdict / askRelevance の解釈、証跡の接地判定、終端状態の決定
//   - 内側ループの回数制御（clamp は runValidationLoop が持つ）
//   - 振り分け規則（partitionByAskRelevance）
//   ここに判定を 1 行でも書くと二重管理になるので、すべて import して使う。
//
// LLM 呼び出し境界に callChatCompletion（src/lib/llm-pipeline.mjs）を選んだ理由:
//   Critic ターンは「diff をレビューして findings を出す」呼び出しではなく、
//   構造化 JSON を 1 個返させる汎用の chat 呼び出しである。AIClientFactory
//   （src/ai/factory.mjs）の client が公開するのは generateReview(systemPrompt,
//   diff) というレビュー生成専用の形で、第 2 引数が diff に固定されている。
//   callChatCompletion は systemMessage / prompt を素直に受け、timeout・
//   retry・fetchImpl 注入を既に持つ唯一の共通境界なので、そちらへ載せる。
//
// 意図的にこの PR へ含めていないもの:
//   generateReview / reviewer-orchestrator への段の挿入、CLI フラグ・env、
//   schemas/*.json と artifact への validation 出力。いずれも公開契約に
//   触れるため別 PR とする。
//
// 未決のまま扱っているもの（このモジュールはどちらでも動く形にしてある）:
//   Critic を per-reviewer に置くか merge 後に置くか、validation の保存先。

import {
  ASK_RELEVANCE,
  DEFAULT_MAX_INNER_ROUNDS,
  HARD_CAP_INNER_ROUNDS,
  buildValidatedFinding,
  evaluateExchange,
  parseCriticResponse,
  partitionByAskRelevance,
  preVerifyFinding,
  runValidationLoop,
} from './finding-critic.mjs';
import { callChatCompletion } from './llm-pipeline.mjs';
import { MAX_PROMPT_PREVIEW_CHARS } from './review-engine.mjs';
import { redactText } from './secret-redactor.mjs';
import {
  buildCriticPromptSection,
  buildCriticSystemMessage,
  buildReviewerRebuttalPromptSection,
} from '../prompt/sections.mjs';

/** callImpl に渡される役割。1 回の往復がどちらのターンかを表す。 */
export const CRITIC_TURN = Object.freeze({
  CRITIC: 'critic',
  REVIEWER: 'reviewer',
});

/**
 * 呼び出し失敗を evaluateExchange の `kind` 語彙へ写す。
 *
 * 判定ではなく転送層の分類である。evaluateExchange は `timeout` と `error` を
 * 同じ fail-safe（critic-timeout・人間へエスカレーション）へ落とすので、
 * ここでの取り違えが終端状態を変えることはない。reason の可読性のためだけに
 * 2 つを分けている。
 */
/**
 * trace へ残すプロンプトの控え。review-engine.mjs の `promptPreview` と同じ
 * 経路・同じ上限に揃える。redact は「秘密を落とす」ためのもので長さを
 * 制限しないので、上限は別に掛ける必要がある。
 */
function promptPreviewOf(prompt, redactOptions) {
  return redactText(prompt, redactOptions).text.slice(0, MAX_PROMPT_PREVIEW_CHARS);
}

function classifyCallFailure(err) {
  const name = String(err?.name ?? '');
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error';
}

/**
 * 既定の callImpl。review-engine.mjs と同じ chat-completion 境界を使う。
 * @param {{ systemMessage: string, prompt: string, llm: object }} turn
 * @returns {Promise<string>}
 */
export async function defaultCriticCall({ systemMessage, prompt, llm = {} }) {
  return callChatCompletion({ ...llm, systemMessage, prompt });
}

/**
 * 1 件の finding を Critic 経路へ通す。
 *
 * 流れ:
 *   preVerifyFinding → （sendToCritic なら）Critic prompt → callImpl →
 *   parseCriticResponse → 必要なら Reviewer prompt → callImpl →
 *   runValidationLoop → partitionByAskRelevance
 *
 * Reviewer ターンを回すかどうかは自前で判定しない。reviewer 無しの exchange を
 * evaluateExchange へ通し、非終端（= 状態機械が「Reviewer 待ち」と言った）
 * 場合にだけ 2 本目を呼ぶ。判定は状態機械の側に残す。
 *
 * @param {object} input
 * @param {{ id?: string, severity?: string, message?: string }} input.finding
 * @param {string} [input.diff]
 * @param {string} [input.originalAsk]
 * @param {string[]} [input.acceptanceCriteria]
 * @param {object} [input.skill]        preVerifyFinding へそのまま渡す
 * @param {object} [input.fileTypes]    同上
 * @param {string[]} [input.diffFiles]  同上
 * @param {object} [input.llm]          callChatCompletion のオプション一式
 * @param {string} [input.language]     'ja' | 'en'
 * @param {number} [input.maxInnerRounds]
 * @param {number} [input.hardCap]
 * @param {object} [input.redactOptions] redactText のオプション（trace 用）
 * @param {(turn: object) => Promise<unknown>} [input.callImpl]
 * @param {boolean} [input.deterministicSource] detector 由来の finding（#2871）
 * @returns {Promise<{ finding: object, deterministic: object, exchanges: object[], result: object, validated: object, routed: object, trace: object[] }>}
 */
export async function runFindingCritic({
  finding,
  diff = '',
  originalAsk = '',
  acceptanceCriteria = [],
  skill,
  fileTypes,
  diffFiles,
  llm = {},
  language = 'ja',
  maxInnerRounds = DEFAULT_MAX_INNER_ROUNDS,
  hardCap = HARD_CAP_INNER_ROUNDS,
  redactOptions = {},
  callImpl = defaultCriticCall,
  deterministicSource = false,
}) {
  const deterministic = preVerifyFinding({
    finding,
    diff,
    skill,
    fileTypes,
    diffFiles,
    deterministicSource,
  });

  // 決定論の段で落ちた finding は Critic を呼ばずに終わる。status は
  // preVerifyFinding が決めたものをそのまま使い、ここで作り直さない。
  if (!deterministic.sendToCritic) {
    const result = {
      status: deterministic.status,
      terminal: true,
      humanReview: false,
      retainFinding: false,
      reasons: deterministic.reasons,
      rounds: 0,
      askRelevance: ASK_RELEVANCE.UNCERTAIN,
    };
    return {
      finding,
      deterministic,
      exchanges: [],
      result,
      validated: buildValidatedFinding(finding, result),
      routed: partitionByAskRelevance([{ finding, result }]),
      trace: [],
    };
  }

  const exchanges = [];
  const trace = [];
  // clamp の権威は runValidationLoop 側にある。ここでは「何回まで LLM を
  // 呼ぶか」を同じ式で揃えるためだけに使い、状態の判定には使わない。
  const cap = Math.max(
    1,
    Math.min(Number(maxInnerRounds) || 1, Number(hardCap) || 1, HARD_CAP_INNER_ROUNDS)
  );

  let result = null;
  for (let round = 1; round <= cap; round++) {
    const criticPrompt = buildCriticPromptSection({
      finding,
      diff,
      originalAsk,
      acceptanceCriteria,
      language,
    });
    const criticSystem = buildCriticSystemMessage(CRITIC_TURN.CRITIC, language);

    /** @type {{ kind?: string, payload?: unknown }} */
    let critic;
    let criticRaw = null;
    try {
      criticRaw = await callImpl({
        role: CRITIC_TURN.CRITIC,
        round,
        finding,
        diff,
        systemMessage: criticSystem,
        prompt: criticPrompt,
        llm,
      });
      critic = { payload: criticRaw };
    } catch (err) {
      critic = { kind: classifyCallFailure(err) };
    }

    const exchange = { critic };
    trace.push({
      round,
      role: CRITIC_TURN.CRITIC,
      // review-engine.mjs の safePrompt と同じ経路。LLM へ送るのは原文で、
      // プロセス外へ出る可能性のある控えだけを redact し、同じ長さで切る。
      promptPreview: promptPreviewOf(criticPrompt, redactOptions),
      parsed: criticRaw === null ? null : parseCriticResponse(criticRaw),
    });

    // Reviewer ターンの要否は状態機械に聞く。ここに「DISAGREE なら反論を
    // 求める」という規則を書くと finding-critic.mjs と二重管理になる。
    const probe = evaluateExchange({ critic, reviewer: undefined, deterministic, diff, round });
    if (!probe.terminal) {
      const reviewerPrompt = buildReviewerRebuttalPromptSection({
        finding,
        criticResponse: criticRaw,
        diff,
        language,
      });
      try {
        const reviewerRaw = await callImpl({
          role: CRITIC_TURN.REVIEWER,
          round,
          finding,
          diff,
          criticResponse: criticRaw,
          systemMessage: buildCriticSystemMessage(CRITIC_TURN.REVIEWER, language),
          prompt: reviewerPrompt,
          llm,
        });
        // undefined / null は「反論なし」であり、状態機械はそれを
        // 「Reviewer 待ちのまま非終端」として扱う。握り潰さずそのまま渡す。
        if (reviewerRaw !== undefined && reviewerRaw !== null) exchange.reviewer = reviewerRaw;
      } catch (err) {
        // Reviewer 側の呼び出し失敗も Critic 不達と同じ扱いにする。
        exchange.critic = { kind: classifyCallFailure(err) };
      }
      trace.push({
        round,
        role: CRITIC_TURN.REVIEWER,
        promptPreview: promptPreviewOf(reviewerPrompt, redactOptions),
      });
    }

    exchanges.push(exchange);
    result = runValidationLoop({ exchanges, deterministic, diff, maxInnerRounds, hardCap });
    if (result.terminal) break;
  }

  // exchanges を 1 本も積めない cap は runValidationLoop 側で起こり得ない
  // ため、result は必ず埋まる。念のため fail-safe 側へ寄せる。
  result ??= runValidationLoop({ exchanges, deterministic, diff, maxInnerRounds, hardCap });

  return {
    finding,
    deterministic,
    exchanges,
    result,
    validated: buildValidatedFinding(finding, result),
    routed: partitionByAskRelevance([{ finding, result }]),
    trace,
  };
}

/**
 * 複数の runFindingCritic 結果を 1 つの振り分けへまとめる。
 * partitionByAskRelevance をそのまま呼ぶだけで、順序も規則も変えない。
 *
 * @param {Array<{ finding: object, result: object }>} runs
 */
export function partitionRunnerResults(runs) {
  return partitionByAskRelevance(
    (Array.isArray(runs) ? runs : []).map(({ finding, result }) => ({ finding, result }))
  );
}
