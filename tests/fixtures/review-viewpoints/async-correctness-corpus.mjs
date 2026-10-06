// Hand-labeled corpus for async-correctness Review Viewpoint activation
// (#2252 Phase 7). Same row shape as ./corpus.mjs (api-compatibility).
//
// The labels in `expectedViewpointIds` are written by a human reading the diff
// and deciding, from the review-obligation question alone, whether that
// obligation SHOULD be raised. They are deliberately NOT derived from
// `detectAsyncCorrectnessSignals`, `observeReviewViewpoints`, or
// `skills/midstream/async-correctness/references/viewpoints.yaml`.
//
// Obligation ids under measurement (from the async-correctness catalog):
//   await-before-use               — is a Promise awaited before it is used as a value/condition?
//   floating-promise-handling      — are completion and rejection of an unused call handled?
//   try-catch-error-propagation    — does a Promise returned inside `try` reach the `catch`?
//   collection-callback-completion — are async iteration callbacks awaited before moving on?
//
// A label says the obligation applies whether or not the callee's declaration
// is visible in the diff. Rows the producer cannot reach because the evidence
// lives outside the diff carry `knownMiss`; the label is not weakened.
//
// Bands and sources follow ./corpus.mjs. The generated-git and repo-commit rows
// come from scripts/build-review-viewpoint-band-diffs.mjs --skill async-correctness.

import { bandDiffs, repoCommitDiffs } from './async-correctness-band-diffs.generated.mjs';

export const BANDS = ['default', 'u0', 'cc'];

export const VIEWPOINT_IDS = [
  'await-before-use',
  'floating-promise-handling',
  'try-catch-error-propagation',
  'collection-callback-completion',
];

