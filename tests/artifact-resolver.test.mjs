import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import path from 'node:path';

import {
  CWD_DEFAULTS,
  resolveArtifact,
  resolveAllArtifacts,
} from '../src/config/artifact-resolver.mjs';

// ---------------------------------------------------------------------------
// Stub fs factory: files listed in 'existing' are accessible, others reject
// ---------------------------------------------------------------------------
function makeFsStub(existing = []) {
  const set = new Set(existing.map((p) => path.resolve(p)));
  return {
    access(p) {
      return set.has(path.resolve(p))
        ? Promise.resolve()
        : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    },
  };
}

const CWD = '/repo';
const CFG_DIR = '/repo/cfg';

// ---------------------------------------------------------------------------
describe('CWD_DEFAULTS', () => {
  test('exports all 13 canonical artifact IDs from the contract', () => {
    const ids = Object.keys(CWD_DEFAULTS);
    assert.equal(ids.length, 13);
    for (const id of [
      'pbi-input',
      'plan',
      'todo',
      'test-cases',
      'review-self',
      'review-external',
      'diff',
      'junit',
      'coverage',
      'lint',
      'typecheck',
      'findings-pool',
      'tdd-ledger',
    ]) {
      assert.ok(id in CWD_DEFAULTS, id + ' missing from CWD_DEFAULTS');
    }
  });

  test('diff default is diff.patch, junit is junit.xml, findings-pool is findings-pool.json, tdd-ledger is tdd-ledger.json', () => {
    assert.equal(CWD_DEFAULTS.diff, 'diff.patch');
    assert.equal(CWD_DEFAULTS.junit, 'junit.xml');
    assert.equal(CWD_DEFAULTS['findings-pool'], 'findings-pool.json');
    assert.equal(CWD_DEFAULTS['tdd-ledger'], 'tdd-ledger.json');
  });

  // #2011 AC7 P3-4. `design` is the first Artifact Input Contract ID that has
  // NO cwd default. It is a REQUIRED input on design-review and
  // technical-review, and runner-cli-reference.md § "--entry の受理範囲"
  // declares that required inputs carry no default binding: a file that merely
  // sits in the working tree must not declare a required input satisfied.
  // Adding `design` here would silently make that published statement false.
  test('design has no cwd default: required Flow inputs carry no default binding', () => {
    assert.equal(CWD_DEFAULTS.design, undefined);
  });
});

// ---------------------------------------------------------------------------
describe('resolveArtifact — Tier 1: CLI arg', () => {
  test('returns cli source when cliArg is provided and file exists', async () => {
    const fsImpl = makeFsStub(['/repo/my-plan.md']);
    const r = await resolveArtifact({ id: 'plan', cliArg: 'my-plan.md', cwd: CWD, fsImpl });
    assert.equal(r.source, 'cli');
    assert.equal(r.path, '/repo/my-plan.md');
    assert.equal(r.exists, true);
    assert.equal(r.optional, false);
  });

  test('returns cli source even when file does not exist (reports exists=false)', async () => {
    const fsImpl = makeFsStub([]);
    const r = await resolveArtifact({ id: 'plan', cliArg: 'missing.md', cwd: CWD, fsImpl });
    assert.equal(r.source, 'cli');
    assert.equal(r.exists, false);
  });

  test('CLI resolves path relative to cwd, not configDir', async () => {
    const fsImpl = makeFsStub(['/repo/my-plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      cliArg: 'my-plan.md',
      cwd: CWD,
      configDir: CFG_DIR,
      fsImpl,
    });
    assert.equal(r.path, '/repo/my-plan.md');
  });
});

// ---------------------------------------------------------------------------
describe('resolveArtifact — Tier 2: config (string form)', () => {
  test('returns config source when configValue is a string and file exists', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: 'plan.md',
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.source, 'config');
    assert.equal(r.path, '/repo/cfg/plan.md');
    assert.equal(r.exists, true);
    assert.equal(r.optional, false);
  });

  test('config path is resolved relative to configDir', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/sub/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: 'sub/plan.md',
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.path, '/repo/cfg/sub/plan.md');
  });

  test('falls back to cwd when configDir not provided', async () => {
    const fsImpl = makeFsStub(['/repo/plan.md']);
    const r = await resolveArtifact({ id: 'plan', configValue: 'plan.md', cwd: CWD, fsImpl });
    assert.equal(r.path, '/repo/plan.md');
  });
});

