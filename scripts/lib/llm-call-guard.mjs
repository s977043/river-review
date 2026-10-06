// Runtime "0 LLM calls" guard for the after-change dogfood measurement
// (#2275 PR-3D, Epic #2054 Phase 3).
//
// Loaded with `NODE_OPTIONS=--import=<this file>` into every Node process the
// measured hook starts. The static import-closure tests
// (`tests/fast-verification.test.mjs`, `tests/after-change-adapter.test.mjs`)
// already pin what the checkpoint's source CAN reach; this file records what a
// real run DID reach, so the dogfood number "LLM invocation = 0" is measured
// rather than inferred from the source.
//
// It appends one JSON line per event to `$RIVER_LLM_GUARD_LOG`:
//   guard-loaded     this process ran with the guard (no line = no guarantee)
//   provider-module  a model SDK or a repo-internal model module was resolved
//   network          an outbound connection or fetch was attempted (then refused)
//
// A provider module is recorded and allowed to load: refusing it would change
// the behaviour being measured. A network attempt is recorded and refused, so a
// provider reached by some path the module list does not name still cannot
// complete a call.

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { registerHooks } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const LOG = process.env.RIVER_LLM_GUARD_LOG;

/** Model SDK package names (the `dependencies` this repo ships with). */
export const PROVIDER_SPECIFIERS = Object.freeze([
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@google/genai',
  'openai',
]);

/** Repo-internal modules whose job is to call a model. */
export const PROVIDER_MODULE_PATTERN =
  /\/src\/(ai\/[^/]+|lib\/(llm-pipeline|openai-planner|plan-review\/llm-adjudicator))\.mjs$/;

const record = (event) => {
  if (typeof LOG !== 'string' || LOG.length === 0) return;
  fs.appendFileSync(LOG, `${JSON.stringify({ pid: process.pid, ...event })}\n`);
};

const isProviderSpecifier = (specifier) =>
  PROVIDER_SPECIFIERS.some((name) => specifier === name || specifier.startsWith(`${name}/`));

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (isProviderSpecifier(specifier) || PROVIDER_MODULE_PATTERN.test(result.url)) {
      record({ event: 'provider-module', specifier });
    }
    return result;
  },
});

const refuse = (kind) => {
  record({ event: 'network', kind });
  throw new Error(`llm-call-guard: outbound ${kind} refused`);
};

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = async () => refuse('fetch');
}
for (const [name, mod] of [
  ['http', http],
  ['https', https],
]) {
  mod.request = () => refuse(`${name}.request`);
  mod.get = () => refuse(`${name}.get`);
}
net.connect = () => refuse('net.connect');
net.createConnection = () => refuse('net.createConnection');
tls.connect = () => refuse('tls.connect');

record({ event: 'guard-loaded' });