const handwrittenCorpus = [
  {
    id: 'ap01-async-call-in-condition',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'isLocked is declared async in the same hunk and its Promise is evaluated in an if condition, which is always truthy.',
    expectedViewpointIds: ['await-before-use'],
    diff: `diff --git a/src/jobs/runner.ts b/src/jobs/runner.ts
--- a/src/jobs/runner.ts
+++ b/src/jobs/runner.ts
@@ -1,6 +1,9 @@
 async function isLocked(id: string): Promise<boolean> {
   return store.has(id);
 }

 export async function runJob(id: string): Promise<void> {
+  if (isLocked(id)) {
+    return;
+  }
   await process(id);
 }
`,
  },
  {
    id: 'ap02-skill-fixture-imported-callees',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    knownMiss: true,
    rationale:
      'The async-correctness Skill fixture 01: isLocked in a condition and markDone floating. Both callees are imported, so the diff alone does not show they are async; the obligations still apply.',
    expectedViewpointIds: ['await-before-use', 'floating-promise-handling'],
    diff: `diff --git a/src/jobs/runner.ts b/src/jobs/runner.ts
new file mode 100644
--- /dev/null
+++ b/src/jobs/runner.ts
@@ -0,0 +1,9 @@
+import { isLocked, markDone, process } from './store';
+
+export async function runJob(id: string): Promise<void> {
+  if (isLocked(id)) {
+    return;
+  }
+  await process(id);
+  markDone(id);
+}
`,
  },
  {
    id: 'ap03-floating-promise',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'markDone is declared async in the diff and called as a bare statement: completion is not awaited and a rejection is unhandled.',
    expectedViewpointIds: ['floating-promise-handling'],
    diff: `diff --git a/src/jobs/done.ts b/src/jobs/done.ts
--- a/src/jobs/done.ts
+++ b/src/jobs/done.ts
@@ -1,7 +1,8 @@
 export async function markDone(id: string): Promise<void> {
   await store.set(id, 'done');
 }

 export async function finish(id: string): Promise<void> {
   await process(id);
+  markDone(id);
 }
`,
  },
  {
    id: 'ap04-return-in-try-without-await',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'fetchUser is async and its Promise is returned from inside try without await, so a rejection bypasses the catch.',
    expectedViewpointIds: ['try-catch-error-propagation'],
    diff: `diff --git a/src/users/load.ts b/src/users/load.ts
--- a/src/users/load.ts
+++ b/src/users/load.ts
@@ -1,8 +1,8 @@
 const fetchUser = async (id: string): Promise<User> => http.get(\`/users/\${id}\`);

 export async function loadUser(id: string): Promise<User | null> {
   try {
-    return await fetchUser(id);
+    return fetchUser(id);
   } catch {
     return null;
   }
 }
`,
  },
  {
    id: 'ap05-foreach-async-callback',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale: 'forEach with an async callback: flush runs before the saves complete.',
    expectedViewpointIds: ['collection-callback-completion'],
    diff: `diff --git a/src/sync/save.ts b/src/sync/save.ts
--- a/src/sync/save.ts
+++ b/src/sync/save.ts
@@ -1,6 +1,6 @@
 export async function saveAll(items: Item[]): Promise<void> {
-  for (const item of items) {
+  items.forEach(async (item) => {
     await save(item);
-  }
+  });
   await flush();
 }
`,
  },
  {
    id: 'ap06-filter-async-callback',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'filter with an async predicate keeps every element because a Promise is always truthy.',
    expectedViewpointIds: ['collection-callback-completion'],
    diff: `diff --git a/src/users/active.ts b/src/users/active.ts
--- a/src/users/active.ts
+++ b/src/users/active.ts
@@ -1,3 +1,5 @@
 export async function activeUsers(users: User[]): Promise<User[]> {
-  return users;
+  return users.filter(async (user) => {
+    return await isActive(user.id);
+  });
 }
`,
  },
  {
    id: 'ap07-async-result-assigned-unawaited',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'loadProfile is async and its result is assigned without await, then read as if it were the resolved value.',
    expectedViewpointIds: ['await-before-use'],
    diff: `diff --git a/src/profile/name.ts b/src/profile/name.ts
--- a/src/profile/name.ts
+++ b/src/profile/name.ts
@@ -1,6 +1,7 @@
 async function loadProfile(id: string): Promise<Profile> {
   return repo.find(id);
 }

 export async function displayName(id: string): Promise<string> {
-  return 'anonymous';
+  const profile = loadProfile(id);
+  return profile.name;
 }
`,
  },
  {
    id: 'ap08-mixed-diff-async-plus-noise',
    shape: 'mixed',
    band: 'default',
    source: 'handwritten',
    rationale:
      'One real floating promise in src/ next to a docs edit, a config edit, and a synchronous helper change. The noise must not add or remove obligations.',
    expectedViewpointIds: ['floating-promise-handling'],
    diff: `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 # Jobs
-Run jobs.
+Run jobs asynchronously.
diff --git a/config/jobs.json b/config/jobs.json
--- a/config/jobs.json
+++ b/config/jobs.json
@@ -1,3 +1,3 @@
 {
-  "retries": 1
+  "retries": 3
 }
diff --git a/src/jobs/format.ts b/src/jobs/format.ts
--- a/src/jobs/format.ts
+++ b/src/jobs/format.ts
@@ -1,3 +1,3 @@
 export function formatId(id: string): string {
-  return id;
+  return id.trim();
 }
diff --git a/src/jobs/notify.ts b/src/jobs/notify.ts
--- a/src/jobs/notify.ts
+++ b/src/jobs/notify.ts
@@ -1,7 +1,8 @@
 async function sendMail(to: string): Promise<void> {
   await mailer.send(to);
 }

 export async function complete(job: Job): Promise<void> {
   await save(job);
+  sendMail(job.owner);
 }
`,
  },
  {
    id: 'an01-void-fire-and-forget-with-catch',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The async-correctness Skill fixture 02 with trackEvent declared in the diff: void plus .catch plus an intent comment is deliberate fire-and-forget.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/api/checkout.ts b/src/api/checkout.ts
--- a/src/api/checkout.ts
+++ b/src/api/checkout.ts
@@ -1,7 +1,10 @@
 const trackEvent = async (name: string, data: object): Promise<void> => analytics.send(name, data);

 export async function checkout(cart: Cart): Promise<Receipt> {
   const receipt = await submitOrder(cart);
+
+  // Analytics must not block or fail the checkout path (fire-and-forget).
+  void trackEvent('checkout_completed', { total: receipt.total }).catch((err) => logger.warn(err));
   return receipt;
 }
`,
  },
  {
    id: 'an02-all-awaited',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'Every call to the async helper is awaited in condition, assignment, and statement position.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/jobs/runner.ts b/src/jobs/runner.ts
--- a/src/jobs/runner.ts
+++ b/src/jobs/runner.ts
@@ -1,5 +1,10 @@
 async function isLocked(id: string): Promise<boolean> {
   return store.has(id);
 }

 export async function runJob(id: string): Promise<void> {
+  if (await isLocked(id)) {
+    return;
+  }
+  const locked = await isLocked(id);
+  await isLocked(String(locked));
 }
`,
  },
  {
    id: 'an03-test-file-unawaited',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'Un-awaited async calls inside a test file belong to a different Skill (vitest-mock-isolation), not to async-correctness.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/jobs/runner.test.ts b/src/jobs/runner.test.ts
--- a/src/jobs/runner.test.ts
+++ b/src/jobs/runner.test.ts
@@ -1,4 +1,5 @@
 const setup = async () => db.reset();

 test('runs', async () => {
+  setup();
   expect(await runJob('a')).toBeUndefined();
 });
`,
  },
  {
    id: 'an04-promise-all-map',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'Promise.all over map(async ...) is awaited: every callback completes before flush. Nothing to verify.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/sync/save.ts b/src/sync/save.ts
--- a/src/sync/save.ts
+++ b/src/sync/save.ts
@@ -1,6 +1,4 @@
 export async function saveAll(items: Item[]): Promise<void> {
-  for (const item of items) {
-    await save(item);
-  }
+  await Promise.all(items.map(async (item) => save(item)));
   await flush();
 }
`,
  },
  {
    id: 'an05-return-promise-outside-try',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'Returning an async call without await outside any try block hands the Promise to the caller unchanged; no catch is bypassed.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/users/load.ts b/src/users/load.ts
--- a/src/users/load.ts
+++ b/src/users/load.ts
@@ -1,5 +1,5 @@
 const fetchUser = async (id: string): Promise<User> => http.get(\`/users/\${id}\`);

 export function loadUser(id: string): Promise<User> {
-  return http.get(\`/users/\${id}\`);
+  return fetchUser(id);
 }
`,
  },
  {
    id: 'an06-docs-only',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale: 'Only prose that mentions forEach(async ...) changes; no code changes.',
    expectedViewpointIds: [],
    diff: `diff --git a/docs/async.md b/docs/async.md
--- a/docs/async.md
+++ b/docs/async.md
@@ -1,2 +1,3 @@
 # Async
 Do not use forEach with async callbacks.
+Prefer \`for...of\` with \`await\`, e.g. never items.forEach(async (x) => save(x)).
`,
  },
  {
    id: 'an07-sync-function-in-condition',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale: 'isReady is synchronous, so using it in a condition needs no await.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/jobs/ready.ts b/src/jobs/ready.ts
--- a/src/jobs/ready.ts
+++ b/src/jobs/ready.ts
@@ -1,6 +1,9 @@
 function isReady(id: string): boolean {
   return cache.has(id);
 }

 export async function start(id: string): Promise<void> {
+  if (isReady(id)) {
+    return;
+  }
   await boot(id);
 }
`,
  },
  {
    id: 'an08-then-catch-chain',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The async call is not awaited but carries .then and .catch handlers, so completion and rejection are both handled.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/jobs/done.ts b/src/jobs/done.ts
--- a/src/jobs/done.ts
+++ b/src/jobs/done.ts
@@ -1,7 +1,8 @@
 export async function markDone(id: string): Promise<void> {
   await store.set(id, 'done');
 }

 export function finish(id: string): void {
   process(id);
+  markDone(id).then(() => metrics.inc('done')).catch((err) => logger.warn(err));
 }
`,
  },
  {
    id: 'an09-mixed-diff-no-async-change',
    shape: 'mixed',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A docs edit, a config edit, and a synchronous src/ change. No async code changes anywhere.',
    expectedViewpointIds: [],
    diff: `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 # Jobs
-Run jobs.
+Run jobs quickly.
diff --git a/config/jobs.json b/config/jobs.json
--- a/config/jobs.json
+++ b/config/jobs.json
@@ -1,3 +1,3 @@
 {
-  "retries": 1
+  "retries": 2
 }
diff --git a/src/jobs/format.ts b/src/jobs/format.ts
--- a/src/jobs/format.ts
+++ b/src/jobs/format.ts
@@ -1,3 +1,3 @@
 export function formatId(id: string): string {
-  return id;
+  return id.toLowerCase();
 }
`,
  },
  {
    id: 'an10-return-await-inside-try',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The Promise is awaited before it is returned from try, so the catch sees a rejection.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/users/load.ts b/src/users/load.ts
--- a/src/users/load.ts
+++ b/src/users/load.ts
@@ -1,8 +1,8 @@
 const fetchUser = async (id: string): Promise<User> => http.get(\`/users/\${id}\`);

 export async function loadUser(id: string): Promise<User | null> {
   try {
-    return fetchUser(id);
+    return await fetchUser(id);
   } catch {
     return null;
   }
 }
`,
  },
];

// --- Same semantic change expressed in three real-git input bands ---
//
// Labels are written against the SEMANTIC change, not against what survives into
// the diff text. In the u0 band the async declaration is not in the hunk, so the
// producer cannot know the callee is async; those rows are measured misses.
const BAND_SCENARIO_LABELS = [
  {
    bandOf: 'ab01-condition-unawaited',
    rationale: 'await removed from an async call in an if condition (same semantics as ap01).',
    expectedViewpointIds: ['await-before-use'],
  },
  {
    bandOf: 'ab02-foreach-async-callback',
    rationale: 'for...of with await replaced by forEach(async ...) (same semantics as ap05).',
    expectedViewpointIds: ['collection-callback-completion'],
  },
  {
    bandOf: 'ab03-return-in-try-unawaited',
    rationale: 'await removed from a return inside try (same semantics as ap04).',
    expectedViewpointIds: ['try-catch-error-propagation'],
  },
  {
    bandOf: 'ab04-await-added',
    rationale:
      'await added to an async call in a condition. The change fixes the bug; nothing to verify.',
    expectedViewpointIds: [],
  },
  {
    bandOf: 'ab05-void-fire-and-forget',
    rationale:
      'An awaited analytics call becomes void ... .catch(...): deliberate fire-and-forget with handled rejection.',
    expectedViewpointIds: [],
  },
];

const BAND_SHAPE = { default: 'minimal', u0: 'u0', cc: 'combined' };

const bandFixtures = BAND_SCENARIO_LABELS.flatMap((scenario) => [
  ...BANDS.map((band) => ({
    id: `${scenario.bandOf}--${band}`,
    bandOf: scenario.bandOf,
    ccPairOf: band === 'cc' ? scenario.bandOf : null,
    band,
    source: 'generated-git',
    shape: BAND_SHAPE[band],
    rationale: scenario.rationale,
    expectedViewpointIds: scenario.expectedViewpointIds,
    diff: bandDiffs[scenario.bandOf][band],
  })),
  {
    id: `${scenario.bandOf}--cc-reverse`,
    bandOf: null,
    ccPairOf: scenario.bandOf,
    band: 'cc',
    source: 'generated-git',
    shape: 'combined',
    rationale: `${scenario.rationale} Same merge read from the other parent.`,
    expectedViewpointIds: scenario.expectedViewpointIds,
    diff: bandDiffs[scenario.bandOf].ccReverse,
  },
]);

// Real commits from THIS repository. Every async call they add is awaited
// (read by hand: the loader's memoized `.then` Promise is intentional and is
// awaited by its only caller), so no obligation applies.
const REPO_COMMIT_LABELS = {
  'arc01-review-viewpoints-loader-default': {
    rationale: 'New async loader module; every async call is awaited or intentionally memoized.',
    expectedViewpointIds: [],
  },
  'arc02-review-viewpoint-stage-default': {
    rationale: 'New async stage module; every async call is awaited.',
    expectedViewpointIds: [],
  },
  'arc03-review-viewpoint-stage-u0': {
    rationale: 'Same commit as arc02 in the u0 band.',
    expectedViewpointIds: [],
  },
};

const repoCommitFixtures = Object.entries(repoCommitDiffs).map(([id, entry]) => {
  const label = REPO_COMMIT_LABELS[id];
  if (!label) throw new Error(`missing hand label for repo-commit fixture: ${id}`);
  return {
    id,
    band: entry.band,
    source: 'repo-commit',
    shape: BAND_SHAPE[entry.band],
    command: entry.command,
    rationale: label.rationale,
    expectedViewpointIds: label.expectedViewpointIds,
    diff: entry.diff,
  };
});

export const corpus = [...handwrittenCorpus, ...bandFixtures, ...repoCommitFixtures];
