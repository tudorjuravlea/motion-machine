#!/usr/bin/env node
// mm showcase <file> [--device phone|tablet|laptop|browser] [--look hero|turntable|still|showcase|cross|drawn] [--zoom]
//   [--duration N] [--fps N] [--format F] [--style <preset|path>] [--background #hex] [--contained] [--html]
//   [--stills N|s1,s2] [--audio <file>] [--piece <dir>] [--out <file>] [--check]   (SPEC §8)
// One command from a screen recording or a still to a finished device film: it plans the piece from the file
// (the device from the content's shape, the whole recording as the length, the format nearest the device's screen),
// writes a generated piece (story.json stamped `generator`, so the studio reads it as written by this script) with
// the recording prepared (`mm media prep`) or the still copied, runs the gate and exports the MP4. The looks are the
// device's own moves. Nothing zooms unless --zoom asks: then `screen/zoom-to` zooms on the clicks and taps of the
// recording's pointer track, or, with no track, where the recording moves (scripts/lib/activity.mjs).
// --check prints the plan and writes nothing. --html also writes out/hero.html, one self-contained page that plays
// the film once and then idles with a float that follows the pointer. --stills writes a contact sheet instead of
// the film. --audio lays a finished track under the MP4. The piece is pieces/showcase-<name>/ unless --piece says;
// a second run on it writes it again. Exit 0 done, 1 the gate or a tool failed, 2 usage or setup.
// The command and its flags follow showcase (MIT, same author; see NOTICE); its plan, check report, stills
// times and audio pass are ported here, its looks and devices are not (Motion Machine's own are used).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, framePng, openPiece } from './lib/browser.mjs';
import { UsageError, runMain, slug } from './lib/cli.mjs';
import { probe, runFfmpeg } from './lib/ffmpeg.mjs';
import { isHdr } from './lib/hdr.mjs';
import { writeLicence } from './lib/licence.mjs';
import { analyzeActivity, toRegions } from './lib/activity.mjs';
import { heroPage } from './lib/hero-page.mjs';
import { newPiece } from './new.mjs';
import { prep } from './media-prep.mjs';

export const GENERATOR = 'scripts/showcase.mjs';
export const DEVICES = { phone: '3d/phone', tablet: '3d/tablet', laptop: '3d/laptop', browser: 'devices/browser' };
const TURNS = ['hero', 'turntable', 'still', 'showcase'];
/** The looks each device takes: its own moves. */
export const LOOKS = { phone: [...TURNS, 'cross', 'drawn'], tablet: TURNS, laptop: TURNS, browser: ['hero', 'still'] };
const FORMATS = { '9x16': 9 / 16, '4x5': 4 / 5, '1x1': 1, '16x9': 16 / 9 };
/** The screen's width over its height, for the format nearest it. */
const SCREEN = { phone: 0.46, tablet: 0.75, laptop: 1.6, browser: 1.6 };
const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const RANGES = { duration: [1, 120], fps: [5, 60] };
const AUTO_MIN = 6, AUTO_MAX = 120, STILL_S = 10;
export const STILLS_MAX = 24;
export const AUDIO_FADE = 0.8;

const fail = (m) => new UsageError(m);

/** argv after `mm showcase` to options; a usage mistake throws before any file is read. */
export function parseShowcase(argv) {
  const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    device: { type: 'string' }, look: { type: 'string' }, duration: { type: 'string' }, fps: { type: 'string' }, format: { type: 'string' },
    style: { type: 'string' }, background: { type: 'string' }, contained: { type: 'boolean' }, zoom: { type: 'boolean' }, html: { type: 'boolean' }, stills: { type: 'string' },
    audio: { type: 'string' }, piece: { type: 'string' }, out: { type: 'string' }, check: { type: 'boolean' } } });
  if (p.length !== 1) throw fail('mm showcase needs one file: a screen recording or a still');
  const ext = extname(p[0]).toLowerCase();
  if (!VIDEO.has(ext) && !IMAGE.has(ext)) throw fail(`mm showcase takes a video (${[...VIDEO].join(' ')}) or a still (${[...IMAGE].join(' ')}), not ${basename(p[0])}`);
  if (v.device && !DEVICES[v.device]) throw fail(`--device takes ${Object.keys(DEVICES).join(', ')}, not ${v.device}`);
  if (v.format && !FORMATS[v.format]) throw fail(`--format takes ${Object.keys(FORMATS).join(', ')}, not ${v.format}`);
  if (v.background && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.background)) throw fail(`--background takes a hex colour (#1f2a44), not ${v.background}; a palette role comes from --style`);
  const opts = { file: p[0], kind: VIDEO.has(ext) ? 'video' : 'image', ...v };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (v[k] == null) continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < lo || n > hi) throw fail(`--${k} takes ${lo} to ${hi}, not ${v[k]}`);
    opts[k] = n;
  }
  if (v.background) opts.background = v.background.length === 4 ? `#${[...v.background.slice(1)].map((c) => c + c).join('')}` : v.background;
  if (v.stills && v.html) throw fail('--stills writes a contact sheet, --html a page: pick one');
  if (v.zoom && v.contained) throw fail('--contained keeps the whole device in frame, so it makes no zooms: drop --zoom or --contained');
  return opts;
}

