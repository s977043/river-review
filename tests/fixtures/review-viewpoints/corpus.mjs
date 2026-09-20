// Hand-labeled corpus for Review Viewpoint activation measurement (#2252 Phase 8).
//
// The labels in `expectedViewpointIds` are written by a human reading the diff
// and deciding, from the review-obligation question alone, whether that
// obligation SHOULD be raised. They are deliberately NOT derived from
// `detectApiCompatibilitySignals`, `observeReviewViewpoints`, or
// `skills/midstream/api-compatibility/references/viewpoints.yaml`. If the label
// were taken from the implementation, injecting a defect into the matcher would
// still leave this corpus green (CLAUDE.md "Self-consistent test traps").
//
// Obligation ids under measurement (from the api-compatibility catalog):
//   backward-compatibility          — do existing consumers still work?
//   api-test-coverage               — is the contract change covered by tests?
//   optional-field-consumer-handling— can consumers handle the new optional field?
//
//
// ## Bands (#2252 Phase 8b)
//
// Every fixture declares the input band its diff text belongs to and where the
// text came from:
//
//   band   'default' = 3 lines of context (the width every git-generated route
//                      in pages/reference/artifact-input-contract.md uses)
//          'u0'      = `git diff/show --unified=0`
//          'cc'      = combined diff (`git show --cc`, `@@@` hunk headers)
//   source 'handwritten'    = diff text typed by a human (the Phase 8a rows)
//          'generated-git'  = real `git show` output captured from a disposable
//                             repository by scripts/build-review-viewpoint-band-diffs.mjs
//          'repo-commit'    = real `git show` output for a commit in THIS repository
//
// `bandOf` groups the generated rows that express the SAME semantic change in
// all three bands, so a disagreement between bands is directly visible.
//
// `knownMiss` marks a label the current implementation is known not to reach.
// It documents a recall gap; it does not weaken the label.

import { bandDiffs, repoCommitDiffs } from './band-diffs.generated.mjs';

export const BANDS = ['default', 'u0', 'cc'];

export const VIEWPOINT_IDS = [
  'backward-compatibility',
  'api-test-coverage',
  'optional-field-consumer-handling',
];

