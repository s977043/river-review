// `river evolve` subcommand handler (#1574 P1 Shadow aggregate / P2 Paired replay).
//
// Stable CLI surface (契約4) for the read-only outer loop:
//
//   river evolve aggregate [<path>] [--min <n>] [--month YYYY-MM] [--output json|text]
//   river evolve replay --spec <file> [--expect-manifest <id|key>] [--output json|text]
//   river evolve verify-replay --replay <file> --attestation <file> --trusted-key <pem> [--output json|text]
//   river evolve prompt-compare [<path>] [--output json|text]
//   river evolve prompt-ab [<path>] [--output json|text]
//
// All five subcommands only READ. `aggregate` reads `.river/runs/` and
// `.river/feedback/*.jsonl`; `replay` reads a single experiment spec file that
// already contains the baseline and candidate runs; `verify-replay` reads
// an existing replay, detached attestation, and caller-supplied trusted public
// key; `prompt-compare` reads
// `.river/runs/` and pairs the legacy prompt against the compiled prompt from
// the observe-mode records those runs already carry (ADR-006 / #1860) — it
// never sends the compiled prompt anywhere. `prompt-ab` reads the same store but
// splits the runs into TWO sides by what each run actually sent — `sentPrompt:
// 'legacy'` runs become the baseline and `sentPrompt: 'compiled'` runs (mode
// `active`, #1861) become the candidate — so findings-level comparison becomes
// possible (#1880). It re-runs nothing either: the two sides must already exist
// in the store. None has an `--out` / `--promote`
// style option: writing into Riverbed, Skills, rules, or the gate belongs to
// #1568's promotion lifecycle, and re-running a review belongs to `river run` —
// so no code path here can mutate a repository or spend an API call. Redirect
// stdout if you need the JSON on disk.

import { existsSync } from 'node:fs';

const SUBCOMMANDS = ['aggregate', 'replay', 'verify-replay', 'prompt-compare', 'prompt-ab'];

/**
 * Warn when the positional path handed to `aggregate` does not exist (#1936).
 *
 * `resolveStoreDir()` happily resolves `<nonexistent>/.river/runs`, so a
 * mistyped path produced a well-formed report with `Runs | 0` and exit 0 —
 * byte-identical to the legitimate "no runs saved yet" report. The two cases
 * were indistinguishable from the output alone.
 *
 * The condition is deliberately "the path does not exist", NOT "the store is
 * empty". An empty store is the normal state of a first-ever run, of a repo
 * right after `setup-team`, and of a `--month` scope with no runs in it;
 * warning there would fire on every one of them. Non-existence, by contrast,
 * can only be a wrong path. This is the same carve-out
 * `warnWhenFingerprintMatchesNoFinding` (src/cli/commands/feedback.mjs) makes
 * for #1823 残件2: advisory on stderr, never a change of exit code, and silent
 * when there is simply no data.
 *
 * `existsSync` is also what src/cli.mjs already uses for this decision in three
 * places (the eager evolve branch, `takeTrailingPositional`, and the post-`--`
 * positional loop); the gap was only the positional that follows an explicit
 * subcommand word. Note that it returns true for a FILE too — narrowing to
 * directories would reject `evolve aggregate ./some-file`, which is a separate
 * (and unrequested) behavior change, so it is left alone.
 *
 * @param {string} targetPath - resolved positional path.
 * @param {string} rawTarget - the token as the user typed it.
 */
function warnWhenTargetPathMissing(targetPath, rawTarget) {
  if (existsSync(targetPath)) return;
  console.warn(
    `Warning: "${rawTarget}" does not exist, so this aggregate read an empty store ` +
      'instead of the runs you meant. Check the path, or omit it to aggregate the current directory.'
  );
}

