import assert from 'node:assert/strict';
import test from 'node:test';
import { findSensitiveCodePaths } from '../src/lib/sensitive-code-paths.mjs';

test('sensitive paths: tiny auth and payment changes signal elevated review', () => {
  assert.deepEqual(findSensitiveCodePaths(['src/auth/login.ts', 'apps/shop/payments/charge.php']), [
    'src/auth/login.ts',
    'apps/shop/payments/charge.php',
  ]);
});

test('sensitive paths: docs, tests, examples and ambiguous words do not escalate', () => {
  assert.deepEqual(
    findSensitiveCodePaths([
      'docs/auth.md',
      'tests/auth.test.mjs',
      'src/auth/login.test.ts',
      'src/__tests__/auth.ts',
      'packages/demo/examples/auth.ts',
      'src/lib/author.ts',
      'src/authoring/check.ts',
      'src/lib/payment-method.md',
    ]),
    []
  );
});

test('sensitive paths: directory and filename tokens cover several source roots', () => {
  assert.deepEqual(
    findSensitiveCodePaths([
      'src/authorization.ts',
      'runners/cli/src/permissions/check.mjs',
      'src/lib/auth-service.ts',
      'packages/backend/src/PII/parse.py',
      'src/lib/billing_manager.go',
      'app/api/auth/route.ts',
      'services/admin/access-control/check.ts',
      'src/auth-service/rotate.ts',
    ]),
    [
      'src/authorization.ts',
      'runners/cli/src/permissions/check.mjs',
      'src/lib/auth-service.ts',
      'packages/backend/src/PII/parse.py',
      'src/lib/billing_manager.go',
      'app/api/auth/route.ts',
      'services/admin/access-control/check.ts',
      'src/auth-service/rotate.ts',
    ]
  );
});

test('sensitive paths: mixed files and Windows separators preserve evidence paths', () => {
  assert.deepEqual(
    findSensitiveCodePaths([
      'src\\auth\\login.ts',
      'src/feature.ts',
      '.github/workflows/ci.yml',
      'lib/payments/charge.rb',
    ]),
    ['src\\auth\\login.ts', 'lib/payments/charge.rb']
  );
});

test('sensitive paths: UI components and cross-language auth code are in scope', () => {
  assert.deepEqual(
    findSensitiveCodePaths([
      'src/auth/SignIn.vue',
      'src/authorization/Guard.svelte',
      'apps/shop/payments/Checkout.astro',
      'lib/permissions/Policy.cs',
      'services/auth/SignIn.swift',
      'app/credentials/Store.dart',
      'src/oauth/Refresh.ts',
      'src/lib/author.vue',
    ]),
    [
      'src/auth/SignIn.vue',
      'src/authorization/Guard.svelte',
      'apps/shop/payments/Checkout.astro',
      'lib/permissions/Policy.cs',
      'services/auth/SignIn.swift',
      'app/credentials/Store.dart',
      'src/oauth/Refresh.ts',
    ]
  );
});

test('sensitive paths: malformed input does not throw or invent sensitive paths', () => {
  for (const bad of [null, undefined, '', {}, 5]) {
    assert.deepEqual(findSensitiveCodePaths(bad), []);
  }
  assert.deepEqual(findSensitiveCodePaths([undefined, null, 0, {}, 'src/auth/login.ts']), [
    'src/auth/login.ts',
  ]);
});
