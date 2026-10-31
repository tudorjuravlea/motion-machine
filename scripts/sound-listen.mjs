#!/usr/bin/env node
// `mm sound-listen [--out dir] [--cues a,b] [--profiles glass,soft-ui] [--calibrate]` (SPEC §9).
//
//   every recipe cue under patterns/sound/ ──► rendered offline (Chromium OfflineAudioContext, stereo,
//   48 kHz) under each sound profile and each emphasis ──► measured (scripts/lib/audio-measure.mjs) ──►
//   <out>/listen.html: a player for each, the numbers beside it, and the profile's bands marked
//   <out>/wav/<cue>-<profile>[-<emphasis>].wav, <out>/numbers.json
//
// `--calibrate` first sets each recipe's masterGain so its loudest 100 ms lands on the matched level
// (-30 LUFS) rendered as written, and rewrites recipe.json (only masterGain changes). Run it after
// writing or editing a recipe; a cue's level under a profile then follows from the profile.
//
// The page is for listening: it opens from the folder (relative links), needs no server and loads
// nothing from the network. The numbers are measured on the same samples the players play.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT } from './lib/browser.mjs';
import { measure } from './lib/audio-measure.mjs';
import { openRenderer } from './lib/cue-render.mjs';
import { loadProfile, loadRecipe } from './lib/sound-profile.mjs';
import { NATIVE_LUFS, familyOf, renderRecipe } from '../runtime/kit/synth.js';

const SR = 48000;
const SECONDS = 2.2;
const AT = 0.05;                  // where a code cue starts in its render
export const EMPHASES = ['subtle', 'normal', 'strong'];
const round = (x, p = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : x);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** [{ name, file, recipe }] of every cue under `<patterns>/sound/` that is data. */
export function recipeCues(patterns = join(ROOT, 'patterns')) {
  const base = join(patterns, 'sound');
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, 'recipe.json')))
    .map((d) => ({ name: d.name, file: join(base, d.name, 'recipe.json'), recipe: loadRecipe(join(base, d.name, 'recipe.json')) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A recipe's masterGain that puts its loudest 100 ms, rendered as written at normal emphasis, on NATIVE_LUFS. */
export function calibratedGain(recipe) {
  const { channels, sampleRate } = renderRecipe({ ...recipe, masterGain: 1 }, { sampleRate: SR });
  return round(10 ** ((NATIVE_LUFS - measure(channels, sampleRate).lufs100ms) / 20), 4);
}

/** 16-bit stereo WAV of the channels, cut after the last sample above -70 dBFS plus 40 ms. */
export function wavOf(channels, sr) {
  let last = 0;
  for (const c of channels) for (let i = c.length - 1; i > last; i--) if (Math.abs(c[i]) > 3e-4) { last = i; break; }
  const n = Math.min(channels[0].length, last + Math.round(sr * 0.04));
  const ch = channels.length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32767))), 44 + (i * ch + c) * 2);
  return buf;
}

const pass = (ok) => (ok ? 'ok' : 'miss');

/** The verdicts of one render against a profile's bands. */
export function verdicts(m, profile, recipe, emphasis = 'normal') {
  const t = profile.loudness;
  const out = {
    level: Math.abs(m.lufs100ms - t.cueLufs100ms) <= t.tolDb * (emphasis === 'normal' ? 1 : 2),   // an arrangement that drops or adds a layer may sit a little off the matched level
    peak: m.peakDbfs <= t.peakDbfs,
    balance: Math.abs(m.balanceDb) <= 0.5,
    centre: m.centroidHz <= profile.register.maxCentreHz,
    length: true,
  };
  out.length = m.audibleS <= recipe.durationS + profile.room.sizeS;   // the cue's own length, then the room's tail
  return out;
}

export const CSS = `:root{color-scheme:light dark;--bg:#fafaf8;--ink:#1b1b1a;--mu:#666;--ln:#d9d9d4;--ok:#1d6f42;--bad:#a1281d;--sf:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--ink:#ecece8;--mu:#999;--ln:#33332f;--ok:#58b583;--bad:#e5766b;--sf:#1e1e1c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}
p.lead{color:var(--mu);margin:0 0 20px;max-width:70ch}table{border-collapse:collapse;width:100%;background:var(--sf)}
th,td{border:1px solid var(--ln);padding:8px 10px;vertical-align:top;text-align:left}th{font-weight:600;font-size:13px;color:var(--mu)}
td.name{width:170px}td.name b{display:block}td.name span{color:var(--mu);font-size:13px}audio{width:100%;min-width:200px;height:34px}
.pn{font-size:12px;font-weight:600;color:var(--mu);margin-bottom:2px}.nums{font:12px/1.5 ui-monospace,Menlo,monospace;color:var(--mu);margin-top:6px}.nums b{color:var(--ink);font-weight:600}
.ok{color:var(--ok)}.miss{color:var(--bad);font-weight:600}details{margin-top:6px}summary{cursor:pointer;color:var(--mu);font-size:13px}
.em{display:flex;gap:8px;align-items:center;margin-top:4px}.em label{font-size:12px;color:var(--mu);width:48px}
@media (max-width:760px){table,tbody,tr,td,th{display:block}th{display:none}td.name{width:auto}}`;