const nearest = (aspect) => Object.entries(FORMATS).sort((a, b) => Math.abs(Math.log(a[1] / aspect)) - Math.abs(Math.log(b[1] / aspect)))[0][0];

/** The whole plan, from the options and what the file is ({ kind, w, h, duration, codec, hdr }). Pure. */
export function planShowcase(opts, info) {
  const landscape = info.w > info.h;
  const device = opts.device ?? (landscape ? 'laptop' : 'phone');
  if (device === 'phone' && landscape) throw fail(`a phone shows a portrait screen and this ${info.kind} is landscape (${info.w}x${info.h}): use --device tablet, laptop or browser`);
  const orientation = device === 'tablet' ? (landscape ? 'landscape' : 'portrait') : device === 'phone' ? 'portrait' : 'landscape';
  const look = opts.look ?? 'hero';
  if (!LOOKS[device].includes(look)) throw fail(`--look: a ${device} takes ${LOOKS[device].join(', ')}, not ${look}`);
  const screen = device === 'tablet' && landscape ? 1 / SCREEN.tablet : SCREEN[device];
  const raw = info.kind === 'video' ? info.duration : null;
  const duration = opts.duration ?? (info.kind === 'image' ? STILL_S : Math.round(Math.min(AUTO_MAX, Math.max(AUTO_MIN, raw)) * 1000) / 1000);
  const contained = !!opts.contained;
  const piece = resolve(opts.piece ?? join(ROOT, 'pieces', `showcase-${slug(basename(opts.file, extname(opts.file))) || 'film'}`));
  return {
    file: resolve(opts.file), kind: info.kind, w: info.w, h: info.h, source: raw, codec: info.codec, hdr: !!info.hdr,
    device, fx: DEVICES[device], orientation, look, move: look,
    zooms: !!opts.zoom && info.kind === 'video', contained,
    duration, clamped: opts.duration == null && raw != null && raw !== duration, fps: opts.fps ?? 30,
    format: opts.format ?? nearest(screen), style: opts.style ?? 'calm-product', background: opts.background ?? null,
    piece, id: slug(basename(piece)) || 'showcase', out: opts.out ? resolve(opts.out) : null,
    html: !!opts.html, stills: opts.stills ?? null, audio: opts.audio ? resolve(opts.audio) : null,
  };
}

/** The --check report: the resolved plan as lines. Pure. */
export function checkReport(p) {
  const lines = [
    `input: ${p.file}`,
    `content: ${p.kind} ${p.w}x${p.h}${p.kind === 'video' ? `, ${p.source.toFixed(1)} s, codec ${p.codec}` : ''}`,
    `device: ${p.fx} (${p.orientation})`,
    `look: ${p.look}${p.zooms ? ', with zooms on the clicks and taps (or where it moves, with no pointer track)' : ', no zooms'}, duration ${p.duration} s at ${p.fps} fps`,
    `format: ${p.format}, style ${p.style}, background: ${p.background ?? 'the style\'s canvas'}`,
    `piece: ${relative(ROOT, p.piece) || p.piece}${existsSync(p.piece) ? ' (exists, written again)' : ''}`,
    `output: ${p.stills ? `a contact sheet of ${p.stills}` : `out/${p.id}-${p.format}.mp4${p.html ? ' and the hero page out/hero.html' : ''}`}${p.out ? `, copied to ${p.out}` : ''}`,
  ];
  if (p.contained) lines.push('contained: the device stays inside the safe margin, no zooms');
  if (p.audio) lines.push(`audio: ${p.audio}, padded or trimmed to the film with an end fade`);
  if (p.hdr) lines.push('note: an HDR source, made BT.709 SDR as it is prepared');
  if (p.clamped) lines.push(`note: the length is held to ${p.duration} s (the recording is ${p.source.toFixed(1)} s)`);
  if (p.duration < 20 || p.duration > 60) lines.push('note: outside 20 to 60 s, so the gate warns W-LENGTH (advice, it does not block)');
  return lines;
}

