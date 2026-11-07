#!/usr/bin/env node
// mm gen <kind> --piece <dir> --name <asset-name> [options]   (SPEC §8)
// Generates a picture, clip, music, sound effect, narration or transcript through Kie.ai, ElevenLabs or
// Higgsfield and keeps it in <piece>/assets/gen/ with a record (<name>.gen.json) of how it was made.
// Everything that costs money or sends a file out first prints a plan and exits 3; only --yes sends.
// A voice reads its text first (scripts/lib/say.mjs): `[display](spoken)` markers are sent as their spoken form, `<<slot>>` cue
// markers are taken out, the brand's voice.lexicon respells names; the plan lists the words a voice may get wrong that nothing
// marks, and --yes refuses (exit 2) until they are marked or --say-ok says they are meant. --scene <id> takes a scene's `say`.
// The brand steers every prompt (scripts/lib/brand-prompt.mjs) and the record keeps a hash of what steered
// it, so W-GEN-BRAND can tell a piece to generate again after the brand changes (`--again <name>`).
// A request is keyed (provider, model, kind, every parameter, the prompt as sent, the hash of each input file,
// a cache version): the same request twice is one call, the repeat reuses assets/gen/ (`--fresh` sends again).
// A replay (`--again`) is planned first and sends only on a later run with --yes, once per plan; a recorded
// request carries nothing internal. Every generated asset gets assets/gen/<name>.licence.json (scripts/lib/licence.mjs).
// Text that came from outside (a script file, a recorded prompt, a file name) is shown fenced (scripts/lib/fence.mjs).
// A provider call retries a 429 or a 5xx twice (Retry-After up to 30 s, else 250 x 2^n ms), carries one idempotency key per POST, and
// a refused key, a spent quota or a rate limit is one line with a stable code and never the provider's body (scripts/lib/http.mjs).
// Exit 0 done (or --plan), 1 a provider failed, 2 setup or usage, 3 a plan waits for --yes.
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, isArgsError, usageText } from './lib/cli.mjs';
import { resilientFetch } from './lib/http.mjs';
import { KIND_NAMES, alignDisplay, cueAnchors, lintSay } from './lib/say.mjs';
import { fence, fenceLine } from './lib/fence.mjs';
import { runFfmpeg } from './lib/ffmpeg.mjs';
import { generatedRecord, writeLicence } from './lib/licence.mjs';
import { SteerError, brandHash, steer } from './lib/brand-prompt.mjs';
import { CACHE_VERSION, findCached, requestKey } from './lib/gen/cache.mjs';
import { ProviderError, audioExt, describeFile, download, isMp4, isPng, promote, sleepMs } from './lib/gen/common.mjs';
import { KEY_NAMES, findKey, mask, scrub } from './lib/gen/keys.mjs';
import { finishArgs, toneRecord } from './lib/gen/post.mjs';
import * as elevenlabs from './lib/gen/elevenlabs.mjs';
import * as higgsfield from './lib/gen/higgsfield.mjs';
import * as kie from './lib/gen/kie.mjs';

export const PROVIDERS = { kie, elevenlabs, higgsfield };
export const KINDS = ['image', 'video', 'replace', 'music', 'sfx', 'voice', 'transcribe', 'import', 'credit'];
/** The default provider of a kind (the first that can make it). */
export const DEFAULT_PROVIDER = { image: 'higgsfield', video: 'higgsfield', replace: 'higgsfield', music: 'elevenlabs', sfx: 'elevenlabs', voice: 'elevenlabs', transcribe: 'elevenlabs' };
const NEEDS_PROMPT = new Set(['image', 'video', 'replace', 'music', 'sfx']);
const MEDIA = { image: 'image', video: 'video', replace: 'video', music: 'audio', sfx: 'audio', voice: 'audio' };
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const OPTIONS = {
  piece: { type: 'string' }, name: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, prompt: { type: 'string' },
  ref: { type: 'string', multiple: true }, image: { type: 'string' }, video: { type: 'string' }, audio: { type: 'string' }, character: { type: 'string' },
  aspect: { type: 'string' }, duration: { type: 'string' }, instrumental: { type: 'string' }, text: { type: 'string' }, script: { type: 'string' },
  voice: { type: 'string' }, language: { type: 'string' }, file: { type: 'string' }, url: { type: 'string' }, job: { type: 'string' },
  scene: { type: 'string' }, 'say-ok': { type: 'boolean' },
  brand: { type: 'string' }, again: { type: 'string' }, raw: { type: 'boolean' }, fresh: { type: 'boolean' }, plan: { type: 'boolean' }, yes: { type: 'boolean' }, json: { type: 'boolean' },
};

