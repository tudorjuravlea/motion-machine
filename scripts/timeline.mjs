#!/usr/bin/env node
// mm timeline <piece> [--format F] [--json] [--plan] [--who NAME] [verb …]: the studio's
// timeline and its edits, for agents. Every write goes through
// scripts/lib/story-edit.mjs (the same journal the studio keeps), so `undo` undoes either's edits.
//
//   (no verb)                          the model as a table (scenes; beats with ref, start, end, text), or --json
//   move <ref> <time>                  a beat's at          move <scene> before|after <scene>   reorder
//   trim <scene> <time>                a scene's duration   out <ref> <time|none>               a beat's out
//   set <ref> <key>=<value>…           beat keys (text fx cue emphasis slot fact value asset) → beat.set,
//                                      anything else → beat.param; a scene takes say, cut, move; `<key>=` removes
//   apply <edits.json>                 edit ops from a file  undo [receipt|last]   check (timing verdicts)
//   selection                          what the studio has selected
// Refs: <scene>, <scene>/<slot> (its first beat in that slot), <scene>#<n> (beat index), <scene>/<slot>#<n>
// (the n-th beat in that slot); n counts from 0, as beat indexes do. Beats are the --format's variant
// beats when that variant has its own. Times: 4.5, 4.5s, +0.5, -0.25 (relative to the current value),
// 30f (frames at 30 fps, +3f relative), beat:<n> and bar:<n> (the n-th music beat or downbeat of the
// story's beats.json, counted from 1 as a musician counts, as a time inside the scene), end (the
// scene's end). --plan prints a unified diff of story.json and writes nothing; --json prints the
// receipt { version, receipt, changed }; --who names the journal's author (default cli; not studio or
// outside, which SSE reserves). A refusal exits 2 with one line `refused (<code>): <reason>` and a hint
// (under --json, `{ refused: { code, reason, hint } }` on stdout); a usage mistake exits 2 with the
// usage; `check` exits 1 when a G- rule fails. After every write the timing verdicts that changed are
// printed, new failures first.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './lib/browser.mjs';
import { UsageError, resolvePiece, runMain, usageText } from './lib/cli.mjs';
import { loadPatterns } from './check.mjs';
import { patternsBaseOf } from './lib/patterns-base.mjs';
import { loadGrid } from './sound.mjs';
import { addImplicitPlays, forFormat, resolveStory, schedule as buildSchedule } from '../runtime/kit/schedule.js';
import { timelineModel } from './studio/model.js';
import { TIMING_IDS, timingRules } from './check/timing.mjs';
import { beatsOf } from './lib/cues.mjs';
import { ChangedSince, EditRefused, ExportRunning, NoReceipt, SchemaRefused, StaleVersion, Unreadable, Unwritable, editStory, readStory, undoReceipt } from './lib/story-edit.mjs';

const VERBS = ['move', 'trim', 'out', 'set', 'apply', 'undo', 'check', 'selection'];
const BEAT_SET = ['text', 'fx', 'cue', 'emphasis', 'slot', 'fact', 'value', 'asset'];
const SCENE_SET = ['say', 'cut', 'move'];
const FPS = 30;

/** A refusal: exit 2 with the reason and a hint. */
class Refusal extends Error {
  constructor(code, reason, hint) { super(reason); this.code = code; this.reason = reason; this.hint = hint; }
}
const usage = (msg) => new UsageError(`timeline: ${msg}\n${usageText('timeline')}`);

