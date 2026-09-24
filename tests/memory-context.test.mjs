import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadReviewMemory,
  formatMemoryForPrompt,
  buildReviewEntry,
} from '../src/lib/memory-context.mjs';
import { createTempDir, cleanupTempDir } from './helpers/temp-dir.mjs';
import { makeMemoryEntry as makeEntry, writeMemoryIndex } from './helpers/memory.mjs';

// memory-context.mjs は <repoRoot>/.river/memory/index.json を期待するため、
// createTempDir が作成した既存の一時ディレクトリ直下に nested layout を
// 書き込む必要がある。createTempMemory は新しい一時ディレクトリを作るため、
// ここではディレクトリ作成だけ自前で行い、ファイル書き込みは helper に委譲する。
function writeIndexSync(dir, entries) {
  const memDir = join(dir, '.river', 'memory');
  mkdirSync(memDir, { recursive: true });
  writeMemoryIndex(join(memDir, 'index.json'), entries);
}

test('loadReviewMemory returns empty buckets when index missing', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    const ctx = loadReviewMemory(dir);
    assert.deepEqual(ctx.entries, []);
    assert.deepEqual(ctx.wontfixes, []);
    assert.deepEqual(ctx.patterns, []);
  } finally {
    cleanupTempDir(dir);
  }
});

test('loadReviewMemory buckets entries by type', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    writeIndexSync(dir, [
      makeEntry({ id: 'w1', type: 'wontfix' }),
      makeEntry({ id: 'p1', type: 'pattern' }),
      makeEntry({ id: 'd1', type: 'decision' }),
      makeEntry({ id: 'r1', type: 'review' }),
    ]);
    const ctx = loadReviewMemory(dir);
    assert.equal(ctx.entries.length, 4);
    assert.equal(ctx.wontfixes.length, 1);
    assert.equal(ctx.patterns.length, 1);
    assert.equal(ctx.decisions.length, 1);
    assert.equal(ctx.reviews.length, 1);
    assert.equal(ctx.suppressions.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('loadReviewMemory filters by phase', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    writeIndexSync(dir, [
      makeEntry({
        id: 'u1',
        type: 'pattern',
        metadata: { createdAt: '2026-01-01T00:00:00Z', author: 't', phase: 'upstream' },
      }),
      makeEntry({
        id: 'm1',
        type: 'pattern',
        metadata: { createdAt: '2026-01-01T00:00:00Z', author: 't', phase: 'midstream' },
      }),
    ]);
    const ctx = loadReviewMemory(dir, { phase: 'midstream' });
    assert.equal(ctx.entries.length, 1);
    assert.equal(ctx.entries[0].id, 'm1');
  } finally {
    cleanupTempDir(dir);
  }
});

test('loadReviewMemory keeps a phase-less suppression in every phase (#2418)', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    const meta = (extra = {}) => ({ createdAt: '2026-01-01T00:00:00Z', author: 't', ...extra });
    writeIndexSync(dir, [
      makeEntry({ id: 's-none', type: 'suppression', metadata: meta() }),
      makeEntry({ id: 's-up', type: 'suppression', metadata: meta({ phase: 'upstream' }) }),
      makeEntry({ id: 's-mid', type: 'suppression', metadata: meta({ phase: 'midstream' }) }),
      makeEntry({ id: 'p-none', type: 'pattern', metadata: meta() }),
      makeEntry({ id: 'w-none', type: 'wontfix', metadata: meta() }),
      makeEntry({ id: 's-null', type: 'suppression', metadata: meta({ phase: null }) }),
      makeEntry({ id: 's-empty', type: 'suppression', metadata: meta({ phase: '' }) }),
    ]);
    for (const phase of ['upstream', 'midstream', 'downstream']) {
      const ctx = loadReviewMemory(dir, { phase });
      const ids = ctx.entries.map((e) => e.id);
      assert.ok(ids.includes('s-none'), phase + ': phase-less suppression must load');
      assert.equal(ids.includes('s-up'), phase === 'upstream', phase + ': s-up');
      assert.equal(ids.includes('s-mid'), phase === 'midstream', phase + ': s-mid');
      assert.equal(ids.includes('p-none'), false, phase + ': phase-less pattern stays excluded');
      assert.equal(ids.includes('w-none'), false, phase + ': phase-less wontfix stays excluded');
      assert.equal(ids.includes('s-null'), false, phase + ': phase null is not phase-less');
      assert.equal(ids.includes('s-empty'), false, phase + ": phase '' is not phase-less");
      assert.ok(ctx.suppressions.some((e) => e.id === 's-none'));
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test('loadReviewMemory filters by relatedFiles overlap', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    writeIndexSync(dir, [
      makeEntry({
        id: 'a1',
        type: 'wontfix',
        metadata: {
          createdAt: '2026-01-01T00:00:00Z',
          author: 't',
          relatedFiles: ['src/auth.ts'],
        },
      }),
      makeEntry({
        id: 'b1',
        type: 'wontfix',
        metadata: {
          createdAt: '2026-01-01T00:00:00Z',
          author: 't',
          relatedFiles: ['src/billing.ts'],
        },
      }),
    ]);
    const ctx = loadReviewMemory(dir, { changedFiles: ['src/auth.ts'] });
    assert.equal(ctx.wontfixes.length, 1);
    assert.equal(ctx.wontfixes[0].id, 'a1');
  } finally {
    cleanupTempDir(dir);
  }
});