const fail = (message) => new UsageError(message);
const onOff = (v, flag, dflt) => {
  if (v === undefined) return dflt;
  if (v !== 'on' && v !== 'off') throw fail(`${flag} takes on or off, not ${v}`);
  return v === 'on';
};
const num = (v, flag) => {
  if (v === undefined) return null;
  const n = Number(v);
  if (!(n > 0)) throw fail(`${flag} takes a number of seconds above 0, not ${v}`);
  return n;
};

/** What a recorded request may hold: what was asked for, never how mm was run (--yes, --plan, --raw, --fresh, --json, … are the command line's). */
const REPLAYABLE = new Set(['model', 'prompt', 'text', 'refs', 'image', 'video', 'audio', 'character', 'aspect', 'duration', 'instrumental', 'language', 'voice']);

/** The sidecar's `request` turned back into options (paths relative to the piece become absolute). Anything internal in it is refused. */
function optionsFromSidecar(sc, pieceDir) {
  const r = sc.request ?? {};
  const internal = Object.keys(r).filter((k) => !REPLAYABLE.has(k));
  if (internal.length) throw fail(`assets/gen/${sc.name}.gen.json holds options a replay never takes: ${internal.join(', ')}. A recorded request replays what was asked for, never how mm was run; take them out of the record by hand if you wrote them there`);
  const abs = (p) => (p == null ? undefined : resolve(pieceDir, p));
  return {
    provider: sc.provider, model: r.model, prompt: r.prompt, text: r.text, ref: r.refs?.map(abs), image: abs(r.image), video: abs(r.video), audio: abs(r.audio), character: abs(r.character),
    aspect: r.aspect, duration: r.duration != null ? String(r.duration) : undefined, instrumental: r.instrumental === undefined ? undefined : r.instrumental ? 'on' : 'off',
    language: r.language, voice: r.voice,
  };
}

const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Everything a run needs from outside: network, binaries, the clock; tests inject their own. */
function contextFrom(io) {
  const env = io.env ?? process.env;
  const secrets = new Set();
  const ctx = {
    env, home: io.home, cwd: io.cwd ?? process.cwd(), fetch: resilientFetch(io.fetch ?? globalThis.fetch, { sleep: io.sleep ?? sleepMs }), sleep: io.sleep ?? sleepMs, pollMs: io.pollMs, timeoutMs: io.timeoutMs,
    hf: io.hf ?? null, prep: io.prep ?? null, secrets,
    out: (s) => (io.out ?? console.log)(scrub(s, secrets)),
    err: (s) => (io.err ?? console.error)(scrub(s, secrets)),
  };
  ctx.hf ??= higgsfield.makeRunner(env, ctx.cwd);
  return ctx;
}

const rel = (pieceDir, abs) => relative(pieceDir, abs) || '.';
const inputsOf = (req) => [...req.refs.map((p) => ['ref', p]), ...[['image', req.image], ['video', req.video], ['audio', req.audio], ['character', req.character]].filter(([, p]) => p)];

function loadStyle(pieceDir) {
  const file = join(pieceDir, 'style.json');
  if (!existsSync(file)) return { style: {}, file: null };
  try { return { style: JSON.parse(readFileSync(file, 'utf8')), file }; } catch (e) { throw fail(`${file}: ${e.message}`); }
}

function existing(ctx, path, flag) {
  const abs = resolve(ctx.cwd, path);
  if (!existsSync(abs)) throw fail(`${flag}: no such file: ${path}`);
  return abs;
}

/** The credit balance of one provider, or of all three. */
async function credit(opts, ctx) {
  const names = opts.provider ? [opts.provider] : Object.keys(PROVIDERS);
  if (opts.provider && !PROVIDERS[opts.provider]) throw fail(`--provider must be kie, elevenlabs or higgsfield, not ${opts.provider}`);
  const lines = {};
  let bad = 0;
  for (const n of names) {
    const p = PROVIDERS[n];
    try {
      if (n !== 'higgsfield') {
        const key = findKey(n, { env: ctx.env, home: ctx.home });
        if (!key) { if (opts.provider) throw fail(`${KEY_NAMES[n]} is not set: put it in the environment or as a line ${KEY_NAMES[n]}=… in $HOME/.config/motion-machine/keys.env`); lines[n] = `no key (${KEY_NAMES[n]})`; continue; }
        ctx.secrets.add(key.value);
        lines[n] = await p.credit({ ...ctx, key: key.value });
      } else {
        try { lines[n] = await p.credit(ctx); } catch (e) { if (opts.provider || !(e instanceof UsageError)) throw e; lines[n] = e.message; }
      }
    } catch (e) {
      if (e instanceof UsageError) throw e;
      lines[n] = `failed: ${e.message}`; bad = 1;
    }
  }
  if (opts.json) ctx.out(JSON.stringify({ credit: lines }));
  else for (const [n, l] of Object.entries(lines)) ctx.out(`${n}: ${l}`);
  return bad;
}

