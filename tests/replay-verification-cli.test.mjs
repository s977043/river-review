import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';

import { buildPairedReplay } from '../src/lib/paired-replay.mjs';
import { canonicalJson } from '../src/lib/promotion-candidates.mjs';
import { computeReplaySha256, computeTrustedKeyId } from '../src/lib/replay-verification.mjs';
import { runCliInProcess } from './helpers/cli.mjs';

const NOW = new Date('2026-10-05T00:00:00.000Z');

function runRecord(runId, findings) {
  return {
    runId,
    timestamp: '2026-10-04T00:00:00.000Z',
    reviewedTarget: '/repo',
    mergeBase: 'base-sha',
    caseId: 'case-1',
    phase: 'midstream',
    findings,
  };
}

function replay() {
  return buildPairedReplay(
    {
      hypothesis: 'signed verifier fixture',
      baseline: {
        commitSha: 'base-commit',
        skillRegistryCommit: 'registry-a',
        provider: 'openai',
        model: 'test-model',
        temperature: 0,
        runs: [
          runRecord('base-run', [
            {
              fingerprint: '0123456789abcdef',
              severity: 'major',
              file: 'src/a.mjs',
              ruleId: 'test-rule',
              title: 'false positive',
            },
          ]),
        ],
      },
      candidate: {
        commitSha: 'candidate-commit',
        skillRegistryCommit: 'registry-b',
        provider: 'openai',
        model: 'test-model',
        temperature: 0,
        runs: [runRecord('candidate-run', [])],
      },
      dataset: { heldOutCaseKeys: [] },
      trials: { trialId: 'trial-1', trialCount: 1 },
      verifier: {
        independent: true,
        verifierId: 'ci-independent',
        runBy: 'separate-verifier-job',
      },
      metrics: { denominator: 'paired-case' },
      acceptance: {
        profiles: [
          {
            profile: 'standard',
            minSampleSize: 1,
            criteria: [{ metric: 'removedFindingCount', comparator: 'gte', threshold: 1 }],
          },
        ],
      },
    },
    { now: NOW }
  );
}

function snapshotTree(dir) {
  const snapshot = {};
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        snapshot[path.relative(dir, full) + '/'] = 'dir';
        walk(full);
      } else {
        snapshot[path.relative(dir, full)] = `${stats.mtimeMs}:${readFileSync(full, 'utf8')}`;
      }
    }
  };
  walk(dir);
  return snapshot;
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rr-verify-replay-'));
  const replayArtifact = replay();
  const pair = generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const keyId = computeTrustedKeyId(publicKeyPem).keyId;
  const candidate = replayArtifact.manifest.improvementCandidate ?? null;
  const payload = {
    scope: 'paired-replay-verification',
    replaySha256: computeReplaySha256(replayArtifact),
    manifestId: replayArtifact.manifest.manifestId,
    experimentKey: replayArtifact.manifest.experimentKey,
    manifestHash: replayArtifact.manifest.manifestHash,
    candidateId: candidate?.candidateId ?? null,
    candidateContentHash: candidate?.contentHash ?? null,
    verifierId: replayArtifact.manifest.verifier.verifierId,
    issuedAt: NOW.toISOString(),
  };
  const attestation = {
    schemaVersion: 1,
    kind: 'paired-replay-verifier-attestation',
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId,
      value: sign(null, Buffer.from(canonicalJson(payload), 'utf8'), pair.privateKey).toString('base64'),
    },
  };

  const replayPath = path.join(root, 'replay.json');
  const attestationPath = path.join(root, 'attestation.json');
  const keyPath = path.join(root, 'trusted-public.pem');
  writeFileSync(replayPath, JSON.stringify(replayArtifact, null, 2), 'utf8');
  writeFileSync(attestationPath, JSON.stringify(attestation, null, 2), 'utf8');
  writeFileSync(keyPath, publicKeyPem, 'utf8');

  return {
    root,
    replayPath,
    attestationPath,
    keyPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('river evolve verify-replay', () => {
  test('verifies signed evidence as JSON and stays read-only', async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const before = snapshotTree(f.root);

    const result = await runCliInProcess([
      'evolve',
      'verify-replay',
      '--replay',
      f.replayPath,
      '--attestation',
      f.attestationPath,
      '--trusted-key',
      f.keyPath,
      '--output',
      'json',
    ]);

    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verifier.independentVerifierVerified, true);
    assert.equal(parsed.trust.trustLevel, 'trusted');
    assert.equal(parsed.autoCanary, false);
    assert.equal(parsed.decision, null);
    assert.deepEqual(snapshotTree(f.root), before);
  });

  test('requires every trust input', async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const result = await runCliInProcess([
      'evolve',
      'verify-replay',
      '--replay',
      f.replayPath,
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /requires --attestation, --trusted-key/);
  });

  test('wrong trusted key exits 1 without emitting a verification artifact', async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
    writeFileSync(f.keyPath, other, 'utf8');

    const result = await runCliInProcess([
      'evolve',
      'verify-replay',
      '--replay',
      f.replayPath,
      '--attestation',
      f.attestationPath,
      '--trusted-key',
      f.keyPath,
      '--output',
      'json',
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /keyId does not match/);
    assert.equal(result.stdout, '');
  });

  test('replay-only options are rejected on verify-replay', async (t) => {
    const f = fixture();
    t.after(f.cleanup);
    const result = await runCliInProcess([
      'evolve',
      'verify-replay',
      '--replay',
      f.replayPath,
      '--attestation',
      f.attestationPath,
      '--trusted-key',
      f.keyPath,
      '--spec',
      'experiment.json',
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not valid for verify-replay/);
  });

  test('verification options are rejected on paired replay', async () => {
    const result = await runCliInProcess([
      'evolve',
      'replay',
      '--spec',
      'experiment.json',
      '--replay',
      'replay.json',
    ]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /verify-replay options/);
  });
});