function numbers(m, v) {
  const mark = (k, text) => `<span class="${pass(v[k])}">${text}</span>`;
  const partials = m.peaks.length ? m.peaks.slice(0, 6).map((p) => `${Math.round(p.f)}`).join(' ') : 'none';
  return `<div class="nums">length <b>${round(m.audibleS, 2)}</b> s · attack <b>${m.attackS == null ? 'n/a' : round(m.attackS * 1000, 1)}</b> ms · T60 <b>${m.t60S == null ? 'n/a' : round(m.t60S, 2)}</b> s<br>
loudest 100 ms ${mark('level', `<b>${round(m.lufs100ms)}</b> LUFS`)} · whole ${round(m.lufsIntegrated)} LUFS · peak ${mark('peak', `<b>${round(m.peakDbfs)}</b> dBFS`)}<br>
centroid <b>${Math.round(m.centroidHz)}</b> Hz ${mark('centre', v.centre ? 'in register' : 'above register')} · roll-off ${Math.round(m.rolloffHz)} Hz · flatness ${round(m.flatness, 3)}<br>
left−right ${mark('balance', `<b>${round(m.balanceDb, 2)}</b> dB`)} · side/mid ${Number.isFinite(m.sideMidDb) ? `${round(m.sideMidDb)} dB` : 'mono'}<br>
strongest peaks (Hz) ${partials}</div>`;
}

/**
 * Renders and measures every recipe cue under every profile and emphasis, writes the WAVs, numbers.json and
 * listen.html under `out`. Returns the records. `code` lists the code cues (rendered in the soft-ui feel,
 * for comparison).
 */
