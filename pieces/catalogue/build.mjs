// node pieces/catalogue/build.mjs [family …]
// Builds the catalogue films: one spec per pattern family in specs/<family>.json becomes one or more
// pieces/catalogue-<family>-<n>/ films of at most 60 s (G-LENGTH). Every pattern gets an explain
// scene (its name, one line on how it works, its path) and a replay with one knob turned.
// Scene lengths come from the gate's own numbers: 0.3 s a word plus the last arrival (W-READ), and
// no more than 4 s from the last arrival to the cut (G-DEAD), so a scene carries at most 13 words.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPiece } from '../../scripts/new.mjs';
import { resolveStyle } from '../../scripts/lib/cli.mjs';
import { cutSeconds } from '../../runtime/kit/schedule.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PER_WORD = 0.3, DEAD = 4, MAX_FILM = 58, PAD = 0.05;
const words = (s) => (s ? String(s).trim().split(/\s+/).filter(Boolean).length : 0);
const r2 = (x) => Math.round(x * 100) / 100;

// The pattern's name sits in the split layout's half-width headline: a long single word
// ("circumscribe") broke mid-word at the layout's size, so names go a step smaller and break only at hyphens.
const PIECE_CSS = `/* Piece-level styles. Colour, family, size, space, radius, duration and easing come only from
   --mm-* variables (SPEC §3, G-LITERAL). Layouts and patterns carry their own CSS. */
[data-format="16x9"] .split__headline { font-size: calc(var(--mm-size-h1) * var(--mm-headline-scale) * 0.78); overflow-wrap: normal; }
`;

/** A piece inside the repository points at the shared faces in styles/fonts rather than carrying copies. */
const shareFonts = (dir) => {
  const f = join(dir, 'style.json');
  writeFileSync(f, readFileSync(f, 'utf8').replaceAll('"src": "assets/fonts/', '"src": "../../styles/fonts/'));
  rmSync(join(dir, 'assets', 'fonts'), { recursive: true, force: true });
};

const still = (slot, text, fx = 'style:body') => ({ at: 0, slot, fx, text, params: { instant: true } });

/** A scene's length from its beats: reading time after the last timed arrival, never a dead stretch over 4 s. */
function fit(scene, min = 0) {
  const n = scene.beats.reduce((a, b) => a + words(b.text), 0);
  const last = Math.max(0, ...scene.beats.filter((b) => !b.params?.instant).map((b) => b.at));
  const settle = Math.max(0, ...scene.beats.map((b) => (b.out ?? 0) + (b.exit ? 0.8 : 0)));
  const need = Math.max(min, n * PER_WORD + last + PAD, settle + 0.6);
  if (need - last > DEAD + 1e-6) throw new Error(`${scene.id}: ${n} words after ${last}s need ${r2(need)}s, over the ${DEAD}s dead window; shorten the copy`);
  return { ...scene, duration: r2(need) };
}

const merge = (a = {}, b = {}) => ({ ...a, ...b, params: { ...(a.params ?? {}), ...(b.params ?? {}) } });

