/**
 * Source-matched, non-authoritative PlanGate question projection.
 *
 * This validates local PlanGate input bytes independently. It never grants
 * approval, authenticates a reviewer, writes a file, or changes a River verdict.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BRAND = Symbol('river-review/source-matched-plan-feedback');
const STATES = new Set(['answered', 'deferred', 'unanswered']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SHA = /^[0-9a-f]{64}$/;
const TASK = /^TASK-[0-9]{4}$/;

function exact(obj, fields, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('invalid ' + label + ' object');
  }
  const keys = Object.keys(obj).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...fields].sort())) {
    throw new Error('invalid ' + label + ' fields');
  }
  return obj;
}

function readRegular(file, maximum) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) {
    throw new Error('invalid, symlinked or oversized local file: ' + path.basename(file));
  }
  const bytes = readFileSync(file);
  if (bytes.length > maximum) throw new Error('oversized input');
  return bytes;
}

function parseStrict(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // JSON.parse alone accepts duplicate keys. Reject them at every nesting level.
  const stack = [];
  let start = -1;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (start >= 0) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c !== '"') continue;
      const token = JSON.parse(source.slice(start, i + 1));
      let next = i + 1;
      while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      const frame = stack[stack.length - 1];
      if (source[next] === ':' && frame?.type === 'object') {
        if (frame.keys.has(token)) throw new Error('duplicate JSON property');
        frame.keys.add(token);
      }
      start = -1;
    } else if (c === '"') start = i;
    else if (c === '{') stack.push({ type: 'object', keys: new Set() });
    else if (c === '[') stack.push({ type: 'array' });
    else if (c === '}' || c === ']') stack.pop();
  }
  return JSON.parse(source);
}

function validText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function sourceDigest(source, name, filename, bytes) {
  const item = exact(source, ['path', 'sha256'], 'source ' + name);
  if (item.path !== filename || typeof item.sha256 !== 'string' || !SHA.test(item.sha256)) {
    throw new Error('invalid source reference: ' + name);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    throw new Error('STALE plan feedback source: ' + name);
  }
}

/** Return an opaque, source-checked display-only model. */
export function loadPlanFeedbackProjection({ workDir, feedbackPath, taskId }) {
  if (!validText(workDir, 2048) || !validText(feedbackPath, 2048) ||
      typeof taskId !== 'string' || !TASK.test(taskId)) {
    throw new Error('explicit task ID, workDir and feedbackPath required');
  }
  const work = path.resolve(workDir);
  if (!lstatSync(work).isDirectory() || lstatSync(work).isSymbolicLink()) {
    throw new Error('workDir must be a real directory');
  }
  const plan = readRegular(path.join(work, 'plan.md'), 10 * 1024 * 1024);
  const rawQuestions = readRegular(path.join(work, 'review-questions.json'), 128 * 1024);
  const rawFeedback = readRegular(path.resolve(feedbackPath), 512 * 1024);
  const questionsDoc = exact(parseStrict(rawQuestions), ['version', 'questions'], 'questions');
  if (questionsDoc.version !== 1 || !Number.isInteger(questionsDoc.version) ||
      !Array.isArray(questionsDoc.questions) || questionsDoc.questions.length === 0 ||
      questionsDoc.questions.length > 50) throw new Error('unsupported questions schema');
  const definitions = new Map();
  for (const q of questionsDoc.questions) {
    if (!q || typeof q !== 'object' || Array.isArray(q) ||
        Object.keys(q).some(key => !['id', 'prompt', 'choices', 'artifactRefs'].includes(key)) ||
        typeof q.id !== 'string' || !ID.test(q.id) ||
        !validText(q.prompt, 1200) || definitions.has(q.id)) {
      throw new Error('invalid or duplicate question definition');
    }
    for (const [field, maxCount, maxLength] of [
      ['choices', 12, 300], ['artifactRefs', 10, 250],
    ]) {
      const list = q[field] ?? [];
      if (!Array.isArray(list) || list.length > maxCount ||
          list.some(x => !validText(x, maxLength)) || new Set(list).size !== list.length) {
        throw new Error('invalid question ' + field);
      }
    }
    definitions.set(q.id, q);
  }
  const feedback = exact(parseStrict(rawFeedback), [
    'schemaVersion', 'kind', 'taskId', 'source', 'feedback_only',
    'approval_granted', 'generatedAt', 'answers',
  ], 'feedback');
  if (feedback.schemaVersion !== 1 || !Number.isInteger(feedback.schemaVersion) ||
      feedback.kind !== 'plan-review-feedback' || feedback.taskId !== taskId ||
      feedback.feedback_only !== true || feedback.approval_granted !== false ||
      typeof feedback.generatedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(feedback.generatedAt) ||
      !feedback.generatedAt.endsWith('Z') ||
      !Number.isFinite(Date.parse(feedback.generatedAt))) {
    throw new Error('unsupported or authoritative feedback envelope');
  }
  const sources = exact(feedback.source, ['plan', 'questions'], 'source');
  sourceDigest(sources.plan, 'plan', 'plan.md', plan);
  sourceDigest(sources.questions, 'questions', 'review-questions.json', rawQuestions);
  if (!Array.isArray(feedback.answers) || feedback.answers.length !== definitions.size) {
    throw new Error('mismatched answer count');
  }
  const answerById = new Map();
  for (const a of feedback.answers) {
    exact(a, ['questionId', 'status', 'response', 'note'], 'answer');
    if (!definitions.has(a.questionId) || answerById.has(a.questionId) ||
        !STATES.has(a.status) || typeof a.response !== 'string' ||
        a.response.length > 4000 || typeof a.note !== 'string' || a.note.length > 4000) {
      throw new Error('invalid answer / unknown or duplicate question');
    }
    const choices = definitions.get(a.questionId).choices ?? [];
    if (a.status === 'answered' &&
        (!a.response.trim() || (choices.length && !choices.includes(a.response)))) {
      throw new Error('invalid answered state');
    }
    if (a.status === 'deferred' && (a.response || !a.note.trim())) {
      throw new Error('invalid deferred state');
    }
    if (a.status === 'unanswered' && (a.response || a.note)) {
      throw new Error('invalid unanswered state');
    }
    answerById.set(a.questionId, a);
  }
  const items = [...definitions.values()].map(q => {
    const answer = answerById.get(q.id);
    return Object.freeze({
      id: q.id, prompt: q.prompt, status: answer.status,
      response: answer.response, note: answer.note,
      artifactRefs: Object.freeze([...(q.artifactRefs ?? [])]),
    });
  });
  return Object.freeze({
    [BRAND]: true, kind: 'SOURCE_MATCHED_REVIEW_FEEDBACK',
    taskId, planSha256: sources.plan.sha256, questionsSha256: sources.questions.sha256,
    items: Object.freeze(items),
    // A digest cannot establish reviewer identity or grant authorization.
    approvalGranted: false,
  });
}

export function isSourceMatchedPlanFeedback(value) {
  return value?.[BRAND] === true && value.kind === 'SOURCE_MATCHED_REVIEW_FEEDBACK';
}
