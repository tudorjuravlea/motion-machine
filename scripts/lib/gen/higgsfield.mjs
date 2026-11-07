// Higgsfield for `mm gen` (SPEC §8): a wrapper of its own CLI (`higgsfield`, alias `hf`, on PATH;
// MM_HIGGSFIELD names another binary, as MM_FFMPEG does). The login is the CLI's: mm never runs
// `higgsfield auth login` or `workspace set` and never installs the CLI; when it is missing or logged
// out the command exits 2 with the one command the person should run. Documented in the higgsfield-generate
// skill: `generate create <model> --prompt … --wait --json`, `generate cost`, `model list --json`.
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { UsageError } from '../cli.mjs';
import { ProviderError, findKeyed, pickUrl, urlsIn } from './common.mjs';

export const name = 'higgsfield';
export const hosts = [];   // no direct calls: the CLI talks to Higgsfield
export const KINDS = ['image', 'video', 'replace', 'music', 'sfx', 'voice'];
export const MODELS = { image: 'gpt_image_2_5', video: 'seedance_2_5', music: 'sonilo_music', sfx: 'mirelo_text_to_audio', voice: 'seed_audio' };
export const MEDIA = { image: 'image', video: 'video', replace: 'video', music: 'audio', sfx: 'audio', voice: 'audio' };
const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh';

/** The binaries to try: MM_HIGGSFIELD alone when set, else `higgsfield` then its alias `hf`. */
export const binaries = (env = process.env) => (env.MM_HIGGSFIELD ? [env.MM_HIGGSFIELD] : ['higgsfield', 'hf']);