// ---- templates: an item becomes its scenes ----
const T = {
  /** The pattern plays in the split layout's figure slot; name, how and path sit beside it. */
  figure(it, fam) {
    const layout = it.layout ?? fam.layout ?? 'layouts/split';
    // title-stack: the pattern takes the headline slot and the name leads the line beneath it
    const stack = layout === 'layouts/title-stack';
    const fig = (over) => {
      const b = merge({ at: it.figAt ?? fam.figAt ?? 0.45, slot: stack ? 'headline' : 'figure', fx: it.pattern }, merge(it.figure, over));
      if (!Object.keys(b.params).length) delete b.params;
      return b;
    };
    const head = stack ? [] : [still('headline', it.name, 'style:headline')];
    const line = (t) => still(stack ? 'sub' : 'body', stack ? `${it.name}: ${t}` : t);
    const path = layout === 'layouts/split' ? [still('caption', it.pattern)] : [];
    const a = fit({ id: `${it.id}-a`, layout, cut: 'transitions/hard-cut', move: null,
      beats: [...head, fig(), line(it.how), ...path], say: `${it.name}: ${it.how}` }, it.minA ?? 4.1);
    const b = fit({ id: `${it.id}-b`, layout, cut: 'transitions/hard-cut', move: null,
      beats: [...head, fig(it.knob.figure), line(it.knob.line)], say: it.knob.line }, it.minB ?? 3.4);
    return [a, b];
  },
  /** The transition carries the frame from one card to the next, at its defaults, then with a knob turned. */
  async transition(it, fam) {
    // the incoming scene's content arrives after the cut settles (W-STAGGER); the cut carries the card before it
    const card = (id, letter, line, at, extra = {}) => {
      const t = (slot, text, fx, k) => (at ? { at: r2(at + 0.12 * k), slot, fx: k ? 'entrances/fade' : 'entrances/rise', text } : still(slot, text, fx));
      return { id, layout: 'layouts/split', move: null,
        beats: [t('headline', it.name, 'style:headline', 0), t('figure', letter, 'style:figure', 1), t('body', line, 'style:body', 2), ...(at ? [] : [still('caption', it.pattern)])],
        say: line, ...extra };
    };
    const meta = (await import(`../../patterns/${it.pattern}/pattern.js`)).default;
    const after = r2(cutSeconds(it.pattern, fam.styleJson, meta) + 0.12), afterKnob = after;
    const a = fit({ ...card(`${it.id}-a`, 'A', it.how, 0), cut: 'transitions/hard-cut' }, 3.6);
    const b = fit({ ...card(`${it.id}-b`, 'B', it.again ?? 'At its defaults.', after), cut: it.pattern, ...(it.cutParams ? { cutParams: it.cutParams } : {}) }, after + 2.7);
    const c = fit({ ...card(`${it.id}-c`, 'C', it.knob.line, afterKnob), cut: it.pattern, cutParams: { ...(it.cutParams ?? {}), ...it.knob.cutParams } }, afterKnob + 2.7);
    return [a, b, c];
  },
  /** The camera move runs over the whole explain card, at its defaults, then with a knob turned. */
  move(it) {
    const bento = it.layout === 'layouts/bento-3';
    const beats = (line) => bento
      ? [still('headline', `${it.name}: ${line}`, 'style:headline'),
        ...['near', 'middle', 'far'].map((t, k) => ({ at: 0.3 + 0.15 * k, slot: `tile-${k + 1}`, fx: 'entrances/pop', text: t }))]
      : [still('headline', it.name, 'style:headline'), merge({ at: 0.3, slot: 'figure', fx: 'entrances/pop' }, it.figure ?? { text: 'Frame' }), still('body', line), still('caption', it.pattern)];
    const card = (id, line, params) => ({ id, layout: it.layout ?? 'layouts/split', cut: 'transitions/hard-cut', move: it.pattern,
      ...(params && Object.keys(params).length ? { moveParams: params } : {}), beats: beats(line), say: line });
    return [fit(card(`${it.id}-a`, it.how, it.moveParams), it.minA ?? 4.2), fit(card(`${it.id}-b`, it.knob.line, { ...(it.moveParams ?? {}), ...it.knob.moveParams }), it.minB ?? 3.8)];
  },
  /** Hand-written scenes (layouts, devices, screen actions, sound): only ids, cuts and lengths are filled in. */
  scenes(it) {
    return it.scenes.map((sc, k) => {
      const { min, ...rest } = sc;
      const s = { cut: 'transitions/hard-cut', move: null, say: sc.say ?? it.name, ...rest, id: `${it.id}-${'abcdefgh'[k]}` };
      return sc.duration ? s : fit(s, min ?? 3);
    });
  },
};

function intro(fam, part, parts) {
  const sub = parts > 1 ? `${fam.sub} Part ${part} of ${parts}.` : fam.sub;
  const open = fit({ id: 'intro', layout: 'layouts/statement', position: 'opening', move: null,
    beats: [{ at: 0, slot: 'headline', fx: 'style:headline', text: fam.title, params: { instant: true } },
      { at: 0.4, slot: 'sub', fx: 'entrances/fade', text: sub }],
    say: fam.sub }, Math.max(3.6, words(sub) * PER_WORD + 1));
  const how = fit({ id: 'how', layout: 'layouts/statement', cut: 'transitions/hard-cut', move: null,
    beats: [{ at: 0, slot: 'headline', fx: 'style:headline', text: fam.watch ?? 'Watch twice.', params: { instant: true } },
      { at: 0.3, slot: 'sub', fx: 'entrances/fade', text: fam.watchSub ?? 'As shipped, then with one knob turned.' }],
    say: 'Watch twice.' }, 2.4);
  if (fam.grid) for (const sc of [open, how]) sc.duration = Math.ceil(sc.duration / fam.grid - 1e-6) * fam.grid;
  return [open, how];
}