export function parseArgs(argv) {
  const o = { format: null, json: false, plan: false, who: 'cli', pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.pos.push(...argv.slice(i + 1)); break; }
    if (!a.startsWith('--')) { o.pos.push(a); continue; }
    const [flag, inline] = a.split(/=(.*)/s);
    const value = () => { const v = inline ?? argv[++i]; if (v === undefined || v.startsWith('--')) throw usage(`${flag} needs a value`); return v; };
    if (flag === '--format') o.format = value();
    else if (flag === '--who') {
      o.who = value();
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(o.who)) throw usage('--who is a short name: letters, digits, . _ -');
      if (['studio', 'outside'].includes(o.who)) throw usage(`--who ${o.who} is reserved: the studio's events name its own writes studio and unjournalled ones outside`);
    }
    else if (flag === '--json') o.json = true;
    else if (flag === '--plan') o.plan = true;
    else throw usage(`unknown option ${flag}`);
  }
  const [piece, verb, ...args] = o.pos;
  if (!piece) throw usage('name a piece');
  if (verb !== undefined && !VERBS.includes(verb)) throw usage(`unknown verb "${verb}" (verbs: ${VERBS.join(', ')})`);
  return { piece, verb: verb ?? null, args, format: o.format, json: o.json, plan: o.plan, who: o.who };
}

// ---- the piece as the gate sees it ------------------------------------------------------------

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const metaOf = (dir) => (asset) => { try { return readJson(join(dir, asset, 'media.json')); } catch { return null; } };

/** The schedule of `story` in `format`, built the way scripts/check.mjs builds the gate's. */
async function scheduleOf(dir, story, style, format) {
  const s = resolveStory(forFormat(story, format), style);
  addImplicitPlays(s, metaOf(dir));
  const patterns = await loadPatterns(s, patternsBaseOf(dir));
  return { resolved: s, schedule: buildSchedule(s, style, { patterns }) };
}

/**
 * The beats.json the story declares: { json, beats, downbeats } (beats read as the gate reads them,
 * scripts/lib/cues.mjs beatsOf: a bare array or { beats }, sorted), { error } when it does not parse,
 * or null when the story declares none or the file is not there.
 */
function gridJson(dir, story) {
  const rel = story.audio?.beats;
  if (!rel || !existsSync(resolve(dir, rel))) return null;
  let json;
  try { json = readJson(resolve(dir, rel)); } catch (e) { return { error: `${rel} is not JSON: ${e.message}` }; }
  const downbeats = Array.isArray(json?.downbeats) ? json.downbeats.map(Number).sort((a, b) => a - b) : [];
  return { json, beats: beatsOf(json) ?? [], downbeats };
}

const RANK = { FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };
const why = (ev) => (ev?.reason ?? ev?.message ?? ev?.note ?? '');

/** Timing verdicts per (rule, format): the worst row of each, in TIMING_IDS order. */
async function verdicts(dir, story, style, formats) {
  const out = [];
  for (const format of formats) {
    const { resolved, schedule } = await scheduleOf(dir, story, style, format);
    const rows = await timingRules({ schedule, story: resolved, style, grid: loadGrid(dir, resolved) });
    for (const id of TIMING_IDS) {
      const mine = rows.filter((r) => r.id === id);
      if (!mine.length) continue;
      const worst = mine.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
      out.push({ id, format, status: worst.status, evidence: worst.evidence ?? {} });
    }
  }
  return out;
}

/** The verdicts whose status changed, new failures first, then new warnings, then the rest. */
function changedVerdicts(before, after) {
  const was = new Map(before.map((v) => [`${v.id} ${v.format}`, v]));
  const order = (v) => (v.after === 'FAIL' ? 0 : v.after === 'WARN' ? 1 : 2);
  return after.filter((v) => was.get(`${v.id} ${v.format}`)?.status !== v.status)
    .map((v) => ({ id: v.id, format: v.format, before: was.get(`${v.id} ${v.format}`)?.status ?? null, after: v.status, reason: why(v.evidence) }))
    .map((v, i) => ({ v, i })).sort((a, b) => order(a.v) - order(b.v) || a.i - b.i).map(({ v }) => v);
}

// ---- refs and times ---------------------------------------------------------------------------

