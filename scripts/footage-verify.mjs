#!/usr/bin/env node
// mm footage verify <edit.mp4> --words <edit.json> [--heard <words.json>] [--out <dir>]
// The round trip: the finished edit is transcribed and the words around every cut are compared with the
// plan. --words is the edit (assets/<n>/edit.json: its `words` on the output clock and its `cuts`);
// --heard is the transcript of the finished edit, from the tool the piece used (a words list, { words } or
// WhisperX output). When `mm gen transcribe` exists in this build and --heard is absent, it transcribes the
// edit; otherwise --heard is required. Per cut it reports the planned words clipped (only a piece heard),
// missing, and any word heard there that the plan removed, and writes <out>/verify.json plus a strip-NN.png
// of the 10 frames either side of each cut (default <out>: verify/ beside the edit). The words are checked
// like every footage command's (marks, language). Exit 0 every cut clean, 1 a word clipped or missing,
// 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { GROUP_USAGE, isArgsError, usageText } from './lib/cli.mjs';
import { bin, probe } from './lib/ffmpeg.mjs';
import { STRIP_FRAMES, verifyEdit } from './lib/footage-verify.mjs';
import { fenceLine } from './lib/fence.mjs';
import { materialNote, readWordsFile, storyLanguageOf } from './lib/footage-words.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const pad2 = (n) => String(n).padStart(2, '0');

/** `mm gen transcribe` is a verb of a later build: used when this one has it, never assumed. */
const hasTranscriber = () => (GROUP_USAGE.gen ?? []).includes('transcribe');

function readPlan(file) {
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw fail(`--words: cannot read ${file}: ${e.message}`, 2); }
  const words = (Array.isArray(j?.words) ? j.words : []).map((w) => ({ text: String(w?.text), at: w?.at ?? w?.start, end: w?.end }));
  if (!words.length || !words.every((w) => Number.isFinite(w.at) && Number.isFinite(w.end))) throw fail('--words must be an edit.json: its "words" are [{ text, at, end }] on the output clock', 2);
  if (!Array.isArray(j.cuts)) throw fail('--words must be an edit.json: its "cuts" are what is checked', 2);
  const cuts = j.cuts.filter((c) => Number.isFinite(c?.at));
  return { words, cuts, fps: j.fps ?? null, duration: j.duration ?? null };
}

/** The frames either side of an output second, as one contact strip PNG. Returns true when ffmpeg wrote it. */
function strip(video, fps, at, out) {
  const f = Math.round(at * fps);
  const a = Math.max(0, f - STRIP_FRAMES), b = f + STRIP_FRAMES - 1;
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-y', '-nostdin', '-i', video, '-vf', `select='between(n\\,${a}\\,${b})',scale=160:-2,tile=${STRIP_FRAMES}x2`, '-fps_mode', 'passthrough', '-frames:v', '1', out], { encoding: 'utf8' });
  return r.status === 0 && existsSync(out);
}

export function verify({ video, words: planFile, heard: heardFile = null, out = null }) {
  if (!existsSync(video)) throw fail(`no such file: ${video}`, 2);
  if (!existsSync(planFile)) throw fail(`--words: no such file: ${planFile}`, 2);
  const plan = readPlan(planFile);
  const piece = basename(dirname(dirname(resolve(planFile)))) === 'assets' ? dirname(dirname(dirname(resolve(planFile)))) : null;
  const language = piece ? storyLanguageOf(piece) : null;
  let heardPath = heardFile, tmp = null;
  if (!heardPath) {
    if (!hasTranscriber()) throw fail('no transcriber in this build (mm gen transcribe): transcribe the edit with the tool the piece used and pass its words with --heard <words.json>', 2);
    tmp = mkdtempSync(join(tmpdir(), 'mm-verify-'));
    heardPath = join(tmp, 'heard.json');
    const r = spawnSync(process.execPath, [join(HERE, 'mm.mjs'), 'gen', 'transcribe', video, '--out', heardPath], { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(heardPath)) { rmSync(tmp, { recursive: true, force: true }); throw fail(`mm gen transcribe failed: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`, 2); }
  }
  try {
    if (heardFile && !existsSync(heardFile)) throw fail(`--heard: no such file: ${heardFile}`, 2);
    const heard = readWordsFile(heardPath, { flag: '--heard', storyLanguage: language });
    if (!heard.words.length) throw fail('--heard holds no words: nothing was heard in the edit', 2);
    const result = verifyEdit(plan, heard.words);
    const dir = resolve(out ?? join(dirname(resolve(video)), 'verify'));
    mkdirSync(dir, { recursive: true });
    let info = null;
    try { info = probe(video); } catch { /* the strips are skipped, the words are still compared */ }
    const stream = info?.streams?.find((s) => s.codec_type === 'video');
    const fps = stream ? (() => { const [n, d] = String(stream.r_frame_rate).split('/').map(Number); return n / (d || 1); })() : plan.fps;
    const strips = [];
    result.cuts.forEach((c, i) => {
      const file = join(dir, `strip-${pad2(i + 1)}.png`);
      if (fps && strip(video, fps, c.at, file)) strips.push(file);
    });
    const warnings = [...heard.warnings];
    const len = Number(info?.format?.duration);
    if (plan.duration && Number.isFinite(len) && Math.abs(len - plan.duration) > 0.2) warnings.push(`the edit runs ${len.toFixed(2)} s but the plan says ${plan.duration} s: is this the file the plan made?`);
    const report = { ...result, strips: strips.map((f) => basename(f)), warnings, material: materialNote(['cuts[].clipped', 'cuts[].missing', 'cuts[].extra']) };
    writeFileSync(join(dir, 'verify.json'), `${JSON.stringify(report, null, 2)}\n`);
    return { dir, report };
  } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      words: { type: 'string' }, heard: { type: 'string' }, out: { type: 'string' } } });
    if (p.length !== 1 || !v.words) throw fail(usageText('footage verify'), 2);
    const { dir, report } = verify({ video: p[0], words: v.words, heard: v.heard ?? null, out: v.out ?? null });
    for (const w of report.warnings) console.error(`warning: ${w}`);
    if (!report.cuts.length) console.log('the plan has no cuts: nothing to check');
    for (const [i, c] of report.cuts.entries()) {
      const bits = [...c.clipped.map((x) => `clipped "${x.word}" (heard "${x.heard}")`), ...c.missing.map((x) => `missing "${x.word}"`), ...c.extra.map((x) => `leftover "${x.word}"`)];
      console.log(`cut ${i + 1} at ${c.at} s: ${bits.length ? fenceLine(bits.join(', '), 'transcript') : `clean (${c.checked} words)`}`);
    }
    console.log(`${report.ok ? 'every cut clean' : 'words clipped or missing at the cuts'}; wrote ${join(dir, 'verify.json')}${report.strips.length ? ` and ${report.strips.length} frame strips` : ''}`);
    return report.ok ? 0 : 1;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage verify')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
