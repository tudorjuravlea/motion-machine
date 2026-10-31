// Kie.ai for `mm gen` (SPEC §8): image, video and music through the Market task API (createTask,
// then poll recordInfo), file upload for local reference pictures, and the credit balance.
// Hosts: api.kie.ai (tasks, credit) and kieai.redpandaai.co (uploads). Shapes follow https://docs.kie.ai.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { UsageError } from '../cli.mjs';
import { ProviderError, errorText, guarded, pickUrl, poll, sleepMs } from './common.mjs';

export const name = 'kie';
export const hosts = ['api.kie.ai', 'kieai.redpandaai.co'];
export const KINDS = ['image', 'video', 'music'];
const API = 'https://api.kie.ai';
const UPLOAD = 'https://kieai.redpandaai.co/api/file-stream-upload';
export const MEDIA = { image: 'image', video: 'video', music: 'audio' };
/** The default model for a kind; image and video change with the inputs (a reference picture, a first frame). */
export function defaultModel(req) {
  if (req.kind === 'image') return req.refs.length ? 'seedream/4.5-edit' : 'seedream/4.5-text-to-image';
  if (req.kind === 'video') return req.image ? 'kling/v3-turbo-image-to-video' : 'kling/v3-turbo-text-to-video';
  return 'ai-music-api/generate';
}
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
/** The input as a plan or sidecar shows it: an upload marker becomes the file's name. */
const shown = (input) => JSON.parse(JSON.stringify(input), (_, v) => (typeof v === 'string' && v.startsWith('$upload:') ? `(uploaded) ${basename(v.slice(8))}` : v));
const withAvoid = (prompt, negative) => (negative ? `${prompt} Avoid: ${negative}.` : prompt);

/**
 * The task's input with the local files still named by path (`$upload:<path>` marks where an uploaded
 * URL goes), so a plan can show the request before anything is sent.
 */
export function prepare(req) {
  const model = req.model ?? defaultModel(req);
  if (req.kind === 'image') {
    // seedream takes no negative prompt: what to avoid goes in the prompt
    const prompt = withAvoid(req.prompt, req.negative);
    const input = { prompt, aspect_ratio: req.aspect, quality: 'basic', ...(req.refs.length ? { image_urls: req.refs.map((p) => `$upload:${p}`) } : {}) };
    return { model, prompt, negative: '', uploads: [...req.refs], parameters: shown(input), input };
  }
  if (req.kind === 'video') {
    const prompt = withAvoid(req.prompt, req.negative);
    const input = { prompt, duration: String(req.duration ?? 5), ...(req.image ? { image_urls: [`$upload:${req.image}`] } : { aspect_ratio: req.aspect }) };
    return { model, prompt, negative: '', uploads: req.image ? [req.image] : [], parameters: shown(input), input };
  }
  if (req.kind === 'music') {
    const idea = [req.typed, req.parts.style, req.parts.tempo].filter(Boolean).join('. ');
    const base = { instrumental: req.instrumental, model: 'V6', ...(req.negative ? { negative_tags: cut(req.negative, 200) } : {}), ...(req.duration != null ? { duration: req.duration } : {}) };
    // custom mode with an instrumental track takes the style words; a track with vocals takes the prompt as the idea
    const input = req.instrumental
      ? { custom_mode: true, ...base, title: cut(req.name, 80), style: cut(idea, 1000) }
      : { custom_mode: false, ...base, prompt: cut(req.prompt, 3000), style: cut([req.parts.style, req.parts.tempo].filter(Boolean).join('. ') || req.typed, 1000) };
    return { model, prompt: req.instrumental ? input.style : input.prompt, negative: req.negative, uploads: [], parameters: shown(input), input };
  }
  throw new UsageError(`kie cannot make ${req.kind}`);
}

async function json(res, what) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !body || (body.code != null && body.code !== 200) || body.success === false) throw new ProviderError(`kie: ${what} failed (${body?.code ?? res.status}): ${errorText(body, res.statusText || 'no answer')}`);
  return body;
}

async function uploadFile(f, key, path) {
  const form = new FormData();
  form.set('file', new Blob([readFileSync(path)]), basename(path));
  form.set('uploadPath', 'mm-gen');
  form.set('fileName', basename(path));
  const body = await json(await f(UPLOAD, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form }), `uploading ${basename(path)}`);
  const url = body.data?.downloadUrl;
  if (!url) throw new ProviderError(`kie: uploading ${basename(path)} returned no download URL`);
  return url;
}

/** Runs the task: { outputs: [{ url }], job, cost, sent }. */
export async function run(req, prep, ctx) {
  const f = guarded(ctx.fetch, hosts);
  const auth = { authorization: `Bearer ${ctx.key}` };
  const urls = new Map();
  for (const p of prep.uploads) urls.set(p, await uploadFile(f, ctx.key, p));
  const input = JSON.parse(JSON.stringify(prep.input), (_, v) => (typeof v === 'string' && v.startsWith('$upload:') ? urls.get(v.slice(8)) : v));
  const created = await json(await f(`${API}/api/v1/jobs/createTask`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ model: prep.model, input }) }), 'creating the task');
  const taskId = created.data?.taskId;
  if (!taskId) throw new ProviderError('kie: creating the task returned no task id');
  const info = await poll(async () => {
    const d = (await json(await f(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: auth }), 'reading the task')).data ?? {};
    if (d.state === 'fail') throw new ProviderError(`kie: the task failed: ${d.failMsg || d.failCode || 'no reason given'}`);
    return d.state === 'success' ? d : undefined;
  }, { everyMs: ctx.pollMs ?? 4000, timeoutMs: ctx.timeoutMs ?? 20 * 60000, sleep: ctx.sleep ?? sleepMs, what: 'the kie task' });
  const url = pickUrl(info.resultJson ?? info.response ?? info, MEDIA[req.kind]);
  if (!url) throw new ProviderError(`kie: the task succeeded but its result holds no URL (keys: ${Object.keys(info).join(', ')})`);
  return { outputs: [{ url }], job: taskId, cost: info.creditsConsumed != null ? { credits: info.creditsConsumed } : null };
}

/** The balance, one line. */
export async function credit(ctx) {
  const body = await json(await guarded(ctx.fetch, hosts)(`${API}/api/v1/chat/credit`, { headers: { authorization: `Bearer ${ctx.key}` } }), 'reading the balance');
  return `${body.data} credits`;
}