const REF = /^([A-Za-z0-9][A-Za-z0-9_-]*)(?:\/([a-z][a-z0-9-]*))?(?:#(\d+))?$/;
const beatsIn = (sc, format) => (Array.isArray(sc.variants?.[format]?.beats) ? sc.variants[format].beats : sc.beats);
/** The format member an op carries: only when the scene has a variant in that format. */
const fmt = (sc, format) => (sc.variants?.[format] ? { format } : {});

export function resolveRef(story, ref, format) {
  const m = REF.exec(String(ref));
  if (!m) throw new Refusal('bad-ref', `"${ref}" is not a ref`, 'refs are <scene>, <scene>/<slot>, <scene>#<n> or <scene>/<slot>#<n> (n from 0)');
  const [, id, slot, n] = m;
  const i = story.scenes.findIndex((s) => s.id === id);
  if (i < 0) throw new Refusal('unknown-scene', `no scene "${id}"`, `scenes: ${story.scenes.map((s) => s.id).join(', ')}`);
  const sc = story.scenes[i], beats = beatsIn(sc, format);
  if (slot === undefined && n === undefined) return { kind: 'scene', sc, i };
  if (slot === undefined) {
    const j = Number(n);
    if (j >= beats.length) throw new Refusal('unknown-beat', `no beat ${j} in ${id}`, `${id} has ${beats.length} beats here: use 0 to ${beats.length - 1}`);
    return { kind: 'beat', sc, i, j, beat: beats[j] };
  }
  const inSlot = beats.map((b, j) => [b, j]).filter(([b]) => b.slot === slot);
  const slots = [...new Set(beats.map((b) => b.slot))];
  if (!inSlot.length) throw new Refusal('unknown-beat', `${id} has no beat in slot "${slot}"`, `${id}'s slots here: ${slots.join(', ')}`);
  const k = Number(n ?? 0);
  if (k >= inSlot.length) throw new Refusal('unknown-beat', `${id} has ${inSlot.length} beat${inSlot.length > 1 ? 's' : ''} in ${slot}, not ${k + 1}`, `use ${id}/${slot}#0 to #${inSlot.length - 1}`);
  return { kind: 'beat', sc, i, j: inSlot[k][1], beat: inSlot[k][0] };
}

/**
 * A time token in seconds inside the scene. `current` is the value a relative time moves. A time
 * before the scene starts is refused here, as is a duration of 0 or less (`positive`); a
 * time past the scene's end is the ops' to refuse, with their hint.
 */
export function parseTime(tok, { current, start, duration, grid, scene, positive = false }) {
  const t = timeOf(tok, { current, start, duration, grid });
  if (positive && !(t > 0)) throw new Refusal('out-of-range', `a scene must be longer than 0 s, not ${f2(t)} s`, `trim ${scene} <duration> takes a duration above 0`);
  if (!positive && t < 0) throw new Refusal('out-of-range', `${tok} is ${f2(-t)} s before ${scene} starts`, `times inside ${scene} run from 0 to ${f2(duration)} s (+/- move from the current value)`);
  return t;
}
function timeOf(tok, { current, start, duration, grid }) {
  if (tok === 'end') return duration;
  const g = /^(beat|bar):(\d+)$/.exec(tok);
  if (g) {
    if (!grid) throw new Refusal('no-grid', `${tok} needs a beat grid`, 'the story declares none: set audio.beats to its beats.json (mm beats writes one)');
    if (grid.error) throw new Refusal('no-grid', grid.error, 'run mm beats on the track again');
    const list = g[1] === 'beat' ? grid.beats : grid.downbeats;
    if (!list.length) throw new Refusal('no-grid', `the beat grid has no ${g[1] === 'beat' ? 'beats' : 'downbeats'}`, 'run mm beats on the track again');
    const k = Number(g[2]);
    if (k < 1 || k > list.length) throw new Refusal('out-of-range', `no ${tok}`, `the grid has ${list.length} ${g[1]}s, counted from 1`);
    return list[k - 1] - start;
  }
  const t = /^([+-])?(\d+(?:\.\d+)?|\.\d+)(s|f)?$/.exec(tok);
  if (!t) throw new Refusal('bad-time', `"${tok}" is not a time`, 'times: 4.5, 4.5s, +0.5, -0.25, 30f, +3f, beat:<n>, bar:<n>, end');
  const v = Number(t[2]) / (t[3] === 'f' ? FPS : 1);
  return t[1] ? current + (t[1] === '-' ? -v : v) : v;
}

/** `key=value` → [key, value]: '' removes (null); JSON when it parses, else the text; `asText` keeps text. */
function parseSet(pair, asText) {
  const k = pair.indexOf('=');
  if (k < 1) throw usage(`"${pair}" is not key=value`);
  const key = pair.slice(0, k), raw = pair.slice(k + 1);
  if (raw === '') return [key, null];
  if (asText && !raw.startsWith('"')) return [key, raw];
  try { return [key, JSON.parse(raw)]; } catch { return [key, raw]; }
}

/** The edit ops a verb names. */
function editsFor(verb, args, { story, format, sceneStart, grid }) {
  const need = (n, shape) => { if (args.length < n) throw usage(`${verb} takes ${shape}`); };
  const most = (n) => { if (args.length > n) throw usage(`${verb}: unexpected argument ${args[n]}`); };
  const when = (sc, current, positive = false) => ({ current, start: sceneStart(sc.id), duration: sc.duration, grid, scene: sc.id, positive });
  switch (verb) {
    case 'move': {
      need(2, '<ref> <time>, or <scene> before|after <scene>');
      const r = resolveRef(story, args[0], format);
      if (r.kind === 'scene') {
        if (!['before', 'after'].includes(args[1]) || args.length < 3) throw new Refusal('bad-ref', `move ${args[0]} needs before|after <scene>`, `move a scene with before|after <scene>; trim ${args[0]} <duration> changes its duration; move <scene>#<n> <time> moves a beat`);
        most(3);
        const other = resolveRef(story, args[2], format);
        if (other.kind !== 'scene') throw new Refusal('bad-ref', `${args[2]} is not a scene`, 'move <scene> before|after <scene>');
        const rest = story.scenes.filter((s) => s.id !== r.sc.id).map((s) => s.id);
        const k = rest.indexOf(other.sc.id);
        if (k < 0) throw new Refusal('bad-ref', 'a scene cannot move around itself', 'name another scene');
        return [{ op: 'scene.order', scene: r.sc.id, index: args[1] === 'before' ? k : k + 1 }];
      }
      most(2);
      return [{ op: 'beat.at', scene: r.sc.id, beat: r.j, value: parseTime(args[1], when(r.sc, r.beat.at)), ...fmt(r.sc, format) }];
    }
    case 'trim': {
      need(2, '<scene> <time>');
      most(2);
      const r = resolveRef(story, args[0], format);
      if (r.kind !== 'scene') throw new Refusal('bad-ref', `${args[0]} is a beat`, `trim takes a scene: trim ${r.sc.id} <duration>; out ${args[0]} <time> sets a beat's out`);
      return [{ op: 'scene.duration', scene: r.sc.id, value: parseTime(args[1], when(r.sc, r.sc.duration, true)) }];
    }
    case 'out': {
      need(2, '<ref> <time|none>');
      most(2);
      const r = resolveRef(story, args[0], format);
      if (r.kind !== 'beat') throw new Refusal('bad-ref', `${args[0]} is a scene`, `out takes a beat: ${r.sc.id}#<n> or ${r.sc.id}/<slot>`);
      const value = args[1] === 'none' ? null : parseTime(args[1], when(r.sc, r.beat.out ?? r.sc.duration));
      return [{ op: 'beat.out', scene: r.sc.id, beat: r.j, value, ...fmt(r.sc, format) }];
    }
    case 'set': {
      need(2, '<ref> <key>=<value>…');
      const r = resolveRef(story, args[0], format);
      return args.slice(1).map((pair) => {
        if (r.kind === 'scene') {
          const [key, value] = parseSet(pair, true);
          if (!SCENE_SET.includes(key)) throw new Refusal('bad-value', `set on a scene takes ${SCENE_SET.join(', ')}, not "${key}"`, `trim ${r.sc.id} <duration> sets its duration; set ${r.sc.id}#<n> ${key}=… sets a beat's`);
          if (key === 'say') {
            if (value === null) throw new Refusal('bad-value', `${r.sc.id}'s say cannot be removed`, `give it text: set ${r.sc.id} say="…"`);
            return { op: 'scene.say', scene: r.sc.id, value, ...fmt(r.sc, format) };
          }
          // cut= and cut=null both mean no pattern (a pattern ref is never the text null)
          const pattern = value === 'null' ? null : value;
          if (key === 'cut') return { op: 'scene.cut', scene: r.sc.id, pattern };
          return { op: 'scene.move', scene: r.sc.id, pattern, ...fmt(r.sc, format) };
        }
        const key = pair.slice(0, Math.max(0, pair.indexOf('=')));
        const isSet = BEAT_SET.includes(key);
        const [k, value] = parseSet(pair, isSet && key !== 'value');
        return isSet ? { op: 'beat.set', scene: r.sc.id, beat: r.j, key: k, value, ...fmt(r.sc, format) } : { op: 'beat.param', scene: r.sc.id, beat: r.j, key: k, value, ...fmt(r.sc, format) };
      });
    }
    case 'apply': {
      need(1, '<edits.json>');
      most(1);
      const file = resolve(process.cwd(), args[0]);
      if (!existsSync(file)) throw usage(`no file ${args[0]}`);
      let edits;
      try { edits = readJson(file); } catch (e) { throw usage(`${args[0]} is not JSON: ${e.message}`); }
      return Array.isArray(edits) ? edits : [edits];
    }
  }
  return null;
}

// ---- output -----------------------------------------------------------------------------------

/** A unified diff of two texts, line by line (no dependency): `--- a/<name>`, `+++ b/<name>`, hunks of 3 lines' context. */
export function unifiedDiff(a, b, name, context = 3) {
  if (a === b) return '';
  const A = a.split('\n'), B = b.split('\n');
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const a1 = A.slice(p, A.length - s), b1 = B.slice(p, B.length - s), n = a1.length, m = b1.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a1[i] === b1[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = A.slice(0, p).map((line) => [' ', line]);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a1[i] === b1[j]) { ops.push([' ', a1[i]]); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) ops.push(['-', a1[i++]]);   // - before + on ties, as git prints
    else ops.push(['+', b1[j++]]);
  }
  ops.push(...A.slice(A.length - s).map((line) => [' ', line]));
  // line numbers, then hunks around the changes
  let o = 1, nw = 1;
  const rows = ops.map(([t, line]) => { const r = { t, line, o, n: nw }; if (t !== '+') o++; if (t !== '-') nw++; return r; });
  const changed = rows.map((r, k) => (r.t === ' ' ? -1 : k)).filter((k) => k >= 0);
  const hunks = [];
  for (const k of changed) {
    const lo = Math.max(0, k - context), hi = Math.min(rows.length - 1, k + context);
    const last = hunks[hunks.length - 1];
    if (last && lo <= last[1] + 1) last[1] = hi; else hunks.push([lo, hi]);
  }
  const out = [`--- a/${name}`, `+++ b/${name}`];
  for (const [lo, hi] of hunks) {
    const part = rows.slice(lo, hi + 1);
    const oc = part.filter((r) => r.t !== '+').length, nc = part.filter((r) => r.t !== '-').length;
    const os = oc ? part.find((r) => r.t !== '+').o : part[0].o - 1, ns = nc ? part.find((r) => r.t !== '-').n : part[0].n - 1;
    out.push(`@@ -${os},${oc} +${ns},${nc} @@`, ...part.map((r) => `${r.t}${r.line}`));
  }
  return `${out.join('\n')}\n`;
}

