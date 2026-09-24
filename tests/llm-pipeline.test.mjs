/**
 * Tests for the unified LLM call pipeline (#1338).
 *
 * The pure retry-policy helpers keep their original coverage in
 * review-engine-retry.test.mjs (importing via the review-engine re-export,
 * which doubles as a backward-compatibility check). This file covers the
 * callChatCompletion transport: retry-on-429, single-attempt mode (planner
 * behavior), and non-retryable failures — all against a stubbed global fetch.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  callChatCompletion,
  computeBackoffMs,
  LLM_MAX_BACKOFF_MS,
} from '../src/lib/llm-pipeline.mjs';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function okResponse(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function errorResponse(status, { retryAfter = '0' } = {}) {
  return {
    ok: false,
    status,
    text: async () => `error body ${status}`,
    headers: { get: (name) => (name === 'retry-after' ? retryAfter : null) },
  };
}

const baseParams = {
  prompt: 'user prompt',
  systemMessage: 'system message',
  apiKey: 'test-key',
  model: 'test-model',
  endpoint: 'https://example.invalid/v1/chat/completions',
};

describe('computeBackoffMs cap', () => {
  test('caps pathological Retry-After values at LLM_MAX_BACKOFF_MS', () => {
    assert.equal(computeBackoffMs(1, { retryAfterSec: '3600' }), LLM_MAX_BACKOFF_MS);
  });

  test('caps exponential backoff at LLM_MAX_BACKOFF_MS', () => {
    assert.equal(computeBackoffMs(20, { baseMs: 500 }), LLM_MAX_BACKOFF_MS);
  });
});

describe('callChatCompletion', () => {
  test('returns trimmed assistant content on success', async () => {
    global.fetch = async () => okResponse('  hello  ');
    assert.equal(await callChatCompletion(baseParams), 'hello');
  });

  test('returns empty string when response has no content', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [] }) });
    assert.equal(await callChatCompletion(baseParams), '');
  });

  test('sends system and user messages with model params', async () => {
    let captured;
    global.fetch = async (url, init) => {
      captured = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
      return okResponse('ok');
    };
    await callChatCompletion({ ...baseParams, temperature: 0, maxTokens: 600 });
    assert.equal(captured.url, baseParams.endpoint);
    assert.equal(captured.auth, 'Bearer test-key');
    assert.equal(captured.body.model, 'test-model');
    assert.equal(captured.body.temperature, 0);
    assert.equal(captured.body.max_tokens, 600);
    assert.deepEqual(
      captured.body.messages.map((m) => m.role),
      ['system', 'user']
    );
    assert.equal(captured.body.messages[0].content, 'system message');
  });

  test('rejects HTTP 200 with a plain OK body instead of treating it as a completion', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => JSON.parse('OK\\r\\n'),
      };
    };

    await assert.rejects(() => callChatCompletion(baseParams), /Unexpected token/);
    assert.equal(calls, 1, 'response-envelope syntax errors are not transient retries');
  });

  test('rejects HTTP 200 with malformed JSON response body', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => JSON.parse('{ malformed'),
      };
    };

    await assert.rejects(() => callChatCompletion(baseParams), /JSON|Unexpected/);
    assert.equal(calls, 1);
  });

  test('retries a 429 and succeeds on the next attempt', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return calls === 1 ? errorResponse(429) : okResponse('recovered');
    };
    assert.equal(await callChatCompletion(baseParams), 'recovered');
    assert.equal(calls, 2);
  });

  test('throws after exhausting retries on persistent 503', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return errorResponse(503);
    };
    await assert.rejects(
      () => callChatCompletion({ ...baseParams, maxAttempts: 3 }),
      /OpenAI API error 503/
    );
    assert.equal(calls, 3, 'all attempts consumed');
  });

  test('does not retry non-retryable client errors', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return errorResponse(400);
    };
    await assert.rejects(() => callChatCompletion(baseParams), /OpenAI API error 400/);
    assert.equal(calls, 1, '4xx (non-429) must not retry');
  });

  test('maxAttempts: 1 preserves planner single-attempt behavior', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return errorResponse(429);
    };
    await assert.rejects(
      () => callChatCompletion({ ...baseParams, maxAttempts: 1 }),
      /OpenAI API error 429/
    );
    assert.equal(calls, 1, 'no retry when maxAttempts is 1');
  });

  test('propagates network errors without retry when maxAttempts is 1', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      const err = new Error('fetch failed');
      throw err;
    };
    await assert.rejects(() => callChatCompletion({ ...baseParams, maxAttempts: 1 }), {
      message: 'fetch failed',
    });
    assert.equal(calls, 1);
  });
});

describe('callChatCompletion — network-error retry path (#1357)', () => {
  test('recovers when a transient network error is followed by success', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error('fetch failed');
      return okResponse('recovered');
    };
    const result = await callChatCompletion({ ...baseParams, fetchImpl, baseMs: 1 });
    assert.equal(result, 'recovered');
    assert.equal(calls, 2, 'network error must be retried');
  });

  test('classifies TimeoutError as retryable', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('operation timed out');
        err.name = 'TimeoutError';
        throw err;
      }
      return okResponse('after-timeout');
    };
    assert.equal(
      await callChatCompletion({ ...baseParams, fetchImpl, baseMs: 1 }),
      'after-timeout'
    );
    assert.equal(calls, 2);
  });

  test('treats a mid-body json() failure as retryable (terminated stream)', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          json: async () => {
            throw new Error('terminated');
          },
        };
      }
      return okResponse('after-body-fail');
    };
    assert.equal(
      await callChatCompletion({ ...baseParams, fetchImpl, baseMs: 1 }),
      'after-body-fail'
    );
    assert.equal(calls, 2);
  });
});