/** The scene `id` of the piece's story, with a `say`; a usage error when there is none. */
function sceneOf(pieceDir, id) {
  const file = join(pieceDir, 'story.json');
  if (!existsSync(file)) throw fail(`--scene ${id}: the piece has no story.json`);
  let story;
  try { story = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw fail(`${file}: ${e.message}`); }
  const sc = (story.scenes ?? []).find((s) => s.id === id);
  if (!sc) throw fail(`--scene: no scene "${id}" in the story (scenes: ${(story.scenes ?? []).map((s) => s.id).join(', ')})`);
  if (typeof sc.say !== 'string' || !sc.say.trim()) throw fail(`--scene ${id}: that scene has no say to read aloud`);
  return sc;
}

/** The request this run would make: inputs checked, prompt steered, provider chosen. */
function buildRequest(opts, kind, { style, styleDir, pieceDir, name }, ctx) {
  const brand = onOff(opts.brand, '--brand', true);
  const abs = (p, flag) => (p === undefined ? null : isAbsolute(p) && existsSync(p) ? p : existing(ctx, p, flag));
  const userRefs = (opts.ref ?? []).map((p) => abs(p, '--ref'));
  const image = abs(opts.image, '--image'), video = abs(opts.video, '--video'), audio = abs(opts.audio, '--audio'), character = abs(opts.character, '--character');
  let text = opts.text ?? null, scene = null;
  if (opts.scene !== undefined) {
    if (kind !== 'voice') throw fail('--scene is for mm gen voice: it takes a scene\'s say from the story');
    if (opts.text !== undefined || opts.script !== undefined) throw fail('--scene, --text and --script are three ways to give the text: take one');
    scene = sceneOf(pieceDir, opts.scene);
    text = scene.say;
  }
  if (opts.script !== undefined) text = readFileSync(existing(ctx, opts.script, '--script'), 'utf8').trim();
  if (kind === 'voice' && !text) throw fail('mm gen voice needs --text "…", --script <file> or --scene <id>');
  if (NEEDS_PROMPT.has(kind) && !opts.prompt) throw fail(`mm gen ${kind} needs --prompt "…"`);
  if (kind === 'replace' && (!video || !character)) throw fail('mm gen replace needs --video <clip> and --character <image>');
  if (kind === 'transcribe' && !audio && !video) throw fail('mm gen transcribe needs --audio <file> or --video <file>');

  // a voice's text is read first: markers resolved, names respelled by the brand's lexicon, risky words found
  let say = null;
  const typed = kind === 'voice' ? text : opts.prompt ?? '';
  if (kind === 'voice') {
    say = lintSay(text, { lexicon: brand ? style.voice?.lexicon ?? {} : {} });
    say.cueProblems = [...say.parsed.problems.map((p) => p.reason), ...(scene ? cueAnchors({ scenes: [scene] }).problems.map((p) => p.reason) : [])];
    text = say.parsed.spoken;
  }
  let steered;
  try { steered = steer(kind, typed, style, { brand, voice: opts.voice, styleDir }); } catch (e) { throw e instanceof SteerError ? fail(e.message) : e; }
  for (const r of steered.refs) if (!existsSync(r)) throw fail(`the brand's imagery reference ${rel(pieceDir, r)} does not exist`);

  const providerName = opts.provider ?? (kind === 'voice' && brand ? style.voice?.provider : undefined) ?? DEFAULT_PROVIDER[kind];
  const provider = PROVIDERS[providerName];
  if (!provider) throw fail(`--provider must be kie, elevenlabs or higgsfield, not ${providerName}`);
  if (!provider.KINDS.includes(kind)) {
    const can = Object.values(PROVIDERS).filter((p) => p.KINDS.includes(kind)).map((p) => p.name);
    throw fail(`${providerName} cannot make ${kind}; the providers that can: ${can.join(', ')}`);
  }
  const refs = [...new Set([...steered.refs, ...userRefs])];
  return {
    provider, req: {
      kind, name, provider: providerName, model: opts.model, typed, prompt: steered.prompt, negative: steered.negative, parts: steered.parts, notes: steered.notes,
      refs, userRefs, image, video, audio, character, aspect: opts.aspect ?? '16:9', duration: num(opts.duration, '--duration'),
      instrumental: onOff(opts.instrumental, '--instrumental', true), language: opts.language ?? null, text, say, voice: steered.voice, brand, voiceOverride: opts.voice,
    },
  };
}