/**
 * Message that replaces prompt-compare's dataset error when the path is missing (#1947).
 *
 * Same class of bug as #1936, one path over: `prompt-compare` reported a
 * mistyped path and a legitimately observation-free store with the identical
 * `Prompt Compiler の観測を持つ run が 1 件も無い。` error, so the user could not
 * tell which of the two had happened.
 *
 * Why this rewrites the error instead of calling `warnWhenTargetPathMissing`
 * (the minimal change): `prompt-compare` exits 1, so a warning would leave TWO
 * lines on stderr, and the second one — the dataset error — names the WRONG
 * remedy ("turn on `review.promptCompiler.mode: observe` and re-run reviews")
 * for a path that simply does not exist. Terminal output is read top to bottom,
 * so that wrong remedy is the last thing left on screen. `aggregate` has no such
 * conflict: it exits 0 and prints nothing else on stderr, which is why #1945's
 * warning shape is right there and not here.
 *
 * Swallowing the original message is safe and bounded: `resolveStoreDir()` does
 * not search upward (src/lib/result-store.mjs:22), so a non-existent path always
 * yields zero run records, and with zero records the only reachable throw in
 * `buildPromptComparison` is the observation-count one. No other diagnosis can
 * be hidden by this branch.
 *
 * The condition matches #1945 exactly: "the path does not exist", never "the
 * store is empty" — an observation-free store is the normal state before anyone
 * has run in observe mode, and must stay on the original message. `existsSync`
 * is not narrowed to directories for the same reason as #1945.
 *
 * `prompt-ab` (#1880) shares this branch: it reads the same store through the
 * same `resolveStoreDir()` and also exits 1 with a dataset error, so a mistyped
 * path is indistinguishable there for exactly the same reason. The subcommand
 * name is a parameter only so the message names the command the user typed.
 *
 * @param {string} targetPath - resolved positional path.
 * @param {string} rawTarget - the token as the user typed it.
 * @param {string} subcommand - the subcommand name to name in the message.
 * @returns {string|null} replacement message, or null to keep the original.
 */
function missingTargetPathError(targetPath, rawTarget, subcommand) {
  if (existsSync(targetPath)) return null;
  return (
    `Error: "${rawTarget}" does not exist, so this ${subcommand} read an empty store ` +
    'instead of the runs you meant. Check the path, or omit it to compare the runs in the current directory.'
  );
}

/**
 * Reject options that belong to another evolve subcommand (#1860 / #1880).
 *
 * Shared by `prompt-compare` and `prompt-ab`: both read the saved runs under
 * `.river/runs`, so replay / verification / aggregate-only options would
 * silently look honoured while changing nothing unless rejected here.
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} subcommand - the subcommand name to name in the message.
 * @returns {string|null} error message, or null when nothing is misplaced.
 */
function misplacedStoreOptionError(parsed, subcommand) {
  const misplaced = [
    '--spec',
    '--expect-manifest',
    '--min',
    '--month',
    '--replay',
    '--attestation',
    '--trusted-key',
  ].filter((flag) => {
    if (flag === '--spec') return parsed.evolveSpec != null;
    if (flag === '--expect-manifest') return parsed.evolveExpectManifest != null;
    if (flag === '--min') return parsed.evolveMin != null;
    if (flag === '--month') return parsed.evolveMonth != null;
    if (flag === '--replay') return parsed.evolveReplay != null;
    if (flag === '--attestation') return parsed.evolveAttestation != null;
    return parsed.evolveTrustedKey != null;
  });
  if (!misplaced.length) return null;
  return `${misplaced.join(', ')} is not valid for \`river evolve ${subcommand}\` (its dataset is the saved runs under .river/runs).`;
}