const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '-');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const shortText = (t) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > 60 ? `${s.slice(0, 59)}…` : s; };

/** The beat a model path names in the raw story. */
const atPath = (story, path) => path.split('/').slice(1).reduce((o, k) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], story);

/** A beat's ref as the table prints it: <scene>/<slot>, or <scene>/<slot>#<k> after the first. */
function refOf(story, path, format) {
  const m = /^\/scenes\/(\d+)(?:\/variants\/[^/]+)?\/beats\/(\d+)$/.exec(path ?? '');
  if (!m) return path;
  const sc = story.scenes[Number(m[1])], beats = beatsIn(sc, format), j = Number(m[2]);
  const k = beats.slice(0, j).filter((b) => b.slot === beats[j]?.slot).length;
  return `${sc.id}/${beats[j]?.slot}${k ? `#${k}` : ''}`;
}

function table(model, story, format) {
  const lines = [`${story.id}  ${story.kind}  ${format}  ${f2(model.duration)} s`, '', `${pad('scene', 16)}${lpad('start', 7)}${lpad('end', 7)}${lpad('dur', 7)}  cut`];
  for (const s of model.scenes) lines.push(`${pad(s.id, 16)}${lpad(f2(s.start), 7)}${lpad(f2(s.end), 7)}${lpad(f2(s.duration), 7)}  ${s.cut?.pattern ?? '-'}`);
  lines.push('', `${pad('beat', 24)}${lpad('start', 7)}${lpad('end', 7)}  text`);
  const clips = model.lanes.filter((l) => l.kind === 'slot').flatMap((l) => l.clips).filter((c) => !c.parent).sort((a, b) => a.start - b.start || a.itemIndex - b.itemIndex);
  for (const c of clips) {
    const beat = atPath(story, c.path);
    lines.push(`${pad(refOf(story, c.path, format), 24)}${lpad(f2(c.start), 7)}${lpad(f2(c.end), 7)}  ${shortText(beat?.text ?? c.label)}`);
  }
  if (model.scenes.some((s) => s.reason)) lines.push('', `read-only: ${model.scenes[0].reason}`);
  return lines.join('\n');
}

