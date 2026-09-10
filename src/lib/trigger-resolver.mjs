// Pure trigger resolver (#2054 PR-2, Epic #2011 Phase 2).
//
// Turns one neutral engineering event into the Flow entries it should call
// and the Flow pins those entries resolve to. It is deliberately a function
// of its arguments only:
//
//   - it reads NOTHING from disk. The trigger registry (the `triggers` block
//     PR-1 adds to the entry map) and the Flow documents are injected by the
//     caller, so this module keeps the #2016 observe-mode invariant that
//     nothing under `src/` loads the Flow definitions
//     (tests/flow-definitions.test.mjs pins that);
//   - it holds NO judgment. No severity, no gate, no threshold, no skill
//     selection: those stay in their existing SSoTs (ADR-009 D3, RA-1..RA-4).
//     What comes out is entry names, pins and evidence names, nothing more;
//   - it calls NO other resolver. `riskAction` is an INPUT (the vocabulary of
//     `src/lib/review-mode-router.mjs`), never computed here, and it is
//     consulted in exactly one place: raising the independence tier of a
//     `before-merge` occurrence when the change is `human-required`.
//
// Every derived value is imported from the SSoT that already owns it
// (CLAUDE.md "Import the SSoT, never re-derive it"): Flow pins come from
// `deriveFlowPin`, the digest from `sha256Hex` over `canonicalJson`, and
// string normalization from `nonEmptyNfcString`.

import { deriveFlowPin } from './execution-manifest.mjs';
import { canonicalJson, nonEmptyNfcString as nonEmptyString } from './promotion-candidates.mjs';
import { sha256Hex } from './shadow-aggregate.mjs';

/** Prefix of every occurrence id, so a reader can tell it from a run id or a candidate id. */
export const OCCURRENCE_ID_PREFIX = 'RR-TRG-';

const OCCURRENCE_ID_HASH_LENGTH = 16;

/**
 * Selection modes a trigger may declare. `entries` lists every entry the
 * trigger calls; `artifactKind` picks exactly one of them by the kind of the
 * artifact that became ready.
 */
export const SELECT_BY = Object.freeze(['entries', 'artifactKind']);

/**
 * The `riskAction` vocabulary this resolver accepts: the `ReviewRouterMode`
 * values of `src/lib/review-mode-router.mjs`. Repeated here as data rather
 * than imported, because importing the Router would be the reverse dependency
 * this module must not have; tests/trigger-resolver.test.mjs pins the two
 * lists against each other.
 */
export const RISK_ACTIONS = Object.freeze(['light', 'standard', 'team', 'human-required']);

/**
 * Independence tiers a trigger may require, weakest first (#2054
 * "Independence Routing"). Order is what `raiseIndependence` relies on.
 */
/**
 * Rollout states a trigger may declare (`flows/entry-map.json` via PR-1 of
 * #2054). Passed through, never interpreted: whether an `off` trigger records
 * anything is the caller's decision, so `off` still resolves to its entries.
 */
export const TRIGGER_MODES = Object.freeze(['off', 'observe', 'active']);

export const INDEPENDENCE_TIERS = Object.freeze([
  'self',
  'context-isolated',
  'execution-isolated',
  'provider-diverse',
]);

/**
 * Artifact kind → entry for `artifact-ready`. The kinds are the upstream
 * `stage` values of `schemas/review-intent.schema.json`, which are named after
 * the `review-<stage>` entry they answer for; tests/trigger-resolver.test.mjs
 * checks this table against the real Intent and Flow documents so it cannot
 * drift from them.
 */
export const ARTIFACT_KIND_ENTRIES = Object.freeze({
  research: 'review-research',
  requirements: 'review-requirements',
  design: 'review-design',
  technical: 'review-technical',
  plan: 'review-plan',
  replan: 'review-replan',
});

export class TriggerResolverError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TriggerResolverError';
  }
}

const isPlainObject = (value) =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const sortedUnique = (values) => [...new Set(values)].sort(compareStrings);

const nonEmptyStringList = (value, label) => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new TriggerResolverError(`${label} must be an array of strings.`);
  }
  return value.map((item, index) => {
    const normalized = nonEmptyString(item);
    if (normalized == null) {
      throw new TriggerResolverError(`${label}[${index}] must be a non-empty string.`);
    }
    return normalized;
  });
};