/**
 * Handle the `evolve` command (aggregate | replay | verify-replay | prompt-compare | prompt-ab).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runEvolveCommand(parsed, targetPath) {
  const subcommand = parsed.evolveSubcommand ?? 'aggregate';
  if (!SUBCOMMANDS.includes(subcommand)) {
    console.error(`Unknown evolve subcommand: ${subcommand}. Use: ${SUBCOMMANDS.join(' | ')}`);
    return 1;
  }
  if (parsed.evolveUnknownOption) {
    console.error(
      `Unknown option for evolve: ${parsed.evolveUnknownOption}. Use: --min <n> --month YYYY-MM --spec <file> --expect-manifest <id> --replay <file> --attestation <file> --trusted-key <pem> --output text|json`
    );
    return 1;
  }
  if (parsed.evolveExtraArgs?.length) {
    console.error(
      `Unexpected argument(s) for evolve ${subcommand}: ${parsed.evolveExtraArgs.join(', ')}`
    );
    return 1;
  }
  // Evolve subcommands have no yaml/html renderer; accepting the flag and silently
  // emitting text would misreport the format to a downstream consumer.
  const output = parsed.output ?? 'text';
  if (output !== 'text' && output !== 'json') {
    console.error(`Unsupported --output for evolve ${subcommand}: ${output}. Use: text | json`);
    return 1;
  }

  if (subcommand === 'replay') {
    return runReplay(parsed, output);
  }
  if (subcommand === 'verify-replay') {
    return runVerifyReplay(parsed, output);
  }
  if (subcommand === 'prompt-compare') {
    return runPromptCompare(parsed, targetPath, output);
  }
  if (subcommand === 'prompt-ab') {
    return runPromptAb(parsed, targetPath, output);
  }
  return runAggregate(parsed, targetPath, output);
}

/**
 * `river evolve prompt-compare` — legacy と compiled の paired 比較（#1860）。
 *
 * 保存済み run の `debug.execution.promptCompiler` を読むだけである。
 * レビューの再実行も compiled prompt の送信も行わない。
 */
async function runPromptCompare(parsed, targetPath, output) {
  const misplacedError = misplacedStoreOptionError(parsed, 'prompt-compare');
  if (misplacedError) {
    console.error(misplacedError);
    return 1;
  }

  const { resolveStoreDir, loadAllRunRecords } = await import('../../lib/result-store.mjs');
  const { buildPromptComparison, formatPromptComparisonMarkdown, PromptComparisonError } =
    await import('../../lib/prompt-compiler-paired.mjs');
  const { PairedReplayError } = await import('../../lib/paired-replay.mjs');

  const runRecords = await loadAllRunRecords(resolveStoreDir(targetPath));

  let result;
  try {
    result = buildPromptComparison({ runRecords, now: new Date() });
  } catch (err) {
    // Both are usage-level: the dataset cannot support the comparison. The
    // message says which condition failed, so exit 1 stays actionable.
    if (err instanceof PromptComparisonError || err instanceof PairedReplayError) {
      // #1947: a non-existent path gets the path diagnosis instead, because the
      // dataset error's remedy does not apply to it. Exit code is unchanged.
      console.error(
        missingTargetPathError(targetPath, parsed.target ?? targetPath, 'prompt-compare') ??
          `Error: ${err.message}`
      );
      return 1;
    }
    throw err;
  }

  if (output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPromptComparisonMarkdown(result));
  }
  // Exit 0: this is an observation, never a gate (自動 canary は保留).
  return 0;
}

/**
 * `river evolve prompt-ab` — legacy を送った run と compiled を送った run の
 * 2 系統 A/B 比較（#1880）。
 *
 * `prompt-compare` との違いは dataset の分け方だけである。あちらは observe の
 * 1 レコードから両側を導出し、こちらは `sentPrompt` が legacy の run を baseline、
 * compiled の run（mode `active`、#1861）を candidate に置く。`prompt-compare`
 * の legacy 限定の拒否（#1860 の安全弁）は緩めていない。混同を避けるため、
 * compiled 側の run が 1 件も無い dataset はこちらが受理しない。
 *
 * 保存済み run を読むだけである。レビューの再実行も provider 呼び出しも行わない。
 */
async function runPromptAb(parsed, targetPath, output) {
  const misplacedError = misplacedStoreOptionError(parsed, 'prompt-ab');
  if (misplacedError) {
    console.error(misplacedError);
    return 1;
  }

  const { resolveStoreDir, loadAllRunRecords } = await import('../../lib/result-store.mjs');
  const { buildPromptAbComparison, formatPromptAbMarkdown, PromptComparisonError } =
    await import('../../lib/prompt-compiler-paired.mjs');
  const { PairedReplayError } = await import('../../lib/paired-replay.mjs');

  const runRecords = await loadAllRunRecords(resolveStoreDir(targetPath));

  let result;
  try {
    result = buildPromptAbComparison({ runRecords, now: new Date() });
  } catch (err) {
    // Same treatment as prompt-compare: both error types are usage-level (the
    // dataset cannot support the comparison), and a non-existent path gets the
    // path diagnosis instead because the dataset error's remedy does not apply.
    if (err instanceof PromptComparisonError || err instanceof PairedReplayError) {
      console.error(
        missingTargetPathError(targetPath, parsed.target ?? targetPath, 'prompt-ab') ??
          `Error: ${err.message}`
      );
      return 1;
    }
    throw err;
  }

  if (output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPromptAbMarkdown(result));
  }
  // Exit 0 even when a critical regression is observed: this reports material
  // for a human judgement and is explicitly not a gate (自動 canary は保留).
  return 0;
}

