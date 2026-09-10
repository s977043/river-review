// Flow input bindings (Epic #2011 AC7 P3-2).
//
// Flow inputs describe review roles while Artifact Input Contract IDs describe
// concrete files. This module is the CLI-side SSoT that connects the two;
// Flow documents intentionally carry no host vocabulary.

import { CWD_DEFAULTS } from '../config/artifact-resolver.mjs';

/**
 * Role-wide default artifact IDs, in selection order.
 *
 * `tests` has several valid forms of test evidence, so the first resolved
 * artifact wins. Keep this table small: a role without a stable Artifact
 * Input Contract counterpart must not receive a speculative default.
 *
 * `requirements` and `tasks` were candidates for `pbi-input` and `todo`, and
 * are deliberately absent. Both are REQUIRED inputs on some Flows -- `tasks`
 * on task-completion-review, `requirements` on final-review and
 * requirements-review -- so a default there would let a file that merely
 * happens to sit in the working tree declare a required input satisfied.
 * `todo.md` is a common filename and the Artifact Input Contract defines it
 * as "実装タスクと進捗", which does not carry the acceptance statement the
 * Flow asks for. Required inputs must be supplied explicitly with
 * `--artifact <role>=<path>` (#2011 AC7 P3-2 review).
 */
export const DEFAULT_FLOW_INPUT_BINDINGS = Object.freeze({
  tests: Object.freeze(['junit', 'coverage', 'test-cases']),
});

/**
 * Entry-specific candidates, checked before role-wide defaults.
 *
 * Empty today by design. The separate table prevents a future exceptional
 * Flow from duplicating the defaults for every entry, and is where a binding
 * that is only correct for one Flow belongs.
 */
export const ENTRY_FLOW_INPUT_BINDING_OVERRIDES = Object.freeze({});

function declaredInputNames(document) {
  return new Set(
    (Array.isArray(document?.inputs) ? document.inputs : [])
      .map((input) => input?.name)
      .filter((name) => typeof name === 'string')
  );
}

function resolvedArtifact(resolved, id) {
  const value = resolved?.[id];
  return value?.exists === true && typeof value.path === 'string' && value.path ? value : null;
}

/**
 * Bind resolved Artifact Input Contract IDs to a Flow's declared input names.
 *
 * A directly named artifact (for example `--artifact tasks=other.md`) always
 * wins over a role default (`todo`). `inputSources` preserves whether each
 * value came from an explicit CLI argument, another direct resolver source,
 * or a default binding so later phases can make source-aware stop decisions.
 *
 * @param {object} options
 * @param {string|null} [options.entry] Flow entry name, for exceptional bindings
 * @param {object} options.document resolved Flow document
 * @param {Record<string, {exists?: boolean, path?: string, source?: string}>} [options.resolved]
 * @returns {{inputs: Record<string, string>, inputSources: Record<string, {kind: 'explicit'|'direct'|'default', id: string, source: string|null, path?: string}>, unboundInputNames: string[]}}
 */
export function resolveFlowInputBindings({ entry = null, document, resolved = {} }) {
  const names = declaredInputNames(document);
  const inputs = {};
  const inputSources = {};

  // Preserve P3-1's same-named resolution and make it take precedence over
  // role defaults. A CLI-sourced direct ID is the explicit supply contract.
  for (const name of [...names].sort()) {
    const resolution = resolved?.[name];
    if (!resolution || typeof resolution.path !== 'string' || !resolution.path) continue;
    if (resolution.exists === true) inputs[name] = resolution.path;
    inputSources[name] = {
      kind: resolution.source === 'cli' ? 'explicit' : 'direct',
      id: name,
      source: resolution.source ?? null,
      ...(resolution.exists === true ? {} : { path: resolution.path }),
    };
  }

  const entryOverrides =
    entry && ENTRY_FLOW_INPUT_BINDING_OVERRIDES[entry]
      ? ENTRY_FLOW_INPUT_BINDING_OVERRIDES[entry]
      : {};
  for (const name of [...names].sort()) {
    // Guard on `inputSources`, not `inputs`: an explicit `--artifact` pointing
    // at a file that does not exist records a source but supplies no path, and
    // guarding on `inputs` let a default silently override it. That both broke
    // the documented "explicit always wins" order and erased the
    // bound-artifact-missing reason P3-3 reports (#2011 AC7 P3 range review).
    if (name in inputSources) continue;
    const candidates = entryOverrides[name] ?? DEFAULT_FLOW_INPUT_BINDINGS[name] ?? [];
    for (const id of candidates) {
      const artifact = resolvedArtifact(resolved, id);
      if (!artifact) continue;
      inputs[name] = artifact.path;
      inputSources[name] = { kind: 'default', id, source: artifact.source ?? null };
      break;
    }
    if (name in inputSources) continue;

    // An explicit/configured candidate that does not exist still tells the
    // user exactly which intended file is absent. Only fall back to a CWD
    // default after all existing candidates have had their chance to bind.
    for (const id of candidates) {
      const resolution = resolved?.[id];
      if (typeof resolution?.path !== 'string' || !resolution.path) continue;
      inputSources[name] = {
        kind: 'default',
        id,
        source: resolution.source ?? null,
        path: resolution.path,
      };
      break;
    }
    if (name in inputSources) continue;

    const id = candidates.find((candidate) => CWD_DEFAULTS[candidate]);
    if (id) inputSources[name] = { kind: 'default', id, source: null, path: CWD_DEFAULTS[id] };
  }

  return {
    inputs,
    inputSources,
    unboundInputNames: [...names].filter((name) => !(name in inputSources)).sort(),
  };
}
