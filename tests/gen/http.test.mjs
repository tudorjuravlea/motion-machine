// scripts/lib/http.mjs: the one HTTP helper behind `mm gen` and `mm sound find|fetch` (SPEC §8). It retries a
// 429 or a 5xx twice, honouring Retry-After up to 30 s and otherwise backing off 250 x 2^n ms; it gives every
// paid POST one idempotency key (the same on each retry); it sorts a refusal into auth, limit or quota from the
// status and the first words of the body, and never puts the body in a message. Every test answers from fixtures
// and a fake sleep: nothing here reaches the network or waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BACKOFF_BASE_MS, HttpFailure, RETRIES, RETRY_AFTER_MAX_S, classifyResponse, describeFailure, resilientFetch, retryDelayMs } from '../../scripts/lib/http.mjs';
import { KEYS, MP3, bytes, json, makePiece, router, at, runGen } from './_harness.mjs';

const res = (status, headers = {}, body = '') => new Response(body, { status, headers });
/** A fetch answering from a list, in order, recording what it was asked. */
const sequence = (...answers) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url: String(url), init }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; return typeof a === 'function' ? a() : a.clone(); };
  return { fetch, calls };
};
const sleeper = () => { const slept = []; return { slept, sleep: async (ms) => { slept.push(ms); } }; };

test('the constants: two retries, Retry-After up to 30 s, backoff from 250 ms', () => {
  assert.equal(RETRIES, 2);
  assert.equal(RETRY_AFTER_MAX_S, 30);
  assert.equal(BACKOFF_BASE_MS, 250);
});

test('retryDelayMs: Retry-After in seconds or as a date, capped at 30 s; otherwise 250 x 2^n for the nth retry', () => {
  const now = Date.parse('2026-11-01T10:00:00Z');
  assert.equal(retryDelayMs(new Headers({ 'retry-after': '2' }), 1, now), 2000);
  assert.equal(retryDelayMs(new Headers({ 'retry-after': '0' }), 1, now), 0);
  assert.equal(retryDelayMs(new Headers({ 'retry-after': '120' }), 1, now), 30000, 'capped');
  assert.equal(retryDelayMs(new Headers({ 'retry-after': 'Sun, 01 Nov 2026 10:00:07 GMT' }), 1, now), 7000);
  assert.equal(retryDelayMs(new Headers({ 'retry-after': 'Sun, 01 Nov 2026 09:00:00 GMT' }), 1, now), 0, 'a date in the past is now');
  assert.equal(retryDelayMs(new Headers(), 1, now), 500);
  assert.equal(retryDelayMs(new Headers(), 2, now), 1000);
  assert.equal(retryDelayMs(new Headers({ 'retry-after': 'soon' }), 1, now), 500, 'unreadable: back off');
});

test('a 429 then a 200 is one success, after one wait', async () => {
  const { fetch, calls } = sequence(res(429, { 'retry-after': '3' }), res(200, {}, 'fine'));
  const { slept, sleep } = sleeper();
  const r = await resilientFetch(fetch, { sleep })('https://api.example/x', { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'fine');
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [3000]);
});

test('a 503 forever is tried three times in all, backing off 500 then 1000 ms, and the last answer is handed back', async () => {
  const { fetch, calls } = sequence(res(503, {}, 'down'));
  const { slept, sleep } = sleeper();
  const r = await resilientFetch(fetch, { sleep })('https://api.example/x', { method: 'GET' });
  assert.equal(r.status, 503);
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [500, 1000]);
});

test('a 404, a 400 and a 401 are not retried', async () => {
  for (const status of [400, 401, 402, 404]) {
    const { fetch, calls } = sequence(res(status));
    const { slept, sleep } = sleeper();
    assert.equal((await resilientFetch(fetch, { sleep })('https://api.example/x', {})).status, status);
    assert.equal(calls.length, 1, `${status}`);
    assert.deepEqual(slept, []);
  }
});

test('a fetch that throws is not retried: the caller sees the error', async () => {
  const { slept, sleep } = sleeper();
  const f = resilientFetch(async () => { throw new TypeError('fetch failed'); }, { sleep });
  await assert.rejects(() => f('https://api.example/x', {}), /fetch failed/);
  assert.deepEqual(slept, []);
});

