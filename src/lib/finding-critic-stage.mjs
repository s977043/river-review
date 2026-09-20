// Finding Critic の配線段（#2334 / #1978 Phase 3）。
//
// 位置づけ:
//   #1978 は状態機械（src/lib/finding-critic.mjs）と LLM 境界つき runner
//   （src/lib/finding-critic-runner.mjs）まで着地していたが、製品のどの経路も
//   runFindingCritic を呼んでいなかった。この段がその 1 箇所である。
//
// 既定は off。off のとき runFindingCriticStage は即 null を返し、runner も
// 状態機械もプロンプト生成も一切呼ばれない。findings 配列は同一参照のまま
// 呼び出し側へ戻るので、導入前と挙動は 1 ビットも変わらない。
//
// この段が持たないもの（すべて import する。再実装しない）:
//   - 終端状態・fail-safe・振り分けの判定 → finding-critic.mjs
//   - プロンプト生成 → LLM 呼び出し → パース → 状態機械の往復 →
//     finding-critic-runner.mjs（runFindingCritic）
//   - 決定論の検証（verifyFinding）→ preVerifyFinding 経由で finding-critic.mjs
//   FINAL_STATUS / FAILSAFE_REASON / ASK_RELEVANCE の語彙もここでは作らない。
//
// fail-safe の向き:
//   Critic が走らなかった / タイムアウトした / 応答を読めなかった、のいずれも
//   「clean」にしない。段の内部で例外が出た場合も同じで、finding は retain し
//   humanReview を立てる。finding を落とすのは result.retainFinding === false
//   が明示的に返ったときだけである。

import {
  ASK_RELEVANCE,
  FAILSAFE_REASON,
  FINAL_STATUS,
  PROTOCOL_ID,
  buildValidatedFinding,
} from './finding-critic.mjs';

/**
 * Opt-in 用の環境変数。値がちょうど `'1'` のときだけ有効になる。
 *
 * `true` / `yes` / 空文字は無効のままにする。truthiness 判定にしないのは、
 * シェルに紛れ込んだ任意の値で評価前の Critic が production へ昇格することを
 * 防ぐためである（#2267 の No-Go 条件）。src/lib/after-change-adapter.mjs の
 * AFTER_CHANGE_OPT_IN_ENV と同じ作法に揃えてある。
 */
export const FINDING_CRITIC_OPT_IN_ENV = 'RIVER_FINDING_CRITIC';

/** 段のモード語彙。`observe` は持たない（Critic は生成物を必ず消費するため）。 */
export const FINDING_CRITIC_MODE = Object.freeze({
  OFF: 'off',
  ACTIVE: 'active',
});

/**
 * 段を走らせるかどうかを決める。
 *
 * 優先順位は env > config。config 側は Prompt Compiler と同じく
 * `review.findingCritic.mode` に置く。`'active'` 以外の値（未設定・不明な値を
 * 含む）はすべて off へ倒す。
 *
 * @param {{ reviewConfig?: object, env?: Record<string, string|undefined> }} [params]
 * @returns {'off'|'active'}
 */
export function resolveFindingCriticMode({ reviewConfig, env = process.env } = {}) {
  const raw = env?.[FINDING_CRITIC_OPT_IN_ENV];
  // `1` enables and `0` disables, both as exact literals; `0` also overrides a
  // config that says `active`, so the env var works as a kill switch in both
  // directions. Without that branch an operator who exports `…=0` to turn the
  // Critic off would silently keep the config's `active` (#2339 review, Minor 1).
  // Every other value — `true`, `yes`, an empty string — is not an answer, so
  // it defers to the config rather than deciding anything.
  if (raw === '1') return FINDING_CRITIC_MODE.ACTIVE;
  if (raw === '0') return FINDING_CRITIC_MODE.OFF;
  return reviewConfig?.findingCritic?.mode === FINDING_CRITIC_MODE.ACTIVE
    ? FINDING_CRITIC_MODE.ACTIVE
    : FINDING_CRITIC_MODE.OFF;
}

/**
 * Critic が一度も答えなかったときの結果。
 *
 * 語彙は finding-critic.mjs のものをそのまま使う。evaluateExchange の
 * 「Fail-safe 1: the Critic never answered」と同じ終端状態・同じ reason code に
 * 揃えてあり、ここで新しい状態を作らない。
 *
 * @param {string} detail
 */
function criticUnreachedResult(detail) {
  return {
    status: FINAL_STATUS.CRITIC_TIMEOUT,
    terminal: true,
    humanReview: true,
    retainFinding: true,
    reasons: [FAILSAFE_REASON.CRITIC_TIMEOUT, detail],
    rounds: 0,
    askRelevance: ASK_RELEVANCE.UNCERTAIN,
  };
}