const indexFlowDocuments = (flowDocuments) => {
  const list = Array.isArray(flowDocuments)
    ? flowDocuments
    : isPlainObject(flowDocuments)
      ? Object.values(flowDocuments)
      : null;
  if (list == null) {
    throw new TriggerResolverError(
      'flowDocuments must be an array or an object of Flow documents.'
    );
  }
  const byId = new Map();
  for (const document of list) {
    const id = nonEmptyString(document?.id);
    if (id == null) {
      throw new TriggerResolverError('every Flow document must carry a non-empty id.');
    }
    if (byId.has(id)) {
      throw new TriggerResolverError(`Flow document "${id}" is supplied more than once.`);
    }
    byId.set(id, document);
  }
  return byId;
};

const raiseIndependence = (current, floor) => {
  const currentRank = current == null ? -1 : INDEPENDENCE_TIERS.indexOf(current);
  const floorRank = INDEPENDENCE_TIERS.indexOf(floor);
  return floorRank > currentRank ? floor : current;
};

/**
 * Resolve one neutral event to the Flow entries it calls and their pins.
 *
 * @param {object} input
 * @param {string} input.event neutral trigger id; must be a key of `registry.triggers`
 * @param {string|null} [input.artifactKind] required by (and only accepted for)
 *   triggers that declare `selectBy: "artifactKind"`
 * @param {string|null} [input.riskAction] a `RISK_ACTIONS` value from the Router, or null
 * @param {string[]|null} [input.hostCapabilities] neutral capability names the host
 *   reports; passed through into the occurrence id only. Deliberately so: the
 *   occurrence id is host-DEPENDENT, together with `riskAction`. The same event on
 *   two hosts with different capabilities (or a re-routed risk) is two
 *   occurrences, because what gets executed differs; idempotency is per host
 *   and per routing, not per event alone
 * @param {string|null} [input.subjectRevision] commit SHA / content hash the event is
 *   about; part of the occurrence id so a new revision is a new occurrence
 * @param {object} sources
 * @param {object} sources.registry the entry map (`entries` + `triggers`)
 * @param {object[]|Record<string, object>} sources.flowDocuments parsed Flow documents
 * @returns {{
 *   triggerId: string,
 *   occurrenceId: string,
 *   selectedEntries: string[],
 *   flowPins: Array<{ entry: string, id: string, version: string, sha256: string }>,
 *   evidenceRequirements: string[],
 *   independence: string|null,
 *   mode: string|null,
 *   profile: string|null,
 * }}
 *   `mode` and `profile` are the registry's declarations passed through
 *   unchanged for the caller to act on; interpreting them (recording or not,
 *   which checks the profile runs) is outside this resolver's responsibility.
 */