test('every POST carries one Idempotency-Key, the same on each retry, different on the next call; a GET carries none; a caller\'s own stays', async () => {
  const { fetch, calls } = sequence(res(500), res(500), res(200));
  const { sleep } = sleeper();
  const f = resilientFetch(fetch, { sleep });
  await f('https://api.example/pay', { method: 'POST', body: '{}' });
  const keys = calls.map((c) => new Headers(c.init.headers).get('idempotency-key'));
  assert.equal(keys.length, 3);
  assert.ok(keys[0] && keys.every((k) => k === keys[0]), 'one key across the retries');
  const next = sequence(res(200));
  await resilientFetch(next.fetch, { sleep })('https://api.example/pay', { method: 'POST' });
  assert.notEqual(new Headers(next.calls[0].init.headers).get('idempotency-key'), keys[0]);
  const get = sequence(res(200));
  await resilientFetch(get.fetch, { sleep })('https://api.example/x', { method: 'GET' });
  assert.equal(new Headers(get.calls[0].init?.headers ?? {}).get('idempotency-key'), null);
  const own = sequence(res(200));
  await resilientFetch(own.fetch, { sleep })('https://api.example/pay', { method: 'POST', headers: { 'Idempotency-Key': 'mine-1' } });
  assert.equal(new Headers(own.calls[0].init.headers).get('idempotency-key'), 'mine-1');
});

test('the idempotency key is a function of the injected id source (a test, or a replay, can fix it)', async () => {
  const { fetch, calls } = sequence(res(200));
  await resilientFetch(fetch, { sleep: async () => {}, newKey: () => 'key-fixed' })('https://api.example/pay', { method: 'POST' });
  assert.equal(new Headers(calls[0].init.headers).get('idempotency-key'), 'key-fixed');
});

// ---- the refusal classifier ----

