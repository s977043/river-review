import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  normalizePhase,
  shouldExclude,
  shouldSkipByLabel,
  resolveAvailableContexts,
  resolveAvailableDependencies,
} from '../src/lib/local-runner.mjs';

// ---------------------------------------------------------------------------
// normalizePhase
// ---------------------------------------------------------------------------

describe('normalizePhase', () => {
  test('returns valid phases as-is (lowercase)', () => {
    assert.equal(normalizePhase('upstream'), 'upstream');
    assert.equal(normalizePhase('midstream'), 'midstream');
    assert.equal(normalizePhase('downstream'), 'downstream');
  });

  test('normalizes case', () => {
    assert.equal(normalizePhase('UPSTREAM'), 'upstream');
    assert.equal(normalizePhase('Midstream'), 'midstream');
  });

  test('falls back to midstream for invalid values', () => {
    assert.equal(normalizePhase('invalid'), 'midstream');
    assert.equal(normalizePhase(''), 'midstream');
    assert.equal(normalizePhase(null), 'midstream');
    assert.equal(normalizePhase(undefined), 'midstream');
  });
});

// ---------------------------------------------------------------------------
// shouldExclude
// ---------------------------------------------------------------------------

describe('shouldExclude', () => {
  test('matches glob patterns', () => {
    assert.equal(shouldExclude('docs/README.md', ['docs/**']), true);
    assert.equal(shouldExclude('src/app.js', ['docs/**']), false);
  });

  test('matches exact file name', () => {
    assert.equal(shouldExclude('package-lock.json', ['package-lock.json']), true);
  });

  test('matches dot files', () => {
    assert.equal(shouldExclude('.env', ['.*']), true);
    assert.equal(shouldExclude('.gitignore', ['.git*']), true);
  });

  test('returns false for empty patterns', () => {
    assert.equal(shouldExclude('anything.js', []), false);
    assert.equal(shouldExclude('anything.js'), false);
  });

  test('returns false when no match', () => {
    assert.equal(shouldExclude('src/app.ts', ['*.md', '*.json']), false);
  });
});

// ---------------------------------------------------------------------------
// shouldSkipByLabel
// ---------------------------------------------------------------------------

describe('shouldSkipByLabel', () => {
  test('returns shouldSkip true when label matches pattern', () => {
    const result = shouldSkipByLabel(['skip-review', 'docs'], ['skip-review']);
    assert.equal(result.shouldSkip, true);
    assert.deepEqual(result.matched, ['skip-review']);
  });

  test('matches case-insensitively', () => {
    const result = shouldSkipByLabel(['Skip-Review'], ['skip-review']);
    assert.equal(result.shouldSkip, true);
  });

  test('matches partial patterns (substring)', () => {
    const result = shouldSkipByLabel(['skip-ai-review'], ['skip']);
    assert.equal(result.shouldSkip, true);
  });

  test('returns shouldSkip false when no match', () => {
    const result = shouldSkipByLabel(['enhancement', 'bug'], ['skip-review']);
    assert.equal(result.shouldSkip, false);
    assert.deepEqual(result.matched, []);
  });

  test('returns shouldSkip false for empty labels', () => {
    const result = shouldSkipByLabel([], ['skip-review']);
    assert.equal(result.shouldSkip, false);
  });

  test('returns shouldSkip false for empty patterns', () => {
    const result = shouldSkipByLabel(['skip-review'], []);
    assert.equal(result.shouldSkip, false);
  });
});

// ---------------------------------------------------------------------------
// resolveAvailableContexts
// ---------------------------------------------------------------------------