async function plan(req, prep, extra, ctx, { pieceDir, opts }) {
  const uploads = extra.uploads;
  const steered = req.kind !== 'transcribe';
  const p = {
    kind: req.kind, provider: req.provider, model: prep.model, writes: req.kind === 'transcribe' ? `assets/gen/${req.name}.words.json` : `assets/gen/${req.name}.${MEDIA[req.kind] === 'image' ? 'png' : MEDIA[req.kind] === 'video' ? 'mp4' : 'mp3'}`,
    brand: steered ? (req.brand ? 'on' : 'off') : 'n/a', brandHash: extra.hash, prompt: prep.prompt, negative: prep.negative || req.negative || null, parameters: prep.parameters,
    uploads: uploads.map((u) => ({ path: rel(pieceDir, u.path), size: u.size, sha256: u.sha256 })), cost: extra.cost ?? 'not quoted', key: extra.key, notes: req.notes, cache: extra.cache, requestKey: extra.requestKey,
    ...(extra.replay ? { replay: true } : {}),
    ...(req.say ? { say: { findings: req.say.findings.map(({ word, kind, index }) => ({ word, kind, index })), cueProblems: req.say.cueProblems, productWordsChecked: req.say.productWordsChecked } } : {}),
  };
  if (opts.json) { ctx.out(JSON.stringify({ plan: p })); return { plan: p, uploads }; }
  const L = [`mm gen ${req.kind}: plan (nothing has been sent)`];
  const row = (k, v) => L.push(`  ${k.padEnd(10)} ${v}`);
  row('provider', `${p.provider}, model ${p.model}`);
  row('writes', p.writes);
  row('brand', p.brand === 'on' ? `on (hash ${String(p.brandHash).slice(0, 8)})` : p.brand === 'off' ? 'off: the prompt is sent untouched' : 'not steered');
  // the prompt, the avoid list, the settings (which can hold the prompt) and the file names may hold words from outside: fenced as material
  if (p.prompt) { row('prompt', 'as it will be sent:'); L.push(fence(p.prompt, 'prompt as sent')); }
  if (req.negative && !p.prompt.includes(req.negative)) row('avoid', fenceLine(req.negative, 'avoid'));
  if (Object.keys(p.parameters ?? {}).length) row('settings', fenceLine(JSON.stringify(p.parameters), 'settings'));
  if (!uploads.length) row('uploads', 'none');
  for (const u of uploads) row('uploads', `${fenceLine(rel(pieceDir, u.path), 'file name')}  ${u.size} bytes  sha256 ${u.sha256}`);
  if (req.say) {
    const n = req.say.findings.length;
    row('say-lint', n ? `${n} word${n === 1 ? '' : 's'} a voice may get wrong:` : 'nothing flagged');
    for (const f of req.say.findings) L.push(`    ${JSON.stringify(f.word)} is a ${KIND_NAMES[f.kind] ?? f.kind} (word ${f.index + 1}); mark it [${f.word}](how it is said) or put it in the brand's voice.lexicon`);
    for (const c of req.say.cueProblems) L.push(`    ${c}`);
  }
  row('cost', p.cost);
  row('cache', p.cache);
  if (p.key) row('key', p.key);
  if (extra.replay) row('replay', 'this is a recorded request, planned again; --yes only counts on a run after this plan');
  for (const n of req.notes) row('note', n);
  L.push(opts.plan ? 'plan only (--plan): nothing sent.' : 'Show this plan to the person; with their yes, run the same command again with --yes.');
  ctx.out(L.join('\n'));
  return { plan: p, uploads };
}

/** The first 16 bytes of a file, without reading the rest (a clip can be large). */
function firstBytes(file) {
  const fd = openSync(file, 'r');
  try { const b = Buffer.alloc(16); return b.subarray(0, readSync(fd, b, 0, 16, 0)); } finally { closeSync(fd); }
}