/** The story the piece holds. `track`: the recording has a pointer track (zooms on its clicks); `regions`: the zooms measured from where it moves. Pure. */
export function storyOf(p, { track = false, regions = [] } = {}) {
  const asset = p.kind === 'video' ? 'assets/rec/' : `assets/screen${extname(p.file).toLowerCase()}`;
  const params = p.device === 'browser' ? { size: 'large' } : { move: p.move, ...(p.device === 'tablet' ? { orientation: p.orientation } : {}) };
  const beat = { at: 0, slot: 'stage', fx: p.fx, asset, params };
  if (p.zooms && track) beat.screen = [{ do: 'screen/zoom-to', at: 0, d: p.duration, params: { mode: 'auto' } }];
  else if (p.zooms && regions.length) beat.screen = [{ do: 'screen/zoom-to', at: 0, d: p.duration, params: { mode: 'auto', suggest: false, follow: 0, regions } }];
  const title = basename(p.file, extname(p.file)).slice(0, 80) || 'Showcase';
  return {
    id: p.id, kind: 'film', generator: GENERATOR, formats: [p.format], title, language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
    scenes: [{ id: 'showcase', layout: p.contained ? 'layouts/caption-bar' : 'layouts/stage', duration: p.duration, cut: 'transitions/hard-cut',
      move: p.device === 'browser' && p.move === 'hero' ? 'moves/hero-drift' : null, beats: [beat], say: '' }],
    cta: { text: title, url: '' },
  };
}

/** --stills: a count spreads evenly over the film, seconds are kept; the last instant is just before the end. */
export function stillTimes(spec, duration) {
  const end = Math.round(duration * (1 - 1 / 300) * 1000) / 1000;
  const text = String(spec);
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (n < 2 || n > STILLS_MAX) throw fail(`--stills takes 2 to ${STILLS_MAX} frames, not ${n}`);
    return Array.from({ length: n }, (_, i) => Math.min(end, Math.round((duration * i) / (n - 1) * 1000) / 1000));
  }
  const s = text.split(',').map(Number);
  if (!s.length || s.some((x) => !Number.isFinite(x) || x < 0) || s.length > STILLS_MAX) throw fail(`--stills takes a count (6) or seconds (0,2.5,9), at most ${STILLS_MAX}, not ${text}`);
  return s.map((x) => Math.min(end, x));
}

/** The ffmpeg arguments that lay `audio` under the picture: the video copied, the sound padded or trimmed, faded out. */
export function audioMuxArgs(picture, audio, out, duration) {
  const fade = Math.min(AUDIO_FADE, duration), start = Math.round((duration - fade) * 1000) / 1000;
  return ['-i', picture, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', `afade=t=out:st=${start}:d=${fade},apad`,
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out];
}

/** What the file is: { kind, w, h, duration, codec, hdr }. */
export function probeInput(file, kind) {
  if (!existsSync(file)) throw fail(`no such file: ${file}`);
  let info;
  try { info = probe(file); } catch (e) { throw new UsageError(`ffprobe could not read ${basename(file)}: ${e.message.split('\n').pop()}`, e.exitCode ?? 1); }
  const v = info.streams?.find((s) => s.codec_type === 'video');
  if (!v) throw new UsageError(`${basename(file)} has no picture`, 1);
  const turned = Math.abs(Number(v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0)) % 180 === 90;
  return { kind, w: turned ? v.height : v.width, h: turned ? v.width : v.height, duration: kind === 'video' ? Number(info.format?.duration) || 0 : null, codec: v.codec_name, hdr: isHdr(v.color_transfer) };
}

const run = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { stdio: 'inherit' }).status;
const say = (m) => console.log(`mm showcase: ${m}`);

/** A piece this script wrote may be written again; anything else in the way is left alone. */
function clear(dir) {
  if (!existsSync(dir)) return;
  const story = join(dir, 'story.json');
  const mine = existsSync(story) && (() => { try { return JSON.parse(readFileSync(story, 'utf8')).generator === GENERATOR; } catch { return false; } })();
  if (!mine) throw fail(`${relative(ROOT, dir)} exists and was not written by mm showcase; pick another --piece`);
  rmSync(dir, { recursive: true, force: true });
}

