import path from 'node:path';
import { loadMemory, queryMemory } from './riverbed-memory.mjs';

const DEFAULT_MEMORY_PATH = path.join('.river', 'memory', 'index.json');

export function loadReviewMemory(repoRoot, { phase, changedFiles } = {}) {
  const indexPath = path.resolve(repoRoot, DEFAULT_MEMORY_PATH);
  const index = loadMemory(indexPath);
  // includeInactive: true keeps the phase and no-phase branches symmetric and
  // preserves pre-lifecycle semantics where historical entries were surfaced.
  //
  // A suppression without metadata.phase applies to every phase (#2418):
  // `river suppression add` (createSuppression) writes no phase, so a strict
  // phase match would drop every such suppression before applySuppressions
  // sees it. Only that shape is let through here — a suppression naming a
  // different phase, and any non-suppression entry without a phase, are still
  // excluded. queryMemory is left unchanged because regression-eval.mjs relies
  // on its strict phase semantics.
  //
  // What happens after loading (suppression-apply.mjs): applySuppressions
  // judges expiry (isSuppressionExpired) and, when opted in, the rules digest.
  // Entry `status` (superseded / archived) is deliberately not filtered, like
  // findActiveSuppressions (includeInactive: true). `context.active === false`
  // and revocation via `resurface` entries are NOT evaluated by
  // applySuppressions — a pre-existing limitation that phase-less suppressions
  // now share as well (#2425).
  const allEntries = phase ? filterByPhase(index, phase) : (index.entries ?? []);
  const relevant = changedFiles?.length
    ? allEntries.filter((e) => {
        const related = e.metadata?.relatedFiles ?? [];
        if (!related.length) return true;
        return related.some((r) => changedFiles.includes(r));
      })
    : allEntries;
  const buckets = { wontfixes: [], patterns: [], decisions: [], reviews: [], suppressions: [] };
  const typeMap = {
    wontfix: 'wontfixes',
    pattern: 'patterns',
    decision: 'decisions',
    review: 'reviews',
    suppression: 'suppressions',
  };
  for (const e of relevant) {
    const bucket = typeMap[e.type];
    if (bucket) buckets[bucket].push(e);
  }
  return { entries: relevant, ...buckets };
}

function isPhaselessSuppression(entry) {
  return entry.type === 'suppression' && entry.metadata?.phase === undefined;
}

function filterByPhase(index, phase) {
  const inPhase = new Set(queryMemory(index, { phase, includeInactive: true }));
  return (index.entries ?? []).filter((e) => inPhase.has(e) || isPhaselessSuppression(e));
}

export function formatMemoryForPrompt(memoryContext, { maxChars = 1500 } = {}) {
  if (!memoryContext) return '';
  const { wontfixes, patterns, decisions } = memoryContext;
  const sections = [];
  if (wontfixes?.length) {
    sections.push('以下の指摘は明示的に受け入れ済みです。再指摘は不要です:');
    for (const w of wontfixes)
      sections.push('- [' + w.id + '] ' + (w.title || w.content?.slice(0, 80)));
  }
  if (patterns?.length) {
    sections.push('以下はチーム規約として記録されています:');
    for (const p of patterns) sections.push('- ' + (p.title || p.content?.slice(0, 80)));
  }
  if (decisions?.length) {
    sections.push('以下の設計判断が記録されています:');
    for (const d of decisions) sections.push('- ' + (d.title || d.content?.slice(0, 80)));
  }
  if (!sections.length) return '';
  const text = '\n### Memory Context (previous review decisions)\n\n' + sections.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) + '\n...[truncated]' : text;
}

export function buildReviewEntry(reviewResult, { phase, changedFiles, commit } = {}) {
  const timestamp = new Date().toISOString();
  const id = 'review-' + (commit || 'unknown') + '-' + Date.now();
  const commentCount = reviewResult.comments?.length ?? 0;
  const summary = commentCount + ' findings in ' + (phase || 'midstream') + ' phase';
  return {
    id,
    type: 'review',
    title: 'Review: ' + summary,
    content: JSON.stringify({ commentCount, phase, changedFiles: changedFiles?.slice(0, 20) }),
    metadata: {
      createdAt: timestamp,
      author: 'river-review',
      ...(phase ? { phase } : {}),
      tags: ['review', 'automated'],
      relatedFiles: changedFiles?.slice(0, 50) ?? [],
      summary,
    },
  };
}