describe('resolveAvailableContexts', () => {
  // 環境変数の backup/restore
  function withEnv(key, value, fn) {
    const backup = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
      return fn();
    } finally {
      if (backup === undefined) delete process.env[key];
      else process.env[key] = backup;
    }
  }

  test('defaults to [diff] with no input and no env', () => {
    withEnv('RIVER_AVAILABLE_CONTEXTS', undefined, () => {
      const result = resolveAvailableContexts(null);
      assert.deepEqual(result, ['diff']);
    });
  });

  test('uses input contexts when provided', () => {
    withEnv('RIVER_AVAILABLE_CONTEXTS', undefined, () => {
      const result = resolveAvailableContexts(['diff', 'fullFile']);
      assert.deepEqual(result, ['diff', 'fullFile']);
    });
  });

  test('merges env contexts with input', () => {
    withEnv('RIVER_AVAILABLE_CONTEXTS', 'tests,commitMessage', () => {
      const result = resolveAvailableContexts(['diff']);
      assert.ok(result.includes('diff'));
      assert.ok(result.includes('tests'));
      assert.ok(result.includes('commitMessage'));
    });
  });

  test('deduplicates merged contexts', () => {
    withEnv('RIVER_AVAILABLE_CONTEXTS', 'diff,tests', () => {
      const result = resolveAvailableContexts(['diff']);
      assert.equal(result.filter((c) => c === 'diff').length, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveAvailableDependencies
// ---------------------------------------------------------------------------

describe('resolveAvailableDependencies', () => {
  function withEnv(overrides, fn) {
    const keys = Object.keys(overrides);
    const backup = {};
    for (const k of keys) {
      backup[k] = process.env[k];
      if (overrides[k] === undefined) delete process.env[k];
      else process.env[k] = overrides[k];
    }
    try {
      return fn();
    } finally {
      for (const k of keys) {
        if (backup[k] === undefined) delete process.env[k];
        else process.env[k] = backup[k];
      }
    }
  }

  test('returns null with no input and no env (disables dependency skipping)', () => {
    withEnv({ RIVER_AVAILABLE_DEPENDENCIES: undefined, RIVER_DEPENDENCY_STUBS: undefined }, () => {
      const result = resolveAvailableDependencies(null);
      assert.equal(result, null);
    });
  });

  test('uses input dependencies when provided', () => {
    withEnv({ RIVER_AVAILABLE_DEPENDENCIES: undefined, RIVER_DEPENDENCY_STUBS: undefined }, () => {
      const result = resolveAvailableDependencies(['code_search']);
      assert.deepEqual(result, ['code_search']);
    });
  });

  test('uses env dependencies when no input', () => {
    withEnv(
      {
        RIVER_AVAILABLE_DEPENDENCIES: 'code_search,test_runner',
        RIVER_DEPENDENCY_STUBS: undefined,
      },
      () => {
        const result = resolveAvailableDependencies(null);
        assert.ok(result.includes('code_search'));
        assert.ok(result.includes('test_runner'));
      }
    );
  });

  test('returns stub list when RIVER_DEPENDENCY_STUBS is enabled', () => {
    withEnv({ RIVER_AVAILABLE_DEPENDENCIES: undefined, RIVER_DEPENDENCY_STUBS: 'true' }, () => {
      const result = resolveAvailableDependencies(null);
      assert.ok(Array.isArray(result));
      assert.ok(result.length > 0);
      assert.ok(result.includes('code_search'));
    });
  });

  // #1921: the stub list must cover BOTH branches of the schema's
  // $defs.dependency anyOf — the closed enum and the open `^custom:.+`
  // pattern. The pattern branch is represented by the wildcard sentinel
  // `custom:*`; without it, `RIVER_DEPENDENCY_STUBS=1` was the only setting
  // that could make a `custom:`-dependent skill be skipped. Values below are
  // written out literally from schemas/skill.schema.json, not read from the
  // implementation.
  test('stub list covers the full enum branch plus the custom:* wildcard', () => {
    withEnv({ RIVER_AVAILABLE_DEPENDENCIES: undefined, RIVER_DEPENDENCY_STUBS: '1' }, () => {
      const result = resolveAvailableDependencies(null);
      assert.deepEqual(
        [...result].sort(),
        [
          'adr_lookup',
          'code_search',
          'coverage_report',
          'custom:*',
          'repo_metadata',
          'test_runner',
          'tracing',
        ],
        'RIVER_DEPENDENCY_STUBS must advertise every enum value and the custom:* wildcard'
      );
    });
  });

  test('input takes precedence over env', () => {
    withEnv(
      { RIVER_AVAILABLE_DEPENDENCIES: 'code_search', RIVER_DEPENDENCY_STUBS: undefined },
      () => {
        const result = resolveAvailableDependencies(['test_runner']);
        assert.deepEqual(result, ['test_runner']);
      }
    );
  });

  test('deduplicates results', () => {
    withEnv({ RIVER_AVAILABLE_DEPENDENCIES: undefined, RIVER_DEPENDENCY_STUBS: undefined }, () => {
      const result = resolveAvailableDependencies(['code_search', 'code_search']);
      assert.equal(result.length, 1);
    });
  });
});