async function stillsSheet(p, times) {
  const dir = join(p.piece, 'out', 'stills');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const o = await openPiece(p.piece, { format: p.format });
  const files = [];
  try {
    for (const [i, t] of times.entries()) { const f = join(dir, `${String(i + 1).padStart(2, '0')}-${t}s.png`); writeFileSync(f, await framePng(o.page, t)); files.push(f); }
  } finally { await o.close(); }
  const cols = Math.min(files.length, 6), rows = Math.ceil(files.length / cols);
  const sheet = join(p.piece, 'out', 'stills.jpg');
  const chain = `${files.map((_, i) => `[${i}:v]scale=-2:480,setsar=1[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}concat=n=${files.length}:v=1:a=0,tile=${cols}x${rows}:padding=8:color=black`;
  await runFfmpeg([...files.flatMap((f) => ['-i', f]), '-filter_complex', chain, '-frames:v', '1', '-q:v', '3', sheet]);
  return { sheet, rows, cols };
}

async function main() {
  const opts = parseShowcase(process.argv.slice(2));
  const p = planShowcase(opts, probeInput(opts.file, opts.kind));
  if (opts.check) { console.log(checkReport(p).join('\n')); return 0; }
  const stills = p.stills ? stillTimes(p.stills, p.duration) : null;
  if (p.audio && !existsSync(p.audio)) throw fail(`no such file: ${p.audio}`);
  const inside = relative(ROOT, p.piece);
  if (inside.startsWith('..') || isAbsolute(inside)) throw fail(`--piece must be inside the repo (${ROOT}): the kit and patterns are served from it`);

  clear(p.piece);
  newPiece({ kind: 'film', style: p.style, dir: p.piece, id: p.id });
  if (p.background) {
    const file = join(p.piece, 'style.json'), style = JSON.parse(readFileSync(file, 'utf8'));
    style.color.canvas = p.background;
    writeFileSync(file, `${JSON.stringify(style, null, 2)}\n`);
  }
  let regions = [], track = false;
  if (p.kind === 'video') {
    const fit = p.device === 'phone' ? 'phone' : p.device === 'tablet' ? (p.orientation === 'portrait' ? '1200x1600' : '1600x1200') : 'laptop';
    const { meta } = await prep({ file: p.file, name: 'rec', piece: p.piece, fps: p.fps, fit });
    say(`prepared ${meta.frames} frames${meta.hdr ? ' (HDR made SDR)' : ''}`);
    if (p.zooms && meta.cursor) say('zooming on the clicks and taps of the pointer track');
    else if (p.zooms) {
      regions = toRegions(await analyzeActivity(p.file), { duration: Math.min(p.duration, meta.duration) });
      say(regions.length ? `no pointer track: zooming on ${regions.length} stretch${regions.length > 1 ? 'es' : ''} where the recording moves` : 'no pointer track and no local motion: nothing to zoom on');
    }
    track = !!meta.cursor;
    writeLicence(p.piece, 'assets/rec.licence.json', { source: basename(p.file), licence: 'own recording', licenceUrl: null, author: null, credit: null, providerPage: null, retrieved: new Date().toISOString().slice(0, 10) });
  } else {
    const rel = `assets/screen${extname(p.file).toLowerCase()}`;
    copyFileSync(p.file, join(p.piece, rel));
    writeLicence(p.piece, `${rel.replace(/\.[^.]+$/, '')}.licence.json`, { source: basename(p.file), licence: 'own', licenceUrl: null, author: null, credit: null, providerPage: null, retrieved: new Date().toISOString().slice(0, 10) });
  }
  writeFileSync(join(p.piece, 'story.json'), `${JSON.stringify(storyOf(p, { track, regions }), null, 2)}\n`);

  if (stills) {
    const { sheet } = await stillsSheet(p, stills);
    say(`wrote ${sheet}`);
    if (p.out) { copyFileSync(sheet, p.out); say(`wrote ${p.out}`); }
    return 0;
  }
  const checked = run(['check', p.piece, '--quiet']);
  if (checked !== 0) { console.error(`mm showcase: the gate stopped the film (exit ${checked}); see ${relative(ROOT, join(p.piece, 'out/check.json'))}`); return checked === 2 ? 2 : 1; }
  const exported = run(['export', p.piece, '--fps', String(p.fps), '--force']);
  if (exported !== 0) return exported === 2 ? 2 : 1;
  let mp4 = join(p.piece, 'out', `${p.id}-${p.format}.mp4`);
  if (p.audio) {
    const sound = join(p.piece, 'out', `${p.id}-${p.format}-sound.mp4`);
    await runFfmpeg(audioMuxArgs(mp4, p.audio, sound, p.duration));
    mp4 = sound;
  }
  say(`wrote ${mp4}`);
  let final = mp4;
  if (p.html) {
    const style = JSON.parse(readFileSync(join(p.piece, 'style.json'), 'utf8'));
    const page = join(p.piece, 'out', 'hero.html');
    const { html, bytes } = heroPage({ mp4: readFileSync(mp4), title: storyOf(p).title, canvas: style.color.canvas });
    writeFileSync(page, html);
    if (bytes > 25 * 1024 * 1024) console.error(`mm showcase: the hero page is ${Math.round(bytes / 1048576)} MB; a shorter --duration or a lower --fps makes it lighter`);
    say(`wrote ${page}`);
    final = page;
  }
  if (p.out) { copyFileSync(final, p.out); say(`wrote ${p.out}`); }
  return 0;
}

runMain(import.meta, main);