const verdictLine = (v) => `  ${v.id} ${v.format}: ${v.before ?? 'none'} → ${v.after}${v.reason ? `  ${v.reason}` : ''}`;

// ---- main -------------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  const dir = resolvePiece(o.piece);
  const rel = relative(ROOT, dir).split(sep).join('/');
  const say = (x) => console.log(o.json ? JSON.stringify(x, null, 2) : x);
  // verbs that take no more arguments than these
  const most = { check: 0, selection: 0, undo: 1 }[o.verb];
  if (most !== undefined && o.args.length > most) throw usage(`${o.verb}: unexpected argument ${o.args[most]}`);

  try {
    const { story, version } = readStory(dir);
    let style;
    try { style = readJson(join(dir, 'style.json')); } catch (e) { throw new Refusal('unreadable', e.code === 'ENOENT' ? 'style.json is missing' : `style.json is not JSON: ${e.message}`, 'fix style.json by hand first'); }
    const format = o.format ?? story.formats[0];
    if (!story.formats.includes(format)) throw usage(`the story ships ${story.formats.join(', ')}, not ${format}`);
    if (o.verb === 'selection') {
      const file = join(dir, 'out', 'studio', 'selection.json');
      let sel = null;
      try { if (existsSync(file)) sel = readJson(file); } catch (e) { throw new Refusal('unreadable', `out/studio/selection.json is not JSON: ${e.message}`, 'the studio writes it again on the next selection; delete it to clear'); }
      if (o.json) return say(sel), 0;
      if (!sel) return console.log('no selection (the studio has not selected anything in this piece)'), 0;
      const m = /^\/scenes\/(\d+)(?:\/variants\/([^/]+))?(?:\/beats\/(\d+))?$/.exec(sel.path ?? '');
      const sc = m ? story.scenes[Number(m[1])] : null;
      const beats = m?.[2] ? sc?.variants?.[m[2]]?.beats : sc?.beats;
      const what = !sel.path ? 'nothing' : !sc || (m[3] === undefined ? m[2] : !beats?.[Number(m[3])]) ? 'something not in the story now' : m[3] === undefined ? sc.id : `${sc.id}#${m[3]}`;
      console.log(`selection: ${what}${sel.path ? ` (${sel.path})` : ''} at ${f2(sel.t)} s${sel.format ? ` in ${sel.format}${story.formats.includes(sel.format) ? '' : ' (not a format the story ships)'}` : ''}`);
      return 0;
    }
    if (o.verb === 'check') {
      const rows = await verdicts(dir, story, style, o.format ? [format] : story.formats);
      if (o.json) say(rows);
      else for (const r of rows) console.log(`${pad(r.id, 12)}${pad(r.format, 6)}${pad(r.status, 5)} ${why(r.evidence)}`);
      return rows.some((r) => r.status === 'FAIL' && r.id.startsWith('G-')) ? 1 : 0;
    }
    if (!o.verb) {
      const { schedule } = await scheduleOf(dir, story, style, format);
      const model = timelineModel(schedule, story, { format, grid: gridJson(dir, story)?.json });
      console.log(o.json ? JSON.stringify(model, null, 2) : table(model, story, format));
      return 0;
    }

    // a write
    const before = o.plan ? null : await verdicts(dir, story, style, story.formats);
    let r;
    if (o.verb === 'undo') {
      r = await undoReceipt(dir, { receipt: o.args[0] ?? 'last', who: o.who, plan: o.plan });
    } else {
      const { schedule } = await scheduleOf(dir, story, style, format);
      const sceneStart = (id) => schedule.scenes.find((s) => s.id === id)?.start ?? 0;
      const edits = editsFor(o.verb, o.args, { story, format, sceneStart, grid: gridJson(dir, story) });
      const label = `timeline ${o.verb} ${o.verb === 'apply' ? basename(o.args[0]) : o.args.join(' ')}`;
      r = await editStory(dir, { edits, version, who: o.who, label, plan: o.plan });
    }
    if (o.plan) {
      const diff = unifiedDiff(r.before, r.text, `${rel}/story.json`);
      if (o.json) say({ plan: true, version: r.version, diff });
      else process.stdout.write(diff || 'no change\n');
      return 0;
    }
    if (!r.receipt) { if (o.json) say({ version: r.version, receipt: null, changed: [] }); else console.log('nothing changed'); return 0; }
    const after = await verdicts(dir, readStory(dir).story, style, story.formats);
    const changed = changedVerdicts(before, after);
    if (o.json) say({ version: r.version, receipt: r.receipt, changed });
    else console.log([`wrote ${r.receipt.id}: ${r.receipt.label} (story.json ${r.version})`, changed.length ? 'timing:' : 'timing: no verdict changed', ...changed.map(verdictLine)].join('\n'));
    return 0;
  } catch (e) {
    const refuse = (code, reason, hint) => {
      if (o.json) console.log(JSON.stringify({ refused: { code, reason, hint: hint ?? null } }, null, 2));
      else console.error(`mm timeline: refused (${code}): ${reason}${hint ? `\n  hint: ${hint}` : ''}`);
      return 2;
    };
    if (e instanceof Refusal || e instanceof EditRefused) return refuse(e.code, e.reason, e.hint);
    if (e instanceof Unreadable) return refuse('unreadable', e.reason, 'an editor may be mid-save; fix the file by hand, then run the command again');
    if (e instanceof ExportRunning) return refuse('exporting', e.reason, 'nothing was written; run the command again once the export has ended');
    if (e instanceof Unwritable) return refuse('unwritable', e.reason, 'nothing was written; check the permissions and free space of the piece folder');
    if (e instanceof SchemaRefused) return refuse('schema', e.message, e.of === 'edits' ? 'each edit is one of the ops in contracts/edit-ops.schema.json' : 'the result would break contracts/story.schema.json; fix the story by hand first');
    if (e instanceof ChangedSince) return refuse('changed', e.message, 'the file was written outside the journal since; undo is refused so that edit is not lost (edit it again instead)');
    if (e instanceof NoReceipt) return refuse('no-receipt', e.message, 'mm timeline <piece> undo takes a receipt id from out/studio/journal.jsonl, or last');
    if (e instanceof StaleVersion) return refuse('stale', e.message, 'another writer changed the story meanwhile; run the command again');
    throw e;
  }
}

runMain(import.meta, main);