// ---------------------------------------------------------------------------
describe('resolveArtifact — Tier 2: config (object form)', () => {
  test('accepts object form with optional:true', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: { path: 'plan.md', optional: true },
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.source, 'config');
    assert.equal(r.optional, true);
  });

  test('accepts object form with optional:false', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: { path: 'plan.md', optional: false },
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.optional, false);
  });

  test('config object reports exists=false when file absent', async () => {
    const fsImpl = makeFsStub([]);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: { path: 'plan.md', optional: true },
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.exists, false);
    assert.equal(r.source, 'config');
  });
});

// ---------------------------------------------------------------------------
describe('resolveArtifact — Tier 3: cwd default', () => {
  test('returns cwd source when default file exists', async () => {
    const fsImpl = makeFsStub(['/repo/plan.md']);
    const r = await resolveArtifact({ id: 'plan', cwd: CWD, fsImpl });
    assert.equal(r.source, 'cwd');
    assert.equal(r.path, '/repo/plan.md');
    assert.equal(r.exists, true);
    assert.equal(r.optional, true);
  });

  test('returns null source when default file does not exist', async () => {
    const fsImpl = makeFsStub([]);
    const r = await resolveArtifact({ id: 'plan', cwd: CWD, fsImpl });
    assert.equal(r.source, null);
    assert.equal(r.path, null);
    assert.equal(r.exists, false);
    assert.equal(r.optional, true);
  });
});

// ---------------------------------------------------------------------------
describe('resolveArtifact — priority order', () => {
  test('CLI wins over config and cwd', async () => {
    const fsImpl = makeFsStub(['/repo/cli.md', '/repo/cfg/cfg.md', '/repo/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      cliArg: 'cli.md',
      configValue: 'cfg/cfg.md',
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.source, 'cli');
    assert.equal(r.path, '/repo/cli.md');
  });

  test('config wins over cwd when CLI not provided', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/cfg-plan.md', '/repo/plan.md']);
    const r = await resolveArtifact({
      id: 'plan',
      configValue: 'cfg-plan.md',
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(r.source, 'config');
    assert.equal(r.path, '/repo/cfg/cfg-plan.md');
  });
});

// ---------------------------------------------------------------------------
describe('resolveAllArtifacts', () => {
  test('returns a record with all 13 known IDs', async () => {
    const fsImpl = makeFsStub([]);
    const result = await resolveAllArtifacts({ cwd: CWD, fsImpl });
    assert.equal(Object.keys(result).length, 13);
    assert.ok('plan' in result);
    assert.ok(!('design' in result));
    assert.ok('typecheck' in result);
    assert.ok('findings-pool' in result);
    assert.ok('tdd-ledger' in result);
  });

  test('mixes CLI + config + cwd across IDs correctly', async () => {
    const fsImpl = makeFsStub(['/repo/my-plan.md', '/repo/cfg/junit.xml', '/repo/todo.md']);
    const result = await resolveAllArtifacts({
      cliArgs: { plan: 'my-plan.md' },
      configArtifacts: { junit: { path: 'junit.xml' } },
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.equal(result.plan.source, 'cli');
    assert.equal(result.junit.source, 'config');
    assert.equal(result.todo.source, 'cwd');
    assert.equal(result.diff.source, null);
  });

  test('explicitly configured unknown artifact IDs are resolved, not dropped (union with .catchall schema)', async () => {
    const fsImpl = makeFsStub(['/repo/cfg/future.md']);
    const result = await resolveAllArtifacts({
      configArtifacts: { 'future-artifact': './future.md' },
      configDir: CFG_DIR,
      cwd: CWD,
      fsImpl,
    });
    assert.ok('future-artifact' in result);
    assert.equal(result['future-artifact'].source, 'config');
    assert.equal(result['future-artifact'].path, '/repo/cfg/future.md');
    assert.equal(result['future-artifact'].exists, true);
  });

  test('explicitly named unknown ID via CLI is resolved (no cwd-default fallback applied)', async () => {
    const fsImpl = makeFsStub([]);
    const result = await resolveAllArtifacts({
      cliArgs: { 'future-artifact': 'future.md' },
      cwd: CWD,
      fsImpl,
    });
    assert.ok('future-artifact' in result);
    assert.equal(result['future-artifact'].source, 'cli');
    assert.equal(result['future-artifact'].exists, false);
  });

  test('unknown ID not named anywhere is absent (no cwd default for it)', async () => {
    const fsImpl = makeFsStub([]);
    const result = await resolveAllArtifacts({ cwd: CWD, fsImpl });
    assert.ok(!('future-artifact' in result));
  });
});