export function resolveTrigger(
  {
    event,
    artifactKind = null,
    riskAction = null,
    hostCapabilities = null,
    subjectRevision = null,
  } = {},
  { registry, flowDocuments } = {}
) {
  if (!isPlainObject(registry) || !isPlainObject(registry.triggers)) {
    throw new TriggerResolverError('registry must carry a triggers object.');
  }
  if (!isPlainObject(registry.entries)) {
    throw new TriggerResolverError('registry must carry an entries object.');
  }
  const triggerId = nonEmptyString(event);
  if (triggerId == null) {
    throw new TriggerResolverError('event must be a non-empty string.');
  }
  const trigger = Object.hasOwn(registry.triggers, triggerId) ? registry.triggers[triggerId] : null;
  if (!isPlainObject(trigger)) {
    throw new TriggerResolverError(
      `unknown event "${triggerId}" (known: ${Object.keys(registry.triggers).sort(compareStrings).join(', ')}).`
    );
  }

  const selectBy = nonEmptyString(trigger.selectBy) ?? 'entries';
  if (!SELECT_BY.includes(selectBy)) {
    throw new TriggerResolverError(
      `trigger "${triggerId}" declares unknown selectBy "${selectBy}".`
    );
  }
  const declaredEntries = nonEmptyStringList(trigger.entries, `triggers.${triggerId}.entries`);

  const kind = nonEmptyString(artifactKind);
  let selectedEntries;
  if (selectBy === 'artifactKind') {
    if (kind == null) {
      throw new TriggerResolverError(`event "${triggerId}" requires artifactKind.`);
    }
    const entry = Object.hasOwn(ARTIFACT_KIND_ENTRIES, kind) ? ARTIFACT_KIND_ENTRIES[kind] : null;
    if (entry == null) {
      throw new TriggerResolverError(
        `unknown artifactKind "${kind}" (known: ${Object.keys(ARTIFACT_KIND_ENTRIES).join(', ')}).`
      );
    }
    if (!declaredEntries.includes(entry)) {
      throw new TriggerResolverError(
        `artifactKind "${kind}" selects "${entry}", which trigger "${triggerId}" does not declare.`
      );
    }
    selectedEntries = [entry];
  } else {
    if (artifactKind != null) {
      throw new TriggerResolverError(`event "${triggerId}" does not select by artifactKind.`);
    }
    selectedEntries = declaredEntries;
  }

  const risk = nonEmptyString(riskAction);
  if (riskAction != null && (risk == null || !RISK_ACTIONS.includes(risk))) {
    throw new TriggerResolverError(
      `unknown riskAction "${riskAction}" (known: ${RISK_ACTIONS.join(', ')}).`
    );
  }
  const mode = nonEmptyString(trigger.mode);
  if (mode != null && !TRIGGER_MODES.includes(mode)) {
    throw new TriggerResolverError(`trigger "${triggerId}" declares unknown mode "${mode}".`);
  }
  const profile = nonEmptyString(trigger.profile);
  const declaredIndependence = nonEmptyString(trigger.independence);
  if (declaredIndependence != null && !INDEPENDENCE_TIERS.includes(declaredIndependence)) {
    throw new TriggerResolverError(
      `trigger "${triggerId}" declares unknown independence "${declaredIndependence}".`
    );
  }
  // The single place `riskAction` is consulted.
  const independence =
    triggerId === 'before-merge' && risk === 'human-required'
      ? raiseIndependence(declaredIndependence, 'provider-diverse')
      : declaredIndependence;

  const capabilities = sortedUnique(nonEmptyStringList(hostCapabilities, 'hostCapabilities'));
  const revision = nonEmptyString(subjectRevision);
  if (subjectRevision != null && revision == null) {
    throw new TriggerResolverError('subjectRevision must be a non-empty string when supplied.');
  }

  const documents = indexFlowDocuments(flowDocuments);
  const requiredEvidence = new Set(
    nonEmptyStringList(trigger.requiredEvidence, `triggers.${triggerId}.requiredEvidence`)
  );
  const flowPins = selectedEntries.map((entryName) => {
    const entry = Object.hasOwn(registry.entries, entryName) ? registry.entries[entryName] : null;
    if (!isPlainObject(entry)) {
      throw new TriggerResolverError(`trigger "${triggerId}" names unknown entry "${entryName}".`);
    }
    const flowId = nonEmptyString(entry.flow);
    if (flowId == null) {
      throw new TriggerResolverError(`entry "${entryName}" names no flow.`);
    }
    const document = documents.get(flowId);
    if (document == null) {
      throw new TriggerResolverError(
        `entry "${entryName}" resolves to flow "${flowId}", which was not supplied.`
      );
    }
    for (const input of Array.isArray(document.inputs) ? document.inputs : []) {
      const name = nonEmptyString(input?.name);
      if (input?.required === true && name != null) requiredEvidence.add(name);
    }
    // Version mismatch between the entry and the document is rejected inside
    // `deriveFlowPin`; a pin under the wrong version is worse than no pin.
    let pin;
    try {
      pin = deriveFlowPin(document, { expectedVersion: entry.flowVersion ?? null });
    } catch (error) {
      throw new TriggerResolverError(
        `entry "${entryName}" cannot be pinned: ${error?.message ?? error}`,
        { cause: error }
      );
    }
    return { entry: entryName, ...pin };
  });

  const evidenceRequirements = sortedUnique([...requiredEvidence]);
  const occurrenceId = deriveOccurrenceId({
    triggerId,
    artifactKind: kind,
    riskAction: risk,
    hostCapabilities: capabilities,
    subjectRevision: revision,
    selectedEntries,
    flowPins,
  });

  return {
    triggerId,
    occurrenceId,
    selectedEntries,
    flowPins,
    evidenceRequirements,
    independence,
    mode,
    profile,
  };
}

/**
 * Idempotency key of one occurrence: the same inputs against the same pinned
 * Flows always mint the same id, so a re-sent event is recognizable as such.
 *
 * Not `computeCandidateContentHash`: that function hashes the
 * `{ clusterKey, evidence, policyVersion }` triple of a promotion candidate
 * and mints an `RR-PC-` id, which an occurrence is not. The primitives under
 * it (`canonicalJson`, `sha256Hex`) are the shared ones.
 *
 * @param {object} fields
 * @returns {string}
 */
export function deriveOccurrenceId(fields) {
  return `${OCCURRENCE_ID_PREFIX}${sha256Hex(canonicalJson(fields)).slice(0, OCCURRENCE_ID_HASH_LENGTH)}`;
}
