// Unified LLM call pipeline (#1338).
//
// Consolidates the two raw chat-completion implementations that had drifted
// apart — review-engine.mjs (retry + Retry-After + timeout) and
// openai-planner.mjs (timeout only, no retry) — into one module. The retry
// policy helpers were moved verbatim from review-engine.mjs (originally
// #1196-adjacent adoption from the Gemma concurrent demo) and are re-exported
// there for backward compatibility.
//
// Scope note: reviewer-orchestrator.mjs and local-runner.mjs (named in the
// original issue) already route all LLM access through generateReview(), so
// they needed no changes. The multi-provider AIClientFactory (src/ai/
// factory.mjs, used by skill-dispatcher) keeps its own provider-specific
// retry layer and is out of scope here, as is the standalone
// callOpenAICompatible in runners/node-api/src/index.ts (separate runner
// package with its own build).

const LLM_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const LLM_MAX_ATTEMPTS = 3; // 1 try + 2 retries
const LLM_RETRY_BASE_MS = 500;
const LLM_TIMEOUT_MS = 15000;
// Cap Retry-After-driven waits so a pathological header (e.g. 3600s) cannot
// stall the pipeline. Mirrors MAX_RETRY_DELAY_MS in src/ai/factory.mjs.
export const LLM_MAX_BACKOFF_MS = 30_000;

/** Retryable HTTP statuses: rate-limit and transient server/gateway errors. */
export function isRetryableStatus(status) {
  return LLM_RETRYABLE_STATUS.has(status);
}

/** Network-level errors worth retrying: timeouts, aborts, connection resets, DNS. */
export function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const msg = `${err.code ?? ''} ${err.message ?? ''}`;
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|terminated|aborted/i.test(
    msg
  );
}

/**
 * Backoff before the next attempt (ms). Honors a `Retry-After` header (seconds)
 * when present, else exponential: base * 2^(attempt-1).
 * @param {number} attempt - 1-based attempt that just failed.
 */
export function computeBackoffMs(
  attempt,
  { baseMs = LLM_RETRY_BASE_MS, retryAfterSec = null } = {}
) {
  // Guard before Number(): Number(null) and Number('') are 0, which would wrongly
  // be treated as "Retry-After: 0s" when the header is simply absent.
  if (retryAfterSec !== null && retryAfterSec !== undefined && retryAfterSec !== '') {
    const ra = Number(retryAfterSec);
    if (Number.isFinite(ra) && ra >= 0) return Math.min(Math.round(ra * 1000), LLM_MAX_BACKOFF_MS);
  }
  return Math.min(baseMs * 2 ** Math.max(0, attempt - 1), LLM_MAX_BACKOFF_MS);
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function sleep(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function attemptSignal(timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

/**
 * Call an OpenAI-compatible chat-completion endpoint with timeout and
 * transient-failure retry. Returns the assistant message text ('' when the
 * response has no content).
 *
 * Behavior is identical to the former review-engine.mjs `callOpenAI`;
 * `timeoutMs` and `maxAttempts` are parameterized so the planner can keep its
 * historical single-attempt behavior (`maxAttempts: 1`).
 *
 * @param {object} params
 * @param {string} params.prompt          User message content.
 * @param {string} params.systemMessage   System message content (caller resolves defaults).
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.endpoint
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @param {number} [params.timeoutMs]     Per-attempt timeout (default 15000).
 * @param {number} [params.maxAttempts]   Total attempts incl. first (default 3).
 * @param {AbortSignal} [params.signal]    Host cancellation signal. External aborts are never retried.
 * @param {typeof fetch} [params.fetchImpl] Injectable transport for tests (#1357).
 * @param {number} [params.baseMs]        Retry backoff base ms (injectable for tests).
 * @returns {Promise<string>}
 */
export async function callChatCompletion({
  prompt,
  systemMessage,
  apiKey,
  model,
  endpoint,
  temperature,
  maxTokens,
  timeoutMs = LLM_TIMEOUT_MS,
  maxAttempts = LLM_MAX_ATTEMPTS,
  signal,
  fetchImpl = globalThis.fetch,
  baseMs = LLM_RETRY_BASE_MS,
}) {
  const body = JSON.stringify({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ],
  });

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfAborted(signal);
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        signal: attemptSignal(timeoutMs, signal), // fresh timeout + host cancellation per attempt
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
      });

      // Body reads are inside the try so a mid-stream abort/disconnect is also
      // treated as a retryable transient failure rather than escaping uncaught.
      if (res.ok) {
        const json = await res.json();
        return json.choices?.[0]?.message?.content?.trim() ?? '';
      }

      const detail = await res.text();
      if (attempt < maxAttempts && isRetryableStatus(res.status)) {
        await sleep(
          computeBackoffMs(attempt, { baseMs, retryAfterSec: res.headers?.get?.('retry-after') }),
          signal
        );
        continue;
      }
      throw new Error(`OpenAI API error ${res.status}: ${detail}`);
    } catch (err) {
      // Network error, timeout, or body-read failure — retry transient cases.
      // A non-retryable HTTP error (thrown above) has a non-network message, so
      // isRetryableNetworkError returns false and it propagates immediately.
      lastError = err;
      // A host cancellation is a terminal control signal, not a transient
      // provider/network failure. Do not spend retry budget after the caller
      // has explicitly ended the review task.
      if (signal?.aborted) throw abortError(signal);
      if (attempt < maxAttempts && isRetryableNetworkError(err)) {
        await sleep(computeBackoffMs(attempt, { baseMs }), signal);
        continue;
      }
      throw err;
    }
  }
  // Not dead code: the loop always returns or throws when maxAttempts >= 1,
  // but this guards the degenerate maxAttempts < 1 case (loop body never runs).
  throw lastError ?? new Error('OpenAI API error: retries exhausted');
}