test('loadReviewMemory includes entries without relatedFiles', () => {
  const dir = createTempDir({ prefix: 'river-mem-ctx-' });
  try {
    writeIndexSync(dir, [
      makeEntry({
        id: 'nr1',
        type: 'pattern',
        metadata: { createdAt: '2026-01-01T00:00:00Z', author: 't' },
      }),
      makeEntry({
        id: 'r1',
        type: 'pattern',
        metadata: {
          createdAt: '2026-01-01T00:00:00Z',
          author: 't',
          relatedFiles: ['unrelated.ts'],
        },
      }),
    ]);
    const ctx = loadReviewMemory(dir, { changedFiles: ['src/app.ts'] });
    assert.equal(ctx.patterns.length, 1);
    assert.equal(ctx.patterns[0].id, 'nr1');
  } finally {
    cleanupTempDir(dir);
  }
});

test('formatMemoryForPrompt returns empty string for empty context', () => {
  assert.equal(
    formatMemoryForPrompt({
      entries: [],
      wontfixes: [],
      patterns: [],
      decisions: [],
      reviews: [],
      suppressions: [],
    }),
    ''
  );
});

test('formatMemoryForPrompt returns empty string for null', () => {
  assert.equal(formatMemoryForPrompt(null), '');
});

test('formatMemoryForPrompt formats wontfix entries', () => {
  const text = formatMemoryForPrompt({
    wontfixes: [{ id: 'wf1', title: 'Accepted logging', content: '' }],
    patterns: [],
    decisions: [],
  });
  assert.ok(text.includes('受け入れ済み'));
  assert.ok(text.includes('wf1'));
});

test('formatMemoryForPrompt formats pattern entries', () => {
  const text = formatMemoryForPrompt({
    wontfixes: [],
    patterns: [{ id: 'p1', title: 'Use pure functions', content: '' }],
    decisions: [],
  });
  assert.ok(text.includes('チーム規約'));
  assert.ok(text.includes('Use pure functions'));
});

test('formatMemoryForPrompt truncates to maxChars', () => {
  const ctx = {
    wontfixes: Array.from({ length: 50 }, (_, i) => ({
      id: 'wf' + i,
      title: 'Long entry ' + i + ' padding text here',
      content: '',
    })),
    patterns: [],
    decisions: [],
  };
  const text = formatMemoryForPrompt(ctx, { maxChars: 200 });
  assert.ok(text.length <= 215);
  assert.ok(text.includes('[truncated]'));
});

test('buildReviewEntry returns valid entry structure', () => {
  const entry = buildReviewEntry(
    { comments: [{ file: 'a.ts', line: 1, message: 'test' }] },
    { phase: 'midstream', changedFiles: ['a.ts'], commit: 'abc123' }
  );
  assert.equal(entry.type, 'review');
  assert.ok(entry.id.startsWith('review-abc123-'));
  assert.equal(entry.metadata.author, 'river-review');
  assert.equal(entry.metadata.phase, 'midstream');
  assert.deepEqual(entry.metadata.relatedFiles, ['a.ts']);
});

test('buildReviewEntry uses unknown when no commit', () => {
  const entry = buildReviewEntry({ comments: [] }, {});
  assert.ok(entry.id.startsWith('review-unknown-'));
});