/** A runner `(args) → { code, stdout, stderr }` over the first binary that exists; throws UsageError naming the install command when none does. */
export function makeRunner(env = process.env, cwd = process.cwd()) {
  let found = null;
  const once = (bin, args) => new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  return async (args) => {
    const tryList = found ? [found] : binaries(env);
    for (const bin of tryList) {
      try { const r = await once(bin, args); found = bin; return r; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    throw new UsageError(`the Higgsfield CLI is not installed (looked for ${binaries(env).join(', ')}). mm does not install it; run: ${INSTALL}`);
  };
}

/** Throws a UsageError with the one command to run when the CLI is logged out. */
export async function ensureReady(ctx) {
  const r = await ctx.hf(['account', 'status']);
  if (r.code !== 0 || /session expired|not authenticated/i.test(`${r.stdout}${r.stderr}`)) throw new UsageError('the Higgsfield CLI is not logged in; run: higgsfield auth login');
  return r.stdout.trim();
}

/**
 * The replace-the-character model among `model list --json`: a model whose name or category holds
 * "replace", "swap" or "character". { id } for exactly one, else { candidates } (none or several).
 */
export function discoverReplace(list) {
  const items = Array.isArray(list) ? list : list?.models ?? list?.items ?? [];
  const idOf = (m) => m.job_set_type ?? m.id ?? m.model ?? m.name;
  const hay = (m) => [m.name, m.display_name, m.title, m.category, m.categories, m.job_set_type, m.id].flat().filter((x) => typeof x === 'string').join(' ');
  const hits = items.filter((m) => m && idOf(m) && /replace|swap|character/i.test(hay(m)));
  return hits.length === 1 ? { id: idOf(hits[0]) } : { candidates: hits.map((m) => `${idOf(m)}${m.display_name || m.name ? ` (${m.display_name ?? m.name})` : ''}`) };
}

/** Finds the model for `replace` at run time from `model list --json`; exits 2 listing candidates when it is not exactly one. */
export async function resolve(req, ctx) {
  if (req.kind !== 'replace' || req.model) return req;
  const r = await ctx.hf(['model', 'list', '--json']);
  let list;
  try { list = JSON.parse(r.stdout); } catch { throw new ProviderError(`higgsfield: \`model list --json\` did not print JSON${r.code ? ` (exit ${r.code}): ${r.stderr.trim().slice(0, 200)}` : ''}`); }
  const found = discoverReplace(list);
  if (found.id) return { ...req, model: found.id };
  throw new UsageError(found.candidates.length
    ? `more than one Higgsfield model could replace a character: ${found.candidates.join('; ')}. Pick one with --model <id>`
    : 'no Higgsfield model in `higgsfield model list` is named for replacing or swapping a character. Name one with --model <id>, or make the edit in the Higgsfield connector and bring it in with `mm gen import`');
}

const withAvoid = (prompt, negative) => (negative ? `${prompt} Avoid: ${negative}.` : prompt);

/**
 * What would be sent, with no network: { model, prompt, negative, uploads, parameters, flags }.
 * `flags` is the CLI's flags in order, each { flag, value, file? }; a file flag takes a local path the CLI uploads.
 */
export function prepare(req) {
  const model = req.model ?? MODELS[req.kind];
  if (!model) throw new UsageError('mm gen replace needs a model: it is found from `higgsfield model list`, or name one with --model <id>');
  const prompt = withAvoid(req.prompt, req.negative);
  const flags = [{ flag: '--prompt', value: prompt }];
  let uploads = [];
  if (req.kind === 'image') {
    flags.push({ flag: '--aspect_ratio', value: req.aspect });
    for (const r of req.refs) flags.push({ flag: '--image', value: r, file: true });
    uploads = [...req.refs];
  } else if (req.kind === 'video') {
    flags.push({ flag: '--aspect_ratio', value: req.aspect }, { flag: '--duration', value: String(req.duration ?? 5) });
    if (req.image) {
      if (model === 'seedance_2_5') flags.push({ flag: '--mode', value: 'omni_reference' });
      flags.push({ flag: '--start-image', value: req.image, file: true });
      uploads = [req.image];
    }
  } else if (req.kind === 'replace') {
    if (!req.video || !req.character) throw new UsageError('mm gen replace needs --video <clip> and --character <image>');
    flags.push({ flag: '--video', value: req.video, file: true }, { flag: '--image', value: req.character, file: true });
    uploads = [req.video, req.character];
  } else if (req.kind === 'music') flags.push({ flag: '--duration', value: String(req.duration ?? 30) });
  else if (req.kind === 'sfx') flags.push({ flag: '--duration', value: String(req.duration ?? 4) });
  else if (req.kind === 'voice') {
    if (!req.text) throw new UsageError('mm gen voice needs --text "…" or --script <file>');
    flags[0].value = `Speak this text${req.voice?.id ? ` in the voice "${req.voice.id}"` : ''}${req.voice?.language ? ` in language ${req.voice.language}` : ''}: ${req.text}`;
  }
  const shown = Object.fromEntries(flags.filter((f) => f.flag !== '--prompt').map((f) => [f.flag.replace(/^--/, ''), f.file ? `(uploaded) ${basename(f.value)}` : f.value]));
  return { model, prompt: flags[0].value, negative: '', uploads, parameters: shown, flags };
}

const argsFor = (verb, prep, { files }) => ['generate', verb, prep.model, ...prep.flags.filter((f) => files || !f.file).flatMap((f) => [f.flag, f.value])];

/** The cost the CLI quotes, as text; media flags are left out so nothing is uploaded before a yes. null when it cannot say. */
export async function quote(req, prep, ctx) {
  const r = await ctx.hf(argsFor('cost', prep, { files: false }));
  const text = `${r.stdout}`.trim();
  return r.code === 0 && text ? text.split('\n').slice(0, 3).join(' ').slice(0, 200) : null;
}

function parseJson(text) {
  for (const start of [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0).sort((a, b) => a - b)) {
    try { return JSON.parse(text.slice(start)); } catch { /* try the next */ }
  }
  return null;
}

/** Runs the job: { outputs: [{ url }], job, cost }. */
export async function run(req, prep, ctx) {
  const r = await ctx.hf([...argsFor('create', prep, { files: true }), '--wait', '--json']);
  if (r.code !== 0) throw new ProviderError(`higgsfield: the job failed (exit ${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  const json = parseJson(r.stdout);
  const url = pickUrl(json, MEDIA[req.kind]) ?? urlsIn(r.stdout.split(/\s+/).find((w) => /^https:\/\//.test(w)) ?? '')[0] ?? null;
  if (!url) throw new ProviderError('higgsfield: the job finished but printed no result URL');
  const credits = findKeyed(json, ['credits', 'cost', 'credits_spent']);
  return { outputs: [{ url }], job: findKeyed(json, ['job_id', 'id']), cost: credits != null ? { credits } : null };
}

/** The balance, as the CLI prints it. */
export async function credit(ctx) {
  return ensureReady(ctx);
}