test('classifyResponse: auth, limit and quota from the status and the first words of the body; ok and error otherwise', () => {
  assert.equal(classifyResponse(200), 'ok');
  assert.equal(classifyResponse(401), 'auth');
  assert.equal(classifyResponse(403), 'auth');
  assert.equal(classifyResponse(429), 'limit');
  assert.equal(classifyResponse(402), 'quota');
  assert.equal(classifyResponse(429, '{"detail":{"status":"quota_exceeded"}}'), 'quota', 'a 429 that says the quota is spent');
  assert.equal(classifyResponse(401, '{"detail":{"status":"quota_exceeded","message":"You have 0 credits"}}'), 'quota');
  assert.equal(classifyResponse(400, '{"error":{"message":"Your credit balance is too low"}}'), 'quota');
  assert.equal(classifyResponse(429, '{"error":{"code":"insufficient_quota"}}'), 'quota');
  assert.equal(classifyResponse(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}'), 'auth');
  assert.equal(classifyResponse(400, '{"error":{"message":"api_key_invalid"}}'), 'auth');
  assert.equal(classifyResponse(400, '{"error":"RESOURCE_EXHAUSTED"}'), 'limit');
  assert.equal(classifyResponse(500), 'error');
  assert.equal(classifyResponse(404, 'nothing here'), 'error');
});

test('describeFailure: a stable code and a line that says what to do, never the body', () => {
  const secret = ['sk', 'fixture', 'secret', 'body', 'text'].join('-');   // built: no literal reads as a key
  const body = JSON.stringify({ detail: `bad key ${secret}` });
  const auth = describeFailure({ provider: 'elevenlabs', status: 401, body, keyName: 'ELEVENLABS_API_KEY' });
  assert.equal(auth.code, 'MM_HTTP_AUTH');
  assert.equal(auth.kind, 'auth');
  assert.match(auth.message, /elevenlabs/);
  assert.match(auth.message, /ELEVENLABS_API_KEY/);
  assert.match(auth.message, /401/);
  assert.ok(!auth.message.includes(secret), 'the body is not in the message');
  const limit = describeFailure({ provider: 'kie', status: 429, body, keyName: 'KIE_API_KEY' });
  assert.equal(limit.code, 'MM_HTTP_LIMIT');
  assert.match(limit.message, /rate limit|too many requests/i);
  assert.ok(!limit.message.includes(secret));
  const quota = describeFailure({ provider: 'kie', status: 402, body, keyName: 'KIE_API_KEY' });
  assert.equal(quota.code, 'MM_HTTP_QUOTA');
  assert.match(quota.message, /credit|quota/i);
  const server = describeFailure({ provider: 'kie', status: 503, body: 'gateway', keyName: 'KIE_API_KEY' });
  assert.equal(server.code, 'MM_HTTP_SERVER');
  const other = describeFailure({ provider: 'kie', status: 404, body: JSON.stringify({ msg: 'no such model' }), keyName: 'KIE_API_KEY' });
  assert.equal(other.code, 'MM_HTTP_CLIENT');
  assert.match(other.message, /HTTP 404/);
  assert.match(other.message, /no such model/, 'a plain failure keeps the provider\'s short reason');
});

test('HttpFailure carries the code and the kind', () => {
  const e = new HttpFailure('x', { code: 'MM_HTTP_AUTH', kind: 'auth', status: 401 });
  assert.equal(e.code, 'MM_HTTP_AUTH');
  assert.equal(e.kind, 'auth');
  assert.equal(e.status, 401);
  assert.equal(e.exitCode, 1);
});

// ---- inside `mm gen` ----

test('mm gen rides out one 429 from ElevenLabs and writes the narration; the retry reuses the idempotency key', async () => {
  const piece = makePiece();
  let n = 0;
  const fetch = router([[at('text-to-speech', 'POST'), () => (++n === 1 ? res(429, { 'retry-after': '1' }) : json({ audio_base64: MP3.toString('base64'), alignment: null }, 200, { 'request-id': 'r1' }))]]);
  const r = await runGen(['voice', '--piece', piece, '--name', 'vo', '--text', 'Hello there.', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 2);
  const keys = r.calls.map((c) => new Headers(c.headers).get('idempotency-key'));
  assert.ok(keys[0] && keys[0] === keys[1]);
  assert.ok(existsSync(join(piece, 'assets/gen/vo.mp3')));
});

test('mm gen turns a refused key into one line that names the key and not the body', async () => {
  const piece = makePiece();
  const secret = ['body', 'text', 'that', 'quotes', 'the', 'key', 'el', 'key', '654321'].join('-');
  const fetch = router([[at('text-to-speech', 'POST'), () => json({ detail: { message: secret } }, 401)]]);
  const r = await runGen(['voice', '--piece', piece, '--name', 'vo', '--text', 'Hello there.', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 1);
  assert.match(r.err, /ELEVENLABS_API_KEY/);
  assert.match(r.err, /401/);
  assert.ok(!r.err.includes('body-text-that-quotes'), r.err);
  const quota = await runGen(['voice', '--piece', piece, '--name', 'vo2', '--text', 'Hello there.', '--yes'], { fetch: router([[at('text-to-speech', 'POST'), () => json({ detail: { status: 'quota_exceeded' } }, 401)]]), env: KEYS });
  assert.equal(quota.code, 1);
  assert.match(quota.err, /quota|credit/i);
  assert.ok(!existsSync(join(piece, 'assets/gen/vo.gen.json')));
});

// ---- inside `mm sound find` ----

test('mm sound find rides out a 503 from Openverse and refuses a 401 in one line without the body', async () => {
  const { main } = await import('../../scripts/sound-find.mjs');
  const run = async (answers) => {
    const out = [], err = [], calls = [], slept = [];
    const io = { env: { PATH: process.env.PATH }, home: '/nonexistent', out: (s) => out.push(s), err: (s) => err.push(s), sleep: async (ms) => { slept.push(ms); },
      fetch: async (url) => { calls.push(String(url)); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; return a.clone(); } };
    const code = await main(['door'], io);
    return { code, out: out.join('\n'), err: err.join('\n'), calls, slept };
  };
  const ok = await run([json({}, 503), json({ results: [], result_count: 0 })]);
  assert.equal(ok.code, 0, ok.err);
  assert.equal(ok.calls.length, 2);
  assert.deepEqual(ok.slept, [500]);
  const refused = await run([json({ detail: 'Incorrect authentication credentials for the-secret-token' }, 401)]);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /401/);
  assert.match(refused.err, /OPENVERSE_TOKEN/);
  assert.ok(!refused.err.includes('the-secret-token'));
  assert.equal(refused.calls.length, 1);
});