/** Writes the provider's outputs, finishes them (tone, conversion), and returns { file, post }. */
async function land(req, result, style, pieceDir, genDir, ctx) {
  const base = join(genDir, req.name);
  const out = result.outputs[0];
  let partial = `${base}.partial`;
  if (out.bytes) writeFileSync(partial, out.bytes); else partial = await download(out.url, base, ctx.fetch);
  const media = MEDIA[req.kind];
  const head = firstBytes(partial);
  let ext, post = null;
  try {
    if (media === 'audio') {
      ext = audioExt(head);
      for (const other of ['mp3', 'wav']) if (other !== ext) rmSync(`${base}.${other}`, { force: true });
    } else {
      ext = media === 'image' ? 'png' : 'mp4';
      const tone = style.imagery?.tone;
      post = toneRecord(tone, style.color);
      const convert = media === 'image' ? !isPng(head) : !isMp4(head);
      if (post || convert) {
        const tmp = `${base}.post.${ext}`;
        try { await runFfmpeg(finishArgs({ input: partial, output: tmp, mediaKind: media, tone: post ? tone : 'none', color: style.color })); } catch (e) { rmSync(tmp, { force: true }); throw e; }
        rmSync(partial, { force: true });
        partial = tmp;
      }
    }
    promote(partial, `${base}.${ext}`);
  } catch (e) { rmSync(partial, { force: true }); throw e; }
  return { file: `assets/gen/${req.name}.${ext}`, post, ext };
}

async function prepVideo(req, file, pieceDir, ctx) {
  ctx.prep ??= (await import('./media-prep.mjs')).prep;
  await ctx.prep({ file, name: req.name, piece: pieceDir });
  return `assets/${req.name}/`;
}

const writeJson = (file, v) => writeFileSync(file, `${JSON.stringify(v, null, 2)}\n`);

/** The record beside an asset (assets/gen/<name>.gen.json): how it was made, and the key of the request. */
function makeSidecar({ kind, name, req, prep, provider, hash, uploads, pieceDir, landed, wordsFile, prepared, result, requestKey: key, extra = {} }) {
  const steered = kind !== 'transcribe';
  return {
    version: 1, kind, name, file: landed?.file ?? wordsFile, provider: provider.name, model: prep.model,
    brand: steered ? (req.brand ? 'on' : 'off') : 'n/a', brandHash: hash,
    prompt: { typed: req.typed, sent: prep.prompt }, negative: prep.negative || req.negative || null,
    inputs: uploads.map((u) => ({ name: basename(u.path), role: inputsOf(req).find(([, p]) => p === u.path)?.[0] ?? 'input', path: rel(pieceDir, u.path), sha256: u.sha256 })),
    parameters: prep.parameters, job: result.job ?? null, cost: result.cost ?? null, created: new Date().toISOString(),
    post: landed?.post ?? null, prepared, words: wordsFile,
    requestKey: key, cacheVersion: CACHE_VERSION, ...extra,
    request: defined({
      model: prep.model, prompt: req.typed && kind !== 'voice' ? req.typed : undefined, text: kind === 'voice' ? req.typed : undefined,
      refs: req.userRefs.length ? req.userRefs.map((p) => rel(pieceDir, p)) : undefined, image: req.image ? rel(pieceDir, req.image) : undefined, video: req.video ? rel(pieceDir, req.video) : undefined,
      audio: req.audio ? rel(pieceDir, req.audio) : undefined, character: req.character ? rel(pieceDir, req.character) : undefined, aspect: req.aspect, duration: req.duration ?? undefined,
      instrumental: kind === 'music' ? req.instrumental : undefined, language: req.language ?? undefined, voice: req.voiceOverride,
    }),
  };
}

/** A generated asset's licence record: generated, by this provider and model, from the provider's page. */
const writeGeneratedLicence = (pieceDir, name, provider, model) => writeLicence(pieceDir, `assets/gen/${name}.licence.json`, generatedRecord({ provider, model }));

