// `parseArgs` の positional 取り込み。src/cli.mjs から純粋に移設したもので、
// 判定も副作用も変えていない（#2011 AC7 後のリファクタリング Step 1）。
//
// ここに置く条件は「`parsed` 以外に依存しないこと」である。`takeTrailingPositional`
// は `REVIEW_SUBCOMMANDS` / `SKILLS_SUBCOMMANDS` / `EVOLVE_SUBCOMMANDS` の語彙に
// 依存するため、語彙の置き場所が決まるまで src/cli.mjs に残している。

/**
 * Whether `parsed.command` still accepts a positional `<path>`.
 *
 * The five path-taking surfaces are `run` / `doctor` / `review` /
 * `skills` (without a subcommand) / `evolve` (except `replay`).
 *
 * @param {object} parsed
 * @returns {boolean}
 */
export function acceptsPositionalPath(parsed) {
  switch (parsed.command) {
    case 'run':
    case 'doctor':
    case 'review':
      return true;
    case 'skills':
      // `skills import|export|list|resolve` take options, not a path.
      return !parsed.skillsSubcommand;
    case 'evolve':
      // `replay` takes NO positional (its dataset comes from --spec).
      return parsed.evolveSubcommand !== 'replay';
    default:
      return false;
  }
}

/**
 * Consume `token` as the positional `<path>` and as nothing else.
 *
 * This is the reading that applies after the POSIX `--` terminator, where a
 * token must never be re-read as an option or as a subcommand word even when it
 * looks like one.
 *
 * @param {object} parsed
 * @param {string} token
 * @returns {boolean} true when the token was consumed as the target
 */
export function takePositionalPath(parsed, token) {
  if (parsed.targetConsumed || !acceptsPositionalPath(parsed)) return false;
  parsed.target = token;
  parsed.targetConsumed = true;
  return true;
}
