import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLycheeVersion, meetsMinimum, checkLychee } from '../scripts/check-lychee-version.mjs';

const fromOutput = (output) => () => output;

test('parseLycheeVersion reads plain, v-prefixed, and prerelease versions', () => {
  assert.deepEqual(parseLycheeVersion('lychee 0.24.2'), { version: [0, 24, 2], prerelease: null });
  assert.deepEqual(parseLycheeVersion('v0.24.0'), { version: [0, 24, 0], prerelease: null });
  assert.deepEqual(parseLycheeVersion('0.24.0-alpha.1'), {
    version: [0, 24, 0],
    prerelease: 'alpha.1',
  });
  assert.equal(parseLycheeVersion(''), null);
});

test('meetsMinimum treats a prerelease of the minimum as older', () => {
  assert.equal(meetsMinimum(parseLycheeVersion('lychee 0.24.2')), true);
  assert.equal(meetsMinimum(parseLycheeVersion('v0.24.0')), true);
  assert.equal(meetsMinimum(parseLycheeVersion('lychee 0.23.0')), false);
  assert.equal(meetsMinimum(parseLycheeVersion('0.24.0-alpha.1')), false);
});

test('checkLychee passes for supported versions', () => {
  assert.equal(checkLychee(fromOutput('lychee 0.24.2')), null);
  assert.equal(checkLychee(fromOutput('v0.24.0')), null);
});

test('checkLychee rejects old, prerelease, and unparsable output', () => {
  assert.match(checkLychee(fromOutput('lychee 0.23.0')), /0\.23\.0 is too old/);
  assert.match(checkLychee(fromOutput('0.24.0-alpha.1')), /0\.24\.0-alpha\.1 is too old/);
  assert.match(checkLychee(fromOutput('')), /Could not parse lychee version/);
});

test('checkLychee distinguishes a missing binary from a failing one', () => {
  const missing = checkLychee(() => {
    throw Object.assign(new Error('spawn lychee ENOENT'), { code: 'ENOENT' });
  });
  assert.match(missing, /lychee not found/);
  assert.match(missing, /cargo install lychee/);
  assert.match(missing, /lychee\.cli\.rs\/installation/);

  const failing = checkLychee(() => {
    throw Object.assign(new Error('Command failed'), { status: 2, stderr: 'line1\nboom' });
  });
  assert.match(failing, /found but `lychee --version` failed \(exit code 2\)/);
  assert.match(failing, /boom/);
  assert.doesNotMatch(failing, /not found/);
});