/** The earlier result of the same request, put where this run's name expects it. Sends nothing and costs nothing. */
async function reuse(cached, args, ctx) {
  const { kind, name, opts, pieceDir, genDir } = args;
  const sc = cached.sidecar;
  let file = sc.file, wordsFile = sc.words ?? null, sidecar = sc;
  if (cached.name !== name) {
    const copyTo = (relPath) => {
      const dest = relPath.replace(/^assets\/gen\/[^/]+?(\.words\.json|\.[a-z0-9]+)$/i, (_, ext) => `assets/gen/${name}${ext}`);
      copyFileSync(join(pieceDir, relPath), `${join(pieceDir, dest)}.partial`);
      renameSync(`${join(pieceDir, dest)}.partial`, join(pieceDir, dest));
      return dest;
    };
    mkdirSync(genDir, { recursive: true });
    file = copyTo(sc.file);
    wordsFile = sc.words ? copyTo(sc.words) : null;
    if (MEDIA[kind] === 'audio') for (const other of ['mp3', 'wav']) if (!file.endsWith(`.${other}`)) rmSync(join(genDir, `${name}.${other}`), { force: true });
    sidecar = makeSidecar({
      kind, name, req: args.req, prep: args.prep, provider: args.provider, hash: args.hash, uploads: args.uploads, pieceDir, landed: { file, post: sc.post ?? null }, wordsFile, prepared: null,
      result: { job: sc.job, cost: null }, requestKey: args.requestKey, extra: { reusedFrom: cached.name },
    });
  }
  let prepared = sidecar.prepared ?? null;
  if ((kind === 'video' || kind === 'replace') && !opts.raw && !existsSync(join(pieceDir, 'assets', name))) prepared = await prepVideo(args.req, join(pieceDir, file), pieceDir, ctx);
  if (cached.name !== name || prepared !== (sc.prepared ?? null)) writeJson(join(genDir, `${name}.gen.json`), { ...sidecar, prepared });
  if (kind !== 'transcribe' && !existsSync(join(genDir, `${name}.licence.json`))) writeGeneratedLicence(pieceDir, name, args.provider.name, args.prep.model);
  const summary = { ok: true, cached: true, kind, name, file, record: `assets/gen/${name}.gen.json`, provider: args.provider.name, model: args.prep.model, ...(cached.name !== name ? { reusedFrom: cached.name } : {}), ...(prepared ? { prepared } : {}), ...(wordsFile ? { words: wordsFile } : {}) };
  if (opts.json) ctx.out(JSON.stringify(summary));
  else ctx.out(`reused ${sc.file}${cached.name !== name ? ` as ${file}` : ` (made ${String(sc.created).slice(0, 10)})`}${wordsFile && wordsFile !== file ? ` and ${wordsFile}` : ''}: the same request was made before, so no call was made, nothing was charged (--fresh sends it again); record assets/gen/${name}.gen.json`);
  return 0;
}

/** The go-ahead a plan leaves for a replay: out/gen/pending-<name>.json holds the key of the request that was shown. */
const pendingFile = (pieceDir, name) => join(pieceDir, 'out', 'gen', `pending-${name}.json`);
function readPending(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }

async function generate(kind, opts, ctx, scene) {
  const { pieceDir, genDir, style, styleDir } = scene;
  const name = scene.name;
  const { provider, req: r0 } = buildRequest(opts, kind, { style, styleDir, pieceDir, name }, ctx);
  let req = r0;
  let key = null;
  if (KEY_NAMES[provider.name]) {
    key = findKey(provider.name, { env: ctx.env, home: ctx.home });
    if (!key) throw fail(`${KEY_NAMES[provider.name]} is not set: put it in the environment or as a line ${KEY_NAMES[provider.name]}=… in $HOME/.config/motion-machine/keys.env (mm never writes that file)`);
    ctx.secrets.add(key.value);
    ctx = { ...ctx, key: key.value };
  } else await higgsfield.ensureReady(ctx);
  if (provider.resolve) req = await provider.resolve(req, ctx);
  const prep = provider.prepare(req);
  const uploads = await Promise.all(prep.uploads.map(describeFile));
  const hash = req.brand ? brandHash(kind, style) : null;
  const tone = kind === 'image' || kind === 'video' || kind === 'replace' ? toneRecord(style.imagery?.tone, style.color) : null;
  const reqKey = requestKey({ kind, provider: provider.name, model: prep.model, parameters: prep.parameters, prompt: prep.prompt, negative: prep.negative || req.negative || '', inputs: uploads.map((u) => u.sha256), post: tone });
  const cached = opts.fresh ? null : findCached(pieceDir, genDir, reqKey, name);
  const args = { kind, name, opts, pieceDir, genDir, req, prep, provider, hash, uploads, requestKey: reqKey };
  if (cached && !opts.plan) return reuse(cached, args, ctx);

  const cost = cached ? 'none: the earlier result is reused' : provider.quote ? await provider.quote(req, prep, ctx) : null;
  const cache = cached ? `hit: reuses ${cached.sidecar.file} made ${String(cached.sidecar.created).slice(0, 10)}; no call, no cost` : opts.fresh ? 'skipped (--fresh): a new request will be sent' : 'miss: a new request will be sent';
  const replay = opts.again !== undefined && !cached;
  await plan(req, prep, { cost, hash, uploads, cache, requestKey: reqKey, replay, key: key ? `${key.name} ${mask(key.value)} (${key.source})` : null }, ctx, { pieceDir, opts });
  if (opts.plan) return 0;
  if (req.say?.findings.length && opts.yes && !opts['say-ok']) {
    const n = req.say.findings.length;
    throw fail(`${n} word${n === 1 ? '' : 's'} a voice may get wrong ${n === 1 ? 'is' : 'are'} not marked (${req.say.findings.map((f) => JSON.stringify(f.word)).join(', ')}): nothing was sent. Mark each as [word](how it is said), add it to the brand's voice.lexicon, or run the same command with --say-ok to send the text as written`);
  }
  if (replay) {
    // a replay of paid work is planned first: the plan leaves a go-ahead for exactly this request, and a send uses it up
    const file = pendingFile(pieceDir, name);
    if (!(opts.yes && readPending(file)?.requestKey === reqKey)) {
      mkdirSync(join(pieceDir, 'out', 'gen'), { recursive: true });
      writeJson(file, { requestKey: reqKey, planned: new Date().toISOString() });
      return 3;
    }
    rmSync(file, { force: true });
  } else if (!opts.yes) return 3;

  mkdirSync(genDir, { recursive: true });
  const result = await provider.run(req, prep, ctx);
  let landed = null, prepared = null;
  if (result.outputs.length) {
    landed = await land(req, result, style, pieceDir, genDir, ctx);
    if (kind === 'video' || kind === 'replace') if (!opts.raw) prepared = await prepVideo(req, join(pieceDir, landed.file), pieceDir, ctx);
  }
  let wordsFile = null;
  if (result.words && kind === 'voice' && req.say && req.say.parsed.display !== req.say.parsed.spoken) result.words = alignDisplay(req.say.parsed, result.words);   // the words as shown, so a beat's anchor finds them
  if (result.words && (kind === 'voice' || kind === 'transcribe')) {
    wordsFile = `assets/gen/${name}.words.json`;
    writeJson(join(pieceDir, wordsFile), result.words);
  }
  const sidecar = makeSidecar({ kind, name, req, prep, provider, hash, uploads, pieceDir, landed, wordsFile, prepared, result, requestKey: reqKey });
  writeJson(join(genDir, `${name}.gen.json`), sidecar);
  if (kind !== 'transcribe') writeGeneratedLicence(pieceDir, name, provider.name, prep.model);
  const summary = { ok: true, kind, name, file: sidecar.file, record: `assets/gen/${name}.gen.json`, provider: provider.name, model: prep.model, ...(prepared ? { prepared } : {}), ...(wordsFile ? { words: wordsFile } : {}), ...(result.cost ? { cost: result.cost } : {}) };
  if (opts.json) ctx.out(JSON.stringify(summary));
  else {
    ctx.out(`wrote ${sidecar.file}${prepared ? ` and the frame sequence ${prepared}` : ''}${wordsFile && wordsFile !== sidecar.file ? ` and ${wordsFile}` : ''}; record assets/gen/${name}.gen.json`);
    if (kind === 'voice' && !result.words) ctx.out('note: this provider returns no word times; run `mm gen transcribe --audio …` for them');
  }
  return 0;
}

const MEDIA_BY_EXT = { png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', mp4: 'video', mov: 'video', webm: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio' };