async function runVerifyReplay(parsed, output) {
  const required = [
    ['--replay', parsed.evolveReplay],
    ['--attestation', parsed.evolveAttestation],
    ['--trusted-key', parsed.evolveTrustedKey],
  ];
  const missing = required.filter(([, value]) => value == null).map(([flag]) => flag);
  if (missing.length) {
    console.error(`Error: \`river evolve verify-replay\` requires ${missing.join(', ')}.`);
    return 1;
  }
  if (
    parsed.evolveSpec != null ||
    parsed.evolveExpectManifest != null ||
    parsed.evolveMin != null ||
    parsed.evolveMonth != null
  ) {
    console.error(
      'Error: --spec / --expect-manifest / --min / --month are not valid for verify-replay.'
    );
    return 1;
  }

  const { readFile } = await import('node:fs/promises');
  const { ReplayVerificationError, buildReplayVerification, formatReplayVerificationMarkdown } =
    await import('../../lib/replay-verification.mjs');

  async function readJson(path, label) {
    let value;
    try {
      value = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new ReplayVerificationError(`cannot read ${label} ${path}: ${error.message}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ReplayVerificationError(`${label} ${path} must contain a JSON object.`);
    }
    return value;
  }

  let result;
  try {
    const [replay, attestation, trustedPublicKeyPem] = await Promise.all([
      readJson(parsed.evolveReplay, '--replay'),
      readJson(parsed.evolveAttestation, '--attestation'),
      readFile(parsed.evolveTrustedKey, 'utf8').catch((error) => {
        throw new ReplayVerificationError(
          `cannot read --trusted-key ${parsed.evolveTrustedKey}: ${error.message}`
        );
      }),
    ]);
    result = buildReplayVerification({
      replay,
      attestation,
      trustedPublicKeyPem,
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof ReplayVerificationError) {
      console.error(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }

  if (output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReplayVerificationMarkdown(result));
  }

  // Verification is evidence for a later human decision. It never starts a
  // canary, promotes a candidate, or mutates a repository.
  return 0;
}

async function runAggregate(parsed, targetPath, output) {
  // `--spec` / `--expect-manifest` belong to `replay`. Accepting them silently
  // here would look like the aggregate honoured an experiment definition.
  const misplaced = [
    ['--spec', parsed.evolveSpec],
    ['--expect-manifest', parsed.evolveExpectManifest],
    ['--replay', parsed.evolveReplay],
    ['--attestation', parsed.evolveAttestation],
    ['--trusted-key', parsed.evolveTrustedKey],
  ]
    .filter(([, value]) => value != null)
    .map(([flag]) => flag);
  if (misplaced.length) {
    console.error(`${misplaced.join(', ')} is not valid for \`river evolve aggregate\`.`);
    return 1;
  }

  warnWhenTargetPathMissing(targetPath, parsed.target ?? targetPath);

  const { resolveStoreDir, loadAllRunRecords } = await import('../../lib/result-store.mjs');
  const { listFeedbackEntries } = await import('../../lib/feedback.mjs');
  const { buildShadowAggregate, formatShadowAggregateMarkdown, DEFAULT_MIN_RECURRENCE } =
    await import('../../lib/shadow-aggregate.mjs');

  const storeDir = resolveStoreDir(targetPath);
  const runRecords = await loadAllRunRecords(storeDir);
  const feedbackEntries = await listFeedbackEntries({
    repoRoot: targetPath,
    month: parsed.evolveMonth ?? null,
    warn: (message) => console.warn(message),
  });

  const aggregate = buildShadowAggregate({
    runRecords,
    feedbackEntries,
    minRecurrence: parsed.evolveMin ?? DEFAULT_MIN_RECURRENCE,
    month: parsed.evolveMonth ?? null,
    now: new Date(),
    // #1823 残件2: same sink shape as listFeedbackEntries above. The builder
    // defaults it to a no-op to stay side-effect free, so the CLI is what makes
    // an unmatched findingFingerprint audible.
    warn: (message) => console.warn(message),
  });

  if (output === 'json') {
    console.log(JSON.stringify(aggregate, null, 2));
  } else {
    console.log(formatShadowAggregateMarkdown(aggregate));
  }
  // Always exit 0: this is an observation, not a gate (#1574 P1 is shadow-only).
  return 0;
}

async function runReplay(parsed, output) {
  if (!parsed.evolveSpec) {
    console.error(
      'Error: `river evolve replay` requires --spec <file> (the experiment specification).'
    );
    return 1;
  }
  if (parsed.evolveMin != null || parsed.evolveMonth != null) {
    // These scope the aggregate's inputs; the replay's dataset is fixed by the
    // manifest, so honouring them would silently change the pinned dataset.
    console.error('Error: --min / --month are aggregate options and are not valid for replay.');
    return 1;
  }
  if (
    parsed.evolveReplay != null ||
    parsed.evolveAttestation != null ||
    parsed.evolveTrustedKey != null
  ) {
    console.error(
      'Error: --replay / --attestation / --trusted-key are verify-replay options and are not valid for replay.'
    );
    return 1;
  }

  const { readFile } = await import('node:fs/promises');
  const { buildPairedReplay, formatPairedReplayMarkdown, PairedReplayError } =
    await import('../../lib/paired-replay.mjs');

  let spec;
  try {
    spec = JSON.parse(await readFile(parsed.evolveSpec, 'utf8'));
  } catch (err) {
    console.error(`Error: cannot read --spec ${parsed.evolveSpec}: ${err.message}`);
    return 1;
  }
  // Checked before any property access: a file containing `null` or `[]` would
  // otherwise throw a raw TypeError on `spec.manifest` instead of a usage error.
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    console.error(`Error: --spec ${parsed.evolveSpec} must contain a JSON object.`);
    return 1;
  }

  let result;
  try {
    result = buildPairedReplay(spec, {
      now: new Date(),
      manifest: spec.manifest ?? undefined,
    });
  } catch (err) {
    if (err instanceof PairedReplayError) {
      console.error(`Error: ${err.message}`);
      return 1;
    }
    throw err;
  }

  // A tampered or stale manifest invalidates the comparison, so it fails loudly
  // instead of printing a report that looks authoritative.
  if (!result.manifestVerification.verified) {
    console.error(
      `Error: Experiment Manifest verification failed: ${result.manifestVerification.mismatches.join('; ')}`
    );
    return 1;
  }
  if (!result.manifestVerification.experimentKeyMatchesInputs) {
    console.error(
      `Error: the supplied manifest describes a different experiment (recomputed experimentKey ${result.manifestVerification.recomputedExperimentKey}).`
    );
    // A manifest created before the evidence provenance summary was pinned
    // (#1719, v1.68.0 and earlier) hashes a smaller condition set, so it lands
    // here even though its own digests verify. Without this hint the only
    // reading left is "wrong file", and the fix — rebuild the manifest — is not
    // discoverable.
    console.error(
      'Hint: manifests created by v1.68.0 or earlier do not pin manifest.<side>.provenance (#1719); their experimentKey no longer matches this spec. Rebuild the manifest from the spec.'
    );
    return 1;
  }
  if (parsed.evolveExpectManifest) {
    const expected = parsed.evolveExpectManifest;
    const matches =
      expected === result.manifest.manifestId ||
      expected === result.manifest.experimentKey ||
      expected === result.manifest.manifestHash;
    if (!matches) {
      console.error(
        `Error: --expect-manifest ${expected} does not match this experiment (manifestId ${result.manifest.manifestId}).`
      );
      return 1;
    }
  }

  if (output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPairedReplayMarkdown(result));
  }
  // Exit 0 even when the acceptance criteria are not met: P2 reports material
  // for a human judgement and is explicitly not a gate (自動 canary は保留).
  return 0;
}
