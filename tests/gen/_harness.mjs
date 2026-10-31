// Shared by tests/gen/*.test.mjs: a piece folder with a brand style, a fetch that never leaves the
// machine (it answers from a route table and records what was asked), and a fake Higgsfield binary.
// Nothing here can reach a real service.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../scripts/gen.mjs';

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a picture')]);
export const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32, 7)]);
export const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40, 9)]);

export const STYLE = {
  color: { canvas: '#FAFAF7', ink: '#23262B', accent: '#2F6F5E', muted: '#6B7280', surface: '#FFFFFF', line: '#E5E7EB', accentInk: '#FFFFFF' },
  imagery: { style: 'soft studio photography, matte surfaces', mood: 'calm, unhurried', avoid: 'stock-photo smiles, neon', references: ['refs/a.png'], tone: 'none' },
  music: { style: 'warm minimal piano, light percussion', avoid: 'vocals, big drops' },
  voice: { provider: 'elevenlabs', id: 'voice123', model: 'eleven_multilingual_v2', language: 'en', stability: 0.4, similarity: 0.8, style: 0.1, speed: 1 },
  sound: { palette: 'soft-ui', bpm: 96, loudnessLufs: -14 },
};

/** A piece folder with style.json and one brand reference picture. */
export function makePiece(style = STYLE) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-gen-piece-'));
  writeFileSync(join(dir, 'style.json'), JSON.stringify(style));
  mkdirSync(join(dir, 'refs'));
  writeFileSync(join(dir, 'refs', 'a.png'), PNG);
  return dir;
}

export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
export const bytes = (buf, status = 200, headers = {}) => new Response(buf, { status, headers });

/** A routes table: [[(url, init) → boolean, (url, init) → Response], …]. Anything unmatched throws. */
export function router(routes) {
  return async (url, init) => {
    for (const [match, answer] of routes) if (match(url, init)) return answer(url, init);
    throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`);
  };
}
export const at = (part, method) => (url, init) => url.includes(part) && (!method || (init?.method ?? 'GET') === method);

export const KEYS = { KIE_API_KEY: 'kie-key-123456', ELEVENLABS_API_KEY: 'el-key-654321' };

/** Runs mm gen in-process: { code, out, err, calls } with every fetch recorded. */
export async function runGen(argv, { fetch, env = {}, home, prep, hf, cwd } = {}) {
  const out = [], err = [], calls = [];
  const io = {
    env: { PATH: process.env.PATH, HOME: home ?? mkdtempSync(join(tmpdir(), 'mm-gen-home-')), ...env }, home,
    cwd, sleep: async () => {}, pollMs: 0, out: (s) => out.push(s), err: (s) => err.push(s), prep, hf,
    fetch: async (url, init) => {
      const call = { url: String(url), method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body };
      calls.push(call);
      if (!fetch) throw new Error(`a network call was made: ${call.method} ${call.url}`);
      return fetch(call.url, init);
    },
  };
  const code = await main(argv, io);
  return { code, out: out.join('\n'), err: err.join('\n'), calls };
}

export const body = (call) => JSON.parse(call.body);
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * A fake Higgsfield binary (a node script). It logs every call's arguments to <dir>/log.jsonl and answers
 * from the environment: FAKE_HF_LOGGED_OUT=1, FAKE_HF_MODELS (JSON for `model list`), FAKE_HF_URL (the result URL).
 */
export function fakeHiggsfield() {
  const dir = mkdtempSync(join(tmpdir(), 'mm-fake-hf-'));
  const bin = join(dir, 'higgsfield');
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'log.jsonl'))}, JSON.stringify(a) + '\\n');
const [c0, c1] = a;
if (c0 === 'account') { if (process.env.FAKE_HF_LOGGED_OUT) { console.error('Session expired'); process.exit(1); } console.log('Logged in. Credits: 120'); }
else if (c0 === 'model' && c1 === 'list') console.log(process.env.FAKE_HF_MODELS || '[]');
else if (c0 === 'generate' && c1 === 'cost') console.log('Estimated cost: 3.5 credits');
else if (c0 === 'generate' && c1 === 'create') console.log(JSON.stringify([{ id: 'job_42', status: 'completed', credits: 3.5, results: [{ url: process.env.FAKE_HF_URL || 'https://cdn.example/hf/out.png' }] }]));
else { console.error('unknown call'); process.exit(3); }
`);
  chmodSync(bin, 0o755);
  return { bin, dir, calls: () => { try { return readFileSync(join(dir, 'log.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } } };
}