/** `import`: copy or download a result made elsewhere into assets/gen/ with the same record. Costs nothing, so it needs no --yes. */
async function importAsset(opts, ctx, scene) {
  const { pieceDir, genDir, name } = scene;
  if (!opts.file === !opts.url) throw fail('mm gen import takes --file <path> or --url <https url>, one of them');
  if (opts.provider && !PROVIDERS[opts.provider]) throw fail(`--provider must be kie, elevenlabs or higgsfield, not ${opts.provider}`);
  let source, ext;
  if (opts.file) { source = existing(ctx, opts.file, '--file'); ext = extname(source).slice(1).toLowerCase(); } else {
    let u;
    try { u = new URL(opts.url); } catch { throw fail(`--url is not a URL: ${opts.url}`); }
    if (u.protocol !== 'https:') throw fail('--url must be https');
    ext = extname(u.pathname).slice(1).toLowerCase();
    source = u;
  }
  const media = MEDIA_BY_EXT[ext];
  if (!media) throw fail(`cannot tell what ${ext ? `.${ext}` : 'this'} is: --file or --url must end in ${Object.keys(MEDIA_BY_EXT).join(', ')}`);
  const target = `assets/gen/${name}.${ext}`;
  const p = { kind: 'import', provider: opts.provider ?? null, model: opts.model ?? null, writes: target, from: opts.file ? rel(pieceDir, source) : `${source.origin}${source.pathname}`, job: opts.job ?? null };
  if (opts.plan) { ctx.out(opts.json ? JSON.stringify({ plan: p }) : `mm gen import: would write ${target} from ${p.from} (copies a result made elsewhere; nothing is sent)`); return 0; }
  mkdirSync(genDir, { recursive: true });
  const dest = join(pieceDir, target);
  let sha;
  if (opts.file) { copyFileSync(source, `${dest}.partial`); } else { await download(source.href, dest, ctx.fetch); }
  renameSync(`${dest}.partial`, dest);
  sha = (await describeFile(dest)).sha256;
  const prepared = media === 'video' && !opts.raw ? await prepVideo({ name }, dest, pieceDir, ctx) : null;
  const sidecar = {
    version: 1, kind: 'import', media, name, file: target, provider: opts.provider ?? null, model: opts.model ?? null, brand: 'n/a', brandHash: null,
    prompt: { typed: opts.prompt ?? null, sent: opts.prompt ?? null }, negative: null,
    inputs: [{ name: basename(opts.file ?? source.pathname), role: 'source', ...(opts.file ? { path: rel(pieceDir, source) } : { url: `${source.origin}${source.pathname}` }), sha256: sha }],
    parameters: {}, job: opts.job ?? null, cost: null, created: new Date().toISOString(), post: null, prepared, words: null,
  };
  writeJson(join(genDir, `${name}.gen.json`), sidecar);
  // a result made by a named provider is generated work; anything else is unknown until a person writes where it came from
  writeLicence(pieceDir, `assets/gen/${name}.licence.json`, opts.provider ? generatedRecord({ provider: opts.provider, model: opts.model ?? null }) : { source: opts.file ? 'unknown' : `${source.origin}${source.pathname}`, licence: 'unknown', licenceUrl: null, author: null, credit: null, providerPage: null, retrieved: new Date().toISOString().slice(0, 10) });
  const summary = { ok: true, kind: 'import', name, file: target, record: `assets/gen/${name}.gen.json`, ...(prepared ? { prepared } : {}) };
  ctx.out(opts.json ? JSON.stringify(summary) : `wrote ${target}${prepared ? ` and the frame sequence ${prepared}` : ''}; record assets/gen/${name}.gen.json`);
  return 0;
}

export async function main(argv, io = {}) {
  const ctx = contextFrom(io);
  try {
    const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
    const kind = positionals[0];
    if (positionals.length !== 1 || !KINDS.includes(kind)) throw fail(`mm gen takes one kind: ${KINDS.join(', ')}\n${usageText('gen')}`);
    if (kind === 'credit') return await credit(v, ctx);
    if (!v.piece) throw fail('mm gen needs --piece <dir>');
    const pieceDir = resolve(ctx.cwd, v.piece);
    if (!existsSync(pieceDir)) throw fail(`no such piece folder: ${v.piece}`);
    let opts = defined(v);
    let name = v.name;
    if (v.again !== undefined) {
      const file = join(pieceDir, 'assets', 'gen', `${v.again}.gen.json`);
      if (!existsSync(file)) throw fail(`--again ${v.again}: no record at assets/gen/${v.again}.gen.json`);
      const sc = JSON.parse(readFileSync(file, 'utf8'));
      if (sc.kind !== kind) throw fail(`--again ${v.again}: that asset was made by mm gen ${sc.kind}, not ${kind}`);
      const carried = optionsFromSidecar(sc, pieceDir);
      if (v.provider && v.provider !== sc.provider) delete carried.model;
      opts = { ...defined(carried), ...defined(v) };
      if (v.brand === undefined) opts.brand = 'on';
      name = v.again;
    }
    if (!name) throw fail('mm gen needs --name <asset-name>');
    if (!NAME.test(name)) throw fail('--name must be lowercase letters, digits and hyphens');
    const { style, file: styleFile } = loadStyle(pieceDir);
    const scene = { pieceDir, genDir: join(pieceDir, 'assets', 'gen'), name, style, styleDir: styleFile ? dirname(styleFile) : pieceDir };
    return kind === 'import' ? await importAsset(opts, ctx, scene) : await generate(kind, opts, ctx, scene);
  } catch (e) {
    if (isArgsError(e)) ctx.err(`${e.message}\n${usageText('gen')}`);
    else ctx.err(process.env.MM_DEBUG === '1' ? String(e.stack ?? e) : e.message);
    return isArgsError(e) ? 2 : e.exitCode ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
