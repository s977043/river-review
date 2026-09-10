// tests/helpers/cli-surfaces.mjs
//
// `river` CLI の **面（surface）ごとの代表 argv**。面 = コマンド語 + サブコマンド語
// （`review plan` / `skills list` / `runs digest`）で、サブコマンドを取る面では
// サブコマンド無しの形も実在する面なら 1 面として数える（`river runs` は
// `runs list` として動く。`feedback` / `suppression` / `promote` のサブコマンド
// 無しはハンドラが拒否するので面ではない）。
//
// 面の SSoT は src/cli.mjs の `SURFACE_SUBCOMMANDS`（`promote` を除く）と、
// `promote` ハンドラ（src/cli/commands/promote.mjs）のサブコマンド語彙である。
// この一覧はそれを **写している** だけなので、tests/cli-option-consumer-check.test.mjs
// が SSoT と突き合わせて pin する（写しが増減とずれたら落ちる）。
// tests/cli-base-option-scope.test.mjs も同じ一覧を使う（#2065 の #2074 統合）。
//
// 代表 argv は「オプションを 1 つも付けない状態で usage error にならない形」を
// 選んである。そうでないとオプションの可否ではなく別の理由を測ってしまう。
// `promote` / `evolve` は自前の共有オプション集合（`PROMOTE_SHARED_OPTIONS` /
// `EVOLVE_SHARED_OPTIONS`）で範囲外のオプションを `usageError` ではなく専用
// フィールド（`promoteUnknownOption` / `evolveUnknownOption`）へ記録するため、
// `usageError` だけで受理を判定する呼び出し側はこの 2 コマンドを除外すること。

/**
 * `promote` のサブコマンド語彙。src/cli/commands/promote.mjs `runPromoteCommand`
 * の `includes` 配列を写している（parser 側に定数は無い — src/cli.mjs
 * `SURFACE_SUBCOMMANDS` のコメント参照）。写しの妥当性は
 * tests/cli-option-consumer-check.test.mjs が CLI を起動して pin し、src 側の
 * 増減は同テストが `readPromoteSubcommandsFromSource` でソースを読んで突き合わせる。
 */
export const PROMOTE_SUBCOMMANDS = [
  'propose',
  'list',
  'approve',
  'reject',
  'template',
  'retire',
  'review-effectiveness',
];

/** @type {Array<{surface: string, argv: string[]}>} */
export const SURFACES = [
  { surface: 'run', argv: ['run', '.'] },
  { surface: 'doctor', argv: ['doctor', '.'] },
  { surface: 'skills', argv: ['skills', '.'] },
  { surface: 'skills list', argv: ['skills', 'list'] },
  { surface: 'skills resolve', argv: ['skills', 'resolve', '--path', 'a.txt'] },
  { surface: 'skills export', argv: ['skills', 'export', '--to', 'exported'] },
  { surface: 'skills import', argv: ['skills', 'import', '--from', 'incoming'] },
  // サブコマンド無しの `river runs` は `runs list` として動く実在の面。
  { surface: 'runs', argv: ['runs'] },
  { surface: 'runs list', argv: ['runs', 'list'] },
  { surface: 'runs diff', argv: ['runs', 'diff', 'r1', 'r2'] },
  { surface: 'runs summary', argv: ['runs', 'summary'] },
  { surface: 'runs digest', argv: ['runs', 'digest'] },
  { surface: 'review plan', argv: ['review', 'plan', '--plan-only'] },
  { surface: 'review exec', argv: ['review', 'exec', '--dry-run'] },
  { surface: 'review route', argv: ['review', 'route'] },
  { surface: 'review verify', argv: ['review', 'verify'] },
  { surface: 'eval', argv: ['eval'] },
  {
    surface: 'feedback add',
    argv: ['feedback', 'add', '--type', 'false_positive', '--skill', 'demo-skill'],
  },
  {
    surface: 'suppression add',
    argv: [
      'suppression',
      'add',
      '--fingerprint',
      '0123456789abcdef',
      '--feedback',
      'false_positive',
      '--rationale',
      'because',
    ],
  },
  // サブコマンド無しの `river evolve <path>` は path を取る実在の面。
  { surface: 'evolve', argv: ['evolve', '.'] },
  { surface: 'evolve aggregate', argv: ['evolve', 'aggregate'] },
  { surface: 'evolve replay', argv: ['evolve', 'replay'] },
  { surface: 'evolve prompt-compare', argv: ['evolve', 'prompt-compare'] },
  { surface: 'evolve prompt-ab', argv: ['evolve', 'prompt-ab'] },
  ...PROMOTE_SUBCOMMANDS.map((subcommand) => ({
    surface: `promote ${subcommand}`,
    argv: ['promote', subcommand],
  })),
];

/**
 * `promote` / `evolve` を除いた面。`usageError` フラグだけで受理を判定する
 * 呼び出し側（tests/cli-base-option-scope.test.mjs）向け。
 */
export const USAGE_ERROR_SURFACES = SURFACES.filter(
  ({ argv }) => argv[0] !== 'promote' && argv[0] !== 'evolve'
);
