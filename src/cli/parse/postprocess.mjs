// `parseArgs` のループ後の検査。src/cli.mjs から純粋に移設したもので、判定も
// 副作用も変えていない（リファクタリング Step 5）。
//
// `usageError` は移していない。他の parse モジュールと同じ扱いで、各関数は
// stderr への出力までを行い、usage error にすべきことを戻り値の `true` で返す。
// 呼び出し側が続けて `usageError` を呼ぶので、出力の順序は移設前と同じである。

import process from 'node:process';

import { PHASES } from '../../lib/planner-utils.mjs';
import { REVIEW_SUBCOMMANDS } from './vocabulary.mjs';

/**
 * `review` が副コマンドを 1 つ取っていることを確かめる。
 *
 * @param {object} parsed
 * @param {boolean} terminatorTookPositional `--` 経由で positional を取り込んだか
 * @returns {boolean} usage error にすべきとき true
 */
export function checkReviewSubcommand(parsed, terminatorTookPositional) {
  // `review` needs one of plan | exec | verify | route. The handler reported
  // both the missing and the unknown case with exit 3 — the code this project
  // reserves for the `--gate` ESCALATE decision and for handler-level
  // configuration errors — so an argument-order typo read as "a human must
  // look at this" (#1755). Detected here instead, which makes it exit 1 like
  // every other usage error (#1709 contract).
  if (
    parsed.command === 'review' &&
    !parsed.usageError &&
    !REVIEW_SUBCOMMANDS.has(parsed.reviewSubcommand)
  ) {
    // A path taken from after `--` is NOT a candidate subcommand: the caller
    // declared it to be a path. Reporting it as one produced the contradiction
    // `river review -- plan` -> `"plan" is not a river review subcommand
    // (plan | exec | verify | route)`.
    const got =
      parsed.reviewSubcommand ??
      (parsed.targetConsumed && !terminatorTookPositional ? parsed.target : null);
    console.error(
      (got === null
        ? 'Error: river review requires a subcommand (plan | exec | verify | route).'
        : `Error: "${got}" is not a river review subcommand (plan | exec | verify | route).`) +
        ' The subcommand may be written before or after the options —' +
        ' `river review plan --plan-only` and `river review --plan-only plan` are both accepted.'
    );
    return true;
  }
  return false;
}

/**
 * `--phase` が明示されていないときに `RIVER_PHASE` を反映する。
 *
 * @param {object} parsed
 * @returns {boolean} usage error にすべきとき true
 */
export function applyPhaseFallback(parsed) {
  // #1759 C2: RIVER_PHASE used to skip validation entirely and propagate an
  // invalid value straight through to the printed phase with exit 0, unlike
  // --phase which already validates against PHASES above. Reuse that same
  // vocabulary and the same case-insensitive normalization here instead of
  // writing a second check (CLAUDE.md "Import the SSoT, never re-derive it").
  //
  // Only runs when --phase did NOT already set and validate parsed.phase
  // (parsed.phaseExplicit) and when RIVER_PHASE was actually set to a
  // non-empty string — unset or empty must keep falling back to the default
  // ('midstream'), matching the object-literal default above and --phase's
  // own "not required" contract.
  if (!parsed.usageError && !parsed.phaseExplicit && process.env.RIVER_PHASE) {
    const envPhase = process.env.RIVER_PHASE.toLowerCase();
    if (!PHASES.includes(envPhase)) {
      console.error(
        `Error: RIVER_PHASE must be one of: ${PHASES.join(', ')} (got "${process.env.RIVER_PHASE}").`
      );
      return true;
    } else {
      parsed.phase = envPhase;
    }
  }
  return false;
}
