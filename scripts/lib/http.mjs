// The one HTTP helper behind `mm gen` and `mm sound find|fetch` (SPEC §8): a retry that is polite to a busy
// service, an idempotency key on every POST, and a sorted account of a refusal that never repeats the body.
// Library only; Node. A fetch function is always handed in, so a test answers from fixtures and waits for nothing.
//
//   resilientFetch(fetch, { retries, sleep, newKey, now })   a fetch that retries a 429 or a 5xx
//   retryDelayMs(headers, n, now)                            how long before the nth retry
//   classifyResponse(status, body)                           'ok' | 'auth' | 'limit' | 'quota' | 'error'
//   describeFailure({ provider, status, body, keyName, what })   { kind, code, message }: one line, no body
//   HttpFailure                                              an Error with .code, .kind and .status, exit 1
//
// Retry: a 429 or a status of 500 or more is tried again, twice at most. The wait is the response's
// Retry-After (seconds, or a date) up to 30 s, else 250 x 2^n ms for the nth retry (500 ms, then 1 s). A fetch
// that throws is not retried: the caller knows whether sending again could cost twice. Every POST carries one
// `Idempotency-Key` header, the same on each retry, so a service that honours it charges once.
// The retry and the refusal classes follow the client of bisque-cloud/presenter (MIT; NOTICE).
import { randomUUID } from 'node:crypto';

export const RETRIES = 2;
export const RETRY_AFTER_MAX_S = 30;
export const BACKOFF_BASE_MS = 250;

/** The failure `mm gen` and `mm sound` print as one line and exit 1 on; `code` is stable, `kind` is auth, limit, quota, server or client. */
export class HttpFailure extends Error {
  constructor(message, { code, kind, status = null } = {}) {
    super(message);
    this.name = 'HttpFailure';
    this.code = code;
    this.kind = kind;
    this.status = status;
    this.exitCode = 1;
  }
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Milliseconds to wait before the nth (1-based) retry: Retry-After up to 30 s, else 250 x 2^n. */
export function retryDelayMs(headers, n, now = Date.now()) {
  const ra = headers?.get?.('retry-after');
  if (ra != null && ra !== '') {
    if (/^\d+(\.\d+)?$/.test(ra.trim())) return Math.min(Number(ra), RETRY_AFTER_MAX_S) * 1000;
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - now, RETRY_AFTER_MAX_S * 1000));
  }
  return BACKOFF_BASE_MS * 2 ** n;
}

/** A fetch that retries a 429 or a 5xx (see the top of the file) and keys every POST. */
export function resilientFetch(fetchFn, { retries = RETRIES, sleep = sleepMs, newKey = randomUUID, now = Date.now } = {}) {
  return async (url, init = {}) => {
    let opts = init;
    if (String(init.method ?? 'GET').toUpperCase() === 'POST') {
      const headers = new Headers(init.headers);
      if (!headers.has('idempotency-key')) headers.set('idempotency-key', newKey());
      opts = { ...init, headers: Object.fromEntries(headers) };
    }
    for (let attempt = 0; ; ) {
      const res = await fetchFn(url, opts);
      if (!(res.status === 429 || res.status >= 500) || attempt >= retries) return res;
      attempt += 1;
      res.body?.cancel().catch(() => {});   // let go of the connection; not awaited (a cancel on a teed body waits for its twin)
      await sleep(retryDelayMs(res.headers, attempt, now()));
    }
  };
}

// Matched against the first words of an error body. A service says "credit balance is too low" on a 400,
// "quota_exceeded" on a 401 or 429, "API key not valid" on a 400, RESOURCE_EXHAUSTED on a 429; a 401 or 403
// needs no text.
const QUOTA_TEXT = /quota_exceeded|insufficient_quota|credit balance is too low|insufficient (?:credits?|funds|balance)|out of credits?|exceeded your (?:current )?quota/i;
const AUTH_TEXT = /api key not valid|api_key_invalid|invalid api key|invalid_api_key|incorrect authentication/i;
const LIMIT_TEXT = /resource_exhausted|rate.?limit|too many requests/i;

/** What one response means: ok (under 400), auth (the key is refused), quota (the account is out), limit (too many requests; wait), or error. */
export function classifyResponse(status, body = '') {
  if (status < 400) return 'ok';
  const text = String(body).slice(0, 2000);
  if (QUOTA_TEXT.test(text)) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 429) return 'limit';
  if (AUTH_TEXT.test(text)) return 'auth';
  if (LIMIT_TEXT.test(text)) return 'limit';
  return 'error';
}

/** The short reason a service gave for a plain failure, from the usual places in a JSON body (160 characters). */
function reasonOf(body) {
  let v = null;
  try { v = JSON.parse(body); } catch { return ''; }
  const m = v?.msg ?? v?.message ?? v?.detail?.message ?? v?.detail ?? v?.error?.message ?? v?.error;
  return typeof m === 'string' ? m.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

/**
 * The line to print for a failed response, with a stable code. A refusal (auth, limit, quota) and a server
 * failure never repeat the body, which can quote the key; a plain failure keeps the service's short reason.
 */
export function describeFailure({ provider, status, body = '', keyName = 'the key', what = null }) {
  const kind = classifyResponse(status, body);
  const again = 'then run the same command again';
  if (kind === 'auth') return { kind: 'auth', code: 'MM_HTTP_AUTH', message: `${provider}: the key was refused (HTTP ${status}). ${keyName} is wrong, expired or revoked: replace it in the environment or in $HOME/.config/motion-machine/keys.env, ${again}` };
  if (kind === 'quota') return { kind: 'quota', code: 'MM_HTTP_QUOTA', message: `${provider}: the account is out of credit or quota (HTTP ${status}); nothing was made. Top it up or wait for the plan to renew, ${again}` };
  if (kind === 'limit') return { kind: 'limit', code: 'MM_HTTP_LIMIT', message: `${provider}: too many requests (HTTP ${status}); the rate limit held after ${RETRIES} retries. Wait a minute, ${again}` };
  if (status >= 500) return { kind: 'server', code: 'MM_HTTP_SERVER', message: `${provider}: the service failed (HTTP ${status}) after ${RETRIES} retries; try again later` };
  const reason = reasonOf(body);
  return { kind: 'client', code: 'MM_HTTP_CLIENT', message: `${provider}: ${what ? `${what} failed (HTTP ${status})` : `HTTP ${status}`}${reason ? `: ${reason}` : ''}` };
}
