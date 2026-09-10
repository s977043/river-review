// POSIX の `--` ターミネータの読み取り。src/cli.mjs から純粋に移設したもので、
// 判定も副作用も変えていない（リファクタリング Step 2）。
//
// `usageError` は移していない。あれは usage hint を stdout へ出しつつ
// `parsed.usageError` を立てる副作用で、`parseArgs` の 70 箇所以上から呼ばれる。
// ここへ引数で渡すと依存注入になるため、本関数は stderr へのメッセージ出力までを
// 行い、usage error であることを戻り値で返す。呼び出し側が続けて `usageError` を
// 呼ぶので、出力の順序は移設前と同じである。

import { existsSync } from 'node:fs';

import { acceptsPositionalPath, takePositionalPath } from './positionals.mjs';

/**
 * `--` に続くトークンを全て positional path として読み切る。
 *
 * @param {object} parsed
 * @param {string[]} args `--` の次のトークンから始まる残りの argv（破壊的に shift する）
 * @returns {{ error: boolean, tookPositional: boolean }}
 *   `error` が true のとき、呼び出し側は `usageError(parsed)` を呼んで解析を打ち切る。
 *   `tookPositional` は `--` 経由で positional を取り込んだかどうか。
 */
export function consumeTerminator(parsed, args) {
  let error = false;
  let tookPositional = false;
  while (args.length) {
    const positional = args.shift();
    if (parsed.targetConsumed || !acceptsPositionalPath(parsed)) {
      console.error(`Error: unexpected argument "${positional}".`);
      error = true;
      break;
    }
    // The token is a path by construction, so it must BE one. Without this
    // check `river evolve aggregate -- nosuchdir` exited 0 with an empty
    // aggregate: `--` bypasses the eager branch's "a non-existent,
    // non-subcommand token is a mistyped subcommand" rejection, turning a
    // mistyped path into a silent empty result. #1746 W2 already treated
    // "exit 0 while silently falling back" as a regression.
    if (!existsSync(positional)) {
      console.error(
        `Error: "${positional}" does not exist ` +
          '(every token after `--` is read as a path, never as an option or a subcommand).'
      );
      error = true;
      break;
    }
    takePositionalPath(parsed, positional);
    tookPositional = true;
  }
  return { error, tookPositional };
}
