// Review Request IR (#1859) — モデル非依存のレビュー依頼表現。
//
// ADR-006 の中核。「何を判断するか」を保持し、「選ばれたモデルへどう頼むか」は
// 一切持たない。renderer / profile はこの IR を読むだけで、書き換えない。
//
// 位置づけ:
//   internal contract であり、安定した公開 API ではない。外部へ出す必要が出た
//   時点で version を上げて別途宣言する。今は buildPrompt の引数と compiler の
//   間に挟まる中間表現に過ぎない。
//
// 不変条件（ADR-006）:
//   judgment（skillIds / severity）と constraints は **判断側**の持ち物である。
//   profile がこれらを書き換えられないよう、buildReviewRequest は凍結した
//   オブジェクトを返す。tests/prompt-compiler-invariants.test.mjs が pin する。

/** IR のバージョン。形を変えたら上げる。 */
export const REVIEW_REQUEST_IR_VERSION = '2';

/** 凍結対象のネスト。浅い freeze では profile 側の書き換えを防げない。 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/**
 * buildPrompt / generateReview が持っている情報から IR を組む純関数。
 *
 * 呼び出し側から渡された値をそのまま格納する。ここで既定値を発明しない
 * （既定値の決定は config 層の責務であり、IR が独自に持つと二重管理になる）。
 *
 * @param {object} params
 * @param {object} params.subject         phase / revision / changedFiles
 * @param {object} params.judgment        skillIds / severity
 * @param {object} params.context         diff / projectRules / adrs / repoContext / prDescription
 * @param {object} params.constraints     maxFindings / evidenceRequired / …
 * @param {object} params.outputContract  format / language
 * @param {object} params.execution       provider / model / modelHint
 * @returns {object} 凍結済みの IR
 */
export function buildReviewRequest({
  subject,
  judgment,
  context,
  constraints,
  outputContract,
  execution,
}) {
  return deepFreeze({
    version: REVIEW_REQUEST_IR_VERSION,
    subject: {
      phase: subject?.phase ?? null,
      changedFiles: subject?.changedFiles ?? [],
    },
    judgment: {
      skillIds: judgment?.skillIds ?? [],
      severity: judgment?.severity ?? null,
      plan: judgment?.plan ?? null,
    },
    context: {
      diff: context?.diff ?? '',
      diffTruncated: context?.diffTruncated ?? false,
      projectRules: context?.projectRules ?? null,
      relatedADRs: context?.relatedADRs ?? [],
      riskAssessment: context?.riskAssessment ?? null,
      repoContext: context?.repoContext ?? null,
      prDescription: context?.prDescription ?? null,
      reviewObligations: context?.reviewObligations ?? [],
    },
    constraints: {
      maxFindings: constraints?.maxFindings ?? null,
      focusHint: constraints?.focusHint ?? null,
      walkthrough: constraints?.walkthrough ?? false,
      agentHandoff: constraints?.agentHandoff ?? false,
      additionalInstructions: constraints?.additionalInstructions ?? [],
    },
    outputContract: {
      format: outputContract?.format ?? 'river-review-findings-v1',
      language: outputContract?.language ?? null,
    },
    execution: {
      provider: execution?.provider ?? null,
      model: execution?.model ?? null,
      modelHint: execution?.modelHint ?? null,
    },
  });
}