const handwrittenCorpus = [
  {
    id: 'p01-response-dto-field-removed',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A field disappears from a response DTO on an api/ path. Consumers reading it break, and the change needs contract test coverage.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/api/user.ts b/src/api/user.ts
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@ -1,5 +1,4 @@
 interface UserResponse {
   id: string;
-  legacyName: string;
   name: string;
 }
`,
  },
  {
    id: 'p02-dto-field-type-changed',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'An existing contract field changes type from string to number. Consumers parsing the old type break.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/dto/order.ts b/src/dto/order.ts
--- a/src/dto/order.ts
+++ b/src/dto/order.ts
@@ -1,4 +1,4 @@
 interface OrderDto {
-  total: string;
+  total: number;
   id: string;
 }
`,
  },
  {
    id: 'p03-requiredness-tightened',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'An optional request field becomes required. Existing callers that omit it start failing validation.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/api/payment.ts b/src/api/payment.ts
--- a/src/api/payment.ts
+++ b/src/api/payment.ts
@@ -1,4 +1,4 @@
 interface PaymentRequest {
-  idempotencyKey?: string;
+  idempotencyKey: string;
   amount: number;
 }
`,
  },
  {
    id: 'p04-optional-field-added',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A new optional field appears on a contract. Not breaking, but consumers must handle its absence/presence safely.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
    diff: `diff --git a/src/api/profile.ts b/src/api/profile.ts
--- a/src/api/profile.ts
+++ b/src/api/profile.ts
@@ -1,3 +1,4 @@
 interface ProfileResponse {
   id: string;
+  nickname?: string;
 }
`,
  },
  {
    id: 'p05-contract-named-outside-api-path',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The file is not under api/, but the declaration is a *Response contract and loses a field. Same consumer breakage as p01.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/models/checkout.ts b/src/models/checkout.ts
--- a/src/models/checkout.ts
+++ b/src/models/checkout.ts
@@ -1,5 +1,4 @@
 interface CheckoutResponse {
   id: string;
-  couponCode: string;
   total: number;
 }
`,
  },
  {
    id: 'p06-zod-contract-field-removed',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A zod-declared contract schema loses a field. The wire contract shrinks exactly as in p01.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/contracts/order.ts b/src/contracts/order.ts
--- a/src/contracts/order.ts
+++ b/src/contracts/order.ts
@@ -1,5 +1,4 @@
 const OrderSchema = z.object({
   id: z.string(),
-  legacyRef: z.string(),
   total: z.number(),
 });
`,
  },
  {
    id: 'p07-field-renamed',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A contract field is renamed. The old name is gone for consumers, so it is a breaking change plus a test-coverage question.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/api/invoice.ts b/src/api/invoice.ts
--- a/src/api/invoice.ts
+++ b/src/api/invoice.ts
@@ -1,4 +1,4 @@
 interface InvoiceResponse {
-  invoiceNo: string;
+  invoiceNumber: string;
   total: number;
 }
`,
  },
  {
    id: 'p08-mixed-diff-contract-plus-noise',
    shape: 'mixed',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The same removal as p01, buried in a diff that also touches docs, a stylesheet, an internal helper, and a test. File-level noise must not suppress the PR-level obligation.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
 # Project
-old line
+new line
diff --git a/src/styles/app.css b/src/styles/app.css
--- a/src/styles/app.css
+++ b/src/styles/app.css
@@ -1,3 +1,3 @@
 .a {
-  color: red;
+  color: blue;
 }
diff --git a/src/lib/format-helper.ts b/src/lib/format-helper.ts
--- a/src/lib/format-helper.ts
+++ b/src/lib/format-helper.ts
@@ -1,3 +1,3 @@
 export function pad(value: string) {
-  return value.padStart(2, '0');
+  return value.padStart(3, '0');
 }
diff --git a/src/api/user.ts b/src/api/user.ts
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@ -1,5 +1,4 @@
 interface UserResponse {
   id: string;
-  legacyName: string;
   name: string;
 }
diff --git a/tests/user.test.ts b/tests/user.test.ts
--- a/tests/user.test.ts
+++ b/tests/user.test.ts
@@ -1,3 +1,3 @@
 test('user', () => {
-  expect(1).toBe(1);
+  expect(2).toBe(2);
 });
`,
  },
  {
    id: 'p09-request-dto-required-field-added',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    knownMiss: true,
    rationale:
      'A new REQUIRED field is added to a request DTO. Existing callers that do not send it start failing, so backward compatibility and test coverage are both in question. Labeled from the obligation question, independent of whether the catalog has a matching activation kind.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
    diff: `diff --git a/src/api/signup.ts b/src/api/signup.ts
--- a/src/api/signup.ts
+++ b/src/api/signup.ts
@@ -1,3 +1,4 @@
 interface SignupRequest {
   email: string;
+  tenantId: string;
 }
`,
  },
  {
    id: 'n01-new-contract-file-only',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A brand-new endpoint contract. There is no existing consumer to break, so no backward-compatibility obligation should fire.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/api/new-endpoint.ts b/src/api/new-endpoint.ts
new file mode 100644
--- /dev/null
+++ b/src/api/new-endpoint.ts
@@ -0,0 +1,4 @@
+interface NewEndpointResponse {
+  id: string;
+  label: string;
+}
`,
  },
  {
    id: 'n02-test-fixture-only',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'The changed declaration lives in a test file. No production contract moves, so no obligation.',
    expectedViewpointIds: [],
    diff: `diff --git a/tests/api/user.test.ts b/tests/api/user.test.ts
--- a/tests/api/user.test.ts
+++ b/tests/api/user.test.ts
@@ -1,5 +1,4 @@
 interface UserResponseFixture {
   id: string;
-  legacyName: string;
   name: string;
 }
`,
  },
  {
    id: 'n03-internal-type-field-removed',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'An internal, non-contract options type loses a field. Nothing crosses a published boundary.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/lib/util.ts b/src/lib/util.ts
--- a/src/lib/util.ts
+++ b/src/lib/util.ts
@@ -1,4 +1,3 @@
 interface Options {
-  verbose: boolean;
   retries: number;
 }
`,
  },
  {
    id: 'n04-docs-only',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale: 'Documentation-only change. No contract surface is touched.',
    expectedViewpointIds: [],
    diff: `diff --git a/docs/usage.md b/docs/usage.md
--- a/docs/usage.md
+++ b/docs/usage.md
@@ -1,2 +1,2 @@
 # Usage
-Run the old command.
+Run the new command.
`,
  },
  {
    id: 'n05-contract-file-comment-only',
    shape: 'minimal',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A contract file changes, but only a comment. The wire shape is identical, so raising an obligation would be a false activation.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/api/account.ts b/src/api/account.ts
--- a/src/api/account.ts
+++ b/src/api/account.ts
@@ -1,4 +1,4 @@
-// account contract
+// account contract (see RFC-12)
 interface AccountResponse {
   id: string;
 }
`,
  },
  {
    id: 'n06-mixed-diff-no-contract-change',
    shape: 'mixed',
    band: 'default',
    source: 'handwritten',
    rationale:
      'A multi-file diff touching an api/ directory file, a test, and docs, but no property of any contract declaration changes. Path proximity alone must not activate an obligation.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/api/handler.ts b/src/api/handler.ts
--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -1,4 +1,4 @@
 export function handle(request: Request) {
-  return respond(request, 200);
+  return respond(request, 201);
 }
diff --git a/tests/handler.test.ts b/tests/handler.test.ts
--- a/tests/handler.test.ts
+++ b/tests/handler.test.ts
@@ -1,3 +1,3 @@
 test('handler', () => {
-  expect(handle(req).status).toBe(200);
+  expect(handle(req).status).toBe(201);
 });
diff --git a/docs/api.md b/docs/api.md
--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Returns 200.
+Returns 201.
`,
  },
];

// --- Phase 8b: same semantic change expressed in three real-git input bands ---
//
// The label for each row is written from the obligation question against the
// SEMANTIC change, not against what survives into the diff text. A band that
// loses the information the detector needs therefore shows up as a recall gap
// on that band, which is the measurement this corpus exists to produce.

const BAND_SCENARIO_LABELS = [
  {
    bandOf: 'b01-response-dto-field-removed',
    rationale:
      'A field disappears from a response DTO on an api/ path (same semantics as p01). Consumers reading it break, and the change needs contract test coverage.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
  },
  {
    bandOf: 'b02-requiredness-tightened',
    rationale:
      'An optional request field becomes required (same semantics as p03). Existing callers that omit it start failing validation.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
  },
  {
    bandOf: 'b03-optional-field-added',
    rationale:
      'A new optional field appears on a response contract (same semantics as p04). Consumers must handle its absence safely.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
  },
  {
    bandOf: 'b04-contract-named-outside-api-path',
    rationale:
      'A *Response contract outside api/ loses a field (same semantics as p05). The obligation follows the contract, not the directory, in every band.',
    expectedViewpointIds: ['backward-compatibility', 'api-test-coverage'],
  },
  {
    bandOf: 'b05-contract-file-comment-only',
    rationale:
      'Only a comment in a contract file changes (same semantics as n05). The wire shape is identical in every band.',
    expectedViewpointIds: [],
  },
  {
    bandOf: 'b06-internal-type-field-removed',
    rationale:
      'An internal options type loses a field (same semantics as n03). Nothing crosses a published boundary in any band.',
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
  // Same merge, same resolution, opposite parent order. A combined diff's
  // change marker moves between prefix COLUMNS depending on which parent is
  // first, so this row carries the identical semantic change with the marker
  // in column 1 instead of column 2. The label is therefore identical to the
  // `--cc` row above; any difference in activation is an implementation
  // artifact, not a difference in what should be raised.
  {
    id: `${scenario.bandOf}--cc-reverse`,
    bandOf: null,
    ccPairOf: scenario.bandOf,
    band: 'cc',
    source: 'generated-git',
    shape: 'combined',
    rationale: `${scenario.rationale} Captured from the opposite merge direction, so the change marker sits in combined-diff column 1.`,
    expectedViewpointIds: scenario.expectedViewpointIds,
    diff: bandDiffs[scenario.bandOf].ccReverse,
  },
]);

// --- Phase 8b: real commits from this repository ---
//
// Labeled by reading `git show` for each commit and answering the obligation
// question. The commit subjects and the exact capture command are recorded in
// band-diffs.generated.mjs.

const REPO_COMMIT_LABELS = {
  'rc01-node-api-review-options-optional-field-default': {
    rationale:
      'dc238b88 adds an optional `concurrency?: number` to the published Node API `ReviewOptions` contract. The obligation question — can the consumer of the field handle it being absent — applies: every existing caller omits it, so the library must default it.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
  },
  'rc02-node-api-review-options-optional-field-u0': {
    rationale: 'Same commit and same obligation as rc01, captured at --unified=0.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
  },
  'rc03-skill-selection-result-optional-field-default': {
    rationale:
      '91299986 adds an optional `reviewMode?` to `SkillSelectionResult`, a value returned to consumers. Consumers must handle its absence on results produced by older versions.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
  },
  'rc04-skill-selection-result-optional-field-u0': {
    rationale: 'Same commit and same obligation as rc03, captured at --unified=0.',
    expectedViewpointIds: ['optional-field-consumer-handling'],
  },
  'rc05-output-kind-union-widened-default': {
    rationale:
      '15594086 adds a member to the `OutputKind` string-union alias. No property is removed, retyped, or made required, and no existing value stops being accepted, so none of the three obligations is raised by this diff alone.',
    expectedViewpointIds: [],
  },
  'rc06-docs-only-default': {
    rationale: '0841e238 changes one Markdown document. No contract surface is touched.',
    expectedViewpointIds: [],
  },
  'rc07-package-json-conflicted-merge-cc': {
    rationale:
      'A real combined diff (`git show --cc`) from this repository: 96b9821a resolves a package.json conflict. Dependency ranges move; no API/DTO declaration changes.',
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

// --- #2314 review: stale hunk-heading false-activation shapes -----------------
//
// git prints an enclosing declaration after the closing `@@` of a hunk header,
// but it is a funcname heuristic: it walks backwards to the nearest line that
// starts in column 0 with an identifier character. A block opened by anything
// else (`@Decorator`, a top-level IIFE, a bracket, a quote) therefore inherits
// the heading of a declaration that has ALREADY CLOSED above it. These rows are
// real `git diff` output for both openers, in both bands the shape appears in.
// They are labeled negative because no contract property changes in any of
// them. An implementation that trusts the heading activates on all four.

const staleHeadingNegatives = [
  {
    id: 'n07-stale-heading-decorator-block-default',
    shape: 'minimal',
    band: 'default',
    source: 'generated-git',
    command: 'git diff',
    rationale:
      "Real `git diff` output. `ttlSeconds` changes inside a `@Module({...})` decorator argument. git's funcname heuristic skips the `@`-prefixed opener and labels the hunk with the ALREADY CLOSED `export interface HealthResponse {` above it. No contract property changes, so any activation here is a false one (#2314 review).",
    expectedViewpointIds: [],
    diff: `diff --git a/src/app/app.module.ts b/src/app/app.module.ts
index a147f95..f97f6e2 100644
--- a/src/app/app.module.ts
+++ b/src/app/app.module.ts
@@ -4,6 +4,6 @@ export interface HealthResponse {
 
 @Module({
   providers: [],
-  ttlSeconds: 30,
+  ttlSeconds: 60,
 })
 export class AppModule {}
`,
  },
  {
    id: 'n08-stale-heading-iife-block-default',
    shape: 'minimal',
    band: 'default',
    source: 'generated-git',
    command: 'git diff',
    rationale:
      "Real `git diff` output. `retries` changes inside a top-level IIFE. git's funcname heuristic skips the `(`-prefixed opener and labels the hunk with the already closed `export interface BootResponse {` above it. Same stale-heading shape as n07 with a different non-identifier opener.",
    expectedViewpointIds: [],
    diff: `diff --git a/src/app/boot.ts b/src/app/boot.ts
index 7fdbe0f..fcd923f 100644
--- a/src/app/boot.ts
+++ b/src/app/boot.ts
@@ -4,7 +4,7 @@ export interface BootResponse {
 
 (function bootstrap() {
   const cfg = {
-    retries: 3,
+    retries: 5,
   };
   return cfg;
 })();
`,
  },
  {
    id: 'n09-stale-heading-decorator-block-u0',
    shape: 'minimal',
    band: 'u0',
    source: 'generated-git',
    command: 'git diff --unified=0',
    rationale:
      'Same change and same obligation as n07, captured at --unified=0. The stale heading survives the band, which is why scoping heading trust to --unified=0 would not remove the false activation.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/app/app.module.ts b/src/app/app.module.ts
index a147f95..f97f6e2 100644
--- a/src/app/app.module.ts
+++ b/src/app/app.module.ts
@@ -7 +7 @@ export interface HealthResponse {
-  ttlSeconds: 30,
+  ttlSeconds: 60,
`,
  },
  {
    id: 'n10-stale-heading-iife-block-u0',
    shape: 'minimal',
    band: 'u0',
    source: 'generated-git',
    command: 'git diff --unified=0',
    rationale: 'Same change and same obligation as n08, captured at --unified=0.',
    expectedViewpointIds: [],
    diff: `diff --git a/src/app/boot.ts b/src/app/boot.ts
index 7fdbe0f..fcd923f 100644
--- a/src/app/boot.ts
+++ b/src/app/boot.ts
@@ -7 +7 @@ export interface BootResponse {
-    retries: 3,
+    retries: 5,
`,
  },
];

export const corpus = [
  ...handwrittenCorpus,
  ...bandFixtures,
  ...staleHeadingNegatives,
  ...repoCommitFixtures,
];