/** A synthetic 120 BPM track (a kick with a click on every beat, accented downbeats, a two-chord pad), then its grid by `mm beats`. */
function music(dir, m, seconds) {
  const wav = join(dir, 'assets', 'audio', 'track.wav');
  mkdirSync(dirname(wav), { recursive: true });
  const b = 60 / m.bpm, bar = 4 * b;
  const kick = `0.55*sin(2*PI*52*t)*exp(-14*mod(t,${b}))*(1+0.7*eq(mod(floor(t/${b}),4),0))`;
  const click = `0.25*sin(2*PI*1800*t)*exp(-160*mod(t,${b}))`;
  const chord = (f) => f.map((x) => `sin(2*PI*${x}*t)`).join('+');
  const pad = `0.05*if(lt(mod(t,${2 * bar}),${bar}),${chord([220, 261.63, 329.63])},${chord([174.61, 220, 261.63])})`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${kick}+${click}+${pad}':s=48000:d=${Math.ceil(seconds + 1)}`, '-c:a', 'pcm_s16le', wav], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const bt = spawnSync('node', [join(ROOT, 'scripts', 'mm.mjs'), 'beats', wav, '--bpm', String(m.bpm), '--out', join(dir, 'assets', 'beats.json')], { encoding: 'utf8' });
  if (bt.status !== 0) throw new Error(bt.stderr || bt.stdout);
}

async function build(name) {
  const fam = JSON.parse(readFileSync(join(HERE, 'specs', `${name}.json`), 'utf8'));
  fam.styleJson = JSON.parse(readFileSync(resolveStyle(fam.style), 'utf8'));
  const items = fam.items.map((it) => ({ ...it, id: it.id ?? it.pattern.split('/').pop(), name: it.name ?? it.pattern.split('/').pop() }));
  const groups = [];
  for (const it of items) groups.push({ it, scenes: await T[it.template ?? fam.template](it, fam) });
  // pack patterns into parts of at most MAX_FILM seconds, then even the parts out
  const len = (g) => g.scenes.reduce((a, s) => a + s.duration, 0);
  const total = groups.reduce((a, g) => a + len(g), 0);
  // even parts of at most MAX_FILM seconds, intro included; add a part until every one fits
  const introLen = (n) => intro(fam, n, n).reduce((a, sc) => a + sc.duration, 0);
  let nParts = Math.max(1, Math.ceil(total / (MAX_FILM - introLen(1)))), parts;
  for (;; nParts++) {
    parts = Array.from({ length: nParts }, () => []);
    let k = 0, acc = 0;
    const target = total / nParts;
    for (const g of groups) {
      if (acc + len(g) / 2 > target * (k + 1) && k < nParts - 1) k++;
      parts[k].push(g); acc += len(g);
    }
    if (parts.every((gs) => gs.reduce((a, g) => a + len(g), 0) + introLen(nParts) <= MAX_FILM + 1.5)) break;
  }
  const made = [];
  parts.forEach((gs, i) => {
    const id = `catalogue-${name}-${i + 1}`;
    const dir = join(ROOT, 'pieces', id);
    if (!existsSync(join(dir, 'style.json'))) { newPiece({ kind: 'film', style: fam.style, dir }); shareFonts(dir); }
    const scenes = [...intro(fam, i + 1, nParts), ...gs.flatMap((g) => g.scenes)];
    for (const g of gs) for (const from of g.it.assets ?? []) cpSync(join(ROOT, from.from), join(dir, from.to), { recursive: true });
    const story = { id, kind: 'film', generator: 'pieces/catalogue/build.mjs', formats: ['16x9'], title: `${fam.title}${nParts > 1 ? `, part ${i + 1} of ${nParts}` : ''}`,
      language: 'en', facts: fam.facts ?? [], audio: fam.audio ?? { track: null, bpm: null, beats: null }, scenes,
      share: `${fam.title}${nParts > 1 ? ` (${i + 1}/${nParts})` : ''}: ${gs.map((g) => g.it.name).join(', ')}. Each one shown, explained, then replayed with a knob turned.`.slice(0, 280),
      cta: { text: 'Motion Machine', url: 'github.com/tudorjuravlea/motion-machine' } };
    if (fam.music) music(dir, fam.music, scenes.reduce((a, sc) => a + sc.duration, 0));
    writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2) + '\n');
    writeFileSync(join(dir, 'piece.css'), PIECE_CSS);
    const secs = r2(scenes.reduce((a, s) => a + s.duration, 0));
    made.push(`${relative(ROOT, dir)}  ${secs}s  ${gs.map((g) => g.it.name).join(' ')}`);
  });
  // drop parts left over from an earlier, longer build
  for (const d of readdirSync(join(ROOT, 'pieces'))) {
    const m = d.match(new RegExp(`^catalogue-${name}-(\\d+)$`));
    if (m && Number(m[1]) > nParts) rmSync(join(ROOT, 'pieces', d), { recursive: true });
  }
  return made;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(HERE, 'specs')).map((f) => f.replace(/\.json$/, ''));
for (const n of names) console.log((await build(n)).join('\n'));
