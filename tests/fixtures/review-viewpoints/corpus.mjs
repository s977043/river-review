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
// `knownMiss` marks a label the current implementation is known not to reach.
// It documents a recall gap; it does not weaken the label.

export const VIEWPOINT_IDS = [
  'backward-compatibility',
  'api-test-coverage',
  'optional-field-consumer-handling',
];

export const corpus = [
  {
    id: 'p01-response-dto-field-removed',
    shape: 'minimal',
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