/**
 * 段の観測値。debug へ載せるのは件数と内訳だけで、プロンプト原文も Critic の
 * 応答本文もここからは出さない。
 *
 * @param {Array<{ result: object }>} entries
 * @param {number} dropped
 */
function buildObservation(entries, dropped, language) {
  /** @type {Record<string, number>} */
  const byFinalStatus = {};
  let humanReview = 0;
  for (const { result } of entries) {
    byFinalStatus[result.status] = (byFinalStatus[result.status] ?? 0) + 1;
    if (result.humanReview === true) humanReview += 1;
  }
  return {
    mode: FINDING_CRITIC_MODE.ACTIVE,
    protocol: PROTOCOL_ID,
    // #2339 review (Minor 4): recorded so the two call sites' language
    // resolution is observable in the artifact instead of only in the source.
    // Without this the orchestrator could silently fall back to the default
    // while review-engine used the configured one, and nothing would show it.
    language,
    evaluated: entries.length,
    dropped,
    humanReview,
    byFinalStatus,
  };
}

/**
 * Critic を 1 回走らせ、`validation` を付けた findings を返す。
 *
 * 既定（off）では null を返す。null のとき呼び出し側は findings をそのまま
 * 使うので、既存挙動と完全に同一になる。
 *
 * `llmAvailable: false`（dry-run / offline / API キー未設定）では LLM を
 * 呼ばずに全件を critic-timeout へ倒す。ここで「呼べないから clean」と
 * 読むことはしない。
 *
 * @param {object} params
 * @param {Array<object>} params.findings  マージ済みの findings（この段は順序を変えない）
 * @param {string} [params.diff]
 * @param {object} [params.plan]
 * @param {object} [params.fileTypes]
 * @param {Array<object>} [params.diffFiles]
 * @param {string} [params.originalAsk]
 * @param {string[]} [params.acceptanceCriteria]
 * @param {object} [params.reviewConfig]
 * @param {Record<string, string|undefined>} [params.env]
 * @param {object} [params.llm]           callChatCompletion のオプション一式
 * @param {boolean} [params.llmAvailable] LLM 呼び出しが可能か
 * @param {string} [params.language]
 * @param {object} [params.redactOptions]
 * @param {Function} [params.runImpl]     テスト用の注入点（既定は runFindingCritic）
 * @returns {Promise<{ findings: Array<object>, observation: object }|null>}
 */
export async function runFindingCriticStage({
  findings,
  diff = '',
  plan,
  fileTypes,
  diffFiles,
  originalAsk = '',
  acceptanceCriteria = [],
  reviewConfig,
  env = process.env,
  llm = {},
  llmAvailable = true,
  language = 'ja',
  redactOptions = {},
  runImpl,
} = {}) {
  if (resolveFindingCriticMode({ reviewConfig, env }) === FINDING_CRITIC_MODE.OFF) return null;

  const list = Array.isArray(findings) ? findings : [];
  // 既定 off で runner を読み込まないよう動的 import にしてある。off の経路が
  // finding-critic-runner.mjs（→ review-engine.mjs）を評価しないことは、
  // 循環 import の可能性をそもそも作らないことでもある。
  const impl = runImpl ?? (await import('./finding-critic-runner.mjs')).runFindingCritic;
  const skill = plan?.selected?.[0] ?? {};

  /** @type {Array<{ finding: object, result: object }>} */
  const entries = [];
  for (const finding of list) {
    if (!llmAvailable) {
      entries.push({ finding, result: criticUnreachedResult('llm call unavailable') });
      continue;
    }
    try {
      const run = await impl({
        finding,
        diff,
        originalAsk,
        acceptanceCriteria,
        skill,
        fileTypes,
        diffFiles,
        llm,
        language,
        redactOptions,
      });
      // A runner that returns no `result` is not a clean pass either. The
      // shipped runner always fills it (`result ??=`,
      // finding-critic-runner.mjs), so this is unreachable today — but the
      // destructuring used to sit outside the try, so an injected or future
      // runner breaking that invariant threw a TypeError straight through
      // generateReview and took the whole review down (#2339 review, Minor 2).
      if (!run?.result) {
        entries.push({
          finding,
          result: criticUnreachedResult('critic runner returned no result'),
        });
      } else {
        entries.push({ finding, result: run.result });
      }
    } catch (err) {
      // 段そのものが落ちても finding は消さない。retain したまま人へ回す。
      entries.push({
        finding,
        result: criticUnreachedResult(`critic stage error: ${err?.message}`),
      });
    }
  }

  const kept = [];
  let dropped = 0;
  for (const { finding, result } of entries) {
    if (result.retainFinding === false) {
      dropped += 1;
      continue;
    }
    kept.push({ ...finding, validation: buildValidatedFinding(finding, result).validation });
  }

  return { findings: kept, observation: buildObservation(entries, dropped, language) };
}