export async function buildListen({ out, cues = null, profiles = ['glass', 'soft-ui'], patterns = join(ROOT, 'patterns'), code = true, log = () => {} } = {}) {
  out = resolve(out);
  const wavDir = join(out, 'wav');
  mkdirSync(wavDir, { recursive: true });
  const profs = profiles.map((p) => loadProfile(p));
  const list = recipeCues(patterns).filter((c) => !cues || cues.includes(c.name));
  const codeNames = code ? readdirSync(join(patterns, 'sound')).filter((n) => existsSync(join(patterns, 'sound', n, 'pattern.js')) && existsSync(join(patterns, 'sound', n, 'PATTERN.md'))).sort() : [];
  const records = [];
  for (const c of list) for (const prof of profs) for (const emphasis of EMPHASES) {
    const { channels, sampleRate } = renderRecipe(c.recipe, { sampleRate: SR, emphasis, profile: prof });
    const m = measure(channels, sampleRate);
    {
      const file = `${c.name}-${prof.name}${emphasis === 'normal' ? '' : `-${emphasis}`}.wav`;
      writeFileSync(join(wavDir, file), wavOf(channels, sampleRate));
      records.push({ cue: c.name, profile: prof.name, emphasis, file: `wav/${file}`, ...m, verdict: verdicts(m, prof, c.recipe, emphasis) });
      log(`${file}  ${round(m.lufs100ms)} LUFS  ${round(m.peakDbfs)} dBFS`);
    }
  }
  const renderer = codeNames.length ? await openRenderer() : null;
  try {
    for (const n of codeNames) {
      const { channels, sampleRate } = await renderer.renderChannels([{ cue: n, at: AT, feel: 'soft-ui', opts: {} }], { seconds: SECONDS, sampleRate: SR });
      const m = measure(channels, sampleRate);
      const file = `code-${n}-soft-ui.wav`;
      writeFileSync(join(wavDir, file), wavOf(channels, sampleRate));
      records.push({ cue: n, profile: 'code (soft-ui feel)', emphasis: 'normal', file: `wav/${file}`, code: true, ...m });
    }
  } finally { await renderer?.close(); }

  const rows = list.map((c) => {
    const cells = profs.map((prof) => {
      const rs = EMPHASES.map((e) => records.find((r) => r.cue === c.name && r.profile === prof.name && r.emphasis === e));
      const n = rs[1];
      return `<td><div class="pn">${esc(prof.name)}</div><audio controls preload="none" src="${n.file}"></audio>${numbers(n, n.verdict)}
<details><summary>subtle and strong</summary>${[0, 2].map((i) => `<div class="em"><label>${EMPHASES[i]}</label><audio controls preload="none" src="${rs[i].file}"></audio></div>`).join('')}</details></td>`;
    });
    return `<tr><td class="name"><b>${esc(c.name)}</b><span>${esc(c.recipe.meaning)}</span><br><span>${familyOf(c.recipe.durationS)} · ${c.recipe.durationS} s</span></td>${cells.join('')}</tr>`;
  });
  const codeRows = records.filter((r) => r.code).map((r) => `<tr><td class="name"><b>${esc(r.cue)}</b><span>code cue, soft-ui feel</span></td><td colspan="${profs.length}"><audio controls preload="none" src="${r.file}"></audio>${numbers(r, { level: true, peak: true, balance: true, centre: true })}</td></tr>`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sound palette</title><style>${CSS}</style></head>
<body><main>
<h1>Sound palette</h1>
<p class="lead">Every recipe cue, rendered offline in stereo at 48 kHz under each sound profile, with what was measured on those same samples. Level is the loudest 100 ms, K-weighted; the band is the profile's. Open the folder's wav/ files in any player if you prefer.</p>
<table><thead><tr><th>Cue</th>${profs.map((p) => `<th>${esc(p.name)}: matched to ${p.loudness.cueLufs100ms} LUFS ± ${p.loudness.tolDb}, peak under ${p.loudness.peakDbfs} dBFS</th>`).join('')}</tr></thead>
<tbody>${rows.join('\n')}</tbody></table>
${codeRows.length ? `<h2>The code cues, for comparison</h2><p class="lead">The nine cues written as code, in the soft-ui feel. They are peak-matched, not loudness-matched, so their levels are not the palette's.</p><table><tbody>${codeRows.join('\n')}</tbody></table>` : ''}
</main></body></html>
`;
  writeFileSync(join(out, 'listen.html'), html);
  writeFileSync(join(out, 'numbers.json'), `${JSON.stringify(records.map(({ peaks, ...r }) => ({ ...r, peaks: peaks.map((p) => ({ f: round(p.f, 1), db: round(p.db) })) })), (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? round(v, 3) : v), 2)}\n`);
  return { out, records, page: join(out, 'listen.html') };
}

export function calibrateAll({ patterns = join(ROOT, 'patterns'), cues = null, log = () => {} } = {}) {
  const done = [];
  {
    for (const c of recipeCues(patterns).filter((x) => !cues || cues.includes(x.name))) {
      const masterGain = calibratedGain(c.recipe);
      const text = readFileSync(c.file, 'utf8');
      const next = /"masterGain"\s*:\s*[0-9.eE+-]+/.test(text) ? text.replace(/"masterGain"\s*:\s*[0-9.eE+-]+/, `"masterGain": ${masterGain}`) : text.replace(/\n\}\s*$/, `,\n  "masterGain": ${masterGain}\n}\n`);
      writeFileSync(c.file, next);
      done.push({ cue: c.name, masterGain });
      log(`${c.name}: masterGain ${masterGain}`);
    }
  }
  return done;
}

export async function main(argv) {
  let a;
  try {
    a = parseArgs({ args: argv, options: { out: { type: 'string', default: 'out/sound-listen' }, cues: { type: 'string' }, profiles: { type: 'string', default: 'glass,soft-ui' }, calibrate: { type: 'boolean', default: false } }, strict: true }).values;
  } catch (e) { console.error(`sound-listen: ${e.message}\nusage: mm sound-listen [--out dir] [--cues a,b] [--profiles glass,soft-ui] [--calibrate]`); return 2; }
  try {
    const cues = a.cues ? a.cues.split(',').filter(Boolean) : null;
    if (a.calibrate) calibrateAll({ cues, log: console.log });
    const res = await buildListen({ out: a.out, cues, profiles: a.profiles.split(',').filter(Boolean), log: () => {} });
    console.log(`sound-listen: ${res.records.length} renders -> ${relative(process.cwd(), res.page)}`);
    return 0;
  } catch (e) { console.error(`sound-listen: ${e.message}`); return e.setup ? 2 : 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
