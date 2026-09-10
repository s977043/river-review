// eager コマンド分岐の本体。src/cli.mjs から純粋に移設したもので、判定も副作用も
// 変えていない（リファクタリング Step 3 後半）。
//
// `EAGER_COMMANDS` によるガードは呼び出し側に残してある。あの集合は
// `COMMAND_USAGE` から導出しており、移すと使用箇所の表そのものを連れてくる。
// ガードを残せば本関数の依存はリテラルな語彙集合だけで済む。

import { existsSync } from 'node:fs';

import {
  EVOLVE_SUBCOMMANDS,
  PROMOTE_ID_SUBCOMMANDS,
  SKILLS_SUBCOMMANDS,
  SUBCOMMAND_ONLY_COMMANDS,
} from './vocabulary.mjs';

/**
 * コマンド語の直後に続く副コマンド語 / positional path を読み取る。
 *
 * 呼び出し側は `EAGER_COMMANDS.has(arg)` を確かめてから呼ぶこと。
 *
 * @param {object} parsed
 * @param {string} arg 直前に読んだコマンド語
 * @param {string[]} args 残りの argv（破壊的に shift する）
 */
export function consumeEagerCommand(parsed, arg, args) {
  parsed.command = arg;
  // Check for skills subcommands (import/export/list)
  if (arg === 'skills' && args[0] && SKILLS_SUBCOMMANDS.has(args[0])) {
    parsed.skillsSubcommand = args.shift();
  } else if (arg === 'evolve') {
    if (args[0] && EVOLVE_SUBCOMMANDS.has(args[0])) {
      parsed.evolveSubcommand = args.shift();
    }
    // `replay` takes NO positional: its dataset comes from --spec. Letting
    // the first token become `parsed.target` would make the command accept
    // and silently ignore it (`river evolve replay ./typo.json --spec x`).
    if (parsed.evolveSubcommand !== 'replay' && args[0] && !args[0].startsWith('-')) {
      const token = args.shift();
      // A mistyped subcommand (`agregate`) must not be swallowed as a path
      // and reported as an empty, successful aggregate. Anything that is
      // neither a known subcommand nor an existing path is an error.
      if (!parsed.evolveSubcommand && !existsSync(token)) {
        parsed.evolveSubcommand = token; // handler rejects it with exit 1
      } else {
        parsed.target = token;
        parsed.targetConsumed = true;
      }
    }
    // Surplus positionals are a usage error, never silently discarded.
    while (args[0] && !args[0].startsWith('-')) {
      parsed.evolveExtraArgs.push(args.shift());
    }
  } else if (arg === 'runs' && args[0] && !args[0].startsWith('-')) {
    parsed.runsSubcommand = args.shift(); // list | diff | summary | digest
    // `diff` takes two or more positional run IDs, which may be written
    // before, after, or interleaved with options (e.g. `--output json`).
    // Collecting them eagerly here (as a fixed shift-two-then-scan) used to
    // swallow a leading option as a run ID (#1759 B2): `runs diff --output
    // json r1 r2` shifted "--output" into runsId1 and "json" into runsId2,
    // then tried to open a run named "--output" and exited 1 with ENOENT.
    // Collection now happens token-by-token below (near the promote/evolve
    // dispatches), so options are left for the shared option handlers.
  } else if (arg === 'suppression' && args[0] && !args[0].startsWith('-')) {
    parsed.suppressionSubcommand = args.shift(); // add (only one for now)
  } else if (arg === 'feedback' && args[0] && !args[0].startsWith('-')) {
    parsed.feedbackSubcommand = args.shift(); // add (only one for now)
  } else if (arg === 'promote' && args[0] && !args[0].startsWith('-')) {
    parsed.promoteSubcommand = args.shift(); // propose | list | approve | reject | template | retire | review-effectiveness
    // approve/reject/template/review-effectiveness take an optional positional candidate id.
    if (
      PROMOTE_ID_SUBCOMMANDS.has(parsed.promoteSubcommand) &&
      args[0] &&
      !args[0].startsWith('-')
    ) {
      parsed.promoteId = args.shift();
    }
  } else if (!SUBCOMMAND_ONLY_COMMANDS.has(arg) && args[0] && !args[0].startsWith('-')) {
    parsed.target = args.shift();
    parsed.targetConsumed = true;
  }
}
